/**
 * Núcleo PURO do rastreio de uso (testável em Node, sem React Native).
 *
 * Parecer LEGAL de 22/10/2026 (Dr. Paulo): liberado com legítimo interesse, SÓ tela e ação
 * (nome fixo), nunca texto digitado, valor, nome/telefone de cliente, replay ou autocapture.
 * Por isso o que sai do aparelho é uma LISTA FECHADA: os 10 eventos do funil abaixo + o nome
 * da rota. Qualquer outro `track()` continua só no SQLite local (como sempre foi).
 */

/** Os 10 eventos principais: abertura, telas, cadastro, ativação, 1º orçamento, 1º envio, gate e 1º pagamento. */
export const EVENTOS_FUNIL = [
  'sessao_iniciada', // app aberto (começo de sessão)
  'signup', // conta criada
  'onboarding_completed', // terminou a apresentação
  'ativacao_exemplo_aberto', // abriu o exemplo do ofício
  'quote_created', // criou orçamento
  'quote_sent', // enviou orçamento ao cliente
  'gate_visto', // topou num recurso do plano pago
  'planos_aberto', // abriu a tela de Planos
  'pix_gerado', // gerou o Pix do plano
  'pix_pago', // pagamento confirmado
] as const;
// 'tela_vista' é o 11º tipo de linha, mas não é "ação": é a própria visita (com duração) em user_tela_log.

export type EventoFunil = (typeof EVENTOS_FUNIL)[number];
const SET_FUNIL: ReadonlySet<string> = new Set(EVENTOS_FUNIL);

export const TELA_VALIDA = /^[A-Za-z0-9_]{1,40}$/;
export const ACAO_VALIDA = /^[a-z0-9_]{1,40}$/;
export const LOTE_MAX = 20;
export const DURACAO_MAX_MS = 4 * 60 * 60 * 1000;
export const FILA_MAX = 200; // teto de memória: passou disso, descarta o mais antigo (nunca cresce sem limite)

export const ehEventoFunil = (nome: string): nome is EventoFunil => SET_FUNIL.has(nome);

export interface ItemRastreio {
  tela: string;
  acao?: string;
  duracao_ms: number;
}

/** Visita a uma tela (com duração). Rejeita nome fora do formato (rota com parâmetro, texto, URL). */
export function itemTela(tela: string | undefined, duracaoMs: number): ItemRastreio | null {
  if (!tela || !TELA_VALIDA.test(tela)) return null;
  const d = Number.isFinite(duracaoMs) ? Math.min(Math.max(Math.round(duracaoMs), 0), DURACAO_MAX_MS) : 0;
  return { tela, duracao_ms: d };
}

/** Ação do funil dentro da tela atual ('app' quando não há tela). Só aceita os 10 eventos. */
export function itemAcao(evento: string, tela: string | null): ItemRastreio | null {
  if (!ehEventoFunil(evento) || !ACAO_VALIDA.test(evento)) return null;
  const t = tela && TELA_VALIDA.test(tela) ? tela : 'app';
  return { tela: t, acao: evento, duracao_ms: 0 };
}

/** Adiciona respeitando o teto da fila (descarta o mais antigo). */
export function empilhar(fila: ItemRastreio[], item: ItemRastreio): ItemRastreio[] {
  const nova = [...fila, item];
  return nova.length > FILA_MAX ? nova.slice(nova.length - FILA_MAX) : nova;
}

/** Consentimento em 3 estados (regra do projeto: erro de leitura nunca vira "liberado"). */
export type Preferencia = 'ligado' | 'desligado' | 'desconhecido';
export function interpretarPreferencia(valor: string | null | undefined, erro = false): Preferencia {
  if (erro) return 'desconhecido';
  if (valor === 'desligado') return 'desligado';
  if (valor === 'ligado' || valor == null) return 'ligado'; // legítimo interesse: padrão ligado, com opt-out visível
  return 'desconhecido';
}
/** Só envia com preferência CLARAMENTE ligada; 'desconhecido' (erro de leitura) não envia. */
export const podeEnviar = (p: Preferencia): boolean => p === 'ligado';
