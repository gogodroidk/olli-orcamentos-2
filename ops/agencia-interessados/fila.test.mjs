import test from 'node:test';
import assert from 'node:assert/strict';
import { selecionarRegistros, montarInteressados, textoEspera, cruzar, lerRegistros } from './fila.mjs';

const agora = 1_700_000_000;

test('a espera fala em minutos, horas e dias', () => {
  assert.equal(textoEspera(30), 'há instantes');
  assert.equal(textoEspera(600), 'há 10 min');
  assert.equal(textoEspera(7200), 'há 2 h');
  assert.equal(textoEspera(90000), 'há 1 d');
});

test('quem pediu para parar sai e o primeiro horário de interesse fica', () => {
  const linhas = lerRegistros([
    JSON.stringify({ conversa: 7, empresa: 'Aurora', quer: 'Pediu preço', desde: agora - 5000, parado: false }),
    JSON.stringify({ conversa: 7, empresa: 'Aurora', quer: 'Pediu preço · site', desde: agora - 100, parado: false }),
    JSON.stringify({ conversa: 8, empresa: 'Luminar', quer: 'Pediu para ver', desde: agora - 800, parado: false }),
    JSON.stringify({ conversa: 8, parado: true }),
    '{nao-json',
  ].join('\n'));
  const sel = selecionarRegistros(linhas);
  assert.equal(sel.length, 1);
  assert.equal(sel[0].conversa, 7);
  assert.equal(sel[0].desde, agora - 5000);
  assert.equal(sel[0].quer, 'Pediu preço · site');
});

test('painel junta etiqueta, empresa, o que quer e a espera', () => {
  const itens = montarInteressados({
    agora,
    conversas: [
      { id: 7, nome: 'Contato', labels: ['interessado', 'prospeccao'], status: 'open', parar: false, atividade: agora - 100 },
      { id: 9, nome: 'Parou', labels: ['interessado', 'parar-contato'], status: 'open', parar: true, atividade: agora - 9000 },
      { id: 10, nome: 'Fechada', labels: ['interessado'], status: 'resolved', parar: false, atividade: agora - 50 },
    ],
    estado: { 7: { quer: 'Pediu preço · site', interesseDesde: agora - 4000, interesse: 'preco', nicho: 'elétrica' } },
    registros: [
      { conversa: 7, empresa: 'Elétrica Luminar', quer: 'Pediu preço', pedido: 'site novo', desde: agora - 4000, nicho: 'elétrica' },
      { conversa: 11, empresa: 'Refrigeração Aurora', quer: 'Pediu para ver · atendimento no WhatsApp', pedido: 'quero ver', desde: agora - 5400, nicho: 'refrigeração' },
    ],
  });
  assert.deepEqual(itens.map((i) => i.empresa), ['Refrigeração Aurora', 'Elétrica Luminar']);
  assert.equal(itens[1].quer, 'Pediu preço · site');
  assert.equal(itens[0].desde, agora - 5400);
  assert.equal(itens.some((i) => i.empresa === 'Parou' || i.empresa === 'Fechada'), false);
});

test('resumo tira quem a central já encerrou ou pediu para parar', () => {
  const itens = [
    { conversa: 1, empresa: 'A', quer: 'Pediu preço', desde: 1 },
    { conversa: 2, empresa: 'B', quer: 'Aceitou conversa', desde: 2 },
    { conversa: 3, empresa: 'C', quer: 'Pediu para ver', desde: 3 },
  ];
  const ficou = cruzar(itens, [
    { id: 1, status: 'resolved', labels: ['interessado'] },
    { id: 2, status: 'open', labels: ['interessado', 'parar-contato'] },
  ]);
  assert.deepEqual(ficou.map((i) => i.empresa), ['C']);
});
