/**
 * RADAR DO TEMPO PARA VENDER (Onda I4, jogada 8) — TypeScript PURO.
 *
 * "Calor forte chegando: 3 dias com máxima de 33 °C (ter a qui). 23 clientes
 * seus estão com a limpeza vencida. [Montar campanha]". A campanha abre o
 * WhatsApp de UM cliente por vez com a mensagem pronta (wa.me oficial): o
 * prestador lê, ajusta e envia. Nada é enviado sozinho, nada em massa.
 *
 * Dados: o resumo por dia do `/clima` (MET Norway, CC BY 4.0 — a tela mostra o
 * crédito) pela cidade do cadastro + a lista "Clientes para lembrar"
 * (`radarClientes.ts`). Nenhuma API paga.
 *
 * GATILHOS POR OFÍCIO (regra transparente, sem IA):
 *  - ar-condicionado e piscina → CALOR: 2+ dias com máxima ≥ 32 °C nos próximos 7;
 *  - dedetização → DENGUE: de novembro a maio (o período de mais casos no Brasil)
 *    com calor (2+ dias ≥ 30 °C) ou chuva (algum dia ≥ 10 mm) na previsão;
 *  - hidráulica → CHUVA FORTE: algum dia com ≥ 20 mm (calhas, telhado, infiltração);
 *  - jardinagem → SECA: 5+ dias sem chuva (< 1 mm, dado conhecido) e máxima ≥ 28 °C.
 * Outros ofícios: nenhum gatilho (silêncio, não sugestão genérica).
 *
 * "NÃO SEI" ≠ "TEMPO BOM": sem o resumo por dia (worker antigo, clima fora) o
 * radar responde `sem_previsao` — e a tela não sugere nada nem finge que olhou.
 * Dia com `chuvaMm: null` nunca conta como "dia seco".
 *
 * ANTI-SPAM: no máximo 1 sugestão por semana (`podeMostrarSugestao`) e a pessoa
 * pode silenciar por 30 dias.
 */
import type { VerticalId } from './verticais.ts';

export interface DiaPrevisao {
  /** 'AAAA-MM-DD' local. */
  data: string;
  max: number | null;
  min: number | null;
  chuvaMm: number | null;
}

export type GatilhoTempo = 'calor' | 'dengue' | 'chuva_forte' | 'seca';

export interface SugestaoTempo {
  gatilho: GatilhoTempo;
  oficio: VerticalId;
  /** Chave estável (gatilho + 1º dia): a mesma sugestão não "vira outra" no dia seguinte. */
  chave: string;
  titulo: string;
  /** Linha com os dias e os números da previsão. */
  detalhe: string;
  /** O serviço oferecido na mensagem ("a limpeza do ar-condicionado"). */
  servico: string;
  /** Dias que dispararam a regra. */
  dias: string[];
}

export type AvaliacaoRadarTempo =
  | { estado: 'sem_previsao' }
  | { estado: 'sem_sugestao' }
  | { estado: 'sugestao'; sugestao: SugestaoTempo };

export const CALOR_MAX_C = 32;
export const CALOR_DIAS_MIN = 2;
export const DENGUE_CALOR_C = 30;
export const DENGUE_CHUVA_MM = 10;
/** Novembro a maio (mês 1–12). */
export const MESES_DENGUE: readonly number[] = [11, 12, 1, 2, 3, 4, 5];
export const CHUVA_FORTE_MM = 20;
export const SECA_DIAS_MIN = 5;
export const SECA_MAX_C = 28;
/** Quantos dias à frente o radar olha (a partir de amanhã). */
export const JANELA_DIAS = 7;

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** 'AAAA-MM-DD' → "ter (06/10)". */
export function rotuloDia(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dow]} (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')})`;
}

function periodo(datas: string[]): string {
  if (datas.length === 1) return rotuloDia(datas[0]);
  return `de ${rotuloDia(datas[0])} a ${rotuloDia(datas[datas.length - 1])}`;
}

function graus(n: number): string {
  return `${Math.round(n)} °C`;
}

function mm(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace('.', ',')} mm`;
}

/** Os dias da janela: de amanhã até `JANELA_DIAS` à frente, válidos e em ordem. */
export function diasDaJanela(dias: DiaPrevisao[], hoje: string): DiaPrevisao[] {
  return dias
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.data) && d.data > hoje)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, JANELA_DIAS);
}

function quentes(janela: DiaPrevisao[], limite: number): DiaPrevisao[] {
  return janela.filter((d) => typeof d.max === 'number' && d.max >= limite);
}

function regraCalor(janela: DiaPrevisao[], oficio: VerticalId, servico: string): SugestaoTempo | null {
  const q = quentes(janela, CALOR_MAX_C);
  if (q.length < CALOR_DIAS_MIN) return null;
  const pico = Math.max(...q.map((d) => d.max as number));
  const datas = q.map((d) => d.data);
  return {
    gatilho: 'calor',
    oficio,
    chave: `calor:${datas[0]}`,
    titulo: `Calor forte chegando: ${q.length} dias com máxima de ${graus(CALOR_MAX_C)} ou mais`,
    detalhe: `${periodo(datas)}, até ${graus(pico)} na previsão.`,
    servico,
    dias: datas,
  };
}

function regraDengue(janela: DiaPrevisao[], mes: number): SugestaoTempo | null {
  if (!MESES_DENGUE.includes(mes)) return null;
  const q = quentes(janela, DENGUE_CALOR_C);
  const chuvosos = janela.filter((d) => typeof d.chuvaMm === 'number' && d.chuvaMm >= DENGUE_CHUVA_MM);
  if (q.length < 2 && chuvosos.length === 0) return null;
  const partes: string[] = [];
  if (q.length >= 2) partes.push(`${q.length} dias com ${graus(DENGUE_CALOR_C)} ou mais`);
  if (chuvosos.length) partes.push(`chuva de ${mm(Math.max(...chuvosos.map((d) => d.chuvaMm as number)))} em ${rotuloDia(chuvosos[0].data)}`);
  const datas = [...new Set([...q, ...chuvosos].map((d) => d.data))].sort();
  return {
    gatilho: 'dengue',
    oficio: 'dedetizacao',
    chave: `dengue:${datas[0]}`,
    titulo: 'Calor e chuva na época da dengue',
    detalhe: `Previsão: ${partes.join(' e ')}. De novembro a maio é quando o mosquito mais se espalha.`,
    servico: 'a dedetização contra o mosquito',
    dias: datas,
  };
}

function regraChuvaForte(janela: DiaPrevisao[]): SugestaoTempo | null {
  const fortes = janela.filter((d) => typeof d.chuvaMm === 'number' && d.chuvaMm >= CHUVA_FORTE_MM);
  if (!fortes.length) return null;
  const pior = fortes.reduce((a, b) => ((b.chuvaMm as number) > (a.chuvaMm as number) ? b : a));
  return {
    gatilho: 'chuva_forte',
    oficio: 'hidraulica',
    chave: `chuva:${fortes[0].data}`,
    titulo: `Chuva forte prevista: ${mm(pior.chuvaMm as number)} em ${rotuloDia(pior.data)}`,
    detalhe: `${fortes.length === 1 ? '1 dia' : `${fortes.length} dias`} com ${mm(CHUVA_FORTE_MM)} ou mais na previsão.`,
    servico: 'a revisão de calhas, telhado e pontos de infiltração',
    dias: fortes.map((d) => d.data),
  };
}

function regraSeca(janela: DiaPrevisao[]): SugestaoTempo | null {
  const secos = janela.filter(
    (d) => typeof d.chuvaMm === 'number' && d.chuvaMm < 1 && typeof d.max === 'number' && d.max >= SECA_MAX_C,
  );
  if (secos.length < SECA_DIAS_MIN) return null;
  const datas = secos.map((d) => d.data);
  return {
    gatilho: 'seca',
    oficio: 'jardinagem',
    chave: `seca:${datas[0]}`,
    titulo: `Tempo seco: ${secos.length} dias sem chuva e com ${graus(SECA_MAX_C)} ou mais`,
    detalhe: `${periodo(datas)} na previsão.`,
    servico: 'a revisão da irrigação e do gramado',
    dias: datas,
  };
}

/**
 * Avalia a previsão para os ofícios do cadastro (na ordem: o 1º com gatilho
 * vence). `dias` ausente = `sem_previsao`. `hoje` = 'AAAA-MM-DD' local.
 */
export function avaliarRadarTempo(
  dias: DiaPrevisao[] | null | undefined,
  verticais: VerticalId[] | null | undefined,
  hoje: string,
): AvaliacaoRadarTempo {
  if (!Array.isArray(dias)) return { estado: 'sem_previsao' };
  const janela = diasDaJanela(dias, hoje);
  if (!janela.length) return { estado: 'sem_previsao' };
  const mes = Number(hoje.slice(5, 7));
  for (const oficio of verticais ?? []) {
    let s: SugestaoTempo | null = null;
    if (oficio === 'refrigeracao') s = regraCalor(janela, oficio, 'a limpeza do ar-condicionado');
    else if (oficio === 'piscina') s = regraCalor(janela, oficio, 'a limpeza e o tratamento da piscina');
    else if (oficio === 'dedetizacao') s = regraDengue(janela, mes);
    else if (oficio === 'hidraulica') s = regraChuvaForte(janela);
    else if (oficio === 'jardinagem') s = regraSeca(janela);
    if (s) return { estado: 'sugestao', sugestao: s };
  }
  return { estado: 'sem_sugestao' };
}

/** Frase do motivo, dentro da mensagem ao cliente. */
function motivoNaMensagem(s: SugestaoTempo): string {
  switch (s.gatilho) {
    case 'calor':
      return 'a previsão é de calor forte nos próximos dias';
    case 'dengue':
      return 'a previsão é de calor e chuva, bem na época em que o mosquito da dengue mais se espalha';
    case 'chuva_forte':
      return 'a previsão é de chuva forte nos próximos dias';
    case 'seca':
      return 'a previsão é de dias quentes e sem chuva';
  }
}

/**
 * Mensagem pronta para UM cliente (o prestador edita e envia no WhatsApp). Cita o
 * último serviço só quando sabemos há quanto tempo foi.
 */
export function mensagemCampanha(
  s: SugestaoTempo,
  cliente: { nome: string; meses?: number | null },
  prestador?: string | null,
): string {
  const primeiroNome = (cliente.nome || '').trim().split(/\s+/)[0] || '';
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const quem = prestador && prestador.trim() ? ` Aqui é ${prestador.trim()}.` : '';
  const ultimo = typeof cliente.meses === 'number' && cliente.meses > 0
    ? ` Seu último serviço comigo foi há ${cliente.meses} ${cliente.meses === 1 ? 'mês' : 'meses'}.`
    : '';
  const motivo = motivoNaMensagem(s);
  return `${ola}${quem} Passando porque ${motivo}.${ultimo} Quer agendar ${s.servico}? É só me responder aqui.`;
}

// ─── Anti-spam: 1 sugestão por semana, silenciar por 30 dias ─────────────────

export const DIAS_ENTRE_SUGESTOES = 7;
export const DIAS_SILENCIO = 30;
const MS_DIA = 86_400_000;

export interface EstadoRadarTempoGuardado {
  /** Chave da última sugestão mostrada e desde quando (ms). */
  chave?: string;
  desde?: number;
  /** Fechada ("agora não" / campanha feita) ou silenciada até (ms). */
  ocultaAte?: number;
}

/**
 * Pode mostrar esta sugestão agora? A MESMA sugestão continua visível durante a
 * semana; uma DIFERENTE só depois de 7 dias da anterior; fechada/silenciada fica
 * escondida até o prazo.
 */
export function podeMostrarSugestao(g: EstadoRadarTempoGuardado | null | undefined, chave: string, agoraMs: number): boolean {
  if (g?.ocultaAte && agoraMs < g.ocultaAte) return false;
  if (!g?.chave || g.chave === chave) return true;
  return !g.desde || agoraMs - g.desde >= DIAS_ENTRE_SUGESTOES * MS_DIA;
}

/** Registra que `chave` está sendo mostrada (mantém o "desde" se já era ela). */
export function registrarMostrada(g: EstadoRadarTempoGuardado | null | undefined, chave: string, agoraMs: number): EstadoRadarTempoGuardado {
  if (g?.chave === chave) return { ...g };
  return { chave, desde: agoraMs, ocultaAte: g?.ocultaAte };
}

/** Fecha por uma semana ("agora não" ou campanha feita) ou silencia por 30 dias. */
export function ocultar(g: EstadoRadarTempoGuardado | null | undefined, agoraMs: number, modo: 'semana' | 'silenciar'): EstadoRadarTempoGuardado {
  const dias = modo === 'semana' ? DIAS_ENTRE_SUGESTOES : DIAS_SILENCIO;
  return { ...(g ?? {}), ocultaAte: agoraMs + dias * MS_DIA };
}
