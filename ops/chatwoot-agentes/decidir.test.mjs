import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidir } from './decidir.mjs';
import { criarNucleo } from './nucleo.mjs';
import { ehNumeroInterno, telCanonico } from './lib.mjs';
import { motivosDeBarrar, ehTeste } from './travas.mjs';

// Lista FALSA de números da casa num arquivo temporário (o real fica em data/numeros-internos.json e não entra no teste).
const PASTA = mkdtempSync(join(tmpdir(), 'acordador-teste-'));
const ARQ = join(PASTA, 'numeros-internos.json');
const NOSSO_A = '5511912340001'; // faz o papel do 7487
const NOSSO_B = '5511912340002'; // faz o papel do 3507
const NOSSOS = [NOSSO_A, NOSSO_B, '5511912340003', '5511912340004', '5511912340005', '5511912340006'];
writeFileSync(ARQ, JSON.stringify(NOSSOS));
process.env.NUMEROS_INTERNOS = ARQ;
process.on('exit', () => rmSync(PASTA, { recursive: true, force: true }));

const porId = new Map([[4, { chave: 'IRIS', nome: 'Íris', userId: 4, terminal: 'ZAP — Íris' }], [5, { chave: 'CARTEIRA', nome: 'Carteira', userId: 5, terminal: 'VENDAS — Carteira' }]]);
let idMsg = 1000;
const ev = (o = {}) => ({ event: 'message_created', id: ++idMsg, message_type: 'incoming', private: false, content: 'oi', inbox: { id: 4 },
  sender: { type: 'contact', phone_number: '+5511999990000', identifier: null }, conversation: { id: 77, inbox_id: 4, status: 'pending', labels: [], meta: {} }, ...o });
const comDono = (id = 5) => ({ conversation: { id: 77, inbox_id: 4, status: 'open', labels: [], meta: { assignee: { id, type: 'user' } } } });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- (a) número interno não acorda ninguém ----------
test('(a) mensagem de número nosso (phone_number) não acorda ninguém — nem com "TESTE — ACORDAR"', () => {
  assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${NOSSO_A}` } }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${NOSSO_A}` }, content: 'TESTE — ACORDAR' }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${NOSSO_B}` }, ...comDono() }), porId).acao, 'ignorar');
});
test('(a) número nosso só no identifier (JID) também é cortado', () => {
  const d = decidir(ev({ sender: { type: 'contact', phone_number: null, identifier: `${NOSSO_A}@s.whatsapp.net` } }), porId);
  assert.equal(d.acao, 'ignorar'); assert.match(d.motivo, /número nosso/);
});
test('(a) número nosso sem o 9 do celular (12 dígitos) também é cortado', () => {
  const sem9 = NOSSO_A.slice(0, 4) + NOSSO_A.slice(5); // 55 + DDD + 8 dígitos (sem o 9)
  assert.equal(telCanonico(sem9), telCanonico(NOSSO_A));
  assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${sem9}` } }), porId).acao, 'ignorar');
});
test('(a) caso real 18/11: eco da #150 (saiu do 7487) chegando no 3507 como conversa nova #145 não acorda', () => {
  const eco = ev({ inbox: { id: 3 }, content: 'TESTE — resposta da Íris', sender: { type: 'contact', phone_number: `+${NOSSO_A}`, identifier: `${NOSSO_A}@s.whatsapp.net` },
    conversation: { id: 145, inbox_id: 3, status: 'pending', labels: [], meta: { sender: { phone_number: `+${NOSSO_A}` } } } });
  assert.equal(decidir(eco, porId).acao, 'ignorar');
});
test('(a) a lista é lida em tempo de execução: número novo no arquivo vale na hora', () => {
  const novo = '5521987650009';
  assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${novo}` } }), porId).acao, 'acordar');
  writeFileSync(ARQ, JSON.stringify([...NOSSOS, novo]));
  try { assert.equal(decidir(ev({ sender: { type: 'contact', phone_number: `+${novo}` } }), porId).acao, 'ignorar'); } finally { writeFileSync(ARQ, JSON.stringify(NOSSOS)); }
});
test('(a) lista ilegível → ninguém acorda (fecha a porta)', () => {
  process.env.NUMEROS_INTERNOS = join(PASTA, 'nao-existe.json');
  try {
    const d = decidir(ev(), porId);
    assert.equal(d.acao, 'ignorar'); assert.match(d.motivo, /ilegível/);
  } finally { process.env.NUMEROS_INTERNOS = ARQ; }
});
test('identificador curto (@lid) não casa por sufixo com número nosso', () => {
  assert.equal(ehNumeroInterno('2340001@lid', NOSSOS), false);
  assert.equal(ehNumeroInterno('170368551673900@lid', NOSSOS), false);
});

// ---------- (b) mensagem de saída não acorda ----------
test('(b) saída, nota, atividade e remetente agente/robô não acordam', () => {
  for (const o of [{ message_type: 'outgoing' }, { message_type: 1 }, { message_type: 'activity' }, { message_type: 'template' }, { private: true },
    { sender: { type: 'user', name: 'Íris' } }, { sender: { type: 'agent_bot', name: 'Lívia' } },
    { sender_type: 'User' }, { sender_type: 'AgentBot' }, { sender_type: 'agent_bot' }]) {
    assert.equal(decidir(ev({ ...o, ...comDono() }), porId).acao, 'ignorar', JSON.stringify(o));
    assert.equal(decidir(ev(o), porId).acao, 'ignorar', JSON.stringify(o));
  }
});

// ---------- (c) cliente real acorda o dono, uma vez só ----------
test('(c) cliente real acorda o dono UMA vez: reenvio do webhook + rajada + resposta do agente = 1 recado', async () => {
  const acordados = [];
  const n = criarNucleo({ porId, esperaMs: 30, acordar: (ag, texto, conv) => acordados.push({ ag: ag.chave, texto, conv }) });
  const m1 = ev({ content: 'quanto custa o Pro?', ...comDono() });
  await n.tratar(m1);
  await n.tratar(m1); // Chatwoot reenviou o mesmo evento
  await n.tratar(ev({ content: 'é por mês?', ...comDono() })); // rajada do cliente
  await n.tratar(ev({ message_type: 'outgoing', sender: { type: 'user', name: 'Carteira' }, content: 'É R$ 39/mês.', ...comDono() })); // resposta do dono
  await esperar(80);
  assert.equal(acordados.length, 1);
  assert.equal(acordados[0].ag, 'CARTEIRA'); assert.equal(acordados[0].conv, 77);
  assert.match(acordados[0].texto, /quanto custa o Pro\? \/ é por mês\?/);
  assert.doesNotMatch(acordados[0].texto, /R\$ 39/);
});
test('(c) conversa sem dono: atribui à Íris e acorda a Íris uma vez', async () => {
  const acordados = []; const atrib = [];
  const n = criarNucleo({ porId, esperaMs: 20, atribuir: async (c) => atrib.push(c), acordar: (ag) => acordados.push(ag.chave) });
  const m = ev();
  await n.tratar(m); await n.tratar(m);
  await esperar(60);
  assert.deepEqual(acordados, ['IRIS']); assert.deepEqual(atrib, [77]);
});
test('(c) número nosso passando pelo núcleo: zero recado', async () => {
  const acordados = [];
  const n = criarNucleo({ porId, esperaMs: 10, acordar: (ag) => acordados.push(ag.chave) });
  await n.tratar(ev({ sender: { type: 'contact', phone_number: `+${NOSSO_B}` }, content: 'TESTE — ACORDAR' }));
  await esperar(40);
  assert.equal(acordados.length, 0);
});

// ---------- regras que já existiam ----------
test('dono agente acorda o dono, não a Íris', () => {
  const d = decidir(ev(comDono()), porId);
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
test('GR Tech e Pessoal ficam fora (D-2412)', () => {
  assert.equal(decidir(ev({ inbox: { id: 2 }, conversation: { id: 1, inbox_id: 2, meta: {} } }), porId).acao, 'ignorar');
  assert.equal(decidir(ev({ inbox: { id: 5 }, conversation: { id: 1, inbox_id: 5, meta: {} } }), porId).acao, 'ignorar');
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
