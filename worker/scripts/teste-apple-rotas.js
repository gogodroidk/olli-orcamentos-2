/**
 * Rotas /apple/* (worker/src/appleRotas.js) com Supabase FALSO em memória e JWS assinado por cadeia openssl de teste
 * (a verificação REAL roda; só a raiz é a de teste). Prova: dono, anti-replay, concessão, convivência com outra origem,
 * notificações (renovação, expiração, estorno, duplicada, antes do /verificar), kill switch e falhas de gravação = 500.
 *     node worker/scripts/teste-apple-rotas.js
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleApple } from '../src/appleRotas.js';
import { verificarJwsApple } from '../src/appleJws.js';
import { BUNDLE_ID_APPLE, vinculoApple } from '../src/appleIap.js';

let ok = 0;
const caso = (n) => {
  ok++;
  console.log(`  ok  ${n}`);
};

// ── cadeia de teste ──
const dir = mkdtempSync(join(tmpdir(), 'apple-rotas-'));
const sh = (...a) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', 'r.key');
sh('req', '-new', '-x509', '-key', 'r.key', '-subj', '/CN=R', '-days', '3650', '-sha384', '-out', 'r.crt', '-addext', 'basicConstraints=critical,CA:TRUE');
sh('ecparam', '-name', 'secp384r1', '-genkey', '-noout', '-out', 'i.key');
sh('req', '-new', '-key', 'i.key', '-subj', '/CN=I', '-out', 'i.csr');
writeFileSync(join(dir, 'i.cnf'), 'basicConstraints=CA:TRUE\n1.2.840.113635.100.6.2.1=ASN1:NULL\n');
sh('x509', '-req', '-in', 'i.csr', '-CA', 'r.crt', '-CAkey', 'r.key', '-CAcreateserial', '-days', '3000', '-sha384', '-extfile', 'i.cnf', '-out', 'i.crt');
sh('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'l.key');
sh('req', '-new', '-key', 'l.key', '-subj', '/CN=L', '-out', 'l.csr');
writeFileSync(join(dir, 'l.cnf'), 'basicConstraints=CA:FALSE\n1.2.840.113635.100.6.11.1=ASN1:NULL\n');
sh('x509', '-req', '-in', 'l.csr', '-CA', 'i.crt', '-CAkey', 'i.key', '-CAcreateserial', '-days', '365', '-sha256', '-extfile', 'l.cnf', '-out', 'l.crt');
const der = (n) => sh('x509', '-in', n, '-outform', 'der').toString('base64');
const x5c = [der('l.crt'), der('i.crt'), der('r.crt')];
const leafKey = createPrivateKey(readFileSync(join(dir, 'l.key')));
const raizSha = createHash('sha256').update(sh('x509', '-in', 'r.crt', '-outform', 'der')).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const assinar = (payload) => {
  const h = b64u(JSON.stringify({ alg: 'ES256', x5c }));
  const p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${b64u(sign('sha256', Buffer.from(`${h}.${p}`), { key: leafKey, dsaEncoding: 'ieee-p1363' }))}`;
};
let relogioExtra = 0;
const verificarTeste = (jws, o = {}) => verificarJwsApple(jws, { ...o, raizes: [raizSha], agora: Date.now() + relogioExtra });

// ── Supabase falso ──
const USER = '11111111-2222-4333-8444-555555555555';
const OUTRO = '99999999-2222-4333-8444-555555555555';
const db = { assinaturas: {}, compras: {}, eventos: {} };
const falha = new Set();
const resp = (corpo, status = 200) => new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const m = init.method || 'GET';
  if (url.endsWith('/auth/v1/user')) {
    const t = String(init.headers?.Authorization || '').replace('Bearer ', '');
    return t === 'jwt-user' ? resp({ id: USER }) : t === 'jwt-outro' ? resp({ id: OUTRO }) : resp({}, 401);
  }
  const q = new URL(url).searchParams;
  const eq = (k) => (q.get(k) || '').replace(/^eq\./, '');
  if (url.includes('/rest/v1/assinaturas')) {
    if (m === 'GET') return resp(db.assinaturas[eq('user_id')] ? [db.assinaturas[eq('user_id')]] : []);
    if (falha.has('assinaturas')) return resp({}, 500);
    if (m === 'POST') {
      const c = JSON.parse(init.body);
      db.assinaturas[c.user_id] = { ...(db.assinaturas[c.user_id] || {}), ...c };
      return resp(null, 201);
    }
    if (m === 'PATCH') {
      const l = db.assinaturas[eq('user_id')];
      if (l && l.revenuecat_transacao_id === eq('revenuecat_transacao_id')) Object.assign(l, JSON.parse(init.body));
      return resp(null, 204);
    }
  }
  if (url.includes('/rest/v1/apple_compras')) {
    if (m === 'GET') return resp(db.compras[eq('original_transaction_id')] ? [db.compras[eq('original_transaction_id')]] : []);
    if (falha.has('compras')) return resp({}, 500);
    if (m === 'POST') {
      const c = JSON.parse(init.body);
      db.compras[c.original_transaction_id] = c;
      return resp(null, 201);
    }
    if (m === 'PATCH') {
      Object.assign(db.compras[eq('original_transaction_id')], JSON.parse(init.body));
      return resp(null, 204);
    }
  }
  if (url.includes('/rest/v1/webhook_events')) {
    const chave = (o, e) => `${o}|${e}`;
    if (m === 'POST') {
      const c = JSON.parse(init.body);
      if (db.eventos[chave(c.origem, c.event_id)]) return resp({ code: '23505' }, 409);
      db.eventos[chave(c.origem, c.event_id)] = { ...c, recebido_em: new Date().toISOString() };
      return resp([{ recebido_em: new Date().toISOString() }], 201);
    }
    if (m === 'PATCH') {
      const e = db.eventos[chave(eq('origem'), eq('event_id'))];
      if (e) Object.assign(e, JSON.parse(init.body));
      return resp(null, 204);
    }
    const e = db.eventos[chave(eq('origem'), eq('event_id'))];
    return resp(e ? [{ status: e.status, recebido_em: e.recebido_em }] : []);
  }
  throw new Error(`fetch inesperado: ${url}`);
};
console.error = () => {};

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv', SUPABASE_ANON_KEY: 'anon', PLAY_BILLING_MODE: 'on', ABACATE_RL: { limit: async () => ({ success: true }) } };
const chamar = async (metodo, caminho, { jwt, corpo, opcoes = {}, e = env } = {}) => {
  const url = new URL(`https://w.test${caminho}`);
  const headers = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const r = await handleApple(new Request(url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), e, url, { verificarJws: verificarTeste, ligado: true, ...opcoes });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};
const agora = Date.now() + 60_000; // certificados nascem "agora"
const DIA = 86400e3;
const tx = (extra = {}) => ({ bundleId: BUNDLE_ID_APPLE, productId: 'olli_pro_mensal', originalTransactionId: '2000000111111111', transactionId: '2000000111111112', type: 'Auto-Renewable Subscription', environment: 'Production', appAccountToken: USER, signedDate: agora, expiresDate: agora + 20 * DIA, ...extra });
const notif = (tipo, txPayload, extra = {}) => ({ signedPayload: assinar({ notificationType: tipo, notificationUUID: randomUUID(), signedDate: agora, data: { bundleId: BUNDLE_ID_APPLE, environment: 'Production', signedTransactionInfo: assinar(txPayload) }, ...extra }) });
const vinc = await vinculoApple('2000000111111111');

// 1. kill switch
{
  const off = await chamar('GET', '/apple/config', { opcoes: { ligado: false } });
  assert.deepEqual(off.corpo, { ok: true, ligado: false });
  const real = await handleApple(new Request('https://w.test/apple/config'), env, new URL('https://w.test/apple/config'));
  assert.equal((await real.json()).ligado, false, 'padrão de produção: DESLIGADO (APPLE_IAP_HABILITADO=false)');
  const v = await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: assinar(tx()) }, opcoes: { ligado: false } });
  assert.equal(v.status, 503);
  assert.equal(v.corpo.erro, 'apple_desligado');
  caso('kill switch: produção responde ligado:false; /verificar = 503 apple_desligado');
}
// 2. auth e entrada
{
  assert.equal((await chamar('POST', '/apple/verificar', { corpo: {} })).status, 401);
  assert.equal((await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: 'lixo' } })).status, 400);
  const semBundle = await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: assinar(tx({ bundleId: 'com.outro' })) } });
  assert.equal(semBundle.status, 400);
  assert.equal(semBundle.corpo.erro, 'transacao_recusada');
  assert.equal(Object.keys(db.assinaturas).length, 0, 'nada gravado');
  caso('sem login 401; JWS lixo 400; bundle de outro app recusado; nada gravado');
}
// 3. dono
{
  const r = await chamar('POST', '/apple/verificar', { jwt: 'jwt-outro', corpo: { signedTransaction: assinar(tx()) } });
  assert.equal(r.status, 403);
  assert.equal(r.corpo.erro, 'compra_de_outra_conta');
  assert.equal(Object.keys(db.assinaturas).length + Object.keys(db.compras).length, 0, 'nada gravado');
  caso('transação de OUTRA conta (appAccountToken ≠ usuário): 403 e nada gravado');
}
// 4. concessão
{
  const r = await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: assinar(tx()) } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.estado, 'ativa');
  assert.equal(r.corpo.plano, 'pro');
  const a = db.assinaturas[USER];
  assert.equal(a.plano, 'pro');
  assert.equal(a.status, 'active');
  assert.equal(a.revenuecat_transacao_id, vinc);
  assert.equal(a.revenuecat_produto_id, 'olli_pro:mensal');
  assert.equal(db.compras['2000000111111111'].user_id, USER);
  caso('/verificar válido: concede Pro, vincula apple:<sha>, registra a compra');
}
// 5. anti-replay: mesma compra por outra conta (token forjado = appAccountToken do outro)
{
  const r = await chamar('POST', '/apple/verificar', { jwt: 'jwt-outro', corpo: { signedTransaction: assinar(tx({ appAccountToken: OUTRO })) } });
  assert.equal(r.status, 409);
  assert.equal(r.corpo.erro, 'token_de_outra_conta');
  assert.equal(db.compras['2000000111111111'].user_id, USER, 'a compra não muda de dono');
  caso('anti-replay: originalTransactionId já ligado a outra conta = 409, dono preservado');
}
// 6. notificações
{
  // renovação (DID_RENEW) estende
  const nova = tx({ expiresDate: agora + 50 * DIA, transactionId: '2000000111111999', signedDate: agora + 1000 });
  const r = await chamar('POST', '/apple/notificacoes', { corpo: notif('DID_RENEW', nova) });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.acao, 'conceder');
  assert.equal(Date.parse(db.assinaturas[USER].current_period_end), agora + 50 * DIA);
  caso('notificação DID_RENEW: estende a vigência');
  // duplicada (mesmo UUID)
  const dupla = notif('DID_RENEW', nova);
  await chamar('POST', '/apple/notificacoes', { corpo: dupla });
  const rep = await chamar('POST', '/apple/notificacoes', { corpo: dupla });
  assert.equal(rep.corpo.duplicado, true);
  caso('notificação duplicada (mesmo notificationUUID): 200 duplicado, sem reprocessar');
  // fora de ordem (evento mais velho não desfaz o novo)
  const velha = tx({ expiresDate: agora + 10 * DIA, signedDate: agora - 30_000 });
  const rv = await chamar('POST', '/apple/notificacoes', { corpo: notif('DID_RENEW', velha) });
  assert.equal(rv.corpo.motivo, 'fora_de_ordem');
  assert.equal(Date.parse(db.assinaturas[USER].current_period_end), agora + 50 * DIA, 'vigência nova preservada');
  caso('evento mais antigo da mesma compra: ignorado (fora de ordem)');
  // REFUND corta já
  const rf = await chamar('POST', '/apple/notificacoes', { corpo: notif('REFUND', tx({ signedDate: agora + 2000, revocationDate: agora + 1500 }), { signedDate: agora + 2000 }) });
  assert.equal(rf.corpo.acao, 'encerrar');
  assert.equal(db.assinaturas[USER].status, 'canceled');
  assert.ok(Date.parse(db.assinaturas[USER].current_period_end) <= agora + 2000, 'acesso cortado, não estendido');
  caso('REFUND: encerra na hora (status canceled, vigência ≤ agora)');
}
// 7. notificação antes do /verificar
{
  const outroTx = tx({ originalTransactionId: '2000000222222222', appAccountToken: OUTRO });
  const r = await chamar('POST', '/apple/notificacoes', { corpo: notif('SUBSCRIBED', outroTx) });
  assert.equal(r.corpo.motivo, 'compra_ainda_nao_registrada');
  assert.equal(db.assinaturas[OUTRO], undefined, 'não libera sem /verificar');
  caso('notificação de compra desconhecida: registra e NÃO libera plano (espera o /verificar)');
}
// 8. convivência com outra origem (Stripe ativo, maior nível)
{
  const OUTRO2 = '77777777-2222-4333-8444-555555555555';
  db.assinaturas[OUTRO2] = { user_id: OUTRO2, plano: 'empresa', status: 'active', current_period_end: new Date(agora + 90 * DIA).toISOString(), revenuecat_transacao_id: null };
  globalThis.__u = OUTRO2;
  const antigoFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).endsWith('/auth/v1/user') && String(i?.headers?.Authorization).includes('jwt-o2') ? resp({ id: OUTRO2 }) : antigoFetch(u, i));
  const r = await chamar('POST', '/apple/verificar', { jwt: 'jwt-o2', corpo: { signedTransaction: assinar(tx({ originalTransactionId: '2000000333333333', appAccountToken: OUTRO2, expiresDate: agora + 20 * DIA })) } });
  assert.equal(r.status, 200);
  assert.equal(db.assinaturas[OUTRO2].plano, 'empresa', 'mantém o MAIOR nível (Empresa por outra origem)');
  assert.equal(Date.parse(db.assinaturas[OUTRO2].current_period_end), agora + 90 * DIA, 'mantém a MAIOR vigência');
  globalThis.fetch = antigoFetch;
  caso('convivência: Apple Pro sobre Empresa vigente de outra origem não rebaixa nem encurta');
}
// 8b. LÁPIDE: REFUND antes do /verificar não deixa um JWS velho reabrir o acesso
{
  const U3 = '55555555-2222-4333-8444-555555555555';
  const antigoFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).endsWith('/auth/v1/user') && String(i?.headers?.Authorization).includes('jwt-u3') ? resp({ id: U3 }) : antigoFetch(u, i));
  const base = tx({ originalTransactionId: '2000000555555555', appAccountToken: U3, signedDate: agora - 20_000 });
  const estorno = { ...base, signedDate: agora + 5000, revocationDate: agora + 4000 };
  const n1 = await chamar('POST', '/apple/notificacoes', { corpo: notif('REFUND', estorno, { signedDate: agora + 5000 }) });
  assert.equal(n1.corpo.motivo, 'lapide_gravada');
  assert.equal(db.compras['2000000555555555'].estado, 'encerrada');
  const v = await chamar('POST', '/apple/verificar', { jwt: 'jwt-u3', corpo: { signedTransaction: assinar(base) } });
  assert.equal(v.corpo.estado, 'encerrada');
  assert.equal(v.corpo.motivo, 'compra_ja_encerrada');
  assert.equal(db.assinaturas[U3], undefined, 'JWS pré-reembolso NÃO concede');
  globalThis.fetch = antigoFetch;
  caso('lápide: REFUND que chega antes do /verificar impede o JWS pré-reembolso de conceder acesso');
}
// 8c. REFUND da Apple não corta período pago por OUTRA origem (Stripe/Pix/Play)
{
  const U4 = '44444444-2222-4333-8444-555555555555';
  db.assinaturas[U4] = { user_id: U4, plano: 'empresa', status: 'active', current_period_end: new Date(agora + 90 * DIA).toISOString(), revenuecat_transacao_id: null };
  const antigoFetch = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).endsWith('/auth/v1/user') && String(i?.headers?.Authorization).includes('jwt-u4') ? resp({ id: U4 }) : antigoFetch(u, i));
  const t0 = tx({ originalTransactionId: '2000000666666666', appAccountToken: U4, expiresDate: agora + 20 * DIA, signedDate: agora });
  await chamar('POST', '/apple/verificar', { jwt: 'jwt-u4', corpo: { signedTransaction: assinar(t0) } });
  assert.equal(Date.parse(db.assinaturas[U4].current_period_end), agora + 90 * DIA, 'mesclou o maior');
  const r = await chamar('POST', '/apple/notificacoes', { corpo: notif('REFUND', { ...t0, signedDate: agora + 3000, revocationDate: agora + 2500 }, { signedDate: agora + 3000 }) });
  assert.equal(r.corpo.motivo, 'sustentada_por_outra_origem');
  assert.equal(db.assinaturas[U4].status, 'active', 'status NÃO vira canceled');
  assert.equal(Date.parse(db.assinaturas[U4].current_period_end), agora + 90 * DIA, 'período pago por fora preservado');
  globalThis.fetch = antigoFetch;
  caso('REFUND da Apple sobre plano sustentado por outra origem: só atualiza campos da Apple, não corta o período pago por fora');
}
// 8d. janela de idade do signedDate e certificado malformado
{
  relogioExtra = 40 * DIA;
  const r = await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: assinar(tx({ originalTransactionId: '2000000777777777' })) } });
  assert.equal(r.status, 400);
  assert.equal(r.corpo.motivo, 'assinatura_antiga');
  const rn = await chamar('POST', '/apple/notificacoes', { corpo: notif('DID_RENEW', tx({ originalTransactionId: '2000000777777777' })) });
  assert.equal(rn.status, 400, 'notificação com 40 dias de idade também é recusada (janela 14 d)');
  relogioExtra = 0;
  caso('signedDate velho demais (7 d em /verificar, 14 d em notificações): recusado — fecha replay de JWS antigo');
  // DER malformado no x5c (com a raiz certa): 400 limpo, nunca TypeError/503/Sentry
  const h = b64u(JSON.stringify({ alg: 'ES256', x5c: [Buffer.from('lixo').toString('base64'), Buffer.from('lixo2').toString('base64'), x5c[2]] }));
  const p = b64u(JSON.stringify({ signedDate: agora }));
  const forjado = `${h}.${p}.${b64u(Buffer.alloc(64, 7))}`;
  const rf = await chamar('POST', '/apple/notificacoes', { corpo: { signedPayload: forjado } });
  assert.equal(rf.status, 400);
  assert.equal(rf.corpo.motivo, 'der_invalido');
  caso('certificado DER malformado: 400 der_invalido (nunca TypeError/503)');
}
// 9. falha de gravação = 500 (reenvio), nunca 200 mentiroso
{
  falha.add('assinaturas');
  const n = tx({ originalTransactionId: '2000000111111111', expiresDate: agora + 70 * DIA, signedDate: agora + 9000 });
  const r = await chamar('POST', '/apple/notificacoes', { corpo: notif('DID_RENEW', n, { signedDate: agora + 9000 }) });
  assert.equal(r.status, 500);
  falha.delete('assinaturas');
  falha.add('compras');
  const v = await chamar('POST', '/apple/verificar', { jwt: 'jwt-user', corpo: { signedTransaction: assinar(tx({ originalTransactionId: '2000000444444444' })) } });
  assert.equal(v.status, 500);
  assert.equal(v.corpo.erro, 'falha_persistencia');
  falha.delete('compras');
  caso('falha ao gravar assinatura/compra: 500 (a Apple/o app reenviam), nunca 200 enganoso');
}
// 10. métodos e rotas
{
  assert.equal((await chamar('GET', '/apple/verificar')).status, 405);
  assert.equal((await chamar('GET', '/apple/xyz')).status, 404);
  const teste = await chamar('POST', '/apple/notificacoes', { corpo: { signedPayload: assinar({ notificationType: 'TEST', notificationUUID: randomUUID(), signedDate: agora }) } });
  assert.equal(teste.status, 200);
  assert.equal(teste.corpo.motivo, 'sem_transacao');
  const forjada = await chamar('POST', '/apple/notificacoes', { corpo: { signedPayload: 'a.b.c' } });
  assert.equal(forjada.status, 400);
  caso('405/404; notificação TEST = 200; signedPayload forjado = 400');
}

console.log(`\nteste-apple-rotas: ${ok} casos OK`);
