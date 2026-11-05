/**
 * Teste da troca D-1063: as rotas /mp/* cobram pela AbacatePay, com o MESMO contrato
 * que o app instalado lê (src/services/pixCreditos.ts).
 *
 *     node worker/scripts/teste-mp-abacate.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Roteador REAL (`handleMercadoPago` e `handleAbacate`) contra FALSOS em memória:
 * Supabase (auth, webhook_events com (origem,event_id) único, credit_ledger com
 * (origem,ref) único) e a API v2 da AbacatePay (create/get/check).
 *
 * Trancado aqui:
 *  1. POST /mp/pix com a AbacatePay ligada cria a cobrança LÁ (valor do catálogo,
 *     24 h, vínculo olli:cr) e responde brCode/brCodeBase64/status/expiresAt/pacote.
 *  2. Pago: /mp/status credita UMA vez (polling repetido, webhook e reenvio não somam).
 *  3. Cobrança alheia ou com valor fora do catálogo: 404 e nada creditado.
 *  4. Ledger fora: 502, consumo 'falhou', e a próxima leitura credita.
 *  5. AbacatePay desligada: o MP volta a responder (rollback sem deploy) e id
 *     numérico continua indo ao MP.
 */
import { handleAbacate } from '../src/abacate.js';
import { handleMercadoPago } from '../src/mercadopago.js';

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
const SEGREDO = 'segredo-do-webhook';
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const OUTRO = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'jwt-do-usuario';

const envBase = {
  SUPABASE_URL: SUPA,
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falsa',
  ABACATEPAY_API_KEY: 'abc_live_chave_falsa',
  ABACATE_WEBHOOK_SECRET: SEGREDO,
  ABACATE_RL: { limit: async () => ({ success: true }) },
  ABACATEHOOK_RL: { limit: async () => ({ success: true }) },
  MP_RL: { limit: async () => ({ success: true }) },
};
let env = { ...envBase };

const db = { eventos: new Map(), ledger: new Map(), ledgerFora: false };
const abacate = { cobrancas: new Map(), criadas: [], seq: 0 };

const resp = (status, obj) =>
  new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
const semEq = (v) => decodeURIComponent((v || '').replace(/^eq\./, ''));

globalThis.fetch = async (entrada, init = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const metodo = (init.method || 'GET').toUpperCase();
  const corpo = init.body ? String(init.body) : '';

  if (url.hostname === 'api.abacatepay.com') {
    if (url.pathname.endsWith('/transparents/create')) {
      const b = JSON.parse(corpo);
      const id = `pix_char_${++abacate.seq}`;
      abacate.criadas.push(b);
      abacate.cobrancas.set(id, {
        id, amount: b.data.amount, devMode: false, createdAt: new Date().toISOString(), status: 'PENDING', metadata: b.data.metadata,
      });
      return resp(200, { data: { id, brCode: '000201PIX', brCodeBase64: 'data:image/png;base64,AAA', status: 'PENDING', expiresAt: '2026-10-28T00:00:00Z' }, error: null });
    }
    const c = abacate.cobrancas.get(url.searchParams.get('id'));
    if (!c) return resp(404, { error: 'not found' });
    if (url.pathname.endsWith('/transparents/get')) return resp(200, { data: { ...c, status: 'PENDING' }, error: null });
    if (url.pathname.endsWith('/transparents/check')) return resp(200, { data: { status: c.status }, error: null });
  }

  if (url.origin === SUPA && url.pathname === '/auth/v1/user') {
    const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
    if (auth === `Bearer ${TOKEN}`) return resp(200, { id: USER, email: 'cliente@teste.dev' });
    if (auth === 'Bearer jwt-do-outro') return resp(200, { id: OUTRO, email: 'outro@teste.dev' });
    return resp(401, {});
  }
  if (url.origin === SUPA && url.pathname === '/rest/v1/webhook_events') {
    if (metodo === 'POST') {
      const linha = JSON.parse(corpo);
      const k = `${linha.origem}|${linha.event_id}`;
      const atual = db.eventos.get(k);
      if (atual) return resp(409, { code: '23505' });
      db.eventos.set(k, { ...linha, recebido_em: new Date().toISOString() });
      return resp(201, [{ recebido_em: db.eventos.get(k).recebido_em }]);
    }
    const k = `${semEq(url.searchParams.get('origem'))}|${semEq(url.searchParams.get('event_id'))}`;
    const linha = db.eventos.get(k);
    if (metodo === 'GET') return resp(200, linha ? [{ status: linha.status, recebido_em: linha.recebido_em }] : []);
    if (metodo === 'PATCH') {
      if (linha) Object.assign(linha, JSON.parse(corpo));
      return resp(204);
    }
  }
  if (url.origin === SUPA && url.pathname === '/rest/v1/credit_ledger' && metodo === 'POST') {
    if (db.ledgerFora) return resp(500, { message: 'fora' });
    const l = JSON.parse(corpo);
    const k = `${l.origem}|${l.ref}`;
    if (db.ledger.has(k)) return resp(409, { code: '23505' });
    db.ledger.set(k, l);
    return resp(201);
  }
  throw new Error(`fetch inesperado: ${metodo} ${url.href}`);
};
console.error = () => {};
console.warn = () => {};

async function mp(caminho, { metodo = 'GET', corpo, token = TOKEN } = {}) {
  const url = new URL(`https://worker.teste${caminho}`);
  const req = new Request(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const r = await handleMercadoPago(req, env, url);
  return { status: r.status, corpo: await r.json() };
}
async function webhook(idCobranca, idEvento) {
  const url = new URL(`https://worker.teste/abacate/webhook?webhookSecret=${SEGREDO}`);
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify({ id: idEvento, event: 'transparent.completed', devMode: false, data: { transparent: { id: idCobranca } } }),
  });
  const r = await handleAbacate(req, env, url);
  return r.status;
}
const creditosDe = (uid) => [...db.ledger.values()].filter((l) => l.user_id === uid).reduce((s, l) => s + l.delta, 0);

console.log('1) POST /mp/pix cria na AbacatePay com o contrato do app');
let r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_150' } });
const criada = abacate.criadas[0];
checar('200 ok', [r.status, r.corpo.ok], [200, true]);
checar('campos que o app lê', [typeof r.corpo.id, !!r.corpo.brCode, !!r.corpo.brCodeBase64, r.corpo.status, !!r.corpo.expiresAt], ['string', true, true, 'PENDING', true]);
checar('pacote no formato do app', r.corpo.pacote, { id: 'creditos_150', nome: '150 créditos', creditos: 150, amount: 4990 });
checar('valor do catálogo em centavos e 24 h', [criada.data.amount, criada.data.expiresIn, criada.method], [4990, 86400, 'PIX']);
checar('vínculo olli:cr do usuário', /^olli:cr:6f1c2d3e-4a5b-4c6d-8e7f-901234567890:[0-9a-f-]{36}:creditos_150$/.test(criada.data.metadata.externalId), true);
checar('descrição sem acento', criada.data.description, 'OLLI 150 creditos');
const id150 = r.corpo.id;

r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_999' } });
checar('pacote inválido 400', [r.status, r.corpo.erro], [400, 'pacote_invalido']);
r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_50' }, token: 'lixo' });
checar('sem login 401', r.status, 401);

console.log('2) pendente, pago, e crédito uma vez só');
r = await mp(`/mp/status?id=${id150}`);
checar('pendente', [r.status, r.corpo], [200, { ok: true, status: 'PENDING', pago: false }]);
checar('nada creditado', creditosDe(USER), 0);
abacate.cobrancas.get(id150).status = 'PAID';
r = await mp(`/mp/status?id=${id150}`);
checar('pago', [r.status, r.corpo], [200, { ok: true, status: 'PAID', pago: true }]);
checar('150 créditos lançados com ref da cobrança', [creditosDe(USER), [...db.ledger.keys()]], [150, [`pix|abacate:${id150}`]]);
checar('consumo processado', db.eventos.get(`abacate|${id150}`)?.status, 'processado');
r = await mp(`/mp/status?id=${id150}`);
checar('polling de novo: pago e sem somar', [r.corpo.pago, creditosDe(USER)], [true, 150]);
checar('webhook depois: 200 e sem somar', [await webhook(id150, 'log_a'), creditosDe(USER)], [200, 150]);

console.log('3) alheia e valor divergente');
r = await mp(`/mp/status?id=${id150}`, { token: 'jwt-do-outro' });
checar('alheia 404, nada para o outro', [r.status, r.corpo.erro, creditosDe(OUTRO)], [404, 'nao_encontrado', 0]);
r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_50' } });
const id50 = r.corpo.id;
Object.assign(abacate.cobrancas.get(id50), { amount: 1, status: 'PAID' });
r = await mp(`/mp/status?id=${id50}`);
checar('valor fora do catálogo 404', [r.status, creditosDe(USER)], [404, 150]);
r = await mp('/mp/status?id=x!');
checar('id malformado 400', [r.status, r.corpo.erro], [400, 'id_invalido']);

console.log('4) ledger fora e reprocesso');
r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_400' } });
const id400 = r.corpo.id;
abacate.cobrancas.get(id400).status = 'PAID';
db.ledgerFora = true;
r = await mp(`/mp/status?id=${id400}`);
checar('502 e consumo falhou', [r.status, db.eventos.get(`abacate|${id400}`)?.status], [502, 'falhou']);
db.ledgerFora = false;
checar('webhook reprocessa e credita', [await webhook(id400, 'log_b'), creditosDe(USER)], [200, 550]);

console.log('5) plano por /mp/plano/pix vai para a AbacatePay');
r = await mp('/mp/plano/pix', { metodo: 'POST', corpo: { plano: 'pro_mensal' } });
const ultima = abacate.criadas[abacate.criadas.length - 1];
checar('200 com QR', [r.status, r.corpo.ok, !!r.corpo.brCode], [200, true, true]);
checar('vínculo olli:pl e R$39', [ultima.data.metadata.externalId.split(':')[1], ultima.data.amount], ['pl', 3900]);

console.log('6) AbacatePay desligada: MP de volta (rollback sem deploy)');
env = { ...envBase, ABACATEPAY_API_KEY: '' };
const antes = abacate.criadas.length;
r = await mp('/mp/pix', { metodo: 'POST', corpo: { pacote: 'creditos_50' } });
checar('cai no MP (sem token do MP = 503)', [r.status, r.corpo.erro, abacate.criadas.length], [503, 'mp_nao_configurado', antes]);
r = await mp('/mp/status?id=pix_char_1');
checar('status de cobrança Abacate com ela desligada = 503', [r.status, r.corpo.erro], [503, 'pix_desligado']);
env = { ...envBase };
r = await mp('/mp/status?id=123456789');
checar('id numérico continua no MP', [r.status, r.corpo.erro], [503, 'mp_nao_configurado']);

console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
