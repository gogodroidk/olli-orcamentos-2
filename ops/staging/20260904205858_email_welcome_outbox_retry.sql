-- OLLI Orçamentos — persistência transacional do welcome por e-mail.
--
-- Decisões do rollout:
-- - tabelas em public porque o Worker usa a Data API, mas sem acesso de clientes;
-- - RLS habilitada e forçada, sem policies para anon/authenticated;
-- - RPC pública SECURITY INVOKER, executável somente por service_role;
-- - trigger privilegiado isolado em schema private e separado do sync de perfil;
-- - qualquer falha do welcome é fail-open para não bloquear cadastro/confirmação;
-- - PII do destinatário pode ser purgada após 30 dias em estado terminal;
-- - registros já anonimizados podem ser removidos após 1 ano pelo Worker;
-- - nenhuma rotina de purge é agendada por esta migration.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.email_welcome_events (
  id                bigint generated always as identity primary key,
  event_id          text not null,
  user_id           uuid not null references auth.users (id) on delete cascade,
  tenant_id         uuid references public.organizacoes (id) on delete set null,
  event_type        text not null default 'email.welcome.requested'
                    check (event_type = 'email.welcome.requested'),
  event_version     text not null default '2026-08-31.v1',
  template          text not null default 'boas_vindas'
                    check (template = 'boas_vindas'),
  template_version  text not null default 'boas_vindas.v1',
  purpose           text not null default 'account_onboarding'
                    check (purpose = 'account_onboarding'),
  recipient         text,
  confirmed_at      timestamptz not null,
  source            text not null default 'supabase.auth',
  idempotency_key   text not null,
  pii_purged_at     timestamptz,
  created_at        timestamptz not null default now(),
  constraint email_welcome_events_recipient_lifecycle_check check (
    (pii_purged_at is null and recipient is not null)
    or (pii_purged_at is not null and recipient is null)
  )
);

create unique index if not exists email_welcome_events_event_id_uidx
  on public.email_welcome_events (event_id);
create unique index if not exists email_welcome_events_idempotency_uidx
  on public.email_welcome_events (idempotency_key);
create index if not exists email_welcome_events_user_created_idx
  on public.email_welcome_events (user_id, created_at desc);

create table if not exists public.email_outbox (
  id                bigint generated always as identity primary key,
  event_id          text not null references public.email_welcome_events (event_id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  tenant_id         uuid references public.organizacoes (id) on delete set null,
  idempotency_key   text not null,
  template          text not null check (template = 'boas_vindas'),
  template_version  text not null check (template_version = 'boas_vindas.v1'),
  purpose           text not null check (purpose = 'account_onboarding'),
  recipient         text,
  attempts          integer not null default 0 check (attempts between 0 and 5),
  status            text not null default 'pending'
                    check (status in ('pending', 'sending', 'sent', 'failed', 'dead_letter')),
  next_attempt_at   timestamptz,
  provider_id       text,
  error_code        text,
  pii_purged_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint email_outbox_recipient_lifecycle_check check (
    (pii_purged_at is null and recipient is not null)
    or (pii_purged_at is not null and recipient is null)
  )
);

create unique index if not exists email_outbox_idempotency_uidx
  on public.email_outbox (idempotency_key);
create unique index if not exists email_outbox_event_uidx
  on public.email_outbox (event_id);
create index if not exists email_outbox_dispatch_idx
  on public.email_outbox (status, next_attempt_at, created_at);
create index if not exists email_outbox_user_created_idx
  on public.email_outbox (user_id, created_at desc);

alter table public.email_welcome_events enable row level security;
alter table public.email_welcome_events force row level security;
alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;

revoke all on table public.email_welcome_events from public, anon, authenticated;
revoke all on table public.email_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.email_welcome_events to service_role;
grant select, insert, update, delete on table public.email_outbox to service_role;
grant usage, select on sequence public.email_welcome_events_id_seq to service_role;
grant usage, select on sequence public.email_outbox_id_seq to service_role;

comment on table public.email_welcome_events is
  'Evento de welcome confirmado. PII mínima; purge após 30 dias em estado terminal.';
comment on table public.email_outbox is
  'Outbox transacional privada ao Worker. Nunca guardar HTML, texto completo, resposta bruta ou segredo.';

-- A RPC é invoker: service_role já possui bypassrls e é o único papel remoto
-- autorizado. O trigger interno também pode chamá-la como seu owner.
create or replace function public.enqueue_welcome_email(
  p_event_id         text,
  p_user_id          uuid,
  p_tenant_id        uuid,
  p_idempotency_key  text,
  p_recipient        text,
  p_confirmed_at     timestamptz,
  p_source           text default 'supabase.auth'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_inserted  boolean;
  v_outbox_inserted boolean;
  v_existing_event  record;
  v_existing_outbox record;
begin
  if p_event_id is null
     or p_event_id !~ '^[A-Za-z0-9._:-]{1,160}$'
     or p_user_id is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,240}$'
     or p_recipient is null
     or p_recipient !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     or pg_catalog.length(p_recipient) > 254
     or p_confirmed_at is null
     or p_confirmed_at > pg_catalog.now() + interval '5 minutes'
  then
    raise exception 'welcome_argumentos_invalidos';
  end if;

  if p_source is null or p_source !~ '^[A-Za-z0-9._:-]{1,80}$' then
    raise exception 'welcome_source_invalida';
  end if;

  if p_tenant_id is not null
     and not exists (
       select 1
       from public.organizacao_membros m
       where m.org_id = p_tenant_id
         and m.user_id = p_user_id
         and m.ativo
     )
  then
    raise exception 'welcome_tenant_contexto_invalido';
  end if;

  insert into public.email_welcome_events (
    event_id, user_id, tenant_id, recipient, confirmed_at, source, idempotency_key
  ) values (
    p_event_id,
    p_user_id,
    p_tenant_id,
    pg_catalog.lower(pg_catalog.btrim(p_recipient)),
    p_confirmed_at,
    p_source,
    p_idempotency_key
  ) on conflict (event_id) do nothing;
  v_event_inserted := found;

  if not v_event_inserted then
    select e.user_id, e.tenant_id, e.recipient, e.idempotency_key, e.pii_purged_at
      into v_existing_event
    from public.email_welcome_events e
    where e.event_id = p_event_id;
    if v_existing_event.user_id is distinct from p_user_id
       or v_existing_event.tenant_id is distinct from p_tenant_id
       or (
         v_existing_event.pii_purged_at is null
         and v_existing_event.recipient is distinct from pg_catalog.lower(pg_catalog.btrim(p_recipient))
       )
       or v_existing_event.idempotency_key is distinct from p_idempotency_key
    then
      raise exception 'welcome_event_replay_divergente';
    end if;
  end if;

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template,
    template_version, purpose, recipient, next_attempt_at
  ) values (
    p_event_id,
    p_user_id,
    p_tenant_id,
    p_idempotency_key,
    'boas_vindas',
    'boas_vindas.v1',
    'account_onboarding',
    pg_catalog.lower(pg_catalog.btrim(p_recipient)),
    pg_catalog.now()
  ) on conflict (idempotency_key) do nothing;
  v_outbox_inserted := found;

  if not v_outbox_inserted then
    select o.event_id, o.user_id, o.tenant_id, o.recipient, o.pii_purged_at
      into v_existing_outbox
    from public.email_outbox o
    where o.idempotency_key = p_idempotency_key;
    if v_existing_outbox.event_id is distinct from p_event_id
       or v_existing_outbox.user_id is distinct from p_user_id
       or v_existing_outbox.tenant_id is distinct from p_tenant_id
       or (
         v_existing_outbox.pii_purged_at is null
         and v_existing_outbox.recipient is distinct from pg_catalog.lower(pg_catalog.btrim(p_recipient))
       )
    then
      raise exception 'welcome_outbox_replay_divergente';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'eventId', p_event_id,
    'idempotencyKey', p_idempotency_key,
    'eventInserted', v_event_inserted,
    'outboxInserted', v_outbox_inserted,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.enqueue_welcome_email(text, uuid, uuid, text, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_welcome_email(text, uuid, uuid, text, text, timestamptz, text)
  to service_role;

-- Trigger separado do sync_profile_from_auth(): cobre confirmação posterior e
-- provedores que já inserem o usuário confirmado. Falhas nunca bloqueiam Auth.
create or replace function private.handle_auth_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed_at timestamptz;
  v_event_id     text;
  v_source       text;
begin
  if new.email is null or pg_catalog.btrim(new.email) = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.email_confirmed_at is null then
      return new;
    end if;
    v_source := 'supabase.auth.insert_confirmed';
  elsif tg_op = 'UPDATE' then
    if old.email_confirmed_at is not null or new.email_confirmed_at is null then
      return new;
    end if;
    v_source := 'supabase.auth.email_confirmed';
  else
    return new;
  end if;

  v_confirmed_at := new.email_confirmed_at;
  v_event_id := 'auth.email_confirmed:' || new.id::text || ':'
    || ((extract(epoch from v_confirmed_at) * 1000000)::bigint)::text;

  perform public.enqueue_welcome_email(
    v_event_id,
    new.id,
    null,
    v_event_id,
    new.email,
    v_confirmed_at,
    v_source
  );
  return new;
exception
  when others then
    -- Não inclui e-mail/user_id. O welcome é secundário e não pode impedir
    -- criação ou confirmação da conta; o SQLSTATE permite diagnóstico.
    raise warning 'olli_welcome_hook_failed sqlstate=%', sqlstate;
    return new;
end;
$$;

revoke all on function private.handle_auth_email_confirmed()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_welcome_insert on auth.users;

create trigger on_auth_user_welcome_insert
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function private.handle_auth_email_confirmed();

drop trigger if exists on_auth_user_welcome_confirmed on auth.users;

create trigger on_auth_user_welcome_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_auth_email_confirmed();

-- Retenção executada explicitamente pelo Worker. Sem cron nesta migration.
create or replace function public.purge_email_welcome_data(
  p_now timestamptz default pg_catalog.now()
)
returns table (pii_purged bigint, records_deleted bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pii_purged      bigint := 0;
  v_records_deleted bigint := 0;
begin
  if p_now is null or p_now > pg_catalog.now() + interval '5 minutes' then
    raise exception 'purge_reference_time_invalido';
  end if;

  with purged_outbox as (
    update public.email_outbox o
       set recipient = null,
           provider_id = null,
           pii_purged_at = p_now,
           updated_at = greatest(o.updated_at, p_now)
     where o.pii_purged_at is null
       and o.status in ('sent', 'dead_letter')
       and o.updated_at <= p_now - interval '30 days'
    returning o.event_id
  )
  update public.email_welcome_events e
     set recipient = null,
         pii_purged_at = p_now
   where e.pii_purged_at is null
     and exists (
       select 1 from purged_outbox p where p.event_id = e.event_id
     );
  get diagnostics v_pii_purged = row_count;

  delete from public.email_welcome_events e
   where e.pii_purged_at is not null
     and e.created_at <= p_now - interval '1 year';
  get diagnostics v_records_deleted = row_count;

  return query select v_pii_purged, v_records_deleted;
end;
$$;

revoke all on function public.purge_email_welcome_data(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_email_welcome_data(timestamptz)
  to service_role;

comment on function public.purge_email_welcome_data(timestamptz) is
  'Purge explícito: anonimiza PII terminal após 30 dias e remove registros anonimizados após 1 ano.';

-- Rollback operacional não destrutivo:
--   alter table auth.users disable trigger on_auth_user_welcome_insert;
--   alter table auth.users disable trigger on_auth_user_welcome_confirmed;
-- O Worker deve parar claim/dispatch. Tabelas ficam preservadas para auditoria
-- e qualquer DROP ou purge extraordinário exige uma migration separada.

