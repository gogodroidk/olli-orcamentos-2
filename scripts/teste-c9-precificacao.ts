import assert from 'node:assert/strict';
import { calcularPrecoProduto, calcularPrecoServico, PACKS_OFICIO } from '../src/services/precificacao.ts';
import { readFileSync } from 'node:fs';

const resultado = calcularPrecoServico({ custoMateriais: 100, horas: 2, valorHora: 80, deslocamento: 20, impostoPct: 10, margemPct: 20 });
assert.ok(resultado);
assert.equal(resultado.custoDireto, 280);
assert.ok(resultado.precoSugerido > resultado.custoDireto);
assert.equal(resultado.precoEquilibrio, 311.12);
assert.equal(resultado.margemRealPct, 20);
assert.ok(resultado.descontoMaxSemPrejuizoPct > 0);
assert.equal(resultado.memoria.length, 9);
assert.equal(calcularPrecoServico({ custoMateriais: 0, horas: 0, valorHora: 0 }), null);
assert.equal(calcularPrecoServico({ custoMateriais: 100, horas: 1, valorHora: 50, impostoPct: 80, margemPct: 20 }), null);
const produto = calcularPrecoProduto({ custoCompra: 100, frete: 10, embalagem: 2, outrosCustos: 3, impostoPct: 8, taxaPagamentoPct: 4, reservaPct: 3, margemPct: 25 });
assert.ok(produto);
assert.equal(produto.custoDireto, 115);
assert.ok(produto.precoSugerido > produto.precoEquilibrio);
assert.equal(calcularPrecoProduto({ custoCompra: -1 }), null);
for (const vertical of ['eletrica', 'hidraulica', 'pintura', 'dedetizacao', 'jardinagem']) {
  assert.ok(PACKS_OFICIO.some((pack) => pack.vertical === vertical), `pack ausente: ${vertical}`);
}

const pagina = readFileSync(new URL('../webapp/src/pages/olli/precificacao/index.tsx', import.meta.url), 'utf8');
const rotas = readFileSync(new URL('../webapp/src/routes/sections/dashboard/frontend.tsx', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../webapp/src/layouts/dashboard/nav/nav-data/nav-data-frontend.tsx', import.meta.url), 'utf8');
assert.match(pagina, /Central de Precificação/);
assert.match(pagina, /Produto, peça ou material/);
assert.match(pagina, /Preço mínimo/);
assert.match(pagina, /Salvar no catálogo/);
assert.match(rotas, /path: "precificacao"/);
assert.match(menu, /title: "Precificação"/);

console.log('OK — Central de Precificação geral, preço explicável e integração com catálogo validados.');
