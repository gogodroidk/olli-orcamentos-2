/** node worker/scripts/teste-gerar-cobranca-contador.js — exit 0 = passou. Sem rede. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { montarCobranca, travas, executar, centavos, slug, descricaoAscii } from './gerar-cobranca-contador.js';

const d = new Date('2026-11-18T12:00:00Z');
const m = montarCobranca({ escritorio: 'Contábil São João & Filhos' }, d);
assert.equal(m.pedidos.length, 1);
const c = m.pedidos[0].corpo;
assert.equal(c.data.amount, 49700);
assert.equal(c.data.externalId, 'olli:b2b:contabil-sao-joao-filhos:20261118:impl');
assert.ok(!c.data.externalId.startsWith('olli:pl:'), 'não pode virar plano do app');
assert.match(c.data.description, /^[A-Za-z0-9 .,-]+$/);
assert.ok(m.avisos.some((a) => /PROVIS/.test(a)));
assert.ok(m.avisos.some((a) => /produto-mensal/.test(a)));
const m2 = montarCobranca({ escritorio: 'X', valorImplantacao: '600', valorMensal: '149,90', produtoMensal: 'prod_abc123' }, d);
assert.equal(m2.pedidos.length, 2);
assert.deepEqual(m2.pedidos[1].corpo.methods, ['PIX']);
assert.equal(m2.valores.mensalCentavos, 14990);
assert.throws(() => montarCobranca({ escritorio: 'X', produtoMensal: 'xx' }));
assert.throws(() => montarCobranca({}));
assert.throws(() => centavos('-1'));
assert.equal(slug('  '), 'escritorio');
assert.equal(descricaoAscii('A·é'), 'A-e');

// travas
assert.ok(travas({}, {}).length === 4 || travas({}, {}).length >= 3);
assert.ok(travas({ valorImplantacao: 1, valorMensal: 1, aceite: 'a' }, { ABACATEPAY_API_KEY: 'abc_dev_x', OLLI_PRECO_CONFIRMADO: 'sim' }).some((x) => /desenvolvimento/.test(x)));
assert.deepEqual(travas({ valorImplantacao: 1, valorMensal: 1, aceite: 'a' }, { ABACATEPAY_API_KEY: 'abc_prod_x', OLLI_PRECO_CONFIRMADO: 'sim' }), []);

// executar com http falso (nenhuma rede)
const chamadas = [];
const falso = async (url, init) => { chamadas.push([url, init]); return { ok: true, status: 200, json: async () => ({ data: { id: 'pix_char_1', status: 'PENDING', brCode: 'br' } }) }; };
const r = await executar({ escritorio: 'X', valorImplantacao: 497, valorMensal: 149 }, { ABACATEPAY_API_KEY: 'abc_prod_k' }, falso);
assert.equal(chamadas.length, 1);
assert.equal(chamadas[0][0], 'https://api.abacatepay.com/v2/transparents/create');
assert.equal(r[0].id, 'pix_char_1');

// CLI: padrão é ensaio e --confirmo sem travas é recusado, sem chave no ambiente
const cli = fileURLToPath(new URL('./gerar-cobranca-contador.js', import.meta.url));
const env = { PATH: process.env.PATH };
const seco = execFileSync('node', [cli, '--escritorio', 'Teste'], { env }).toString();
assert.match(seco, /ENSAIO/);
assert.throws(() => execFileSync('node', [cli, '--escritorio', 'Teste', '--confirmo'], { env, stdio: 'pipe' }), (e) => e.status === 2 && /RECUSADO/.test(String(e.stderr)));
console.log('ok — gerar-cobranca-contador');
