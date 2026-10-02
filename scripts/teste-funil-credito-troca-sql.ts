/**
 * Funil × crédito de troca (20261002180000_funil_credito_troca.sql), em Postgres
 * real (PGlite). Trava:
 *   - override de Pro vindo de crédito de troca APROVADO fica no funil;
 *   - a aprovação vira o degrau "teste do Pro" e NUNCA "pagou";
 *   - override sem crédito aprovado (pendente/recusado/nenhum) continua 'cortesia';
 *   - concessão legada fictícia continua 'cortesia' mesmo com crédito aprovado.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const BASE = readFileSync('supabase/migrations/20260930120100_funil_receita.sql', 'utf8');
const NOVA = readFileSync('supabase/migrations/20261002180000_funil_credito_troca.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null, last_sign_in_at timestamptz);
create table public.user_activity_log (user_id uuid references auth.users(id), evento text, criado_em timestamptz);
create table public.empresa (user_id uuid primary key references auth.users(id), dados jsonb, atualizado_em timestamptz default now());
create table public.clientes (id text primary key, user_id uuid, criado_em timestamptz);
create table public.orcamentos (id text primary key, user_id uuid, status text, criado_em timestamptz, atualizado_em timestamptz);
create table public.orcamentos_publicos (token text primary key, user_id uuid, status text, criado_em timestamptz, respondido_em timestamptz);
create table public.orcamento_envios_gratis (owner_user_id uuid, estado text, confirmado_em timestamptz);
create table public.trials_comerciais (tenant_id uuid primary key, owner_user_id uuid, iniciado_em timestamptz);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id), plano text, status text,
  stripe_subscription_id text, stripe_customer_id text, mp_preapproval_id text, atualizado_em timestamptz default now(),
  admin_override_ativo boolean not null default false, admin_override_at timestamptz
);
create table public.webhook_events (origem text, event_id text, status text, payload jsonb, processado_em timestamptz);
create table public.admin_memberships (user_id uuid primary key);
create table public.organizacoes (id uuid primary key, owner_user_id uuid);
create table public.organizacao_membros (org_id uuid, user_id uuid, papel text);
create table public.creditos_troca (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null,
  decidido_em timestamptz, criado_em timestamptz default now()
);
`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TROCA = id(1), PENDENTE = id(2), RECUSADO = id(3), CORTESIA = id(4), LEGADO_TROCA = id(5), SEM_NADA = id(6);

const db = new PGlite();
await db.exec(ESQUEMA);
await db.exec(`
insert into auth.users values
  ('${TROCA}', 'troca@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z'),
  ('${PENDENTE}', 'pendente@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z'),
  ('${RECUSADO}', 'recusado@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z'),
  ('${CORTESIA}', 'cortesia@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z'),
  ('${LEGADO_TROCA}', 'legado@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z'),
  ('${SEM_NADA}', 'normal@olli.test', '2026-10-01T10:00Z', '2026-10-01T10:05Z');
insert into public.assinaturas (user_id, plano, status, admin_override_ativo, admin_override_at) values
  ('${TROCA}', 'pro', 'canceled', true, '2026-10-02T12:00Z'),
  ('${PENDENTE}', 'pro', 'canceled', true, '2026-10-02T12:00Z'),
  ('${RECUSADO}', 'pro', 'canceled', true, '2026-10-02T12:00Z'),
  ('${CORTESIA}', 'empresa', 'canceled', true, '2026-10-02T12:00Z');
insert into public.assinaturas (user_id, plano, status, stripe_subscription_id, stripe_customer_id) values
  ('${LEGADO_TROCA}', 'pro', 'active', 'sub_demo_grtech', 'cus_demo');
insert into public.creditos_troca (user_id, status, decidido_em) values
  ('${TROCA}', 'aprovado', '2026-10-02T12:00Z'),
  ('${PENDENTE}', 'pendente', null),
  ('${RECUSADO}', 'recusado', '2026-10-02T12:00Z'),
  ('${LEGADO_TROCA}', 'aprovado', '2026-10-02T12:00Z');
`);
await db.exec(BASE);
await db.exec(NOVA);

const { rows } = await db.query<{ user_id: string; excluida_por: string | null; teste_pro_em: Date | null; pagou_em: Date | null }>(
  `select user_id, excluida_por, teste_pro_em, pagou_em from public.funil_contas_marcos('{}')`);
const de = (u: string) => rows.find((r) => r.user_id === u);

console.log('\nfunil × crédito de troca');
checar('crédito de troca APROVADO: fica no funil', de(TROCA)?.excluida_por === null, JSON.stringify(de(TROCA)));
checar('crédito aprovado vira o degrau "teste do Pro" na data da decisão',
  de(TROCA)?.teste_pro_em instanceof Date && de(TROCA)!.teste_pro_em!.toISOString() === '2026-10-02T12:00:00.000Z');
checar('crédito aprovado NÃO é "pagou"', de(TROCA)?.pagou_em === null);
checar('override com crédito PENDENTE continua cortesia', de(PENDENTE)?.excluida_por === 'cortesia');
checar('override com crédito RECUSADO continua cortesia', de(RECUSADO)?.excluida_por === 'cortesia');
checar('override sem crédito (demo/revisor) continua cortesia', de(CORTESIA)?.excluida_por === 'cortesia');
checar('concessão legada fictícia continua cortesia mesmo com crédito aprovado', de(LEGADO_TROCA)?.excluida_por === 'cortesia');
checar('conta comum segue no funil e sem teste do Pro', de(SEM_NADA)?.excluida_por === null && de(SEM_NADA)?.teste_pro_em === null);

const idem = await db.exec(NOVA).then(() => true, () => false);
checar('migration idempotente (roda 2x)', idem);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
