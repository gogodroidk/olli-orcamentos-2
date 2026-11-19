// Utilitários comuns do pacote chatwoot-agentes (CQ-CHATWOOT-100).
// Credenciais SÓ por variável de ambiente (credenciais-locais.env); nada aqui imprime token.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DIR = fileURLToPath(new URL('.', import.meta.url));
export const CFG = JSON.parse(readFileSync(`${DIR}agentes.json`, 'utf8'));
export const BASE = process.env.CHATWOOT_URL || 'http://127.0.0.1:3010';
export const CONTA = CFG.conta;
export const CRED = process.env.CREDENCIAIS_ENV || '/home/igor/Desktop/Sistema/credenciais-locais.env';

/** Carrega o credenciais-locais.env no process.env (sem sobrescrever o que já veio do ambiente). */
export function carregarCredenciais(arq = CRED) {
  let txt = '';
  try { txt = readFileSync(arq, 'utf8'); } catch { return; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

export const agentePorChave = (k) => CFG.agentes.find((a) => a.chave === String(k || '').toUpperCase()) || null;
export const tokenDe = (chave) => process.env[`CHATWOOT_TOKEN_${chave}`] || '';

/** Só dígitos; tira o "+" e o sufixo do JID. */
export const digitos = (s) => String(s || '').split('@')[0].replace(/\D/g, '');

/** Lista viva dos números da casa (CQ-CHATWOOT-100-FIX). Fica FORA do código: lida do arquivo a cada consulta,
 *  para número novo valer na hora, sem reinstalar. Caminho trocável por NUMEROS_INTERNOS (testes). */
export const arqNumerosInternos = () => process.env.NUMEROS_INTERNOS || '/home/igor/chatwoot-central/data/numeros-internos.json';

/** Forma comparável de um telefone BR: sem 55 e sem o 9 extra do celular → DDD + 8 dígitos. Outros países: só dígitos. */
export function telCanonico(tel) {
  let d = digitos(tel);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

/** Lê a lista agora. Lança erro se o arquivo sumir ou estiver torto (quem chama decide: o acordador fecha a porta). */
export function numerosInternos(arq = arqNumerosInternos()) {
  const lista = JSON.parse(readFileSync(arq, 'utf8'));
  if (!Array.isArray(lista)) throw new Error(`${arq}: esperado um array de números`);
  return lista.map(digitos).filter((d) => d.length >= 10);
}

export function ehNumeroInterno(tel, lista = numerosInternos()) {
  const c = telCanonico(tel);
  if (c.length < 10) return false; // @lid/identificador curto não casa por sufixo
  return lista.some((n) => telCanonico(n) === c);
}

/** Chamada à API do Chatwoot com o token dado. Lança erro com status em falha. */
export async function api(token, caminho, metodo = 'GET', corpo) {
  if (!token) throw new Error('token ausente');
  const url = caminho.startsWith('http') ? caminho : `${BASE}/api/v1/accounts/${CONTA}${caminho}`;
  const r = await fetch(url, {
    method: metodo,
    headers: { api_access_token: token, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const txt = await r.text();
  let dados = null;
  try { dados = txt ? JSON.parse(txt) : null; } catch { dados = txt; }
  if (!r.ok) { const e = new Error(`${metodo} ${caminho} -> ${r.status} ${String(txt).slice(0, 200)}`); e.status = r.status; throw e; }
  return dados;
}

/** Token do Admin Demo por login (não fica gravado em disco). Usado só no setup. */
export async function tokenAdmin() {
  const r = await fetch(`${BASE}/auth/sign_in`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.CHATWOOT_DEMO_ADMIN_EMAIL, password: process.env.CHATWOOT_DEMO_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login admin falhou: ${r.status}`);
  return (await r.json()).data.access_token;
}

/** Consulta SÓ LEITURA no banco da Evolution (docker exec psql). Devolve linhas como objetos (json_agg). */
export function evoSql(sql) {
  const q = `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`;
  const out = execFileSync('docker', ['exec', '-i', process.env.EVO_PG_CONTAINER || 'evolution-api-evo-postgres-1', 'sh', '-c',
    'psql -q -U "$POSTGRES_USER" -d evolution -At -v ON_ERROR_STOP=1 -c "set default_transaction_read_only = on" -f -'],
  { input: q, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const txt = out.trim();
  return txt ? JSON.parse(txt.slice(txt.indexOf('['))) : [];
}

export const final4 = (tel) => digitos(tel).slice(-4);
export const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** id do usuário dono do token (/api/v1/profile fica fora do escopo da conta). */
export async function meuId(token) { return (await api(token, `${BASE}/api/v1/profile`)).id; }
