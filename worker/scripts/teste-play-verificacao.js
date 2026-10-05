/**
 * Teste do PLAY BILLING DIRETO no worker (worker/src/play.js + googleAuth.js).
 *
 *     node worker/scripts/teste-play-verificacao.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita o roteador REAL (`handlePlay`), o RTDN por pull (`processarRtdn`), a
 * reconciliação (`reconciliarPlay`) e o cancelamento da exclusão de conta
 * (`cancelarPlayDoUsuario`) contra FALSOS em memória (fetch trocado):
 *  - Supabase: auth, `assinaturas`, `webhook_events` (índice único → 409) e
 *    `play_compras` (índice único em token_sha256 → 409);
 *  - Google: endpoint OAuth que CONFERE a assinatura RS256 do JWT com a chave
 *    pública de um par gerado aqui (a chave privada vai no PLAY_SA_JSON falso),
 *    `subscriptionsv2.get/cancel`, `acknowledge`, `voidedpurchases` e o Pub/Sub.
 *
 * O que está trancado aqui (R19 da auditoria de segurança + §6 do billing-mapa):
 *  1. KILL SWITCH: PLAY_BILLING_MODE=off ou sem credencial → /play/config diz
 *     ligado:false e /play/verificar responde 503. Nunca modo demo.
 *  2. PORTÃO: JWT, rate limit fail-closed, corpo ≤ 8 KB, regex do token, catálogo.
 *  3. COMPRA VÁLIDA: concede, grava play_compras, e SÓ DEPOIS reconhece.
 *  4. CONTA ERRADA (obfuscated de outro), TOKEN REUSADO (409), PRODUTO FORA DO
 *     CATÁLOGO, COMPRA DE TESTE sem permissão: nada é concedido.
 *  5. RTDN: duplicado tem um efeito só; ack no Pub/Sub só depois de gravar; Google
 *     fora = sem ack (reentrega) e sem mexer no plano.
 *  6. ERRO 5xx DO GOOGLE NÃO REBAIXA; EXPIRAÇÃO REBAIXA (com vínculo).
 *  7. Convivência com Pix/Stripe (núcleo herdado do revenuecat.js).
 *  8. Exclusão de conta cancela a renovação pela API v2.
 *  9. Nenhum log carrega purchaseToken nem access token; o token no KV é cifrado.
 * 10. CONTRATO ÚNICO app↔worker: o pedido é montado pela função DO APP
 *     (`corpoVerificacaoPlay`) e a resposta é lida pela função DO APP
 *     (`interpretarVerificacaoPlay`), as duas de src/services/playBillingRegras.ts,
 *     contra o `handlePlay` REAL. Se um lado mudar o formato sozinho, isto quebra.
 */
import { createHash } from 'node:crypto';
import {
  cancelarPlayDoUsuario,
  handlePlay,
  processarRtdn,
  reconciliarPlay,
  tarefaPlayDoCron,
  traduzirAssinaturaPlay,
} from '../src/play.js';
import { limparCacheTokenGoogle } from '../src/googleAuth.js';
import { corpoVerificacaoPlay, interpretarVerificacaoPlay } from '../../src/services/playBillingRegras.ts';

let falhas = 0;
let passes = 0;

function checar(nome, real, esperado) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const DIA = 864e5;
const AGORA = Date.now();
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const OUTRO = '0a1b2c3d-4e5f-4a6b-9c7d-8e9f01234567';
const PACOTE = 'online.olliorcamentos.app';
const ASSINATURA_PUBSUB = 'projects/claude-motor/subscriptions/olli-play-rtdn-worker';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const HASH_USER = sha(USER);
const HASH_OUTRO = sha(OUTRO);

// ── par RSA de verdade: a chave privada vai no PLAY_SA_JSON falso ──
const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey));
const PEM = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const SA_EMAIL = 'olli-play-verify@claude-motor.iam.gserviceaccount.com';
const PLAY_SA_JSON = JSON.stringify({ type: 'service_account', client_email: SA_EMAIL, private_key: PEM, private_key_id: 'kid-teste-1' });
const ACCESS_TOKEN = 'ya29.access-token-falso-NUNCA-NO-LOG';
/** O que o OAuth falso emite e o que as APIs falsas aceitam (troca = token revogado). */
let tokenEmitido = ACCESS_TOKEN;
let tokenAceito = ACCESS_TOKEN;

// ── estado dos falsos ────────────────────────────────────────
const db = { assinaturas: new Map(), eventos: new Map(), compras: new Map() };
const google = { subs: new Map(), falhaGet: null, falhaCancel: null, voided: [], acks: [], cancels: [], tokenCalls: 0, jwtsInvalidos: 0 };
const pubsub = { fila: [], acks: [], pulls: 0 };
let linhaDoTempo = []; // ordem dos efeitos que importam (gravar → ack)
let logs = [];
const kv = new Map();

function reset({ linha = null } = {}) {
  db.assinaturas = new Map();
  db.eventos = new Map();
  db.compras = new Map();
  if (linha) db.assinaturas.set(linha.user_id, { ...linha });
  google.subs = new Map();
  google.falhaGet = null;
  google.falhaCancel = null;
  google.voided = [];
  google.acks = [];
  google.cancels = [];
  pubsub.fila = [];
  pubsub.acks = [];
  linhaDoTempo = [];
  logs = [];
}

const logOriginalErr = console.error;
const logOriginal = console.log;
console.error = (...args) => { logs.push(args.map(String).join(' ')); };
const logSilencioso = (...args) => {
  const t = args.map(String).join(' ');
  if (t.startsWith('[olli-')) logs.push(t);
  else logOriginal(...args);
};
console.log = logSilencioso;

const resp = (obj, status = 200) =>
  new Response(obj === null ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function filtros(u) {
  const out = {};
  for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) out[k] = v.slice(3);
  return out;
}

const b64urlBytes = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

async function tokenGoogleFalso(init) {
  google.tokenCalls++;
  const corpo = new URLSearchParams(init.body);
  const jwt = corpo.get('assertion') || '';
  const [h, p, s] = jwt.split('.');
  let valido = false;
  try {
    const cab = JSON.parse(Buffer.from(h, 'base64url').toString());
    const cl = JSON.parse(Buffer.from(p, 'base64url').toString());
    const assinaturaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', par.publicKey, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    valido =
      assinaturaOk &&
      cab.alg === 'RS256' &&
      cab.kid === 'kid-teste-1' &&
      cl.iss === SA_EMAIL &&
      cl.aud === 'https://oauth2.googleapis.com/token' &&
      cl.scope.split(' ').includes('https://www.googleapis.com/auth/androidpublisher') &&
      cl.scope.split(' ').includes('https://www.googleapis.com/auth/pubsub') &&
      cl.exp - cl.iat <= 3600 &&
      corpo.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer';
  } catch {
    valido = false;
  }
  if (!valido) {
    google.jwtsInvalidos++;
    return resp({ error: 'invalid_grant' }, 400);
  }
  return resp({ access_token: tokenEmitido, expires_in: 3599, token_type: 'Bearer' });
}

/** Predicado da reconciliação, lido do próprio filtro `and=` que o worker monta. */
function casaReconciliacao(c, u) {
  const filtro = u.searchParams.get('and') || '';
  const ate48h = /expiry\.lt\."([^"]+)"/.exec(filtro)?.[1];
  const umaHora = /verificado_em\.lt\."([^"]+)"/.exec(filtro)?.[1];
  const finais = (u.searchParams.get('estado') || '').replace(/^not\.in\.\(|\)$/g, '').split(',');
  if (finais.includes(c.estado)) return false;
  const sensiveis = ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_PENDING'];
  const precisa = (c.expiry && Date.parse(c.expiry) < Date.parse(ate48h)) || sensiveis.includes(c.estado) || c.ack === false;
  const velha = !c.verificado_em || Date.parse(c.verificado_em) < Date.parse(umaHora);
  return precisa && velha;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const metodo = init.method || 'GET';
  const f = filtros(u);
  const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';

  // ── Google OAuth ──
  if (u.href === 'https://oauth2.googleapis.com/token') return tokenGoogleFalso(init);

  // ── Google Play Developer API ──
  if (u.hostname === 'androidpublisher.googleapis.com') {
    if (auth !== `Bearer ${tokenAceito}`) return resp({ error: 'unauthenticated' }, 401);
    const base = `/androidpublisher/v3/applications/${PACOTE}/purchases/`;
    if (!u.pathname.startsWith(base)) return resp({ error: 'pacote' }, 404);
    const resto = decodeURIComponent(u.pathname.slice(base.length));
    if (resto === 'voidedpurchases') return resp({ voidedPurchases: google.voided });
    let m = /^subscriptionsv2\/tokens\/([^:]+)(:cancel)?$/.exec(resto);
    if (m) {
      const token = m[1];
      if (m[2]) {
        google.cancels.push({ token, corpo: JSON.parse(init.body) });
        if (google.falhaCancel) return resp({ error: 'x' }, google.falhaCancel);
        const s = google.subs.get(token);
        if (s) s.lineItems.forEach((i) => { i.autoRenewingPlan = { autoRenewEnabled: false }; });
        return resp(null, 200);
      }
      if (google.falhaGet) return resp({ error: 'x' }, google.falhaGet);
      const s = google.subs.get(token);
      return s ? resp(structuredClone(s)) : resp({ error: 'not found' }, 404);
    }
    m = /^subscriptions\/([^/]+)\/tokens\/([^:]+):acknowledge$/.exec(resto);
    if (m && metodo === 'POST') {
      linhaDoTempo.push('ack_play');
      google.acks.push({ produto: m[1], token: m[2] });
      const s = google.subs.get(m[2]);
      if (s) s.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
      return resp(null, 200);
    }
    throw new Error(`Google falso não sabe: ${metodo} ${resto}`);
  }

  // ── Pub/Sub ──
  if (u.hostname === 'pubsub.googleapis.com') {
    if (auth !== `Bearer ${tokenAceito}`) return resp({ error: 'unauthenticated' }, 401);
    const corpo = JSON.parse(init.body || '{}');
    if (u.pathname === `/v1/${ASSINATURA_PUBSUB}:pull`) {
      pubsub.pulls++;
      // Como o Pub/Sub real (04/10/2026): com returnImmediately o pull pode voltar
      // VAZIO mesmo com fila — o mock devolve vazio sempre, para pegar a regressão.
      if (corpo.returnImmediately) return resp({});
      if (pubsub.pendurar) throw new DOMException('pull sem mensagem', 'TimeoutError');
      return resp({ receivedMessages: pubsub.fila.slice(0, corpo.maxMessages) });
    }
    if (u.pathname === `/v1/${ASSINATURA_PUBSUB}:acknowledge`) {
      linhaDoTempo.push('ack_pubsub');
      pubsub.acks.push(...corpo.ackIds);
      pubsub.fila = pubsub.fila.filter((m) => !corpo.ackIds.includes(m.ackId));
      return resp({});
    }
    throw new Error(`Pub/Sub falso não sabe: ${u.pathname}`);
  }

  // ── Supabase ──
  if (u.pathname === '/auth/v1/user') {
    const m = /^Bearer jwt-(.+)$/.exec(auth);
    return m ? resp({ id: m[1], email: 'x@y.z' }) : resp({ msg: 'invalid' }, 401);
  }

  if (u.pathname === '/rest/v1/webhook_events') {
    if (metodo === 'POST') {
      const linha = JSON.parse(init.body);
      const chave = `${linha.origem}|${linha.event_id}`;
      if (db.eventos.has(chave)) return resp({ code: '23505' }, 409);
      db.eventos.set(chave, { ...linha });
      return resp(null, 201);
    }
    const chave = `${f.origem}|${f.event_id}`;
    if (metodo === 'PATCH') {
      const e = db.eventos.get(chave);
      if (e) Object.assign(e, JSON.parse(init.body));
      return resp(null, 204);
    }
    const e = db.eventos.get(chave);
    return resp(e ? [{ status: e.status }] : []);
  }

  if (u.pathname === '/rest/v1/assinaturas') {
    if (metodo === 'GET') {
      const l = db.assinaturas.get(f.user_id);
      return resp(l ? [{ ...l }] : []);
    }
    if (metodo === 'POST') {
      const patch = JSON.parse(init.body);
      linhaDoTempo.push('grava_assinatura');
      db.assinaturas.set(patch.user_id, { ...(db.assinaturas.get(patch.user_id) || {}), ...patch });
      return resp(null, 201);
    }
    if (metodo === 'PATCH') {
      const patch = JSON.parse(init.body);
      linhaDoTempo.push('grava_assinatura');
      const l = db.assinaturas.get(f.user_id);
      if (l && l.revenuecat_transacao_id === f.revenuecat_transacao_id) Object.assign(l, patch);
      return resp(null, 204);
    }
  }

  if (u.pathname === '/rest/v1/play_compras') {
    if (metodo === 'GET') {
      let linhas = [...db.compras.values()];
      if (f.token_sha256) linhas = linhas.filter((c) => c.token_sha256 === f.token_sha256);
      if (f.user_id) linhas = linhas.filter((c) => c.user_id === f.user_id);
      if (u.searchParams.has('and')) linhas = linhas.filter((c) => casaReconciliacao(c, u));
      return resp(linhas.map((c) => ({ ...c })));
    }
    if (metodo === 'POST') {
      const linha = JSON.parse(init.body);
      if (db.compras.has(linha.token_sha256)) return resp({ code: '23505' }, 409);
      linhaDoTempo.push('grava_compra');
      db.compras.set(linha.token_sha256, { ack: false, teste: false, ...linha });
      return resp(null, 201);
    }
    if (metodo === 'PATCH') {
      const c = db.compras.get(f.token_sha256);
      if (!c || c.user_id !== f.user_id) return resp([]);
      linhaDoTempo.push('grava_compra');
      Object.assign(c, JSON.parse(init.body));
      return resp([{ ...c }]);
    }
  }
  throw new Error(`fetch falso não sabe responder por ${metodo} ${u.pathname}`);
};

const RL_LIVRE = { limit: async () => ({ success: true }) };
const envBase = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  SUPABASE_ANON_KEY: 'anon-falso',
  PLAY_SA_JSON,
  PLAY_BILLING_MODE: 'on',
  PLAY_PACKAGE_NAME: PACOTE,
  PLAY_PUBSUB_SUBSCRIPTION: ASSINATURA_PUBSUB,
  PLAY_TESTE_PERMITIDOS: '',
  PLAY_RL: RL_LIVRE,
  CACHE: {
    get: async (k) => kv.get(k) ?? null,
    put: async (k, v) => { kv.set(k, v); },
    delete: async (k) => { kv.delete(k); },
  },
};

let seqToken = 0;
const novoToken = () => `tokenplay.${String(++seqToken).padStart(4, '0')}-AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789`;

/** SubscriptionPurchaseV2 falso. */
function sub({
  estado = 'SUBSCRIPTION_STATE_ACTIVE',
  produto = 'olli_pro',
  base = 'mensal',
  expira = AGORA + 30 * DIA,
  conta = HASH_USER,
  ack = 'ACKNOWLEDGEMENT_STATE_PENDING',
  teste = false,
  linked,
  outOfApp,
} = {}) {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    regionCode: 'BR',
    subscriptionState: estado,
    acknowledgementState: ack,
    ...(conta ? { externalAccountIdentifiers: { obfuscatedExternalAccountId: conta } } : {}),
    ...(teste ? { testPurchase: {} } : {}),
    ...(linked ? { linkedPurchaseToken: linked } : {}),
    ...(outOfApp ? { outOfAppPurchaseContext: outOfApp } : {}),
    lineItems: [
      {
        productId: produto,
        expiryTime: new Date(expira).toISOString(),
        autoRenewingPlan: { autoRenewEnabled: estado === 'SUBSCRIPTION_STATE_ACTIVE' },
        offerDetails: { basePlanId: base },
        latestSuccessfulOrderId: 'GPA.3311-2222-3333-44444..2',
      },
    ],
  };
}

async function chamar(caminho, { metodo = 'POST', corpo, env = envBase, user = USER, bruto, semAuth = false } = {}) {
  const texto = bruto ?? (corpo === undefined ? undefined : JSON.stringify(corpo));
  const headers = { 'Content-Type': 'application/json' };
  if (!semAuth) headers.Authorization = `Bearer jwt-${user}`;
  if (texto !== undefined) headers['Content-Length'] = String(new TextEncoder().encode(texto).length);
  const alvo = `https://diagnostico.olliorcamentos.online${caminho}`;
  const req = new Request(alvo, { method: metodo, headers, body: metodo === 'GET' ? undefined : texto });
  const r = await handlePlay(req, env, new URL(alvo));
  return { status: r.status, body: await r.json() };
}

/** Pedido montado pela função DO APP (o mesmo `JSON.stringify` do playBillingWorker.ts). */
const corpoDoApp = (token, produto) => {
  const [productId, basePlanId] = String(produto).split(':');
  return corpoVerificacaoPlay({ purchaseToken: token, productId, basePlanId: basePlanId ?? null });
};
const verificar = (token, produto = 'olli_pro:mensal', opts = {}) =>
  chamar('/play/verificar', { corpo: corpoDoApp(token, produto), ...opts });
/** Resposta lida pela função DO APP. */
const doApp = (r) => interpretarVerificacaoPlay(r.status, r.body);

/** Mensagem do RTDN no formato do Pub/Sub (data = DeveloperNotification em base64). */
let seqMsg = 0;
function mensagem(notificacao, { messageId } = {}) {
  seqMsg++;
  const id = messageId ?? `msg-${seqMsg}`;
  return {
    ackId: `ack-${seqMsg}`,
    message: {
      messageId: id,
      data: Buffer.from(JSON.stringify({ version: '1.0', packageName: PACOTE, eventTimeMillis: String(AGORA), ...notificacao })).toString('base64'),
    },
  };
}
const notifAssinatura = (token, tipo = 2) => ({ subscriptionNotification: { version: '1.0', notificationType: tipo, purchaseToken: token } });

const linhaDe = (id = USER) => db.assinaturas.get(id) || null;
const compraDe = (token) => db.compras.get(sha(token)) || null;
const naMinuto = (minuto, hora = new Date(AGORA).getUTCHours()) => {
  const d = new Date(AGORA);
  d.setUTCHours(hora, minuto, 0, 0);
  return d;
};
/** Hora UTC dos testes de cron: a atual, menos 05h (05:23 é a varredura de anuladas). */
const HORA_TESTE = new Date(AGORA).getUTCHours() === 5 ? 6 : new Date(AGORA).getUTCHours();
const R27 = naMinuto(23, HORA_TESTE);

try {
  console.log('\n1) KILL SWITCH — desligado diz que está desligado');
  reset();
  {
    checar('on + credencial → ligado:true', (await chamar('/play/config', { metodo: 'GET' })).body, { ok: true, ligado: true });
    checar('PLAY_BILLING_MODE=off → ligado:false', (await chamar('/play/config', { metodo: 'GET', env: { ...envBase, PLAY_BILLING_MODE: 'off' } })).body.ligado, false);
    checar('sem PLAY_SA_JSON → ligado:false', (await chamar('/play/config', { metodo: 'GET', env: { ...envBase, PLAY_SA_JSON: undefined } })).body.ligado, false);
    checar('PLAY_SA_JSON malformado → ligado:false', (await chamar('/play/config', { metodo: 'GET', env: { ...envBase, PLAY_SA_JSON: '{"client_email":"x"}' } })).body.ligado, false);
    const t = novoToken();
    google.subs.set(t, sub());
    const semCred = await verificar(t, 'olli_pro:mensal', { env: { ...envBase, PLAY_SA_JSON: undefined } });
    checar('verificar sem credencial → 503 play_nao_configurado', [semCred.status, semCred.body.erro], [503, 'play_nao_configurado']);
    checar('...nada gravado', db.compras.size + db.assinaturas.size, 0);
    // O kill switch é SÓ da vitrine: compra paga segundos antes de desligar a venda
    // ainda é registrada e reconhecida (senão a Play estorna).
    const off = await verificar(t, 'olli_pro:mensal', { env: { ...envBase, PLAY_BILLING_MODE: 'off' } });
    checar('verificar com a venda DESLIGADA ainda registra a compra paga → 200 ativo', [off.status, off.body.estado], [200, 'ativo']);
    checar('...e reconhece na Play', google.acks.length, 1);
  }

  console.log('\n2) PORTÃO — JWT, rate limit fail-closed, teto, regex e catálogo');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub());
    checar('sem JWT → 401', (await verificar(t, 'olli_pro:mensal', { semAuth: true })).status, 401);
    checar('sem binding PLAY_RL → 429 (fail-closed)', (await verificar(t, 'olli_pro:mensal', { env: { ...envBase, PLAY_RL: undefined } })).status, 429);
    checar('limitador negou → 429', (await verificar(t, 'olli_pro:mensal', { env: { ...envBase, PLAY_RL: { limit: async () => ({ success: false }) } } })).status, 429);
    checar('corpo > 8 KB → 413', (await chamar('/play/verificar', { bruto: JSON.stringify({ purchaseToken: t, produtoId: 'olli_pro:mensal', x: 'y'.repeat(9000) }) })).status, 413);
    checar('token fora do formato → 400', (await verificar('curto')).body.erro, 'token_invalido');
    checar('token com caractere proibido → 400', (await verificar(`${t}/../x`)).body.erro, 'token_invalido');
    checar('produto fora do catálogo no pedido → 400', (await verificar(t, 'olli_vip:mensal')).body.erro, 'produto_invalido');
    checar('JSON quebrado → 400', (await chamar('/play/verificar', { bruto: '{nao json' })).status, 400);
    checar('GET /play/verificar → 405', (await chamar('/play/verificar', { metodo: 'GET' })).status, 405);
    checar('rota desconhecida → 404', (await chamar('/play/outra', { corpo: {} })).status, 404);
    checar('nada foi ao Google nem ao banco', [google.acks.length, db.compras.size, db.assinaturas.size], [0, 0, 0]);
  }

  console.log('\n3) COMPRA VÁLIDA — concede, grava, e SÓ DEPOIS reconhece');
  reset();
  limparCacheTokenGoogle();
  kv.clear();
  google.tokenCalls = 0;
  {
    const t = novoToken();
    google.subs.set(t, sub());
    const r = await verificar(t);
    checar('200 ativo', [r.status, r.body.estado, r.body.plano], [200, 'ativo', 'pro']);
    checar('CONTRATO: corpo 200 = { ok, estado, plano, vigenteAte } e nada mais', Object.keys(r.body).sort(), ['estado', 'ok', 'plano', 'vigenteAte']);
    checar('CONTRATO: o app lê a resposta como ok/pro/vigência', doApp(r), { estado: 'ok', plano: 'pro', vigenteAte: new Date(AGORA + 30 * DIA).toISOString() });
    const l = linhaDe();
    checar('assinaturas: pro/active até a vigência da Play + folga de renovação (2 h)', `${l?.plano}/${l?.status}/${l?.current_period_end}`, `pro/active/${new Date(AGORA + 30 * DIA + 2 * 3600e3).toISOString()}`);
    checar('...e a vigência da PRÓPRIA Play gravada exata', l?.revenuecat_vigencia_ate, new Date(AGORA + 30 * DIA).toISOString());
    checar('vínculo = SHA-256 do token (nunca o token cru)', [l?.revenuecat_transacao_id, l?.revenuecat_produto_id], [sha(t), 'olli_pro:mensal']);
    const c = compraDe(t);
    checar('play_compras: dono, produto, estado, ordem sem sufixo', [c?.user_id, c?.produto_id, c?.estado, c?.order_id_base], [USER, 'olli_pro:mensal', 'SUBSCRIPTION_STATE_ACTIVE', 'GPA.3311-2222-3333-44444']);
    checar('play_compras.ack = true depois do acknowledge', c?.ack, true);
    checar('acknowledge chamado 1x com o productId', google.acks.map((a) => a.produto), ['olli_pro']);
    checar('ORDEM: grava compra → grava plano → ack na Play → marca ack', linhaDoTempo, ['grava_compra', 'grava_assinatura', 'ack_play', 'grava_compra']);
    checar('JWT RS256 aceito pelo Google (assinatura, iss, aud, escopos)', [google.tokenCalls, google.jwtsInvalidos], [1, 0]);
    checar('token do Google guardado no KV com TTL', [...kv.keys()].some((k) => k.startsWith('play:gtoken:v2:') && !k.includes(SA_EMAIL)), true);
    checar('...CIFRADO: o valor no KV não contém o access token', [...kv.values()].some((v) => String(v).includes(ACCESS_TOKEN) || String(v).includes('ya29')), false);

    const de2 = await verificar(t);
    checar('restaurar a MESMA compra (mesma conta) → 200, sem novo ack', [de2.status, de2.body.estado, google.acks.length], [200, 'ativo', 1]);
    checar('token do Google reaproveitado do cache (sem novo JWT)', google.tokenCalls, 1);
    limparCacheTokenGoogle();
    await verificar(t);
    checar('isolate novo: token vem do KV, não do Google', google.tokenCalls, 1);
    checar('produto só com o sku (restauração, basePlanId null) também serve', (await verificar(t, 'olli_pro')).status, 200);
    checar('CONTRATO: o app manda basePlanId:null sem plano básico', corpoDoApp(t, 'olli_pro'), { purchaseToken: t, productId: 'olli_pro', basePlanId: null });
    checar('legado { produtoId } continua aceito', (await chamar('/play/verificar', { corpo: { purchaseToken: t, produtoId: 'olli_pro:mensal' } })).status, 200);
    checar('basePlanId que a loja inventou NÃO derruba a compra (vale o do Google)', [(await verificar(t, 'olli_pro:semanal')).status], [200]);

    // Token revogado no Google: 401 limpa o cache (memória + KV) e tenta 1x com token novo.
    tokenEmitido = 'ya29.token-novo-depois-de-revogar';
    tokenAceito = tokenEmitido;
    const chamadasAntes = google.tokenCalls;
    const depoisDe401 = await verificar(t);
    checar('401 do Google → busca token novo e a chamada passa', [depoisDe401.status, google.tokenCalls - chamadasAntes], [200, 1]);
    tokenEmitido = ACCESS_TOKEN;
    tokenAceito = ACCESS_TOKEN;
    limparCacheTokenGoogle();
    kv.clear();
  }

  console.log('\n4) CONTA ERRADA, TOKEN REUSADO, PRODUTO FORA DO CATÁLOGO, TESTE SEM PERMISSÃO');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub({ conta: HASH_OUTRO }));
    const r = await verificar(t);
    checar('obfuscatedAccountId de OUTRA conta → 403 conta_diferente', [r.status, r.body.erro], [403, 'conta_diferente']);
    checar('...nada gravado, nada reconhecido', [db.compras.size, db.assinaturas.size, google.acks.length], [0, 0, 0]);

    const semConta = novoToken();
    google.subs.set(semConta, sub({ conta: null }));
    checar('compra SEM obfuscated e sem cadeia → 403 compra_sem_conta', (await verificar(semConta)).body.erro, 'compra_sem_conta');

    const t2 = novoToken();
    google.subs.set(t2, sub());
    await verificar(t2);
    const reuso = await verificar(t2, 'olli_pro:mensal', { user: OUTRO });
    checar('MESMO token por outra conta → 409 token_de_outra_conta', [reuso.status, reuso.body.erro], [409, 'token_de_outra_conta']);
    checar('CONTRATO: o app lê o 409 como outra_conta', doApp(reuso), { estado: 'outra_conta' });
    checar('...o plano da outra conta não foi tocado', linhaDe(OUTRO), null);
    checar('...e a compra continua do dono original', compraDe(t2)?.user_id, USER);
    checar('...com ALARME no log', logs.some((x) => x.includes('ALARME') && x.includes('outra conta')), true);

    const vip = novoToken();
    google.subs.set(vip, sub({ produto: 'olli_vip' }));
    checar('Play devolve produto fora do catálogo → 422', (await verificar(vip, 'olli_pro')).body.erro, 'produto_desconhecido');
    const semanal = novoToken();
    google.subs.set(semanal, sub({ base: 'semanal' }));
    checar('plano básico desconhecido → 422', (await verificar(semanal, 'olli_pro')).body.erro, 'produto_desconhecido');
    const div = novoToken();
    google.subs.set(div, sub({ produto: 'olli_pro' }));
    const divergente = await verificar(div, 'olli_empresa:mensal');
    checar('app diz Empresa, Play diz Pro → vale a Play (200 pro), só log', [divergente.status, divergente.body.plano], [200, 'pro']);
    checar('...com a divergência registrada no log', logs.some((x) => x.includes('produto alegado pelo app difere')), true);

    const teste = novoToken();
    google.subs.set(teste, sub({ teste: true }));
    const antes = db.compras.size;
    checar('testPurchase sem PLAY_TESTE_PERMITIDOS → 403', (await verificar(teste)).body.erro, 'compra_de_teste_nao_permitida');
    checar('...nada gravado', db.compras.size, antes);
    const permitido = await verificar(teste, 'olli_pro:mensal', { env: { ...envBase, PLAY_TESTE_PERMITIDOS: `outro-lixo, ${USER.toUpperCase()}` } });
    checar('testPurchase de user_id permitido → concede', [permitido.status, permitido.body.estado], [200, 'ativo']);
    checar('...marcado como teste em play_compras', compraDe(teste)?.teste, true);
  }

  console.log('\n5) PENDENTE não libera nem reconhece; Google fora = 503 sem gravar');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub({ estado: 'SUBSCRIPTION_STATE_PENDING' }));
    const r = await verificar(t);
    checar('PENDING → 200 pendente', [r.status, r.body.estado], [200, 'pendente']);
    checar('CONTRATO: o app lê PENDING como sem_liberacao/pendente (não "ok", não "erro")', doApp(r), { estado: 'sem_liberacao', situacao: 'pendente' });
    checar('...sem plano e sem acknowledge', [linhaDe(), google.acks.length], [null, 0]);
    const t2 = novoToken();
    google.subs.set(t2, sub());
    google.falhaGet = 503;
    const fora = await verificar(t2);
    checar('Google 503 → 503 google_indisponivel', [fora.status, fora.body.erro], [503, 'google_indisponivel']);
    checar('...nada gravado às cegas', compraDe(t2), null);
    google.falhaGet = null;
    checar('token que a Play não conhece → 422', (await verificar(novoToken())).body.erro, 'compra_nao_encontrada');
  }

  console.log('\n6) RTDN por PULL — duplicado tem um efeito; ack só depois de gravar');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub());
    await verificar(t); // o app registrou a compra
    // Renovação: a Play estende a vigência; o RTDN só AVISA.
    google.subs.get(t).lineItems[0].expiryTime = new Date(AGORA + 60 * DIA).toISOString();
    const m = mensagem(notifAssinatura(t, 2));
    pubsub.fila.push(m, { ...m, ackId: 'ack-reentrega' }); // reentrega do MESMO messageId
    linhaDoTempo = [];
    const r = await processarRtdn(envBase, { agora: new Date(AGORA + 1000) });
    checar('2 recebidas, 2 confirmadas', [r.recebidas, r.confirmadas], [2, 2]);
    checar('RENOVAÇÃO aplicada pelo ESTADO (vigência +60d, acesso +2 h de folga)', [linhaDe()?.revenuecat_vigencia_ate, linhaDe()?.current_period_end], [new Date(AGORA + 60 * DIA).toISOString(), new Date(AGORA + 60 * DIA + 2 * 3600e3).toISOString()]);
    checar('duplicado gravou UMA vez', linhaDoTempo.filter((x) => x === 'grava_assinatura').length, 1);
    checar('ack no Pub/Sub DEPOIS de gravar', linhaDoTempo.indexOf('ack_pubsub') > linhaDoTempo.lastIndexOf('grava_assinatura'), true);
    checar('webhook_events origem play_rtdn = processado', db.eventos.get(`play_rtdn|${m.message.messageId}`)?.status, 'processado');
    checar('trilha sem token cru', JSON.stringify(db.eventos.get(`play_rtdn|${m.message.messageId}`)?.payload).includes(t), false);

    // Notificação de teste do Console, pacote de outro app, mensagem ilegível: ack sem efeito.
    pubsub.fila.push(
      mensagem({ testNotification: { version: '1.0' } }),
      { ackId: 'ack-outro', message: { messageId: 'm-outro', data: Buffer.from(JSON.stringify({ packageName: 'com.outro', subscriptionNotification: { purchaseToken: t } })).toString('base64') } },
      { ackId: 'ack-lixo', message: { messageId: 'm-lixo', data: '!!!' } },
    );
    const r2 = await processarRtdn(envBase, { agora: new Date(AGORA + 2000) });
    checar('teste/outro pacote/lixo: todos confirmados', [r2.recebidas, r2.confirmadas], [3, 3]);

    // Fila vazia: o long poll estoura o nosso timeout → rodada ok, sem erro.
    pubsub.pendurar = true;
    const rv = await processarRtdn(envBase, { agora: new Date(AGORA + 2500) });
    pubsub.pendurar = false;
    checar('timeout do long poll = fila vazia, não erro', [rv.estado, rv.recebidas], ['ok', 0]);
    checar('...e o RTDN de teste aparece no log', logs.some((x) => x.includes('RTDN de teste')), true);

    // Google fora: NÃO dá ack (o Pub/Sub reentrega) e NÃO mexe no plano.
    google.falhaGet = 503;
    const antes = linhaDe()?.current_period_end;
    pubsub.fila.push(mensagem(notifAssinatura(t, 13)));
    const r3 = await processarRtdn(envBase, { agora: new Date(AGORA + 3000) });
    checar('Google 5xx no RTDN → mensagem mantida (sem ack)', [r3.confirmadas, r3.mantidas, pubsub.fila.length], [0, 1, 1]);
    checar('ERRO 5xx DO GOOGLE NÃO REBAIXA (plano intacto)', `${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `active/${antes}`);
    google.falhaGet = null;
  }

  console.log('\n7) EXPIRAÇÃO rebaixa (com vínculo); RTDN de token alheio não concede');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub());
    await verificar(t);
    const s = google.subs.get(t);
    s.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    s.lineItems[0].expiryTime = new Date(AGORA - 1000).toISOString();
    pubsub.fila.push(mensagem(notifAssinatura(t, 13)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 5000) });
    checar('EXPIRED → canceled na data da Play', `${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `canceled/${new Date(AGORA - 1000).toISOString()}`);
    checar('play_compras acompanha o estado', compraDe(t)?.estado, 'SUBSCRIPTION_STATE_EXPIRED');

    // Token que ninguém registrou (o app ainda não chamou /play/verificar): o RTDN
    // não inventa dono — fica para o app, e sem registro não há ack (a Play estorna).
    const orfao = novoToken();
    google.subs.set(orfao, sub({ conta: HASH_OUTRO }));
    pubsub.fila.push(mensagem(notifAssinatura(orfao, 4)));
    const r = await processarRtdn(envBase, { agora: new Date(AGORA + 6000) });
    checar('token sem dono no RTDN → ack sem efeito', r.confirmadas, 1);
    checar('...nenhum plano para OUTRO e nenhum ack na Play', [linhaDe(OUTRO), google.acks.length], [null, 1]);

    // Suspensão (ON_HOLD) e pausa tiram o acesso; recuperação devolve.
    reset();
    const t2 = novoToken();
    google.subs.set(t2, sub());
    await verificar(t2);
    google.subs.get(t2).subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD';
    pubsub.fila.push(mensagem(notifAssinatura(t2, 5)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 7000) });
    checar('ON_HOLD → canceled agora (perde acesso)', linhaDe()?.status, 'canceled');
    google.subs.get(t2).subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE';
    pubsub.fila.push(mensagem(notifAssinatura(t2, 1)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 8000) });
    checar('RECOVERED → active de novo', linhaDe()?.status, 'active');
  }

  console.log('\n8) RECONCILIAÇÃO — reconhece o que ficou pendente; erro de API não rebaixa');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub());
    // Simula o caso "gravou, mas o ack falhou": linha com ack=false e verificada há 2h.
    await verificar(t);
    const c = compraDe(t);
    c.ack = false;
    c.verificado_em = new Date(R27.getTime() - 2 * 3600e3).toISOString();
    google.subs.get(t).acknowledgementState = 'ACKNOWLEDGEMENT_STATE_PENDING';
    google.acks = [];
    const fora = await reconciliarPlay(envBase, { agora: naMinuto(20) });
    checar('fora dos minutos fixos não faz nada', [fora.estado, google.acks.length], ['fora_do_horario', 0]);
    const r = await tarefaPlayDoCron(envBase, { agora: R27 });
    checar('cron :27 → reconciliação: relida e reconhecida', [r.tarefa, r.estado, r.relidas, google.acks.length, compraDe(t)?.ack], ['reconciliar', 'ok', 1, 1, true]);
    const pullsAntes = pubsub.pulls;
    checar('cron :27 NÃO puxa o RTDN no mesmo minuto', pubsub.pulls, pullsAntes);
    const rtdn = await tarefaPlayDoCron(envBase, { agora: naMinuto(3, HORA_TESTE) });
    checar('cron :03 → RTDN (e não a reconciliação)', [rtdn.tarefa, pubsub.pulls - pullsAntes], ['rtdn', 1]);
    checar('cron :43 → RTDN', (await tarefaPlayDoCron(envBase, { agora: naMinuto(43, HORA_TESTE) })).tarefa, 'rtdn');

    // Google fora na reconciliação: nada muda.
    c.verificado_em = new Date(R27.getTime() - 2 * 3600e3).toISOString();
    c.ack = false;
    google.falhaGet = 500;
    const antes = JSON.stringify(linhaDe());
    await reconciliarPlay(envBase, { agora: R27 });
    checar('ERRO 5xx NA RECONCILIAÇÃO NÃO REBAIXA (linha idêntica)', JSON.stringify(linhaDe()), antes);
    checar('...mas a marca de verificação anda (a linha não trava a fila)', Date.parse(c.verificado_em) > R27.getTime() - 3600e3, true);
    google.falhaGet = null;

    // Varredura diária de anuladas (05:37 UTC): a Play revogou → estado EXPIRED → encerra.
    const s = google.subs.get(t);
    s.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    s.lineItems[0].expiryTime = new Date(AGORA - 60e3).toISOString();
    google.voided = [{ purchaseToken: t, orderId: 'GPA.3311-2222-3333-44444..2', voidedReason: 1, voidedSource: 0 }];
    const v = await reconciliarPlay(envBase, { agora: naMinuto(23, 5) });
    checar('05:23 UTC → anuladas encontrada e aplicada', [v.anuladas?.tratadas, linhaDe()?.status], [1, 'canceled']);
    checar('...e a reconciliação de linhas NÃO roda no mesmo minuto', v.relidas, undefined);
    const v2 = await reconciliarPlay(envBase, { agora: naMinuto(23, 5) });
    checar('a mesma anulada não é reprocessada no dia seguinte', v2.anuladas?.tratadas, 0);
  }

  console.log('\n8b) FILA DA RECONCILIAÇÃO não trava; compra de teste de quem saiu da lista encerra');
  reset();
  {
    // Testador que já teve a compra de teste concedida e depois saiu de
    // PLAY_TESTE_PERMITIDOS: a linha não pode ficar no topo da fila para sempre.
    const envTestador = { ...envBase, PLAY_TESTE_PERMITIDOS: USER };
    const tt = novoToken();
    google.subs.set(tt, sub({ teste: true }));
    await verificar(tt, 'olli_pro:mensal', { env: envTestador });
    const c = compraDe(tt);
    c.ack = false;
    c.verificado_em = new Date(R27.getTime() - 2 * 3600e3).toISOString();
    await reconciliarPlay(envBase, { agora: R27 });
    checar('teste não permitido: verificado_em anda mesmo sem conceder', Date.parse(compraDe(tt).verificado_em) > R27.getTime() - 3600e3, true);
    const s = google.subs.get(tt);
    s.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    s.lineItems[0].expiryTime = new Date(AGORA - 1000).toISOString();
    compraDe(tt).verificado_em = new Date(R27.getTime() - 2 * 3600e3).toISOString();
    await reconciliarPlay(envBase, { agora: R27 });
    checar('...e o ENCERRAMENTO dela vale (plano de teste não fica eterno)', [linhaDe()?.status, compraDe(tt)?.estado], ['canceled', 'SUBSCRIPTION_STATE_EXPIRED']);
  }

  console.log('\n8c) TROCA DE PLANO — RTDN do token antigo gravado depois não anula a concessão do novo');
  reset();
  {
    const velho = novoToken();
    google.subs.set(velho, sub({ produto: 'olli_pro' }));
    await verificar(velho);
    const novo = novoToken();
    google.subs.set(novo, sub({ produto: 'olli_empresa', linked: velho }));
    // O token antigo encerra com uma leitura MAIS NOVA gravada primeiro…
    google.subs.get(velho).subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    linhaDe().revenuecat_evento_em = new Date(Date.now() + 60e3).toISOString();
    google.acks = [];
    const r = await verificar(novo, 'olli_empresa:mensal');
    checar('…e a concessão do token novo não cai em "fora de ordem"', [r.status, r.body.estado, linhaDe()?.plano, linhaDe()?.revenuecat_transacao_id], [200, 'ativo', 'empresa', sha(novo)]);
    checar('...e só então reconhece na Play', google.acks.length, 1);
    // Leitura VELHA do MESMO token (fora de ordem de verdade) não desfaz a nova,
    // não reconhece e não responde "ativo".
    linhaDe().revenuecat_evento_em = new Date(Date.now() + 60e3).toISOString();
    google.subs.get(novo).acknowledgementState = 'ACKNOWLEDGEMENT_STATE_PENDING';
    google.acks = [];
    const velhaLeitura = await verificar(novo, 'olli_empresa:mensal');
    checar('fora de ordem do MESMO token → não "ativo", sem ack', [velhaLeitura.body.estado, velhaLeitura.body.plano, google.acks.length], ['sem_efeito', null, 0]);
    checar('CONTRATO: o app lê isso como sem_liberacao (nunca "confirmamos")', doApp(velhaLeitura).estado, 'sem_liberacao');
  }

  console.log('\n9) CONVIVÊNCIA — Pix de 1 ano (Empresa) não é rebaixado nem derrubado pela Play');
  reset({ linha: { user_id: USER, plano: 'empresa', status: 'active', current_period_end: new Date(AGORA + 300 * DIA).toISOString(), stripe_subscription_id: null } });
  {
    const t = novoToken();
    google.subs.set(t, sub({ produto: 'olli_pro' }));
    await verificar(t);
    checar('nível e vigência maiores preservados', `${linhaDe()?.plano}/${linhaDe()?.current_period_end}`, `empresa/${new Date(AGORA + 300 * DIA).toISOString()}`);
    checar('a Play registra a vigência DELA à parte', linhaDe()?.revenuecat_vigencia_ate, new Date(AGORA + 30 * DIA).toISOString());
    google.subs.get(t).subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    pubsub.fila.push(mensagem(notifAssinatura(t, 13)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 9000) });
    checar('EXPIRED da Play NÃO derruba o Pix', `${linhaDe()?.plano}/${linhaDe()?.status}`, 'empresa/active');
  }

  console.log('\n9b) DUAS assinaturas da Play na mesma conta OLLI — encerrar uma não derruba a outra');
  reset();
  {
    const empresa = novoToken();
    google.subs.set(empresa, sub({ produto: 'olli_empresa', expira: AGORA + 25 * DIA }));
    await verificar(empresa, 'olli_empresa:mensal');
    const pro = novoToken();
    google.subs.set(pro, sub({ produto: 'olli_pro' }));
    await verificar(pro);
    checar('a última verificada aponta a linha (pro)', linhaDe()?.revenuecat_transacao_id, sha(pro));
    google.subs.get(pro).subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    google.subs.get(pro).lineItems[0].expiryTime = new Date(AGORA - 60e3).toISOString();
    pubsub.fila.push(mensagem(notifAssinatura(pro, 13)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 11000) });
    checar('EXPIRED do Pro com o Empresa vivo → plano mantido pelo Empresa',
      [linhaDe()?.plano, linhaDe()?.status, linhaDe()?.revenuecat_transacao_id, linhaDe()?.revenuecat_vigencia_ate],
      ['empresa', 'active', sha(empresa), new Date(AGORA + 25 * DIA).toISOString()]);
    checar('...com a folga de renovação do Empresa', linhaDe()?.current_period_end, new Date(AGORA + 25 * DIA + 2 * 3600e3).toISOString());
    // Sem outra viva: encerra de verdade.
    google.subs.get(empresa).subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
    google.subs.get(empresa).lineItems[0].expiryTime = new Date(AGORA - 30e3).toISOString();
    pubsub.fila.push(mensagem(notifAssinatura(empresa, 13)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 12000) });
    checar('...e quando o Empresa também expira, encerra', linhaDe()?.status, 'canceled');
  }

  console.log('\n9c) TETOS do plano Free — RTDN e varredura de anuladas cabem nos 50 subrequests');
  reset();
  {
    for (let i = 0; i < 6; i++) pubsub.fila.push(mensagem({ testNotification: { version: '1.0' } }));
    const r = await processarRtdn({ ...envBase, PLAY_RTDN_MAX: '10' }, { agora: new Date(AGORA + 13000) });
    checar('PLAY_RTDN_MAX=10 é cortado para 3 por rodada', r.recebidas, 3);
    // 50 anuladas que não são nossas + 30 nossas já tratadas: a rodada para no orçamento.
    reset();
    const nossas = [];
    for (let i = 0; i < 30; i++) {
      const t = novoToken();
      nossas.push(t);
      db.compras.set(sha(t), { user_id: USER, token_sha256: sha(t), purchase_token: t, estado: 'SUBSCRIPTION_STATE_EXPIRED' });
      db.eventos.set(`play_voided|GPA.${i}|${sha(t).slice(0, 32)}`, { status: 'processado' });
    }
    google.voided = [
      ...Array.from({ length: 50 }, () => ({ purchaseToken: novoToken(), orderId: 'GPA.alheia' })),
      ...nossas.map((t, i) => ({ purchaseToken: t, orderId: `GPA.${i}` })),
    ];
    const fetchReal = globalThis.fetch;
    let chamadas = 0;
    globalThis.fetch = (url, init) => { chamadas++; return fetchReal(url, init); };
    try {
      await reconciliarPlay(envBase, { agora: naMinuto(23, 5) });
    } finally {
      globalThis.fetch = fetchReal;
    }
    checar('varredura de anuladas fica abaixo de 45 subrequests', chamadas < 45, true);
    // Nossa anulada NOVA no fim da lista: o orçamento não a reivindica sem tratar.
    reset();
    const nova = novoToken();
    google.subs.set(nova, sub({ estado: 'SUBSCRIPTION_STATE_EXPIRED', expira: AGORA - 60e3 }));
    db.compras.set(sha(nova), { user_id: USER, token_sha256: sha(nova), purchase_token: nova, estado: 'SUBSCRIPTION_STATE_ACTIVE' });
    google.voided = [
      ...Array.from({ length: 36 }, () => ({ purchaseToken: novoToken(), orderId: 'GPA.alheia' })),
      { purchaseToken: nova, orderId: 'GPA.nova' },
    ];
    const v = await reconciliarPlay(envBase, { agora: naMinuto(23, 5) });
    checar('anulada que não cabe no orçamento NÃO é reivindicada (fica para amanhã)', [v.anuladas?.tratadas, db.eventos.size], [0, 0]);
  }

  console.log('\n10) REASSINATURA pela Play Store (sem obfuscated): só com a cadeia do mesmo usuário');
  reset();
  {
    const velho = novoToken();
    google.subs.set(velho, sub());
    await verificar(velho);
    const novo = novoToken();
    google.subs.set(novo, sub({ conta: null, outOfApp: { expiredPurchaseToken: velho, expiredExternalAccountIdentifiers: { obfuscatedExternalAccountId: HASH_USER } } }));
    pubsub.fila.push(mensagem(notifAssinatura(novo, 4)));
    await processarRtdn(envBase, { agora: new Date(AGORA + 10000) });
    checar('RTDN da reassinatura acha o dono pela cadeia', compraDe(novo)?.user_id, USER);
    checar('...e concede', linhaDe()?.revenuecat_transacao_id, sha(novo));
    const alheio = novoToken();
    google.subs.set(alheio, sub({ conta: null, outOfApp: { expiredPurchaseToken: velho } }));
    checar('outra conta tentando a cadeia de USER → 403', (await verificar(alheio, 'olli_pro', { user: OUTRO })).status, 403);
  }

  console.log('\n11) EXCLUSÃO DE CONTA — cancela a renovação pela API v2');
  reset();
  {
    const t = novoToken();
    google.subs.set(t, sub());
    await verificar(t);
    const velha = novoToken();
    google.subs.set(velha, sub({ estado: 'SUBSCRIPTION_STATE_EXPIRED', expira: AGORA - DIA }));
    db.compras.set(sha(velha), { user_id: USER, token_sha256: sha(velha), purchase_token: velha, estado: 'SUBSCRIPTION_STATE_EXPIRED' });
    checar('cancelarPlayDoUsuario → ok', await cancelarPlayDoUsuario(envBase, USER), 'ok');
    checar('só a viva foi cancelada, com USER_REQUESTED_STOP_RENEWALS', google.cancels.map((c) => [c.token === t, c.corpo.cancellationContext.cancellationType]), [[true, 'USER_REQUESTED_STOP_RENEWALS']]);
    google.cancels = [];
    google.falhaCancel = 500;
    google.subs.get(t).lineItems[0].autoRenewingPlan = { autoRenewEnabled: true };
    checar('cancel falhou e a Play diz que ainda renova → erro (bloqueia a exclusão)', await cancelarPlayDoUsuario(envBase, USER), 'erro');
    google.subs.get(t).lineItems[0].autoRenewingPlan = { autoRenewEnabled: false };
    checar('cancel falhou mas a Play diz que já não renova → ok', await cancelarPlayDoUsuario(envBase, USER), 'ok');
    google.falhaCancel = null;
    checar('assinatura viva sem credencial → erro', await cancelarPlayDoUsuario({ ...envBase, PLAY_SA_JSON: undefined }, USER), 'erro');
    checar('usuário sem compra nenhuma → ok', await cancelarPlayDoUsuario(envBase, OUTRO), 'ok');

    // Gravada como CANCELADA, mas o usuário restaurou na Play antes do RTDN: relê e cancela.
    reset();
    const restaurada = novoToken();
    google.subs.set(restaurada, sub());
    db.compras.set(sha(restaurada), { user_id: USER, token_sha256: sha(restaurada), purchase_token: restaurada, estado: 'SUBSCRIPTION_STATE_CANCELED' });
    checar('CANCELED gravada mas renovando de novo na Play → relida e cancelada', [await cancelarPlayDoUsuario(envBase, USER), google.cancels.length], ['ok', 1]);
    google.cancels = [];
    google.subs.get(restaurada).lineItems[0].autoRenewingPlan = { autoRenewEnabled: false };
    google.subs.get(restaurada).subscriptionState = 'SUBSCRIPTION_STATE_CANCELED';
    checar('CANCELED que segue sem renovar → não chama cancel', [await cancelarPlayDoUsuario(envBase, USER), google.cancels.length], ['ok', 0]);
    checar('só canceladas gravadas e sem credencial → ok (vale o gravado)', await cancelarPlayDoUsuario({ ...envBase, PLAY_SA_JSON: undefined }, USER), 'ok');
  }

  console.log('\n12) traduzirAssinaturaPlay isolado — a tabela de estados');
  {
    const t = (estado, extra = {}) => traduzirAssinaturaPlay(sub({ estado, ...extra }), { userId: USER, transacaoId: 'h', agora: AGORA });
    checar('ACTIVE → conceder', t('SUBSCRIPTION_STATE_ACTIVE').acao, 'conceder');
    checar('ACTIVE renovando → acesso até expiry + 2 h, vigência da Play exata',
      [t('SUBSCRIPTION_STATE_ACTIVE').vigenciaAte, t('SUBSCRIPTION_STATE_ACTIVE').acessoAte],
      [new Date(AGORA + 30 * DIA).toISOString(), new Date(AGORA + 30 * DIA + 2 * 3600e3).toISOString()]);
    checar('CANCELED (não renova) → acesso = vigência exata, sem folga', t('SUBSCRIPTION_STATE_CANCELED').acessoAte, new Date(AGORA + 30 * DIA).toISOString());
    checar('IN_GRACE_PERIOD → conceder (o Google manda manter o acesso)', t('SUBSCRIPTION_STATE_IN_GRACE_PERIOD').acao, 'conceder');
    checar('CANCELED com período pago → conceder até o fim', t('SUBSCRIPTION_STATE_CANCELED').acao, 'conceder');
    checar('CANCELED já vencida → encerrar', t('SUBSCRIPTION_STATE_CANCELED', { expira: AGORA - 1 }).acao, 'encerrar');
    checar('ACTIVE com data velha → registrar (não rebaixa por dado defasado)', t('SUBSCRIPTION_STATE_ACTIVE', { expira: AGORA - 1 }).acao, 'registrar');
    for (const e of ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']) {
      checar(`${e} → encerrar`, t(e).acao, 'encerrar');
    }
    checar('encerrar nunca estende (vigência ≤ agora)', Date.parse(t('SUBSCRIPTION_STATE_ON_HOLD').vigenciaAte) <= AGORA, true);
    checar('PENDING → registrar', t('SUBSCRIPTION_STATE_PENDING').motivo, 'pagamento_pendente');
    checar('UNSPECIFIED → alarme', t('SUBSCRIPTION_STATE_UNSPECIFIED').acao, 'alarme');
    checar('empresa anual → empresa', traduzirAssinaturaPlay(sub({ produto: 'olli_empresa', base: 'anual' }), { userId: USER, transacaoId: 'h', agora: AGORA }).plano, 'empresa');
    checar('sem estado → invalido', traduzirAssinaturaPlay({}, {}).acao, 'invalido');
  }

  console.log('\n13) LOGS — nunca purchaseToken nem access token');
  {
    const tudo = logs.join('\n');
    checar('nenhum token de compra nos logs', /tokenplay\.\d{4}-/.test(tudo), false);
    checar('nenhum access token nos logs', tudo.includes(ACCESS_TOKEN) || tudo.includes('ya29'), false);
    checar('nenhum user_id em claro nos logs', tudo.includes(USER) || tudo.includes(OUTRO), false);
    checar('nenhuma chave privada nos logs', tudo.includes('PRIVATE KEY'), false);
  }
} finally {
  console.error = logOriginalErr;
  console.log = logOriginal;
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
