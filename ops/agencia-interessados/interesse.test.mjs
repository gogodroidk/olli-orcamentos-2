import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pediuParaVer, ofertaDaFala, descreverQuer, redigirPedido, nomeDeEmpresa, registroDeInteresse,
} from './interesse.mjs';

test('pediu para ver não confunde sim, quero sozinho nem pedido de parar', () => {
  assert.equal(pediuParaVer('quero ver'), true);
  assert.equal(pediuParaVer('pode mostrar o atendimento?'), true);
  assert.equal(pediuParaVer('quero ver como fica o site'), true);
  assert.equal(pediuParaVer('sim'), false);
  assert.equal(pediuParaVer('quero'), false);
  assert.equal(pediuParaVer('ok'), false);
  assert.equal(pediuParaVer(''), false);
});

test('o que a pessoa quer junta o sinal e a oferta, sem preço', () => {
  assert.equal(ofertaDaFala('quanto custa um site novo'), 'site');
  assert.equal(descreverQuer('preco', 'quanto custa um site novo'), 'Pediu preço · site');
  assert.equal(descreverQuer('ver', 'quero ver o atendimento no WhatsApp'), 'Pediu para ver · atendimento no WhatsApp');
  assert.equal(descreverQuer('aceitou', 'pode chamar o Igor'), 'Aceitou conversa');
  assert.equal(descreverQuer('preco', 'quanto custa').includes('R$'), false);
});

test('registro não guarda telefone nem documento', () => {
  const pedido = redigirPedido('meu zap é +55 11 98888-7777 e o cpf 123.456.789-09');
  assert.equal(pedido.includes('98888'), false);
  assert.equal(pedido.includes('123.456'), false);
  assert.equal(nomeDeEmpresa('+5511988887777', 'Refrigeração Aurora'), 'Refrigeração Aurora');
  const reg = registroDeInteresse({
    tipo: 'preco', texto: 'quanto custa o site, zap 11988887777', empresa: 'Elétrica Luminar',
    conversa: 70, nicho: 'elétrica', desde: 1000,
  });
  assert.equal(reg.empresa, 'Elétrica Luminar');
  assert.equal(reg.quer, 'Pediu preço · site');
  assert.equal(Object.hasOwn(reg, 'telefone'), false);
  assert.equal(Object.hasOwn(reg, 'numero'), false);
  assert.equal(reg.pedido.includes('98888'), false);
  assert.equal(registroDeInteresse({ tipo: 'outro', texto: 'oi', conversa: 1 }), null);
});
