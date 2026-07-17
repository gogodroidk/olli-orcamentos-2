/**
 * Pagamentos Pix AbacatePay — OLLI (worker Cloudflare, SEM SDK).
 *
 * O prestador compra CRÉDITOS OLLI por Pix. Toda conversa com a AbacatePay é
 * fetch direto na API REST v2 (api.abacatepay.com/v2), autenticada por Bearer
 * com env.ABACATEPAY_API_KEY (secret do worker, nunca vai ao app). O app só fala
 * com estas rotas usando o JWT do Supabase — mesmo modelo de segurança do Stripe.
 *
 *   GET  /abacate/pacotes  → catálogo de pacotes (fonte única de preço; público)
 *   POST /abacate/pix      → cria cobrança Pix; devolve { id, brCode, brCodeBase64 }
 *   GET  /abacate/status   → GET transparents/check?id= (polling de UX; fonte de
 *                            verdade é o webhook)
 *   POST /abacate/webhook  → evento pago → verifica secret(query)+HMAC → credita
 *
 * POR QUE v2 e não v1: a chave dev do OLLI é v2-only — o v1 `/pixQrCode/*`
 * responde 401 "API key version mismatch" (verificado ao vivo, jul/2026). Ver
 * docs/ABACATEPAY.md §1. Usamos `/v2/transparents/*` com `method:"PIX"`.
 *
 * SEGURANÇA DO CRÉDITO (inegociável): crédito NUNCA é otimista no cliente. Só o
 * WEBHOOK (após pagamento confirmado) chama lancarCreditos, com ref = id do EVENTO
 * (`log_…`) → o (origem,ref) único do ledger torna reenvio idempotente. O vínculo
 * com o usuário viaja em metadata.externalId (echoado no objeto da cobrança —
 * verificado ao vivo: o `check` NÃO devolve metadata, mas o objeto da cobrança sim).
 */
import { lancarCreditos } from './creditos.js';
import { rateOkSensivel } from './rateLimit.js';

const ABACATE_API = 'https://api.abacatepay.com/v2';

// Chave PÚBLICA FIXA da AbacatePay p/ o HMAC do webhook (não é segredo — é a mesma
// em toda a doc; ver docs/ABACATEPAY.md §5). É verificação COMPLEMENTAR: a defesa
// real de autenticidade é o `?webhookSecret=` (nosso e secreto) na query.
const ABACATE_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

/**
 * Catálogo de pacotes de créditos — FONTE ÚNICA de preço (o app lê via /pacotes,
 * não hardcoda). `amount` em centavos. Ajuste do dono mora só aqui.
 */
const PACOTES = {
  creditos_50: { id: 'creditos_50', nome: '50 créditos', creditos: 50, amount: 2490, descricao: 'OLLI · 50 créditos' },
  creditos_150: { id: 'creditos_150', nome: '150 créditos', creditos: 150, amount: 4990, descricao: 'OLLI · 150 créditos' },
  creditos_400: { id: 'creditos_400', nome: '400 créditos', creditos: 400, amount: 9990, descricao: 'OLLI · 400 créditos' },
};

// Contrato das rotas (o index.js roteia por startsWith('/abacate/'), mas o set
// documenta a superfície e serve para testes).
export const ABACATE_ROUTES = new Set(['/abacate/pacotes', '/abacate/pix', '/abacate/status', '/abacate/webhook']);

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

/** Aplica o ABACATE_RL por chave. true = pode seguir. Fail-open se o binding faltar. */
// FAIL-CLOSED (O2-18): rota de dinheiro — ver worker/src/rateLimit.js.
async function rateOk(env, key) {
  return rateOkSensivel(env, env.ABACATE_RL, key);
}

/** Comparação de strings em tempo constante (evita timing attack). */
function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── GET /abacate/pacotes — catálogo público (o app renderiza a partir daqui) ──
function listarPacotes() {
  const pacotes = Object.values(PACOTES).map((p) => ({
    id: p.id, nome: p.nome, creditos: p.creditos, amount: p.amount,
  }));
  return json({ ok: true, pacotes });
}

// ─── POST /abacate/pix — cria a cobrança Pix ─────────────────
async function criarPix(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!(await rateOk(env, user.id))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
  if (!env.ABACATEPAY_API_KEY) return json({ ok: false, erro: 'abacate_nao_configurado' }, 503);

  const body = await request.json().catch(() => ({}));
  const pacote = PACOTES[body && body.pacote];
  if (!pacote) return json({ ok: false, erro: 'pacote_invalido' }, 400);

  // pedidoId único → o externalId (que volta no webhook) vincula ao usuário e ao
  // pacote sem depender de tabela nova. ref de crédito é o id do EVENTO, não este.
  const pedidoId = crypto.randomUUID();
  const externalId = `olli:${user.id}:${pedidoId}:${pacote.id}`;

  let r;
  try {
    r = await fetch(`${ABACATE_API}/transparents/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PIX',
        data: {
          amount: pacote.amount,
          expiresIn: 3600,
          description: pacote.descricao.slice(0, 500),
          externalId,
          metadata: { externalId },
        },
      }),
    });
  } catch (e) {
    console.error('[olli-abacate] create fetch falhou:', e && (e.message || e));
    return json({ ok: false, erro: 'falha_criar_pix' }, 502);
  }
  const payload = await r.json().catch(() => ({}));
  const data = payload && payload.data;
  if (!r.ok || (payload && payload.error) || !data || !data.brCode) {
    console.error('[olli-abacate] create resposta ruim:', r.status, payload && payload.error);
    return json({ ok: false, erro: 'falha_criar_pix' }, 502);
  }

  return json({
    ok: true,
    id: data.id,
    brCode: data.brCode,
    brCodeBase64: data.brCodeBase64, // já é data:image/png;base64,…
    status: data.status || 'PENDING',
    expiresAt: data.expiresAt || null,
    pacote: { id: pacote.id, nome: pacote.nome, creditos: pacote.creditos, amount: pacote.amount },
  });
}

// ─── GET /abacate/status?id= — polling de UX ─────────────────
async function checarStatus(request, env, url) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!env.ABACATEPAY_API_KEY) return json({ ok: false, erro: 'abacate_nao_configurado' }, 503);

  const id = url.searchParams.get('id');
  if (!id) return json({ ok: false, erro: 'id_ausente' }, 400);
  if (!(await rateOk(env, `status:${user.id}`))) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);

  let r;
  try {
    r = await fetch(`${ABACATE_API}/transparents/check?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}` },
    });
  } catch {
    return json({ ok: false, erro: 'falha_status' }, 502);
  }
  const payload = await r.json().catch(() => ({}));
  const data = payload && payload.data;
  if (!r.ok || !data) return json({ ok: false, erro: 'falha_status' }, 502);
  // O enum tem 9 valores na v2; só PAID é "pago". Qualquer outro = ainda-não-pago.
  return json({ ok: true, status: data.status || 'PENDING', pago: data.status === 'PAID' });
}

// ─── verificação HMAC (complementar) ─────────────────────────
/** Verifica X-Webhook-Signature = base64(HMAC-SHA256(rawBody, PUBLIC_KEY)). */
async function verificarHmac(rawBody, sigHeader, publicKey) {
  if (!sigHeader || !publicKey) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(publicKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
    const esperado = btoa(String.fromCharCode(...new Uint8Array(macBuf)));
    return compararConstante(esperado, sigHeader.trim());
  } catch {
    return false;
  }
}

// ─── POST /abacate/webhook — evento pago → credita ───────────
async function webhook(request, env, url) {
  // Camada 1 (defesa REAL): o webhookSecret na query é NOSSO e secreto.
  const secretConfig = env.ABACATE_WEBHOOK_SECRET;
  if (!secretConfig || !compararConstante(url.searchParams.get('webhookSecret') || '', secretConfig)) {
    return json({ erro: 'nao_autorizado' }, 401);
  }

  const rawBody = await request.text();

  // Camada 2 (complementar): HMAC com a public key da doc. Loga se falhar, mas NÃO
  // bloqueia só por isso — a doc marca o esquema HMAC como incerto (chave pública
  // compartilhada). A barreira 1 já autenticou.
  const sig = request.headers.get('X-Webhook-Signature') || request.headers.get('x-webhook-signature');
  const hmacOk = await verificarHmac(rawBody, sig, ABACATE_PUBLIC_KEY);
  if (!hmacOk) console.error('[olli-abacate] webhook HMAC nao confere (seguindo pela camada 1)');

  let evt;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return json({ erro: 'payload_invalido' }, 400);
  }

  // Pix pago (v2): transparent.completed. Checkout hospedado: checkout.completed
  // (não usamos, mas tratamos como pago se aparecer). Qualquer outro → 200 sem ação.
  const pago = evt.event === 'transparent.completed' || evt.event === 'checkout.completed';
  if (!pago) return json({ ok: true });

  // A cobrança carrega o metadata.externalId (echoado — verificado ao vivo). Aceita
  // as duas formas de aninhamento por robustez.
  const cobranca = (evt.data && (evt.data.transparent || evt.data.checkout)) || evt.data || {};
  const ext =
    (cobranca.metadata && cobranca.metadata.externalId) ||
    cobranca.externalId ||
    (evt.data && evt.data.metadata && evt.data.metadata.externalId) ||
    '';
  const partes = String(ext).split(':'); // olli:<userId>:<pedidoId>:<pacoteKey>
  const userId = partes[0] === 'olli' ? partes[1] : null;
  const pacote = PACOTES[partes[3]];
  if (!userId || !pacote) {
    console.error('[olli-abacate] webhook sem vinculo utilizavel:', ext ? '(externalId presente, formato inesperado)' : '(sem externalId)');
    return json({ ok: true, sem_vinculo: true }); // 200: não adianta reenviar
  }

  // ref = id do EVENTO (log_…) → (origem,ref) único no ledger = idempotência real.
  // Sem event.id (não deveria faltar), cai num ref derivado do pedido (ainda único
  // por cobrança) para não perder o crédito.
  const ref = evt.id || `abacate:${partes[2] || cobranca.id || userId}`;
  const res = await lancarCreditos(env, {
    userId,
    delta: pacote.creditos,
    origem: 'pix',
    ref,
    descricao: pacote.descricao,
  });
  if (!res.ok) return json({ erro: 'falha_persistencia' }, 500); // 500 → AbacatePay reenvia
  return json({ ok: true, duplicado: res.duplicado });
}

// ─── roteador das rotas /abacate/* ───────────────────────────
export async function handleAbacate(request, env, url) {
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (p === '/abacate/pacotes' && request.method === 'GET') return listarPacotes();
  if (p === '/abacate/pix' && request.method === 'POST') return criarPix(request, env);
  if (p === '/abacate/status' && request.method === 'GET') return checarStatus(request, env, url);
  // Webhook: servidor-a-servidor (sem CORS/JWT; autentica por secret+HMAC).
  if (p === '/abacate/webhook' && request.method === 'POST') return webhook(request, env, url);

  if (ABACATE_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
