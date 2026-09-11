-- OLLI Orçamentos — claim/settle atômicos do welcome e gate de dispatch.
--
-- Segurança operacional:
-- - confirmações normais recebem dispatch_scope='hold' e nunca são enviadas;
-- - a primeira publicação do Worker só pode pedir scope='simulator';
-- - claim usa FOR UPDATE SKIP LOCKED e um token de lease por tentativa;
-- - settle exige o mesmo token, impedindo Worker atrasado de sobrescrever retry;
-- - funções são SECURITY INVOKER e executáveis somente por service_role;
-- - nenhuma função retorna corpo de e-mail, segredo ou erro bruto do provider.

alter table public.email_outbox
  add column if not exists dispatch_scope text not null default 'hold',
  add column if not exists claim_token uuid,
  add column if not exists claimed_by text,
  add column if not exists lease_expires_at timestamptz;

alter table public.email_outbox
  add constraint email_outbox_dispatch_scope_check
  check (dispatch_scope in ('hold', 'simulator', 'production'));

-- NOT VALID evita que uma eventual linha legada em sending bloqueie a
-- migration; novas linhas e updates já passam a obedecer o ciclo completo.
alter table public.email_outbox
  add constraint email_outbox_claim_lifecycle_check
  check (
    (
      status = 'sending'
      and claim_token is not null
      and claimed_by is not null
      and lease_expires_at is not null
    )
    or (
      status <> 'sending'
      and claim_token is null
      and claimed_by is null
      and lease_expires_at is null
    )
  ) not valid;

alter table public.email_outbox
  add constraint email_outbox_dispatch_state_check
  check (
    case status
      when 'pending' then
        attempts = 0 and next_attempt_at is not null
        and provider_id is null and error_code is null
      when 'sending' then
        attempts between 1 and 5 and next_attempt_at is not null
        and lease_expires_at > updated_at
        and provider_id is null and error_code is null
      when 'failed' then
        attempts between 1 and 4 and next_attempt_at is not null
        and provider_id is null and error_code is not null
      when 'sent' then
        attempts between 1 and 5 and next_attempt_at is null
        and provider_id is not null and error_code is null
      when 'dead_letter' then
        attempts between 1 and 5 and next_attempt_at is null
        and provider_id is null and error_code is not null
      else false
    end
  ) not valid;

alter table public.email_outbox
  add constraint email_outbox_error_code_check
  check (
    error_code is null or error_code in (
      'provider_timeout',
      'provider_rate_limited',
      'provider_unavailable',
      'provider_auth_rejected',
      'provider_idempotency_conflict',
      'provider_idempotency_in_progress',
      'provider_resource_locked',
      'provider_conflict_unknown',
      'provider_request_rejected',
      'provider_response_invalid',
      'transport_timeout',
      'transport_error',
      'consumer_contract_error',
      'simulator_recipient_rejected',
      'lease_expired_after_max_attempts'
    )
  ) not valid;

alter table public.email_outbox
  add constraint email_outbox_provider_id_check
  check (
    provider_id is null or (
      pg_catalog.length(provider_id) between 1 and 160
      and provider_id ~ '^[A-Za-z0-9._:-]+$'
    )
  ) not valid;

alter table public.email_outbox
  add constraint email_outbox_pii_terminal_check
  check (pii_purged_at is null or status in ('sent', 'dead_letter'))
  not valid;

-- Uma conta recebe no máximo uma mensagem por versão de template. O trigger
-- temporal continua idempotente mesmo se email_confirmed_at for manipulado e
-- voltar de NULL para um valor uma segunda vez.
create unique index if not exists email_welcome_events_user_template_uidx
  on public.email_welcome_events (user_id, template_version);

create index if not exists email_outbox_claim_ready_idx
  on public.email_outbox (
    dispatch_scope,
    status,
    next_attempt_at,
    lease_expires_at,
    created_at
  )
  where recipient is not null
    and status in ('pending', 'failed', 'sending');

create or replace function public.claim_email_welcome_outbox(
  p_worker_id text,
  p_dispatch_scope text default 'simulator',
  p_limit integer default 1,
  p_lease_seconds integer default 120,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  event_id text,
  idempotency_key text,
  template text,
  template_version text,
  purpose text,
  recipient text,
  attempts integer,
  status text,
  next_attempt_at timestamptz,
  provider_id text,
  error_code text,
  created_at timestamptz,
  updated_at timestamptz,
  claim_token uuid,
  lease_expires_at timestamptz,
  dispatch_scope text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_worker_id is null
     or p_worker_id !~ '^[A-Za-z0-9._:-]{1,120}$'
     or p_dispatch_scope not in ('simulator', 'production')
     or p_limit < 1
     or p_limit > 10
     or p_lease_seconds < 30
     or p_lease_seconds > 300
     or p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
  then
    raise exception 'outbox_claim_argumentos_invalidos';
  end if;

  -- A quinta tentativa abandonada tem resultado externo incerto e não pode
  -- ficar presa em sending para sempre.
  update public.email_outbox o
     set status = 'dead_letter',
         next_attempt_at = null,
         provider_id = null,
         error_code = 'lease_expired_after_max_attempts',
         claim_token = null,
         claimed_by = null,
         lease_expires_at = null,
         updated_at = p_now
   where o.dispatch_scope = p_dispatch_scope
     and o.status = 'sending'
     and o.attempts = 5
     and o.lease_expires_at is not null
     and o.lease_expires_at <= p_now;

  return query
  with candidates as (
    select o.id
    from public.email_outbox o
    where o.dispatch_scope = p_dispatch_scope
      and o.recipient is not null
      and o.pii_purged_at is null
      and o.attempts < 5
      and (
        (
          o.status in ('pending', 'failed')
          and (o.next_attempt_at is null or o.next_attempt_at <= p_now)
        )
        or (
          o.status = 'sending'
          and o.lease_expires_at is not null
          and o.lease_expires_at <= p_now
        )
      )
    order by o.created_at, o.id
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.email_outbox o
       set status = 'sending',
           attempts = o.attempts + 1,
           next_attempt_at = p_now,
           provider_id = null,
           error_code = null,
           claim_token = pg_catalog.gen_random_uuid(),
           claimed_by = p_worker_id,
           lease_expires_at = p_now + pg_catalog.make_interval(secs => p_lease_seconds),
           updated_at = p_now
      from candidates c
     where o.id = c.id
    returning o.*
  )
  select
    c.event_id,
    c.idempotency_key,
    c.template,
    c.template_version,
    c.purpose,
    c.recipient,
    c.attempts,
    c.status,
    c.next_attempt_at,
    c.provider_id,
    c.error_code,
    c.created_at,
    c.updated_at,
    c.claim_token,
    c.lease_expires_at,
    c.dispatch_scope
  from claimed c
  order by c.created_at, c.id;
end;
$$;

revoke all on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz)
  to service_role;

create or replace function public.settle_email_welcome_outbox(
  p_idempotency_key text,
  p_claim_token uuid,
  p_attempts integer,
  p_status text,
  p_provider_id text default null,
  p_error_code text default null,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  applied boolean,
  status text,
  attempts integer,
  next_attempt_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempts integer;
  v_expected_status text;
  v_next_attempt_at timestamptz;
  v_retryable boolean;
begin
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,240}$'
     or p_claim_token is null
     or p_attempts < 1
     or p_attempts > 5
     or p_status not in ('sent', 'failed', 'dead_letter')
     or p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
  then
    raise exception 'outbox_settle_argumentos_invalidos';
  end if;

  select o.attempts
    into v_attempts
  from public.email_outbox o
  where o.idempotency_key = p_idempotency_key
    and o.status = 'sending'
    and o.claim_token = p_claim_token
    and o.attempts = p_attempts
  for update;

  if not found then
    raise exception 'outbox_claim_stale';
  end if;

  if p_status = 'sent' then
    if p_provider_id is null
       or p_provider_id !~ '^[A-Za-z0-9._:-]{1,160}$'
       or p_error_code is not null
    then
      raise exception 'outbox_settle_sucesso_invalido';
    end if;
    v_expected_status := 'sent';
    v_next_attempt_at := null;
  else
    if p_provider_id is not null
       or p_error_code is null
       or p_error_code !~ '^[A-Za-z0-9._:-]{1,120}$'
    then
      raise exception 'outbox_settle_falha_invalida';
    end if;

    v_retryable := p_error_code in (
      'provider_timeout',
      'provider_rate_limited',
      'provider_unavailable',
      'provider_idempotency_in_progress',
      'provider_resource_locked',
      'provider_conflict_unknown',
      'provider_response_invalid',
      'transport_timeout',
      'transport_error'
    );
    v_expected_status := case
      when v_retryable and v_attempts < 5 then 'failed'
      else 'dead_letter'
    end;
    if p_status is distinct from v_expected_status then
      raise exception 'outbox_settle_status_divergente';
    end if;
    v_next_attempt_at := case
      when v_expected_status = 'dead_letter' then null
      when v_attempts = 1 then p_now + interval '1 minute'
      when v_attempts = 2 then p_now + interval '5 minutes'
      when v_attempts = 3 then p_now + interval '30 minutes'
      when v_attempts = 4 then p_now + interval '2 hours'
      else null
    end;
  end if;

  return query
  update public.email_outbox o
     set status = p_status,
         next_attempt_at = v_next_attempt_at,
         provider_id = p_provider_id,
         error_code = p_error_code,
         claim_token = null,
         claimed_by = null,
         lease_expires_at = null,
         updated_at = p_now
   where o.idempotency_key = p_idempotency_key
     and o.status = 'sending'
     and o.claim_token = p_claim_token
     and o.attempts = p_attempts
  returning true, o.status, o.attempts, o.next_attempt_at, o.updated_at;

  if not found then
    raise exception 'outbox_claim_stale';
  end if;
end;
$$;

revoke all on function public.settle_email_welcome_outbox(text, uuid, integer, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_email_welcome_outbox(text, uuid, integer, text, text, text, timestamptz)
  to service_role;

comment on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz) is
  'Reserva atômica da outbox com SKIP LOCKED, token e lease; somente service_role.';
comment on function public.settle_email_welcome_outbox(text, uuid, integer, text, text, text, timestamptz) is
  'Liquida uma tentativa somente com o token de claim atual; somente service_role.';

-- Rollback operacional não destrutivo:
-- 1. definir WELCOME_DISPATCH_MODE=off e remover/pausar o Cron Trigger;
-- 2. deixar dispatch_scope='hold' nas confirmações normais;
-- 3. claims em sending voltam a ser recuperáveis quando o lease expirar;
-- 4. DROP das funções/colunas exige migration e autorização separadas.
