/**
 * D1438-G02 — configurações de layout explicadas.
 * O catálogo descreve o que o PDF faz de verdade, a tela mostra esquema + prévia,
 * a Central de Ajuda repete o mesmo texto e o painel explica menu/esticar.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ARTIGOS_AJUDA } from '../src/content/ajuda/index.ts';
import {
  MODELOS_ORCAMENTO,
  MODELOS_RECIBO,
  TEXTO_LAYOUT_SO_VISUAL,
  TEXTO_PREVIA_EXEMPLO,
  TEXTO_RECIBO_SO_VISUAL,
  sugestaoParaOficio,
} from '../src/content/modelosLayout.ts';
import { verticalPorId } from '../src/services/verticais.ts';

const ler = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const IDS_PDF = ['editorial', 'premium_capa', 'minimalista', 'bold', 'classico', 'faixa_lateral', 'recibo_compacto'];
const IDS_RECIBO = ['classico', 'compacto', 'faixa'];

assert.deepEqual(MODELOS_ORCAMENTO.map((m) => m.id), IDS_PDF, 'um texto para cada modelo de orçamento, na ordem do catálogo');
assert.deepEqual(MODELOS_RECIBO.map((m) => m.id), IDS_RECIBO, 'um texto para cada modelo de recibo');

for (const m of [...MODELOS_ORCAMENTO, ...MODELOS_RECIBO]) {
  assert.ok(m.resumo.length >= 24, `${m.id} resumo curto demais: ${m.resumo}`);
  assert.ok(m.quandoUsar.length >= 40, `${m.id} sem "quando usar"`);
  assert.equal(m.quandoUsar.includes('R$'), false, `${m.id} não fala de preço`);
}

assert.match(TEXTO_LAYOUT_SO_VISUAL, /não mudam/);
assert.match(TEXTO_LAYOUT_SO_VISUAL, /Cliente, itens, preços e condições/);
assert.match(TEXTO_RECIBO_SO_VISUAL, /Valor, data e forma de pagamento/);
assert.match(TEXTO_PREVIA_EXEMPLO, /Nada é enviado ao cliente/);

assert.equal(sugestaoParaOficio(null), null);
assert.equal(sugestaoParaOficio([]), null);
assert.equal(sugestaoParaOficio(['geral']), null);
assert.equal(sugestaoParaOficio(['desconhecido']), null);
assert.deepEqual(sugestaoParaOficio(['refrigeracao']), {
  modeloId: 'faixa_lateral',
  oficio: 'Refrigeração e Climatização',
});
assert.equal(sugestaoParaOficio(['geral', 'pintura'])?.modeloId, 'recibo_compacto');
assert.equal(sugestaoParaOficio(['dedetizacao', 'refrigeracao'])?.modeloId, 'classico', 'o primeiro ofício com sugestão vence');

const oficiosComSugestao = ['refrigeracao', 'eletrica', 'hidraulica', 'extintores', 'dedetizacao', 'caixa_dagua', 'pintura', 'jardinagem'] as const;
for (const id of oficiosComSugestao) {
  const s = sugestaoParaOficio([id]);
  assert.equal(s?.oficio, verticalPorId(id).label, `${id}: o selo usa o nome do ofício cadastrado`);
}

const artigo = ARTIGOS_AJUDA.find((a) => a.id === 'modelos-layout-documento');
assert.ok(artigo, 'a Central de Ajuda explica o layout');
const corpo = artigo.corpo.map((b) => (Array.isArray(b.conteudo) ? b.conteudo.join('\n') : b.conteudo)).join('\n');
assert.ok(corpo.includes(TEXTO_LAYOUT_SO_VISUAL));
assert.ok(corpo.includes(TEXTO_RECIBO_SO_VISUAL));
assert.ok(corpo.includes(TEXTO_PREVIA_EXEMPLO));
for (const m of [...MODELOS_ORCAMENTO, ...MODELOS_RECIBO]) {
  assert.ok(corpo.includes(m.nome), `ajuda sem o nome ${m.nome}`);
  assert.ok(corpo.includes(m.quandoUsar), `ajuda sem o quando usar de ${m.id}`);
}
assert.match(corpo, /1280px/);
assert.match(corpo, /dicas de visual|dica de visual/i);
assert.equal(/stripe|abacate|google play/i.test(corpo), false);

const tela = ler('../src/screens/ModelosDocumentoScreen.tsx');
assert.match(tela, /Ver como fica/);
assert.match(tela, /Nada é enviado ao cliente/);
assert.match(tela, /PreviaEsquemaLayout/);
assert.match(tela, /TEXTO_LAYOUT_SO_VISUAL/);
assert.match(tela, /sugestaoParaOficio/);
assert.doesNotMatch(tela, /desc: 'visual técnico'|desc: 'serviço pequeno'|desc: 'limpo e direto'/);

const passo = ler('../src/steps/Step4Personalizacao.tsx');
assert.match(passo, /TEXTO_LAYOUT_SO_VISUAL/);
assert.match(passo, /modelo\.quandoUsar/);
assert.match(passo, /MODELOS_ORCAMENTO/);

const conta = ler('../src/screens/ContaScreen.tsx');
assert.match(conta, /explicação e prévia de cada modelo/);

const painel = ler('../webapp/src/layouts/components/setting-button.tsx');
const i18n = ler('../webapp/src/locales/lang/pt_BR/sys.json');
for (const chave of ['layoutHelp', 'layoutVerticalDesc', 'layoutMiniDesc', 'layoutHorizontalDesc', 'stretchDesc']) {
  assert.match(painel, new RegExp(`sys\\.settings\\.${chave}`), `painel sem ${chave}`);
  assert.match(i18n, new RegExp(`"${chave}"`), `locale sem ${chave}`);
}
assert.doesNotMatch(painel, /TooltipContent/, 'esticar não pode depender de tooltip');
assert.match(i18n, /não mudam/);
assert.match(i18n, /1280px/);

console.log('teste-modelos-layout: ok');
