import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRobo, cidadeCitada, etapaDoRoteiro } from './robo.js';

test('cidadeCitada', () => {
  assert.equal(cidadeCitada('Oi, moro em Osasco e preciso de orçamento'), 'Osasco');
  assert.equal(cidadeCitada('fico em santo andre.'), 'Santo Andre');
  assert.equal(cidadeCitada('quanto custa?'), '');
});
test('etapaDoRoteiro', () => {
  assert.equal(etapaDoRoteiro({ acao: 'suprimir' }, 3), 'parou');
  assert.equal(etapaDoRoteiro({ acao: 'humano' }, 1), 'humano');
  assert.equal(etapaDoRoteiro({ acao: 'enviar' }, 1), 'saudacao');
  assert.equal(etapaDoRoteiro({ acao: 'enviar', qualificacao: { oque: false } }, 2), 'entender');
  assert.equal(etapaDoRoteiro({ acao: 'enviar', qualificacao: { oque: true } }, 2), 'qualificando');
});
test('robô registra etapa sem mudar a resposta', async () => {
  const enviadas = []; const estado = {};
  const api = async (p, m, b) => { if (b?.content && !b.private) enviadas.push(b.content); return {}; };
  const robo = criarRobo({ companies: { 'GR Tech': { empresa: 'grtech', label: 'gr-tech' } }, api, estado, salvar() {}, aviso: async () => {} });
  const ev = { event: 'message_created', message_type: 'incoming', id: 1, content: 'Oi, quero um orçamento de ar condicionado, moro em Osasco', sender: { name: 'Carlos Souza' }, conversation: { id: 99, status: 'pending', inbox: { name: 'GR Tech' }, labels: [], meta: {} }, inbox: { name: 'GR Tech' } };
  const r = await robo.tratar(ev);
  assert.ok(r.ok);
  assert.equal(estado[99].empresa, 'grtech');
  assert.equal(estado[99].cidade, 'Osasco');
  assert.ok(estado[99].t0 > 0 && estado[99].tu >= estado[99].t0);
  assert.ok(['saudacao', 'entender', 'qualificando', 'humano'].includes(estado[99].etapa));
  assert.equal(enviadas.length >= 1, true);
});
