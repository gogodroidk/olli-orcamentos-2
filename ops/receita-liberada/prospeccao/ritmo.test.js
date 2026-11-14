import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirCampanha, diasUteisDepois, intervaloCampanha, retornoDevido, LIMITE_DIA, LIMITE_HORA, subidaLigada, tetoVigente, motivoPararSubida, PLANO_SUBIDA } from './ritmo.mjs';

const sexta10 = new Date('2026-11-13T13:00:00Z'); // sexta 10h
const noite = new Date('2026-11-13T23:30:00Z'); // sexta 20:30
const terca10 = new Date('2026-11-17T13:00:00Z');

function lead(id) {
  return { id, nome: id, telefone_e164: '+5511988887777', nicho: 'refrigeracao', nota: 4 };
}

test('intervalo fica entre 5 e 12 minutos', () => {
  assert.equal(intervaloCampanha(() => 0), 5);
  assert.equal(intervaloCampanha(() => 0.999), 12);
  assert.equal(intervaloCampanha(() => 0.5), 9);
});

test('retorno só depois de 2 dias úteis, pulando o fim de semana', () => {
  assert.equal(diasUteisDepois('2026-11-13T13:00:00Z', sexta10), 0);
  assert.equal(diasUteisDepois('2026-11-13T13:00:00Z', new Date('2026-11-16T13:00:00Z')), 1);
  assert.equal(diasUteisDepois('2026-11-13T13:00:00Z', terca10), 2);
  assert.equal(retornoDevido({ status: 'enviado', em: '2026-11-13T13:00:00Z' }, terca10), true);
  assert.equal(retornoDevido({ status: 'enviado', em: '2026-11-13T13:00:00Z', followup_em: terca10.toISOString() }, terca10), false);
  assert.equal(retornoDevido({ status: 'enviado', em: '2026-11-13T13:00:00Z', respondeu: true }, terca10), false);
});

test('teto de 10 no dia, 3 na hora, e a noite não manda', () => {
  const fila = [lead('a'), lead('b')];
  const estado = { itens: {}, proximo_em: null };
  assert.equal(decidirCampanha({ agora: sexta10, estado, fila, evolutionAberta: true }).acao, 'enviar');
  assert.equal(decidirCampanha({ agora: noite, estado, fila, evolutionAberta: true }).acao, 'fora_janela');
  assert.equal(decidirCampanha({ agora: sexta10, estado, fila, evolutionAberta: false }).motivo, 'evolution_desconectada');
  assert.equal(decidirCampanha({ agora: sexta10, estado, fila, freio: { motivo: '2_paradas' }, evolutionAberta: true }).acao, 'frear');
  const cheio = {
    itens: Object.fromEntries(Array.from({ length: LIMITE_DIA }, (_, i) => [`c${i}`, { status: 'enviado', em: sexta10.toISOString() }])),
  };
  assert.equal(decidirCampanha({ agora: sexta10, estado: cheio, fila, evolutionAberta: true }).motivo, 'teto_dia');
  const hora = {
    itens: Object.fromEntries(Array.from({ length: LIMITE_HORA }, (_, i) => [`h${i}`, { status: 'enviado', em: new Date(sexta10.getTime() - i * 60 * 1000).toISOString() }])),
  };
  assert.equal(decidirCampanha({ agora: sexta10, estado: hora, fila, evolutionAberta: true }).motivo, 'teto_hora');
  assert.equal(LIMITE_DIA, 10);
  assert.equal(LIMITE_HORA, 3);
});

test('o plano de subida fica desligado e para em bloqueio ou denúncia', () => {
  assert.equal(subidaLigada(), false);
  assert.deepEqual(tetoVigente(), { dia: 10, hora: 3, subida: 'desligada' });
  assert.deepEqual(PLANO_SUBIDA.map((p) => p.porDia), [10, 20, 40]);
  assert.equal(motivoPararSubida({ bloqueio: true }), 'bloqueio');
  assert.equal(motivoPararSubida({ denuncia: true }), 'denuncia');
  assert.equal(motivoPararSubida({ paradasNoDia: 2 }), '2_paradas');
  assert.equal(motivoPararSubida({}), '');
  assert.equal(LIMITE_DIA, 10);
  assert.equal(LIMITE_HORA, 3);
});

test('o retorno entra na frente e conta no teto do dia', () => {
  const antigo = lead('velho');
  const novo = lead('novo');
  const estado = { itens: { velho: { status: 'enviado', em: '2026-11-13T13:00:00Z' } }, proximo_em: null };
  const d = decidirCampanha({ agora: terca10, estado, fila: [novo, antigo], evolutionAberta: true });
  assert.equal(d.pessoa.id, 'velho');
  assert.equal(d.toque, 2);
  const dezRetornos = {
    itens: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}`, { status: 'enviado', em: '2026-11-13T13:00:00Z', followup_em: terca10.toISOString() }])),
  };
  assert.equal(decidirCampanha({ agora: terca10, estado: dezRetornos, fila: [novo], evolutionAberta: true }).motivo, 'teto_dia');
});
