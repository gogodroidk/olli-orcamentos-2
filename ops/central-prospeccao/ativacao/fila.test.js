import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decidir, janelaAberta, montarFila, motivoFora, LIMITE_DIA, LIMITE_HORA } from './fila.mjs';
import { hashesDeTelefone } from './telefones.mjs';

const hashes = new Set();
const ctx = { hashesCsv: hashes, syncFresca: true };

function pessoa(extra) {
  return {
    conta_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    nome: 'Ana',
    telefone_e164: '+5511988887777',
    especialidade: 'Elétrica',
    cidade: 'Osasco',
    etapa: 'cadastrou',
    cadastro: '2026-11-01',
    plano: 'gratis',
    orcamentos: 0,
    paga: false,
    suprimido: false,
    prioridade: 2,
    ...extra,
  };
}

const sexta10 = new Date('2026-11-13T13:00:00Z'); // 10h em Brasília
const domingo10 = new Date('2026-11-15T13:00:00Z');
const sabado10 = new Date('2026-11-14T13:00:00Z');
const sexta8 = new Date('2026-11-13T11:00:00Z');
const sexta18 = new Date('2026-11-13T21:00:00Z');

test('janela é seg–sáb das 9h às 18h', () => {
  assert.equal(janelaAberta(sexta10), true);
  assert.equal(janelaAberta(sabado10), true);
  assert.equal(janelaAberta(domingo10), false);
  assert.equal(janelaAberta(sexta8), false);
  assert.equal(janelaAberta(sexta18), false);
});

test('fila põe Luiz e MK na frente e tira quem paga, quem parou e quem não tem telefone', () => {
  const luiz = pessoa({ conta_id: '8d2c59dd-0000-0000-0000-000000000001', nome: 'Luiz', orcamentos: 9, cadastro: '2026-09-16', prioridade: 0 });
  const mk = pessoa({ conta_id: 'ac0f2c80-0000-0000-0000-000000000002', nome: 'Mike', orcamentos: 3, cadastro: '2026-10-01', prioridade: 1, telefone_e164: '+5511977776666' });
  const nova = pessoa({ conta_id: 'bbbbbbbb-0000-0000-0000-000000000003', cadastro: '2026-11-10', telefone_e164: '+5511966665555' });
  const paga = pessoa({ conta_id: 'cccccccc-0000-0000-0000-000000000004', paga: true, plano: 'pro', etapa: 'pagou' });
  const semFone = pessoa({ conta_id: 'dddddddd-0000-0000-0000-000000000005', telefone_e164: '' });
  const parou = pessoa({ conta_id: 'eeeeeeee-0000-0000-0000-000000000006', suprimido: true, telefone_e164: '+5511955554444' });
  const { fila, fora } = montarFila([nova, paga, mk, semFone, parou, luiz], ctx);
  assert.deepEqual(fila.map((p) => p.nome), ['Luiz', 'Mike', 'Ana']);
  assert.equal(fora.length, 3);
});

test('hash da supressão tira o número e a variante sem o 9', () => {
  const fone = '+5511988887777';
  const [h] = hashesDeTelefone(fone);
  const set = new Set([h]);
  assert.equal(motivoFora(pessoa({ telefone_e164: fone }), { hashesCsv: set, syncFresca: true }), 'supressao_csv');
  const sem9 = '551188887777';
  const hSem9 = createHash('sha256').update(sem9).digest('hex');
  assert.equal(motivoFora(pessoa(), { hashesCsv: new Set([hSem9]), syncFresca: true }), 'supressao_csv');
});

test('supressão velha não deixa ninguém na fila', () => {
  const { fila } = montarFila([pessoa()], { hashesCsv: hashes, syncFresca: false });
  assert.equal(fila.length, 0);
});

test('teto do dia, teto da hora e intervalo seguram o envio', () => {
  const fila = [pessoa()];
  const base = { itens: {}, proximo_em: null };
  assert.equal(decidir({ agora: sexta10, estado: base, fila, evolutionAberta: true }).acao, 'enviar');
  assert.equal(decidir({ agora: domingo10, estado: base, fila, evolutionAberta: true }).acao, 'fora_janela');
  assert.equal(decidir({ agora: sexta10, estado: base, fila, evolutionAberta: false }).motivo, 'evolution_desconectada');
  assert.equal(decidir({ agora: sexta10, estado: base, fila, freio: { motivo: '2_paradas' }, evolutionAberta: true }).acao, 'frear');
  const cheio = {
    itens: Object.fromEntries(Array.from({ length: LIMITE_DIA }, (_, i) => [`c${i}`, { status: 'enviado', em: new Date(sexta10.getTime() - i * 1000).toISOString() }])),
  };
  assert.equal(decidir({ agora: sexta10, estado: cheio, fila, evolutionAberta: true }).motivo, 'teto_dia');
  const hora = {
    itens: Object.fromEntries(Array.from({ length: LIMITE_HORA }, (_, i) => [`h${i}`, { status: 'enviado', em: new Date(sexta10.getTime() - i * 60 * 1000).toISOString() }])),
  };
  assert.equal(decidir({ agora: sexta10, estado: hora, fila, evolutionAberta: true }).motivo, 'teto_hora');
  const cedo = { itens: {}, proximo_em: new Date(sexta10.getTime() + 5 * 60 * 1000).toISOString() };
  assert.equal(decidir({ agora: sexta10, estado: cedo, fila, evolutionAberta: true }).motivo, 'intervalo');
});

test('teto opcional não muda o padrão de 12 da ativação', () => {
  const fila = [pessoa()];
  const em = new Date(sexta10.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const cinco = {
    itens: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, { status: 'enviado', em }])),
  };
  assert.equal(decidir({ agora: sexta10, estado: cinco, fila, evolutionAberta: true }).acao, 'enviar');
  assert.equal(decidir({ agora: sexta10, estado: cinco, fila, evolutionAberta: true, limiteDia: 5 }).motivo, 'teto_dia');
  assert.equal(LIMITE_DIA, 12);
});

test('modo teste recusa qualquer número que não seja o da casa', () => {
  assert.equal(motivoFora(pessoa(), { ...ctx, teste: true }), 'teste_so_numero_da_casa');
  assert.equal(motivoFora(pessoa({ telefone_e164: '+5511986032309', conta_id: 'ffffffff-0000-0000-0000-000000000009' }), ctx), 'numero_da_casa');
});
