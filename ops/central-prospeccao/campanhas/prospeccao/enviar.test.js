import test from 'node:test';
import assert from 'node:assert/strict';
import { enviarUma, segundoAndarAberto, textoDoFreio } from './enviar.mjs';
import { leadDeTeste } from './leads.mjs';
import { gerarLista } from './lista.mjs';

const agora = new Date('2026-11-13T13:00:00Z');

function apiFalsa(opcoes = {}) {
  const chamadas = [];
  const api = async (metodo, caminho, corpo) => {
    chamadas.push({ metodo, caminho, corpo });
    if (String(caminho).includes('/contacts/search')) return { payload: [] };
    if (metodo === 'POST' && caminho === '/contacts') return { id: 7 };
    if (caminho === '/contacts/7/labels' && metodo === 'GET') return { payload: opcoes.etiquetas || [] };
    if (caminho === '/contacts/7/labels') return {};
    if (caminho === '/contacts/7/conversations') return { payload: opcoes.conversa ? [{ id: 9, inbox_id: 3 }] : [] };
    if (metodo === 'POST' && caminho === '/conversations') return { id: 9 };
    if (caminho === '/conversations/9/labels' && metodo === 'GET') return { payload: opcoes.etiquetasConv || [] };
    if (caminho === '/conversations/9/labels') return {};
    if (caminho === '/conversations/9/messages' && metodo === 'GET') return { payload: opcoes.mensagens || [] };
    if (caminho === '/conversations/9/messages') return { id: 1 };
    return {};
  };
  return { api, chamadas };
}

function lead() {
  return {
    id: 'abc123abc123',
    nome: 'Fria Ltda',
    telefone_e164: '+5511988887777',
    nicho: 'refrigeracao',
    nota: 5,
    fonte: 'site',
  };
}

test('envio grava nicho, etiqueta prospeccao e não deixa telefone inteiro no retorno', async () => {
  const { api, chamadas } = apiFalsa();
  const estado = { itens: {} };
  const r = await enviarUma({
    api, pessoas: [lead()], estado, evolutionOk: true, agora, inboxId: 3, aleatorio: () => 0,
  });
  assert.equal(r.acao, 'enviou');
  assert.equal(r.toque, 1);
  assert.equal(r.fone, '****7777');
  assert.equal(estado.itens[lead().id].nicho, 'refrigeracao');
  const msg = chamadas.find((c) => c.caminho === '/conversations/9/messages' && c.metodo === 'POST');
  assert.match(msg.corpo.content, /Fria Ltda/);
  assert.match(msg.corpo.content, /Rafa/);
  const contato = chamadas.find((c) => c.caminho === '/contacts' && c.metodo === 'POST');
  assert.equal(contato.corpo.custom_attributes.nicho, 'refrigeracao');
  assert.equal(contato.corpo.inbox_id, 3);
  const etiqueta = chamadas.find((c) => c.caminho === '/conversations/9/labels' && c.metodo === 'POST');
  assert.ok(etiqueta.corpo.labels.includes('prospeccao'));
});

test('parar-contato e resposta anterior não mandam de novo', async () => {
  const parado = apiFalsa({ etiquetas: ['parar-contato'] });
  const estado = { itens: {} };
  const r = await enviarUma({ api: parado.api, pessoas: [lead()], estado, evolutionOk: true, agora, inboxId: 3 });
  assert.equal(r.motivo, 'parar-contato');
  assert.equal(parado.chamadas.some((c) => c.corpo?.content), false);

  const respondeu = apiFalsa({ conversa: true, mensagens: [{ message_type: 'incoming', content: 'oi' }] });
  const r2 = await enviarUma({ api: respondeu.api, pessoas: [lead()], estado: { itens: {} }, evolutionOk: true, agora, inboxId: 3 });
  assert.equal(r2.motivo, 'ja_respondeu');
});

test('o retorno usa o segundo texto e o modo teste recusa outra empresa', async () => {
  const { api, chamadas } = apiFalsa({ conversa: true });
  const pessoa = lead();
  const estado = { itens: { [pessoa.id]: { status: 'enviado', em: '2026-11-13T13:00:00Z', nicho: 'refrigeracao' } } };
  const terca = new Date('2026-11-17T13:00:00Z');
  const r = await enviarUma({ api, pessoas: [pessoa], estado, evolutionOk: true, agora: terca, inboxId: 3, aleatorio: () => 0 });
  assert.equal(r.toque, 2);
  const msg = chamadas.find((c) => c.caminho === '/conversations/9/messages' && c.metodo === 'POST');
  assert.match(msg.corpo.content, /de novo/);
  assert.equal(estado.itens[pessoa.id].followup_em, terca.toISOString());

  const casa = apiFalsa();
  const recusa = await enviarUma({
    api: casa.api, pessoas: [pessoa], estado: { itens: {} }, teste: true, evolutionOk: true, agora, inboxId: 3,
  });
  assert.equal(recusa.motivo, 'teste_so_numero_da_casa');
  const ok = await enviarUma({
    api: casa.api, pessoas: [leadDeTeste()], estado: { itens: {} }, teste: true, evolutionOk: true, agora, inboxId: 3,
  });
  assert.equal(ok.acao, 'enviou');
  assert.match(casa.chamadas.find((c) => c.corpo?.content)?.corpo.content, /Teste interno/);
});

test('lista mascarada e vigia do segundo andar', () => {
  const md = gerarLista([lead()], [{ id: 'x', motivo: 'ja_no_log' }], { quando: 'agora', trava: 'ok' });
  assert.match(md, /Fria Ltda/);
  assert.match(md, /\*\*\*\*7777/);
  assert.doesNotMatch(md, /\+5511|98888/);
  assert.equal(segundoAndarAberto({ 'segundo-andar': { jaConectou: true, caido: false } }, { fresco: true }), true);
  assert.equal(segundoAndarAberto({ 'segundo-andar': { jaConectou: true, caido: true } }, { fresco: true }), false);
  assert.equal(segundoAndarAberto({ 'segundo-andar': { jaConectou: true, caido: false } }, { fresco: false }), false);
  assert.match(textoDoFreio('2_paradas').mensagem, /2 pessoas/);
});
