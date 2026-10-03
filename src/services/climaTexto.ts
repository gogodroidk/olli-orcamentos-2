/**
 * Clima do dia — o MIOLO PURO do lado do app (item 2.5 da Onda 2).
 *
 * Este arquivo NÃO importa nada em tempo de execução (mesma regra de
 * `saidaCalculo.ts`): assim `node` executa direto e `scripts/teste-clima-app.ts`
 * prova o comportamento REAL. O que tem rede/React fica em `clima.ts`.
 *
 * Fonte: MET Norway (Locationforecast 2.0), CC BY 4.0 — a licença EXIGE
 * atribuição. Toda tela que mostrar clima mostra também `atribuicaoClima(estado)`
 * ("Previsão: MET Norway").
 *
 * Contrato do worker (`GET /clima?lat=&lon=` — ver `worker/src/clima.js`):
 *   200 { ok:true, fonte:'MET Norway', licenca, local, fuso,
 *         atual:{temperatura,simbolo,ehDia,medidoEm}, hoje:{data,max,min},
 *         chuvaPorHora:[{inicio,hora,mm,simbolo}], atualizadoEm, cache }
 *   4xx/5xx { ok:false, motivo }
 *
 * O MET não dá PROBABILIDADE de chuva no produto usado: dá os MILÍMETROS
 * previstos para cada hora e um símbolo do tempo ('rain', 'cloudy',
 * 'partlycloudy_day'…). O texto fala em "chuva prevista", nunca em "%".
 *
 * ─── A REGRA DURA ──────────────────────────────────────────────────────────
 * `mm: null` é "não sei", e "não sei" NUNCA vira "sem chuva". Se qualquer hora
 * da janela está sem dado, o texto não afirma céu limpo — fala só da
 * temperatura. Prestador que sai sem capa porque o app chutou "sem chuva"
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
  /** 'AAAA-MM-DDTHH:MM' no horário LOCAL (America/Sao_Paulo). */
  inicio: string;
  /** 'HH:MM' */
  hora: string;
  /** Milímetros previstos para a hora, ou `null` quando o MET não informou (≠ 0 mm). */
  mm: number | null;
  /** Símbolo do MET da hora ('rain', 'cloudy'…), ou `null`. */
  simbolo: string | null;
}

export interface DadosClima {
  ok: true;
  temperatura: number;
  /** Símbolo do MET para agora ('partlycloudy_day', 'rain'…). */
  simbolo: string;
  /** "Parcialmente nublado", "Chuva fraca"… derivado de `simbolo`. */
  descricao: string;
  /** `null` quando o símbolo não diz se é dia ou noite ('rain', 'fog'). */
  ehDia: boolean | null;
  max: number | null;
  min: number | null;
  /** Próximas 12h a partir da hora cheia corrente. */
  chuvaPorHora: HoraChuva[];
  /** ISO de quando o worker obteve a previsão (pode ter até 30 min). */
  atualizadoEm: string | null;
  /** Frase curta pronta para a UI: "Chuva prevista às 15h — leve capa". */
  resumo: string;
  /** Crédito exigido pela CC BY 4.0: "Previsão: MET Norway". */
  atribuicao: string;
  /**
   * Resumo por dia, de hoje em diante (Onda I4 · Radar do Tempo). AUSENTE quando
   * o worker ainda não manda o campo — e ausência é "não sei", nunca "tempo bom".
   */
  dias?: DiaClima[];
}

/** Um dia da previsão (relógio local). `null` = o MET não cobriu o bastante. */
export interface DiaClima {
  /** 'AAAA-MM-DD' local. */
  data: string;
  max: number | null;
  min: number | null;
  /** Chuva somada do dia em mm, ou `null` (≠ 0 mm). */
  chuvaMm: number | null;
}

/** Os 3 estados que a UI enxerga. */
export type EstadoClima = 'carregando' | FalhaClima | DadosClima;

/** Nome da fonte (CC BY 4.0). */
export const FONTE_CLIMA = 'MET Norway';
/** Texto de crédito que acompanha o clima na tela. */
export const ATRIBUICAO_CLIMA = `Previsão: ${FONTE_CLIMA}`;
/** Links da atribuição (para um crédito tocável, se a tela quiser). */
export const FONTE_CLIMA_URL = 'https://www.met.no/en';
export const LICENCA_CLIMA_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** mm/h a partir do qual o app diz "Chuva prevista às Xh — leve capa". */
export const LIMIAR_MM_CHUVA = 0.5;
/** mm/h a partir do qual o app diz "Pode chover às Xh (0,2 mm)". */
export const LIMIAR_MM_TALVEZ = 0.1;

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

/** Símbolo do MET de chuva/pancada/trovoada/chuva com neve. `null` não é chuva (nem "seco"). */
export function simboloEhChuva(simbolo: string | null | undefined): boolean {
  if (typeof simbolo !== 'string') return false;
  return /rain|shower|thunder|sleet/.test(simbolo);
}

/** Símbolo do MET → texto pt-BR curto. Desconhecido não vira "céu limpo": vira "Tempo variável". */
export function descricaoTempo(simbolo: string): string {
  const base = String(simbolo).replace(/_(day|night|polartwilight)$/, '');
  const leve = base.startsWith('light');
  const forte = base.startsWith('heavy');
  if (base.includes('thunder')) return 'Trovoada';
  if (base.includes('sleet')) return 'Chuva com neve';
  if (base.includes('snow')) return 'Neve';
  if (base.includes('rainshowers')) return leve ? 'Pancadas de chuva fraca' : forte ? 'Pancadas fortes' : 'Pancadas de chuva';
  if (base.includes('rain')) return leve ? 'Chuva fraca' : forte ? 'Chuva forte' : 'Chuva';
  if (base === 'clearsky') return 'Céu limpo';
  if (base === 'fair') return 'Poucas nuvens';
  if (base === 'partlycloudy') return 'Parcialmente nublado';
  if (base === 'cloudy') return 'Nublado';
  if (base === 'fog') return 'Neblina';
  return 'Tempo variável';
}

/** 'HH:MM' → '15h' / '15h30'. */
export function horaCurta(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m) return hhmm;
  const h = String(Number(m[1]));
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}

/** Até que hora (exclusiva) uma hora do dia seguinte ainda é "da madrugada". */
const FIM_MADRUGADA = 6;

/**
 * QUANDO é uma hora da série, dito para quem lê agora. A série do worker começa
 * na hora cheia corrente e cobre 12h: à noite ela atravessa a meia-noite, e
 * "Chuva prevista às 3h" lido às 21h parece hoje à tarde (já passou) — o
 * prestador entende errado. Por isso:
 *   - mesmo dia da 1ª hora da série  → "às 15h";
 *   - dia seguinte, antes das 6h      → "amanhã, 3h da madrugada";
 *   - dia seguinte, das 6h em diante  → "amanhã, 7h".
 * Sem referência legível (ou data estranha), cai no "às 15h" de sempre — nunca
 * inventa um "amanhã".
 */
export function quandoHoraChuva(h: Pick<HoraChuva, 'inicio' | 'hora'>, referenciaInicio?: string | null): string {
  const hc = horaCurta(h.hora);
  const dia = String(h.inicio ?? '').slice(0, 10);
  const diaRef = String(referenciaInicio ?? '').slice(0, 10);
  const dataOk = /^\d{4}-\d{2}-\d{2}$/;
  if (!dataOk.test(dia) || !dataOk.test(diaRef) || dia <= diaRef) return `às ${hc}`;
  const hora = Number(h.hora.slice(0, 2));
  return Number.isFinite(hora) && hora < FIM_MADRUGADA ? `amanhã, ${hc} da madrugada` : `amanhã, ${hc}`;
}

/** 0.2 → '0,2 mm'. */
export function mmCurto(mm: number): string {
  return `${mm.toFixed(1).replace('.', ',')} mm`;
}

function grau(n: number): string {
  return `${Math.round(n)}°`;
}

/** "27° agora · máx 31°" — o pedaço que não depende de chuva. */
function textoTemperatura(temperatura: number, max: number | null): string {
  return max === null ? `${grau(temperatura)} agora` : `${grau(temperatura)} agora · máx ${grau(max)}`;
}

/** Hora com chuva prevista: símbolo de chuva OU ≥ 0,5 mm. */
function horaComChuva(h: HoraChuva): boolean {
  return simboloEhChuva(h.simbolo) || (h.mm !== null && h.mm >= LIMIAR_MM_CHUVA);
}

/**
 * Frase curta para a UI. Ordem de prioridade:
 *  1. símbolo de agora (ou da hora corrente) é chuva → "Chuva prevista agora — leve capa"
 *  2. 1ª hora com símbolo de chuva ou ≥0,5 mm → "Chuva prevista às 15h — leve capa"
 *  3. 1ª hora com ≥0,1 mm → "Pode chover às 15h (0,2 mm)"
 *  4. janela inteira com mm CONHECIDO, abaixo disso e sem símbolo de chuva
 *     → "Sem chuva prevista nas próximas 12h · 27°"
 *  5. qualquer hora sem dado → só a temperatura (não afirma "sem chuva")
 * Hora que já é do dia seguinte sai como "amanhã, 3h da madrugada" / "amanhã,
 * 7h" (`quandoHoraChuva`), nunca um "às 3h" que parece hoje.
 */
export function resumoClima(d: {
  temperatura: number;
  simbolo: string;
  max: number | null;
  chuvaPorHora: HoraChuva[];
}): string {
  const horas = d.chuvaPorHora;
  if (simboloEhChuva(d.simbolo) || simboloEhChuva(horas[0]?.simbolo)) {
    return 'Chuva prevista agora — leve capa';
  }
  // A 1ª hora da série é "hoje": horas de outro dia saem como "amanhã, …".
  const referencia = horas[0]?.inicio ?? null;
  const chuva = horas.find(horaComChuva);
  if (chuva) return `Chuva prevista ${quandoHoraChuva(chuva, referencia)} — leve capa`;
  const talvez = horas.find((h) => h.mm !== null && h.mm >= LIMIAR_MM_TALVEZ);
  if (talvez && talvez.mm !== null) return `Pode chover ${quandoHoraChuva(talvez, referencia)} (${mmCurto(talvez.mm)})`;
  const tudoConhecido = horas.length > 0 && horas.every((h) => h.mm !== null);
  if (tudoConhecido) return `Sem chuva prevista nas próximas ${horas.length}h · ${grau(d.temperatura)}`;
  return textoTemperatura(d.temperatura, d.max);
}

function numOuNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function textoOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Valida a resposta do worker. `null` = corpo que não entendemos — e isso é
 * `clima_indisponivel`, não "tempo bom". Worker mais novo/velho não pode virar
 * previsão fantasma (um worker antigo com `probabilidade`/`codigo` não passa).
 */
export function normalizarRespostaClima(data: unknown): DadosClima | null {
  const d = data as any;
  if (!d || d.ok !== true || !d.atual) return null;
  const temperatura = numOuNull(d.atual.temperatura);
  const simbolo = textoOuNull(d.atual.simbolo);
  if (temperatura === null || simbolo === null) return null;
  if (!Array.isArray(d.chuvaPorHora)) return null;

  const chuvaPorHora: HoraChuva[] = [];
  for (const h of d.chuvaPorHora) {
    const inicio = String(h?.inicio ?? '');
    const hora = String(h?.hora ?? '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(hora)) return null;
    const mm = numOuNull(h?.mm);
    chuvaPorHora.push({
      inicio,
      hora,
      // Negativo é lixo: vira "não sei", não "seco".
      mm: mm === null || mm < 0 ? null : mm,
      simbolo: textoOuNull(h?.simbolo),
    });
  }

  const max = numOuNull(d.hoje?.max);
  const min = numOuNull(d.hoje?.min);
  const ehDia = d.atual.ehDia === true ? true : d.atual.ehDia === false ? false : null;
  return {
    ok: true,
    temperatura,
    simbolo,
    descricao: descricaoTempo(simbolo),
    ehDia,
    max,
    min,
    chuvaPorHora,
    atualizadoEm: typeof d.atualizadoEm === 'string' ? d.atualizadoEm : null,
    resumo: resumoClima({ temperatura, simbolo, max, chuvaPorHora }),
    atribuicao: ATRIBUICAO_CLIMA,
    ...(Array.isArray(d.dias) ? { dias: lerDiasClima(d.dias) } : {}),
  };
}

/**
 * Lê o resumo por dia do worker. Dia com data malformada é descartado; número
 * inválido (ou chuva negativa) vira `null` — "não sei", nunca 0.
 */
export function lerDiasClima(lista: unknown[]): DiaClima[] {
  const dias: DiaClima[] = [];
  for (const x of lista) {
    const o = x as any;
    const data = typeof o?.data === 'string' ? o.data : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const chuva = numOuNull(o?.chuvaMm);
    dias.push({
      data,
      max: numOuNull(o?.max),
      min: numOuNull(o?.min),
      chuvaMm: chuva === null || chuva < 0 ? null : chuva,
    });
  }
  return dias;
}

/**
 * Texto pronto para qualquer estado — a UI NUNCA some calada:
 *   carregando → "Carregando clima…"
 *   falha      → "Clima indisponível"
 *   dados      → o resumo ("Chuva prevista às 15h — leve capa")
 */
export function textoClima(estado: EstadoClima): string {
  if (estado === 'carregando') return 'Carregando clima…';
  if (estado.ok === false) return 'Clima indisponível';
  return estado.resumo;
}

/**
 * Crédito da previsão (CC BY 4.0). Com estado: devolve "Previsão: MET Norway"
 * quando há previsão na tela e `null` quando não há (carregando/falha não
 * mostram dado do MET, então não há o que creditar). Sem argumento: sempre o
 * texto — para rodapé/tela "Sobre".
 */
export function atribuicaoClima(estado?: EstadoClima): string | null {
  if (estado === undefined) return ATRIBUICAO_CLIMA;
  if (estado === 'carregando' || estado.ok === false) return null;
  return estado.atribuicao;
}

/** Coordenada aceitável para pedir clima (mesma régua do worker, inclusive recusar 0,0). */
export function coordenadaValida(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}
