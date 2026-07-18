/**
 * Pagamentos Mercado Pago — OLLI (worker Cloudflare, SEM SDK).
 *
 * Gateway ÚNICO do OLLI (decisão jul/2026, ver docs/MERCADOPAGO.md e
 * docs/PESQUISA_GATEWAY_PRECOS.md): o AbacatePay travou para novos usuários e o
 * InfinitePay não estava disponível; o dono já tem conta no Mercado Pago. Cobre:
 *
 *   GET  /mp/pacotes          → catálogo de créditos (fonte única de preço; público)
 *   POST /mp/pix              → cobrança Pix de CRÉDITOS; devolve QR + copia-e-cola
 *   POST /mp/plano/pix        → cobrança Pix de um PERÍODO de plano (avulso, N meses)
 *   POST /mp/plano/assinatura → assinatura recorrente (Preapproval, cartão) → init_point
 *   GET  /mp/status           → status de um pagamento (polling de UX)
 *   POST /mp/webhook          → evento pago/assinatura → credita / libera plano
 *
 * REGRAS (verificadas na doc oficial do MP, jul/2026):
 *  - Pix: POST /v1/payments com payment_method_id:"pix". `transaction_amount` em
 *    REAIS (decimal), NÃO centavos. QR em point_of_interaction.transaction_data.
 *  - Webhook: valida x-signature (HMAC-SHA256 do manifest
 *    `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), DEPOIS GET /v1/payments/{id}
 *    para confirmar status:"approved". A notificação só manda o id — a verdade vem
 *    do GET, não do corpo.
 *  - Recorrência é SÓ CARTÃO (Preapproval); Pix não recorre. Para "plano por Pix"
 *    usamos pagamento avulso que libera N meses (mesmo modelo do Pro 12x da Stripe).
 *
 * SEGURANÇA DO CRÉDITO/PLANO (inegociável): nunca otimista no cliente. Só o WEBHOOK
 * (após confirmar o pagamento via GET) concede — ref = id do pagamento (idempotência
 * via (origem,ref) único no ledger; upsert por user_id nas assinaturas).
 */
import { lancarCreditos } from './creditos.js';
import { cabeNoTeto, checarLimite, deixaPassar, rateOkSensivel, TETO, textoCabeNoTeto } from './rateLimit.js';
import { upsertAssinatura, getAssinatura } from './stripe.js';

const MP_API = 'https://api.mercadopago.com';

// URL pública do próprio worker (para notification_url e back_url do MP).
const WORKER_BASE = 'https://diagnostico.olliorcamentos.online';

// ── catálogos (fonte única de preço) ─────────────────────────
// Créditos: `amount` em CENTAVOS (convertido p/ reais na chamada ao MP). Mesma
// tabela de produção do abacate.js — margem provada (ver docs/PESQUISA_GATEWAY_PRECOS.md).
const PACOTES = {
  creditos_50: { id: 'creditos_50', nome: '50 créditos', creditos: 50, amount: 2490 },
  creditos_150: { id: 'creditos_150', nome: '150 créditos', creditos: 150, amount: 4990 },
  creditos_400: { id: 'creditos_400', nome: '400 créditos', creditos: 400, amount: 9990 },
};

// Plano por PIX (avulso, libera N meses). Valores em REAIS. Anual = -20% (igual Stripe).
const PLANO_PIX = {
  pro_mensal: { id: 'pro_mensal', plano: 'pro', meses: 1, valor: 39.0, nome: 'OLLI Pro · 1 mês' },
  pro_anual: { id: 'pro_anual', plano: 'pro', meses: 12, valor: 374.4, nome: 'OLLI Pro · 1 ano' },
  empresa_mensal: { id: 'empresa_mensal', plano: 'empresa', meses: 1, valor: 99.0, nome: 'OLLI Empresa · 1 mês' },
  empresa_anual: { id: 'empresa_anual', plano: 'empresa', meses: 12, valor: 950.4, nome: 'OLLI Empresa · 1 ano' },
};

// Assinatura recorrente (Preapproval, cartão). Valor mensal em REAIS.
const PLANO_ASSINATURA = {
  pro: { id: 'pro', plano: 'pro', valorMensal: 39.0, nome: 'OLLI Pro' },
  empresa: { id: 'empresa', plano: 'empresa', valorMensal: 99.0, nome: 'OLLI Empresa' },
};

const NIVEL_PLANO = { gratis: 0, pro: 1, empresa: 2 };

export const MP_ROUTES = new Set([
  '/mp/pacotes', '/mp/pix', '/mp/plano/pix', '/mp/plano/assinatura', '/mp/status', '/mp/webhook',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id,email}) ou null. */
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

// FAIL-CLOSED (O2-18): rota de dinheiro (Pix) — ver worker/src/rateLimit.js.
async function rateOk(env, key) {
  return rateOkSensivel(env, env.MP_RL, key);
}

/** Comparação de strings em tempo constante (evita timing attack). */
function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ISO 8601 com offset explícito (+00:00) daqui a `min` minutos — MP aceita e é inequívoco. */
function isoDaquiA(min) {
  const d = new Date(Date.now() + min * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.000+00:00`;
}

/** ISO de agora + N meses (para vigência de plano pago por Pix). */
function isoMaisMeses(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString();
}

// ── chamadas ao MP ───────────────────────────────────────────
async function mpPost(env, path, body, idemKey) {
  const headers = {
    Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (idemKey) headers['X-Idempotency-Key'] = idemKey;
  const r = await fetch(`${MP_API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) console.error('[olli-mp] POST', path, r.status, data && (data.message || data.error));
  return { ok: r.ok, status: r.status, data };
}

async function mpGet(env, path) {
  const r = await fetch(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) console.error('[olli-mp] GET', path, r.status);
  return { ok: r.ok, status: r.status, data };
}

// ── GET /mp/pacotes ──────────────────────────────────────────
function listarPacotes() {
  const pacotes = Object.values(PACOTES).map((p) => ({ id: p.id, nome: p.nome, creditos: p.creditos, amount: p.amount }));
  return json({ ok: true, pacotes });
}

// ── POST /mp/pix — Pix de CRÉDITOS ───────────────────────────
async function criarPixCredito(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  if (!env.MP_ACCESS_TOKEN) return json({ ok: false, erro: 'mp_nao_configurado' }, 503);

  const body = await request.json().catch(() => ({}));
  const pacote = PACOTES[body && body.pacote];
  if (!pacote) return json({ ok: false, erro: 'pacote_invalido' }, 400);

  const pedidoId = crypto.randomUUID();
  const externalRef = `olli:cr:${user.id}:${pedidoId}:${pacote.id}`;
  const res = await criarPagamentoPix(env, {
    valorReais: pacote.amount / 100,
    descricao: `OLLI ${pacote.nome}`,
    email: user.email,
    externalRef,
    itemId: pacote.id,
  });
  if (!res.ok) return json({ ok: false, erro: 'falha_criar_pix' }, 502);
  return json({ ok: true, ...res.pix, pacote: { id: pacote.id, nome: pacote.nome, creditos: pacote.creditos, amount: pacote.amount } });
}

// ── POST /mp/plano/pix — Pix de um PERÍODO de plano (avulso) ──
async function criarPixPlano(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  if (!env.MP_ACCESS_TOKEN) return json({ ok: false, erro: 'mp_nao_configurado' }, 503);

  const body = await request.json().catch(() => ({}));
  const plano = PLANO_PIX[body && body.plano];
  if (!plano) return json({ ok: false, erro: 'plano_invalido' }, 400);

  const pedidoId = crypto.randomUUID();
  const externalRef = `olli:pl:${user.id}:${pedidoId}:${plano.id}`;
  const res = await criarPagamentoPix(env, {
    valorReais: plano.valor,
    descricao: plano.nome,
    email: user.email,
    externalRef,
    itemId: plano.id,
  });
  if (!res.ok) return json({ ok: false, erro: 'falha_criar_pix' }, 502);
  return json({ ok: true, ...res.pix, plano: { id: plano.id, nome: plano.nome, meses: plano.meses } });
}

/** Cria um pagamento Pix no MP e extrai o QR. Retorna { ok, pix:{ id, brCode, brCodeBase64, status, expiresAt } }.
 *  Envia os campos que a "medição de qualidade" do MP avalia (email, external_reference,
 *  notification_url, additional_info.items, statement_descriptor) — melhora o índice de
 *  aprovação e é o que a homologação exige. */
async function criarPagamentoPix(env, { valorReais, descricao, email, externalRef, itemId }) {
  const valor = Number(valorReais.toFixed(2));
  const { ok, data } = await mpPost(env, '/v1/payments', {
    transaction_amount: valor,
    description: descricao,
    payment_method_id: 'pix',
    payer: { email: email || 'sem-email@olliorcamentos.online' },
    external_reference: externalRef,
    notification_url: `${WORKER_BASE}/mp/webhook`,
    // MP exige date_of_expiration >= agora+30min (o mínimo do Pix). Marcar EXATAMENTE
    // 30min corre risco de o MP recusar por latência de rede/desvio de relógio (o valor
    // chega < 30min no relógio DELE) — o usuário veria "falha_criar_pix". 60min sai da
    // borda com folga e ainda dá tempo real de abrir o app do banco e pagar.
    date_of_expiration: isoDaquiA(60),
    statement_descriptor: 'OLLI',
    additional_info: {
      items: [{
        id: itemId || 'olli',
        title: descricao,
        description: descricao,
        category_id: 'services',
        quantity: 1,
        unit_price: valor,
      }],
    },
  }, crypto.randomUUID());
  const td = data && data.point_of_interaction && data.point_of_interaction.transaction_data;
  if (!ok || !td || !td.qr_code) return { ok: false };
  return {
    ok: true,
    pix: {
      id: String(data.id),
      brCode: td.qr_code,
      brCodeBase64: td.qr_code_base64 ? `data:image/png;base64,${td.qr_code_base64}` : '',
      ticketUrl: td.ticket_url || null,
      status: data.status || 'pending',
      expiresAt: data.date_of_expiration || null,
    },
  };
}

// ── POST /mp/plano/assinatura — recorrente (Preapproval, cartão) ──
async function criarAssinatura(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  if (!env.MP_ACCESS_TOKEN) return json({ ok: false, erro: 'mp_nao_configurado' }, 503);
  if (!user.email) return json({ ok: false, erro: 'sem_email' }, 400);

  const body = await request.json().catch(() => ({}));
  const plano = PLANO_ASSINATURA[body && body.plano];
  if (!plano) return json({ ok: false, erro: 'plano_invalido' }, 400);

  // Sem card_token_id → status 'pending' → MP devolve init_point (checkout hospedado,
  // o usuário informa o cartão na página do MP; o worker nunca toca em dados de cartão).
  const externalRef = `olli:as:${user.id}:${plano.id}`;
  const { ok, data } = await mpPost(env, '/preapproval', {
    reason: plano.nome,
    external_reference: externalRef,
    payer_email: user.email,
    back_url: `${WORKER_BASE}/stripe/sucesso`,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: plano.valorMensal,
      currency_id: 'BRL',
    },
  });
  const url = data && (data.init_point || data.sandbox_init_point);
  if (!ok || !url) return json({ ok: false, erro: 'falha_assinatura' }, 502);

  // Persistir o id JÁ na criação (best-effort) encurta a janela em que existe uma
  // preapproval que ninguém consegue cancelar: se o usuário autorizar o cartão e o
  // webhook não chegar, o id ainda estará aqui na hora de excluir a conta.
  // Só grava quando NÃO há id gravado — sobrescrever apagaria a referência da
  // assinatura que está cobrando hoje, que é justamente o que precisamos cancelar.
  if (data.id) await guardarPreapprovalSeVazio(env, user.id, String(data.id));

  return json({ ok: true, url, preapprovalId: data.id || null });
}

/**
 * Grava o mp_preapproval_id na linha existente do usuário SE ainda não houver um.
 * PATCH (não upsert) de propósito: se o usuário ainda não tem linha em
 * `assinaturas`, não é hora de criar uma — a linha nasce quando o pagamento é
 * confirmado, no webhook. Best-effort: qualquer falha (inclusive a coluna ainda
 * não existir) só vira log; criar a assinatura não pode falhar por causa disto.
 */
async function guardarPreapprovalSeVazio(env, userId, preapprovalId) {
  const gravado = await lerPreapprovalGravado(env, userId);
  if (gravado.error || gravado.ausente || gravado.id) return; // não sabemos, não dá, ou já tem
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ mp_preapproval_id: preapprovalId }),
      },
    );
    if (!r.ok) console.error('[olli-mp] não consegui guardar mp_preapproval_id na criação:', r.status, userId);
  } catch (e) {
    console.error('[olli-mp] erro ao guardar mp_preapproval_id:', e && (e.message || e));
  }
}

/**
 * Cancela a assinatura recorrente no Mercado Pago (PUT /preapproval/{id} com
 * status 'cancelled'). Devolve 'ok' | 'erro'.
 *
 * Mesmo contrato de `cancelarAssinaturaStripe` (worker/src/conta.js), de propósito:
 * quem chama BLOQUEIA a exclusão da conta em 'erro' — apagar o usuário com a
 * preapproval viva deixa o cartão sendo cobrado sem ninguém para cancelar. E, como
 * lá, "já estava cancelada" é 'ok': senão quem cancelou pelo app do MP nunca mais
 * conseguiria excluir a conta.
 *
 * Exportada (não copiada dentro de conta.js) porque a regra de cancelamento do MP
 * é UMA só; duas cópias foi como o guard do getAssinatura já virou código morto.
 */
export async function cancelarPreapprovalMp(env, preapprovalId) {
  if (!preapprovalId) return 'ok'; // nada a cancelar
  if (!env.MP_ACCESS_TOKEN) return 'erro'; // há o que cancelar e não podemos: falha
  try {
    const r = await fetch(`${MP_API}/preapproval/${encodeURIComponent(preapprovalId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (r.ok || r.status === 404) return 'ok'; // 404 = não existe mais no MP

    // O que importa não é se a chamada teve efeito, e sim se a assinatura está
    // cancelada ao final: pergunta o estado real antes de bloquear a exclusão.
    const g = await mpGet(env, `/preapproval/${encodeURIComponent(preapprovalId)}`);
    if (g.status === 404) return 'ok';
    if (g.ok && g.data && g.data.status === 'cancelled') return 'ok';

    console.error('[olli-mp] cancelar preapproval falhou:', r.status, preapprovalId);
    return 'erro';
  } catch (e) {
    console.error('[olli-mp] cancelar preapproval erro:', e && (e.message || e));
    return 'erro';
  }
}

// ── GET /mp/status?id= — polling de UX ───────────────────────
async function checarStatus(request, env, url) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!env.MP_ACCESS_TOKEN) return json({ ok: false, erro: 'mp_nao_configurado' }, 503);
  const id = url.searchParams.get('id');
  if (!id) return json({ ok: false, erro: 'id_ausente' }, 400);
  if (!(await rateOk(env, `status:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  const { ok, data } = await mpGet(env, `/v1/payments/${encodeURIComponent(id)}`);
  if (!ok || !data) return json({ ok: false, erro: 'falha_status' }, 502);
  // POSSE: o pagamento tem que ser DESTE usuário (external_reference olli:<cr|pl>:<userId>:…).
  // Sem isso qualquer conta autenticada consultaria o status de pagamentos alheios — os ids do
  // MP são sequenciais — e poderia tatear ids de plano aprovados p/ tentar replay no webhook.
  const partes = String(data.external_reference || '').split(':');
  if (partes[0] !== 'olli' || partes[2] !== user.id) return json({ ok: false, erro: 'nao_encontrado' }, 404);
  return json({ ok: true, status: data.status || 'pending', pago: data.status === 'approved' });
}

// ── verificação da assinatura do webhook (x-signature) ───────
/**
 * Valida x-signature do MP: manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
 * HMAC-SHA256 (hex) com MP_WEBHOOK_SECRET, comparado a v1 em tempo constante.
 * Se o id for alfanumérico o MP manda em minúsculas — normalizamos.
 */
async function validarAssinatura(env, { sigHeader, requestId, dataId }) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret || !sigHeader || !dataId) return false;
  let ts = null;
  let v1 = null;
  for (const parte of sigHeader.split(',')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === 'ts') ts = v;
    else if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;
  const idNorm = String(dataId).toLowerCase();
  const manifest = `id:${idNorm};request-id:${requestId || ''};ts:${ts};`;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
    const esperado = [...new Uint8Array(macBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return compararConstante(esperado, v1);
  } catch {
    return false;
  }
}

// ── concessões (só após confirmação) ─────────────────────────
async function concederCredito(env, { userId, pacoteKey, paymentId }) {
  const pacote = PACOTES[pacoteKey];
  if (!pacote) return json({ ok: true, sem_vinculo: true });
  const res = await lancarCreditos(env, {
    userId, delta: pacote.creditos, origem: 'pix', ref: `mp:${paymentId}`, descricao: `OLLI ${pacote.nome}`,
  });
  if (!res.ok) return json({ erro: 'falha_persistencia' }, 500);
  return json({ ok: true, duplicado: res.duplicado });
}

/**
 * Libera N meses de plano (Pix avulso). IDEMPOTENTE POR REPLAY: a vigência é
 * DETERMINÍSTICA a partir da DATA DE APROVAÇÃO do pagamento (não de 'agora'), então
 * reenviar o mesmo webhook (o MP reenvia até receber 200; e /mp/webhook é público)
 * produz a MESMA vigência → o `preserva maior` não estende nada. Sem isso, um único
 * Pix de R$39 viraria acesso perpétuo bastando repetir a chamada.
 * (Empilhar 2 Pix curtos credita ~o maior, não a soma — borda aceitável; o pacote
 * anual já entrega 12 meses num pagamento só.) Preserva nível/vigência maiores já pagos.
 */
async function concederPlanoPeriodo(env, { userId, planoKey, dataAprovacao }) {
  const cfg = PLANO_PIX[planoKey];
  if (!cfg) return json({ ok: true, sem_vinculo: true });
  const atual = await getAssinatura(env, userId);
  // 3 estados: erro de leitura (indisponível) NÃO decide regressão às cegas → 5xx p/ o MP reenviar.
  if (atual && atual.error) return json({ erro: 'indisponivel' }, 503);

  let plano = cfg.plano;
  const base = dataAprovacao ? new Date(dataAprovacao) : new Date();
  const dv = new Date(base);
  dv.setMonth(dv.getMonth() + cfg.meses);
  let vigencia = Number.isNaN(dv.getTime()) ? isoMaisMeses(cfg.meses) : dv.toISOString();

  if (atual) { // null = sem assinatura (segue normal)
    const ativa = atual.status && !['canceled', 'unpaid', 'incomplete_expired'].includes(atual.status)
      && atual.current_period_end && new Date(atual.current_period_end).getTime() > Date.now();
    if (ativa) {
      if ((NIVEL_PLANO[atual.plano] || 0) > (NIVEL_PLANO[plano] || 0)) plano = atual.plano; // preserva nível maior
      if (new Date(atual.current_period_end).getTime() > new Date(vigencia).getTime()) vigencia = atual.current_period_end; // preserva vigência maior
    }
  }
  const okDb = await upsertAssinatura(env, userId, {
    plano, status: 'active', current_period_end: vigencia, stripe_subscription_id: null,
  });
  if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
  return json({ ok: true });
}

/**
 * Mesmo upsert de `upsertAssinatura` (stripe.js), mas devolvendo o STATUS http em
 * vez de só um booleano. `upsertAssinatura` é compartilhada com o fluxo da Stripe
 * (stripe.js) e não dá pra mudar o contrato dela por causa de UM chamador — então
 * duplicamos a chamada crua aqui, só onde o status importa (ver
 * upsertAssinaturaComPreapproval logo abaixo).
 */
async function upsertAssinaturaComStatus(env, userId, patch) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?on_conflict=user_id`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ user_id: userId, ...patch, atualizado_em: new Date().toISOString() }),
      },
    );
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * Guarda o id da preapproval (assinatura recorrente) na linha de `assinaturas`.
 * É o dado que permite CANCELAR a cobrança do cartão depois — sem ele, excluir a
 * conta deixava o cartão sendo cobrado para sempre (ver worker/src/conta.js).
 *
 * Tolerante à coluna ainda não existir: se a migration 20260728 não tiver sido
 * aplicada, o PostgREST rejeita a coluna desconhecida (400/404 — mesmo critério de
 * `lerPreapprovalGravado`) e o upsert com o campo falharia. Nesse caso, e SÓ nesse
 * caso, repetimos o upsert SEM o campo: o plano é liberado (o que o usuário pagou)
 * e só o cancelamento futuro fica pendente, com log.
 *
 * QUALQUER OUTRO status (5xx, rede fora) NÃO cai nesse fallback: antes caía, porque
 * `upsertAssinatura` só devolvia um booleano e a falha transitória ficava
 * indistinguível de "coluna ausente" — a regravação sem o campo então TINHA SUCESSO
 * (a coluna existe de verdade) e o mp_preapproval_id se perdia PARA SEMPRE, mesmo a
 * coluna existindo. É o mesmo padrão de "erro vira vazio": `handleContaExcluir`
 * (worker/src/conta.js) lê `{ id: null }` depois — indistinguível de "nunca teve
 * assinatura no cartão" — e apaga a conta sem cancelar uma cobrança que segue viva.
 * Agora falha de verdade devolve false: o webhook responde 500 e o MP reenvia, sem
 * mascarar a perda do vínculo.
 */
async function upsertAssinaturaComPreapproval(env, userId, patch, preapprovalId) {
  if (preapprovalId) {
    const r = await upsertAssinaturaComStatus(env, userId, { ...patch, mp_preapproval_id: preapprovalId });
    if (r.ok) return true;
    if (r.status !== 400 && r.status !== 404) {
      console.error('[olli-mp] upsert com mp_preapproval_id falhou (não é coluna ausente — não mascarando, webhook pede reenvio):', r.status, userId);
      return false;
    }
    console.error('[olli-mp] upsert com mp_preapproval_id falhou (coluna ausente, migration 20260728) — regravando sem o campo:', userId);
  }
  return upsertAssinatura(env, userId, patch);
}

/**
 * Lê o mp_preapproval_id gravado. TRÊS estados, porque quem chama decide se pode
 * TIRAR o plano de alguém:
 *   { id }        → sabemos qual assinatura sustenta o plano (id pode ser null)
 *   { ausente:true} → a coluna ainda não existe (migration não aplicada)
 *   { error:true } → não deu para ler (rede/PostgREST fora)
 * Só o primeiro estado permite AFIRMAR que um evento se refere ao plano vigente.
 */
export async function lerPreapprovalGravado(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=mp_preapproval_id&limit=1`,
      { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
    );
    // 400/404 aqui é o PostgREST dizendo que a coluna não existe (schema antigo).
    if (r.status === 400 || r.status === 404) return { ausente: true };
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return { id: arr.length ? arr[0].mp_preapproval_id || null : null };
  } catch {
    return { error: true };
  }
}

/**
 * Evento de preapproval que NÃO é 'authorized' (pending, paused, cancelled, ou
 * qualquer status novo do MP). REGRA: evento que não prova o suficiente NÃO reduz
 * direito — responde 200 e não escreve.
 *
 * O que havia aqui antes escrevia `status:'canceled'`, `plano: cfg.plano` e
 * `current_period_end: null` para QUALQUER status diferente de authorized. O caso
 * ruim não era teórico: `criarAssinatura` cria a preapproval com `status:'pending'`
 * (é assim que o MP devolve o init_point), e o MP notifica essa criação. Ou seja,
 * bastava um usuário que já tinha Pro pago por Pix TOCAR em "assinar" para perder
 * na hora o plano que pagou, sem ter pago nada de novo. 'paused' e 'cancelled' de
 * uma preapproval antiga/alheia faziam o mesmo estrago.
 *
 * Agora só encerramos quando as duas coisas são verdade:
 *   (a) o status é 'cancelled' — término definitivo, não 'pending'/'paused', que
 *       são estados de trânsito e podem voltar a 'authorized';
 *   (b) a preapproval do evento é COMPROVADAMENTE a que sustenta o plano gravado
 *       (mp_preapproval_id bate). Sem essa prova — id diferente, coluna ainda
 *       inexistente, leitura falhou — o evento pode ser de uma assinatura velha
 *       enquanto o plano vigente veio de um Pix; não reduz.
 * E mesmo aí: se o período PAGO ainda está correndo, não escrevemos nada. A
 * vigência expira sozinha (o app já trata `current_period_end` vencido como
 * grátis), então o usuário usa até o fim do que pagou e cai sozinho depois —
 * ninguém precisa "cortar" nada. Deixar de reduzir custa, no pior caso, algumas
 * semanas de acesso; reduzir errado tira o plano de quem pagou.
 */
async function encerrarPreapproval(env, { userId, preapprovalId, status }) {
  if (status !== 'cancelled') return json({ ok: true, sem_efeito: true }); // (a)

  const atual = await getAssinatura(env, userId);
  if (atual && atual.error) return json({ erro: 'indisponivel' }, 503); // 5xx → MP reenvia
  if (!atual) return json({ ok: true, sem_efeito: true }); // nada gravado: nada a reduzir

  const gravado = await lerPreapprovalGravado(env, userId);
  if (gravado.error) return json({ erro: 'indisponivel' }, 503);
  if (gravado.ausente || !gravado.id || gravado.id !== preapprovalId) { // (b)
    console.error('[olli-mp] cancelamento de preapproval sem vínculo provado com o plano vigente — não reduz:', preapprovalId, userId);
    return json({ ok: true, sem_efeito: true });
  }

  const pagoAteFuturo = atual.current_period_end
    && new Date(atual.current_period_end).getTime() > Date.now();
  if (pagoAteFuturo) {
    console.error('[olli-mp] assinatura cancelada no MP, mas o período pago ainda corre — mantém até', atual.current_period_end);
    return json({ ok: true, mantido_ate_fim: true });
  }

  // Período já vencido: registrar o encerramento não tira nada de ninguém.
  // `current_period_end` é PRESERVADO (histórico do que foi pago), nunca zerado.
  const okDb = await upsertAssinatura(env, userId, { status: 'canceled' });
  if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
  return json({ ok: true });
}

// ── POST /mp/webhook ─────────────────────────────────────────
async function webhook(request, env, url) {
  // TETO DE PAYLOAD (B1/O2-18) — mesmo padrão do handleWebhook da Stripe (ver
  // worker/src/stripe.js e worker/src/rateLimit.js): rejeita pelo Content-Length
  // ANTES de bufferizar (a rota é pública, só a x-signature protege, e validá-la
  // exige ler o corpo inteiro primeiro); depois confere o tamanho REAL em bytes
  // (pega quem mentiu no header ou usou chunked). Notificação do MP é minúscula
  // (só data.id/type); 128 KB é folga enorme.
  const teto = cabeNoTeto(request, TETO.WEBHOOK);
  if (!teto.ok) return json({ erro: 'payload_grande' }, 413);
  const rawBody = await request.text();
  if (!textoCabeNoTeto(rawBody, TETO.WEBHOOK)) return json({ erro: 'payload_grande' }, 413);
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* MP às vezes manda só query */ }

  // id do recurso (payment/preapproval): query `data.id` ou corpo, com fallback ao IPN antigo `id`.
  const dataId = url.searchParams.get('data.id') || (body.data && body.data.id) || url.searchParams.get('id');
  const tipo = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const requestId = request.headers.get('x-request-id') || request.headers.get('X-Request-Id') || '';
  const sig = request.headers.get('x-signature') || request.headers.get('X-Signature') || '';

  // Autenticidade em DUAS camadas:
  //  (1) x-signature (HMAC): defesa de borda. Se MP_WEBHOOK_SECRET está configurado,
  //      EXIGE assinatura válida (401 no que não bater); enquanto não está, seguimos.
  //  (2) confirmação via GET /v1/payments|/preapproval (abaixo): a barreira AUTORITATIVA —
  //      só concede se a própria API do MP confirmar 'approved'/'authorized'. Não dá para
  //      forjar um pagamento aprovado no MP nem injetar um external_reference alheio, então
  //      o crédito é seguro mesmo sem a camada 1. Configure o secret para ter as duas.
  let assinado = false;
  if (env.MP_WEBHOOK_SECRET) {
    const valido = await validarAssinatura(env, { sigHeader: sig, requestId, dataId });
    if (!valido) return json({ erro: 'assinatura_invalida' }, 401);
    assinado = true;
  } else {
    console.error('[olli-mp] MP_WEBHOOK_SECRET ausente — validando so por GET-confirm (configure o secret p/ a camada de assinatura).');
  }
  if (!dataId) return json({ ok: true });

  // TETO DE AMPLIFICAÇÃO — só no caminho NÃO ASSINADO (hoje: MP_WEBHOOK_SECRET
  // ausente, o estado real de produção).
  //
  // A FALHA CONCRETA que isto fecha: sem secret configurado, esta rota é pública e
  // sem teto, e cada POST `?data.id=<qualquer>&type=payment` faz o worker chamar
  // `GET https://api.mercadopago.com/v1/payments/<qualquer>` com o MP_ACCESS_TOKEN
  // de PRODUÇÃO. Um estranho, sem nenhuma credencial, dispara chamadas ilimitadas
  // à API do MP em nome do dono — e quem leva o rate limit / bloqueio do MP é o
  // token do dono. Quando o MP começa a recusar, o GET-confirm passa a falhar e o
  // Pix pago do cliente PARA de virar crédito. Não é gasto de terceiro: é o
  // caminho de confirmação de pagamento sendo derrubado de fora.
  //
  // POR QUE 429 AQUI É SEGURO (e por que não é fail-closed): o MP reenvia em
  // qualquer resposta fora do 2xx, então um falso positivo se resolve sozinho no
  // reenvio — nenhum pagamento se perde. Já um limiter FORA não pode derrubar
  // webhook de dinheiro (perder o evento é pior que a amplificação), por isso
  // `sensivel:false`: 'indisponivel' PASSA, exatamente como IA_RL/LINK_RL.
  //
  // Some sozinho quando o dono configurar o MP_WEBHOOK_SECRET: tráfego assinado
  // não passa por aqui.
  if (!assinado) {
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    const estado = await checarLimite(env.MPHOOK_RL, `mphook:${ip}`);
    if (!deixaPassar(estado, { sensivel: false })) {
      return json({ erro: 'muitas_requisicoes' }, 429);
    }
  }

  // PAGAMENTO (Pix de crédito ou de período de plano).
  if (tipo === 'payment') {
    const { ok, data } = await mpGet(env, `/v1/payments/${encodeURIComponent(dataId)}`);
    if (!ok || !data) return json({ erro: 'falha_consulta' }, 502); // 5xx → MP reenvia
    if (data.status !== 'approved') return json({ ok: true, status: data.status }); // pendente/recusado: 200, nada a fazer
    const ext = String(data.external_reference || '');
    const partes = ext.split(':'); // olli:<cr|pl>:<userId>:<pedido>:<key>
    if (partes[0] !== 'olli') return json({ ok: true, sem_vinculo: true });
    const kind = partes[1];
    const userId = partes[2];
    const key = partes[4];
    if (!userId) return json({ ok: true, sem_vinculo: true });
    if (kind === 'cr') return concederCredito(env, { userId, pacoteKey: key, paymentId: String(data.id) });
    if (kind === 'pl') return concederPlanoPeriodo(env, { userId, planoKey: key, dataAprovacao: data.date_approved || data.date_created });
    return json({ ok: true, sem_vinculo: true });
  }

  // ASSINATURA recorrente (Preapproval) — status é a fonte da verdade.
  if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
    const { ok, data } = await mpGet(env, `/preapproval/${encodeURIComponent(dataId)}`);
    if (!ok || !data) return json({ erro: 'falha_consulta' }, 502);
    const ext = String(data.external_reference || '');
    const partes = ext.split(':'); // olli:as:<userId>:<planoKey>
    if (partes[0] !== 'olli' || partes[1] !== 'as') return json({ ok: true, sem_vinculo: true });
    const userId = partes[2];
    const cfg = PLANO_ASSINATURA[partes[3]];
    if (!userId || !cfg) return json({ ok: true, sem_vinculo: true });
    const st = data.status; // pending | authorized | paused | cancelled
    const preapprovalId = String(data.id || dataId);

    // Só 'authorized' CONCEDE. Qualquer outro status vai para o caminho que não
    // reduz direito sem prova (ver encerrarPreapproval) — antes, tudo que não
    // fosse authorized apagava o plano vigente, inclusive o 'pending' da própria
    // criação da assinatura.
    if (st !== 'authorized') return encerrarPreapproval(env, { userId, preapprovalId, status: st });

    let plano = cfg.plano;
    let vigencia = data.next_payment_date || isoMaisMeses(1);
    // Guard nível/vigência (igual concederPlanoPeriodo e o sincronizarSubscription da Stripe):
    // uma assinatura de nível MENOR não rebaixa um plano MAIOR já pago e vigente.
    const atual = await getAssinatura(env, userId);
    if (atual && atual.error) return json({ erro: 'indisponivel' }, 503); // 5xx → MP reenvia
    if (atual) {
      const ativaAtual = atual.status && !['canceled', 'unpaid', 'incomplete_expired'].includes(atual.status)
        && atual.current_period_end && new Date(atual.current_period_end).getTime() > Date.now();
      if (ativaAtual) {
        if ((NIVEL_PLANO[atual.plano] || 0) > (NIVEL_PLANO[plano] || 0)) plano = atual.plano;
        if (new Date(atual.current_period_end).getTime() > new Date(vigencia).getTime()) vigencia = atual.current_period_end;
      }
    }
    // Grava o id da preapproval junto: é ele que permite cancelar a cobrança do
    // cartão na exclusão de conta, e é a prova de vínculo que um cancelamento
    // futuro precisa exibir para poder encerrar este plano.
    const okDb = await upsertAssinaturaComPreapproval(env, userId, {
      plano, status: 'active', current_period_end: vigencia, stripe_subscription_id: null,
    }, preapprovalId);
    if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
    return json({ ok: true });
  }

  // Cobrança recorrente individual (renovação mensal do cartão). Hoje é no-op: a
  // assinatura por cartão (Preapproval) ainda NÃO está exposta na UI — nenhum
  // preapproval é criado em produção. QUANDO for ligada, aqui deve buscar o
  // preapproval relacionado e avançar current_period_end (TODO). 200 evita reenvio.
  if (tipo === 'subscription_authorized_payment') return json({ ok: true });

  return json({ ok: true }); // qualquer outro evento: 200
}

// ── roteador ─────────────────────────────────────────────────
export async function handleMercadoPago(request, env, url) {
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (p === '/mp/pacotes' && request.method === 'GET') return listarPacotes();
  if (p === '/mp/pix' && request.method === 'POST') return criarPixCredito(request, env);
  if (p === '/mp/plano/pix' && request.method === 'POST') return criarPixPlano(request, env);
  if (p === '/mp/plano/assinatura' && request.method === 'POST') return criarAssinatura(request, env);
  if (p === '/mp/status' && request.method === 'GET') return checarStatus(request, env, url);
  if (p === '/mp/webhook' && request.method === 'POST') return webhook(request, env, url);

  if (MP_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
