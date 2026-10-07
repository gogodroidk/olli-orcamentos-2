/**
 * Job de retenção do WhatsApp (worker/src/whatsappRetencao.js).  node worker/scripts/teste-whatsapp-retencao.js
 * Tranca: só roda no minuto 06:19 UTC · chama a RPC certa com service_role · falha NUNCA vira "limpou" ·
 * LOG só com contagens (sem telefone/texto).
 */
import assert from 'node:assert/strict';
import { horaDeLimparWhatsapp, limparWhatsappAntigo } from '../src/whatsappRetencao.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const env = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-secreta-xyz' };
const as = (h, m) => new Date(Date.UTC(2026, 9, 8, h, m, 0));

function capturarLog(fn) {
  const logs = [];
  const l = console.log;
  const e = console.error;
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  return fn().then(
    (r) => ((console.log = l), (console.error = e), { r, logs }),
    (x) => ((console.log = l), (console.error = e), Promise.reject(x)),
  );
}

console.log('WhatsApp — retenção');

await caso('só o minuto 06:19 UTC conta', () => {
  assert.equal(horaDeLimparWhatsapp(as(6, 19)), true);
  for (const [h, m] of [[6, 18], [6, 17], [7, 19], [18, 19], [0, 0]]) assert.equal(horaDeLimparWhatsapp(as(h, m)), false, `${h}:${m}`);
});

await caso('fora do minuto: NÃO chama nada', async () => {
  let chamadas = 0;
  const r = await limparWhatsappAntigo(env, as(10, 0), async () => (chamadas++, new Response('{}')));
  assert.equal(chamadas, 0);
  assert.equal(r.pulou, true);
});

await caso('sem configuração: não chama e diz que não rodou', async () => {
  let chamadas = 0;
  const r = await limparWhatsappAntigo({}, as(6, 19), async () => (chamadas++, new Response('{}')));
  assert.equal(chamadas, 0);
  assert.deepEqual([r.ok, r.motivo], [false, 'sem_config']);
});

await caso('06:19: chama wa_retencao_limpar com service_role e devolve as contagens; LOG sem dado pessoal', async () => {
  const visto = {};
  const { r, logs } = await capturarLog(() =>
    limparWhatsappAntigo(env, as(6, 19), async (url, init) => {
      Object.assign(visto, { url, init });
      return Response.json({ ok: true, entrada_resolvida_180d: 3, entrada_parada_12m: 1, envios_12m: 7, contatos_12m: 2 });
    }),
  );
  assert.equal(visto.url, 'https://projeto.supabase.co/rest/v1/rpc/wa_retencao_limpar');
  assert.equal(visto.init.method, 'POST');
  assert.equal(visto.init.headers.Authorization, 'Bearer service-secreta-xyz');
  assert.equal(JSON.parse(visto.init.body).p_agora, as(6, 19).toISOString());
  assert.deepEqual([r.ok, r.entrada_resolvida_180d, r.entrada_parada_12m, r.envios_12m, r.contatos_12m], [true, 3, 1, 7, 2]);
  const log = logs.join('\n');
  assert.match(log, /entrada_resolvida=3 entrada_parada=1 envios=7 contatos=2/);
  assert.equal(/service-secreta|\b55\d{10,11}\b|Bearer/.test(log), false, 'log não pode ter segredo nem telefone');
});

for (const [nome, impl, motivo] of [
  ['HTTP 500', async () => new Response('{}', { status: 500 }), 'http_500'],
  ['corpo sem ok', async () => Response.json({ message: 'JWT expired' }), 'resposta_invalida'],
  ['rede fora', async () => { throw new TypeError('fetch failed'); }, 'rede'],
]) {
  await caso(`falha (${nome}): ok:false e motivo "${motivo}" — nunca "limpou"`, async () => {
    const { r } = await capturarLog(() => limparWhatsappAntigo(env, as(6, 19), impl));
    assert.deepEqual([r.ok, r.motivo], [false, motivo]);
  });
}

console.log(`\nPASSOU: ${ok} casos — retenção do WhatsApp`);
