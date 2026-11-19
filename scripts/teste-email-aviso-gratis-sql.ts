/**
 * AVISO aos Grátis NO BANCO (migration 20261118150000) — Postgres real (PGlite).
 *
 *     node scripts/teste-email-aviso-gratis-sql.ts
 *
 * Prova, sobre as constraints REAIS do outbox (oferta_pro, 20261108120000), o teto de 24 h REAL (régua) e as
 * tabelas REAIS de opt-out (e-mail 20260929200000, WhatsApp 20261006090000):
 *  · `aviso_gratis` não entra no outbox ANTES da migration e entra DEPOIS; templates antigos seguem válidos;
 *  · o patch do catálogo não apaga template de outra migration (nem o `conversa` do #384) e é idempotente;
 *  · enqueue_aviso_gratis enfileira só Grátis, 1 vez por conta, e barra suprimido (e-mail OU WhatsApp, conta OU
 *    telefone), excluído, pago/teste ativo, já avisado, 1 e-mail/24 h, teto diário e `template_dados` diferente do exato;
 *  · contas_para_aviso_gratis lista só conta com e-mail confirmado, viva e não anônima;
 *  · VALIDADE (26/11/2026 03:00Z): depois do corte o enqueue recusa `aviso_vencido` (inclusive reenvio atrasado de quem
 *    já tinha passado nos portões), antes do corte segue normal; relógio exato no corte conta como vencido;
 *  · só service_role executa as RPCs novas.
 * `private.oferta_pro_fatos` é trocada por um stub (depende de plano/assinatura/organização).
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
const migrationOriginal = ler('../supabase/migrations/20261118150000_email_aviso_gratis.sql');
// Os casos normais rodam "antes do vencimento" mesmo depois de 26/11/2026 (o relógio do teste é o real): a validade
// é empurrada para 2099 aqui. O bloco 6 usa a migration ORIGINAL e simula o relógio passando do corte.
const migration = `${migrationOriginal}
create or replace function private.aviso_gratis_vence_em() returns timestamptz language sql immutable set search_path = '' as $$ select timestamptz '2099-01-01 00:00:00+00' $$;`;

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
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, deleted_at timestamptz,
      email_confirmed_at timestamptz default now(), is_anonymous boolean default false, created_at timestamptz default now(),
      raw_user_meta_data jsonb default '{}'::jsonb);
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

const DADOS = { tipo: 'tranca_gratis_d2267' };
const usuario = async (db: PGlite, tel: string | null = null) =>
  (await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ('x@x.com', case when $1::text is null then '{}'::jsonb else jsonb_build_object('phone', $1::text) end) returning id`, [tel],
  )).rows[0].id;
const outbox = (db: PGlite, id: string, template: string, version: string, purpose: string, dados: string | null = '{"a":1}') =>
  db.query(
    `insert into public.email_outbox (event_id, user_id, idempotency_key, template, template_version, purpose, recipient, template_dados)
     values ($1, $2, $1, $3, $4, $5, 'x@x.com', $6::jsonb)`, [`k:${Math.random()}`, id, template, version, purpose, dados]);
const enq = async (db: PGlite, id: string, dados: unknown = DADOS, teto = 40) =>
  (await db.query<{ r: { enfileirado: boolean; motivo: string } }>(
    'select public.enqueue_aviso_gratis($1::uuid, $2::jsonb, $3::int) as r', [id, JSON.stringify(dados), teto])).rows[0].r;
const falha = async (p: Promise<unknown>, trecho: string, msg: string) => {
  let erro = '';
  try { await p; } catch (e) { erro = String((e as Error).message); }
  assert.ok(erro.includes(trecho), `FALHA: ${msg} (erro: ${erro || 'nenhum'})`);
  checks++;
};

// ── 1. catálogo ─────────────────────────────────────────────────────────────────────────────────
{
  const db = await novoBanco();
  const u = await usuario(db);
  await falha(outbox(db, u, 'aviso_gratis', 'aviso_gratis.v1', 'plan_change_notice'), 'email_outbox_template_catalogo_check', 'ANTES da migration `aviso_gratis` não entra');
  await db.exec(migration);
  await outbox(db, u, 'aviso_gratis', 'aviso_gratis.v1', 'plan_change_notice', '{"tipo":"tranca_gratis_d2267"}');
  await outbox(db, u, 'oferta_pro', 'oferta_pro.v1', 'oferta_pro');
  await outbox(db, u, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder');
  await outbox(db, u, 'boas_vindas', 'boas_vindas.v1', 'account_onboarding', null);
  igual(true, true, 'DEPOIS da migration `aviso_gratis` entra; templates antigos seguem válidos');
  await falha(outbox(db, u, 'aviso_gratis', 'aviso_gratis.v9', 'plan_change_notice'), 'email_outbox_template_catalogo_check', 'versão errada é recusada');
  await falha(outbox(db, u, 'aviso_gratis', 'aviso_gratis.v1', 'oferta_pro'), 'email_outbox_template_catalogo_check', 'purpose errado é recusado');
  const defs = async () => (await db.query<{ d: string }>(
    `select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'email_outbox_template_catalogo_check'`)).rows[0].d;
  const antes = await defs();
  await db.exec(migration);
  igual(await defs(), antes, 'rodar a migration de novo não muda o catálogo (idempotente)');
  igual((antes.match(/aviso_gratis\.v1/g) ?? []).length, 1, 'só uma entrada `aviso_gratis`');
}

// ── 2. convive com outra migration do catálogo (ex.: `conversa` do #384) ───────────────────────
{
  const extra = `
    alter table public.email_outbox drop constraint email_outbox_template_catalogo_check;
    alter table public.email_outbox add constraint email_outbox_template_catalogo_check check (
      (template = 'oferta_pro' and template_version = 'oferta_pro.v1' and purpose = 'oferta_pro')
      or (template = 'conversa' and template_version = 'conversa.v1' and purpose = 'conversa'));`;
  const db = await novoBanco(extra);
  const u = await usuario(db);
  await db.exec(migration);
  await outbox(db, u, 'conversa', 'conversa.v1', 'conversa');
  await outbox(db, u, 'aviso_gratis', 'aviso_gratis.v1', 'plan_change_notice', '{"tipo":"tranca_gratis_d2267"}');
  igual(true, true, '`conversa` de outra migration e `aviso_gratis` convivem');
}

// ── 3. enqueue_aviso_gratis ─────────────────────────────────────────────────────────────────────
{
  const db = await novoBanco();
  await db.exec(migration);

  const ok = await usuario(db);
  igual(await enq(db, ok), { enfileirado: true, motivo: 'enfileirado' }, 'Grátis ativo: enfileira');
  const linha = (await db.query<{ template: string; purpose: string; template_version: string; template_dados: unknown; recipient: string }>(
    'select template, purpose, template_version, template_dados, recipient from public.email_outbox where user_id = $1', [ok])).rows;
  igual(linha.length, 1, 'uma linha no outbox');
  igual([linha[0].template, linha[0].purpose, linha[0].template_version], ['aviso_gratis', 'plan_change_notice', 'aviso_gratis.v1'], 'template/purpose/versão certos');
  igual(linha[0].template_dados, DADOS, 'template_dados só carrega o tipo (o texto vem da fonte no worker)');
  igual(linha[0].recipient, 'x@x.com', 'o e-mail vem da conta, nunca do chamador');
  igual((await enq(db, ok)).motivo, 'ja_avisado', 'de novo: não repete');

  const sup = await usuario(db);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [sup]);
  igual((await enq(db, sup)).motivo, 'suprimido', 'descadastro por e-mail barra');
  for (const motivo of ['pediu_sair', 'reclamou', 'decisao_interna']) {
    const wa = await usuario(db);
    await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, $2, 'whatsapp')`, [wa, motivo]);
    igual((await enq(db, wa)).motivo, 'suprimido', `${motivo} no WhatsApp (por conta) barra`);
    const tel = `(11) 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;
    const soTel = await usuario(db, tel);
    await db.query('select public.registrar_nao_contatar_whatsapp(null, $1, $2, \'whatsapp\')', [tel, motivo]);
    igual((await enq(db, soTel)).motivo, 'suprimido', `${motivo} gravado SÓ com o telefone barra a conta que tem esse número`);
  }
  const invalido = await usuario(db);
  await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'numero_invalido', 'whatsapp')`, [invalido]);
  igual((await enq(db, invalido)).enfileirado, true, 'numero_invalido NÃO barra (a pessoa não pediu para parar)');

  const pro = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, plano) values ($1, 'pro')`, [pro]);
  igual((await enq(db, pro)).motivo, 'nao_e_gratis', 'Pro ou teste Pro ativo não recebe');
  const excl = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, excluido) values ($1, true)`, [excl]);
  igual((await enq(db, excl)).motivo, 'excluido', 'conta excluída/interna não recebe');
  const assinou = await usuario(db);
  await db.query(`insert into public.fatos_stub (user_id, ja_assinou) values ($1, true)`, [assinou]);
  igual((await enq(db, assinou)).enfileirado, true, 'ex-assinante hoje no Grátis RECEBE (a mudança vale para ele)');
  igual((await enq(db, '00000000-0000-4000-8000-0000000000ff')).motivo, 'conta_indisponivel', 'conta que não existe');

  const recebeu = await usuario(db);
  await outbox(db, recebeu, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder');
  igual((await enq(db, recebeu)).motivo, 'recebeu_email_24h', 'teto de 1 e-mail por pessoa em 24 h (qualquer tipo)');
  const dead = await usuario(db);
  await outbox(db, dead, 'aviso_gratis', 'aviso_gratis.v1', 'plan_change_notice', '{"tipo":"tranca_gratis_d2267"}');
  await db.query(`update public.email_outbox set status = 'dead_letter', created_at = now() - interval '2 days' where user_id = $1`, [dead]);
  igual((await enq(db, dead)).enfileirado, true, 'aviso cancelado (dead_letter) não conta: a conta pode receber');

  await falha(enq(db, await usuario(db), { tipo: 'tranca_gratis_d2267', texto: 'x' }), 'aviso_gratis_argumentos_invalidos', 'template_dados com texto extra é recusado');
  await falha(enq(db, await usuario(db), { tipo: 'outro' }), 'aviso_gratis_argumentos_invalidos', 'tipo diferente é recusado');
  await falha(db.query('select public.enqueue_aviso_gratis(null, $1::jsonb)', [JSON.stringify(DADOS)]), 'aviso_gratis_argumentos_invalidos', 'user_id nulo é recusado');

  const db2 = await novoBanco();
  await db2.exec(migration);
  const a = await usuario(db2);
  const b = await usuario(db2);
  igual((await enq(db2, a, DADOS, 1)).enfileirado, true, 'teto diário: o primeiro passa');
  igual((await enq(db2, b, DADOS, 1)).motivo, 'teto_diario', 'teto diário: o segundo é barrado');
}

// ── 4. leitura das contas, fatos e permissões ───────────────────────────────────────────────────
{
  const db = await novoBanco();
  await db.exec(migration);
  const viva = await usuario(db);
  await db.query(`insert into auth.users (email, deleted_at) values ('d@x.com', now())`);
  await db.query(`insert into auth.users (email, email_confirmed_at) values ('n@x.com', null)`);
  await db.query(`insert into auth.users (email, is_anonymous) values ('a@x.com', true)`);
  await db.query(`insert into auth.users (email) values (null)`);
  const lista = (await db.query<{ user_id: string }>('select * from public.contas_para_aviso_gratis(500)')).rows.map((r) => r.user_id);
  igual(lista, [viva], 'só conta viva, com e-mail confirmado e não anônima entra na leitura');
  await falha(db.query('select * from public.contas_para_aviso_gratis(0)'), 'aviso_gratis_argumentos_invalidos', 'limite 0 é recusado');
  await falha(db.query('select * from public.contas_para_aviso_gratis(1001)'), 'aviso_gratis_argumentos_invalidos', 'limite acima de 1000 é recusado');
  const f = (await db.query<{ fato: { existe: boolean; suprimido: boolean; avisoEnviadoEm: string | null; plano: string } }>(
    'select * from public.fatos_aviso_gratis(array[$1::uuid])', [viva])).rows[0].fato;
  igual([f.existe, f.suprimido, f.avisoEnviadoEm, f.plano], [true, false, null, 'gratis'], 'fatos da conta limpa');
  await falha(db.query('select * from public.fatos_aviso_gratis(array[]::uuid[])'), 'aviso_gratis_argumentos_invalidos', 'lista vazia é recusada');

  const priv = async (role: string, fn: string) =>
    (await db.query<{ p: boolean }>('select has_function_privilege($1, $2, \'execute\') as p', [role, fn])).rows[0].p;
  for (const fn of ['public.enqueue_aviso_gratis(uuid, jsonb, integer, timestamptz)', 'public.fatos_aviso_gratis(uuid[], timestamptz)', 'public.contas_para_aviso_gratis(integer)']) {
    igual([await priv('service_role', fn), await priv('anon', fn), await priv('authenticated', fn)], [true, false, false], `${fn}: só service_role executa`);
  }
}

// ── 6. validade: depois de 26/11/2026 03:00Z o aviso não é mais enfileirado ─────────────────────────
{
  const db = await novoBanco();
  await db.exec(migrationOriginal);
  const vence = async () => (await db.query<{ v: string }>(`select to_char(private.aviso_gratis_vence_em() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as v`)).rows[0].v;
  igual(await vence(), '2026-11-26T03:00:00Z', 'a validade na migration é 26/11/2026 03:00Z (00:00 em Brasília)');
  const troca = (quando: string) => db.query(`create or replace function private.aviso_gratis_vence_em() returns timestamptz language sql immutable set search_path = '' as $$ select ${quando} $$`);

  // antes do corte: normal
  await troca(`now() + interval '1 day'`);
  const antes = await usuario(db);
  igual((await enq(db, antes)).motivo, 'enfileirado', 'antes do corte: enfileira');

  // reenvio atrasado: conta Grátis ativa, limpa, que passaria em todos os portões — com o relógio já no corte, recusa
  await troca(`now() - interval '1 day'`);
  const atrasada = await usuario(db);
  igual(await enq(db, atrasada), { enfileirado: false, motivo: 'aviso_vencido' }, 'reenvio atrasado (depois do corte): não enfileira');
  igual((await db.query('select 1 from public.email_outbox where user_id = $1', [atrasada])).rows.length, 0, 'nada no outbox da conta atrasada');
  igual((await enq(db, antes)).motivo, 'aviso_vencido', 'quem já foi avisado também recebe aviso_vencido (corte vale antes de qualquer portão)');
  const inexistente = (await db.query<{ r: { motivo: string } }>(
    `select public.enqueue_aviso_gratis(gen_random_uuid(), $1::jsonb) as r`, [JSON.stringify(DADOS)])).rows[0].r;
  igual(inexistente.motivo, 'aviso_vencido', 'corte vale mesmo para conta que nem existe (não vaza estado)');

  // fronteira: p_now exatamente no corte = vencido; 1 ms antes = ainda sai
  const T = (await db.query<{ t: string }>(`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`)).rows[0].t;
  const chamar = async (id: string) => (await db.query<{ r: { motivo: string } }>(
    'select public.enqueue_aviso_gratis($1::uuid, $2::jsonb, 40, $3::timestamptz) as r', [id, JSON.stringify(DADOS), T])).rows[0].r.motivo;
  await troca(`timestamptz '${T}'`);
  const naBorda = await usuario(db);
  igual(await chamar(naBorda), 'aviso_vencido', 'p_now == corte: vencido');
  await troca(`timestamptz '${T}' + interval '1 millisecond'`);
  igual(await chamar(naBorda), 'enfileirado', 'p_now 1 ms antes do corte: ainda enfileira');
}

console.log(`teste-email-aviso-gratis-sql: ${checks} verificações ok`);
