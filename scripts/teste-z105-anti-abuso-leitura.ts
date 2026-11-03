/**
 * Z-105 — a leitura do anti-abuso só devolve contagem e hash.
 *
 *     node scripts/teste-z105-anti-abuso-leitura.ts
 *
 * Roda o SQL de scripts/sql/z105-anti-abuso-trial-leitura.sql num Postgres em
 * memória. Os e-mails e IPs abaixo são fictícios. A saída não pode contê-los.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const sql = readFileSync(new URL('./sql/z105-anti-abuso-trial-leitura.sql', import.meta.url), 'utf8');
const codigo = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

assert.match(codigo, /^\s*with\b/i, 'a leitura começa com WITH');
assert.equal(codigo.split(';').map((p) => p.trim()).filter(Boolean).length, 1, 'uma sentença só');
assert.doesNotMatch(
  codigo,
  /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|comment|copy|merge)\b/i,
  'sem escrita',
);
assert.doesNotMatch(codigo, /\b(payload|encrypted_password|confirmation_token|recovery_token|refresh_token|phone)\b/i);
assert.equal(new URL('./sql/z105-anti-abuso-trial-leitura.sql', import.meta.url).pathname.includes('/migrations/'), false);

const prefixo = (texto: string) => createHash('sha256').update(texto).digest('hex').slice(0, 16);

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create schema if not exists extensions;
  create extension if not exists pgcrypto schema extensions;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key,
    email text,
    created_at timestamptz not null,
    deleted_at timestamptz
  );
  create table auth.sessions (
    id uuid primary key,
    user_id uuid not null,
    ip inet
  );
  create table auth.audit_log_entries (
    id uuid primary key,
    ip_address text
  );
  create table public.assinaturas (
    user_id uuid primary key,
    plano text,
    status text
  );
  create table public.trials_comerciais (
    owner_user_id uuid not null,
    estado text not null,
    iniciado_em timestamptz
  );
  create table public.funil_exclusoes (user_id uuid);
  create function public.conta_interna(p_user_id uuid)
  returns boolean
  language sql
  stable
  as $$
    select exists (select 1 from public.funil_exclusoes f where f.user_id = p_user_id)
  $$;
`);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A1 = id(1);
const A2 = id(2);
const A3 = id(3);
const A4 = id(4);
const A5 = id(5);
const A6 = id(6);
const B1 = id(7);
const B2 = id(8);
const B3 = id(9);
const C1 = id(10);
const D1 = id(11);
const E1 = id(12);
const F1 = id(13);
const F2 = id(14);
const G1 = id(15);

const pessoas: Array<[string, string | null, string]> = [
  [A1, 'a.a+1@gmail.com', '2026-06-11 08:00:00-03'],
  [A2, 'aa@gmail.com', '2026-07-01 12:00:00-03'],
  [A3, 'a.a@gmail.com', '2026-07-02 12:00:00-03'],
  [A4, 'aa+x@gmail.com', '2026-07-03 12:00:00-03'],
  [A5, 'a.a+z@gmail.com', '2026-07-04 12:00:00-03'],
  [A6, 'A.A@GoogleMail.com', '2026-07-05 12:00:00-03'],
  [B1, 'Foo@outlook.com', '2026-08-01 12:00:00-03'],
  [B2, 'foo+a@outlook.com', '2026-08-02 12:00:00-03'],
  [B3, 'foo+b@outlook.com', '2026-08-03 12:00:00-03'],
  [C1, 'solo@firma.test', '2026-09-01 12:00:00-03'],
  [D1, 'outro@firma.test', '2026-09-02 12:00:00-03'],
  [E1, 'sem.sessao@firma.test', '2026-10-01 12:00:00-03'],
  [F1, 'Duplo@firma.test', '2026-10-02 12:00:00-03'],
  [F2, 'duplo@firma.test', '2026-10-03 12:00:00-03'],
  [G1, null, '2026-11-02 18:00:00-03'],
];
for (const [userId, email, quando] of pessoas) {
  await db.query('insert into auth.users (id, email, created_at) values ($1, $2, $3)', [userId, email, quando]);
}
for (const userId of [A1, A2, A3, A4, A5, A6]) {
  await db.query('insert into public.funil_exclusoes (user_id) values ($1)', [userId]);
}
await db.query(`insert into public.assinaturas (user_id, plano, status) values ($1, 'empresa', 'canceled'), ($2, 'Empresa', 'active')`, [A1, B1]);
await db.query(
  `insert into public.trials_comerciais (owner_user_id, estado, iniciado_em) values
    ($1, 'ended', '2026-07-01'),
    ($2, 'active', '2026-08-01'),
    ($3, 'ended', '2026-08-02'),
    ($4, 'revoked', '2026-09-01'),
    ($5, 'eligible', null)`,
  [A1, B1, B2, C1, D1],
);

let sessao = 0;
async function sessaoDe(userId: string, ip: string) {
  sessao += 1;
  await db.query('insert into auth.sessions (id, user_id, ip) values ($1, $2, $3::inet)', [id(100 + sessao), userId, ip]);
}
for (const userId of [A1, A2, A3, A4, B1]) await sessaoDe(userId, '203.0.113.10');
for (const userId of [A1, A5, B2, C1]) await sessaoDe(userId, '203.0.113.11');
for (const userId of [A6, B3]) await sessaoDe(userId, '198.51.100.5');
await sessaoDe(D1, '198.51.100.6');
await sessaoDe(A2, '198.51.100.7');
await db.query('insert into auth.audit_log_entries (id, ip_address) values ($1, null)', [id(200)]);

const res = await db.query<{ secao: string; sinal: string; valor: string }>(sql);
const rows = res.rows;
const texto = JSON.stringify(rows);
const plantados = [
  'a.a+1@gmail.com',
  'aa@gmail.com',
  'googlemail.com',
  'foo@outlook.com',
  'foo+a@outlook.com',
  'solo@firma.test',
  'outro@firma.test',
  'sem.sessao@firma.test',
  'duplo@firma.test',
  '203.0.113.10',
  '203.0.113.11',
  '198.51.100.5',
  '198.51.100.6',
  '198.51.100.7',
];
for (const pedaco of plantados) {
  assert.equal(texto.toLowerCase().includes(pedaco.toLowerCase()), false, `vazou ${pedaco}`);
}
assert.doesNotMatch(texto, /@/);
assert.doesNotMatch(texto, /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), ['secao', 'sinal', 'valor']);
}

const m = new Map<string, string>();
for (const row of rows) {
  const chave = `${row.secao}|${row.sinal}`;
  assert.equal(m.has(chave), false, `linha duplicada ${chave}`);
  m.set(chave, row.valor);
}
const exige = (secao: string, sinal: string, valor: string) => {
  assert.equal(m.get(`${secao}|${sinal}`), valor, `${secao}|${sinal}`);
};

exige('resumo', 'contas', '15');
exige('resumo', 'apagadas', '0');
exige('resumo', 'vivas', '15');
exige('resumo', 'com_email', '14');
exige('resumo', 'sem_email', '1');
exige('resumo', 'internas', '6');
exige('resumo', 'externas', '9');
exige('resumo', 'sem_assinatura', '13');
exige('resumo', 'primeira_conta', '2026-06-11');
exige('resumo', 'ultima_conta', '2026-11-02');
exige('resumo', 'primeira_conta_utc', '2026-06-11');
exige('resumo', 'ultima_conta_utc', '2026-11-02');
exige('resumo', 'email_identico_distintos', '13');
exige('resumo', 'email_identico_grupos', '1');
exige('resumo', 'email_identico_contas', '2');
exige('resumo', 'email_norm_distintos', '6');
exige('resumo', 'email_norm_grupos', '3');
exige('resumo', 'email_norm_contas', '11');
exige('resumo', 'email_norm_com_linha', '2');
exige('resumo', 'email_norm_ativas', '1');
exige('resumo', 'sessoes', '13');
exige('resumo', 'sessoes_com_ip', '13');
exige('resumo', 'contas_com_sessao', '11');
exige('resumo', 'contas_sem_sessao', '4');
exige('resumo', 'ips_distintos', '5');
exige('resumo', 'ip_grupos', '3');
exige('resumo', 'contas_em_ip_compartilhado', '10');
exige('resumo', 'contas_email_e_ip', '9');
exige('resumo', 'ip_contas_com_linha', '2');
exige('resumo', 'ip_contas_ativas', '1');
exige('resumo', 'auditoria_linhas', '1');
exige('resumo', 'auditoria_com_ip', '0');
exige('resumo', 'trials_iniciados', '4');
exige('resumo', 'chaves_com_2_trials', '1');
exige('assinatura', 'empresa|active', '1');
exige('assinatura', 'empresa|canceled', '1');

const gmail = prefixo('aa@gmail.com');
const outlook = prefixo('foo@outlook.com');
const duplo = prefixo('duplo@firma.test');
exige('email_norm', gmail, '6');
exige('email_norm_internas', gmail, '6');
exige('email_norm_linha', gmail, '1');
exige('email_norm_ativa', gmail, '0');
exige('email_norm', outlook, '3');
exige('email_norm_internas', outlook, '0');
exige('email_norm_linha', outlook, '1');
exige('email_norm_ativa', outlook, '1');
exige('email_norm', duplo, '2');
exige('email_norm_linha', duplo, '0');
exige('email_norm_ativa', duplo, '0');

const ip5 = prefixo('203.0.113.10');
const ip4 = prefixo('203.0.113.11');
const ip2 = prefixo('198.51.100.5');
exige('ip', ip5, '5');
exige('ip_linha', ip5, '2');
exige('ip_ativa', ip5, '1');
exige('ip', ip4, '4');
exige('ip_linha', ip4, '1');
exige('ip_ativa', ip4, '0');
exige('ip', ip2, '2');
exige('ip_linha', ip2, '0');
exige('ip_ativa', ip2, '0');
assert.equal(m.has(`ip|${prefixo('198.51.100.6')}`), false, 'IP de uma conta só não entra');
assert.equal(m.has(`ip|${prefixo('198.51.100.7')}`), false, 'IP de uma conta só não entra');

console.log(`  ok  z105 leitura: ${rows.length} linhas, sem e-mail e sem IP cru`);
