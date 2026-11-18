import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidir } from './decidir.mjs';
import { motivosDeBarrar, ehTeste } from './travas.mjs';

const porId = new Map([[4, { chave: 'IRIS', nome: 'Íris', userId: 4 }], [5, { chave: 'CARTEIRA', nome: 'Carteira', userId: 5 }]]);
const ev = (o = {}) => ({ event: 'message_created', message_type: 'incoming', private: false, content: 'oi', inbox: { id: 4 },
  sender: { phone_number: '+5511999990000' }, conversation: { id: 77, inbox_id: 4, status: 'pending', labels: [], meta: {} }, ...o });

test('conversa sem dono vai para a Íris', () => {
  const d = decidir(ev(), porId);
  assert.equal(d.acao, 'acordar'); assert.equal(d.agente.chave, 'IRIS'); assert.equal(d.atribuirIris, true);
});
test('dono agente acorda o dono, não a Íris', () => {
  const d = decidir(ev({ conversation: { id: 77, inbox_id: 4, status: 'open', labels: [], meta: { assignee: { id: 5, type: 'user' } } } }), porId);
  assert.equal(d.agente.chave, 'CARTEIRA'); assert.equal(d.atribuirIris, undefined);
});
test('bot com o mesmo id de um usuário não confunde (Lívia id 5 é AgentBot)', () => {
  const d = decidir(ev({ conversation: { id: 77, inbox_id: 4, status: 'pending', labels: [], meta: { assignee: { id: 5, type: 'agent_bot' } } } }), porId);
  assert.equal(d.agente.chave, 'IRIS');
});
test('dono humano de fora (Igor) não acorda ninguém', () => {
  const d = decidir(ev({ conversation: { id: 77, inbox_id: 4, status: 'open', labels: [], meta: { assignee: { id: 2, type: 'user', name: 'Igor' } } } }), porId);
  assert.equal(d.acao, 'ignorar');
});
test('campanha pendente com o robô fica com o robô', () => {
  const d = decidir(ev({ conversation: { id: 77, inbox_id: 4, status: 'pending', labels: ['prospeccao'], meta: { assignee: { id: 5, type: 'agent_bot' } } } }), porId);
  assert.equal(d.acao, 'ignorar');
});
test('campanha que o robô já soltou (aberta) vai para a Íris', () => {
  const d = decidir(ev({ conversation: { id: 77, inbox_id: 3, status: 'open', labels: ['prospeccao'], meta: {} }, inbox: { id: 3 } }), porId);
  assert.equal(d.agente.chave, 'IRIS');
});
test('GR Tech e Pessoal ficam fora', () => {
  assert.equal(decidir(ev({ inbox: { id: 2 }, conversation: { id: 1, inbox_id: 2, meta: {} } }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ inbox: { id: 5 }, conversation: { id: 1, inbox_id: 5, meta: {} } }), porId).acao, 'ignorar');
});
test('nota, saída e número nosso sem TESTE são ignorados; número nosso com TESTE acorda', () => {
  assert.equal(decidir(ev({ private: true }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ message_type: 'outgoing' }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ sender: { phone_number: '+5511960163507' } }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ sender: { phone_number: '+5511960163507' }, content: 'TESTE — resposta da Íris' }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ sender: { phone_number: '+5511960163507' }, content: 'TESTE — ACORDAR ponta a ponta' }), porId).acao, 'acordar');
});
test('travas D-2233 / D-2333 / dados', () => {
  assert.ok(motivosDeBarrar('Qualquer coisa responda SAIR').length);
  assert.ok(motivosDeBarrar('Se não for o momento, não te chamo mais.').length);
  assert.ok(motivosDeBarrar('Quer continuar?').length);
  assert.ok(motivosDeBarrar('Não sou robô não, pode confiar').length);
  assert.ok(motivosDeBarrar('Tô no trânsito, já te respondo').length);
  assert.ok(motivosDeBarrar('Me passa o seu CPF').length);
  assert.ok(motivosDeBarrar('Falei com o Salomão').length);
  assert.deepEqual(motivosDeBarrar('Oi Pedro! Me conta qual parte do orçamento travou que eu te ajudo a montar.'), []);
  assert.deepEqual(motivosDeBarrar('Sou o assistente virtual da OLLI, posso te ajudar com o orçamento.'), []);
  assert.ok(ehTeste('TESTE — ok')); assert.ok(!ehTeste('Oi, teste do app'));
});
