/**
 * ASSINATURA PELA APP STORE (StoreKit 2) — núcleo PURO: catálogo, checagem de dono e tradução da
 * transação assinada (JWS) numa DECISÃO igual à do Play (`play.js: traduzirAssinaturaPlay`).
 *
 * Quem assina é a Apple (ver `appleJws.js`: cadeia fixada na Apple Root CA G3). Este arquivo só decide
 * o que a transação VERIFICADA significa para o plano; nada aqui toca rede ou banco.
 *
 * Decisão devolvida (mesmo vocabulário do Play, para o `aplicarDecisao` do Apple reaproveitar o desenho):
 *  - { acao:'invalido', motivo }                      → entrada ilegível; não faz nada
 *  - { acao:'alarme', motivo }                        → algo estranho; não aplica, alguém olha
 *  - { acao:'registrar', motivo }                     → guarda, não libera (ex.: Sandbox não permitido)
 *  - { acao:'conceder', userId, plano, status, vigenciaAte, acessoAte, transacaoId, produtoId, eventoEm }
 *  - { acao:'encerrar', userId, transacaoId, vigenciaAte, eventoEm }
 *
 * Fail-closed: produto desconhecido, bundle diferente, sem `expiresDate`, ou tipo que não é assinatura
 * renovável NÃO liberam nada. Erro de dado nunca rebaixa plano: só `revocationDate`, `expiresDate` no
 * passado e as notificações EXPIRED/REFUND/REVOKE encerram.
 *
 * Catálogo no App Store Connect (um grupo de assinatura "OLLI"; preço BR R$ 39/99 — R0011):
 *   olli_pro_mensal · olli_pro_anual · olli_empresa_mensal · olli_empresa_anual
 * O id lógico gravado em `assinaturas.revenuecat_produto_id` é o MESMO do Play (`olli_pro:mensal`).
 */

/** Bundle id do app (app.json) — a transação de outro app é recusada. */
export const BUNDLE_ID_APPLE = 'online.olliorcamentos.app';

/** Folga de renovação (mesma ordem de grandeza do Play): a Apple renova até algumas horas antes do fim. */
export const FOLGA_RENOVACAO_APPLE_MS = 2 * 60 * 60 * 1000;

export const PRODUTOS_APPLE = Object.freeze({
  olli_pro_mensal: { plano: 'pro', periodo: 'mensal', produtoId: 'olli_pro:mensal' },
  olli_pro_anual: { plano: 'pro', periodo: 'anual', produtoId: 'olli_pro:anual' },
  olli_empresa_mensal: { plano: 'empresa', periodo: 'mensal', produtoId: 'olli_empresa:mensal' },
  olli_empresa_anual: { plano: 'empresa', periodo: 'anual', produtoId: 'olli_empresa:anual' },
});

/** Os SKUs que o app pede à loja no iOS (`fetchProducts`). */
export const SKUS_APPLE = Object.freeze(Object.keys(PRODUTOS_APPLE));

export function produtoApple(productId) {
  return typeof productId === 'string' && Object.hasOwn(PRODUTOS_APPLE, productId) ? PRODUTOS_APPLE[productId] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const iso = (ms) => new Date(ms).toISOString();
const numMs = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** O app passa o `user.id` (UUID do Supabase) como `appAccountToken`: é o elo transação → conta. */
export function donoDaTransacao(tx) {
  const t = typeof tx?.appAccountToken === 'string' ? tx.appAccountToken.toLowerCase() : '';
  return ehUuid(t) ? t : null;
}

/**
 * Valida os campos que NÃO dependem de estado (bundle, produto, tipo, ids). Devolve
 * { ok:true, produto } ou { ok:false, acao, motivo }.
 */
export function validarTransacao(tx) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return { ok: false, acao: 'invalido', motivo: 'transacao_invalida' };
  if (tx.bundleId !== BUNDLE_ID_APPLE) return { ok: false, acao: 'alarme', motivo: 'bundle_diferente' };
  const produto = produtoApple(tx.productId);
  if (!produto) return { ok: false, acao: 'alarme', motivo: 'produto_desconhecido' };
  if (tx.type !== undefined && tx.type !== 'Auto-Renewable Subscription') return { ok: false, acao: 'alarme', motivo: 'tipo_nao_e_assinatura' };
  if (typeof tx.originalTransactionId !== 'string' || !/^\d{1,30}$/.test(tx.originalTransactionId)) return { ok: false, acao: 'invalido', motivo: 'sem_original_transaction_id' };
  return { ok: true, produto };
}

/**
 * Traduz a transação VERIFICADA numa decisão.
 * @param tx          payload do JWS da transação (já verificado por `verificarJwsApple`)
 * @param opts.userId dono da conta OLLI (de quem chamou /apple/verificar ou da compra gravada)
 * @param opts.transacaoId vínculo gravado em assinaturas.revenuecat_transacao_id (ex.: 'apple:<sha256 do originalTransactionId>')
 * @param opts.tipoNotificacao  'REFUND' | 'REVOKE' | 'EXPIRED' | 'DID_FAIL_TO_RENEW' | … (v2) — opcional
 * @param opts.renovacao  payload do signedRenewalInfo (opcional): autoRenewStatus, gracePeriodExpiresDate
 * @param opts.sandboxPermitido  Sandbox/TestFlight só libera para quem estiver na lista de testadores
 */
export function traduzirTransacaoApple(tx, { userId, transacaoId, agora = Date.now(), tipoNotificacao = null, renovacao = null, sandboxPermitido = false } = {}) {
  const v = validarTransacao(tx);
  if (!v.ok) return { acao: v.acao, motivo: v.motivo };
  if (!ehUuid(userId)) return { acao: 'invalido', motivo: 'sem_dono' };
  if (typeof transacaoId !== 'string' || transacaoId === '') return { acao: 'invalido', motivo: 'sem_vinculo' };

  const eventoEm = iso(Number.isFinite(tx.signedDate) ? tx.signedDate : agora);
  const expira = numMs(tx.expiresDate);
  const revogada = numMs(tx.revocationDate);

  // Sandbox (TestFlight / revisão da Apple): nunca vira receita nem plano de cliente real.
  if (tx.environment === 'Sandbox' && !sandboxPermitido) return { acao: 'registrar', motivo: 'sandbox_nao_permitido' };
  if (tx.environment !== 'Sandbox' && tx.environment !== 'Production') return { acao: 'alarme', motivo: 'ambiente_desconhecido' };

  // Reembolso / revogação (Family Sharing, estorno): corta já. Nunca ESTENDE nada.
  if (revogada || tipoNotificacao === 'REFUND' || tipoNotificacao === 'REVOKE') {
    const fim = Math.min(revogada ?? agora, agora);
    return { acao: 'encerrar', userId, transacaoId, vigenciaAte: iso(fim), eventoEm };
  }

  // Sem vigência a loja não disse até quando vale: não inventamos.
  if (!expira) return { acao: 'alarme', motivo: 'sem_expiracao' };

  if (expira <= agora || tipoNotificacao === 'EXPIRED' || tipoNotificacao === 'GRACE_PERIOD_EXPIRED') {
    // Vencida de verdade = fim. (EXPIRED chega com expiresDate no passado.)
    return { acao: 'encerrar', userId, transacaoId, vigenciaAte: iso(Math.min(expira, agora)), eventoEm };
  }

  // Período de carência de cobrança: a Apple manda MANTER o acesso até `gracePeriodExpiresDate`.
  const graca = numMs(renovacao?.gracePeriodExpiresDate);
  let acessoAte = expira;
  if (graca && graca > expira) acessoAte = graca;
  else if (renovacao?.autoRenewStatus === 1) acessoAte = expira + FOLGA_RENOVACAO_APPLE_MS; // renova: folga curta

  return {
    acao: 'conceder',
    userId,
    plano: v.produto.plano,
    status: 'active',
    vigenciaAte: iso(expira),
    acessoAte: iso(acessoAte),
    transacaoId,
    produtoId: v.produto.produtoId,
    eventoEm,
  };
}

/** Vínculo gravado em `assinaturas.revenuecat_transacao_id`: prova de que a linha é DESTA compra Apple. */
export async function vinculoApple(originalTransactionId) {
  const dados = new TextEncoder().encode(`apple:${originalTransactionId}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', dados));
  return 'apple:' + [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
}
