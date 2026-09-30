-- OLLI IA — rascunhos de ação auditáveis e reversíveis.
--
-- A IA nunca escreve diretamente em tabelas de negócio. O Worker autenticado
-- registra uma prévia mínima, exige um token de confirmação de uso único, aplica
-- a mudança com compare-before e mantém o estado anterior para rollback.
-- Prompt, conversa e documentos não são persistidos aqui. O diff mínimo pode
-- conter dado operacional já existente (por exemplo, telefone) e por isso fica
-- service-role only, com expiração obrigatória em até 30 dias.

create table if not exists public.ia_action_drafts (
  id                       uuid primary key,
  version                  text not null default '2026-09-06.v1'
                           check (version = '2026-09-06.v1'),
  tenant_user_id           uuid not null references auth.users (id) on delete cascade,
  org_id                   uuid references public.organizacoes (id) on delete cascade,
  actor_user_id            uuid not null references auth.users (id) on delete cascade,
  actor_role               text not null
                           check (actor_role in ('pessoal', 'owner', 'admin', 'gestor', 'tecnico')),
  scope                    text not null
                           check (scope in ('orcamento', 'cliente', 'produto', 'servico', 'agenda', 'empresa', 'equipe')),
  record_id                text not null
                           check (record_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  summary                  text not null
                           check (length(summary) between 1 and 240),
  status                   text not null default 'aguardando_confirmacao'
                           check (status in ('aguardando_confirmacao', 'aplicada', 'cancelada', 'revertida', 'falhou')),
  confirmation_token_hash  text not null
                           check (confirmation_token_hash ~ '^[a-f0-9]{64}$'),
  before_state             jsonb not null
                           check (jsonb_typeof(before_state) = 'object'),
  after_state              jsonb not null
                           check (jsonb_typeof(after_state) = 'object'),
  rollback_state           jsonb not null
                           check (jsonb_typeof(rollback_state) = 'object'),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  expires_at               timestamptz not null default (now() + interval '30 days'),
  confirmed_at             timestamptz,
  applied_at               timestamptz,
  cancelled_at             timestamptz,
  reverted_at              timestamptz,
  constraint ia_action_drafts_lifecycle_check check (
    (status = 'aguardando_confirmacao' and confirmed_at is null and applied_at is null and cancelled_at is null and reverted_at is null)
    or (status = 'aplicada' and confirmed_at is not null and applied_at is not null and cancelled_at is null and reverted_at is null)
    or (status = 'cancelada' and applied_at is null and cancelled_at is not null and reverted_at is null)
    or (status = 'revertida' and applied_at is not null and reverted_at is not null)
    or (status = 'falhou')
  ),
  constraint ia_action_drafts_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  )
);

create index if not exists ia_action_drafts_actor_created_idx
  on public.ia_action_drafts (actor_user_id, created_at desc);
create index if not exists ia_action_drafts_tenant_status_idx
  on public.ia_action_drafts (tenant_user_id, status, created_at desc);

create table if not exists public.ia_action_events (
  id             bigint generated always as identity primary key,
  action_id      uuid not null references public.ia_action_drafts (id) on delete cascade,
  revision       integer not null check (revision between 1 and 20),
  event_type     text not null
                 check (event_type in ('rascunho_criado', 'confirmacao_aceita', 'aplicacao_concluida', 'cancelada', 'reversao_concluida', 'conflito', 'falha')),
  actor_user_id  uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (action_id, revision)
);

alter table public.ia_action_drafts enable row level security;
alter table public.ia_action_drafts force row level security;
alter table public.ia_action_events enable row level security;
alter table public.ia_action_events force row level security;

revoke all on table public.ia_action_drafts from public, anon, authenticated;
revoke all on table public.ia_action_events from public, anon, authenticated;
revoke all on sequence public.ia_action_events_id_seq from public, anon, authenticated;

grant select, insert, update on table public.ia_action_drafts to service_role;
grant select, insert on table public.ia_action_events to service_role;
grant usage, select on sequence public.ia_action_events_id_seq to service_role;

comment on table public.ia_action_drafts is
  'Previa minima de mudanca pela IA. Service role only, confirmacao de uso unico, compare-before, rollback e retencao maxima de 30 dias.';
comment on table public.ia_action_events is
  'Journal append-only de lifecycle das acoes da IA. Sem prompt, conversa ou payload de negocio.';

create or replace function public.purge_expired_ia_actions(
  p_now timestamptz default pg_catalog.now()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_now is null or p_now > pg_catalog.now() + interval '5 minutes' then
    raise exception 'ia_action_purge_invalid_clock';
  end if;
  delete from public.ia_action_drafts d where d.expires_at <= p_now;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_ia_actions(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_ia_actions(timestamptz)
  to service_role;

-- Rollback operacional não destrutivo:
-- 1. ocultar/desligar as rotas /ia/acoes no Worker;
-- 2. preservar os rascunhos e eventos para auditoria;
-- 3. reverter ações já aplicadas pelo endpoint dedicado antes de qualquer DROP;
-- 4. remover tabelas somente em migration separada e autorizada.
