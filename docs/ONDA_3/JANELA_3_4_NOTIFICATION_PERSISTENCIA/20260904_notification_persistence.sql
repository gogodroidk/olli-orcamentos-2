-- LOCAL_ONLY — NÃO APLICAR.
-- Draft de schema para persistência de notificações do OLLI Orçamentos.
-- Fica deliberadamente fora de supabase/migrations e nunca foi executado.
-- Não contém token bruto, endereço, provider, credencial ou dado real.

begin;

create table public.notification_inbox_scopes (
  id          bigint generated always as identity primary key,
  tenant_id   uuid references public.organizacoes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  revision    bigint not null default 0 check (revision >= 0),
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  check (updated_at >= created_at)
);

create unique index notification_inbox_scopes_identity_uidx
  on public.notification_inbox_scopes (tenant_id, user_id) nulls not distinct;
create index notification_inbox_scopes_user_idx
  on public.notification_inbox_scopes (user_id);

create table public.notification_inbox_items (
  id                bigint generated always as identity primary key,
  scope_id          bigint not null references public.notification_inbox_scopes (id) on delete cascade,
  notification_id   text not null,
  event_id          text not null,
  kind              text not null check (kind in ('security', 'operational', 'education', 'engagement')),
  priority          text not null check (priority in ('low', 'normal', 'high', 'critical')),
  title             text not null check (length(title) between 1 and 160),
  body              text not null check (length(body) between 1 and 1200),
  action_url        text check (action_url is null or action_url ~ '^https://'),
  status            text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  expires_at        timestamptz not null,
  read_at           timestamptz,
  dismissed_at      timestamptz,
  constraint notification_inbox_items_event_unique unique (scope_id, event_id),
  constraint notification_inbox_items_id_unique unique (scope_id, notification_id),
  constraint notification_inbox_items_retention_check
    check (expires_at > created_at and expires_at <= created_at + interval '90 days'),
  constraint notification_inbox_items_clock_check check (updated_at >= created_at),
  constraint notification_inbox_items_terminal_check check (
    (status = 'unread' and read_at is null and dismissed_at is null)
    or (status = 'read' and read_at is not null and dismissed_at is null)
    or (status = 'dismissed' and dismissed_at is not null)
  )
);

create index notification_inbox_items_projection_idx
  on public.notification_inbox_items (scope_id, status, created_at desc);
create index notification_inbox_items_expiry_idx
  on public.notification_inbox_items (expires_at);

create table public.notification_inbox_operations (
  id                  bigint generated always as identity primary key,
  scope_id            bigint not null references public.notification_inbox_scopes (id) on delete cascade,
  operation_id        text not null,
  command_fingerprint text not null check (command_fingerprint ~ '^[a-f0-9]{64}$'),
  revision            bigint not null check (revision > 0),
  applied_at          timestamptz not null,
  constraint notification_inbox_operations_identity_unique unique (scope_id, operation_id),
  constraint notification_inbox_operations_revision_unique unique (scope_id, revision)
);

create table public.push_device_registrations (
  id                    bigint generated always as identity primary key,
  tenant_id             uuid not null references public.organizacoes (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  device_id             text not null,
  platform              text not null check (platform in ('android', 'ios', 'web')),
  app_version           text not null,
  device_label          text,
  token_fingerprint     text not null check (token_fingerprint ~ '^[a-f0-9]{64}$'),
  fingerprint_key_id    text not null check (
    length(fingerprint_key_id) between 1 and 80
    and fingerprint_key_id ~ '^[a-zA-Z0-9._:-]+$'
  ),
  status                text not null check (status in ('active', 'revoked', 'invalid')),
  terminal_reason       text,
  revision              bigint not null default 0 check (revision >= 0),
  consent_at            timestamptz not null,
  created_at            timestamptz not null,
  updated_at            timestamptz not null,
  last_seen_at          timestamptz not null,
  revoked_at            timestamptz,
  constraint push_device_registrations_identity_unique unique (tenant_id, user_id, device_id),
  constraint push_device_registrations_clock_check check (
    consent_at <= created_at
    and updated_at >= created_at
    and last_seen_at >= created_at
  ),
  constraint push_device_registrations_terminal_check check (
    (status = 'active' and revoked_at is null and terminal_reason is null)
    or (status in ('revoked', 'invalid') and revoked_at is not null and terminal_reason is not null)
  )
);

create unique index push_device_registrations_fingerprint_uidx
  on public.push_device_registrations (token_fingerprint);
create index push_device_registrations_user_idx
  on public.push_device_registrations (user_id);
create index push_device_registrations_terminal_idx
  on public.push_device_registrations (updated_at)
  where status in ('revoked', 'invalid');

create table public.notification_delivery_scopes (
  id                  bigint generated always as identity primary key,
  tenant_id           uuid not null references public.organizacoes (id) on delete cascade,
  actor_fingerprint   text not null check (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  fingerprint_key_id  text not null check (
    length(fingerprint_key_id) between 1 and 80
    and fingerprint_key_id ~ '^[a-zA-Z0-9._:-]+$'
  ),
  revision            bigint not null default 0 check (revision >= 0),
  created_at          timestamptz not null,
  updated_at          timestamptz not null,
  constraint notification_delivery_scopes_identity_unique unique (tenant_id, actor_fingerprint),
  constraint notification_delivery_scopes_clock_check check (updated_at >= created_at)
);

create table public.notification_delivery_entries (
  id                bigint generated always as identity primary key,
  scope_id          bigint not null references public.notification_delivery_scopes (id) on delete cascade,
  event_id          text not null,
  kind              text not null check (kind in ('security', 'operational', 'education', 'engagement')),
  channel           text not null check (channel in ('in_app', 'push', 'web_push', 'email')),
  selected          boolean not null,
  decision_reason   text not null,
  status            text not null check (status in ('planned', 'skipped', 'delivered', 'failed')),
  failure_code      text,
  decided_at        timestamptz not null,
  outcome_at        timestamptz,
  expires_at        timestamptz not null,
  constraint notification_delivery_entries_identity_unique unique (scope_id, event_id, channel),
  constraint notification_delivery_entries_retention_check
    check (expires_at > decided_at and expires_at <= decided_at + interval '90 days'),
  constraint notification_delivery_entries_outcome_check check (
    (status = 'planned' and selected and outcome_at is null and failure_code is null)
    or (status = 'skipped' and not selected and outcome_at is null and failure_code is null)
    or (status = 'delivered' and selected and outcome_at is not null and failure_code is null)
    or (status = 'failed' and selected and outcome_at is not null and failure_code is not null)
  ),
  constraint notification_delivery_entries_clock_check
    check (outcome_at is null or outcome_at >= decided_at)
);

create index notification_delivery_entries_projection_idx
  on public.notification_delivery_entries (scope_id, event_id, status);
create index notification_delivery_entries_expiry_idx
  on public.notification_delivery_entries (expires_at);

create table public.notification_delivery_operations (
  id            bigint generated always as identity primary key,
  scope_id      bigint not null references public.notification_delivery_scopes (id) on delete cascade,
  operation_id  text not null,
  command_hash  text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  revision      bigint not null check (revision > 0),
  applied_at    timestamptz not null,
  expires_at    timestamptz not null,
  constraint notification_delivery_operations_identity_unique unique (scope_id, operation_id),
  constraint notification_delivery_operations_revision_unique unique (scope_id, revision),
  constraint notification_delivery_operations_retention_check
    check (expires_at > applied_at and expires_at <= applied_at + interval '90 days')
);

create index notification_delivery_operations_expiry_idx
  on public.notification_delivery_operations (expires_at);

-- Todas as tabelas ficam fail-closed. Não há policies de cliente neste draft.
alter table public.notification_inbox_scopes enable row level security;
alter table public.notification_inbox_scopes force row level security;
alter table public.notification_inbox_items enable row level security;
alter table public.notification_inbox_items force row level security;
alter table public.notification_inbox_operations enable row level security;
alter table public.notification_inbox_operations force row level security;
alter table public.push_device_registrations enable row level security;
alter table public.push_device_registrations force row level security;
alter table public.notification_delivery_scopes enable row level security;
alter table public.notification_delivery_scopes force row level security;
alter table public.notification_delivery_entries enable row level security;
alter table public.notification_delivery_entries force row level security;
alter table public.notification_delivery_operations enable row level security;
alter table public.notification_delivery_operations force row level security;

revoke all on table
  public.notification_inbox_scopes,
  public.notification_inbox_items,
  public.notification_inbox_operations,
  public.push_device_registrations,
  public.notification_delivery_scopes,
  public.notification_delivery_entries,
  public.notification_delivery_operations
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.notification_inbox_scopes,
  public.notification_inbox_items,
  public.notification_inbox_operations,
  public.push_device_registrations,
  public.notification_delivery_scopes,
  public.notification_delivery_entries,
  public.notification_delivery_operations
to service_role;

revoke all on sequence
  public.notification_inbox_scopes_id_seq,
  public.notification_inbox_items_id_seq,
  public.notification_inbox_operations_id_seq,
  public.push_device_registrations_id_seq,
  public.notification_delivery_scopes_id_seq,
  public.notification_delivery_entries_id_seq,
  public.notification_delivery_operations_id_seq
from public, anon, authenticated;

grant usage, select on sequence
  public.notification_inbox_scopes_id_seq,
  public.notification_inbox_items_id_seq,
  public.notification_inbox_operations_id_seq,
  public.push_device_registrations_id_seq,
  public.notification_delivery_scopes_id_seq,
  public.notification_delivery_entries_id_seq,
  public.notification_delivery_operations_id_seq
to service_role;

-- Purge limitado: conteúdo expira em no máximo 90 dias; devices terminais só
-- saem após 90 dias. Estados de escopo permanecem para CAS enquanto a conta
-- existir. A migration real deverá acoplar CAS + operation append + mutation
-- em RPCs específicas e testadas; acesso direto do cliente continuará negado.
create function public.purge_expired_notification_data(
  p_now timestamptz,
  p_batch_limit integer default 500
)
returns table (
  inbox_deleted integer,
  delivery_entries_deleted integer,
  delivery_operations_deleted integer,
  devices_deleted integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inbox integer := 0;
  v_entries integer := 0;
  v_operations integer := 0;
  v_devices integer := 0;
begin
  if p_now is null or p_now > now() + interval '5 minutes' then
    raise exception 'purge_clock_invalido';
  end if;
  if p_batch_limit is null or p_batch_limit < 1 or p_batch_limit > 1000 then
    raise exception 'purge_batch_invalido';
  end if;

  with candidates as (
    select i.id from public.notification_inbox_items as i
     where i.expires_at <= p_now
     order by i.expires_at, i.id
     limit p_batch_limit
     for update skip locked
  )
  delete from public.notification_inbox_items as i
   using candidates as c
   where i.id = c.id;
  get diagnostics v_inbox = row_count;

  with candidates as (
    select e.id from public.notification_delivery_entries as e
     where e.expires_at <= p_now
     order by e.expires_at, e.id
     limit p_batch_limit
     for update skip locked
  )
  delete from public.notification_delivery_entries as e
   using candidates as c
   where e.id = c.id;
  get diagnostics v_entries = row_count;

  with candidates as (
    select o.id from public.notification_delivery_operations as o
     where o.expires_at <= p_now
     order by o.expires_at, o.id
     limit p_batch_limit
     for update skip locked
  )
  delete from public.notification_delivery_operations as o
   using candidates as c
   where o.id = c.id;
  get diagnostics v_operations = row_count;

  with candidates as (
    select d.id from public.push_device_registrations as d
     where d.status in ('revoked', 'invalid')
       and d.updated_at <= p_now - interval '90 days'
     order by d.updated_at, d.id
     limit p_batch_limit
     for update skip locked
  )
  delete from public.push_device_registrations as d
   using candidates as c
   where d.id = c.id;
  get diagnostics v_devices = row_count;

  return query select v_inbox, v_entries, v_operations, v_devices;
end;
$$;

revoke execute on function public.purge_expired_notification_data(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_notification_data(timestamptz, integer)
  to service_role;

commit;

-- GATES ANTES DE PROMOVER:
-- 1. gerar migration com Supabase CLI e testes pgTAP de allow/deny;
-- 2. definir se inbox textual pode conter dado pessoal e sua base/retention;
-- 3. criar RPCs específicas que façam CAS + replay + mutation atomicamente;
-- 4. guardar token push cifrado em boundary separado; este schema só deduplica
--    por fingerprint HMAC e nunca pode ser usado para envio sozinho;
-- 5. validar múltiplos aparelhos, consentimento, revogação e token inválido;
-- 6. configurar VAPID/service worker somente em outra janela autorizada.
