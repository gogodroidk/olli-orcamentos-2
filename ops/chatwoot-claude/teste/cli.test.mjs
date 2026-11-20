import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { chatwootFalso, conv } from './falsos.mjs';

const estado = { conversas: {}, log: [] }; let srv; let url;
before(async () => { ({ srv, url } = await chatwootFalso(estado)); });
after(() => srv.close());
const dados = mkdtempSync(`${tmpdir()}/cwc-cli-`);
const cwc = (...a) => new Promise((ok) => execFile('node', [new URL('../cwc.mjs', import.meta.url).pathname, ...a], {
  env: { ...process.env, CHATWOOT_URL: url, CHATWOOT_TOKEN_CLAUDE: 'tok-falso', CWC_DADOS: dados, CREDENCIAIS_ENV: '/nao/existe' },
}, (e, out, err) => ok({ cod: e ? e.code : 0, out, err })));

test('sem-resposta lista só caixas permitidas; caixa 5 recusada', async () => {
  estado.conversas[1] = conv(1, 4, 'oi, preciso de ajuda'); estado.conversas[2] = conv(2, 5, 'conversa pessoal do dono');
  estado.conversas[3] = conv(3, 3, 'quero um site');
  const r = await cwc('sem-resposta');
  assert.match(r.out, /2 conversa\(s\)/); assert.match(r.out, /#1 /); assert.match(r.out, /#3 /); assert.doesNotMatch(r.out, /pessoal/);
  const r5 = await cwc('sem-resposta', '5'); assert.notEqual(r5.cod, 0); assert.match(r5.err, /proibida/);
});

test('ler / nota / etiquetar / atribuir', async () => {
  assert.match((await cwc('ler', '1')).out, /CLIENTE: oi, preciso/);
  assert.match((await cwc('nota', '1', 'nota de teste')).out, /nota privada/);
  assert.ok(estado.conversas[1].messages.some((m) => m.private && m.content === 'nota de teste'));
  assert.match((await cwc('etiquetar', '1', 'a', 'b')).out, /a, b/);
  assert.match((await cwc('atribuir', '1', 'iris@agentes.olli.local')).out, /agente 7/);
  assert.equal(estado.conversas[1].dono, 7);
  const l5 = await cwc('ler', '2'); assert.notEqual(l5.cod, 0); assert.match(l5.err, /proibida/);
  assert.ok(!estado.log.some((x) => x.includes('/conversations/2/messages')), 'não leu mensagens da caixa 5');
});

test('responder: passa pelas travas, simula, envia e nunca inicia contato frio', async () => {
  const bloq = await cwc('responder', '1', 'Sai por R$ 5 só hoje'); assert.notEqual(bloq.cod, 0); assert.match(bloq.err, /BARRADO/);
  assert.match((await cwc('responder', '1', 'Oi! Que serviço você faz?', '--simular')).out, /simulação/);
  assert.ok(!estado.conversas[1].messages.some((m) => !m.private && m.message_type === 1));
  assert.match((await cwc('responder', '1', 'Oi! Que serviço você faz?')).out, /enviado/);
  estado.conversas[9] = { ...conv(9, 4, 'x'), messages: [{ id: 1, content: 'olá, aqui é a OLLI', private: false, message_type: 1, created_at: 1 }] };
  const frio = await cwc('responder', '9', 'Oi, tudo bem?'); assert.notEqual(frio.cod, 0); assert.match(frio.err, /contato frio/);
  estado.conversas[10] = conv(10, 4, 'oi', { labels: ['parar-contato'] });
  assert.match((await cwc('responder', '10', 'Oi!')).err, /parar-contato/);
});
