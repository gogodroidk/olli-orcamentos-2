import test from 'node:test';
import assert from 'node:assert/strict';
import { montarResumo, haQuanto, diaSp } from './resumo-18h30.mjs';

const agora = '2026-11-13T18:30:00-03:00';
const hoje = Math.floor(new Date(agora).getTime() / 1000);
const cedo = hoje - 5 * 3600;

test('dia em São Paulo', () => {
  assert.equal(diaSp(new Date(agora).getTime()), '2026-11-13');
});

test('resumo conta empresa, robô, espera e lead quente, sem dado de pessoa', () => {
  const texto = montarResumo({
    agora,
    conversas: [
      { inbox_id: 4, status: 'resolved', labels: ['olli-orcamentos'], last_activity_at: hoje },
      { inbox_id: 4, status: 'pending', labels: ['funil-novo'], last_activity_at: hoje },
      { inbox_id: 2, status: 'open', labels: ['lead-quente', 'pediu-humano', 'gr-tech'], waiting_since: cedo, last_activity_at: hoje },
      { inbox_id: 3, status: 'open', labels: ['segundo-andar'], waiting_since: hoje - 600, last_activity_at: hoje },
      { inbox_id: 5, status: 'open', labels: [], last_activity_at: hoje, waiting_since: cedo - 99999 },
      { inbox_id: 2, status: 'resolved', labels: ['lead-quente'], last_activity_at: hoje },
      { inbox_id: 4, status: 'open', labels: ['cliente-antigo'], last_activity_at: hoje - 3 * 86400 },
    ],
  });
  assert.match(texto, /OLLI 2 hoje/);
  assert.match(texto, /GR Tech 2/);
  assert.match(texto, /Segundo Andar 1/);
  assert.match(texto, /Pessoal 1/);
  assert.match(texto, /Robô encerrou sozinho: 2/);
  assert.match(texto, /Ainda com o robô: 1/);
  assert.match(texto, /Esperando você: 4/);
  assert.match(texto, /há 3 dias/);
  assert.match(texto, /Leads quentes: 1/);
  assert.doesNotMatch(texto, /\d{10,}/);
});

test('ninguém esperando', () => {
  const texto = montarResumo({ agora, conversas: [] });
  assert.match(texto, /Esperando você: ninguém/);
  assert.match(texto, /Leads quentes: 0/);
});

test('haQuanto', () => {
  assert.equal(haQuanto(hoje - 120, hoje * 1000), 'há 2 min');
  assert.equal(haQuanto(hoje - 7200, hoje * 1000), 'há 2 h');
  assert.equal(haQuanto(hoje - 86400, hoje * 1000), 'há 1 dia');
});
