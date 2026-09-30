/**
 * Porta única de "isto quebrou, avise o Sentry" — para exceção que o NOSSO código
 * já segurou (ErrorBoundary, catch do boot, catch da rota de IA/webhook) e que por
 * isso nunca chega ao ouvinte global do SDK. Sem esta chamada, o usuário vê a tela
 * de erro e o dono não vê nada: é o padrão "erro vira vazio" na observabilidade.
 *
 * Módulo puro, compartilhado por app, painel e Worker (mesma regra do
 * sentryScrub.ts): não importa SDK nenhum. Cada frente CONECTA o seu SDK logo
 * depois do `Sentry.init` com `conectarSentry(Sentry)`; quem captura só conhece
 * `capturarExcecao`. Assim um teste com `node` exercita a porta sem rede.
 *
 * A privacidade NÃO mora aqui: o evento montado pelo SDK passa pelo `beforeSend`
 * (limparEventoSentry) de cada frente. Aqui só vão TAGS curtas e sem query —
 * `origem` (quem capturou), `tela`/`rota` (onde) e `tipo` (classificação) —, nunca
 * `extra`/`contexts`, que o redator apaga de qualquer jeito.
 *
 * Antes de conectar, a exceção espera numa fila curta: o painel só baixa o SDK
 * depois da primeira pintura, e um erro de rota no boot não pode sumir por ter
 * chegado cedo demais.
 */

export interface ContextoCaptura {
  /** Quem capturou: 'error-boundary', 'boot', 'rota-painel', 'ia', 'webhook'... */
  origem: string;
  /** Nome da tela (app) — nunca parâmetro de rota. */
  tela?: string;
  /** Path da rota (painel/Worker). Query e fragmento são cortados. */
  rota?: string;
  /** Classificação livre e curta (ex.: 'download' | 'execucao'). */
  tipo?: string;
}

/** O pedaço do SDK (`@sentry/react-native`, `@sentry/react`, `@sentry/cloudflare`) que usamos. */
export interface ClienteSentry {
  captureException(erro: unknown, contexto?: { tags?: Record<string, string> }): unknown;
}

// Teto para o caso patológico: um loop de erro antes do SDK chegar não pode
// virar vazamento de memória. Mesmo número da fila antiga do painel.
const LIMITE_FILA = 20;
const LIMITE_TAG = 64;

let cliente: ClienteSentry | null = null;
const pendentes: Array<{ erro: unknown; contexto?: ContextoCaptura }> = [];

function tag(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpo = valor.split(/[?#]/, 1)[0].trim().slice(0, LIMITE_TAG);
  return limpo || undefined;
}

/** Tags do evento. Exportada para o teste conferir o formato sem SDK. */
export function montarTagsCaptura(contexto?: ContextoCaptura): Record<string, string> {
  const tags: Record<string, string> = {};
  if (!contexto) return tags;
  for (const chave of ['origem', 'tela', 'rota', 'tipo'] as const) {
    const valor = tag(contexto[chave]);
    if (valor) tags[chave] = valor;
  }
  return tags;
}

/**
 * Reporta uma exceção já tratada. Best-effort: NUNCA lança — quem chama está no
 * meio de mostrar a tela de erro ou de responder 5xx, e perder o relatório não
 * pode custar essa resposta.
 */
export function capturarExcecao(erro: unknown, contexto?: ContextoCaptura): void {
  try {
    if (!cliente) {
      if (pendentes.length < LIMITE_FILA) pendentes.push({ erro, contexto });
      return;
    }
    cliente.captureException(erro, { tags: montarTagsCaptura(contexto) });
  } catch {
    // o reporte nunca pode derrubar quem reporta
  }
}

/** Liga o SDK já inicializado e despeja a fila do que chegou antes dele. */
export function conectarSentry(novo: ClienteSentry): void {
  cliente = novo;
  for (const { erro, contexto } of pendentes.splice(0)) capturarExcecao(erro, contexto);
}

/** Só para teste: volta ao estado de antes do `conectarSentry`. */
export function resetarCapturaParaTeste(): void {
  cliente = null;
  pendentes.length = 0;
}
