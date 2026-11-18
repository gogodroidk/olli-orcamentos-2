import test from 'node:test';
import assert from 'node:assert/strict';
import { nichoDe, textoPrimeiroToque, textoRetorno, textoProibido, TEXTO_TESTE_CASA } from './mensagens.mjs';

const nichos = ['refrigeracao', 'eletrica', 'predial'];

test('cada nicho tem 1º toque com a empresa, o Rafa e a origem no site', () => {
  for (const nicho of nichos) {
    const texto = textoPrimeiroToque({ nome: 'Empresa Teste', nicho });
    assert.match(texto, /Empresa Teste/);
    assert.match(texto, /Rafa/);
    assert.match(texto, /OLLI/);
    assert.match(texto, /site/);
    assert.match(texto, /\?$/);
    assert.equal(textoProibido(texto), false);
    assert.doesNotMatch(texto, /OLLI Orçamentos|R\$|SAIR|Receita|CNPJ|garanto|100%/i);
  }
});

test('o retorno é outro texto e só pede um sim', () => {
  const a = textoPrimeiroToque({ nome: 'Fria Ltda', nicho: 'refrigeracao' });
  const b = textoRetorno({ nome: 'Fria Ltda', nicho: 'refrigeracao' });
  assert.notEqual(a, b);
  assert.match(b, /sim/);
  assert.match(b, /sem problema/);
  assert.equal(textoProibido(b), false);
});

test('teste da casa não usa texto de venda', () => {
  assert.equal(textoPrimeiroToque({ id: 'teste-casa', nome: 'Casa' }), TEXTO_TESTE_CASA);
  assert.match(TEXTO_TESTE_CASA, /Teste interno/);
});

test('nicho sai do nome e do motivo, com elétrica na frente de clima', () => {
  assert.equal(nichoDe('Bom Clima SP', ''), 'refrigeracao');
  assert.equal(nichoDe('Grupo V3 Connect Instalações', 'serviços elétricos prediais'), 'eletrica');
  assert.equal(nichoDe('SP Predial', 'reformas'), 'predial');
});
