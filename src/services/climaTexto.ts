/**
 * Clima do dia — o MIOLO PURO do lado do app (item 2.5 da Onda 2).
 *
 * Este arquivo NÃO importa nada em tempo de execução (mesma regra de
 * `saidaCalculo.ts`): assim `node` executa direto e `scripts/teste-clima-app.ts`
 * prova o comportamento REAL. O que tem rede/React fica em `clima.ts`.
 *
 * Contrato do worker (`GET /clima?lat=&lon=` — ver `worker/src/clima.js`):
 *   200 { ok:true, local, fuso, atual:{temperatura,codigo,ehDia},
 *         hoje:{data,max,min}, chuvaPorHora:[{inicio,hora,probabilidade,codigo}],
 *         atualizadoEm, cache }
 *   4xx/5xx { ok:false, motivo }
 *
 * ─── A REGRA DURA ──────────────────────────────────────────────────────────
 * `probabilidade: null` é "não sei", e "não sei" NUNCA vira "sem chuva". Se
 * qualquer hora da janela está sem dado, o texto não afirma céu limpo — fala só
 * da temperatura. Prestador que sai sem capa porque o app chutou "sem chuva"
 * perde a tarde (e o equipamento molhado é dele).
 */

/** Por que não há clima para mostrar. Todos aparecem na tela como "clima indisponível". */
export type MotivoFalhaClima =
  | 'sem_localizacao'
  | 'nao_configurado'
  | 'coordenadas_invalidas'
  | 'muitas_requisicoes'
  | 'clima_indisponivel'
  | 'offline';

export interface FalhaClima {
  ok: false;
  motivo: MotivoFalhaClima;
}

export interface HoraChuva {
  /** 'AAAA-MM-DDTHH:MM' no horário LOCAL do lugar. */
  inicio: string;
  /** 'HH:MM' */
  hora: string;
  /** 0–100, ou `null` quando o upstream não informou (≠ 0%). */
  probabilidade: number | null;
  /** Código WMO da hora, ou `null`. */
  codigo: number | null;
}

export interface DadosClima {
  ok: true;
  temperatura: number;
  /** Código WMO do tempo agora. */
  codigo: number;
  /** "Parcialmente nublado", "Chuva fraca"… derivado de `codigo`. */
  descricao: string;
  ehDia: boolean;
  max: number | null;
  min: number | null;
  /** Próximas 12h a partir da hora cheia corrente. */
  chuvaPorHora: HoraChuva[];
  /** ISO de quando o worker obteve a previsão (pode ter até 30 min). */
  atualizadoEm: string | null;
  /** Frase curta pronta para a UI: "Chuva às 15h — leve capa". */
  resumo: string;
}

/** Os 3 estados que a UI enxerga. */
export type EstadoClima = 'carregando' | FalhaClima | DadosClima;

/** Probabilidade a partir da qual o app diz "Chuva às Xh". */
export const LIMIAR_CHUVA = 50;
/** Probabilidade a partir da qual o app diz "Pode chover às Xh". */
export const LIMIAR_TALVEZ = 30;

const MOTIVOS: readonly MotivoFalhaClima[] = [
  'sem_localizacao',
  'nao_configurado',
  'coordenadas_invalidas',
  'muitas_requisicoes',
  'clima_indisponivel',
  'offline',
];

/** Motivo desconhecido vindo do worker vira `clima_indisponivel` — nunca some. */
export function motivoDeFalha(bruto: unknown): MotivoFalhaClima {
  return (MOTIVOS as readonly string[]).includes(String(bruto))
    ? (bruto as MotivoFalhaClima)
    : 'clima_indisponivel';
}

/** Códigos WMO de precipitação líquida/tempestade (garoa, chuva, pancadas, trovoada). */
export function codigoEhChuva(codigo: number | null | undefined): boolean {
  if (typeof codigo !== 'number') return false;
  return (codigo >= 51 && codigo <= 67) || (codigo >= 80 && codigo <= 82) || codigo >= 95;
}

/** Código WMO → texto pt-BR curto. Desconhecido não vira "céu limpo": vira "Tempo variável". */
export function descricaoTempo(codigo: number): string {
  if (codigo === 0) return 'Céu limpo';
  if (codigo === 1) return 'Poucas nuvens';
  if (codigo === 2) return 'Parcialmente nublado';
  if (codigo === 3) return 'Nublado';
  if (codigo === 45 || codigo === 48) return 'Neblina';
  if (codigo >= 51 && codigo <= 57) return 'Garoa';
  if (codigo === 61 || codigo === 66) return 'Chuva fraca';
  if (codigo === 63) return 'Chuva';
  if (codigo === 65 || codigo === 67) return 'Chuva forte';
  if (codigo >= 71 && codigo <= 77) return 'Neve';
  if (codigo === 80) return 'Pancadas de chuva';
  if (codigo === 81 || codigo === 82) return 'Pancadas fortes';
  if (codigo === 85 || codigo === 86) return 'Pancadas de neve';
  if (codigo >= 95) return 'Trovoada';
  return 'Tempo variável';
}

/** 'HH:MM' → '15h' / '15h30'. */
export function horaCurta(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = String(Number(m[1]));
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}

function grau(n: number): string {
  return `${Math.round(n)}°`;
}

/** "27° agora · máx 31°" — o pedaço que não depende de chuva. */
function textoTemperatura(temperatura: number, max: number | null): string {
  return max === null ? `${grau(temperatura)} agora` : `${grau(temperatura)} agora · máx ${grau(max)}`;
}

/**
 * Frase curta para a UI. Ordem de prioridade:
 *  1. chovendo agora (código atual ou da hora corrente) → "Chovendo agora — leve capa"
 *  2. 1ª hora com ≥50% → "Chuva às 15h — leve capa"
 *  3. 1ª hora com ≥30% → "Pode chover às 15h (35%)"
 *  4. janela inteira conhecida e abaixo de 30% → "Sem chuva nas próximas 12h · 27°"
 *  5. qualquer hora sem dado → só a temperatura (não afirma "sem chuva")
 */
export function resumoClima(d: {
  temperatura: number;
  codigo: number;
  max: number | null;
  chuvaPorHora: HoraChuva[];
}): string {
  const horas = d.chuvaPorHora;
  if (codigoEhChuva(d.codigo) || codigoEhChuva(horas[0]?.codigo)) {
    return 'Chovendo agora — leve capa';
  }
  const chuva = horas.find((h) => h.probabilidade !== null && h.probabilidade >= LIMIAR_CHUVA);
  if (chuva) return `Chuva às ${horaCurta(chuva.hora)} — leve capa`;
  const talvez = horas.find((h) => h.probabilidade !== null && h.probabilidade >= LIMIAR_TALVEZ);
  if (talvez) return `Pode chover às ${horaCurta(talvez.hora)} (${talvez.probabilidade}%)`;
  const tudoConhecido = horas.length > 0 && horas.every((h) => h.probabilidade !== null);
  if (tudoConhecido) return `Sem chuva nas próximas ${horas.length}h · ${grau(d.temperatura)}`;
  return textoTemperatura(d.temperatura, d.max);
}

function numOuNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Valida a resposta do worker. `null` = corpo que não entendemos — e isso é
 * `clima_indisponivel`, não "tempo bom". Worker mais novo/velho não pode virar
 * previsão fantasma.
 */
export function normalizarRespostaClima(data: unknown): DadosClima | null {
  const d = data as any;
  if (!d || d.ok !== true || !d.atual) return null;
  const temperatura = numOuNull(d.atual.temperatura);
  const codigo = numOuNull(d.atual.codigo);
  if (temperatura === null || codigo === null) return null;
  if (!Array.isArray(d.chuvaPorHora)) return null;

  const chuvaPorHora: HoraChuva[] = [];
  for (const h of d.chuvaPorHora) {
    const inicio = String(h?.inicio ?? '');
    const hora = String(h?.hora ?? '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(hora)) return null;
    const p = numOuNull(h?.probabilidade);
    chuvaPorHora.push({
      inicio,
      hora,
      probabilidade: p === null ? null : Math.max(0, Math.min(100, Math.round(p))),
      codigo: numOuNull(h?.codigo),
    });
  }

  const max = numOuNull(d.hoje?.max);
  const min = numOuNull(d.hoje?.min);
  const base = { temperatura, codigo, max, chuvaPorHora };
  return {
    ok: true,
    temperatura,
    codigo,
    descricao: descricaoTempo(codigo),
    ehDia: d.atual.ehDia === true,
    max,
    min,
    chuvaPorHora,
    atualizadoEm: typeof d.atualizadoEm === 'string' ? d.atualizadoEm : null,
    resumo: resumoClima(base),
  };
}

/**
 * Texto pronto para qualquer estado — a UI NUNCA some calada:
 *   carregando → "Carregando clima…"
 *   falha      → "Clima indisponível"
 *   dados      → o resumo ("Chuva às 15h — leve capa")
 */
export function textoClima(estado: EstadoClima): string {
  if (estado === 'carregando') return 'Carregando clima…';
  if (estado.ok === false) return 'Clima indisponível';
  return estado.resumo;
}

/** Coordenada aceitável para pedir clima (mesma régua do worker, inclusive recusar 0,0). */
export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}
