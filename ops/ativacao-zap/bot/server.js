// Liga o robô ao mundo: webhook do Chatwoot (POST /webhook), API do Chatwoot, fila de avisos ao Igor, cérebro Workers AI.
import http from 'node:http';
import fs from 'node:fs';
import { criarRobo } from './robo.js';
import { criarLlm } from './cerebro-cf.js';
import { criarRegistroParada } from './freioAtivacao.js';
import path from 'node:path';

const API = process.env.CHATWOOT_API || 'http://rails:3000';
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID;
const BOT_TOKEN = process.env.CHATWOOT_BOT_TOKEN;
const USER_TOKEN = process.env.CHATWOOT_USER_TOKEN;
const STATE_FILE = process.env.STATE_FILE || '/data/state.json';
const AVISOS = process.env.AVISOS_FILE || '/data/avisos.jsonl';
const companies = JSON.parse(fs.readFileSync(new URL('./companies.json', import.meta.url)));

let estado = {};
try { estado = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* primeira execução */ }
const salvar = () => { try { fs.writeFileSync(STATE_FILE, JSON.stringify(estado)); } catch (e) { console.error('save', e.message); } };

async function api(path, method, body, quem = 'bot') {
  const r = await fetch(`${API}/api/v1/accounts/${ACCOUNT}${path}`, {
    method, headers: { 'Content-Type': 'application/json', api_access_token: quem === 'user' ? USER_TOKEN : BOT_TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) console.error('api erro', method, path, r.status);
  return r.ok ? r.json().catch(() => ({})) : null;
}
const aviso = async (a) => { try { fs.appendFileSync(AVISOS, `${JSON.stringify({ ...a, t: Date.now() })}\n`); } catch (e) { console.error('aviso', e.message); } };
const esperar = (txt) => new Promise((r) => setTimeout(r, 2500 + Math.min(txt.length * 25, 4000) + Math.random() * 1500)); // ritmo humano
const llm = criarLlm({ accountId: process.env.CF_ACCOUNT_ID, token: process.env.CF_AI_TOKEN, log: console.error });
console.log(llm ? 'cérebro Workers AI: configurado' : 'cérebro Workers AI: sem token, só playbooks');

let antigos = {};
try { antigos = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(process.env.HISTORICO_FILE || '/data/historico-antes-central.json', 'utf8'))).filter(([k, v]) => Array.isArray(v)).map(([k, v]) => [k, new Set(v)])); } catch (e) { console.error('histórico de clientes antigos: não carregou', e.message); }
console.log('clientes antigos carregados:', Object.entries(antigos).map(([k, v]) => `${k}=${v.size}`).join(' ') || 'nenhum');
const registrarParada = criarRegistroParada({
  dir: path.dirname(STATE_FILE),
  aoFrear: (f) => aviso({ empresa: 'olli', nome: 'freio', cidade: '-', quer: `ativacao parada: ${f.motivo}`, numero: '-', conversa: 0 }),
});
const robo = criarRobo({ companies, api, estado, salvar, aviso, antigos, llm, esperar, log: console.error, registrarParada });

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.end('ok'); return; }
  if (req.method !== 'POST' || req.url !== '/webhook') { res.statusCode = 404; res.end(); return; }
  let b = '';
  req.on('data', (d) => { b += d; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { res.end('ok'); let ev; try { ev = JSON.parse(b); } catch { return; } robo.receber(ev); });
}).listen(3012, '0.0.0.0', () => console.log('central-bot (SDR local) porta 3012'));
