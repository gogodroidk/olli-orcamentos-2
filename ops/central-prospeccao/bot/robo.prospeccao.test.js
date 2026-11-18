import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRobo } from './robo.js';

function roboDe() {
  const enviadas = [];
  const notas = [];
  const etiquetas = [];
  const paradasAtivacao = [];
  const paradasCampanha = [];
  const avisos = [];
  const api = async (caminho, metodo, corpo) => {
    if (corpo?.content && corpo.private === false) enviadas.push(corpo.content);
    if (corpo?.content && corpo.private === true) notas.push(corpo.content);
    if (String(caminho).endsWith('/labels') && metodo === 'POST') etiquetas.push(corpo.labels);
    return {};
  };
  const estado = {};
  const robo = criarRobo({
    companies: {
      'OLLI Orçamentos': { empresa: 'olli', label: 'olli-orcamentos' },
      'Segundo Andar': { empresa: 'segundoandar', label: 'segundo-andar' },
    },
    api,
    estado,
    salvar() {},
    aviso: async (a) => avisos.push(a),
    registrarParada: async (p) => paradasAtivacao.push(p),
    registrarParadaCampanha: async (p) => paradasCampanha.push(p),
  });
  return { robo, enviadas, notas, etiquetas, paradasAtivacao, paradasCampanha, avisos, estado };
}

function evento(texto, { inbox = 'Segundo Andar', labels = ['prospeccao'], id = 1 } = {}) {
  return {
    event: 'message_created', message_type: 'incoming', id, content: texto,
    sender: { name: 'Marina Costa', phone_number: '+5511988887777' },
    conversation: { id: 70, status: 'pending', inbox: { name: inbox }, labels, meta: {} },
    inbox: { name: inbox },
  };
}

test('sem a etiqueta prospeccao o Rafa segue o atendimento da caixa', async () => {
  const { robo } = roboDe();
  const r = await robo.tratar(evento('oi', { labels: [] }));
  assert.equal(r.modo, undefined);
});

test('com a etiqueta ele pergunta os técnicos e não fala de orçamento do app', async () => {
  const { robo, enviadas } = roboDe();
  const r = await robo.tratar(evento('oi'));
  assert.equal(r.modo, 'prospeccao');
  assert.match(enviadas[0], /técnicos/);
  assert.doesNotMatch(enviadas[0], /olliorcamentos\.online|Orçar|OLLI Orçamentos/);
});

test('parar na prospecção não aciona o freio da ativação', async () => {
  const { robo, etiquetas, paradasAtivacao, paradasCampanha } = roboDe();
  const r = await robo.tratar(evento('pode parar'));
  assert.equal(r.acao, 'suprimir');
  assert.ok(etiquetas.some((ls) => ls.includes('parar-contato') && ls.includes('prospeccao')));
  assert.equal(paradasAtivacao.length, 0);
  assert.equal(paradasCampanha.length, 1);
  assert.equal(paradasCampanha[0].conversa, 70);
});

test('preço avisa o Igor na hora e a ativação da OLLI continua no outro modo', async () => {
  const caixa = roboDe();
  const quente = await caixa.robo.tratar(evento('quanto custa?'));
  assert.equal(quente.lead, 'quente');
  assert.equal(caixa.avisos.length, 1);
  assert.match(caixa.avisos[0].quer, /preco/);
  assert.doesNotMatch(caixa.enviadas[0], /R\$/);

  const olli = roboDe();
  const ativ = await olli.robo.tratar(evento('oi', { inbox: 'OLLI Orçamentos', labels: ['ativacao'], id: 2 }));
  assert.equal(ativ.modo, 'ativacao');
  assert.match(olli.enviadas[0], /olliorcamentos\.online/);
});
