-- LOCAL_ONLY — NÃO APLICAR.
--
-- Rascunho revisável para a futura persistência de supressão do OLLI
-- Orçamentos. Este arquivo fica deliberadamente fora de supabase/migrations.
-- Ele não foi executado em banco local ou remoto e não autoriza rollout.
--
-- Boundary de identidade:
--   * recipient_fingerprint é HMAC-SHA-256 hexadecimal calculado pelo Worker;
--   * a chave HMAC é separada da service role e nunca entra no banco;
--   * fingerprint_key_id identifica a geração da chave, sem conter segredo;
--   * endereço de e-mail bruto não pertence a estas tabelas ou RPCs;
--   * rotação de chave exige migration/adapter separados e revisão explícita.

begin;

create table public.email_suppression_states (
  id                              bigint generated always as identity primary key,
  policy_version                  text not null,
  tenant_id                       uuid not null references public.organizacoes (id) on delete cascade,
  user_id                         uuid not null references auth.users (id) on delete cascade,
  recipient_fingerprint           text not null,
  fingerprint_key_id              text not null,
  revision                        bigint not null default 0,
  hard_bounce                     boolean not null default false,
  complaint                       boolean not null default false,
  unsubscribed                    boolean not null default false,
  educational_opt_in              boolean not null default false,
  consent_version                 text,
  soft_bounce_count               integer not null default 0,
  temporarily_suppressed_until    timestamptz,
  created_at                      timestamptz not null,
  updated_at                      timestamptz not null,
  constraint email_suppression_states_scope_unique unique (tenant_id, user_id),
  constraint email_suppression_states_policy_check
    check (policy_version = '2026-09-01.v1'),
  constraint email_suppression_states_fingerprint_check
    check (recipient_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint email_suppression_states_key_id_check
    check (
      length(fingerprint_key_id) between 1 and 80
      and fingerprint_key_id ~ '^[a-zA-Z0-9._:-]+$'
    ),
  constraint email_suppression_states_revision_check check (revision >= 0),
  constraint email_suppression_states_soft_bounce_check check (soft_bounce_count >= 0),
  constraint email_suppression_states_clock_check check (updated_at >= created_at),
  constraint email_suppression_states_consent_check
    check (not educational_opt_in or consent_version is not null)
);

create table public.email_suppression_events (
  id                  bigint generated always as identity primary key,
  state_id            bigint not null references public.email_suppression_states (id) on delete cascade,
  event_id            text not null,
  event_type          text not null,
  occurred_at         timestamptz not null,
  consent_version     text,
  event_hash          text not null,
  created_at          timestamptz not null default now(),
  constraint email_suppression_events_identity_unique unique (state_id, event_id),
  constraint email_suppression_events_id_check
    check (length(event_id) between 1 and 160 and event_id ~ '^[a-zA-Z0-9._:-]+$'),
  constraint email_suppression_events_type_check
    check (event_type in (
      'hard_bounce',
      'soft_bounce',
      'complaint',
      'unsubscribe',
      'resubscribe',
      'delivery_succeeded'
    )),
  constraint email_suppression_events_hash_check check (event_hash ~ '^[a-f0-9]{64}$'),
  constraint email_suppression_events_consent_check
    check (
      (event_type = 'resubscribe' and consent_version is not null)
      or (event_type <> 'resubscribe' and consent_version is null)
    )
);

-- O índice unique já cobre (tenant_id, user_id). user_id também precisa ser
-- indexado como primeira coluna para deleção em cascata de auth.users.
create index email_suppression_states_user_idx
  on public.email_suppression_states (user_id);

create index email_suppression_events_created_idx
  on public.email_suppression_events (created_at);

alter table public.email_suppression_states enable row level security;
alter table public.email_suppression_states force row level security;
alter table public.email_suppression_events enable row level security;
alter table public.email_suppression_events force row level security;

revoke all on table public.email_suppression_states from public;
revoke all on table public.email_suppression_states from anon, authenticated;
revoke all on table public.email_suppression_events from public;
revoke all on table public.email_suppression_events from anon, authenticated;
revoke all on sequence public.email_suppression_states_id_seq from public, anon, authenticated;
revoke all on sequence public.email_suppression_events_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.email_suppression_states to service_role;
grant select, insert, delete on table public.email_suppression_events to service_role;
grant usage, select on sequence public.email_suppression_states_id_seq to service_role;
grant usage, select on sequence public.email_suppression_events_id_seq to service_role;

-- Executada somente pelo service_role. A função mantém a transação curta:
-- nenhuma chamada externa pode ocorrer entre o lock e o commit.
create function public.record_email_suppression_event(
  p_policy_version text,
  p_tenant_id uuid,
  p_user_id uuid,
  p_recipient_fingerprint text,
  p_fingerprint_key_id text,
  p_expected_revision bigint,
  p_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_consent_version text,
  p_event_hash text
)
returns table (
  applied boolean,
  replayed boolean,
  state_id bigint,
  revision bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.email_suppression_states%rowtype;
  v_previous public.email_suppression_events%rowtype;
begin
  if p_policy_version <> '2026-09-01.v1' then
    raise exception 'policy_version_invalida';
  end if;
  if p_tenant_id is null or p_user_id is null then
    raise exception 'scope_incompleto';
  end if;
  if p_recipient_fingerprint is null
     or p_recipient_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'recipient_fingerprint_invalido';
  end if;
  if p_fingerprint_key_id is null
     or length(p_fingerprint_key_id) not between 1 and 80
     or p_fingerprint_key_id !~ '^[a-zA-Z0-9._:-]+$' then
    raise exception 'fingerprint_key_id_invalido';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'expected_revision_invalida';
  end if;
  if p_event_id is null
     or length(p_event_id) not between 1 and 160
     or p_event_id !~ '^[a-zA-Z0-9._:-]+$' then
    raise exception 'event_id_invalido';
  end if;
  if p_event_type not in (
    'hard_bounce',
    'soft_bounce',
    'complaint',
    'unsubscribe',
    'resubscribe',
    'delivery_succeeded'
  ) then
    raise exception 'event_type_invalido';
  end if;
  if p_occurred_at is null or p_occurred_at > now() then
    raise exception 'event_clock_invalido';
  end if;
  if p_event_hash is null or p_event_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'event_hash_invalido';
  end if;
  if p_event_type = 'resubscribe' then
    if p_consent_version is null
       or length(p_consent_version) not between 1 and 160
       or p_consent_version !~ '^[a-zA-Z0-9._:-]+$' then
      raise exception 'consent_version_obrigatoria';
    end if;
  elsif p_consent_version is not null then
    raise exception 'consent_version_nao_permitida';
  end if;

  -- Inserção concorrente é reduzida a uma identidade por tenant/usuário.
  insert into public.email_suppression_states (
    policy_version,
    tenant_id,
    user_id,
    recipient_fingerprint,
    fingerprint_key_id,
    revision,
    created_at,
    updated_at
  ) values (
    p_policy_version,
    p_tenant_id,
    p_user_id,
    p_recipient_fingerprint,
    p_fingerprint_key_id,
    0,
    p_occurred_at,
    p_occurred_at
  )
  on conflict (tenant_id, user_id) do nothing;

  select s.*
    into strict v_state
    from public.email_suppression_states as s
   where s.tenant_id = p_tenant_id
     and s.user_id = p_user_id
   for update;

  if v_state.policy_version <> p_policy_version
     or v_state.recipient_fingerprint <> p_recipient_fingerprint
     or v_state.fingerprint_key_id <> p_fingerprint_key_id then
    raise exception 'recipient_binding_divergente';
  end if;

  select e.*
    into v_previous
    from public.email_suppression_events as e
   where e.state_id = v_state.id
     and e.event_id = p_event_id;

  if found then
    if v_previous.event_hash <> p_event_hash then
      raise exception 'evento_replay_divergente';
    end if;
    return query select false, true, v_state.id, v_state.revision;
    return;
  end if;

  if v_state.revision <> p_expected_revision then
    raise exception 'revision_divergente';
  end if;
  if p_occurred_at < v_state.updated_at then
    raise exception 'clock_regressivo';
  end if;

  insert into public.email_suppression_events (
    state_id,
    event_id,
    event_type,
    occurred_at,
    consent_version,
    event_hash
  ) values (
    v_state.id,
    p_event_id,
    p_event_type,
    p_occurred_at,
    p_consent_version,
    p_event_hash
  );

  update public.email_suppression_states as s
     set revision = s.revision + 1,
         hard_bounce = case
           when p_event_type = 'hard_bounce' then true
           else s.hard_bounce
         end,
         complaint = case
           when p_event_type = 'complaint' then true
           else s.complaint
         end,
         unsubscribed = case
           when p_event_type in ('complaint', 'unsubscribe') then true
           when p_event_type = 'resubscribe' then false
           else s.unsubscribed
         end,
         educational_opt_in = case
           when p_event_type in ('complaint', 'unsubscribe') then false
           when p_event_type = 'resubscribe' then true
           else s.educational_opt_in
         end,
         consent_version = case
           when p_event_type = 'resubscribe' then p_consent_version
           else s.consent_version
         end,
         soft_bounce_count = case
           when p_event_type = 'soft_bounce' then s.soft_bounce_count + 1
           when p_event_type = 'delivery_succeeded' then 0
           else s.soft_bounce_count
         end,
         temporarily_suppressed_until = case
           when p_event_type = 'hard_bounce' then null
           when p_event_type = 'delivery_succeeded' then null
           when p_event_type = 'soft_bounce' and s.soft_bounce_count + 1 >= 3
             then p_occurred_at + interval '7 days'
           else s.temporarily_suppressed_until
         end,
         updated_at = p_occurred_at
   where s.id = v_state.id
     and s.revision = p_expected_revision
  returning s.* into strict v_state;

  return query select true, false, v_state.id, v_state.revision;
end;
$$;

revoke execute on function public.record_email_suppression_event(
  text, uuid, uuid, text, text, bigint, text, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.record_email_suppression_event(
  text, uuid, uuid, text, text, bigint, text, text, timestamptz, text, text
) to service_role;

-- Retenção: supressão ativa não expira automaticamente, pois apagar um hard
-- bounce/complaint reativaria envio sem nova evidência. A remoção ocorre em
-- cascade com conta/organização ou por esta RPC de escopo exato durante um
-- fluxo de exclusão aprovado. Não existe purge amplo por data.
create function public.purge_email_suppression_scope(
  p_tenant_id uuid,
  p_user_id uuid,
  p_recipient_fingerprint text,
  p_expected_revision bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if p_tenant_id is null
     or p_user_id is null
     or p_recipient_fingerprint !~ '^[a-f0-9]{64}$'
     or p_expected_revision is null
     or p_expected_revision < 0 then
    raise exception 'purge_scope_invalido';
  end if;

  delete from public.email_suppression_states as s
   where s.tenant_id = p_tenant_id
     and s.user_id = p_user_id
     and s.recipient_fingerprint = p_recipient_fingerprint
     and s.revision = p_expected_revision
  returning s.id into v_deleted;

  return v_deleted is not null;
end;
$$;

revoke execute on function public.purge_email_suppression_scope(
  uuid, uuid, text, bigint
) from public, anon, authenticated;
grant execute on function public.purge_email_suppression_scope(
  uuid, uuid, text, bigint
) to service_role;

commit;

-- Promoção futura, somente após decisão humana:
-- 1. gerar migration pela Supabase CLI, sem copiar este nome/timestamp;
-- 2. criar pgTAP para grants, RLS, CAS, replay e isolamento tenant/usuário;
-- 3. validar rotação de fingerprint e política de exclusão;
-- 4. integrar a decisão dentro do claim transacional, antes de attempts++;
-- 5. receber eventos apenas por webhook Resend com assinatura verificada;
-- 6. executar canário sintético com ROLLBACK antes de qualquer coorte real.
