import { strict as assert } from 'node:assert';
import { handlePedidoDiagnostico, lerPedido } from '../src/pedidoDiagnostico.js';

const bom = { negocio: ' Clínica  Sol ', cidade: 'Campinas', dor: 'Perco cliente por demora', whatsapp: '(11) 98765-4321', aceite: true };
const ok = lerPedido(bom);
assert.equal(ok.ok, true);
assert.equal(ok.linha.negocio, 'Clínica Sol');
assert.equal(ok.linha.whatsapp, '5511987654321');
assert.equal(ok.linha.aviso_versao, 'diagnostico-v2');

for (const [campo, erro] of [['negocio', 'negocio_obrigatorio'], ['cidade', 'cidade_obrigatoria'], ['dor', 'dor_obrigatoria'], ['whatsapp', 'whatsapp_invalido']]) {
  assert.equal(lerPedido({ ...bom, [campo]: '  ' }).erro, erro);
}
assert.equal(lerPedido({ ...bom, whatsapp: '123' }).erro, 'whatsapp_invalido');
assert.equal(lerPedido({ ...bom, aceite: false }).erro, 'aceite_obrigatorio');
assert.equal(lerPedido({ ...bom, aceite: 'true' }).erro, 'aceite_obrigatorio');
assert.equal(lerPedido({ ...bom, site_web: 'http://spam' }).erro, 'corpo_invalido');
assert.equal(lerPedido(null).erro, 'corpo_invalido');

const req = (body, method = 'POST') => new Request('https://x/servicos/pedido', { method, body: method === 'POST' ? JSON.stringify(body) : undefined });
// banco fora = 503, nunca ok de mentira
assert.equal((await handlePedidoDiagnostico(req(bom), {})).status, 503);
// grava de verdade quando o banco responde
let gravou = null;
const f = globalThis.fetch;
globalThis.fetch = async (url, init) => { gravou = { url, body: JSON.parse(init.body) }; return new Response(null, { status: 201 }); };
const r = await handlePedidoDiagnostico(req(bom), { SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
assert.equal(r.status, 201);
assert.match(gravou.url, /\/rest\/v1\/servicos_pedidos$/);
assert.equal(gravou.body.whatsapp, '5511987654321');
// banco recusa = 503
globalThis.fetch = async () => new Response('x', { status: 500 });
assert.equal((await handlePedidoDiagnostico(req(bom), { SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 'k' })).status, 503);
globalThis.fetch = f;
// payload grande e método
assert.equal((await handlePedidoDiagnostico(new Request('https://x', { method: 'POST', body: 'x'.repeat(5000) }), {})).status, 413);
assert.equal((await handlePedidoDiagnostico(req(null, 'GET'), {})).status, 405);
assert.equal((await handlePedidoDiagnostico(req(null, 'OPTIONS'), {})).status, 204);
console.log('teste-pedido-diagnostico: todas as verificações passaram');

// corpo grande: 413 antes de bufferizar (Content-Length honesto E chunked sem header)
const grande = JSON.stringify({ ...bom, dor: 'x'.repeat(5000) });
const rG = await handlePedidoDiagnostico(new Request('https://x/servicos/pedido', { method: 'POST', body: grande }), { SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
assert.equal(rG.status, 413);
const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(grande)); c.close(); } });
const rC = await handlePedidoDiagnostico(new Request('https://x/servicos/pedido', { method: 'POST', body: stream, duplex: 'half' }), { SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 'k' });
assert.equal(rC.status, 413);
console.log('teste-pedido-diagnostico: corpo grande 413 ok');
