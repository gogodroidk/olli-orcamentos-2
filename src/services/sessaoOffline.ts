/**
 * Sessão que não cai sem internet — a regra pura (sem React Native, sem rede).
 *
 *     testada por: node scripts/teste-sessao-30-dias-offline.ts
 *
 * O BUG QUE ISTO FECHA. O token de acesso do Supabase vence em ~1 hora. Num boot
 * frio depois disso, `supabase.auth.getSession()` tenta renovar; SEM INTERNET a
 * renovação falha com `AuthRetryableFetchError` e o `getSession` devolve
 * `session: null` — embora a sessão continue GUARDADA no aparelho (a biblioteca
 * só apaga a sessão quando o servidor responde que ela não vale mais; erro de
 * rede ela mantém, de propósito). O app lia esse `null` como "deslogado" e
 * mandava o técnico para a tela Entrar. Isto é, no meio do sítio, sem sinal, o
 * app pedia senha — a queixa que a concorrência (Field Control) carrega de
 * "pede login a cada 3 dias", só que aqui era a cada 1 hora sem rede.
 *
 * A DECISÃO, EM TRÊS CASOS:
 *  1. o servidor (ou a sessão ainda válida) respondeu com sessão → usa;
 *  2. a renovação falhou POR REDE (erro "repetível") e há uma sessão bem formada
 *     guardada no aparelho → usa a guardada, marcada `guardada_offline`. O app
 *     abre em modo avião com os dados locais; o sync continua parado (ele exige
 *     sessão renovada) e volta sozinho quando a rede voltar;
 *  3. qualquer outra coisa → `nenhuma` (fail-closed: cai na porta).
 *
 * O QUE ISTO NÃO FAZ (e não deve fazer). Não estende a vida de uma sessão que o
 * SERVIDOR recusou: se a conta foi desconectada (senha trocada, "sair de todos
 * os aparelhos"), o erro de renovação NÃO é repetível, a biblioteca apaga a
 * sessão e aqui ela já não existe — a pessoa cai na porta assim que houver rede.
 * Também não inventa prazo: não há "validade de 30 dias" nossa; quem manda é o
 * refresh token do servidor. Sem rede, o aparelho não tem como saber mais do que
 * "a sessão que eu tinha continua aqui".
 */

/** Forma mínima de sessão que o app usa (id do usuário + tokens). */
export interface SessaoMinima {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string | null };
}

export type OrigemSessao = 'servidor' | 'guardada_offline' | 'nenhuma';

export interface DecisaoSessao<S extends SessaoMinima = SessaoMinima> {
  origem: OrigemSessao;
  sessao: S | null;
}

/**
 * O erro de renovação é de REDE (tentar de novo depois resolve)? Espelha o
 * `isAuthRetryableFetchError` do auth-js sem importá-lo (este módulo precisa
 * rodar no `node` do gate): o nome da classe, ou `status: 0` (fetch nem saiu).
 * Status 5xx de gateway também é repetível no auth-js e cai no nome da classe.
 */
export function erroDeRenovacaoEhDeRede(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const e = erro as { name?: unknown; status?: unknown };
  if (e.name === 'AuthRetryableFetchError') return true;
  return e.status === 0;
}

/** A sessão guardada (texto do storage) é utilizável? Nunca lança. */
export function interpretarSessaoGuardada(bruto: string | null | undefined): SessaoMinima | null {
  if (!bruto) return null;
  try {
    const valor = JSON.parse(bruto) as Partial<SessaoMinima> & { currentSession?: Partial<SessaoMinima> };
    // Formato antigo do gotrue guardava `{ currentSession, expiresAt }`.
    const s = (valor && typeof valor === 'object' && valor.currentSession) ? valor.currentSession : valor;
    if (!s || typeof s !== 'object') return null;
    if (typeof s.access_token !== 'string' || !s.access_token) return null;
    if (typeof s.refresh_token !== 'string' || !s.refresh_token) return null;
    if (!s.user || typeof s.user !== 'object' || typeof s.user.id !== 'string' || !s.user.id) return null;
    return s as SessaoMinima;
  } catch {
    return null;
  }
}

/**
 * Decide qual sessão o app usa no boot. Pura: mesma entrada, mesma saída.
 *
 * @param sessaoDoCliente o `data.session` do `getSession()` (pode ser null)
 * @param erro            o `error` do `getSession()` (pode ser null)
 * @param guardadaBruta   o texto cru da sessão no storage do aparelho
 */
export function decidirSessaoNoBoot<S extends SessaoMinima>(
  sessaoDoCliente: S | null | undefined,
  erro: unknown,
  guardadaBruta: string | null | undefined,
): DecisaoSessao<S> {
  if (sessaoDoCliente) return { origem: 'servidor', sessao: sessaoDoCliente };
  if (!erroDeRenovacaoEhDeRede(erro)) return { origem: 'nenhuma', sessao: null };
  const guardada = interpretarSessaoGuardada(guardadaBruta);
  if (!guardada) return { origem: 'nenhuma', sessao: null };
  return { origem: 'guardada_offline', sessao: guardada as S };
}
