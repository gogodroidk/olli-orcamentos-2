import test from 'node:test';
import assert from 'node:assert/strict';
import { mensagemAtivacao, OFERTA, LINK_APP } from './mensagens.mjs';

const proibidos = [/responda SAIR/i, /\bIA\b/, /garanto/i, /2 min/i, /em \d+ minutos/i];

function limpa(texto) {
  for (const re of proibidos) assert.equal(re.test(texto), false, re);
  assert.match(texto, /Lívia/);
  assert.match(texto, new RegExp(LINK_APP.replace(/\./g, '\\.')));
}

test('mensagem de quem não orçou leva o nome, o ofício e a oferta', () => {
  const t = mensagemAtivacao({
    conta_id: '11111111-1111-1111-1111-111111111111',
    nome: 'Ana Souza',
    especialidade: 'Elétrica',
    etapa: 'cadastrou',
    orcamentos: 0,
    plano: 'gratis',
  });
  limpa(t);
  assert.match(t, /^Oi Ana,/);
  assert.match(t, /Elétrica/);
  assert.match(t, new RegExp(OFERTA.replace(/[.]/g, '\\.')));
  assert.doesNotMatch(t, /R\$/);
});

test('rascunho parado não promete prazo', () => {
  const t = mensagemAtivacao({ nome: 'Bruno', especialidade: '', etapa: 'orcamento', orcamentos: 1, plano: 'gratis', conta_id: 'abc' });
  limpa(t);
  assert.match(t, /ficou parado/);
  assert.match(t, /Oi Bruno,/);
});

test('Luiz só cita o Pro de tabela', () => {
  const t = mensagemAtivacao({ conta_id: '8d2c59dd-aaaa-bbbb-cccc-ddddeeeeffff', nome: 'Luiz Henrique', etapa: 'enviado', orcamentos: 9, plano: 'gratis' });
  limpa(t);
  assert.match(t, /R\$ 39/);
  assert.doesNotMatch(t, /R\$ 99/);
  assert.doesNotMatch(t, /950/);
  assert.match(t, /Oi Luiz,/);
});

test('prioridade vazia não vira o texto do pagamento', () => {
  const t = mensagemAtivacao({
    conta_id: '11111111-1111-1111-1111-111111111111',
    nome: 'Ana',
    especialidade: 'Elétrica',
    etapa: 'cadastrou',
    orcamentos: 0,
    prioridade: null,
  });
  limpa(t);
  assert.doesNotMatch(t, /R\$/);
  assert.match(t, /primeiro orçamento/);
});

test('MK Bombas só cita o Empresa de tabela', () => {
  const t = mensagemAtivacao({ conta_id: 'ac0f2c80-aaaa-bbbb-cccc-ddddeeeeffff', nome: 'Mike', especialidade: 'Bombas', orcamentos: 2, plano: 'gratis' });
  limpa(t);
  assert.match(t, /R\$ 99/);
  assert.doesNotMatch(t, /950/);
});
