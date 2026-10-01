/**
 * Alertas oficiais de tempo — o MIOLO PURO do lado do app (Onda I1).
 *
 * Este arquivo NÃO importa nada em tempo de execução (mesma regra de
 * `climaTexto.ts`): `node` executa direto e `scripts/teste-alertas-clima-app.ts`
 * prova o comportamento REAL. Rede/React ficam em `alertasClima.ts`.
 *
 * Fontes: INMET (avisos meteorológicos) e Defesa Civil (IDAP/MIDR), dados
 * públicos e grátis — a reprodução pede citação da fonte, por isso toda tela
 * que mostrar alerta mostra também `ATRIBUICAO_ALERTAS`.
 *
 * Contrato do worker (`GET /alertas?ibge=&lat=&lon=` — ver `worker/src/alertas.js`):
 *   200 { ok:true, estado:'ok'|'parcial', ibge, fontes:{inmet,defesaCivil},
 *         avisos:[…], naoConferidos:{defesaCivil?:n}, pontoConferido,
 *         atribuicao, consultadoEm }
 *   4xx/5xx { ok:false, motivo, fontes? }
 *
 * ─── A REGRA DURA (olli-gate-erro-vira-vazio) ─────────────────────────────
 * "Sem alertas" só é dito quando AS DUAS fontes responderam e não sobrou
 * alerta da Defesa Civil sem conferir (`semAlertasConfirmado`). Fonte fora →
 * "Alertas indisponíveis agora", nunca "sem alertas". Alerta desenhado só por
 * área que não deu para conferir (consulta sem a coordenada do cliente) →
 * "Pode haver alerta da Defesa Civil na região".
 */

export type NivelAlerta = 'vermelho' | 'laranja' | 'amarelo' | 'desconhecido';
export type FonteAlerta = 'inmet' | 'defesa_civil';

export interface AvisoOficial {
  id: string;
  fonte: FonteAlerta;
  /** "Tempestade", "CHUVAS INTENSAS"… */
  evento: string;
  titulo: string | null;
  descricao: string | null;
  instrucao: string | null;
  nivel: NivelAlerta;
  /** Texto original da fonte ("Perigo", "Severe"). */
  severidade: string | null;
  /** ISO com fuso de quem emitiu (ex.: '2026-10-01T09:00:00-03:00'). */
  inicio: string;
  /** ISO, ou `null` quando a fonte não declarou fim. */
  fim: string | null;
  area: string | null;
  emissor: string;
  link: string | null;
  /** Como o OLLI ligou o alerta ao cliente: lista de municípios ou ponto no polígono. */
  conferidoPor: 'municipio' | 'poligono';
  /** Já começou (no relógio do worker). */
  emVigor: boolean;
}

export interface DadosAlertas {
  ok: true;
  ibge: string;
  /** `true` só quando INMET E Defesa Civil responderam. */
  completo: boolean;
  avisos: AvisoOficial[];
  /** Nomes das fontes fora do ar agora ('INMET', 'Defesa Civil'). */
  fontesIndisponiveis: string[];
  /** Alertas só-por-área na mesma UF que não deu para conferir (sem lat/lon). */
  naoConferidos: number;
  pontoConferido: boolean;
  consultadoEm: string | null;
  /** Frase principal pronta para a UI. */
  resumo: string;
  /** Nota secundária (fonte fora, alerta não conferido) ou `null`. */
  nota: string | null;
  atribuicao: string;
}

/** Todos aparecem na tela como texto honesto — nenhum vira "sem alertas". */
export type MotivoFalhaAlertas =
  | 'sem_municipio'
  | 'ibge_invalido'
  | 'coordenadas_invalidas'
  | 'nao_configurado'
  | 'alertas_desligados'
  | 'alertas_indisponiveis'
  | 'muitas_requisicoes'
  | 'offline';

export interface FalhaAlertas {
  ok: false;
  motivo: MotivoFalhaAlertas;
}

/** Os 3 estados que a UI enxerga. */
export type EstadoAlertas = 'carregando' | FalhaAlertas | DadosAlertas;

export const ATRIBUICAO_ALERTAS = 'Alertas: INMET e Defesa Civil';

const MOTIVOS: readonly MotivoFalhaAlertas[] = [
  'sem_municipio',
  'ibge_invalido',
  'coordenadas_invalidas',
  'nao_configurado',
  'alertas_desligados',
  'alertas_indisponiveis',
  'muitas_requisicoes',
  'offline',
];

/** Motivo desconhecido vindo do worker vira `alertas_indisponiveis` — nunca some. */
export function motivoDeFalhaAlertas(bruto: unknown): MotivoFalhaAlertas {
  return (MOTIVOS as readonly string[]).includes(String(bruto))
    ? (bruto as MotivoFalhaAlertas)
    : 'alertas_indisponiveis';
}

const CODIGOS_UF = new Set([
  '11', '12', '13', '14', '15', '16', '17',
  '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53',
]);

/** Código IBGE de município (7 dígitos, UF válida) normalizado, ou `null`. */
export function ibgeValido(bruto: unknown): string | null {
  const s = String(bruto ?? '').trim();
  return /^\d{7}$/.test(s) && CODIGOS_UF.has(s.slice(0, 2)) ? s : null;
}

const ORDEM: Record<NivelAlerta, number> = { vermelho: 3, laranja: 2, amarelo: 1, desconhecido: 0 };
const NIVEIS: readonly NivelAlerta[] = ['vermelho', 'laranja', 'amarelo', 'desconhecido'];

/** "Alerta laranja" — e o desconhecido diz que é desconhecido. */
export function rotuloNivel(nivel: NivelAlerta): string {
  return nivel === 'desconhecido' ? 'Alerta (gravidade não informada)' : `Alerta ${nivel}`;
}

/** Emissor curto para a frase: "INMET" ou "Defesa Civil". */
export function emissorCurto(a: Pick<AvisoOficial, 'fonte'>): string {
  return a.fonte === 'inmet' ? 'INMET' : 'Defesa Civil';
}

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Horário de parede de quem EMITIU o alerta ("23h59"), sem Intl: o worker
 * devolve ISO com o fuso da fonte (-03:00 no INMET; o do órgão no CAP), e é
 * esse horário que o alerta oficial anuncia.
 */
export function horaDoAlerta(iso: string): string | null {
  const m = RE_ISO.exec(iso);
  if (!m) return null;
  const h = String(Number(m[4]));
  return m[5] === '00' ? `${h}h` : `${h}h${m[5]}`;
}

/** Data de parede 'AAAA-MM-DD' do ISO. */
function dataDoAlerta(iso: string): string | null {
  const m = RE_ISO.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** 'AAAA-MM-DD' de Brasília (UTC-3) para um instante. */
function dataBrasilia(ms: number): string {
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "hoje 23h59", "amanhã 12h", "03/10 12h". */
export function quandoDoAlerta(iso: string, agoraMs: number): string | null {
  const hora = horaDoAlerta(iso);
  const data = dataDoAlerta(iso);
  if (!hora || !data) return null;
  const hoje = dataBrasilia(agoraMs);
  const amanha = dataBrasilia(agoraMs + 24 * 60 * 60 * 1000);
  if (data === hoje) return `hoje ${hora}`;
  if (data === amanha) return `amanhã ${hora}`;
  return `${data.slice(8, 10)}/${data.slice(5, 7)} ${hora}`;
}

/** Frase de UM aviso: "Alerta INMET: Tempestade até hoje 23h59". */
export function fraseDoAviso(a: AvisoOficial, agoraMs: number): string {
  const evento = a.evento.charAt(0).toUpperCase() + a.evento.slice(1).toLowerCase();
  const base = `Alerta ${emissorCurto(a)}: ${evento}`;
  if (!a.emVigor) {
    const quando = quandoDoAlerta(a.inicio, agoraMs);
    return quando ? `${base} a partir de ${quando}` : base;
  }
  const ate = a.fim ? quandoDoAlerta(a.fim, agoraMs) : null;
  return ate ? `${base} até ${ate}` : base;
}

function textoOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function isoValido(v: unknown): v is string {
  return typeof v === 'string' && RE_ISO.test(v) && Number.isFinite(Date.parse(v));
}

function lerAviso(a: any): AvisoOficial | null {
  if (!a || typeof a !== 'object') return null;
  const id = textoOuNull(a.id);
  const evento = textoOuNull(a.evento);
  if (!id || !evento || !isoValido(a.inicio)) return null;
  if (a.fim !== null && !isoValido(a.fim)) return null;
  if (a.fonte !== 'inmet' && a.fonte !== 'defesa_civil') return null;
  if (a.conferidoPor !== 'municipio' && a.conferidoPor !== 'poligono') return null;
  const nivel: NivelAlerta = (NIVEIS as readonly string[]).includes(a.nivel) ? a.nivel : 'desconhecido';
  return {
    id,
    fonte: a.fonte,
    evento,
    titulo: textoOuNull(a.titulo),
    descricao: textoOuNull(a.descricao),
    instrucao: textoOuNull(a.instrucao),
    nivel,
    severidade: textoOuNull(a.severidade),
    inicio: a.inicio,
    fim: a.fim,
    area: textoOuNull(a.area),
    emissor: textoOuNull(a.emissor) ?? (a.fonte === 'inmet' ? 'INMET' : 'Defesa Civil'),
    link: textoOuNull(a.link),
    conferidoPor: a.conferidoPor,
    emVigor: a.emVigor === true,
  };
}

/** Frase principal e nota secundária — as regras da casa num lugar só. */
export function resumoAlertas(
  d: Pick<DadosAlertas, 'avisos' | 'completo' | 'fontesIndisponiveis' | 'naoConferidos'>,
  agoraMs: number,
): { resumo: string; nota: string | null } {
  const notas: string[] = [];
  if (d.fontesIndisponiveis.length) {
    notas.push(`Alertas ${d.fontesIndisponiveis.length > 1 ? 'do INMET e da Defesa Civil' : d.fontesIndisponiveis[0] === 'INMET' ? 'do INMET' : 'da Defesa Civil'} indisponíveis agora`);
  }
  if (d.naoConferidos > 0) notas.push('Pode haver alerta da Defesa Civil na região (falta a localização do cliente para conferir)');
  const nota = notas.length ? notas.join(' · ') : null;

  if (d.avisos.length) {
    const principal = fraseDoAviso(d.avisos[0], agoraMs);
    const resto = d.avisos.length - 1;
    return { resumo: resto > 0 ? `${principal} (+${resto})` : principal, nota };
  }
  if (!d.completo) return { resumo: 'Alertas indisponíveis agora', nota };
  if (d.naoConferidos > 0) return { resumo: 'Pode haver alerta da Defesa Civil na região', nota: 'Falta a localização do cliente para conferir' };
  return { resumo: 'Sem alertas oficiais agora', nota: null };
}

/**
 * Valida a resposta do worker. `null` = corpo que não entendemos — e isso é
 * `alertas_indisponiveis`, não "sem alertas". Um aviso malformado derruba a
 * resposta inteira: descartá-lo calado seria esconder um alerta.
 */
export function normalizarRespostaAlertas(data: unknown, agoraMs: number = Date.now()): DadosAlertas | null {
  const d = data as any;
  if (!d || d.ok !== true || (d.estado !== 'ok' && d.estado !== 'parcial')) return null;
  const ibge = ibgeValido(d.ibge);
  if (!ibge || !Array.isArray(d.avisos) || !d.fontes || typeof d.fontes !== 'object') return null;
  const avisos: AvisoOficial[] = [];
  for (const bruto of d.avisos) {
    const a = lerAviso(bruto);
    if (!a) return null;
    avisos.push(a);
  }
  avisos.sort((x, y) => ORDEM[y.nivel] - ORDEM[x.nivel] || Date.parse(x.inicio) - Date.parse(y.inicio));

  const fontesIndisponiveis: string[] = [];
  for (const chave of ['inmet', 'defesaCivil']) {
    const f = d.fontes[chave];
    // Fonte ausente na resposta também é "não sei".
    if (!f || f.estado !== 'ok') fontesIndisponiveis.push(chave === 'inmet' ? 'INMET' : 'Defesa Civil');
  }
  const completo = d.estado === 'ok' && fontesIndisponiveis.length === 0;
  let naoConferidos = 0;
  if (d.naoConferidos && typeof d.naoConferidos === 'object') {
    for (const v of Object.values(d.naoConferidos)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) naoConferidos += v;
    }
  }
  const base = { avisos, completo, fontesIndisponiveis, naoConferidos };
  const { resumo, nota } = resumoAlertas(base, agoraMs);
  return {
    ok: true,
    ibge,
    ...base,
    pontoConferido: d.pontoConferido === true,
    consultadoEm: typeof d.consultadoEm === 'string' ? d.consultadoEm : null,
    resumo,
    nota,
    atribuicao: ATRIBUICAO_ALERTAS,
  };
}

/**
 * Texto pronto para qualquer estado — a UI NUNCA some calada:
 *   carregando          → "Buscando alertas oficiais…"
 *   desligado           → "Alertas oficiais desligados"
 *   cliente sem cidade  → "Sem a cidade do cliente para checar alertas"
 *   outra falha         → "Alertas indisponíveis agora"
 *   dados               → o resumo ("Alerta INMET: Tempestade até hoje 23h59")
 */
export function textoAlertas(estado: EstadoAlertas): string {
  if (estado === 'carregando') return 'Buscando alertas oficiais…';
  if (estado.ok === false) {
    if (estado.motivo === 'alertas_desligados') return 'Alertas oficiais desligados';
    if (estado.motivo === 'sem_municipio' || estado.motivo === 'ibge_invalido') return 'Sem a cidade do cliente para checar alertas';
    return 'Alertas indisponíveis agora';
  }
  return estado.resumo;
}

/** `true` SÓ quando dá para afirmar "sem alertas": as duas fontes ok, nada pendente. */
export function semAlertasConfirmado(estado: EstadoAlertas): boolean {
  return estado !== 'carregando' && estado.ok === true && estado.completo && estado.naoConferidos === 0 && estado.avisos.length === 0;
}

/** Nível mais grave entre os avisos (para a cor do chip), ou `null` sem aviso. */
export function nivelMaisGrave(estado: EstadoAlertas): NivelAlerta | null {
  if (estado === 'carregando' || estado.ok === false || !estado.avisos.length) return null;
  return estado.avisos[0].nivel;
}

/**
 * Avisos que valem em algum momento da janela [inicioIso, fimIso) — para
 * cruzar com a hora de uma visita. Sem `fim` declarado, vale 24 h do início
 * (a mesma regra do worker).
 */
export function avisosNoPeriodo(dados: DadosAlertas, inicioIso: string, fimIso: string): AvisoOficial[] {
  const ini = Date.parse(inicioIso);
  const fim = Date.parse(fimIso);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini) return [];
  return dados.avisos.filter((a) => {
    const aIni = Date.parse(a.inicio);
    const aFim = a.fim ? Date.parse(a.fim) : aIni + 24 * 60 * 60 * 1000;
    return aIni < fim && aFim > ini;
  });
}

/** Crédito das fontes quando há dado de alerta na tela; `null` em carregando/falha. */
export function atribuicaoAlertas(estado?: EstadoAlertas): string | null {
  if (estado === undefined) return ATRIBUICAO_ALERTAS;
  if (estado === 'carregando' || estado.ok === false) return null;
  return ATRIBUICAO_ALERTAS;
}
