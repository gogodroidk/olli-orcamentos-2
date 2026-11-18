#!/usr/bin/env node
// Acordador do Chatwoot (CQ-CHATWOOT-100): webhook message_created → acorda NA HORA o agente dono da conversa
// (hibernar.mjs ask, com o resumo). Conversa sem dono nas caixas OLLI/Serviços vai para a Íris.
// De 5 em 5 minutos roda a sincronia Evolution → Chatwoot (sincronizar.mjs --aplicar).
//
// Variáveis: CHATWOOT_TOKEN_IRIS (atribui), CHATWOOT_ACORDADOR_SEGREDO (caminho do webhook),
//            ACORDADOR_HOST (padrão 172.20.0.1 = ponte da rede docker do Chatwoot), ACORDADOR_PORTA (3013),
//            ACORDADOR_SECO=1 (só registra o que faria), SINCRONIA_MIN (5; 0 desliga), HIBERNAR (caminho do hibernar.mjs)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { CFG, DIR, api, carregarCredenciais, final4 } from './lib.mjs';
import { decidir } from './decidir.mjs';

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
const iris = [...porId.values()].find((a) => a.chave === 'IRIS');

// rajadas: conversa -> {agente, msgs[], timer}
const pendentes = new Map();
// fila por agente: um ask de cada vez por terminal
const filas = new Map();

function textoAsk(agente, convId, caixa, contato, msgs) {
  const trechos = msgs.map((m) => String(m || '').replace(/\s+/g, ' ').slice(0, 220)).join(' / ');
  return `[Chatwoot #${convId} · ${caixa}] ${contato} escreveu: "${trechos}". A conversa é sua (${agente.nome}). `
    + `Leia: node ${DIR}cw.mjs ler ${agente.chave} ${convId} — Responda: node ${DIR}cw.mjs responder ${agente.chave} ${convId} "texto". `
    + 'Regras D-2233/D-2333/D-2392 na Receita: Entregas Claude/OLLI/ZAP-ATENDIMENTO/CHATWOOT-AGENTES.md'
    + (msgs.some((m) => /^\s*TESTE\b/i.test(String(m))) ? ' É TESTE interno entre números nossos: responda pelo comando acima começando com "TESTE —".' : '');
}

function enfileirar(agente, texto, convId) {
  const f = filas.get(agente.terminal) || Promise.resolve();
  const prox = f.then(() => new Promise((res) => {
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

async function tratar(ev) {
  const d = decidir(ev, porId);
  if (d.acao !== 'acordar') { if (d.conversa) log({ ignorado: d.motivo, conversa: d.conversa }); return; }
  let agente = d.agente.userId ? d.agente : porId.get([...porId.keys()].find((k) => porId.get(k).chave === d.agente.chave));
  if (d.atribuirIris) {
    if (!SECO) {
      try { await api(TOK, `/conversations/${d.conversa}/assignments`, 'POST', { assignee_id: iris.userId }); } catch (e) { log({ erro: 'atribuir Íris', conversa: d.conversa, msg: e.message }); }
      // pendente (com o robô) → aberta: agora tem dono
      if (ev.conversation?.status === 'pending') await api(TOK, `/conversations/${d.conversa}/toggle_status`, 'POST', { status: 'open' }).catch(() => {});
    }
    agente = iris;
    log({ atribuida: 'Íris', conversa: d.conversa, seco: SECO || undefined });
  }
  const conv = ev.conversation || {};
  const caixa = (ev.inbox?.id ?? conv.inbox_id) === CFG.caixas.olli ? 'OLLI Orçamentos 7487' : 'OLLI Serviços 3507';
  const s = ev.sender || conv.meta?.sender || {};
  const contato = `${s.name || 'cliente'} (final ${final4(s.phone_number) || '----'})`;
  const conteudo = ev.content || ((ev.attachments || []).length ? `[${ev.attachments.map((a) => a.file_type).join(',')}]` : '[mensagem]');
  const p = pendentes.get(d.conversa) || { msgs: [] };
  p.agente = agente; p.caixa = caixa; p.contato = contato; p.msgs.push(conteudo);
  clearTimeout(p.timer);
  p.timer = setTimeout(() => { pendentes.delete(d.conversa); enfileirar(p.agente, textoAsk(p.agente, d.conversa, p.caixa, p.contato, p.msgs.slice(-4)), d.conversa); }, ESPERA_MS);
  pendentes.set(d.conversa, p);
}

const srv = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/saude') { res.writeHead(200).end(JSON.stringify({ ok: true, seco: SECO, agentes: porId.size })); return; }
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
