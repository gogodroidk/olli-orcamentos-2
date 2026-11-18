/**
 * Supressão CRUZADA e-mail <-> WhatsApp (migration 20261118130000) — Postgres real (PGlite).
 *
 *     node scripts/teste-supressao-cruzada-sql.ts
 *
 * Prova, sobre as tabelas e funções REAIS de opt-out (WhatsApp 20261006090000, e-mail 20260929200000):
 *  · SAIR no WhatsApp (registrar_nao_contatar_whatsapp) suprime o e-mail e cancela o que está na fila;
 *  · descadastro/reclamação por e-mail (inserção em email_supressoes) bloqueia `pode_contatar_whatsapp`;
 *  · `numero_invalido` e `hard_bounce` NÃO cruzam (a pessoa não pediu para parar);
 *  · opt-out só por telefone (sem conta) não gera supressão de e-mail;
 *  · não há laço, nem duplicata, e rodar a migration de novo é idempotente (backfill incluso);
 *  · o backfill cobre quem já tinha pedido antes da migration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let checks = 0;
const igual = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const optout = ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql');
const emailBase = ler('../supabase/migrations/20260929200000_email_producao_lembretes.sql');
const migration = ler('../supabase/migrations/20261118130000_supressao_cruzada_email_whatsapp.sql');

const tabelaEmail = /create table if not exists public\.email_supressoes \([\s\S]*?\n\);/.exec(emailBase);
assert.ok(tabelaEmail, 'não achei a tabela email_supressoes na migration do e-mail');

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, deleted_at timestamptz,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.email_outbox (id bigserial primary key, user_id uuid, template text, status text default 'pending',
    error_code text, next_attempt_at timestamptz, updated_at timestamptz default now());
`);
await db.exec(tabelaEmail[0]);
await db.exec(optout);

const novoUsuario = async (tel = '(11) 99999-0000') =>
  (await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ('x@x.com', jsonb_build_object('phone', $1::text)) returning id`, [tel],
  )).rows[0].id;
const supEmail = async (id: string) =>
  (await db.query<{ motivo: string; origem: string }>(
    'select motivo, origem from public.email_supressoes where user_id = $1 order by motivo', [id],
  )).rows;
const waNao = async (id: string) =>
  (await db.query<{ motivo: string; origem: string }>(
    'select motivo, origem from public.whatsapp_nao_contatar where user_id = $1', [id],
  )).rows;
const podeWa = async (id: string) =>
  (await db.query<{ r: { pode: boolean; motivo: string } }>('select public.pode_contatar_whatsapp($1::uuid, null) as r', [id])).rows[0].r;
const fila = async (id: string) =>
  (await db.query<{ template: string; status: string }>(
    'select template, status from public.email_outbox where user_id = $1 order by id', [id],
  )).rows;
const enfileira = (id: string, template: string) =>
  db.query('insert into public.email_outbox (user_id, template) values ($1, $2)', [id, template]);

// ── estado "antes da migration": quem já tinha pedido para sair ──────────────────────────────
const antigoWa = await novoUsuario();
const antigoEmail = await novoUsuario();
const antigoBounce = await novoUsuario();
await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'pediu_sair', 'whatsapp')`, [antigoWa]);
await enfileira(antigoWa, 'lembrete_ativacao');
await enfileira(antigoWa, 'boas_vindas');
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [antigoEmail]);
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [antigoBounce]);

await db.exec(migration);

// backfill
igual(await supEmail(antigoWa), [{ motivo: 'descadastro', origem: 'whatsapp' }], 'backfill: SAIR antigo do WhatsApp virou supressão de e-mail');
igual(await fila(antigoWa), [
  { template: 'lembrete_ativacao', status: 'dead_letter' },
  { template: 'boas_vindas', status: 'pending' },
], 'backfill: lembrete na fila cancelado; boas-vindas não conta como lembrete');
igual(await waNao(antigoEmail), [{ motivo: 'pediu_sair', origem: 'email' }], 'backfill: descadastro antigo do e-mail virou opt-out do WhatsApp');
igual((await podeWa(antigoEmail)).pode, false, 'backfill: pode_contatar_whatsapp recusa quem se descadastrou do e-mail');
igual(await waNao(antigoBounce), [], 'backfill: hard_bounce não cruza (o endereço não existe, ninguém pediu para parar)');
igual((await podeWa(antigoBounce)).pode, true, 'backfill: bounce segue liberado no WhatsApp');

// idempotência: rodar de novo não duplica nem estoura
await db.exec(migration);
igual((await supEmail(antigoWa)).length, 1, 'rodar a migration de novo não duplica a supressão de e-mail');
igual((await waNao(antigoEmail)).length, 1, 'rodar a migration de novo não duplica o opt-out do WhatsApp');

// ── gatilhos, daqui para frente ──────────────────────────────────────────────────────────────
for (const motivo of ['pediu_sair', 'reclamou', 'decisao_interna']) {
  const u = await novoUsuario();
  await enfileira(u, 'lembrete_reengajamento');
  await db.query('select public.registrar_nao_contatar_whatsapp($1::uuid, null, $2, $3)', [u, motivo, 'whatsapp']);
  igual(await supEmail(u), [{ motivo: 'descadastro', origem: 'whatsapp' }], `${motivo} no WhatsApp suprime o e-mail`);
  igual((await fila(u))[0].status, 'dead_letter', `${motivo} no WhatsApp cancela o lembrete que estava na fila`);
  igual(await waNao(u), [{ motivo, origem: 'whatsapp' }], `${motivo}: o pedido original do WhatsApp fica intacto (sem laço)`);
}

const invalido = await novoUsuario();
await enfileira(invalido, 'lembrete_ativacao');
await db.query(`select public.registrar_nao_contatar_whatsapp($1::uuid, null, 'numero_invalido', 'whatsapp')`, [invalido]);
igual(await supEmail(invalido), [], 'numero_invalido NÃO suprime o e-mail (número errado não é pedido de saída)');
igual((await fila(invalido))[0].status, 'pending', 'numero_invalido não cancela a fila de e-mail');

const contaEmail = async () =>
  Number((await db.query<{ n: string }>('select count(*) as n from public.email_supressoes')).rows[0].n);
const antesTel = await contaEmail();
await db.query(`select public.registrar_nao_contatar_whatsapp(null, '11988887777', 'pediu_sair', 'whatsapp')`);
igual(await contaEmail(), antesTel, 'opt-out só por telefone (sem conta) não cria supressão de e-mail e não dá erro');

const descad = await novoUsuario();
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'one_click')`, [descad]);
igual(await waNao(descad), [{ motivo: 'pediu_sair', origem: 'email' }], 'descadastro por e-mail (one-click) vira opt-out do WhatsApp');
igual((await podeWa(descad)).pode, false, 'pode_contatar_whatsapp recusa quem se descadastrou');
igual((await supEmail(descad)).length, 1, 'o e-mail continua com UMA linha (sem laço)');

const spam = await novoUsuario();
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'complaint', 'resend_webhook')`, [spam]);
igual(await waNao(spam), [{ motivo: 'reclamou', origem: 'email' }], 'reclamação (spam) no e-mail vira opt-out do WhatsApp como "reclamou"');

const bounce = await novoUsuario();
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [bounce]);
igual(await waNao(bounce), [], 'hard_bounce novo não cruza');

const limpo = await novoUsuario();
igual((await podeWa(limpo)).pode, true, 'quem nunca pediu para parar segue liberado no WhatsApp');
igual(await supEmail(limpo), [], 'quem nunca pediu para parar segue liberado no e-mail');

// já suprimido dos dois lados: nenhuma segunda linha, nenhum erro
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'complaint', 'resend_webhook')`, [descad]);
igual((await waNao(descad)).length, 1, 'quem já está no opt-out do WhatsApp não ganha segunda linha');

// "voltar" no WhatsApp remove só o pedido do WhatsApp; a supressão de e-mail espelhada fica
await db.query(`delete from public.whatsapp_nao_contatar where user_id = $1 and motivo = 'pediu_sair'`, [antigoWa]);
igual((await supEmail(antigoWa)).length, 1, 'voltar ao WhatsApp não reativa o e-mail sozinho');

console.log(`teste-supressao-cruzada-sql: ${checks} verificações ok`);
