/**
 * Teste do WEBHOOK DO REVENUECAT (assinatura pela Google Play).
 *
 *     node worker/scripts/teste-revenuecat-webhook.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita o roteador REAL (`handleRevenueCat`) contra um Supabase FALSO em
 * memória (fetch trocado), com `webhook_events` de verdade no sentido que importa:
 * índice único (origem, event_id) → 409 no segundo insert.
 *
 * O que está trancado aqui:
 *  1. PORTÃO fail-closed: sem secret (ou secret fraco) a rota fica desligada; sem o
 *     Authorization exato, 401; teto por IP antes de tudo.
 *  2. MAPEAMENTO evento a evento (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
 *     EXPIRATION, BILLING_ISSUE, TRANSFER, sandbox, produto desconhecido…).
 *  3. IDEMPOTÊNCIA: o mesmo evento duas vezes grava uma vez; tentativa que morreu
 *     no meio é reprocessada; banco fora → 5xx para o RevenueCat reenviar.
 *  4. PRESERVAÇÃO: plano pago por Pix/Stripe não é derrubado nem rebaixado por
 *     evento da Play; encerramento sem prova de vínculo não encerra nada.
 *  5. ORDEM: EXPIRATION atrasado não desfaz a RENOVAÇÃO que veio depois.
 */
import { aplicarDecisao, handleRevenueCat, traduzirEventoRevenueCat } from '../src/revenuecat.js';

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
const SEGREDO = 'rc_whsec_teste_0123456789abcdefghijklmnop';

// ── Supabase falso ───────────────────────────────────────────
const db = { assinaturas: new Map(), eventos: new Map() };
let escritasAssinatura = [];
let falharLeitura = null; // null | 500 | 400
let alarmes = [];

function reset({ linha = null } = {}) {
  db.assinaturas = new Map();
  db.eventos = new Map();
  if (linha) db.assinaturas.set(linha.user_id, { ...linha });
  escritasAssinatura = [];
  falharLeitura = null;
  alarmes = [];
}

const logOriginal = console.error;
console.error = (...args) => { alarmes.push(args.map(String).join(' ')); };

const resp = (obj, status = 200) =>
  new Response(obj === null ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function filtros(u) {
  const out = {};
  for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) out[k] = decodeURIComponent(v.slice(3));
  return out;
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const metodo = init.method || 'GET';
  const f = filtros(u);

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
      if (falharLeitura) return resp({ message: 'falha' }, falharLeitura);
      const l = db.assinaturas.get(f.user_id);
      return resp(l ? [{ ...l }] : []);
    }
    if (metodo === 'POST') {
      const patch = JSON.parse(init.body);
      escritasAssinatura.push({ tipo: 'upsert', patch });
      db.assinaturas.set(patch.user_id, { ...(db.assinaturas.get(patch.user_id) || {}), ...patch });
      return resp(null, 201);
    }
    if (metodo === 'PATCH') {
      const patch = JSON.parse(init.body);
      escritasAssinatura.push({ tipo: 'patch', patch });
      const l = db.assinaturas.get(f.user_id);
      if (l && l.revenuecat_transacao_id === f.revenuecat_transacao_id) Object.assign(l, patch);
      return resp(null, 204);
    }
  }
  throw new Error(`fetch falso não sabe responder por ${metodo} ${u.pathname}`);
};

const RL_LIVRE = { limit: async () => ({ success: true }) };
const envBase = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  REVENUECAT_WEBHOOK_SECRET: SEGREDO,
  RCHOOK_RL: RL_LIVRE,
};

let seq = 0;
function evento(tipo, extra = {}) {
  seq++;
  return {
    id: `evt-${seq}`,
    type: tipo,
    store: 'PLAY_STORE',
    environment: 'PRODUCTION',
    app_user_id: USER,
    original_app_user_id: USER,
    product_id: 'olli_pro:mensal',
    period_type: 'NORMAL',
    original_transaction_id: 'GPA.1111-2222-3333-44444',
    purchased_at_ms: AGORA - DIA,
    expiration_at_ms: AGORA + 30 * DIA,
    event_timestamp_ms: AGORA + seq * 1000,
    ...extra,
  };
}

async function enviar(ev, { env = envBase, auth = `Bearer ${SEGREDO}`, metodo = 'POST', caminho = '/revenuecat/webhook', bruto } = {}) {
  const corpo = bruto ?? JSON.stringify({ api_version: '1.0', event: ev });
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' };
  if (auth !== null) headers.Authorization = auth;
  if (metodo !== 'GET') headers['Content-Length'] = String(new TextEncoder().encode(corpo).length);
  const alvo = `https://diagnostico.olliorcamentos.online${caminho}`;
  const req = new Request(alvo, { method: metodo, headers, body: metodo === 'GET' ? undefined : corpo });
  const r = await handleRevenueCat(req, env, new URL(alvo));
  return { status: r.status, body: await r.json() };
}

const linhaDe = (id = USER) => db.assinaturas.get(id) || null;
const estadoEvento = (id) => db.eventos.get(`revenuecat|${id}`)?.status ?? null;

try {
  console.log('\n1) PORTÃO — desligado sem secret, 401 sem o Authorization exato, teto por IP');
  reset();
  {
    const ev = evento('INITIAL_PURCHASE');
    checar('sem secret → 503 desligado', (await enviar(ev, { env: { ...envBase, REVENUECAT_WEBHOOK_SECRET: undefined } })).body, { erro: 'revenuecat_desligado' });
    checar('secret curto (adivinhável) → 503 desligado', (await enviar(ev, { env: { ...envBase, REVENUECAT_WEBHOOK_SECRET: 'curto123' }, auth: 'Bearer curto123' })).status, 503);
    checar('sem Authorization → 401', (await enviar(ev, { auth: null })).status, 401);
    checar('secret sem "Bearer " → 401', (await enviar(ev, { auth: SEGREDO })).status, 401);
    checar('secret errado → 401', (await enviar(ev, { auth: `Bearer ${SEGREDO.slice(0, -1)}x` })).status, 401);
    const negado = await enviar(ev, { env: { ...envBase, RCHOOK_RL: { limit: async () => ({ success: false }) } } });
    checar('teto por IP estourado → 429 (antes do segredo)', negado.status, 429);
    checar('nenhuma escrita em nenhum desses', escritasAssinatura.length + db.eventos.size, 0);
    checar('GET na rota → 405', (await enviar(null, { metodo: 'GET' })).status, 405);
    checar('rota desconhecida → 404', (await enviar(ev, { caminho: '/revenuecat/outra' })).status, 404);
    checar('corpo que não é JSON → 400', (await enviar(null, { bruto: 'isto não é json' })).status, 400);
    checar('JSON sem event → 400', (await enviar(null, { bruto: '{"api_version":"1.0"}' })).status, 400);
  }

  console.log('\n2) MAPEAMENTO — cada tipo de evento vira a decisão certa');
  {
    const t = (tipo, extra, opts) => traduzirEventoRevenueCat(evento(tipo, extra), { agora: AGORA, ...opts });
    const c = t('INITIAL_PURCHASE');
    checar('INITIAL_PURCHASE pro mensal → conceder pro/active', [c.acao, c.plano, c.status], ['conceder', 'pro', 'active']);
    checar('...vigência = expiration_at_ms da loja', c.vigenciaAte, new Date(AGORA + 30 * DIA).toISOString());
    checar('...com o vínculo (original_transaction_id)', c.transacaoId, 'GPA.1111-2222-3333-44444');
    checar('empresa anual → empresa', t('INITIAL_PURCHASE', { product_id: 'olli_empresa:anual' }).plano, 'empresa');
    checar('produto antigo só com a assinatura (olli_empresa) → empresa', t('RENEWAL', { product_id: 'olli_empresa' }).plano, 'empresa');
    checar('teste grátis da loja → trialing', t('INITIAL_PURCHASE', { period_type: 'TRIAL' }).status, 'trialing');
    for (const tipo of ['RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'REFUND_REVERSED']) {
      checar(`${tipo} → conceder`, t(tipo).acao, 'conceder');
    }
    checar('produto desconhecido → alarme (não libera)', [t('INITIAL_PURCHASE', { product_id: 'olli_vip:mensal' }).acao, t('INITIAL_PURCHASE', { product_id: 'olli_vip:mensal' }).motivo], ['alarme', 'produto_desconhecido']);
    checar('plano básico desconhecido → alarme', t('INITIAL_PURCHASE', { product_id: 'olli_pro:semanal' }).acao, 'alarme');
    checar('loja da Apple → alarme', t('INITIAL_PURCHASE', { store: 'APP_STORE' }).motivo, 'loja_nao_suportada');
    checar('SANDBOX sem permissão → ignorar', t('INITIAL_PURCHASE', { environment: 'SANDBOX' }), { acao: 'ignorar', motivo: 'sandbox' });
    checar('SANDBOX com REVENUECAT_ACEITAR_SANDBOX → conceder', t('INITIAL_PURCHASE', { environment: 'SANDBOX' }, { aceitarSandbox: true }).acao, 'conceder');
    checar('id anônimo do RevenueCat → alarme', t('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:abc' }).motivo, 'app_user_id_invalido');
    checar('sem original_transaction_id → alarme', t('RENEWAL', { original_transaction_id: '' }).motivo, 'sem_transacao');
    checar('sem expiração → alarme (não inventa vigência)', t('RENEWAL', { expiration_at_ms: null }).motivo, 'sem_expiracao');
    checar('RENEWAL já vencido → registrar', t('RENEWAL', { expiration_at_ms: AGORA - DIA }).motivo, 'ja_expirado');
    checar('CANCELLATION (desligou a renovação) → registrar, acesso segue', t('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' }), { acao: 'registrar', motivo: 'renovacao_desligada' });
    const reemb = t('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' });
    checar('CANCELLATION por reembolso → encerrar AGORA', [reemb.acao, reemb.vigenciaAte], ['encerrar', new Date(AGORA).toISOString()]);
    checar('CANCELLATION com vigência já no passado → encerrar', t('CANCELLATION', { expiration_at_ms: AGORA - 1000 }).acao, 'encerrar');
    const exp = t('EXPIRATION', { expiration_at_ms: AGORA - 5000 });
    checar('EXPIRATION → encerrar na data informada', [exp.acao, exp.vigenciaAte], ['encerrar', new Date(AGORA - 5000).toISOString()]);
    checar('EXPIRATION com data futura não ESTENDE (encerra agora)', t('EXPIRATION', { expiration_at_ms: AGORA + DIA }).vigenciaAte, new Date(AGORA).toISOString());
    const car = t('BILLING_ISSUE', { grace_period_expiration_at_ms: AGORA + 7 * DIA });
    checar('BILLING_ISSUE com carência → estende até o fim dela', [car.acao, car.vigenciaAte], ['carencia', new Date(AGORA + 7 * DIA).toISOString()]);
    checar('BILLING_ISSUE sem carência → registrar', t('BILLING_ISSUE').acao, 'registrar');
    checar('PRODUCT_CHANGE → registrar (o INITIAL_PURCHASE/RENEWAL seguinte decide)', t('PRODUCT_CHANGE', { new_product_id: 'olli_empresa:mensal' }).acao, 'registrar');
    checar('TEMPORARY_ENTITLEMENT_GRANT → registrar (sem recibo, não libera)', t('TEMPORARY_ENTITLEMENT_GRANT').acao, 'registrar');
    checar('SUBSCRIPTION_PAUSED → registrar', t('SUBSCRIPTION_PAUSED').acao, 'registrar');
    checar('TRANSFER → alarme (configuração deve impedir)', t('TRANSFER').motivo, 'transfer_nao_suportado');
    checar('TEST → ignorar', t('TEST').acao, 'ignorar');
    checar('tipo novo desconhecido → registrar', t('ALGO_NOVO').motivo, 'tipo_desconhecido');
    checar('sem type → invalido', traduzirEventoRevenueCat({ id: 'x' }).acao, 'invalido');
  }

  console.log('\n3) CONCESSÃO ponta a ponta + IDEMPOTÊNCIA');
  reset();
  {
    const ev = evento('INITIAL_PURCHASE');
    const r = await enviar(ev);
    checar('200', r.status, 200);
    const l = linhaDe();
    checar('linha nova: pro/active', `${l?.plano}/${l?.status}`, 'pro/active');
    checar('current_period_end = vigência da loja', l?.current_period_end, new Date(ev.expiration_at_ms).toISOString());
    checar('vínculo gravado', [l?.revenuecat_transacao_id, l?.revenuecat_produto_id], [ev.original_transaction_id, 'olli_pro:mensal']);
    checar('webhook_events = processado', estadoEvento(ev.id), 'processado');
    const payload = db.eventos.get(`revenuecat|${ev.id}`).payload;
    checar('trilha sem dado pessoal extra (sem subscriber_attributes/preço)', ['subscriber_attributes', 'price', 'country_code'].some((k) => k in payload), false);

    const dup = await enviar(ev);
    checar('mesmo evento de novo → 200 duplicado', dup.body, { ok: true, duplicado: true });
    checar('...sem segunda escrita', escritasAssinatura.length, 1);
  }

  console.log('\n4) TENTATIVA QUE MORREU NO MEIO é reprocessada; banco fora → 503');
  reset();
  {
    const ev = evento('INITIAL_PURCHASE');
    falharLeitura = 500;
    const r = await enviar(ev);
    checar('leitura falhou → 503 (RevenueCat reenvia)', r.status, 503);
    checar('evento marcado falhou (não "processado")', estadoEvento(ev.id), 'falhou');
    checar('nada gravado às cegas', escritasAssinatura.length, 0);
    falharLeitura = null;
    const r2 = await enviar(ev);
    checar('reenvio → 200 e concede', [r2.status, linhaDe()?.plano], [200, 'pro']);
    checar('agora processado', estadoEvento(ev.id), 'processado');

    reset();
    falharLeitura = 400;
    checar('migration ausente (400 na leitura) → 503, não decide às cegas', (await enviar(evento('RENEWAL'))).status, 503);
    checar('...e avisa no log', alarmes.some((a) => a.includes('migration')), true);
  }

  console.log('\n5) RENOVAÇÃO, EVENTO FORA DE ORDEM e EXPIRAÇÃO');
  reset();
  {
    const compra = evento('INITIAL_PURCHASE');
    await enviar(compra);
    const expAntiga = evento('EXPIRATION', { expiration_at_ms: AGORA - 1000, event_timestamp_ms: compra.event_timestamp_ms + 500 });
    const renov = evento('RENEWAL', { expiration_at_ms: AGORA + 60 * DIA, event_timestamp_ms: compra.event_timestamp_ms + 1000 });
    await enviar(renov);
    checar('RENEWAL estende a vigência', linhaDe()?.current_period_end, new Date(AGORA + 60 * DIA).toISOString());
    const r = await enviar(expAntiga);
    checar('EXPIRATION mais VELHO que a renovação → ignorado', r.body.motivo, 'fora_de_ordem');
    checar('...plano continua ativo', `${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `active/${new Date(AGORA + 60 * DIA).toISOString()}`);
    const exp = evento('EXPIRATION', { expiration_at_ms: AGORA - 1000, event_timestamp_ms: renov.event_timestamp_ms + 1000 });
    await enviar(exp);
    checar('EXPIRATION novo → canceled na data da loja', `${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `canceled/${new Date(AGORA - 1000).toISOString()}`);
  }

  console.log('\n6) REEMBOLSO encerra na hora; CANCELAMENTO comum não mexe; CARÊNCIA estende');
  reset();
  {
    await enviar(evento('INITIAL_PURCHASE'));
    const r = await enviar(evento('CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' }));
    checar('desligou a renovação → 200 e nada muda', [r.body.acao, linhaDe()?.status], ['registrar', 'active']);
    await enviar(evento('BILLING_ISSUE', { grace_period_expiration_at_ms: AGORA + 45 * DIA }));
    checar('carência estende a vigência, status segue active', `${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `active/${new Date(AGORA + 45 * DIA).toISOString()}`);
    await enviar(evento('CANCELLATION', { cancel_reason: 'CUSTOMER_SUPPORT' }));
    const fim = Date.parse(linhaDe()?.current_period_end);
    checar('reembolso → canceled, vigência não passa de agora', [linhaDe()?.status, fim <= Date.now()], ['canceled', true]);
  }

  console.log('\n7) PRESERVAÇÃO — Pix de 1 ano (Empresa) não é rebaixado nem derrubado pela Play');
  reset({ linha: { user_id: USER, plano: 'empresa', status: 'active', current_period_end: new Date(AGORA + 300 * DIA).toISOString(), stripe_subscription_id: null } });
  {
    await enviar(evento('INITIAL_PURCHASE', { product_id: 'olli_pro:mensal', expiration_at_ms: AGORA + 30 * DIA }));
    const l = linhaDe();
    checar('nível maior preservado (empresa)', l?.plano, 'empresa');
    checar('vigência maior preservada (+300d)', l?.current_period_end, new Date(AGORA + 300 * DIA).toISOString());
    checar('a Play registra a vigência DELA à parte', l?.revenuecat_vigencia_ate, new Date(AGORA + 30 * DIA).toISOString());
    await enviar(evento('EXPIRATION', { expiration_at_ms: AGORA - 1000 }));
    checar('EXPIRATION da Play (com vínculo) NÃO derruba o Pix', `${linhaDe()?.plano}/${linhaDe()?.status}/${linhaDe()?.current_period_end}`, `empresa/active/${new Date(AGORA + 300 * DIA).toISOString()}`);
  }

  console.log('\n8) PRESERVAÇÃO — assinatura Stripe: colunas stripe_* nunca são tocadas');
  reset({ linha: { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(AGORA + 10 * DIA).toISOString(), stripe_subscription_id: 'sub_123', stripe_customer_id: 'cus_123' } });
  {
    await enviar(evento('INITIAL_PURCHASE', { product_id: 'olli_empresa:mensal', expiration_at_ms: AGORA + 30 * DIA }));
    const l = linhaDe();
    checar('upgrade pela Play vale (empresa, +30d)', `${l?.plano}/${l?.current_period_end}`, `empresa/${new Date(AGORA + 30 * DIA).toISOString()}`);
    checar('stripe_subscription_id/customer intactos (cancelamento na exclusão da conta)', [l?.stripe_subscription_id, l?.stripe_customer_id], ['sub_123', 'cus_123']);
    checar('nenhuma escrita mencionou stripe_* ou mp_*', escritasAssinatura.some((e) => Object.keys(e.patch).some((k) => k.startsWith('stripe_') || k.startsWith('mp_'))), false);
  }

  console.log('\n9) SEM PROVA DE VÍNCULO não encerra; alarme não vira 200 mudo');
  reset({ linha: { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(AGORA + 20 * DIA).toISOString() } });
  {
    const r = await enviar(evento('EXPIRATION', { expiration_at_ms: AGORA - 1000 }));
    checar('linha sem vínculo com a Play → ignorado', r.body.motivo, 'sem_vinculo');
    checar('plano pago por fora intacto', linhaDe()?.status, 'active');
    const r2 = await enviar(evento('EXPIRATION', { original_transaction_id: 'GPA.OUTRA', expiration_at_ms: AGORA - 1000 }));
    checar('outra transação → ignorado', r2.body.motivo, 'sem_vinculo');
    checar('nenhuma escrita', escritasAssinatura.length, 0);

    alarmes = [];
    const anon = evento('INITIAL_PURCHASE', { app_user_id: '$RCAnonymousID:123' });
    const r3 = await enviar(anon);
    checar('id anônimo → 200 (reenvio não conserta)', [r3.status, r3.body.acao], [200, 'alarme']);
    checar('...marcado falhou em webhook_events para reconciliar', estadoEvento(anon.id), 'falhou');
    checar('...ALARME no log', alarmes.some((a) => a.includes('ALARME')), true);
    checar('...e o plano do outro usuário não foi tocado', linhaDe(OUTRO), null);
  }

  console.log('\n10) aplicarDecisao isolado — sem linha, encerrar é no-op');
  reset();
  {
    const r = await aplicarDecisao(envBase, { acao: 'encerrar', userId: USER, transacaoId: 'x', vigenciaAte: new Date().toISOString(), eventoEm: new Date().toISOString() });
    checar('sem assinatura → 200 ignorar', [r.http, r.corpo.motivo], [200, 'sem_assinatura']);
  }
} finally {
  console.error = logOriginal;
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
