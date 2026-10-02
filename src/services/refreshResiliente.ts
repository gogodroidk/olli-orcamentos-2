/**
 * Fetch do cliente Supabase que não transforma "servidor ocupado" em logout.
 * Módulo puro (sem React Native): recebe o fetch de verdade e devolve outro.
 *
 *     testado por: node scripts/teste-relogio-sessao.ts
 *
 * O PROBLEMA. No auth-js 2.108, qualquer erro de refresh que não seja de rede
 * (`AuthRetryableFetchError`: sem resposta, 502/503/504/52x) apaga a sessão e
 * emite `SIGNED_OUT` (GoTrueClient `_callRefreshToken`). Um 429 do limite de
 * taxa, um 500 passageiro ou um corpo ilegível derrubavam a pessoa na tela
 * Entrar — para o revisor da Play, "a credencial não funciona".
 *
 * A REGRA, em três estados:
 *  - refresh aceito → passa;
 *  - o servidor diz que a credencial MORREU (`invalid_grant`, refresh token
 *    inexistente ou já usado, sessão encerrada/expirada, usuário removido ou
 *    banido) → passa como veio: o auth-js desloga, e é o certo, porque manter
 *    uma sessão morta faria o app tentar renovar para sempre;
 *  - qualquer outra falha ("não sei": 429, 5xx, 4xx desconhecido) → vira 503 e
 *    o auth-js trata como falha de rede: MANTÉM a sessão guardada e tenta de
 *    novo depois. Durante a espera (30 s, ou o `Retry-After` se for maior, com
 *    teto de 60 s) o refresh nem sai do aparelho: martelar o servidor só
 *    renovaria o 429. Na espera a resposta é um 503 SINTÉTICO devolvido NA HORA
 *    (não um `throw`): para o auth-js é o mesmo "tente depois", sem o
 *    `console.error` que o `_handleRequest` emite a cada fetch que lança.
 *
 * LIMITE CONHECIDO. Enquanto a renovação está em espera, o laço de novas
 * tentativas do auth-js (`_refreshAccessToken`) segue até ~25 s e, sem token
 * válido, `getSession()`/`getCurrentUser()` podem voltar `null` nesse intervalo.
 * Quem chama TEM de tratar esse `null` como "não sei" (tentar de novo), nunca
 * como "sem login" nem como "lista vazia" — a regra dos 3 estados.
 *
 * De quebra, mede o relógio: o cabeçalho `Date` de toda resposta vai para
 * `aoReceberDataServidor` (ver services/relogioServidor.ts).
 */

/** Espera mínima depois de um refresh que falhou sem matar a sessão. */
export const ESPERA_APOS_FALHA_REFRESH_MS = 30_000;
/** Teto para um `Retry-After` exagerado (a sessão não pode ficar parada muito tempo). */
export const ESPERA_MAXIMA_MS = 60_000;

/** `error_code` do GoTrue que significam "esta credencial não vale mais". */
const CODIGOS_CREDENCIAL_MORTA: ReadonlySet<string> = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpcoesFetchResiliente {
  agora?: () => number;
  aoReceberDataServidor?: (cabecalhoDate: string | null, agoraAparelhoMs: number) => void;
}

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url ?? '';
}

/** É o pedido de renovação de sessão do GoTrue? */
export function ehRefreshDeSessao(input: RequestInfo | URL): boolean {
  const url = urlDe(input);
  return url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');
}

/**
 * O corpo do erro diz que a credencial morreu? Lê os dois formatos do GoTrue:
 * o antigo OAuth (`error: invalid_grant`) e o novo (`code`/`error_code`).
 */
export function falhaDeRefreshMataSessao(status: number, corpo: string): boolean {
  if (status !== 400 && status !== 401 && status !== 403) return false;
  let dados: Record<string, unknown>;
  try {
    const lido = JSON.parse(corpo) as unknown;
    if (!lido || typeof lido !== 'object') return false;
    dados = lido as Record<string, unknown>;
  } catch {
    return false;
  }
  if (dados.error === 'invalid_grant') return true;
  for (const campo of ['error_code', 'code'] as const) {
    const valor = dados[campo];
    if (typeof valor === 'string' && CODIGOS_CREDENCIAL_MORTA.has(valor)) return true;
  }
  return false;
}

/** "Tente depois" para o auth-js: 503 = AuthRetryableFetchError (mantém a sessão). */
function respostaDeEspera(corpo?: string): Response {
  return new Response(corpo || JSON.stringify({ msg: 'renovacao_indisponivel_agora' }), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'content-type': 'application/json' },
  });
}

function esperaPedida(resposta: Response, agora: number): number {
  const bruto = resposta.headers.get('retry-after');
  if (!bruto) return 0;
  const segundos = Number(bruto);
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
  const data = Date.parse(bruto);
  return Number.isNaN(data) ? 0 : Math.max(0, data - agora);
}

export function criarFetchResiliente(base: FetchLike, opcoes: OpcoesFetchResiliente = {}): FetchLike {
  const agora = opcoes.agora ?? (() => Date.now());
  let esperarAte = 0;

  return async (input, init) => {
    const refresh = ehRefreshDeSessao(input);
    if (refresh && agora() < esperarAte) {
      // 503 sintético na hora: o auth-js mantém a sessão; o servidor não é tocado.
      return respostaDeEspera();
    }

    const resposta = await base(input, init);
    try {
      opcoes.aoReceberDataServidor?.(resposta.headers.get('date'), agora());
    } catch {
      // Medir o relógio é bônus; nunca atrapalha a requisição.
    }
    if (!refresh) return resposta;
    if (resposta.ok) {
      esperarAte = 0;
      return resposta;
    }

    let corpo = '';
    try {
      corpo = await resposta.clone().text();
    } catch {
      corpo = '';
    }
    if (falhaDeRefreshMataSessao(resposta.status, corpo)) return resposta;

    const instante = agora();
    const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_APOS_FALHA_REFRESH_MS, esperaPedida(resposta, instante)));
    esperarAte = instante + espera;
    return respostaDeEspera(corpo);
  };
}
