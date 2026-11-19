#!/usr/bin/env node
// Acordador do Chatwoot (CQ-CHATWOOT-100): webhook message_created → acorda NA HORA o agente dono da conversa
// (hibernar.mjs ask, com o resumo). Sem laço: ver decidir.mjs (números da casa em data/numeros-internos.json). Conversa sem dono nas caixas OLLI/Serviços vai para a Íris.
// De 5 em 5 minutos roda a sincronia Evolution → Chatwoot (sincronizar.mjs --aplicar).
//
// Variáveis: CHATWOOT_TOKEN_IRIS (atribui), CHATWOOT_ACORDADOR_SEGREDO (caminho do webhook),
//            ACORDADOR_HOST (padrão 172.20.0.1 = ponte da rede docker do Chatwoot), ACORDADOR_PORTA (3013),
//            ACORDADOR_SECO=1 (só registra o que faria), SINCRONIA_MIN (5; 0 desliga), HIBERNAR (caminho do hibernar.mjs)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { CFG, DIR, api, carregarCredenciais, numerosInternos } from './lib.mjs';
import { criarNucleo } from './nucleo.mjs';
import { carregarFicha, anexarFicha, tratarEventoParar } from './ficha.mjs';

carregarCredenciais();
const HOST = process.env.ACORDADOR_HOST || '172.20.0.1';
const PORTA = Number(process.env.ACORDADOR_PORTA || 3013);
const SEGREDO = process.env.CHATWOOT_ACORDADOR_SEGREDO;
const SECO = process.env.ACORDADOR_SECO === '1';
const SINC_MIN = Number(process.env.SINCRONIA_MIN ?? 5);
const HIBERNAR = process.env.HIBERNAR || '/home/igor/Desktop/Sistema/ferramentas/vigia/hibernar.mjs';
const TOK = process.env.CHATWOOT_TOKEN_IRIS;
const ESPERA_MS = Number(process.env.ACORDADOR_ESPERA_MS || 15000); // junta rajada de mensagens da mesma conversa
const LOGDIR = `${process.env.HOME}/.local/state/chatwoot-agentes`;
mkdirSync(LOGDIR, { recursive: true });
if (!SEGREDO || !TOK) { console.error('faltam CHATWOOT_ACORDADOR_SEGREDO e/ou CHATWOOT_TOKEN_IRIS'); process.exit(1); }

const log = (o) => {
  const linha = JSON.stringify({ hora: new Date().toISOString(), ...o });
  console.log(linha);
  try { appendFileSync(`${LOGDIR}/acordador.jsonl`, `${linha}\n`); } catch { /* disco */ }
};

// userId -> agente
const porId = new Map();
async function carregarAgentes() {
  const lista = await api(TOK, '/agents');
  porId.clear();
  for (const a of CFG.agentes) { const u = lista.find((x) => x.email === a.email); if (u) porId.set(u.id, { ...a, userId: u.id }); }
}
await carregarAgentes();

// rajadas e dedupe ficam no nucleo.mjs (testado em decidir.test.mjs)
// fila por agente: um ask de cada vez por terminal
const filas = new Map();

// Ficha do cliente como nota interna [ficha] ANTES de entregar a conversa ao agente (falha da ficha nunca trava a entrega).
async function fichaNaConversa(convId) {
  if (SECO) return;
  try {
    const r = await anexarFicha({ api, tok: TOK, c: await api(TOK, `/conversations/${convId}`), ficha: await carregarFicha() });
    log({ ficha: r.acao, conversa: convId, motivo: r.motivo });
  } catch (e) { log({ erro: 'ficha', conversa: convId, msg: e.message }); }
}

function enfileirar(agente, texto, convId) {
  const f = filas.get(agente.terminal) || Promise.resolve();
  const prox = f.then(() => fichaNaConversa(convId)).then(() => new Promise((res) => {
    if (SECO) { log({ seco: true, acordaria: agente.terminal, conversa: convId, texto }); return res(); }
    const p = spawn('node', [HIBERNAR, 'ask', agente.terminal, texto], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.length > 4000) out = out.slice(-4000); });
    p.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => p.kill('SIGTERM'), 15 * 60 * 1000);
    p.on('close', (cod) => { clearTimeout(t); log({ acordou: agente.terminal, conversa: convId, cod, retorno: out.trim().slice(-300) }); res(); });
  }));
  filas.set(agente.terminal, prox.catch(() => {}));
}

const nucleo = criarNucleo({
  porId,
  acordar: enfileirar,
  esperaMs: ESPERA_MS,
  log,
  atribuir: async (convId, ev) => {
    if (SECO) return;
    const iris = [...porId.values()].find((a) => a.chave === 'IRIS');
    await api(TOK, `/conversations/${convId}/assignments`, 'POST', { assignee_id: iris.userId });
    // pendente (com o robô) → aberta: agora tem dono
    if (ev.conversation?.status === 'pending') await api(TOK, `/conversations/${convId}/toggle_status`, 'POST', { status: 'open' }).catch(() => {});
  },
});
const tratar = async (ev) => {
  // etiqueta parar-contato / resposta "sair-lgpd": apaga a ficha ANTES de qualquer outra regra (vale até para número nosso)
  if (!SECO) await tratarEventoParar(ev, { api, tok: TOK, ficha: await carregarFicha(), log }).catch((e) => log({ erro: 'parar', msg: e.message }));
  return nucleo.tratar(ev);
};

// Sem a lista de números internos não sobe (sem ela o acordador não sabe cortar o laço entre os números da casa).
try { log({ numerosInternos: numerosInternos().length }); } catch (e) { console.error(`lista de números internos ilegível: ${e.message}`); process.exit(1); }

const srv = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/saude') {
    let internos = -1;
    try { internos = numerosInternos().length; } catch { /* ilegível: ok=false */ }
    res.writeHead(200).end(JSON.stringify({ ok: internos > 0, seco: SECO, agentes: porId.size, numerosInternos: internos }));
    return;
  }
  if (req.method !== 'POST' || req.url !== `/chatwoot/${SEGREDO}`) { res.writeHead(404).end(); return; }
  let corpo = '';
  req.on('data', (c) => { corpo += c; if (corpo.length > 2e6) req.destroy(); });
  req.on('end', () => {
    res.writeHead(200).end('ok');
    let ev; try { ev = JSON.parse(corpo); } catch { return; }
    tratar(ev).catch((e) => log({ erro: e.message }));
  });
});
srv.listen(PORTA, HOST, () => log({ ouvindo: `${HOST}:${PORTA}`, seco: SECO, agentes: porId.size }));

function sincronia() {
  const p = spawn('node', [`${DIR}sincronizar.mjs`, '--aplicar'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (cod) => { const ult = out.trim().split('\n').pop(); if (cod || !/0 conversa\(s\).*0 mensagem/.test(ult)) log({ sincronia: ult, cod }); });
}
if (SINC_MIN > 0) { setTimeout(sincronia, 20000); setInterval(sincronia, SINC_MIN * 60000); }
setInterval(() => carregarAgentes().catch(() => {}), 30 * 60000);
