/**
 * Teste do DESCADASTRO de lembretes (`src/emailDescadastro.js`).
 *
 *     node scripts/teste-email-descadastro.js   (de dentro de worker/)
 *
 * Protege: assinatura HMAC por conta (não dá para descadastrar outra pessoa),
 * GET nunca grava (pré-visualização/antivírus abrem links), POST grava pelo
 * botão e pelo one-click RFC 8058, falha do banco nunca responde "pronto".
 */
import assert from 'node:assert/strict';
import {
  EMAIL_DESCADASTRO_PATH,
  chaveDescadastro,
  handleDescadastroEmail,
  linkDescadastro,
  verificarDescadastro,
} from '../src/emailDescadastro.js';

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
const BASE = 'https://diagnostico.olliorcamentos.online/email/descadastrar';
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
});

let ok = 0;
const imprimir = console.log.bind(console);
async function caso(nome, fn) {
  await fn();
  ok += 1;
  imprimir(`  ok   ${nome}`);
}

function fetchFalso(resposta = { registrado: true, cancelados: 1 }, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json(resposta, { status });
  };
  return { calls, fetchImpl };
}

const originalLog = console.log;
const originalError = console.error;
const logs = [];

const chave = await chaveDescadastro(ENV);
const link = await linkDescadastro({ baseUrl: BASE, userId: U1, chave });
const params = Object.fromEntries(new URL(link).searchParams);

await caso('link é https, no caminho da rota, com u/e/a', async () => {
  const url = new URL(link);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, EMAIL_DESCADASTRO_PATH);
  assert.equal(params.u, U1);
  assert.equal(params.e, 'lembretes');
  assert.match(params.a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(link.includes(ENV.SUPABASE_SERVICE_ROLE_KEY), false);
});
await caso('assinatura verifica para a própria conta', async () => {
  assert.equal(await verificarDescadastro(params, chave), U1);
});
await caso('assinatura de uma conta não serve para outra', async () => {
  assert.equal(await verificarDescadastro({ ...params, u: U2 }, chave), null);
});
await caso('escopo diferente de "lembretes" é recusado', async () => {
  assert.equal(await verificarDescadastro({ ...params, e: 'tudo' }, chave), null);
});
await caso('chave diferente não valida', async () => {
  const outra = await chaveDescadastro({ SUPABASE_SERVICE_ROLE_KEY: 'outra-chave-de-servico-123456' });
  assert.equal(await verificarDescadastro(params, outra), null);
});
await caso('EMAIL_DESCADASTRO_SECRET, quando existe, manda na derivação', async () => {
  const propria = await chaveDescadastro({ ...ENV, EMAIL_DESCADASTRO_SECRET: 'x'.repeat(40) });
  assert.notDeepEqual(propria, chave);
});
await caso('sem nenhum segredo, sem chave (lembrete não sai)', async () => {
  assert.equal(await chaveDescadastro({}), null);
});
await caso('base fora do caminho da rota é recusada', async () => {
  await assert.rejects(linkDescadastro({ baseUrl: 'https://diagnostico.olliorcamentos.online/outra', userId: U1, chave }), /descadastro_url_invalida/);
  await assert.rejects(linkDescadastro({ baseUrl: 'http://diagnostico.olliorcamentos.online/email/descadastrar', userId: U1, chave }), /descadastro_url_invalida/);
});

console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));
try {
  await caso('GET válido mostra confirmação e NÃO grava', async () => {
    const f = fetchFalso();
    const r = await handleDescadastroEmail(new Request(link), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.ok(html.includes('Parar de receber lembretes</button>'));
    assert.ok(html.includes('method="post"'));
    assert.equal(f.calls.length, 0);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'/);
  });
  await caso('GET com assinatura adulterada = 400 sem gravar', async () => {
    const f = fetchFalso();
    const r = await handleDescadastroEmail(new Request(link.replace(U1, U2)), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 400);
    assert.equal(f.calls.length, 0);
  });
  await caso('POST do botão (form) grava descadastro via link_email', async () => {
    const f = fetchFalso();
    const body = new URLSearchParams(params).toString();
    const r = await handleDescadastroEmail(new Request(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 200);
    assert.ok((await r.text()).includes('lembretes desligados'));
    assert.equal(f.calls.length, 1);
    assert.ok(f.calls[0].url.endsWith('/rpc/registrar_supressao_email'));
    assert.deepEqual(f.calls[0].body, { p_user_id: U1, p_motivo: 'descadastro', p_origem: 'link_email' });
  });
  await caso('POST one-click (RFC 8058) grava via one_click', async () => {
    const f = fetchFalso();
    const r = await handleDescadastroEmail(new Request(link, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 200);
    assert.equal(f.calls[0].body.p_origem, 'one_click');
  });
  await caso('POST com assinatura inválida não grava', async () => {
    const f = fetchFalso();
    const r = await handleDescadastroEmail(new Request(link.replace(/a=[^&]+/, `a=${'A'.repeat(43)}`), {
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
    }), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 400);
    assert.equal(f.calls.length, 0);
  });
  await caso('banco fora: 503 e nunca "pronto"', async () => {
    const f = fetchFalso({}, 500);
    const r = await handleDescadastroEmail(new Request(link, { method: 'POST', body: 'List-Unsubscribe=One-Click' }), ENV, { fetchImpl: f.fetchImpl });
    assert.equal(r.status, 503);
    assert.equal((await r.text()).includes('desligados'), false);
  });
  await caso('outro método = 405 com Allow', async () => {
    const r = await handleDescadastroEmail(new Request(link, { method: 'PUT' }), ENV, {});
    assert.equal(r.status, 405);
    assert.equal(r.headers.get('Allow'), 'GET, POST');
  });
  await caso('rate limit por IP responde 429', async () => {
    const env = { ...ENV, LINK_RL: { limit: async () => ({ success: false }) } };
    const r = await handleDescadastroEmail(new Request(link), env, {});
    assert.equal(r.status, 429);
  });
  await caso('logs não carregam id de conta', async () => {
    assert.equal(logs.join('\n').includes(U1), false);
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log(`\nPASSOU: ${ok} casos — descadastro de lembretes`);
