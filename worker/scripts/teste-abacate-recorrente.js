/**
 * Teste do PIX AUTOMÁTICO (assinatura recorrente) da AbacatePay — Pro mensal.
 *
 *     node worker/scripts/teste-abacate-recorrente.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Roteador REAL (`handleAbacate`) contra FALSOS em memória (fetch trocado): Supabase (`webhook_events` com índice
 * único, filtros por payload, `assinaturas`, `/auth/v1/user`) e a API v2 da AbacatePay (produto, assinatura, cancelar).
 *
 * Trancado aqui:
 *  1. FLAG: desligada por padrão (config, criação 503, nada chama a AbacatePay); ligada exige produto e chave;
 *     cancelar e webhook funcionam mesmo com a flag desligada.
 *  2. CRIAÇÃO: auth, produto do catálogo (R$ 39 / MONTHLY), cadastro do checkout, bloqueios (já ativa, Pro vigente).
 *  3. EVENTOS: completed, renewed, payment_failed, cancelled — com leitura na AbacatePay, vínculo pelo NOSSO cadastro.
 *  4. IDEMPOTÊNCIA: replay não soma vigência; evento repetido = 200 sem reprocessar; fora de ordem não come ciclo pago.
 *  5. FALHA DE PAGAMENTO: cancela pela API e termina o Pro no fim do ciclo pago, sem tocar vigência de outra fonte.
 *  6. SEGREDO: webhook sem o segredo = 401; segredo e dado do cliente nunca no banco/log.
 *  7. CONTA EXCLUÍDA: cancela a assinatura e derruba checkouts abertos.
 */
import { handleAbacate } from '../src/abacate.js';
import { ancoraDoPagamento, cancelarPixAutomaticoDoUsuario, fimDoCicloPago, GRACA_MS } from '../src/abacatePixAutomatico.js';
import { modoAbacate, ABACATE_API } from '../src/abacate.js';

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

const SUPA = 'https://supa.teste';
const SEGREDO = 'segredo-do-webhook-NUNCA-NO-BANCO';
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const OUTRO = '11111111-2222-4333-8444-555555555555';
const PRODUTO = 'prod_PRO_MENSAL_39';
const DIA = 864e5;

const baseEnv = () => ({
  SUPABASE_URL: SUPA,
  SUPABASE_ANON_KEY: 'anon-falsa',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falsa',
  ABACATEPAY_API_KEY: 'abc_live_chave_falsa',
  ABACATE_WEBHOOK_SECRET: SEGREDO,
  ABACATEHOOK_RL: { limit: async () => ({ success: true }) },
  ABACATE_RL: { limit: async () => ({ success: true }) },
});
const envLigado = () => ({ ...baseEnv(), ABACATE_PIX_AUTOMATICO: 'true', ABACATE_PA_PRODUTO_PRO_MENSAL: PRODUTO });

// ── estado dos falsos ────────────────────────────────────────
const db = { eventos: new Map(), assinaturas: new Map(), upserts: 0, buscaFora: false };
const abacate = { produto: null, subs: new Map(), checkouts: new Map(), chamadas: [], fora: false, cancelaFalha: false, seq: 0 };
let corposGravados = [];
let logs = [];
const NOW = () => new Date().toISOString();

function reset() {
  db.eventos = new Map();
  db.assinaturas = new Map();
  db.upserts = 0;
  db.buscaFora = false;
  abacate.produto = { id: PRODUTO, price: 3900, cycle: 'MONTHLY', status: 'ACTIVE' };
  abacate.subs = new Map();
  abacate.checkouts = new Map();
  abacate.chamadas = [];
  abacate.fora = false;
  abacate.cancelaFalha = false;
  abacate.seq = 0;
  corposGravados = [];
  logs = [];
}

const resp = (status, obj) =>
  new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (data) => resp(200, { success: true, data, error: null });
const erro = (status, msg) => resp(status, { success: false, data: null, error: msg });

function filtroPayload(url) {
  const f = {};
  for (const [k, v] of url.searchParams) if (k.startsWith('payload->>')) f[k.slice('payload->>'.length)] = v.replace(/^eq\./, '');
  return f;
}

globalThis.fetch = async (entrada, init = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const metodo = (init.method || 'GET').toUpperCase();
  const corpo = init.body ? String(init.body) : '';
  if (corpo) corposGravados.push(corpo);

  // ── Supabase Auth ──
  if (url.origin === SUPA && url.pathname === '/auth/v1/user') {
    const t = (init.headers?.Authorization || '').replace(/^Bearer\s+/i, '');
    return t.startsWith('jwt-') ? resp(200, { id: t.slice(4), email: 'x@y.z' }) : resp(401, {});
  }

  // ── AbacatePay ──
  if (url.hostname === 'api.abacatepay.com') {
    abacate.chamadas.push(`${metodo} ${url.pathname}`);
    if (abacate.fora) return erro(500, 'fora');
    if (url.pathname === '/v2/products/get') {
      return abacate.produto && url.searchParams.get('id') === abacate.produto.id ? ok(abacate.produto) : erro(404, 'Product not found');
    }
    if (url.pathname === '/v2/subscriptions/create') {
      const b = JSON.parse(corpo);
      const id = `bill_${++abacate.seq}abcdef`;
      const bill = { id, externalId: b.externalId, url: `https://app.abacatepay.com/pay/${id}`, methods: b.methods, items: b.items, metadata: b.metadata, completionUrl: b.completionUrl };
      abacate.checkouts.set(id, bill);
      return ok(bill);
    }
    if (url.pathname === '/v2/subscriptions/get') {
      const id = url.searchParams.get('id');
      const ext = url.searchParams.get('externalId');
      const s = id ? abacate.subs.get(id) : [...abacate.subs.values()].find((x) => abacate.checkouts.get(x.checkoutId)?.externalId === ext);
      return s ? ok(s) : erro(404, 'Subscription not found');
    }
    if (url.pathname === '/v2/subscriptions/cancel') {
      if (abacate.cancelaFalha) return erro(500, 'falhou');
      const s = abacate.subs.get(JSON.parse(corpo).id);
      if (!s) return erro(404, 'Subscription not found');
      if (s.status === 'CANCELLED') return erro(400, "Subscription doesn't exists or not active.");
      s.status = 'CANCELLED';
      return ok(s);
    }
    if (url.pathname === '/v2/subscriptions/checkouts/delete') {
      // Fiel à API real (18/11): o id vem na query; só no corpo = 400.
      const idQ = url.searchParams.get('id');
      if (!idQ) return erro(400, "Expected property 'id' to be string but found: undefined");
      if (!abacate.checkouts.has(idQ)) return erro(400, 'Failed to delete billing');
      abacate.checkouts.delete(idQ);
      return ok({ id: idQ });
    }
    return erro(404, 'rota');
  }

  // ── Supabase REST ──
  if (url.origin === SUPA && url.pathname === '/rest/v1/webhook_events') {
    if (metodo === 'POST') {
      const linha = JSON.parse(corpo);
      const k = `${linha.origem}|${linha.event_id}`;
      if (db.eventos.has(k)) return resp(409, { code: '23505' });
      db.eventos.set(k, { ...linha, recebido_em: NOW(), processado_em: null, erro: null });
      return resp(201, [{ recebido_em: db.eventos.get(k).recebido_em }]);
    }
    const origem = url.searchParams.get('origem')?.replace(/^eq\./, '');
    const eventId = url.searchParams.get('event_id')?.replace(/^eq\./, '');
    if (metodo === 'GET') {
      if (eventId) {
        const l = db.eventos.get(`${origem}|${eventId}`);
        return resp(200, l ? [{ event_id: l.event_id, status: l.status, payload: l.payload, recebido_em: l.recebido_em }] : []);
      }
      if (db.buscaFora) return resp(500, {});
      const f = filtroPayload(url);
      const linhas = [...db.eventos.values()].filter((l) => l.origem === origem && Object.entries(f).every(([k, v]) => l.payload?.[k] === v));
      return resp(200, linhas.map((l) => ({ event_id: l.event_id, status: l.status, payload: l.payload, recebido_em: l.recebido_em })));
    }
    if (metodo === 'PATCH') {
      const l = db.eventos.get(`${origem}|${eventId}`);
      if (l) Object.assign(l, JSON.parse(corpo));
      return resp(204);
    }
  }
  if (url.origin === SUPA && url.pathname === '/rest/v1/assinaturas') {
    if (metodo === 'GET') {
      const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      const a = db.assinaturas.get(uid);
      return resp(200, a ? [a] : []);
    }
    if (metodo === 'POST') {
      const linha = JSON.parse(corpo);
      // Fiel ao Postgres: no INSERT … ON CONFLICT a linha PROPOSTA passa pelo NOT NULL antes do conflito —
      // upsert sem `plano`/`status` falha com 23502 mesmo quando a linha já existe (achado no Modo Teste, 18/11).
      if (!linha.plano || !linha.status) return resp(400, { code: '23502', message: 'null value in column violates not-null constraint' });
      db.upserts++;
      db.assinaturas.set(linha.user_id, { ...db.assinaturas.get(linha.user_id), ...linha });
      return resp(201);
    }
  }
  throw new Error(`fetch inesperado: ${metodo} ${url.href}`);
};

const logOriginal = console.log;
console.error = (...args) => logs.push(args.map(String).join(' '));
console.warn = console.error;

// ── helpers de chamada ───────────────────────────────────────
async function rota(env, metodo, caminho, { user = USER, corpo } = {}) {
  const url = new URL(`https://worker.teste${caminho}`);
  const req = new Request(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer jwt-${user}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const r = await handleAbacate(req, env, url);
  return { status: r.status, corpo: await r.json() };
}
async function hook(env, evt, { segredo = SEGREDO } = {}) {
  const url = new URL(`https://worker.teste/abacate/webhook?webhookSecret=${encodeURIComponent(segredo)}`);
  const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' }, body: JSON.stringify(evt) });
  const r = await handleAbacate(req, env, url);
  return { status: r.status, corpo: await r.json() };
}

/** Cria o checkout pelo endpoint (como o app) e devolve o id. */
async function criarCheckout(env, user = USER) {
  const r = await rota(env, 'POST', '/abacate/assinatura/pix', { user, corpo: { plano: 'pro_mensal' } });
  return { r, id: r.corpo.checkoutId };
}
/** A AbacatePay "nasce" a assinatura depois que o cliente paga na página. */
function pagar(checkoutId, { subId = 'subs_ABC123', status = 'ACTIVE', amount = 3900, method = 'PIX', atras = 0, currentPeriodEnd } = {}) {
  const t = new Date(Date.now() - atras).toISOString();
  const s = { id: subId, checkoutId, customerId: 'cust_1', amount, status, method, devMode: false, createdAt: t, updatedAt: t, ...(currentPeriodEnd ? { currentPeriodEnd } : {}) };
  abacate.subs.set(subId, s);
  return s;
}
const evento = (id, tipo, { subId = 'subs_ABC123', checkoutId, payment = { status: 'PAID', updatedAt: new Date().toISOString() }, extra = {}, sub = {} } = {}) => ({
  id,
  event: tipo,
  apiVersion: 2,
  devMode: false,
  data: {
    subscription: { id: subId, amount: 3900, method: 'PIX', status: 'ACTIVE', frequency: 'MONTHLY', cancelledDueTo: null, ...sub },
    customer: { id: 'cust_1', name: 'Fulana de Tal', email: 'fulana@exemplo.com', taxId: '123.***.***-**' },
    checkout: { id: checkoutId, frequency: 'SUBSCRIPTION' },
    payment,
    ...extra,
  },
});
const assin = (u = USER) => db.assinaturas.get(u);
const subReg = (id = 'subs_ABC123') => db.eventos.get(`abacate_pa_sub|${id}`);
const trilha = (id) => db.eventos.get(`abacatepay|${id}`);
const ms = (iso) => Date.parse(iso);
const perto = (a, b, tol = 5000) => Math.abs(a - b) <= tol;

// ─────────────────────────────────────────────────────────────
console.log('\n1) FLAG desligada (padrão): config false, criação 503, a AbacatePay nem é chamada');
reset();
let env = baseEnv(); // sem a flag
let r = await rota(env, 'GET', '/abacate/config', { user: null });
checar('config: pixAutomatico false (Pix avulso segue ligado)', [r.corpo.pix, r.corpo.pixAutomatico], [true, false]);
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('criar: 503 pix_automatico_desligado', [r.status, r.corpo.erro], [503, 'pix_automatico_desligado']);
checar('nenhuma chamada à AbacatePay', abacate.chamadas.length, 0);
for (const valor of ['false', 'TRUE', '1', '', undefined]) {
  const e = { ...baseEnv(), ABACATE_PIX_AUTOMATICO: valor, ABACATE_PA_PRODUTO_PRO_MENSAL: PRODUTO };
  r = await rota(e, 'GET', '/abacate/config', { user: null });
  checar(`flag=${JSON.stringify(valor)} continua desligada`, r.corpo.pixAutomatico, false);
}
r = await rota({ ...baseEnv(), ABACATE_PIX_AUTOMATICO: 'true' }, 'GET', '/abacate/config', { user: null });
checar('flag ligada SEM produto: desligada', r.corpo.pixAutomatico, false);
r = await rota({ ...envLigado(), ABACATEPAY_API_KEY: '' }, 'GET', '/abacate/config', { user: null });
checar('flag ligada SEM chave: desligada', r.corpo.pixAutomatico, false);
r = await rota({ ...envLigado(), ABACATEPAY_API_KEY: 'abc_dev_x' }, 'GET', '/abacate/config', { user: null });
checar('chave de dev sem ABACATE_PERMITIR_DEV: desligada', r.corpo.pixAutomatico, false);

console.log('\n2) FLAG ligada: config true');
env = envLigado();
r = await rota(env, 'GET', '/abacate/config', { user: null });
checar('config: pixAutomatico true', r.corpo.pixAutomatico, true);

console.log('\n3) CRIAÇÃO');
reset();
r = await rota(env, 'POST', '/abacate/assinatura/pix', { user: null, corpo: { plano: 'pro_mensal' } });
checar('sem login: 401', r.status, 401);
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_anual' } });
checar('só o Pro mensal: 400 plano_invalido', [r.status, r.corpo.erro], [400, 'plano_invalido']);
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'empresa_mensal' } });
checar('empresa: 400', r.status, 400);
const c1 = await criarCheckout(env);
checar('200 com a página de autorização', [c1.r.status, c1.r.corpo.ok, c1.r.corpo.url.startsWith('https://app.abacatepay.com/pay/'), c1.r.corpo.plano.valor], [200, true, true, 39]);
const bill = abacate.checkouts.get(c1.id);
checar('checkout: 1 item, só PIX, externalId amarrado ao usuário', [bill.items, bill.methods, bill.externalId.startsWith(`olli:pa:${USER}:`), bill.externalId.endsWith(':pro_mensal')], [[{ id: PRODUTO, quantity: 1 }], ['PIX'], true, true]);
checar('cadastro do checkout em webhook_events', [db.eventos.get(`abacate_pa|${c1.id}`)?.payload?.user_id, db.eventos.get(`abacate_pa|${c1.id}`)?.payload?.plano], [USER, 'pro_mensal']);
checar('nada concedido ainda', db.upserts, 0);

reset();
abacate.produto.price = 5000;
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('produto com preço errado: 503 produto_invalido, não cria checkout', [r.status, r.corpo.erro, abacate.checkouts.size], [503, 'produto_invalido', 0]);
reset();
abacate.produto.cycle = 'ANNUALLY';
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('produto com ciclo errado: 503', [r.status, r.corpo.erro], [503, 'produto_invalido']);
reset();
abacate.fora = true;
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('AbacatePay fora: 503 sem cadastro', [r.status, db.eventos.size], [503, 0]);

reset();
db.assinaturas.set(USER, { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(Date.now() + 40 * DIA).toISOString() });
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('Pro vigente por 40 dias: 409 plano_ainda_ativo (evita pagar em dobro)', [r.status, r.corpo.erro, !!r.corpo.ate], [409, 'plano_ainda_ativo', true]);
db.assinaturas.set(USER, { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(Date.now() + 2 * DIA).toISOString() });
r = await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('Pro vencendo em 2 dias: pode assinar', r.status, 200);

console.log('\n4) subscription.completed: lê a assinatura na AbacatePay, libera o Pro até o fim do ciclo (+ folga)');
reset();
const c2 = await criarCheckout(env);
pagar(c2.id);
r = await hook(env, evento('log_c1', 'subscription.completed', { checkoutId: c2.id }));
checar('200 ok', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
const fimEsperado = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.getTime() + GRACA_MS; })();
checar('Pro ativo ~1 mês + folga', [assin().plano, assin().status, perto(ms(assin().current_period_end), fimEsperado, 10_000)], ['pro', 'active', true]);
checar('NÃO mexe em stripe_subscription_id', 'stripe_subscription_id' in assin(), false);
checar('cadastro da assinatura: ativa, dono, checkout', [subReg().status, subReg().payload.estado, subReg().payload.user_id, subReg().payload.checkout], ['recebido', 'ativa', USER, c2.id]);
checar('trilha ok', [trilha('log_c1').status, trilha('log_c1').payload.resultado, trilha('log_c1').payload.motivo], ['processado', 'ok', 'assinatura_ativa']);
checar('estado da conta: ativa', (await rota(env, 'GET', '/abacate/assinatura/estado')).corpo.ativa, true);
checar('segunda criação: 409 assinatura_ja_ativa', (await rota(env, 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } })).corpo.erro, 'assinatura_ja_ativa');

console.log('\n5) IDEMPOTÊNCIA: mesmo evento 2x = 200 sem reprocessar; outro evento do mesmo pagamento = mesma vigência');
const antesUps = db.upserts;
const fimAntes = assin().current_period_end;
const chamadasAntes = abacate.chamadas.length;
r = await hook(env, evento('log_c1', 'subscription.completed', { checkoutId: c2.id }));
checar('duplicado', [r.status, r.corpo], [200, { ok: true, duplicado: true }]);
checar('nem releu a AbacatePay nem regravou', [abacate.chamadas.length, db.upserts], [chamadasAntes, antesUps]);
const pagamentoOriginal = { status: 'PAID', updatedAt: abacate.subs.get('subs_ABC123').updatedAt };
r = await hook(env, evento('log_c1_replay', 'subscription.completed', { checkoutId: c2.id, payment: pagamentoOriginal }));
checar('replay (id novo, MESMO pagamento): vigência igual (não soma)', [r.status, assin().current_period_end], [200, fimAntes]);
await hook(env, evento('log_c1_replay2', 'subscription.completed', { checkoutId: c2.id, payment: pagamentoOriginal }));
checar('replay de novo: ainda igual', assin().current_period_end, fimAntes);

console.log('\n6) subscription.renewed: estende para o próximo ciclo');
const s = abacate.subs.get('subs_ABC123');
const t0 = Date.now();
const proximo = new Date(t0 + 31 * DIA);
// o ciclo seguinte: a AbacatePay informa o fim do ciclo pago
s.currentPeriodEnd = new Date(t0 + 31 * DIA).toISOString();
r = await hook(env, evento('log_r1', 'subscription.renewed', { checkoutId: c2.id, payment: { status: 'PAID', updatedAt: new Date().toISOString() } }));
checar('200 ok / renovada', [r.status, trilha('log_r1').payload.motivo], [200, 'renovada']);
checar('vigência = fim informado + folga', perto(ms(assin().current_period_end), proximo.getTime() + GRACA_MS, 1000), true);
checar('registro guarda pago_ate e concedido_ate', [perto(subReg().payload.pago_ate, proximo.getTime(), 1000), perto(subReg().payload.concedido_ate, proximo.getTime() + GRACA_MS, 1000)], [true, true]);
const fimRenovado = assin().current_period_end;
r = await hook(env, evento('log_r1b', 'subscription.renewed', { checkoutId: c2.id }));
checar('renewed repetido (id novo): não passa do que a AbacatePay informou', assin().current_period_end, fimRenovado);
delete s.currentPeriodEnd;

console.log('\n7) subscription.payment_failed: cancela pela API e o Pro termina no fim do ciclo JÁ pago');
reset();
const c3 = await criarCheckout(env);
const sub3 = pagar(c3.id, { currentPeriodEnd: new Date(Date.now() + 20 * DIA).toISOString() });
await hook(env, evento('log_f0', 'subscription.completed', { checkoutId: c3.id }));
const pagoAte3 = subReg().payload.pago_ate;
r = await hook(env, evento('log_f1', 'subscription.payment_failed', { checkoutId: c3.id, payment: { status: 'FAILED' }, extra: { rejectCode: 'AM04', installmentNumber: 2 } }));
checar('200 encerrada', [r.status, r.corpo], [200, { ok: true, estado: 'encerrada' }]);
checar('cancelou na AbacatePay', [sub3.status, abacate.chamadas.includes('POST /v2/subscriptions/cancel')], ['CANCELLED', true]);
checar('Pro vale só até o fim do ciclo pago (sem a folga)', [assin().plano, assin().status, ms(assin().current_period_end) === pagoAte3], ['pro', 'active', true]);
checar('cadastro: encerrada, motivo com o código do banco', [subReg().status, subReg().payload.estado, subReg().payload.motivo], ['processado', 'encerrada', 'pagamento_recusado:AM04']);
checar('estado da conta: não ativa', (await rota(env, 'GET', '/abacate/assinatura/estado')).corpo.ativa, false);
const upsAntes7 = db.upserts;
r = await hook(env, evento('log_f2', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c3.id, extra: { rejectCode: 'AM04' } }));
checar('falha repetida: ignorada (já encerrada), sem nova escrita', [r.status, trilha('log_f2').payload.motivo, db.upserts], [200, 'ja_encerrada', upsAntes7]);

console.log('\n7b) payment_failed com o ciclo pago JÁ vencido: volta ao grátis agora');
reset();
const c3b = await criarCheckout(env);
pagar(c3b.id);
await hook(env, evento('log_g0', 'subscription.completed', { checkoutId: c3b.id }));
subReg().payload.pago_ate = Date.now() - 3600e3; // o ciclo pago acabou há 1 h (a folga ainda segura o acesso)
await hook(env, evento('log_g1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c3b.id, extra: { rejectCode: 'AM04' } }));
checar('status canceled e fim ~agora', [assin().status, perto(ms(assin().current_period_end), Date.now(), 5000)], ['canceled', true]);

console.log('\n7c) payment_failed NÃO encurta vigência vinda de outra fonte (Pix avulso mais longo)');
reset();
const c3c = await criarCheckout(env);
pagar(c3c.id);
const longo = new Date(Date.now() + 200 * DIA).toISOString();
db.assinaturas.set(USER, { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(Date.now() + 1 * DIA).toISOString() });
await hook(env, evento('log_h0', 'subscription.completed', { checkoutId: c3c.id }));
db.assinaturas.set(USER, { ...assin(), current_period_end: longo }); // outra fonte estende depois
await hook(env, evento('log_h1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c3c.id, extra: { rejectCode: 'AM04' } }));
checar('vigência de outra fonte intacta', assin().current_period_end, longo);

console.log('\n7d) cancelamento na API falha: 503 e o reenvio conclui');
reset();
const c3d = await criarCheckout(env);
pagar(c3d.id);
await hook(env, evento('log_i0', 'subscription.completed', { checkoutId: c3d.id }));
abacate.cancelaFalha = true;
r = await hook(env, evento('log_i1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c3d.id, extra: { rejectCode: 'AM04' } }));
checar('503 + trilha falhou', [r.status, trilha('log_i1').status, trilha('log_i1').erro], [503, 'falhou', 'cancelar_falhou']);
checar('assinatura segue ativa no cadastro', subReg().payload.estado, 'ativa');
abacate.cancelaFalha = false;
r = await hook(env, evento('log_i1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c3d.id, extra: { rejectCode: 'AM04' } }));
checar('reenvio: 200 e encerrada', [r.status, subReg().payload.estado], [200, 'encerrada']);

console.log('\n8) subscription.cancelled: cliente cancelou no banco — não cancela de novo, acesso até o fim do ciclo pago');
reset();
const c4 = await criarCheckout(env);
const sub4 = pagar(c4.id, { currentPeriodEnd: new Date(Date.now() + 15 * DIA).toISOString() });
await hook(env, evento('log_k0', 'subscription.completed', { checkoutId: c4.id }));
sub4.status = 'CANCELLED';
const cancelsAntes = abacate.chamadas.filter((x) => x.endsWith('/cancel')).length;
r = await hook(env, evento('log_k1', 'subscription.cancelled', { checkoutId: c4.id, sub: { status: 'CANCELLED', cancelledDueTo: 'pix_automatic_authorization_refused' } }));
checar('200 encerrada', [r.status, r.corpo.estado], [200, 'encerrada']);
checar('motivo pix_automatic_authorization_refused', subReg().payload.motivo, 'pix_automatic_authorization_refused');
checar('não chamou /cancel (já cancelada)', abacate.chamadas.filter((x) => x.endsWith('/cancel')).length, cancelsAntes);
checar('acesso até o fim do ciclo pago', ms(assin().current_period_end) === subReg().payload.pago_ate, true);
r = await hook(env, evento('log_k2', 'subscription.cancelled', { checkoutId: c4.id, sub: { status: 'CANCELLED', cancelledDueTo: 'Cancelada pelo cliente no portal: caro demais' } }));
checar('cancelled repetido: ignorado', trilha('log_k2').payload.motivo, 'ja_encerrada');

console.log('\n9) FORA DE ORDEM: cancelled/renewed velho não come ciclo pago, não reativa assinatura cancelada');
reset();
const c5 = await criarCheckout(env);
const sub5 = pagar(c5.id, { status: 'CANCELLED' }); // já cancelada quando o "completed" chega depois
r = await hook(env, evento('log_o1', 'subscription.completed', { checkoutId: c5.id, payment: { status: 'PAID', updatedAt: new Date().toISOString() } }));
checar('pagou o 1º ciclo e cancelou logo: o ciclo pago é concedido', [r.status, assin()?.plano], [200, 'pro']);
checar('cadastro nasce encerrada (não reativa)', subReg().payload.estado, 'encerrada');
reset();
const c5b = await criarCheckout(env);
pagar(c5b.id, { status: 'CANCELLED' });
r = await hook(env, evento('log_o2', 'subscription.renewed', { checkoutId: c5b.id, payment: { status: 'PENDING' } }));
checar('cancelada e sem pagamento: nada concedido', [r.status, trilha('log_o2').payload.motivo, db.upserts], [200, 'assinatura_cancelada', 0]);

console.log('\n10) DEFESAS: valor, método, checkout alheio, dev, sem vínculo, sem data');
reset();
let ce = await criarCheckout(env);
pagar(ce.id, { amount: 100 });
r = await hook(env, evento('log_d1', 'subscription.completed', { checkoutId: ce.id }));
checar('valor diferente do catálogo: não libera (erro na trilha)', [r.status, trilha('log_d1').payload.motivo, db.upserts], [200, 'invalida_valor_divergente', 0]);
reset();
ce = await criarCheckout(env);
pagar(ce.id, { method: 'CARD' });
r = await hook(env, evento('log_d2', 'subscription.completed', { checkoutId: ce.id }));
checar('método não PIX: não libera', [trilha('log_d2').payload.motivo, db.upserts], ['invalida_metodo_nao_pix', 0]);
reset();
ce = await criarCheckout(env);
pagar(ce.id);
r = await hook(env, evento('log_d3', 'subscription.completed', { checkoutId: 'bill_OUTRO_CHECKOUT' }));
checar('checkout que NÓS não criamos: sem vínculo, nada concedido', [r.status, r.corpo, db.upserts], [200, { ok: true, sem_vinculo: true }, 0]);
reset();
ce = await criarCheckout(env);
pagar(ce.id).checkoutId = 'bill_OUTRO_CHECKOUT'; // a assinatura lida NÃO veio do nosso checkout
r = await hook(env, evento('log_d4', 'subscription.completed', { checkoutId: ce.id }));
checar('assinatura de outro checkout: não libera', [trilha('log_d4').payload.motivo, db.upserts], ['invalida_checkout_divergente', 0]);
reset();
ce = await criarCheckout(env);
const dev = pagar(ce.id);
dev.devMode = true;
r = await hook(env, evento('log_d5', 'subscription.completed', { checkoutId: ce.id }));
checar('assinatura de teste (devMode) em produção: não libera', [trilha('log_d5').payload.motivo, db.upserts], ['invalida_dev_mode', 0]);
reset();
ce = await criarCheckout(env);
pagar(ce.id, { atras: 30 * DIA }); // criada/atualizada há 30 dias e sem data de pagamento recente no evento
r = await hook(env, evento('log_d6', 'subscription.completed', { checkoutId: ce.id, payment: { status: 'PAID', updatedAt: new Date(Date.now() - 30 * DIA).toISOString() } }));
checar('sem data de pagamento recente: não concede', [r.status, trilha('log_d6').payload.motivo, db.upserts], [200, 'sem_data_do_pagamento', 0]);
checar('trial_started/plan_changed: ignorados (não existem no Pix Automático)', [(await hook(env, evento('log_d7', 'subscription.trial_started', { checkoutId: ce.id }))).corpo, (await hook(env, evento('log_d8', 'subscription.plan_changed', { checkoutId: ce.id }))).corpo], [{ ok: true }, { ok: true }]);
r = await hook(env, evento('log_d9', 'checkout.completed', { checkoutId: ce.id }));
checar('checkout.completed de assinatura NÃO concede (um evento só libera)', [r.status, db.upserts], [200, 0]);
r = await hook(env, { id: 'log_d10', event: 'subscription.completed', data: {} });
checar('sem id de assinatura: ignorado', [r.status, trilha('log_d10').payload.motivo], [200, 'sem_assinatura']);

console.log('\n11) AbacatePay fora na leitura: 503 e o reenvio libera');
reset();
const c6 = await criarCheckout(env);
pagar(c6.id);
abacate.fora = true;
r = await hook(env, evento('log_x1', 'subscription.completed', { checkoutId: c6.id }));
checar('503', [r.status, r.corpo], [503, { erro: 'indisponivel' }]);
abacate.fora = false;
r = await hook(env, evento('log_x1', 'subscription.completed', { checkoutId: c6.id }));
checar('reenvio: 200 e Pro ativo', [r.status, assin()?.plano], [200, 'pro']);

console.log('\n12) Webhook: sem o segredo 401; funciona com a flag DESLIGADA (assinatura que existe tem de poder terminar)');
reset();
const c7 = await criarCheckout(env);
pagar(c7.id);
r = await hook(env, evento('log_s1', 'subscription.completed', { checkoutId: c7.id }), { segredo: 'chute' });
checar('401 e nada gravado na trilha', [r.status, trilha('log_s1')], [401, undefined]);
await hook(env, evento('log_s2', 'subscription.completed', { checkoutId: c7.id }));
const semFlag = baseEnv();
r = await hook(semFlag, evento('log_s3', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: c7.id, extra: { rejectCode: 'AM04' } }));
checar('flag desligada: payment_failed ainda cancela e encerra', [r.status, subReg().payload.estado], [200, 'encerrada']);

console.log('\n13) Cancelar pelo app (POST /abacate/assinatura/cancelar)');
reset();
const c8 = await criarCheckout(env);
const sub8 = pagar(c8.id, { currentPeriodEnd: new Date(Date.now() + 10 * DIA).toISOString() });
await hook(env, evento('log_z0', 'subscription.completed', { checkoutId: c8.id }));
r = await rota(env, 'POST', '/abacate/assinatura/cancelar', { user: null });
checar('sem login: 401', r.status, 401);
r = await rota(env, 'POST', '/abacate/assinatura/cancelar', { user: OUTRO });
checar('outra conta: 404 sem_assinatura (não cancela a alheia)', [r.status, sub8.status], [404, 'ACTIVE']);
abacate.cancelaFalha = true;
r = await rota(env, 'POST', '/abacate/assinatura/cancelar');
checar('AbacatePay recusa: 502 e continua ativa', [r.status, subReg().payload.estado], [502, 'ativa']);
abacate.cancelaFalha = false;
r = await rota(env, 'POST', '/abacate/assinatura/cancelar');
checar('cancelada: 200 com data até quando vale', [r.status, r.corpo.ok, !!r.corpo.ate, sub8.status], [200, true, true, 'CANCELLED']);
checar('cadastro: encerrada pelo cliente; acesso até o fim do ciclo pago', [subReg().payload.motivo, ms(assin().current_period_end) === subReg().payload.pago_ate], ['cancelada_pelo_cliente_no_olli', true]);
r = await rota(env, 'POST', '/abacate/assinatura/cancelar');
checar('de novo: 404 sem_assinatura', [r.status, r.corpo.erro], [404, 'sem_assinatura']);
r = await rota(baseEnv(), 'POST', '/abacate/assinatura/pix', { corpo: { plano: 'pro_mensal' } });
checar('(com a flag desligada a criação segue 503)', r.status, 503);

console.log('\n14) Status por polling: só o dono vê; libera quando a assinatura nasceu');
reset();
const c9 = await criarCheckout(env);
r = await rota(env, 'GET', `/abacate/assinatura/status?checkout=${c9.id}`);
checar('ainda não pagou: ativa false', [r.status, r.corpo.ativa, db.upserts], [200, false, 0]);
r = await rota(env, 'GET', `/abacate/assinatura/status?checkout=${c9.id}`, { user: OUTRO });
checar('outra conta: 404', r.status, 404);
r = await rota(env, 'GET', '/abacate/assinatura/status?checkout=ruim!', {});
checar('id inválido: 400', r.status, 400);
pagar(c9.id);
r = await rota(env, 'GET', `/abacate/assinatura/status?checkout=${c9.id}`);
checar('pagou: ativa e Pro liberado pelo servidor', [r.status, r.corpo.ativa, assin()?.plano], [200, true, 'pro']);
const fimPoll = assin().current_period_end;
await rota(env, 'GET', `/abacate/assinatura/status?checkout=${c9.id}`);
checar('polling repetido: mesma vigência', assin().current_period_end, fimPoll);
r = await hook(env, evento('log_p1', 'subscription.completed', { checkoutId: c9.id }));
checar('webhook depois do polling: vigência não anda mais que segundos (não soma ciclo)', [r.status, perto(ms(assin().current_period_end), ms(fimPoll), 60_000)], [200, true]);

console.log('\n15) Exclusão de conta: cancela a assinatura e derruba checkouts abertos');
reset();
const c10 = await criarCheckout(env);
const sub10 = pagar(c10.id);
await hook(env, evento('log_e0', 'subscription.completed', { checkoutId: c10.id }));
const c10b = await criarCheckout(env, OUTRO); // checkout de OUTRA conta não pode ser derrubado
const h = { modoAbacate, api: ABACATE_API };
checar('sem chave da AbacatePay: ok sem chamar nada', await cancelarPixAutomaticoDoUsuario({ ...baseEnv(), ABACATEPAY_API_KEY: '' }, USER, h), 'ok');
abacate.cancelaFalha = true;
checar('cancelamento falha: fail-closed', await cancelarPixAutomaticoDoUsuario(env, USER, h), 'falha');
abacate.cancelaFalha = false;
checar('ok', await cancelarPixAutomaticoDoUsuario(env, USER, h), 'ok');
checar('assinatura cancelada e encerrada no cadastro', [sub10.status, subReg().payload.estado, subReg().payload.motivo], ['CANCELLED', 'encerrada', 'conta_excluida']);
checar('checkout da conta derrubado; o de outra conta não', [abacate.checkouts.has(c10.id), abacate.checkouts.has(c10b.id)], [false, true]);

console.log('\n16) Funções puras: âncora e fim do ciclo');
const agora = Date.parse('2026-12-10T12:00:00Z');
checar('âncora recente vale', ancoraDoPagamento(['2026-12-10T11:00:00Z'], agora), Date.parse('2026-12-10T11:00:00Z'));
checar('âncora de 8 dias não vale', ancoraDoPagamento(['2026-12-02T11:00:00Z'], agora), null);
checar('âncora no futuro (>1 h) não vale', ancoraDoPagamento(['2026-12-11T12:00:00Z'], agora), null);
checar('pula candidata ruim e usa a próxima', ancoraDoPagamento(['lixo', null, '2026-12-09T12:00:00Z'], agora), Date.parse('2026-12-09T12:00:00Z'));
checar('fim do ciclo: currentPeriodEnd plausível vence', fimDoCicloPago({ currentPeriodEnd: '2027-01-09T12:00:00Z' }, agora, agora), Date.parse('2027-01-09T12:00:00Z'));
checar('fim do ciclo: currentPeriodEnd absurdo (2099) é ignorado', fimDoCicloPago({ currentPeriodEnd: '2099-01-01T00:00:00Z' }, agora, agora), (() => { const d = new Date(agora); d.setMonth(d.getMonth() + 1); return d.getTime(); })());
checar('fim do ciclo: sem âncora e sem data = null', fimDoCicloPago({}, null, agora), null);

console.log('\n18) DUPLICIDADE: 2 checkouts pagos = só 1 assinatura ativa (a 2ª é cancelada, sem conceder)');
reset();
const dA = await criarCheckout(env);
// o 2º checkout só pode ser criado "em paralelo": o bloqueio de criação já barra o 2º, então registra à mão
db.eventos.set('abacate_pa|bill_PARALELO1', { origem: 'abacate_pa', event_id: 'bill_PARALELO1', payload: { user_id: USER, plano: 'pro_mensal', external_id: 'x' }, status: 'recebido' });
pagar(dA.id, { subId: 'subs_AAA111' });
pagar('bill_PARALELO1', { subId: 'subs_BBB222' });
await hook(env, evento('log_dup1', 'subscription.completed', { subId: 'subs_AAA111', checkoutId: dA.id }));
const fimDup = assin().current_period_end;
r = await hook(env, evento('log_dup2', 'subscription.completed', { subId: 'subs_BBB222', checkoutId: 'bill_PARALELO1' }));
checar('2ª cancelada na AbacatePay, 200, trilha erro visível', [r.status, abacate.subs.get('subs_BBB222').status, trilha('log_dup2').payload.motivo], [200, 'CANCELLED', 'assinatura_duplicada_cancelada']);
checar('1ª segue ativa e vigência intacta', [abacate.subs.get('subs_AAA111').status, subReg('subs_AAA111').payload.estado, assin().current_period_end], ['ACTIVE', 'ativa', fimDup]);
checar('2ª registrada como encerrada (duplicada)', [subReg('subs_BBB222').payload.estado, subReg('subs_BBB222').payload.motivo], ['encerrada', 'duplicada_cancelada']);
// /cancelar percorre TODAS as ativas
db.eventos.set('abacate_pa_sub|subs_CCC333', { origem: 'abacate_pa_sub', event_id: 'subs_CCC333', status: 'recebido', payload: { user_id: USER, plano: 'pro_mensal', checkout: 'bill_X', estado: 'ativa', pago_ate: Date.now() + 5 * DIA, concedido_ate: null } });
abacate.subs.set('subs_CCC333', { id: 'subs_CCC333', status: 'ACTIVE' });
r = await rota(env, 'POST', '/abacate/assinatura/cancelar');
checar('cancelar: TODAS as ativas canceladas', [r.status, abacate.subs.get('subs_AAA111').status, abacate.subs.get('subs_CCC333').status, subReg('subs_CCC333').payload.estado], [200, 'CANCELLED', 'CANCELLED', 'encerrada']);

console.log('\n19) payment_failed ATRASADO (depois de um ciclo já pago) não cancela quem paga');
reset();
const cS = await criarCheckout(env);
const subS = pagar(cS.id, { currentPeriodEnd: new Date(Date.now() + 5 * DIA).toISOString() });
await hook(env, evento('log_s0', 'subscription.completed', { checkoutId: cS.id }));
subS.currentPeriodEnd = new Date(Date.now() + 33 * DIA).toISOString();
await hook(env, evento('log_s1', 'subscription.renewed', { checkoutId: cS.id }));
const cancelsS = abacate.chamadas.filter((x) => x.endsWith('/cancel')).length;
r = await hook(env, evento('log_s2', 'subscription.payment_failed', { checkoutId: cS.id, payment: { status: 'FAILED', createdAt: new Date(Date.now() - 2 * DIA).toISOString() }, extra: { rejectCode: 'AM04' } }));
checar('ignorada: não cancelou, assinatura ativa, Pro mantido', [r.status, trilha('log_s2').payload.motivo, abacate.chamadas.filter((x) => x.endsWith('/cancel')).length, subReg().payload.estado, subS.status], [200, 'falha_antiga_ciclo_posterior_pago', cancelsS, 'ativa', 'ACTIVE']);
r = await hook(env, evento('log_s3', 'subscription.payment_failed', { checkoutId: cS.id, payment: { status: 'FAILED', createdAt: new Date(Date.now() + 33 * DIA - 3600e3).toISOString() }, extra: { rejectCode: 'AM04' } }));
checar('falha do ciclo atual (perto do fim do ciclo pago): cancela', [r.status, subS.status, subReg().payload.estado], [200, 'CANCELLED', 'encerrada']);
reset();
const cT = await criarCheckout(env);
const subT = pagar(cT.id);
await hook(env, evento('log_t0', 'subscription.completed', { checkoutId: cT.id }));
abacate.fora = true;
r = await hook(env, evento('log_t1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: cT.id, extra: { rejectCode: 'AM04' } }));
checar('não consegui ler a assinatura: 503 (reenvia), nada encerrado', [r.status, subReg().payload.estado], [503, 'ativa']);
abacate.fora = false;
subT.status = 'CANCELLED';
const cancelsT = abacate.chamadas.filter((x) => x.endsWith('/cancel')).length;
await hook(env, evento('log_t1', 'subscription.payment_failed', { payment: { status: 'FAILED' }, checkoutId: cT.id, extra: { rejectCode: 'AM04' } }));
checar('já cancelada na AbacatePay: encerra sem cancelar de novo', [subReg().payload.estado, abacate.chamadas.filter((x) => x.endsWith('/cancel')).length], ['encerrada', cancelsT]);

console.log('\n20) renewed ATRASADO de assinatura CANCELADA: ciclo pago SEM folga');
reset();
const cU = await criarCheckout(env);
pagar(cU.id, { status: 'CANCELLED' });
await hook(env, evento('log_u1', 'subscription.renewed', { checkoutId: cU.id, payment: { status: 'PAID', updatedAt: new Date().toISOString() } }));
checar('concedido = pago_ate (sem os 2 dias)', [subReg().payload.estado, subReg().payload.concedido_ate === subReg().payload.pago_ate, ms(assin().current_period_end) === subReg().payload.pago_ate], ['encerrada', true, true]);

console.log('\n21) Exclusão de conta com a flag DESLIGADA e a consulta falhando: não trava; com a flag ligada: fail-closed');
reset();
db.buscaFora = true;
checar('flag desligada + consulta fora: ok', await cancelarPixAutomaticoDoUsuario(baseEnv(), USER, h), 'ok');
checar('flag ligada + consulta fora: falha', await cancelarPixAutomaticoDoUsuario(env, USER, h), 'falha');

console.log('\n22) Cancelar com a CHAVE da AbacatePay desligada: encerra só localmente e diz isso');
reset();
const cV = await criarCheckout(env);
pagar(cV.id, { currentPeriodEnd: new Date(Date.now() + 9 * DIA).toISOString() });
await hook(env, evento('log_v0', 'subscription.completed', { checkoutId: cV.id }));
const chamadasV = abacate.chamadas.length;
r = await rota({ ...envLigado(), ABACATEPAY_API_KEY: '' }, 'POST', '/abacate/assinatura/cancelar');
checar('200 canceladoNaAbacate:false, encerrada local, sem chamar a API', [r.status, r.corpo.canceladoNaAbacate, subReg().payload.estado, abacate.chamadas.length], [200, false, 'encerrada', chamadasV]);

console.log('\n17) Segredo e dado do cliente nunca no banco nem no log');
const tudo = corposGravados.join('\n') + logs.join('\n');
checar('webhookSecret ausente', [tudo.includes(SEGREDO), tudo.includes('webhookSecret'), tudo.includes('chute')], [false, false, false]);
checar('nome/e-mail/CPF do cliente ausentes', [tudo.includes('Fulana'), tudo.includes('fulana@'), tudo.includes('123.***')], [false, false, false]);

console.log = logOriginal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
