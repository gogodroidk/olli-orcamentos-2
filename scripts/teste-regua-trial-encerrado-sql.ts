/**
 * Régua `trial_encerrado` NO BANCO (migration 20261109100000) — Postgres real (PGlite).
 *
 *     node scripts/teste-regua-trial-encerrado-sql.ts
 *
 * Prova, sobre as funções REAIS da régua + o remendo de contas internas (20261007140000):
 *  · o patch NÃO apaga a trava de conta interna (lista e enqueue) e é idempotente;
 *  · a lista devolve o trial vencido (<=7 dias) de conta no plano GRÁTIS e NÃO devolve quem já paga, conta interna nem trial antigo;
 *  · o enqueue aceita `trial_encerrado` só para esse segmento, 1 vez por teste (duplicado), e recusa o resto.
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
const t1 = ler('../supabase/migrations/20261007130000_medicao_primeiro_orcamento.sql');
const contasInternas = ler('../supabase/migrations/20261007140000_contas_internas.sql');
const regua = ler('../supabase/migrations/20261005090000_regua_reengajamento.sql');
const pixVence = ler('../supabase/migrations/20261026040000_pix_vence_lembrete.sql');
const patch = ler('../supabase/migrations/20261109100000_regua_trial_encerrado.sql');

function funcaoDe(sql: string, nome: string): string {
  const m = new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$function\\$;`).exec(sql);
  assert.ok(m, `não achei ${nome} na migration da régua`);
  return m[0];
}

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null default now(),
    email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.organizacoes (id uuid primary key default gen_random_uuid(), owner_user_id uuid, nome text, criado_em timestamptz default now());
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, papel text not null default 'tecnico', ativo boolean not null default true, primary key (org_id, user_id));
  create table public.funil_exclusoes (id bigserial primary key, user_id uuid, email text, motivo text, criado_por uuid, criado_em timestamptz default now(), check (user_id is not null or email is not null));
  create unique index funil_exclusoes_user_uidx on public.funil_exclusoes (user_id) where user_id is not null;
  create table public.admin_memberships (user_id uuid primary key, papel text, ativo boolean not null default true);
  create table public.orcamentos (id serial primary key, user_id uuid, criado_por uuid, criado_em timestamptz default now(), status text default 'rascunho', dados jsonb, excluido_em timestamptz);
  create table public.email_outbox (id bigserial primary key, event_id text, user_id uuid, tenant_id uuid, idempotency_key text, template text, template_version text, purpose text, recipient text, next_attempt_at timestamptz, template_dados jsonb, created_at timestamptz default now());
  create unique index email_outbox_idem_uidx on public.email_outbox (idempotency_key);
  create table public.email_supressoes (user_id uuid);
  create function private.email_recebeu_ultimas_24h(p_user uuid, p_now timestamptz) returns boolean language sql as $$ select false $$;
`);

await db.exec(`
  alter table public.email_outbox add column status text default 'pending';
  create table public.assinaturas (user_id uuid primary key, plano text, status text, current_period_end timestamptz,
    admin_plano_override text, admin_override_ativo boolean, admin_override_ate timestamptz,
    stripe_subscription_id text, mp_preapproval_id text, revenuecat_transacao_id text);
  create table public.play_compras (token_sha256 text, auto_renovacao boolean, estado text);
  create table public.orcamento_envios_gratis (tenant_id uuid, periodo date, estado text, reserva_expira_em timestamptz);
  create table public.trials_comerciais (tenant_id uuid primary key, owner_user_id uuid, estado text, termina_em timestamptz, convertido_em timestamptz);
  -- stub: quem tem assinatura 'pro' paga; o resto é grátis (a regra real é a mesma pergunta: plano efetivo)
  create function public.plano_comercial_efetivo(p_user uuid, p_tenant uuid, p_now timestamptz) returns text language sql stable as $$
    select coalesce((select a.plano from public.assinaturas a where a.user_id = p_user and a.status = 'active'), 'gratis') $$;
`);
await db.exec(optout);
await db.exec('grant execute on function public.pode_contatar_whatsapp(uuid, text) to service_role');
await db.exec(t1);
await db.exec(funcaoDe(regua, 'enqueue_lembrete_email'));
await db.exec(funcaoDe(regua, 'listar_candidatos_lembrete_email'));
await db.exec(contasInternas); // aplica os remendos de conta_interna sobre as funções
// pix_vence (26/10) remenda a MESMA função e roda ANTES da migration nova: só o bloco do patch (sem as tabelas dele)
await db.exec(/do \$patch\$[\s\S]*?\$patch\$;/.exec(pixVence)![0]);
await db.exec(patch);
await db.exec(patch); // idempotente
checks++;

const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const defs = (await q(`select p.proname, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname in ('enqueue_lembrete_email','listar_candidatos_lembrete_email')`));
for (const f of defs) {
  const ganhou = f.proname === 'enqueue_lembrete_email' ? f.d.includes("'trial_encerrado'") : f.d.includes('teste do Pro que terminou');
  igual([f.proname, f.d.includes('public.conta_interna('), ganhou], [f.proname, true, true], `${f.proname}: mantém a trava de conta interna E ganhou o ramo do trial encerrado`);
}
igual(defs.find((f) => f.proname === 'enqueue_lembrete_email').d.includes("'pix_vence'"), true, 'enqueue: o ramo do pix_vence (migration anterior) sobrevive ao patch novo');
igual((defs.find((f) => f.proname === 'listar_candidatos_lembrete_email').d.match(/teste do Pro que terminou/g) ?? []).length, 1, 'ramo da lista inserido UMA vez (patch idempotente)');

const conta = async (email: string, tag: string) => {
  const id = (await q(`insert into auth.users (email, email_confirmed_at) values ($1, now() - interval '20 days') returning id`, [email]))[0].id as string;
  await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, now() - interval '2 days', 'rascunho', '{}')`, [id]);
  return id;
};
const trial = (u: string, diasAtras: number) =>
  q(`insert into public.trials_comerciais (tenant_id, owner_user_id, estado, termina_em) values ($1, $1, 'active', now() - ($2 || ' days')::interval)`, [u, String(diasAtras)]);
const gratis = await conta('gratis@x.test', 'g'); await trial(gratis, 2);
const pago = await conta('pago@x.test', 'p'); await trial(pago, 2);
await q(`insert into public.assinaturas (user_id, plano, status) values ($1, 'pro', 'active')`, [pago]);
const interna = await conta('interna@x.test', 'i'); await trial(interna, 2);
await q(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'teste')`, [interna]);
const antigo = await conta('antigo@x.test', 'a'); await trial(antigo, 10);

const lista = await q(`select candidato from public.listar_candidatos_lembrete_email(now(), 30, 50)`);
const ids = lista.map((r) => r.candidato.userId as string);
igual([ids.includes(gratis), ids.includes(pago), ids.includes(interna), ids.includes(antigo)], [true, false, false, false],
  'lista: entra o vencido no plano grátis; NÃO entra quem já paga, conta interna nem trial antigo');
igual(lista.find((r) => r.candidato.userId === gratis)?.candidato.oferta.trial_estado, 'ended', 'a oferta do candidato diz trial_estado=ended');

const terminaEm = async (u: string) => (await q(`select to_char(termina_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') t from public.trials_comerciais where owner_user_id = $1`, [u]))[0].t as string;
const enfileira = async (u: string, dados: Record<string, unknown>) => {
  const chave = `reengajamento:${u}:trial_encerrado:${dados.terminaEm ?? 'x'}`;
  return (await q(`select public.enqueue_lembrete_email($1, 'lembrete_reengajamento', 'lembrete_reengajamento.v1', 'reengagement_reminder', $2, $3::jsonb) r`, [u, chave, JSON.stringify(dados)]))[0].r;
};
const dadosDe = async (u: string) => ({ tipo: 'trial_encerrado', terminaEm: await terminaEm(u) });
const r1 = await enfileira(gratis, await dadosDe(gratis));
igual([r1.enfileirado, r1.motivo], [true, 'enfileirado'], 'enqueue: grátis vencido entra');
const r2 = await enfileira(gratis, await dadosDe(gratis));
igual([r2.enfileirado], [false], 'enqueue: segundo pedido do mesmo teste não entra (1 por teste)');
igual((await enfileira(pago, await dadosDe(pago))).motivo, 'trial_fora_da_janela', 'enqueue: quem já paga não recebe "voltou ao Grátis"');
igual((await enfileira(interna, await dadosDe(interna))).motivo, 'conta_interna', 'enqueue: conta interna continua barrada');
igual((await enfileira(antigo, await dadosDe(antigo))).motivo, 'trial_fora_da_janela', 'enqueue: trial com mais de 7 dias fora');
igual((await enfileira(gratis, { tipo: 'trial_encerrado', terminaEm: '2020-01-01T00:00:00.000Z' })).motivo !== 'enfileirado', true, 'enqueue: terminaEm que não bate com o teste não entra');
let erro = '';
try { await enfileira(gratis, { tipo: 'promocao' }); } catch (e: any) { erro = String(e.message); }
igual(erro.includes('lembrete_dados_invalidos'), true, 'enqueue: tipo desconhecido segue recusado');

console.log(`teste-regua-trial-encerrado-sql: ${checks} verificações ok`);
