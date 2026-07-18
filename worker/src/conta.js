/**
 * Conta do usuário — OLLI (worker Cloudflare, SEM SDK).
 *
 *   POST /conta/excluir → exclui a conta do usuário logado (JWT). Cancela as
 *                         assinaturas ativas (Stripe E Mercado Pago) e SÓ ENTÃO
 *                         apaga o usuário em auth.users com SERVICE_ROLE (o cascade
 *                         das FKs limpa os dados). Se algum cancelamento falhar,
 *                         NADA é apagado (502 retryável): conta apagada com
 *                         assinatura viva = cartão cobrado sem ninguém para
 *                         cancelar. Apple + LGPD.
 *
 * Segurança (mesmo modelo de stripe.js / equipe.js):
 *  - Exige JWT do Supabase (Authorization: Bearer <token>), validado em
 *    /auth/v1/user. O id a apagar é SEMPRE o do JWT validado — NUNCA vem do
 *    corpo do request. Assim, ninguém consegue excluir a conta de outra pessoa.
 *  - A exclusão em auth.users usa a Admin API do GoTrue com SERVICE_ROLE
 *    (DELETE /auth/v1/admin/users/<id>). O client nunca vê a service role.
 *  - O secret da Stripe (para cancelar a assinatura) vive só no worker.
 */
import { rateOkSensivel } from './rateLimit.js';
import { cancelarPreapprovalMp, lerPreapprovalGravado } from './mercadopago.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

const STRIPE_API = 'https://api.stripe.com/v1';

// ─── helpers de resposta ─────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

// ─── auth do usuário (mesmo padrão de getUser no index.js/stripe.js) ──
/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id,...}) ou null. */
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

// ─── acesso ao Supabase (service role; bypassa RLS) ──────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/** Lê a assinatura do usuário (para cancelar na Stripe antes de excluir). null se não houver. */
/**
 * Assinatura do usuário. Distingue TRÊS estados, porque quem chama decide se pode
 * destruir a conta:
 *   { ...linha }   → existe assinatura
 *   null           → consultou e NÃO existe assinatura
 *   { error: true }→ NÃO SABE (rede/PostgREST fora)
 * Colapsar o erro em `null` faria handleContaExcluir pular o cancelamento e apagar
 * a conta com a subscription viva — a cobrança órfã que ele existe para impedir.
 * Mesmo contrato do getAssinatura de stripe.js.
 */
export async function getAssinatura(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=stripe_subscription_id,stripe_customer_id&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

// ─── rate limit (reusa o namespace do Stripe) ────────────────
/** true se PODE seguir, false se estourou. Sem binding → não bloqueia. */
// FAIL-CLOSED (O2-18): exclusão de conta é destrutiva e irreversível — se não dá
// para limitar, não deixa passar. Ver worker/src/rateLimit.js.
async function rateOk(env, key) {
  return rateOkSensivel(env, env.CONTA_RL || env.STRIPE_RL, key);
}

/**
 * Cancela imediatamente a assinatura na Stripe (DELETE /subscriptions/<id>).
 * Devolve 'ok' | 'erro'. NÃO é best-effort: quem chama BLOQUEIA a exclusão da
 * conta quando dá 'erro' — apagar o usuário com a subscription viva deixaria o
 * cartão sendo cobrado sem nenhuma conta pela qual cancelar.
 * 'ok' cobre também "já estava cancelada" (404 e o 400 subscription_already_canceled),
 * senão quem cancelou pelo portal nunca mais conseguiria apagar a conta.
 * O Pro 12x avulso tem stripe_subscription_id null e sai por 'ok' logo na entrada.
 *
 * EXPORTADA de propósito: o painel admin usa ESTA função. Uma segunda cópia da
 * regra foi exatamente o que fez o guard do getAssinatura virar código morto.
 */
export async function cancelarAssinaturaStripe(env, subscriptionId) {
  if (!subscriptionId) return 'ok'; // nada a cancelar
  if (!env.STRIPE_SECRET_KEY) return 'erro'; // há o que cancelar e não podemos: falha
  try {
    const authBasic = 'Basic ' + btoa(`${env.STRIPE_SECRET_KEY}:`);
    const r = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: authBasic },
    });
    // O que importa não é se a chamada teve efeito, e sim se a assinatura está
    // cancelada ao final. 404 = já não existe na Stripe.
    if (r.ok || r.status === 404) return 'ok';

    const data = await r.json().catch(() => ({}));
    const erro = (data && data.error) || {};

    // A Stripe recusa com 400 quando a subscription JÁ está cancelada. Esse é o
    // caso COMUM (o webhook `customer.subscription.deleted` mantém o
    // stripe_subscription_id na linha), não um caso raro: sem tratá-lo, quem
    // cancelou pelo portal ficaria PERMANENTEMENTE impedido de excluir a conta.
    if (erro.code === 'subscription_already_canceled' || /already been canceled/i.test(String(erro.message || ''))) {
      return 'ok';
    }

    // Último recurso: pergunta o estado real antes de bloquear a exclusão.
    const g = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: authBasic },
    });
    if (g.status === 404) return 'ok';
    if (g.ok) {
      const sub = await g.json().catch(() => ({}));
      if (sub && sub.status === 'canceled') return 'ok';
    }

    console.error('[olli-conta] cancelar assinatura falhou:', r.status, erro.code, erro.message);
    return 'erro';
  } catch (e) {
    console.error('[olli-conta] cancelar assinatura erro:', e && (e.message || e));
    return 'erro';
  }
}

/**
 * Apaga o usuário em auth.users via Admin API do GoTrue. O cascade das FKs
 * (definido no schema multi-tenant) limpa os dados vinculados ao user_id.
 * Retorna true em sucesso.
 */
async function excluirUsuarioAuth(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE', headers: sbHeaders(env) },
    );
    // 200/204 = apagado. 404 = já não existe (idempotente: consideramos sucesso).
    if (r.ok || r.status === 404) return true;
    const txt = await r.text().catch(() => '');
    console.error('[olli-conta] excluir usuario falhou:', r.status, txt.slice(0, 200));
    return false;
  } catch (e) {
    console.error('[olli-conta] excluir usuario erro:', e && (e.message || e));
    return false;
  }
}

// ─── POST /conta/excluir ─────────────────────────────────────
export async function handleContaExcluir(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  // Contador PRÓPRIO: sem o prefixo, /conta/excluir divide chave e balde (STRIPE_RL,
  // 10/60s) com /stripe/checkout e /stripe/portal. Como as falhas retryáveis acima
  // convidam o usuário a tentar de novo, uma rajada de tentativas de exclusão
  // esgotaria o balde e devolveria 429 justamente no Portal — o caminho que a Apple
  // exige para CANCELAR a assinatura.
  if (!(await rateOk(env, `excluir:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, erro: 'backend_nao_configurado' }, 503);
  }

  // Cancela a assinatura Stripe ativa ANTES de apagar o usuário, e BLOQUEIA a
  // exclusão se o cancelamento falhar. Apagar o usuário com a subscription viva
  // deixaria o cartão sendo cobrado sem nenhuma conta pela qual cancelar — e os
  // webhooks seguintes bateriam em FK órfã (user_id inexistente), fazendo a
  // Stripe reenviar em loop. 502 é retryável: o app pode tentar de novo.
  const assinatura = await getAssinatura(env, user.id);

  // Falha ao LER a assinatura não é "não tem assinatura": é não saber. Apagar aqui
  // arriscaria exatamente a cobrança órfã que este bloco existe para evitar.
  if (assinatura && assinatura.error) {
    return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }
  if (assinatura && assinatura.stripe_subscription_id) {
    const r = await cancelarAssinaturaStripe(env, assinatura.stripe_subscription_id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }

  // MERCADO PAGO — mesma regra, mesmo motivo. O gateway de Pix/assinatura do OLLI
  // hoje é o MP (docs/MERCADOPAGO.md), e a assinatura recorrente dele (preapproval)
  // é cartão: continuava cobrando depois da conta apagada, porque este bloco só
  // conhecia a Stripe. Cobrança indevida contra alguém que nem tem mais conta para
  // reclamar — por isso é fail-closed igual à Stripe.
  const preapproval = await lerPreapprovalGravado(env, user.id);
  if (preapproval.error) return json({ ok: false, erro: 'falha_cancelamento' }, 502); // não sei ≠ não tem
  if (preapproval.ausente) {
    // A coluna mp_preapproval_id ainda não existe (migration 20260728 não aplicada).
    // Aqui NÃO dá para saber se há assinatura no MP — e travar a exclusão de todo
    // mundo seria pior (a Apple exige o caminho de exclusão, e nenhuma assinatura
    // recorrente do MP foi vendida antes desta migration: a rota /mp/plano/assinatura
    // não está exposta na UI). Segue, deixando rastro para o dono reconciliar.
    console.error('[olli-conta] mp_preapproval_id indisponível (migration 20260728?) — excluindo sem checar o MP:', user.id);
  } else if (preapproval.id) {
    const r = await cancelarPreapprovalMp(env, preapproval.id);
    if (r !== 'ok') return json({ ok: false, erro: 'falha_cancelamento' }, 502);
  }

  // Exclusão de verdade: apaga o usuário em auth.users (id vem do JWT validado).
  const ok = await excluirUsuarioAuth(env, user.id);
  if (!ok) return json({ ok: false, erro: 'falha_exclusao' }, 502);

  return json({ ok: true });
}

// ─── roteador das rotas /conta/* ─────────────────────────────
export const CONTA_ROUTES_PREFIX = '/conta/';

/**
 * Ponto de entrada único para qualquer path /conta/*. Chamado pelo index.js
 * (ver observações da Frente 2: o index.js precisa delegar /conta/ para cá,
 * exatamente como já faz com /stripe/ e /equipe/).
 */
export async function handleConta(request, env, url) {
  const path = url.pathname;

  if (path === '/conta/excluir') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST') return handleContaExcluir(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  return json({ erro: 'nao_encontrado' }, 404);
}
