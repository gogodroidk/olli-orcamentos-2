import test from 'node:test';
import assert from 'node:assert/strict';
import { enviarUma, textoEnvio, textoDoFreio } from './enviar.mjs';
import { gerarMapa, gerarLista } from './relatorio.mjs';

const pessoa = {
  conta_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  nome: 'Ana Souza',
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
};

function apiFalsa(opcoes = {}) {
  const chamadas = [];
  const api = async (metodo, caminho, corpo) => {
    chamadas.push({ metodo, caminho, corpo });
    if (caminho.startsWith('/contacts/search')) return { payload: [] };
    if (metodo === 'POST' && caminho === '/contacts') return { id: 7 };
    if (caminho === '/contacts/7/labels' && metodo === 'GET') return { payload: opcoes.etiquetas || [] };
    if (caminho === '/contacts/7/labels') return {};
    if (caminho === '/contacts/7/conversations') return { payload: opcoes.conversa ? [{ id: 9, inbox_id: 4 }] : [] };
    if (metodo === 'POST' && caminho === '/conversations') return { id: 9 };
    if (caminho === '/conversations/9/labels' && metodo === 'GET') return { payload: opcoes.etiquetas || [] };
    if (caminho === '/conversations/9/labels') return {};
    if (caminho === '/conversations/9/messages' && metodo === 'GET') return { payload: opcoes.mensagens || [] };
    if (caminho === '/conversations/9/messages') return {};
    return {};
  };
  return { api, chamadas };
}

const agora = new Date('2026-11-13T13:00:00Z');
const base = { hashesCsv: new Set(), syncOk: true, teste: false, evolutionOk: true, freio: null, agora, inboxId: 4, aleatorio: () => 0 };

test('manda uma mensagem e a segunda passagem não repete', async () => {
  const { api, chamadas } = apiFalsa();
  const estado = { itens: {} };
  const r = await enviarUma({ ...base, api, pessoas: [pessoa], estado });
  assert.equal(r.acao, 'enviou');
  assert.equal(r.fone, '****7777');
  assert.equal(chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/conversations/9/messages').length, 1);
  assert.match(chamadas.find((c) => c.caminho === '/conversations/9/messages' && c.metodo === 'POST').corpo.content, /Elétrica/);
  assert.doesNotMatch(chamadas.find((c) => c.caminho === '/conversations/9/messages' && c.metodo === 'POST').corpo.content, /SAIR/);
  const deNovo = await enviarUma({ ...base, api, pessoas: [pessoa], estado });
  assert.equal(deNovo.acao, 'esperar');
  assert.equal(deNovo.motivo, 'intervalo');
  estado.proximo_em = new Date(agora.getTime() - 1000).toISOString();
  const depois = await enviarUma({ ...base, api, pessoas: [pessoa], estado });
  assert.equal(depois.acao, 'fila_vazia');
  assert.equal(chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/conversations/9/messages').length, 1);
});

test('quem já respondeu ou pediu para parar não recebe texto', async () => {
  const parou = apiFalsa({ etiquetas: ['parar-contato'] });
  const estado = { itens: {} };
  const r = await enviarUma({ ...base, api: parou.api, pessoas: [pessoa], estado });
  assert.equal(r.motivo, 'parar-contato');
  assert.equal(parou.chamadas.some((c) => c.caminho.endsWith('/messages') && c.metodo === 'POST'), false);

  const respondeu = apiFalsa({ mensagens: [{ message_type: 0, content: 'oi' }], conversa: true });
  const estado2 = { itens: {} };
  const r2 = await enviarUma({ ...base, api: respondeu.api, pessoas: [{ ...pessoa, conta_id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }], estado: estado2 });
  assert.equal(r2.motivo, 'ja_respondeu');
  assert.equal(respondeu.chamadas.some((c) => c.metodo === 'POST' && String(c.caminho).endsWith('/messages')), false);
});

test('teste da casa usa texto interno e o freio diz o motivo certo', () => {
  const t = textoEnvio({ conta_id: 'teste-casa', nome: 'Igor', telefone_e164: '+5511986032309' });
  assert.match(t, /teste interno/);
  assert.doesNotMatch(t, /primeiro orçamento/);
  assert.doesNotMatch(t, /R\$ 39/);
  assert.equal(textoDoFreio('2_paradas').tipo, 'erro');
  assert.match(textoDoFreio('2_paradas').mensagem, /parar/);
  assert.equal(textoDoFreio('evolution_desconectada').tipo, 'login');
  assert.match(textoDoFreio('evolution_desconectada').mensagem, /desconectou/);
});

test('relatório não escreve telefone aberto', () => {
  const mapa = gerarMapa([pessoa], { quando: 'teste' });
  const lista = gerarLista([pessoa], { hashesCsv: new Set(), syncFresca: true, estado: { itens: {} } }, { trava: 'ok' });
  assert.doesNotMatch(mapa + lista, /5511988887777/);
  assert.match(lista, /\*\*\*\*7777/);
  assert.match(lista, /Elétrica/);
  assert.match(mapa, /cadastrou/);
});
