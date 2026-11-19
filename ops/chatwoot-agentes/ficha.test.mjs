// Testes da ficha por cliente (CQ-CENTRAL-FICHA). Sem rede real: Chatwoot FALSO em memória + pasta temporária para a ficha.
// Telefones de mentira (55119123400xx). Nada toca clientes/ nem _suprimidos.txt reais.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const aqui = dirname(fileURLToPath(import.meta.url));
const PASTA = mkdtempSync(join(tmpdir(), 'ficha-teste-'));
copyFileSync(join(aqui, 'teste', 'ficha-cliente.copia.mjs'), join(PASTA, 'ficha-cliente.mjs'));
process.env.FICHA_CLIENTE = join(PASTA, 'ficha-cliente.mjs'); // clientes/ nasce em PASTA, longe do real
process.env.CREDENCIAIS_ENV = join(PASTA, 'nao-existe.env'); // nada de ler credenciais reais
const { anexarFicha, registrarFato, apagarFicha, tratarEventoParar, carregarFicha, motivoSensivel, MARCA } = await import('./ficha.mjs');
const ficha = await carregarFicha();
after(() => rmSync(PASTA, { recursive: true, force: true }));

// ---- Chatwoot falso (usado por funções e pelo CLI) ----
const TEL = (n) => `+55119123400${String(n).padStart(2, '0')}`;
const conversas = new Map(); // id -> { id, inbox_id, labels, phone, msgs[] }
let seqMsg = 0;
const nova = (id, inbox, n, labels = []) => conversas.set(id, { id, inbox_id: inbox, labels, phone: n ? TEL(n) : null, msgs: [] });
const vistaConv = (c) => ({ id: c.id, inbox_id: c.inbox_id, labels: c.labels, status: 'open', meta: { sender: { phone_number: c.phone, name: 'Cliente Teste' } } });
const rota = async (metodo, caminho, corpo) => {
  const m = caminho.replace(/^.*\/accounts\/2/, '');
  const conv = m.match(/^\/conversations\/(\d+)(\/[a-z]+)?(?:\/(\d+))?$/);
  if (conv) {
    const c = conversas.get(Number(conv[1]));
    const [, , sub, msgId] = conv;
    if (!sub && metodo === 'GET') return vistaConv(c);
    if (sub === '/messages' && !msgId && metodo === 'GET') return { payload: c.msgs };
    if (sub === '/messages' && !msgId && metodo === 'POST') {
      const msg = { id: ++seqMsg, content: corpo.content, private: !!corpo.private, content_attributes: {} };
      c.msgs.push(msg);
      return msg;
    }
    if (sub === '/messages' && msgId && metodo === 'DELETE') {
      const x = c.msgs.find((q) => q.id === Number(msgId));
      x.content = 'Esta mensagem foi apagada';
      x.content_attributes = { deleted: true };
      return null;
    }
    if (sub === '/labels' && metodo === 'POST') { c.labels = corpo.labels; return { payload: corpo.labels }; }
    if (sub === '/assignments') return {};
  }
  throw new Error(`rota não prevista: ${metodo} ${caminho}`);
};
const api = async (_tok, caminho, metodo = 'GET', corpo) => rota(metodo, caminho, corpo);
const vivas = (id) => conversas.get(id).msgs.filter((x) => x.private && !x.content_attributes.deleted && x.content.startsWith(MARCA));
const OLLI = 4, SERV = 3, GRTECH = 2, PESSOAL = 5;

// ---------- 1. abrir conversa com ficha ----------
test('abrir conversa com ficha põe 1 nota [ficha]; a 2ª abertura não duplica', async () => {
  nova(101, OLLI, 1);
  assert.equal(ficha.adicionar(TEL(1), 'Faz ar-condicionado split em Campinas', { origem: 'conversa Chatwoot #90', data: '2026-11-10' }).ok, true);
  const c = vistaConv(conversas.get(101));
  assert.equal((await anexarFicha({ api, tok: 'x', c, ficha })).acao, 'criada');
  assert.equal(vivas(101).length, 1);
  assert.equal(conversas.get(101).msgs[0].private, true);
  assert.match(vivas(101)[0].content, /Campinas.*conversa Chatwoot #90/);
  assert.equal((await anexarFicha({ api, tok: 'x', c, ficha })).acao, 'igual');
  assert.equal(vivas(101).length, 1);
  assert.equal(conversas.get(101).msgs.length, 1);
});
test('a ficha mudou: a 2ª abertura ATUALIZA (continua 1 [ficha] viva, a antiga é apagada)', async () => {
  assert.equal(ficha.adicionar(TEL(1), 'Prefere conversar à noite', { origem: 'conversa Chatwoot #101', data: '2026-11-19' }).ok, true);
  const c = vistaConv(conversas.get(101));
  assert.equal((await anexarFicha({ api, tok: 'x', c, ficha })).acao, 'atualizada');
  assert.equal(vivas(101).length, 1);
  assert.match(vivas(101)[0].content, /à noite/);
  assert.match(vivas(101)[0].content, /Campinas/);
});
test('caixa 3507 (Serviços) também recebe a ficha', async () => {
  nova(102, SERV, 1);
  assert.equal((await anexarFicha({ api, tok: 'x', c: vistaConv(conversas.get(102)), ficha })).acao, 'criada');
});

// ---------- 2. sem telefone / sem ficha: nada ----------
test('sem telefone não põe nada (nem chama a API de escrita)', async () => {
  nova(103, OLLI, 0);
  const r = await anexarFicha({ api, tok: 'x', c: vistaConv(conversas.get(103)), ficha });
  assert.equal(r.acao, 'nada'); assert.match(r.motivo, /sem telefone/);
  assert.equal(conversas.get(103).msgs.length, 0);
});
test('com telefone mas sem ficha: nunca nota vazia', async () => {
  nova(104, OLLI, 2);
  const r = await anexarFicha({ api, tok: 'x', c: vistaConv(conversas.get(104)), ficha });
  assert.equal(r.acao, 'nada'); assert.equal(conversas.get(104).msgs.length, 0);
});
test('registrar fato sem telefone: a ficha não nasce', () => {
  const r = registrarFato({ c: vistaConv(conversas.get(103)), fato: 'Tem 3 técnicos', ficha });
  assert.equal(r.ok, false); assert.match(r.motivo, /sem telefone/);
});

// ---------- 3. sensível e sem origem ----------
test('dado sensível é recusado (saúde, religião, política, orientação, biometria, CPF, senha, cartão)', () => {
  const c = vistaConv(conversas.get(104));
  const sensiveis = ['Está com depressão e toma remédio', 'É evangélico, vai à igreja aos domingos', 'Vota no Lula e é filiado a partido', 'Orientação sexual: homossexual',
    'Cadastrou a biometria / impressão digital', 'CPF 123.456.789-09', 'Passou o cpf dele', 'A senha é 1234', 'Cartão 4111 1111 1111 1111', 'Tem diabetes', 'cartão de crédito final 4242'];
  for (const f of sensiveis) { const r = registrarFato({ c, fato: f, ficha }); assert.equal(r.ok, false, f); assert.match(r.motivo, /sensível/, f); }
  assert.deepEqual(ficha.ver(TEL(2)), []); // nada entrou
});
test('fato comum entra; sensível detectado mesmo sem acento/maiúscula', () => {
  assert.equal(motivoSensivel('Trabalha com ar-condicionado em Sorocaba'), null);
  assert.equal(motivoSensivel('SAUDE frágil'), 'saúde'); assert.equal(motivoSensivel('religiao dele'), 'religião');
  const r = registrarFato({ c: vistaConv(conversas.get(104)), fato: 'Tem equipe de 3 técnicos', ficha, dia: '2026-11-19' });
  assert.equal(r.ok, true);
  assert.match(ficha.ver(TEL(2))[0], /conversa Chatwoot #104/); // origem = id da conversa
});
test('fato sem origem (sem id de conversa) é recusado', () => {
  const r = registrarFato({ c: { inbox_id: OLLI, meta: { sender: { phone_number: TEL(2) } } }, fato: 'Tem 5 técnicos', ficha });
  assert.equal(r.ok, false); assert.match(r.motivo, /origem/);
  assert.equal(ficha.adicionar(TEL(2), 'sem origem', {}).ok, false); // e o módulo da ficha também recusa
});

// ---------- 4. parar-contato / sair-lgpd ----------
test('etiqueta parar-contato apaga a ficha, grava só o hash e bloqueia nova ficha', async () => {
  nova(105, OLLI, 3); ficha.adicionar(TEL(3), 'Tem oficina própria', { origem: 'conversa Chatwoot #105' });
  assert.equal(ficha.ver(TEL(3)).length, 1);
  const r = apagarFicha({ c: { ...vistaConv(conversas.get(105)), labels: ['parar-contato'] }, ficha });
  assert.equal(r.ok, true); assert.equal(r.apagou, true); assert.equal(r.etiqueta, 'parar-contato');
  assert.deepEqual(ficha.ver(TEL(3)), []);
  assert.equal(ficha.eSuprimido(TEL(3)), true);
  const novoFato = registrarFato({ c: vistaConv(conversas.get(105)), fato: 'Voltou a escrever', ficha });
  assert.equal(novoFato.ok, false); assert.match(novoFato.motivo, /bloqueada/);
});
test('webhook: cliente responde "sair-lgpd" → apaga, bloqueia e carimba parar-contato', async () => {
  nova(106, SERV, 4); ficha.adicionar(TEL(4), 'Atende só zona sul', { origem: 'conversa Chatwoot #106' });
  const ev = { event: 'message_created', message_type: 'incoming', private: false, content: 'sair-lgpd', inbox: { id: SERV }, sender: { phone_number: TEL(4) }, conversation: { id: 106, inbox_id: SERV, labels: [], meta: { sender: { phone_number: TEL(4) } } } };
  const r = await tratarEventoParar(ev, { api, tok: 'x', ficha });
  assert.equal(r.acao, 'apagada');
  assert.deepEqual(ficha.ver(TEL(4)), []); assert.equal(ficha.eSuprimido(TEL(4)), true);
  assert.deepEqual(conversas.get(106).labels, ['parar-contato']);
});
test('webhook: conversation_updated com a etiqueta parar-contato (posta na tela) também apaga', async () => {
  nova(107, OLLI, 5, ['parar-contato']); ficha.adicionar(TEL(5), 'Usa o app no celular', { origem: 'conversa Chatwoot #107' });
  const ev = { event: 'conversation_updated', id: 107, inbox_id: OLLI, labels: ['parar-contato'], meta: { sender: { phone_number: TEL(5) } } };
  assert.equal((await tratarEventoParar(ev, { api, tok: 'x', ficha })).acao, 'apagada');
  assert.equal(ficha.eSuprimido(TEL(5)), true);
});
test('mensagem comum e nota interna com "sair-lgpd" escrita pelo agente NÃO apagam', async () => {
  nova(108, OLLI, 6); ficha.adicionar(TEL(6), 'Tem 2 funcionários', { origem: 'conversa Chatwoot #108' });
  const base = { event: 'message_created', inbox: { id: OLLI }, conversation: { id: 108, inbox_id: OLLI, labels: [], meta: { sender: { phone_number: TEL(6) } } } };
  assert.equal((await tratarEventoParar({ ...base, message_type: 'incoming', private: false, content: 'oi, quero saber do plano' }, { api, tok: 'x', ficha })).acao, 'nada');
  assert.equal((await tratarEventoParar({ ...base, message_type: 'outgoing', private: true, content: 'cliente disse sair-lgpd?' }, { api, tok: 'x', ficha })).acao, 'nada');
  assert.equal(ficha.ver(TEL(6)).length, 1);
});

// ---------- 5. caixas 2 e 5 ----------
test('caixas 2 (GR Tech) e 5 (Pessoal) são recusadas em tudo', async () => {
  for (const [id, caixa] of [[201, GRTECH], [202, PESSOAL]]) {
    nova(id, caixa, 7); ficha.adicionar(TEL(7), 'Cliente da GR Tech', { origem: 'conversa Chatwoot #1' });
    const c = vistaConv(conversas.get(id));
    const a = await anexarFicha({ api, tok: 'x', c, ficha }); assert.equal(a.acao, 'nada'); assert.match(a.motivo, /fora/);
    assert.equal(conversas.get(id).msgs.length, 0);
    assert.equal(registrarFato({ c, fato: 'Algo', ficha }).ok, false);
    assert.equal(apagarFicha({ c, ficha }).ok, false);
    assert.equal((await tratarEventoParar({ event: 'conversation_updated', id, inbox_id: caixa, labels: ['parar-contato'], meta: { sender: { phone_number: TEL(7) } } }, { api, tok: 'x', ficha })).acao, 'nada');
  }
  assert.equal(ficha.ver(TEL(7)).length, 1); assert.equal(ficha.eSuprimido(TEL(7)), false);
});

// ---------- 6. CLI de verdade (cw.mjs) contra Chatwoot falso ----------
const sh = promisify(execFile);
let srv, porta;
before(async () => {
  srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', async () => {
      try { const out = req.url.endsWith('/api/v1/profile') ? { id: 9 } : await rota(req.method, req.url, b ? JSON.parse(b) : undefined); res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out)); }
      catch (e) { res.writeHead(404).end(e.message); }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); porta = srv.address().port;
});
after(() => srv?.close());
const cw = async (...args) => {
  try { const { stdout } = await sh('node', [join(aqui, 'cw.mjs'), ...args], { env: { ...process.env, CHATWOOT_URL: `http://127.0.0.1:${porta}`, CHATWOOT_TOKEN_CARTEIRA: 'token-de-teste' } }); return { cod: 0, out: stdout }; }
  catch (e) { return { cod: e.code, out: `${e.stdout || ''}${e.stderr || ''}` }; }
};
test('CLI: pegar põe a ficha; ficha "fato" registra, recusa sensível e atualiza a nota; parar-contato apaga', async () => {
  nova(301, OLLI, 8); ficha.adicionar(TEL(8), 'Instala split há 5 anos', { origem: 'conversa Chatwoot #50', data: '2026-11-01' });
  let r = await cw('pegar', 'CARTEIRA', '301'); assert.equal(r.cod, 0, r.out); assert.match(r.out, /ficha: criada/); assert.equal(vivas(301).length, 1);
  r = await cw('pegar', 'CARTEIRA', '301'); assert.match(r.out, /ficha: igual/); assert.equal(vivas(301).length, 1);
  r = await cw('ficha', 'CARTEIRA', '301', 'Quer o plano Empresa'); assert.equal(r.cod, 0, r.out); assert.match(r.out, /fato registrado/); assert.match(r.out, /nota \[ficha\]: atualizada/);
  assert.equal(vivas(301).length, 1); assert.match(vivas(301)[0].content, /plano Empresa.*conversa Chatwoot #301/);
  r = await cw('ficha', 'CARTEIRA', '301', 'Tem diabetes'); assert.equal(r.cod, 1); assert.match(r.out, /RECUSADO.*sensível/);
  r = await cw('ficha', 'CARTEIRA', '301'); assert.match(r.out, /plano Empresa/); // sem fato = mostra a ficha (resposta a "o que vocês sabem de mim?")
  r = await cw('etiqueta', 'CARTEIRA', '301', 'parar-contato'); assert.equal(r.cod, 0, r.out); assert.match(r.out, /ficha apagada e bloqueada/);
  assert.deepEqual(ficha.ver(TEL(8)), []); assert.equal(ficha.eSuprimido(TEL(8)), true);
  r = await cw('ficha', 'CARTEIRA', '301', 'Voltou'); assert.equal(r.cod, 1); assert.match(r.out, /bloqueada/);
});
test('CLI: conversa sem telefone não ganha nota; caixas 2 e 5 recusadas', async () => {
  nova(302, OLLI, 0); let r = await cw('pegar', 'CARTEIRA', '302'); assert.match(r.out, /ficha: nada \(contato sem telefone/); assert.equal(conversas.get(302).msgs.length, 0);
  for (const [id, caixa] of [[303, GRTECH], [304, PESSOAL]]) {
    nova(id, caixa, 9); r = await cw('ficha', 'CARTEIRA', String(id), 'Algo'); assert.equal(r.cod, 1); assert.match(r.out, /fora das suas/);
    r = await cw('pegar', 'CARTEIRA', String(id)); assert.equal(r.cod, 1); assert.equal(conversas.get(id).msgs.length, 0);
  }
});
