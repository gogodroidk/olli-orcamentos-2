/**
 * PAINEL ADM "O que fazer hoje" (migration 20261109120000) rodando o SQL de verdade no PGlite.
 *
 *     node scripts/teste-admin-hoje-sql.ts
 *
 * Prova: (1) limite: conta anterior ao corte, sem corte_antigas, aparece como "ainda envia" e o corte não está ativo;
 * (2) com corte_antigas no passado a mesma conta vira "barrada" e o corte fica ativo (regra do banco,
 * 20261024150000); (3) conta criada depois do corte é barrada mesmo sem corte_antigas; (4) Pro e conta interna
 * ficam fora; (5) Pix pendente: entra o não pago, sai o pago e sai quem já tem assinatura paga;
 * (6) só service_role executa a função.
 * As dependências (plano efetivo, conta interna, pagantes) são stubs mínimos com a mesma assinatura.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sqlHoje = readFileSync(new URL('../supabase/migrations/20261109120000_admin_hoje.sql', import.meta.url), 'utf8');

let ok = 0;
const caso = (n: string) => { ok++; console.log(`  ok  ${n}`); };

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema private;
  create table auth.users (id uuid primary key, created_at timestamptz not null default now());
  create function private.timestamptz_ou_nulo(p text) returns timestamptz language plpgsql immutable as
    $$ begin return p::timestamptz; exception when others then return null; end $$;
  create table public.webhook_events (event_id text primary key, origem text, tipo text, status text,
    recebido_em timestamptz not null default now(), payload jsonb not null default '{}');
  create table public.limite_gratis_config (id boolean primary key default true, limite integer, corte timestamptz, corte_antigas timestamptz);
  create table public.orcamento_envios_gratis (owner_user_id uuid, tenant_id uuid, periodo date, estado text);
  create table public.planos_teste (uid uuid primary key, plano text);
  create function public.plano_comercial_efetivo(p_uid uuid, p_tenant uuid, p_em timestamptz) returns text
    language sql stable as $$ select coalesce((select plano from public.planos_teste where uid = p_uid), 'gratis') $$;
  create table public.internas_teste (uid uuid primary key);
  create function public.receita_conta_interna(p_uid uuid, p_emails text[]) returns text
    language sql stable as $$ select case when exists (select 1 from public.internas_teste where uid = p_uid) then 'interna' end $$;
  create table public.assinaturas_teste (user_id uuid primary key, plano text, status text, current_period_end timestamptz);
  create function public.admin_assinaturas_pagantes(p_emails_excluidos text[] default '{}')
    returns table (user_id uuid, plano text, status text, current_period_end timestamptz)
    language sql stable as $$ select a.user_id, a.plano, a.status, a.current_period_end from public.assinaturas_teste a $$;
  create table public.profiles (user_id uuid, nome text);
  create table public.organizacoes (id serial primary key, owner_user_id uuid, nome text);
  create table public.trials_comerciais (owner_user_id uuid, estado text, termina_em timestamptz, convertido_em timestamptz);
  create table public.email_outbox (template text, status text, error_code text, updated_at timestamptz);
`);
await db.exec(sqlHoje);

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ANTIGA = U(1), NOVA = U(2), PRO = U(3), INTERNA = U(4), PIX_ABERTO = U(5), PIX_PAGO = U(6), PIX_PAGANTE = U(7);
await db.exec(`
  insert into auth.users (id, created_at) values
    ('${ANTIGA}', now() - interval '60 days'), ('${NOVA}', now() - interval '1 day'),
    ('${PRO}', now() - interval '60 days'), ('${INTERNA}', now() - interval '60 days');
  insert into public.planos_teste values ('${PRO}', 'pro');
  insert into public.internas_teste values ('${INTERNA}');
  insert into public.limite_gratis_config (id, limite, corte, corte_antigas) values (true, 5, now() + interval '1 day', null);
`);
const periodo = `date_trunc('month', timezone('UTC', now()))::date`;
for (const [uid, n] of [[ANTIGA, 6], [NOVA, 5], [PRO, 7], [INTERNA, 9]] as const) {
  for (let i = 0; i < n; i++) await db.exec(`insert into public.orcamento_envios_gratis values ('${uid}', '${uid}', ${periodo}, 'confirmado')`);
}

const hoje = async () => ((await db.query<{ r: any }>(`select public.admin_hoje('{}') as r`)).rows[0].r);
const itensLimite = (h: any) => Object.fromEntries((h.limiteGratis.itens as any[]).map((x) => [x.userId, x]));

// (1) corte no futuro e sem corte_antigas: ninguém barrado ainda
let h = await hoje();
assert.equal(h.limiteGratis.corteAtivo, false);
assert.equal(itensLimite(h)[ANTIGA].limitada, false);
caso('corte no futuro, sem corte_antigas: corte inativo e a conta antiga ainda envia');

// (4) Pro e conta interna fora
assert.equal(itensLimite(h)[PRO], undefined);
assert.equal(itensLimite(h)[INTERNA], undefined);
caso('Pro e conta interna não entram na lista do limite');

// (2) corte_antigas no passado: a conta antiga passa a ser barrada (limite em todas)
await db.exec(`update public.limite_gratis_config set corte_antigas = now() - interval '1 day'`);
h = await hoje();
assert.equal(h.limiteGratis.corteAtivo, true);
assert.equal(itensLimite(h)[ANTIGA].limitada, true);
assert.equal(itensLimite(h)[NOVA].limitada, true);
caso('corte_antigas no passado: corte ativo e contas antigas barradas (mesma regra do banco)');

// (3) corte no passado, sem corte_antigas: só a conta criada depois do corte é barrada
await db.exec(`update public.limite_gratis_config set corte = now() - interval '2 days', corte_antigas = null`);
h = await hoje();
assert.equal(h.limiteGratis.corteAtivo, true);
assert.equal(itensLimite(h)[NOVA].limitada, true);
assert.equal(itensLimite(h)[ANTIGA].limitada, false);
caso('corte no passado sem corte_antigas: conta nova barrada, antiga ainda envia');

// sem corte nenhum: lista continua (serve para oferta), corte inativo
await db.exec(`update public.limite_gratis_config set corte = null, corte_antigas = null`);
h = await hoje();
assert.equal(h.limiteGratis.corteAtivo, false);
assert.equal(itensLimite(h)[NOVA].limitada, false);
caso('sem corte configurado: ninguém barrado e corte inativo');

// (5) Pix pendente
await db.exec(`
  insert into public.webhook_events (event_id, origem, tipo, status, recebido_em, payload) values
    ('c1', 'pix_cobranca', 'plano_pix_criada', 'processado', now() - interval '1 day', '{"user_id":"${PIX_ABERTO}","plano":"pro"}'),
    ('c2', 'pix_cobranca', 'plano_pix_criada', 'processado', now() - interval '1 day', '{"user_id":"${PIX_PAGO}","plano":"pro"}'),
    ('p2', 'abacate', 'plano_pix', 'processado', now() - interval '20 hours', '{"user_id":"${PIX_PAGO}","plano":"pro","valor_centavos":3900}'),
    ('c3', 'pix_cobranca', 'plano_pix_criada', 'processado', now() - interval '1 day', '{"user_id":"${PIX_PAGANTE}","plano":"pro"}');
  insert into public.assinaturas_teste values ('${PIX_PAGANTE}', 'pro', 'active', now() + interval '20 days');
`);
h = await hoje();
const pix = (h.pixPendentes.itens as any[]).map((x) => x.userId);
assert.deepEqual(pix, [PIX_ABERTO]);
assert.equal(h.pixPendentes.total, 1);
caso('Pix pendente: entra o não pago; saem o pago e quem já tem assinatura paga');
assert.equal(h.mes.entrouCentavos, 3900);
caso('números do mês somam o Pix pago');

// (6) só service_role executa
const priv = (await db.query<{ a: boolean; s: boolean }>(
  `select has_function_privilege('authenticated', 'public.admin_hoje(text[])', 'execute') as a,
          has_function_privilege('service_role', 'public.admin_hoje(text[])', 'execute') as s`)).rows[0];
assert.equal(priv.a, false);
assert.equal(priv.s, true);
caso('authenticated não executa; service_role executa');

console.log(`\n${ok} ok, 0 falha(s)`);
