import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRobo } from './robo.js';

function roboDe(extras = {}) {
  const enviadas = [];
  const notas = [];
  const etiquetas = [];
  const paradas = [];
  const api = async (caminho, metodo, corpo) => {
    if (corpo?.content && corpo.private === false) enviadas.push(corpo.content);
    if (corpo?.content && corpo.private === true) notas.push(corpo.content);
    if (String(caminho).endsWith('/labels') && metodo === 'POST') etiquetas.push(corpo.labels);
    return {};
  };
  const estado = {};
  const robo = criarRobo({
    companies: { 'OLLI Orçamentos': { empresa: 'olli', label: 'olli-orcamentos' } },
    api, estado, salvar() {}, aviso: async () => {}, registrarParada: async (p) => paradas.push(p),
    ...extras,
  });
  return { robo, enviadas, notas, etiquetas, paradas, estado };
}

function evento(texto, labels = []) {
  return {
    event: 'message_created', message_type: 'incoming', id: 1, content: texto,
    sender: { name: 'Ana Souza' },
    conversation: { id: 40, status: 'pending', inbox: { name: 'OLLI Orçamentos' }, labels, meta: {} },
    inbox: { name: 'OLLI Orçamentos' },
  };
}

test('sem a etiqueta ativacao a Lívia segue o atendimento normal', async () => {
  const { robo, enviadas } = roboDe();
  const r = await robo.tratar(evento('como faço um orçamento'));
  assert.equal(r.modo, undefined);
  assert.match(enviadas[0], /Orçar/);
});

test('com a etiqueta ativacao ela pede o serviço e o valor e manda o link', async () => {
  const { robo, enviadas } = roboDe();
  const r = await robo.tratar(evento('oi', ['ativacao']));
  assert.equal(r.modo, 'ativacao');
  assert.match(enviadas[0], /serviço e o valor/);
  assert.match(enviadas[0], /olliorcamentos\.online/);
  assert.doesNotMatch(enviadas[0], /SAIR/);
});

test('pedir para parar na ativação grava a etiqueta e conta no freio', async () => {
  const { robo, etiquetas, paradas } = roboDe();
  const r = await robo.tratar(evento('quero sair', ['ativacao']));
  assert.equal(r.acao, 'suprimir');
  assert.ok(etiquetas.some((ls) => ls.includes('parar-contato')));
  assert.equal(paradas.length, 1);
  assert.equal(paradas[0].conversa, 40);
});

test('reclamação na ativação avisa com nota e não continua vendendo', async () => {
  const { robo, notas, estado } = roboDe();
  const r = await robo.tratar(evento('que absurdo, vou no procon', ['ativacao']));
  assert.equal(r.acao, 'humano');
  assert.equal(estado[40].done, true);
  assert.ok(notas.some((n) => /Reclamação|reclamacao|Prioridade/i.test(n)));
});
