#!/usr/bin/env node
// Serviço do webhook do Chatwoot (127.0.0.1). Cadastro do webhook NÃO é feito aqui (ver LEIA.md).
//   GET  /saude                 -> estado (modo, gasto de hoje)
//   POST /webhook?s=<SEGREDO>   -> message_created do Chatwoot (responde 200 na hora, processa depois)
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CFG, DADOS, carregarVariaveis, gastoDoDia, hojeSP } from './nucleo.mjs';
import { decidir } from './decidir.mjs';
import { processar } from './processar.mjs';

carregarVariaveis(['CHATWOOT_TOKEN_CLAUDE', 'ANTHROPIC_API_KEY_RESERVA', 'CHATWOOT_CLAUDE_SEGREDO', 'CHATWOOT_URL', 'CHATWOOT_CONTA']);
const SEGREDO = process.env.CHATWOOT_CLAUDE_SEGREDO;
if (!SEGREDO) { console.error('falta CHATWOOT_CLAUDE_SEGREDO; não subo sem segredo no webhook'); process.exit(2); }
if (!process.env.CHATWOOT_TOKEN_CLAUDE || !process.env.ANTHROPIC_API_KEY_RESERVA) { console.error('faltam CHATWOOT_TOKEN_CLAUDE e/ou ANTHROPIC_API_KEY_RESERVA'); process.exit(2); }

const arqVistos = `${DADOS}/vistos.json`;
let vistos = []; try { vistos = JSON.parse(readFileSync(arqVistos, 'utf8')); } catch { /* primeira vez */ }
const marcar = (k) => { vistos.push(k); vistos = vistos.slice(-500); mkdirSync(DADOS, { recursive: true }); writeFileSync(arqVistos, JSON.stringify(vistos)); };
const lista = () => { try { const j = JSON.parse(readFileSync(CFG.numeros_internos, 'utf8')); return Array.isArray(j) ? j : null; } catch { return null; } };
const fila = new Map(); // uma conversa por vez
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

function tratar(ev) {
  const d = decidir(ev, lista());
  if (d.acao === 'ignorar') return log({ ignorado: d.motivo, conversa: d.conversa });
  const k = `${d.conversa}:${d.mensagem}`;
  if (vistos.includes(k)) return log({ ignorado: 'repetido', conversa: d.conversa });
  marcar(k);
  const ant = fila.get(d.conversa) || Promise.resolve();
  const p = ant.then(() => processar(ev)).then((r) => log(r), (e) => log({ resultado: 'falha', erro: e.message, conversa: d.conversa })).finally(() => { if (fila.get(d.conversa) === p) fila.delete(d.conversa); });
  fila.set(d.conversa, p);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'GET' && u.pathname === '/saude') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, modo: CFG.autonomo.ligado ? 'autonomo-parcial' : 'sombra', modelo: CFG.modelo, dia: hojeSP(), gasto_hoje_reais: Number(gastoDoDia().toFixed(4)), teto_reais: CFG.teto_diario_reais }));
  }
  if (req.method === 'POST' && u.pathname === '/webhook') {
    if (u.searchParams.get('s') !== SEGREDO) { res.writeHead(403); return res.end(); }
    let corpo = ''; req.on('data', (c) => { corpo += c; if (corpo.length > 1e6) req.destroy(); });
    req.on('end', () => { res.writeHead(200); res.end('ok'); try { tratar(JSON.parse(corpo)); } catch (e) { log({ ignorado: 'json inválido', erro: e.message }); } });
    return;
  }
  res.writeHead(404); res.end();
}).listen(Number(process.env.CWC_PORTA || CFG.porta), process.env.CWC_HOST || '127.0.0.1', () => log({ servico: 'chatwoot-claude', porta: CFG.porta, modo: CFG.autonomo.ligado ? 'autonomo-parcial' : 'sombra' }));
