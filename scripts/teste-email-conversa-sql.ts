/**
 * E-mail de CONVERSA NO BANCO (migration 20261118140000) — Postgres real (PGlite).
 *
 *     node scripts/teste-email-conversa-sql.ts
 *
 * Prova, sobre as constraints REAIS do outbox (oferta_pro, 20261108120000), o teto de 24 h REAL (régua) e as
 * tabelas REAIS de opt-out (e-mail 20260929200000, WhatsApp 20261006090000):
 *  · `conversa` não entra no outbox ANTES da migration e entra DEPOIS; os templates antigos seguem válidos;
 *  · o patch do catálogo não apaga template acrescentado por outra migration e é idempotente;
 *  · enqueue_conversa enfileira 1 vez e barra: suprimido (e-mail OU WhatsApp), conversa recente, não-Grátis, excluído,
 *    1 e-mail/24 h, teto diário, texto grande demais; `numero_invalido` NÃO barra;
 *  · só service_role executa as RPCs novas.
 * `private.oferta_pro_fatos` é trocada por um stub (depende de plano/assinatura/organização, fora do que se prova aqui).
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
const regua = ler('../supabase/migrations/20261005090000_regua_reengajamento.sql');
const ofertaPro = ler('../supabase/migrations/20261108120000_oferta_pro_email.sql');
const migration = ler('../supabase/migrations/20261118140000_email_conversa.sql');

const tabelaSup = /create table if not exists public\.email_supressoes \([\s\S]*?\n\);/.exec(emailBase);
assert.ok(tabelaSup, 'não achei email_supressoes');
const teto24h = /create or replace function private\.email_recebeu_ultimas_24h[\s\S]*?\n\$\$;/.exec(regua);
assert.ok(teto24h, 'não achei email_recebeu_ultimas_24h');
// Constraints reais do outbox (catálogo + tamanho de template_dados): da migration do oferta_pro até a seção 2.
const constraints = /alter table public\.email_outbox drop constraint if exists email_outbox_template_catalogo_check;[\s\S]*?(?=\n-- ─── 2\.)/.exec(ofertaPro);
assert.ok(constraints, 'não achei as constraints do outbox');

async function novoBanco(antesDaMigration = ''): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema if not exists private;
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, deleted_at timestamptz);
    create table public.email_outbox (
      id bigserial primary key, event_id text, user_id uuid, tenant_id uuid, idempotency_key text unique,
      template text, template_version text, purpose text, recipient text, status text default 'pending',
      next_attempt_at timestamptz, template_dados jsonb, error_code text,
      created_at timestamptz not null default now(), updated_at timestamptz default now()
    );
    -- fatos que o teste controla por conta (o resto do oferta_pro_fatos real não é o objeto do teste)
    create table public.fatos_stub (user_id uuid primary key, plano text default 'gratis', excluido boolean default false,
      membro_equipe boolean default false, ja_assinou boolean default false);
  `);
  await db.exec(tabelaSup![0]);
  await db.exec(optout);
  await db.exec(teto24h![0]);
  await db.exec(constraints![0]);
  await db.exec(`
    create function private.oferta_pro_fatos(p_user_id uuid, p_now timestamptz) returns jsonb language sql stable as $$
      select case when u.id is null then pg_catalog.jsonb_build_object('userId', p_user_id, 'existe', false)
        else pg_catalog.jsonb_build_object('userId', p_user_id, 'existe', true, 'plano', coalesce(f.plano, 'gratis'),
          'suprimido', exists (select 1 from public.email_supressoes s where s.user_id = p_user_id),
          'membroEquipe', coalesce(f.membro_equipe, false), 'jaAssinou', coalesce(f.ja_assinou, false),
          'excluido', coalesce(f.excluido, false), 'ofertaRecenteEm', null) end
      from (select p_user_id as id) x left join auth.users u on u.id = x.id left join public.fatos_stub f on f.user_id = x.id;
    $$;
  `);
  if (antesDaMigration) await db.exec(antesDaMigration);
  return db;
}

const usuario = async (db: PGlite) =>
  (await db.query<{ id: string }>(`insert into auth.users (email) values ('x@x.com') returning id`)).rows[0].id;
const outbox = (db: PGlite, id: string, template: string, version: string, purpose: string, dados: string | null = '{"a":1}') =>
  db.query(
    `insert into public.email_outbox (event_id, user_id, idempotency_key, template, template_version, purpose, recipient, template_dados)
     values ($1, $2, $1, $3, $4, $5, 'x@x.com', $6::jsonb)`, [`k:${Math.random()}`, id, template, version, purpose, dados]);
const enq = async (db: PGlite, id: string, dados: unknown = { assunto: 'Oi, tudo bem?', paragrafos: ['Oi!'] }, teto = 40) =>
  (await db.query<{ r: { enfileirado: boolean; motivo: string } }>(
    'select public.enqueue_conversa($1::uuid, $2::jsonb, $3::int) as r', [id, JSON.stringify(dados), teto])).rows[0].r;
const falha = async (p: Promise<unknown>, trecho: string, msg: string) => {
  let erro = '';
  try { await p; } catch (e) { erro = String((e as Error).message); }
  assert.ok(erro.includes(trecho), `FALHA: ${msg} (erro: ${erro || 'nenhum'})`);
  checks++;
};

// ── 1. catálogo: antes e depois ─────────────────────────────────────────────────────────────────
{
  const db = await novoBanco();
  const u = await usuario(db);
  await outbox(db, u, 'oferta_pro', 'oferta_pro.v1', 'oferta_pro');
  await falha(outbox(db, u, 'conversa', 'conversa.v1', 'conversa'), 'email_outbox_template_catalogo_check', 'ANTES da migration `conversa` não entra no outbox');

  await db.exec(migration);
  await outbox(db, u, 'conversa', 'conversa.v1', 'conversa');
  igual(true, true, 'DEPOIS da migration `conversa` entra no outbox');
  await outbox(db, u, 'oferta_pro', 'oferta_pro.v1', 'oferta_pro');
  await outbox(db, u, 'boas_vindas', 'boas_vindas.v1', 'account_onboarding', null);
  await outbox(db, u, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder');
  igual(true, true, 'templates antigos seguem válidos');
  await falha(outbox(db, u, 'conversa', 'conversa.v9', 'conversa'), 'email_outbox_template_catalogo_check', 'versão errada de `conversa` é recusada');
  await falha(outbox(db, u, 'conversa', 'conversa.v1', 'oferta_pro'), 'email_outbox_template_catalogo_check', 'purpose errado é recusado');
  await falha(outbox(db, u, 'conversa', 'conversa.v1', 'conversa', JSON.stringify({ x: 'a'.repeat(1100) })), 'email_outbox_template_dados_check', '`conversa` segue no teto de 1 KB');

  const defs = async () => (await db.query<{ d: string }>(
    `select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'email_outbox_template_catalogo_check'`)).rows[0].d;
  const antes = await defs();
  await db.exec(migration);
  igual(await defs(), antes, 'rodar a migration de novo não muda o catálogo (idempotente)');
  igual((antes.match(/'conversa'::text/g) ?? []).length >= 1 && (antes.match(/conversa\.v1/g) ?? []).length, 1, 'só uma entrada `conversa`');
}

// ── 2. outra migration já acrescentou um template: o patch não apaga ────────────────────────────
{
  const extra = `
    alter table public.email_outbox drop constraint email_outbox_template_catalogo_check;
    alter table public.email_outbox add constraint email_outbox_template_catalogo_check check (
      (template = 'oferta_pro' and template_version = 'oferta_pro.v1' and purpose = 'oferta_pro')
      or (template = 'lembrete_nao_aberto' and template_version = 'lembrete_nao_aberto.v1' and purpose = 'unopened_quote_reminder'));`;
  const db = await novoBanco(extra);
  const u = await usuario(db);
  await db.exec(migration);
  await outbox(db, u, 'lembrete_nao_aberto', 'lembrete_nao_aberto.v1', 'unopened_quote_reminder');
  await outbox(db, u, 'conversa', 'conversa.v1', 'conversa');
  igual(true, true, 'o template de outra migration e o `conversa` convivem');
}

// ── 3. enqueue_conversa ─────────────────────────────────────────────────────────────────────────
{
  const db = await novoBanco();
  await db.exec(migration);
  const texto = { assunto: 'Ana, que tipo de serviço você faz?', paragrafos: ['Oi, Ana! Aqui é da OLLI.', 'Que tipo de serviço você faz?'] };

  const ok = await usuario(db);
  igual(await enq(db, ok, texto), { enfileirado: true, motivo: 'enfileirado' }, 'conta limpa: enfileira');
  const linha = (await db.query<{ template: string; purpose: string; template_version: string; template_dados: unknown; recipient: string }>(
    'select template, purpose, template_version, template_dados, recipient from public.email_outbox where user_id = $1', [ok])).rows;
  igual(linha.length, 1, 'uma linha no outbox');
  igual([linha[0].template, linha[0].purpose, linha[0].template_version], ['conversa', 'conversa', 'conversa.v1'], 'template/purpose/versão certos');
  igual(linha[0].template_dados, texto, 'o texto da conta fica em template_dados');
  igual(linha[0].recipient, 'x@x.com', 'o e-mail vem da conta, nunca do chamador');
  igual((await enq(db, ok, texto)).motivo, 'conversa_recente', 'de novo: não repete (conversa recente)');

  const sup = await usuario(db);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [sup]);
  igual((await enq(db, sup)).motivo, 'suprimido', 'descadastro por e-mail barra');

  for (const motivo of ['pediu_sair', 'reclamou', 'decisao_interna']) {
    const wa = await usuario(db);
    await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, $2, 'whatsapp')`, [wa, motivo]);
    igual((await enq(db, wa)).motivo, 'suprimido', `${motivo} no WhatsApp barra o e-mail (fecha o buraco só neste caminho)`);
    igual((await db.query('select 1 from public.email_outbox where user_id = $1', [wa])).rows.length, 0, `${motivo}: nada foi enfileirado`);
  }
  const invalido = await usuario(db);
  await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'numero_invalido', 'whatsapp')`, [invalido]);
  igual((await enq(db, invalido)).enfileirado, true, 'numero_invalido NÃO barra (a pessoa não pediu para parar)');

  const pro = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, plano) values ($1, 'pro')`, [pro]);
  igual((await enq(db, pro)).motivo, 'nao_e_gratis', 'quem tem Pro/teste ativo não recebe');
  const excl = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, excluido) values ($1, true)`, [excl]);
  igual((await enq(db, excl)).motivo, 'excluido', 'conta excluída/interna não recebe');
  const assinou = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, ja_assinou) values ($1, true)`, [assinou]);
  igual((await enq(db, assinou)).motivo, 'ja_assinou', 'quem já assinou não recebe');
  const equipe = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, membro_equipe) values ($1, true)`, [equipe]);
  igual((await enq(db, equipe)).motivo, 'membro_equipe', 'membro de equipe não recebe');
  igual((await enq(db, '00000000-0000-4000-8000-0000000000ff')).motivo, 'conta_indisponivel', 'conta que não existe');

  const recebeu = await usuario(db);
  await outbox(db, recebeu, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder');
  igual((await enq(db, recebeu)).motivo, 'recebeu_email_24h', 'teto de 1 e-mail por pessoa em 24 h (qualquer tipo)');
  const dead = await usuario(db);
  await outbox(db, dead, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder');
  await db.query(`update public.email_outbox set status = 'dead_letter' where user_id = $1`, [dead]);
  igual((await enq(db, dead)).enfileirado, true, 'e-mail cancelado (dead_letter) não conta no teto');

  const db2 = await novoBanco();
  await db2.exec(migration);
  const a = await usuario(db2);
  const b = await usuario(db2);
  igual((await enq(db2, a, undefined, 1)).enfileirado, true, 'teto diário: o primeiro passa');
  igual((await enq(db2, b, undefined, 1)).motivo, 'teto_diario', 'teto diário: o segundo é barrado');

  await falha(enq(db, await usuario(db), { assunto: 'Oi, tudo bem?', paragrafos: ['ã'.repeat(600)] }), 'conversa_argumentos_invalidos', 'texto acima de 1 KB é recusado');
  await falha(db.query('select public.enqueue_conversa(null, $1::jsonb)', ['{}']), 'conversa_argumentos_invalidos', 'user_id nulo é recusado');
}

// ── 4. fatos e permissões ───────────────────────────────────────────────────────────────────────
{
  const db = await novoBanco();
  await db.exec(migration);
  const u = await usuario(db);
  await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'pediu_sair', 'whatsapp')`, [u]);
  const f = (await db.query<{ fato: { suprimido: boolean; conversaRecenteEm: string | null; existe: boolean } }>(
    'select * from public.fatos_conversa(array[$1::uuid])', [u])).rows[0].fato;
  igual([f.existe, f.suprimido, f.conversaRecenteEm], [true, true, null], 'fatos_conversa junta e-mail + WhatsApp em `suprimido`');
  await falha(db.query('select * from public.fatos_conversa(array[]::uuid[])'), 'conversa_argumentos_invalidos', 'lista vazia é recusada');

  const priv = async (role: string, fn: string) =>
    (await db.query<{ p: boolean }>('select has_function_privilege($1, $2, \'execute\') as p', [role, fn])).rows[0].p;
  for (const fn of ['public.enqueue_conversa(uuid, jsonb, integer, timestamptz)', 'public.fatos_conversa(uuid[], timestamptz)']) {
    igual([await priv('service_role', fn), await priv('anon', fn), await priv('authenticated', fn)], [true, false, false], `${fn}: só service_role executa`);
  }
}

console.log(`teste-email-conversa-sql: ${checks} verificações ok`);
