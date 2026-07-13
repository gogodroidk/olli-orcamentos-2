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

async function rateOk(env, key) {
  if (!env.MP_RL) return true;
  try {
    const { success } = await env.MP_RL.limit({ key });
    return !!success;
  } catch {
    return true;
  }
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
    date_of_expiration: isoDaquiA(30),
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
  return json({ ok: true, url, preapprovalId: data.id || null });
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

/** Libera N meses de plano (Pix avulso), sem regredir nível nem vigência já paga. */
async function concederPlanoPeriodo(env, { userId, planoKey }) {
  const cfg = PLANO_PIX[planoKey];
  if (!cfg) return json({ ok: true, sem_vinculo: true });
  let plano = cfg.plano;
  let vigencia = isoMaisMeses(cfg.meses);
  const atual = await getAssinatura(env, userId);
  if (atual && !atual.error) {
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

// ── POST /mp/webhook ─────────────────────────────────────────
async function webhook(request, env, url) {
  const rawBody = await request.text();
  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* MP às vezes manda só query */ }

  // id do recurso (payment/preapproval): query `data.id` ou corpo, com fallback ao IPN antigo `id`.
  const dataId = url.searchParams.get('data.id') || (body.data && body.data.id) || url.searchParams.get('id');
  const tipo = body.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const requestId = request.headers.get('x-request-id') || request.headers.get('X-Request-Id') || '';
  const sig = request.headers.get('x-signature') || request.headers.get('X-Signature') || '';

  // Autenticidade: x-signature obrigatória (a defesa real). Sem secret configurado → recusa.
  const valido = await validarAssinatura(env, { sigHeader: sig, requestId, dataId });
  if (!valido) return json({ erro: 'assinatura_invalida' }, 401);
  if (!dataId) return json({ ok: true });

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
    if (kind === 'pl') return concederPlanoPeriodo(env, { userId, planoKey: key });
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
    const ativo = st === 'authorized';
    const proximo = data.next_payment_date || isoMaisMeses(1);
    const okDb = await upsertAssinatura(env, userId, {
      plano: cfg.plano,
      status: ativo ? 'active' : 'canceled',
      current_period_end: ativo ? proximo : (data.next_payment_date || null),
      stripe_subscription_id: null,
    });
    if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
    return json({ ok: true });
  }

  // Cobrança recorrente individual: apenas confirma que o ciclo pagou; a vigência
  // vem do preapproval. 200 sem ação evita reprocessar.
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
