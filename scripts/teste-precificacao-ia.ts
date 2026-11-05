/**
 * Precificação com IA (D-1438): a flag do painel nasce desligada, o rascunho
 * não carrega preço de venda e a conta continua em calcularPrecoServico.
 *
 *     node scripts/teste-precificacao-ia.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularPrecoServico } from '../src/services/precificacao.ts';
import {
  PRECIFICACAO_IA_LIGADA,
  ROTA_PRECIFICACAO_IA,
  aplicarRascunhoPrecificacao,
  lerRascunhoPrecificacao,
  painelPrecificacaoIaLigado,
  pedirRascunhoPrecificacao,
  type CamposPrecificacaoForm,
} from '../webapp/src/olli/precificacaoIa.ts';

assert.equal(painelPrecificacaoIaLigado(undefined), false);
assert.equal(painelPrecificacaoIaLigado('true'), false);
assert.equal(painelPrecificacaoIaLigado('ON'), false);
assert.equal(painelPrecificacaoIaLigado('on'), true);
assert.equal(PRECIFICACAO_IA_LIGADA, false);
assert.equal(ROTA_PRECIFICACAO_IA, '/ia/precificacao/rascunho');

let fetches = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async () => {
  fetches += 1;
  throw new Error('a flag desligada não pode chamar a rede');
}) as typeof fetch;
const bloqueado = await pedirRascunhoPrecificacao('2 horas a 80 reais');
globalThis.fetch = fetchOriginal;
assert.equal(bloqueado.ok, false);
if (!bloqueado.ok) assert.equal(bloqueado.erro, 'desligada');
assert.equal(fetches, 0);

const formulario: CamposPrecificacaoForm = {
  nome: '',
  custoMateriais: 0,
  horas: 1,
  valorHora: 80,
  deslocamento: 0,
  custoCompra: 0,
  frete: 0,
  embalagem: 0,
  outrosCustos: 0,
  despesasFixasRateadas: 0,
  impostoPct: 6,
  taxaPagamentoPct: 3,
  reservaPct: 2,
  margemPct: 25,
};

const rascunho = lerRascunhoPrecificacao({
  modo: 'servico',
  nome: 'Limpeza de split',
  custoMateriais: 40,
  horas: 2,
  valorHora: 80,
  deslocamento: 25,
  custoCompra: 999,
  frete: null,
  embalagem: null,
  outrosCustos: null,
  despesasFixasRateadas: null,
  impostoPct: null,
  taxaPagamentoPct: 91,
  reservaPct: null,
  margemPct: 30,
  faltando: ['impostos'],
  avisos: ['Informe o imposto se quiser vê-lo na conta.'],
  confianca: 0.4,
  evidencia: '2 horas',
  precoSugerido: 9999,
  preco: 1,
});
assert.ok(rascunho);
assert.equal(rascunho.custoCompra, 999);
assert.equal(rascunho.taxaPagamentoPct, null);
assert.equal('precoSugerido' in rascunho, false);

const aplicado = aplicarRascunhoPrecificacao(formulario, rascunho);
assert.equal(aplicado.modo, 'servico');
assert.equal(aplicado.campos.horas, 2);
assert.equal(aplicado.campos.custoMateriais, 40);
assert.equal(aplicado.campos.deslocamento, 25);
assert.equal(aplicado.campos.margemPct, 30);
assert.equal(aplicado.campos.impostoPct, 6);
assert.equal(aplicado.campos.taxaPagamentoPct, 3);
assert.equal(aplicado.campos.custoCompra, 0);
assert.equal(aplicado.campos.nome, 'Limpeza de split');
assert.equal(aplicado.preenchidos.includes('custoCompra'), false);

const preco = calcularPrecoServico({
  custoMateriais: aplicado.campos.custoMateriais,
  horas: aplicado.campos.horas,
  valorHora: aplicado.campos.valorHora,
  deslocamento: aplicado.campos.deslocamento,
  impostoPct: aplicado.campos.impostoPct,
  taxaPagamentoPct: aplicado.campos.taxaPagamentoPct,
  reservaPct: aplicado.campos.reservaPct,
  margemPct: aplicado.campos.margemPct,
});
assert.ok(preco);
assert.equal(preco.custoDireto, 225);
assert.equal(preco.precoSugerido, 381.36);
assert.notEqual(preco.precoSugerido, 9999);

const pagina = readFileSync(new URL('../webapp/src/pages/olli/precificacao/index.tsx', import.meta.url), 'utf8');
const painel = readFileSync(new URL('../webapp/src/pages/olli/precificacao/PrecificacaoIaPainel.tsx', import.meta.url), 'utf8');
assert.match(pagina, /PRECIFICACAO_IA_LIGADA \?/);
assert.match(pagina, /PrecificacaoIaPainel/);
assert.match(pagina, /Central de Precificação/);
assert.match(painel, /Não é pesquisa de mercado/);
assert.match(painel, /não vai para o cliente/);
assert.match(painel, /Colocar na calculadora/);
assert.doesNotMatch(painel, /preço justo/i);
assert.match(readFileSync(new URL('../webapp/src/olli/precificacaoIa.ts', import.meta.url), 'utf8'), /ROTA_PRECIFICACAO_IA/);

console.log('OK — rascunho de precificação com IA desligado e preço ainda sai da calculadora.');
