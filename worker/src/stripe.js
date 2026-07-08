/**
 * Pagamentos Stripe — OLLI (worker Cloudflare, SEM SDK).
 *
 * Toda conversa com a Stripe é fetch direto na API REST (api.stripe.com),
 * autenticada por HTTP Basic com env.STRIPE_SECRET_KEY (secret do worker, nunca
 * vai ao app). O app só fala com estas rotas usando o JWT do Supabase; nenhuma
 * chave Stripe existe no client — mesmo modelo de segurança do GEMINI_API_KEY.
 *
 *   POST /stripe/checkout  → cria Checkout Session (assinatura) e devolve { url }
 *   POST /stripe/webhook   → recebe eventos da Stripe (assinatura HMAC verificada
 *                            manualmente) e sincroniza public.assinaturas
 *   POST /stripe/portal    → cria sessão do Customer Portal e devolve { url }
 *   GET  /stripe/sucesso   → página "assinatura confirmada"
 *   GET  /stripe/cancelado → página "pagamento cancelado"
 *
 * Escrita no Supabase é sempre via SERVICE_ROLE (bypassa RLS) — o usuário só tem
 * SELECT da própria linha em public.assinaturas, então não consegue se auto-promover.
 */

// URLs de retorno do Checkout / Portal (o worker atende os dois subdomínios;
// usamos o de diagnóstico, que serve estas páginas de sucesso/cancelado).
const SUCESSO_URL = 'https://diagnostico.olliorcamentos.online/stripe/sucesso';
const CANCELADO_URL = 'https://diagnostico.olliorcamentos.online/stripe/cancelado';

const STRIPE_API = 'https://api.stripe.com/v1';

// Lookup keys dos Prices → plano interno. É a fonte da verdade de qual plano cada
// assinatura representa (o webhook lê lookup_key do price para não depender do
// price_id específico, que pode mudar entre test/live ou ganhar variantes anuais).
const LOOKUP_PARA_PLANO = {
  olli_pro_mensal: 'pro',
  olli_pro_anual: 'pro',
  olli_pro_12x: 'pro', // avulso 12x (mode=payment): dá acesso Pro por 12 meses
  olli_empresa_mensal: 'empresa',
  olli_empresa_anual: 'empresa',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

// Contrato único das rotas Stripe: o roteador do index.js valida contra este set.
// GET só vale para as páginas; POST só para as ações. O método separa os usos.
export const STRIPE_ROUTES = new Set([
  '/stripe/checkout',
  '/stripe/webhook',
  '/stripe/portal',
  '/stripe/sucesso',
  '/stripe/cancelado',
]);

// ─── helpers de resposta ─────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Mesma defesa em profundidade do link.js: CSP restritivo, tudo inline.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; base-uri 'none'; form-action 'none'",
    },
  });
}

// ─── auth do usuário (mesmo padrão de getUser no index.js) ────
/** Valida o JWT do Supabase em /auth/v1/user. Retorna o user ({id,email,...}) ou null. */
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

/** Lê a linha de assinatura do usuário. null se não houver; { error:true } em falha. */
async function getAssinatura(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=user_id,plano,status,stripe_customer_id,stripe_subscription_id,current_period_end&limit=1`,
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

/**
 * Upsert idempotente em public.assinaturas (on_conflict=user_id, merge-duplicates).
 * `patch` são só as colunas a gravar; user_id é sempre incluído para o merge.
 * Retorna true em sucesso, false em falha (o webhook usa isso para decidir o HTTP).
 */
async function upsertAssinatura(env, userId, patch) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/assinaturas?on_conflict=user_id`,
      {
        method: 'POST',
        headers: sbHeaders(env, {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify({ user_id: userId, ...patch, atualizado_em: new Date().toISOString() }),
      },
    );
    return r.ok;
  } catch {
    return false;
  }
}

// ─── chamada à API REST da Stripe (form-urlencoded, Basic auth) ──
/**
 * Codifica um objeto (com aninhamento estilo Stripe já achatado pelo chamador)
 * em application/x-www-form-urlencoded. Os chamadores passam as chaves já no
 * formato final da Stripe (ex.: 'line_items[0][price]').
 */
function encodeForm(fields) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    p.append(k, String(v));
  }
  return p.toString();
}

/** POST autenticado na Stripe. Retorna { ok, data } — data é o JSON (ou {} em erro). */
async function stripePost(env, path, fields) {
  // Basic auth: usuário = secret key, senha vazia → base64("sk_...:").
  const authBasic = 'Basic ' + btoa(`${env.STRIPE_SECRET_KEY}:`);
  const r = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authBasic,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodeForm(fields),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[olli-stripe] API', path, r.status, data && data.error && data.error.message);
    return { ok: false, data };
  }
  return { ok: true, data };
}

/** GET autenticado na Stripe (ex.: buscar a subscription completa). */
async function stripeGet(env, path) {
  const authBasic = 'Basic ' + btoa(`${env.STRIPE_SECRET_KEY}:`);
  const r = await fetch(`${STRIPE_API}${path}`, { headers: { Authorization: authBasic } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('[olli-stripe] GET', path, r.status, data && data.error && data.error.message);
    return { ok: false, data };
  }
  return { ok: true, data };
}

// ─── rate limit (namespace próprio das rotas Stripe) ─────────
/** Aplica o STRIPE_RL por chave. Retorna true se PODE seguir, false se estourou. */
async function rateOk(env, key) {
  if (!env.STRIPE_RL) return true; // binding ausente em algum ambiente: não bloqueia
  try {
    const { success } = await env.STRIPE_RL.limit({ key });
    return !!success;
  } catch {
    return true;
  }
}

// ─── extração de dados da subscription (robusto entre versões da API) ──
/**
 * current_period_end mudou de lugar entre versões da API Stripe: em versões
 * mais novas (2025+) ele vive no item da assinatura (items.data[0]), não mais
 * no topo. Lemos os dois lugares para não gravar null num ambiente e no outro não.
 * Retorna epoch (segundos) ou null.
 */
function periodEndEpoch(sub) {
  if (!sub || typeof sub !== 'object') return null;
  if (typeof sub.current_period_end === 'number') return sub.current_period_end;
  const item = sub.items && Array.isArray(sub.items.data) ? sub.items.data[0] : null;
  if (item && typeof item.current_period_end === 'number') return item.current_period_end;
  return null;
}

/** epoch (s) → ISO 8601, ou null. */
function epochParaIso(epoch) {
  if (typeof epoch !== 'number' || !isFinite(epoch)) return null;
  return new Date(epoch * 1000).toISOString();
}

/**
 * ISO de agora + N meses. setMonth transborda dias inexistentes para o mês
 * seguinte (31/jan +1 -> 3/mar); para +12 meses o desvio máximo é 1 dia
 * (29/fev -> 1/mar), aceitável para vigência de assinatura.
 */
function isoDaquiAMeses(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString();
}

/** lookup_key do primeiro item da subscription → plano interno ('pro'/'empresa') ou null. */
function planoDaSubscription(sub) {
  const item = sub && sub.items && Array.isArray(sub.items.data) ? sub.items.data[0] : null;
  const lookup = item && item.price ? item.price.lookup_key : null;
  return (lookup && LOOKUP_PARA_PLANO[lookup]) || null;
}

// ─── (1) POST /stripe/checkout ───────────────────────────────
export async function handleCheckout(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, erro: 'stripe_nao_configurado' }, 503);

  const body = await request.json().catch(() => ({}));
  const plano = body && body.plano;

  // Planos vendidos no checkout, cada um resolvido para price + modo de cobrança:
  //   pro           → assinatura mensal (R$ 39/mês)
  //   pro_anual     → assinatura anual à vista com -20% (R$ 374,40/ano)
  //   pro_12x       → AVULSO em mode=payment: valor cheio (R$ 468) parcelável em
  //                   12x sem juros no cartão. Não é subscription — o acesso Pro
  //                   dura 12 meses e é gravado pelo webhook (metadata.origem='12x').
  //   empresa       → assinatura mensal (R$ 99/mês)
  //   empresa_anual → assinatura anual com -20% (R$ 950,40/ano)
  const CONFIG_PLANO = {
    pro: { price: env.STRIPE_PRICE_PRO, planoInterno: 'pro', modo: 'subscription' },
    pro_anual: { price: env.STRIPE_PRICE_PRO_ANUAL, planoInterno: 'pro', modo: 'subscription' },
    pro_12x: { price: env.STRIPE_PRICE_PRO_12X, planoInterno: 'pro', modo: 'payment' },
    empresa: { price: env.STRIPE_PRICE_EMPRESA, planoInterno: 'empresa', modo: 'subscription' },
    empresa_anual: { price: env.STRIPE_PRICE_EMPRESA_ANUAL, planoInterno: 'empresa', modo: 'subscription' },
  };
  const config = CONFIG_PLANO[plano];
  if (!config) return json({ ok: false, erro: 'plano_invalido' }, 400);

  const price = config.price;
  if (!price) return json({ ok: false, erro: 'preco_nao_configurado' }, 503);

  // Reaproveita o customer se o usuário já assinou antes (mantém histórico e
  // método de pagamento no mesmo cliente Stripe, em vez de criar um novo).
  const existente = await getAssinatura(env, user.id);
  const customerId = existente && !existente.error ? existente.stripe_customer_id : null;

  const fields = {
    mode: config.modo,
    'line_items[0][price]': price,
    'line_items[0][quantity]': 1,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[plano]': config.planoInterno,
    success_url: SUCESSO_URL,
    cancel_url: CANCELADO_URL,
    allow_promotion_codes: 'true',
    locale: 'pt-BR',
  };

  if (config.modo === 'subscription') {
    // Propaga o user_id para o metadata da subscription — é dele que o webhook
    // (customer.subscription.updated/deleted) casa o evento com a linha certa.
    fields['subscription_data[metadata][user_id]'] = user.id;
  } else {
    // AVULSO 12x: SÓ cartão (parcelamento não existe em boleto/Pix; fixar o
    // método elimina o caminho de pagamento assíncrono e a autorização é
    // imediata, então payment_status='paid' já chega no checkout.completed).
    fields['payment_method_types[0]'] = 'card';
    // Habilita o parcelamento sem juros do cartão BR no Checkout e marca a
    // session como o fluxo de 12 meses para o webhook derivar plano/vigência.
    fields['payment_method_options[card][installments][enabled]'] = 'true';
    fields['metadata[origem]'] = '12x';
    fields['metadata[meses_acesso]'] = '12';
    // Guarda o pagamento no mesmo customer (histórico) quando ele já existe.
    fields['payment_intent_data[metadata][user_id]'] = user.id;
  }

  // Se já há customer, passamos customer=; senão, customer_email deixa a Stripe
  // criar o cliente sozinho (não pode mandar os dois juntos).
  if (customerId) {
    fields.customer = customerId;
  } else if (user.email) {
    fields.customer_email = user.email;
  }

  const { ok, data } = await stripePost(env, '/checkout/sessions', fields);
  if (!ok || !data || !data.url) return json({ ok: false, erro: 'falha_checkout' }, 502);
  return json({ ok: true, url: data.url });
}

// ─── (3) POST /stripe/portal ─────────────────────────────────
export async function handlePortal(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, erro: 'stripe_nao_configurado' }, 503);

  const assinatura = await getAssinatura(env, user.id);
  if (assinatura && assinatura.error) return json({ ok: false, erro: 'indisponivel' }, 503);
  const customerId = assinatura ? assinatura.stripe_customer_id : null;
  // Sem assinatura/cliente Stripe não há o que gerenciar → 404 amigável.
  if (!customerId) return json({ erro: 'sem_assinatura' }, 404);

  const { ok, data } = await stripePost(env, '/billing_portal/sessions', {
    customer: customerId,
    return_url: SUCESSO_URL,
  });
  if (!ok || !data || !data.url) return json({ ok: false, erro: 'falha_portal' }, 502);
  return json({ ok: true, url: data.url });
}

// ─── (2) POST /stripe/webhook ────────────────────────────────
/**
 * Verifica a assinatura HMAC-SHA256 do header Stripe-Signature.
 * Formato: t=<epoch>,v1=<hex>[,v1=<hex>...]. Reconstrói signedPayload = `${t}.${raw}`,
 * calcula o HMAC com STRIPE_WEBHOOK_SECRET e compara em tempo constante com algum v1.
 * Rejeita se |agora - t| > 300s (replay). Retorna true/false.
 */
async function verificarAssinatura(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  let t = null;
  const v1s = [];
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!t || !v1s.length) return false;

  // Janela de replay: 300s de tolerância.
  const ts = Number(t);
  if (!isFinite(ts)) return false;
  const agora = Math.floor(Date.now() / 1000);
  if (Math.abs(agora - ts) > 300) return false;

  // HMAC-SHA256(signedPayload) com o secret do webhook.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinado = `${t}.${rawBody}`;
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(assinado));
  const esperado = [...new Uint8Array(macBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparação em tempo constante contra cada v1 recebido (rotação de secret).
  for (const v1 of v1s) {
    if (compararConstante(esperado, v1)) return true;
  }
  return false;
}

/** Comparação de strings em tempo constante (evita timing attack). */
function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Grava/atualiza a assinatura a partir de um objeto subscription da Stripe.
 * `statusForcado` sobrescreve o status (ex.: 'canceled' no evento deleted).
 * Descobre o user_id pelo metadata da subscription (gravado na criação do checkout).
 */
async function sincronizarSubscription(env, sub, statusForcado) {
  if (!sub || typeof sub !== 'object') return true;
  const userId = sub.metadata && sub.metadata.user_id;
  if (!userId) {
    // Sem user_id no metadata não há como casar com a linha certa; ignora sem falhar
    // (não é erro de assinatura — só evento que não conseguimos atribuir).
    console.error('[olli-stripe] subscription sem metadata.user_id:', sub.id);
    return true;
  }
  const plano = planoDaSubscription(sub); // pode ser null se lookup_key desconhecida
  const status = statusForcado || sub.status || null;
  const novoPeriodo = periodEndEpoch(sub); // epoch (s) ou null

  // Proteção contra evento fora de ordem E contra regressão de vigência paga.
  // A Stripe não garante ordem de entrega, e um MESMO usuário pode ter tido mais
  // de uma assinatura (ex.: migrou da mensal para o 12x). Regras:
  //  (a) se a linha já está 'canceled', só reabrimos se o período deste evento
  //      for mais novo (um 'updated' atrasado não ressuscita um 'deleted' antigo);
  //  (b) se este evento vem de uma assinatura DIFERENTE da gravada e a vigência
  //      gravada é MAIS FUTURA que a deste evento, ignoramos — nunca deixar o
  //      'deleted' da mensal antiga encurtar o acesso 12x recém-comprado (R$468).
  const atual = await getAssinatura(env, userId);
  if (atual && !atual.error) {
    const gravadoEpoch = atual.current_period_end
      ? Math.floor(Date.parse(atual.current_period_end) / 1000)
      : null;

    if (atual.status === 'canceled' && !statusForcado) {
      const maisNovo =
        typeof novoPeriodo === 'number' &&
        (gravadoEpoch == null || novoPeriodo > gravadoEpoch);
      if (!maisNovo) return true; // (a)
    }

    const outraAssinatura = atual.stripe_subscription_id && atual.stripe_subscription_id !== (sub.id || null);
    const gravadoMaisFuturo =
      gravadoEpoch != null && (typeof novoPeriodo !== 'number' || gravadoEpoch > novoPeriodo);
    if (outraAssinatura && gravadoMaisFuturo) {
      // (b) evento de outra assinatura tentando encurtar uma vigência paga maior.
      console.error('[olli-stripe] ignorando evento de sub diferente que regrediria vigencia:', sub.id, '->', atual.stripe_subscription_id);
      return true;
    }
  }

  const patch = {
    status,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer && sub.customer.id) || null,
    stripe_subscription_id: sub.id || null,
    current_period_end: epochParaIso(novoPeriodo),
  };
  if (plano) patch.plano = plano; // só toca o plano quando reconhecemos o price
  return upsertAssinatura(env, userId, patch);
}

/**
 * Libera o acesso do Pro 12x (avulso, mode=payment) por N meses. Usado tanto no
 * checkout.session.completed (cartão, pago na hora) quanto no
 * checkout.session.async_payment_succeeded (meio assíncrono). Grava
 * stripe_subscription_id: null — o 12x NÃO é uma subscription, então nenhum
 * evento de subscription (deleted/updated) deve se casar com esta linha.
 */
async function processar12x(env, obj, evento) {
  const userId = (obj && obj.metadata && obj.metadata.user_id) || (obj && obj.client_reference_id) || null;
  if (!userId) {
    console.error('[olli-stripe] 12x session sem user_id:', obj && obj.id);
    return json({ ok: true, sem_user: true });
  }
  const mesesRaw = Number(obj.metadata && obj.metadata.meses_acesso);
  const meses = Number.isFinite(mesesRaw) && mesesRaw > 0 ? Math.floor(mesesRaw) : 12;
  const okDb = await upsertAssinatura(env, userId, {
    plano: 'pro',
    status: 'active',
    current_period_end: isoDaquiAMeses(meses),
    stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : (obj.customer && obj.customer.id) || null,
    stripe_subscription_id: null,
  });
  if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
  marcarEventoProcessado(evento && evento.id);
  return json({ ok: true });
}

// Dedup best-effort de eventos do webhook por `event.id`, em memória do
// isolate. A Stripe reenvia eventos que não recebem 200 (e pode reenviar em
// rajada mesmo com 200 se a latência de rede for alta); os upserts em si já
// são idempotentes no RESULTADO final (merge por user_id), mas isto evita
// reprocessar 2x um evento que chegou duplicado na mesma janela — sem exigir
// tabela nova. Não substitui idempotência real (é por isolate, não global),
// mas cobre o caso comum de retry imediato.
const EVENTOS_PROCESSADOS = new Map(); // event.id -> timestamp
const EVENTO_TTL_MS = 10 * 60 * 1000;

function eventoJaProcessado(id) {
  if (!id) return false;
  const limite = Date.now() - EVENTO_TTL_MS;
  for (const [k, t] of EVENTOS_PROCESSADOS) if (t < limite) EVENTOS_PROCESSADOS.delete(k);
  return EVENTOS_PROCESSADOS.has(id);
}

function marcarEventoProcessado(id) {
  if (!id) return;
  if (EVENTOS_PROCESSADOS.size > 1000) EVENTOS_PROCESSADOS.clear();
  EVENTOS_PROCESSADOS.set(id, Date.now());
}

export async function handleWebhook(request, env) {
  // RAW body ANTES de qualquer parse — a assinatura é calculada sobre ele.
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature') || request.headers.get('stripe-signature');

  const valido = await verificarAssinatura(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!valido) return json({ erro: 'assinatura_invalida' }, 400);

  let evento;
  try {
    evento = JSON.parse(rawBody);
  } catch {
    return json({ erro: 'payload_invalido' }, 400);
  }

  const tipo = evento && evento.type;
  const obj = evento && evento.data ? evento.data.object : null;

  // Evento já visto nesta janela: responde 200 sem reprocessar (idempotência
  // best-effort — ver comentário acima do cache).
  if (evento && eventoJaProcessado(evento.id)) return json({ ok: true, duplicado: true });

  try {
    if (tipo === 'checkout.session.completed') {
      // A session traz pouca coisa da assinatura; buscamos a subscription completa
      // (com items/price/period) para gravar plano e vigência corretos.
      const subId = obj && (typeof obj.subscription === 'string' ? obj.subscription : obj.subscription && obj.subscription.id);
      // user_id pode vir do metadata da session ou do client_reference_id.
      const userId =
        (obj && obj.metadata && obj.metadata.user_id) || (obj && obj.client_reference_id) || null;

      // AVULSO 12x (mode=payment): não há subscription. Só gravamos o acesso se o
      // pagamento realmente foi concluído (payment_status='paid') — parcelado no
      // cartão a autorização é imediata, então 'paid' já chega neste evento.
      const eh12x = obj && obj.metadata && obj.metadata.origem === '12x';
      if (eh12x) {
        if (obj.payment_status && obj.payment_status !== 'paid') {
          // Ainda não pago (fluxo assíncrono): não libera agora — o acesso é
          // liberado pelo checkout.session.async_payment_succeeded (tratado abaixo).
          console.error('[olli-stripe] 12x session ainda nao paga (aguarda async):', obj.id);
          return json({ ok: true, pendente: true });
        }
        return processar12x(env, obj, evento);
      }

      if (subId) {
        const { ok, data: sub } = await stripeGet(env, `/subscriptions/${encodeURIComponent(subId)}`);
        if (ok) {
          // Garante o metadata.user_id mesmo que a subscription tenha vindo sem ele
          // (a session é a fonte confiável do vínculo com o usuário logado).
          if (userId && (!sub.metadata || !sub.metadata.user_id)) {
            sub.metadata = { ...(sub.metadata || {}), user_id: userId };
          }
          const okDb = await sincronizarSubscription(env, sub);
          if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
        } else {
          return json({ erro: 'falha_stripe' }, 502);
        }
      } else if (userId && obj && obj.customer) {
        // Fluxo raro (sem subscription na session): grava ao menos o customer.
        const okDb = await upsertAssinatura(env, userId, {
          stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : null,
        });
        if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
      }
    } else if (tipo === 'checkout.session.async_payment_succeeded') {
      // Pagamento assíncrono do 12x concluído depois: libera o acesso agora.
      if (obj && obj.metadata && obj.metadata.origem === '12x') {
        return processar12x(env, obj, evento);
      }
    } else if (tipo === 'customer.subscription.updated') {
      const okDb = await sincronizarSubscription(env, obj);
      if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
    } else if (tipo === 'customer.subscription.deleted') {
      const okDb = await sincronizarSubscription(env, obj, 'canceled');
      if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
    } else if (tipo === 'invoice.payment_failed') {
      // Marca como past_due sem cortar acesso na hora (carência via Stripe retries).
      // Casa o user_id via metadata da subscription referenciada na fatura.
      const subId = obj && (typeof obj.subscription === 'string' ? obj.subscription : obj.subscription && obj.subscription.id);
      if (subId) {
        const { ok, data: sub } = await stripeGet(env, `/subscriptions/${encodeURIComponent(subId)}`);
        if (ok) {
          const okDb = await sincronizarSubscription(env, sub, sub.status || 'past_due');
          if (!okDb) return json({ erro: 'falha_persistencia' }, 500);
        }
        // Se não conseguimos buscar a subscription, não falhamos o webhook: a
        // Stripe reenviará; e updated/deleted futuros corrigem o status.
      }
    }
    // Eventos não tratados: 200 (a Stripe só precisa saber que recebemos).
  } catch (e) {
    console.error('[olli-stripe] webhook falhou:', e && (e.message || e));
    // 500 → a Stripe reenvia. Upserts são idempotentes, então reenvio é seguro.
    // NÃO marca como processado: queremos que o reenvio da Stripe seja tentado de novo.
    return json({ erro: 'falha_interna' }, 500);
  }

  // Só marca como processado depois do sucesso — assim uma falha (acima) deixa
  // o evento livre para reprocessar no próximo reenvio da Stripe.
  marcarEventoProcessado(evento && evento.id);
  return json({ ok: true });
}

// ─── (4) páginas GET /stripe/sucesso e /stripe/cancelado ─────
function pagina(emoji, titulo, sub, tomOk = true) {
  const accent = tomOk ? '#15B66E' : '#C0392B';
  const grad = tomOk ? '#0B6FCE' : '#8A93A2';
  return html(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>${esc(titulo)} · OLLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EAEEF3;color:#1A2230;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 14px}
  .wrap{max-width:440px;width:100%}
  .card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.14)}
  .hd{background:linear-gradient(140deg,${grad},#0A2540);height:8px}
  .body{padding:40px 30px 34px;text-align:center}
  .emoji{font-size:52px;line-height:1}
  .title{font-family:'Spectral',Georgia,serif;font-size:24px;font-weight:700;margin-top:16px;color:${accent}}
  .sub{font-size:15px;color:#5A6575;margin-top:12px;line-height:1.55}
  .hint{margin-top:26px;font-size:13px;color:#8A93A2;background:#F6F8FB;border:1px solid #EDEFF2;border-radius:14px;padding:14px 16px;line-height:1.5}
  .foot{text-align:center;font-size:12px;color:#9AA3B2;margin-top:20px;font-weight:600}
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="hd"></div>
      <div class="body">
        <div class="emoji">${emoji}</div>
        <div class="title">${esc(titulo)}</div>
        <div class="sub">${sub}</div>
        <div class="hint">Pode fechar esta janela e voltar para o app OLLI. Suas informações são atualizadas automaticamente.</div>
      </div>
    </div>
    <div class="foot">OLLI · o escritório de bolso do prestador</div>
  </div>
</body>
</html>`);
}

export function renderSucesso() {
  return pagina(
    '✅',
    'Assinatura confirmada!',
    'Deu tudo certo com o seu pagamento. Volte ao app OLLI — seus recursos do plano já estão liberados.',
    true,
  );
}

export function renderCancelado() {
  return pagina(
    '↩️',
    'Pagamento cancelado',
    'Nada foi cobrado. Você pode assinar quando quiser, direto pelo app OLLI.',
    false,
  );
}

// ─── roteador das rotas /stripe/* ────────────────────────────
/**
 * Ponto de entrada único chamado pelo index.js para qualquer path /stripe/*.
 * Trata o método por rota e devolve 404/405 coerentes. Mantido aqui para o
 * index.js só precisar delegar sem conhecer os detalhes de cada rota.
 */
export async function handleStripe(request, env, url) {
  const path = url.pathname;

  // Páginas (GET público, sem auth).
  if (path === '/stripe/sucesso') {
    if (request.method === 'GET') return renderSucesso();
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }
  if (path === '/stripe/cancelado') {
    if (request.method === 'GET') return renderCancelado();
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  // Ações (POST).
  if (path === '/stripe/checkout') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST') return handleCheckout(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }
  if (path === '/stripe/portal') {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST') return handlePortal(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }
  if (path === '/stripe/webhook') {
    // Sem OPTIONS/CORS: a Stripe fala servidor-a-servidor, não browser.
    if (request.method === 'POST') return handleWebhook(request, env);
    return json({ erro: 'metodo_nao_suportado' }, 405);
  }

  return json({ erro: 'nao_encontrado' }, 404);
}
