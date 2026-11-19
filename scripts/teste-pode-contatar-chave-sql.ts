/**
 * pode_contatar_whatsapp por TELEFONE_CHAVE (migration 20261118160000) — Postgres real (PGlite).
 *
 *     node scripts/teste-pode-contatar-chave-sql.ts
 *
 * Prova, sobre a função REAL do WhatsApp (20261006090000) + a supressão cruzada (20261118130000):
 *  · o `wa_id` da Meta SEM o 9 é barrado pelo opt-out gravado COM o 9, e o contrário;
 *  · DDD diferente não casa; número curto não casa;
 *  · conta consultada por user_id é barrada por opt-out de QUALQUER telefone do cadastro (Auth, metadata, empresa);
 *  · consulta só por telefone enxerga a linha da CONTA (user_id) da dona do número;
 *  · o que já bloqueava continua bloqueando (por conta, por telefone exato, numero_invalido) e quem não pediu segue liberado;
 *  · o remendo é idempotente, falha fechado se a definição vigente mudou e preserva as permissões.
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
const emailBase = ler('../supabase/migrations/20260929200000_email_producao_lembretes.sql');
const optout = ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql');
const cruzada = ler('../supabase/migrations/20261118130000_supressao_cruzada_email_whatsapp.sql');
const patch = ler('../supabase/migrations/20261118160000_pode_contatar_whatsapp_telefone_chave.sql');
const tabelaEmail = /create table if not exists public\.email_supressoes \([\s\S]*?\n\);/.exec(emailBase);
assert.ok(tabelaEmail, 'não achei email_supressoes');

async function banco(aplicarPatch: boolean) {
  const db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists private;
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, deleted_at timestamptz, phone text,
      raw_user_meta_data jsonb default '{}'::jsonb);
    create table public.empresa (user_id uuid primary key, dados jsonb default '{}'::jsonb);
    create table public.email_outbox (id bigserial primary key, user_id uuid, template text, status text default 'pending',
      error_code text, next_attempt_at timestamptz, updated_at timestamptz default now());
  `);
  await db.exec(tabelaEmail![0]);
  await db.exec(optout);
  await db.exec(cruzada);
  if (aplicarPatch) await db.exec(patch);
  return db;
}
const pode = async (db: PGlite, id: string | null, tel: string | null) =>
  (await db.query<{ r: { pode: boolean; motivo: string } }>('select public.pode_contatar_whatsapp($1::uuid, $2::text) as r', [id, tel])).rows[0].r;
const conta = async (db: PGlite, metaPhone: string | null = null, empresa: { telefone?: string; whatsapp?: string } | null = null) => {
  const id = (await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ('x@x.com', case when $1::text is null then '{}'::jsonb else jsonb_build_object('phone', $1::text) end) returning id`, [metaPhone])).rows[0].id;
  if (empresa) await db.query(`insert into public.empresa (user_id, dados) values ($1, $2::jsonb)`, [id, JSON.stringify(empresa)]);
  return id;
};
const sair = (db: PGlite, id: string | null, tel: string | null, motivo = 'pediu_sair', origem = 'whatsapp') =>
  db.query('select public.registrar_nao_contatar_whatsapp($1::uuid, $2::text, $3, $4)', [id, tel, motivo, origem]);

// ── sem o remendo, o furo existe (prova de que o teste enxerga o problema) ───────────────────────
{
  const db = await banco(false);
  await sair(db, null, '(31) 95555-0000');
  igual((await pode(db, null, '3155550000')).pode, true, 'sem o remendo: wa_id SEM o 9 escapa do opt-out COM o 9 (o furo)');
}

const db = await banco(true);

// P2 do LIVRE: wa_id da Meta sem o 9
await sair(db, null, '(31) 95555-0000');
igual((await pode(db, null, '3155550000')).motivo, 'pediu_sair', 'wa_id sem o 9 é barrado pelo opt-out gravado com o 9');
igual((await pode(db, null, '+55 31 95555-0000')).pode, false, 'formato com +55 também');
igual((await pode(db, null, '553155550000')).pode, false, 'wa_id 55 + 10 dígitos (sem o 9) também');
await sair(db, null, '3144440000'); // opt-out gravado SEM o 9
igual((await pode(db, null, '(31) 94444-0000')).pode, false, 'o contrário: opt-out sem o 9 barra a consulta com o 9');
igual((await pode(db, null, '(41) 95555-0000')).pode, true, 'DDD diferente (31 x 41) não casa');
igual((await pode(db, null, '(21) 95555-0000')).pode, true, 'DDD 21 também não casa');
igual((await pode(db, null, '99999')).motivo, 'sem_identificador', 'número curto: sem identificador');

// conta consultada por user_id: qualquer telefone do cadastro
{
  const u = await conta(db, '(61) 98888-1111', { telefone: '(61) 3222-0000', whatsapp: '(62) 97777-2222' });
  igual((await pode(db, u, null)).pode, true, 'conta com 3 telefones, sem opt-out: liberada');
  await sair(db, null, '6277772222'); // SAIR do número do WhatsApp da empresa, sem o 9
  igual((await pode(db, u, null)).pode, false, 'SAIR do telefone da empresa (sem o 9) barra a consulta pela CONTA');
  igual((await pode(db, null, '(62) 97777-2222')).pode, false, 'e a consulta só pelo telefone');
}

// consulta só por telefone enxerga a linha da CONTA
{
  const tel = '(71) 96666-3333';
  const u = await conta(db, tel);
  await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'reclamou', 'painel')`, [u]);
  igual((await pode(db, null, tel)).motivo, 'reclamou', 'linha só da conta (user_id): consulta pelo telefone da dona barra');
  igual((await pode(db, null, '7166663333')).pode, false, '...mesmo no formato sem o 9');
  const outra = await conta(db, '(71) 96666-4444');
  igual((await pode(db, outra, null)).pode, true, 'outra conta, telefone diferente: liberada');
}

// o que já bloqueava continua bloqueando
{
  const u = await conta(db, '(81) 95555-1212');
  await sair(db, u, null, 'pediu_sair', 'app');
  igual((await pode(db, u, null)).motivo, 'pediu_sair', 'por conta (user_id) segue barrando');
  const v = await conta(db, '(82) 95555-1313');
  await sair(db, null, '(82) 95555-1313', 'numero_invalido');
  igual((await pode(db, v, null)).motivo, 'numero_invalido', 'numero_invalido segue barrando');
  igual((await pode(db, null, '(82) 95555-1313')).motivo, 'numero_invalido', 'por telefone exato segue barrando');
}

// quem nunca pediu segue liberado; conta apagada/inexistente segue como antes
{
  const l = await conta(db, '(91) 95555-1414', { telefone: '(91) 95555-1515' });
  igual((await pode(db, l, null)).motivo, 'liberado', 'quem nunca pediu para parar: liberado');
  igual((await pode(db, null, '(91) 95555-1515')).motivo, 'liberado', '...também só pelo telefone');
  igual((await pode(db, '00000000-0000-4000-8000-000000000001', null)).motivo, 'conta_inexistente', 'conta inexistente');
  igual((await pode(db, null, null)).motivo, 'sem_identificador', 'sem identificador');
}

// patch: idempotente, falha fechado, permissões
await db.exec(patch);
igual(Number((await db.query<{ n: string }>(`select count(*) n from pg_proc where proname = 'pode_contatar_whatsapp'`)).rows[0].n), 1, 'rodar o remendo de novo não duplica a função');
igual((await pode(db, null, '3155550000')).pode, false, 'rodar de novo mantém o comportamento');
const priv = async (role: string) =>
  (await db.query<{ p: boolean }>(`select has_function_privilege($1, 'public.pode_contatar_whatsapp(uuid, text)', 'execute') as p`, [role])).rows[0].p;
igual([await priv('anon'), await priv('authenticated')], [false, false], 'permissões preservadas: sem execute para anon/authenticated');
{
  const dbx = await banco(false);
  await dbx.exec(`create or replace function public.pode_contatar_whatsapp(p_user_id uuid default null, p_telefone text default null)
    returns jsonb language sql as $$ select '{"pode":true}'::jsonb $$;`);
  let erro = '';
  try { await dbx.exec(patch); } catch (e) { erro = String((e as Error).message); }
  assert.ok(erro.includes('pode_contatar_whatsapp_formato_inesperado'), `FALHA: definição diferente deve falhar fechado (erro: ${erro})`);
  checks++;
}

console.log(`teste-pode-contatar-chave-sql: ${checks} verificações ok`);
