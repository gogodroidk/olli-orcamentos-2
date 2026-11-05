/**
 * Job de retenção dos pedidos de diagnóstico. node worker/scripts/teste-servicos-retencao.js
 * Tranca: desligado sem SERVICOS_RETENCAO_MODE=production · só 06:21 UTC · RPC certa ·
 * falha nunca vira "limpou" · log só com contagem.
 */
import assert from 'node:assert/strict';
import { horaDeLimparPedidos, limparPedidosDiagnostico } from '../src/servicosRetencao.js';

const env = {
  SUPABASE_URL: 'https://projeto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-secreta-xyz',
  SERVICOS_RETENCAO_MODE: 'production',
};
const as = (h, m) => new Date(Date.UTC(2026, 10, 3, h, m, 0));

assert.equal(horaDeLimparPedidos(as(6, 21)), true);
assert.equal(horaDeLimparPedidos(as(6, 19)), false);
assert.equal(horaDeLimparPedidos(as(6, 17)), false);

const fora = await limparPedidosDiagnostico(env, as(6, 20), async () => { throw new Error('nao devia chamar'); });
assert.equal(fora.motivo, 'fora_da_hora');
assert.equal(fora.pulou, true);

const desligado = await limparPedidosDiagnostico({ ...env, SERVICOS_RETENCAO_MODE: 'off' }, as(6, 21), async () => {
  throw new Error('nao devia chamar');
});
assert.equal(desligado.motivo, 'desligado');

let chamado = null;
const ok = await limparPedidosDiagnostico(env, as(6, 21), async (url, init) => {
  chamado = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
  return new Response(JSON.stringify({ ok: true, apagados: 2 }), { status: 200 });
});
assert.equal(ok.ok, true);
assert.equal(ok.apagados, 2);
assert.match(chamado.url, /\/rpc\/servicos_pedidos_retencao_limpar$/);
assert.equal(chamado.body.p_agora, as(6, 21).toISOString());
assert.equal(chamado.auth, 'Bearer service-secreta-xyz');

const ruim = await limparPedidosDiagnostico(env, as(6, 21), async () => new Response('x', { status: 404 }));
assert.equal(ruim.ok, false);
assert.equal(ruim.motivo, 'http_404');

const rede = await limparPedidosDiagnostico(env, as(6, 21), async () => { throw new Error('rede'); });
assert.equal(rede.motivo, 'rede');

console.log('teste-servicos-retencao: todas as verificações passaram');
