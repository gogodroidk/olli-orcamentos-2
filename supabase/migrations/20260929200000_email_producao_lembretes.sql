-- OLLI Orçamentos — e-mail em PRODUÇÃO + lembretes por e-mail (ativação e assinatura).
--
-- Autorizado pelo dono em 29/09/2026 ("ligar o e-mail real e criar os lembretes").
--
-- O que muda, em ordem:
--   1. a outbox passa a aceitar três modelos fechados (boas-vindas, lembrete de
--      ativação, lembrete de assinatura), com parâmetros mínimos em
--      `template_dados` (nunca HTML, texto, destinatário ou segredo);
--   2. as 38 boas-vindas antigas presas em `hold` são DESCARTADAS sem envio
--      (dead_letter + error_code 'descartado_antes_do_envio', attempts = 0);
--   3. o escopo de dispatch de cada linha NOVA vem de `private.email_dispatch_config`
--      (boas_vindas / lembretes). Esta migration grava 'production' nos dois — é o
--      "ligar". Para desligar sem deploy: `update private.email_dispatch_config set
--      dispatch_scope = 'hold'` (linhas novas voltam a nascer presas);
--   4. supressão por conta (`public.email_supressoes`): descadastro pelo link do
--      e-mail, hard bounce e reclamação vindos do webhook da Resend. Suprimir
--      cancela na hora os lembretes ainda não enviados;
--   5. RPCs só para service_role: listar candidatos, enfileirar lembrete (com
--      idempotência, tetos e trava por conta) e registrar supressão;
--   6. claim passa a devolver `user_id` e `template_dados` (o consumer precisa
--      deles para renderizar o lembrete e assinar o link de descadastro).
--
-- Segundo portão, fora do banco: o Worker só reivindica o escopo que o
-- WELCOME_DISPATCH_MODE dele pede. Aplicar esta migration com o Worker antigo
-- (mode=simulator) não envia nada: as linhas novas nascem 'production' e o
-- simulador só reivindica 'simulator'.

-- ─── 1. Catálogo fechado de modelos + parâmetros mínimos ────────────────────

alter table public.email_outbox
  add column if not exists template_dados jsonb;

alter table public.email_outbox drop constraint if exists email_outbox_template_check;
alter table public.email_outbox drop constraint if exists email_outbox_template_version_check;
alter table public.email_outbox drop constraint if exists email_outbox_purpose_check;

alter table public.email_outbox
  add constraint email_outbox_template_catalogo_check
  check (
    (template, template_version, purpose) in (
      ('boas_vindas', 'boas_vindas.v1', 'account_onboarding'),
      ('lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder'),
      ('lembrete_assinatura', 'lembrete_assinatura.v1', 'billing_reminder')
    )
  );

-- Boas-vindas não têm parâmetros; lembrete sempre tem, pequeno e em objeto.
alter table public.email_outbox
  add constraint email_outbox_template_dados_check
  check (
    (template = 'boas_vindas' and template_dados is null)
    or (
      template <> 'boas_vindas'
      and template_dados is not null
      and pg_catalog.jsonb_typeof(template_dados) = 'object'
      and pg_catalog.pg_column_size(template_dados) <= 1024
    )
  );

-- Lembretes não têm linha em email_welcome_events (que só aceita o evento de
-- boas-vindas). A FK sai; enqueue_welcome_email continua gravando evento e item
-- na mesma transação, e o purge abaixo passa a limpar a outbox por conta própria.
alter table public.email_outbox drop constraint if exists email_outbox_event_id_fkey;

-- ─── 2. Descarte sem envio: dead_letter com attempts = 0 ────────────────────

alter table public.email_outbox drop constraint if exists email_outbox_error_code_check;
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
      'lease_expired_after_max_attempts',
      'descartado_antes_do_envio',
      'suprimido_antes_do_envio'
    )
  ) not valid;

alter table public.email_outbox drop constraint if exists email_outbox_dispatch_state_check;
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
        (
          attempts between 1 and 5
          or (
            attempts = 0
            and error_code in ('descartado_antes_do_envio', 'suprimido_antes_do_envio')
          )
        )
        and next_attempt_at is null
        and provider_id is null and error_code is not null
      else false
    end
  ) not valid;

-- As boas-vindas presas desde 04/09 (38 em 29/09) nunca saíram do banco. Mandar
-- agora um "bem-vindo" de semanas atrás seria errado: ficam descartadas, com
-- motivo, e entram no purge de PII normal (30 dias em estado terminal).
update public.email_outbox o
   set status = 'dead_letter',
       error_code = 'descartado_antes_do_envio',
       next_attempt_at = null,
       updated_at = pg_catalog.now()
 where o.status = 'pending'
   and o.dispatch_scope = 'hold'
   and o.attempts = 0
   and o.template = 'boas_vindas';

-- ─── 3. Escopo de dispatch das linhas NOVAS vem da config ───────────────────

create table if not exists private.email_dispatch_config (
  canal          text primary key check (canal in ('boas_vindas', 'lembretes')),
  dispatch_scope text not null check (dispatch_scope in ('hold', 'simulator', 'production')),
  atualizado_em  timestamptz not null default pg_catalog.now()
);

revoke all on table private.email_dispatch_config from public, anon, authenticated;
grant select on table private.email_dispatch_config to service_role;

insert into private.email_dispatch_config (canal, dispatch_scope)
values ('boas_vindas', 'production'), ('lembretes', 'production')
on conflict (canal) do update
  set dispatch_scope = excluded.dispatch_scope,
      atualizado_em = pg_catalog.now();

comment on table private.email_dispatch_config is
  'Escopo com que cada linha NOVA da email_outbox nasce. hold = presa; production = enviável pelo Worker em mode=production.';

-- Só toca INSERT: linhas antigas nunca mudam de escopo por aqui.
create or replace function private.email_outbox_scope_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text;
begin
  if new.dispatch_scope is distinct from 'hold' then
    return new;
  end if;
  select c.dispatch_scope
    into v_scope
  from private.email_dispatch_config c
  where c.canal = case when new.template = 'boas_vindas' then 'boas_vindas' else 'lembretes' end;
  new.dispatch_scope := coalesce(v_scope, 'hold');
  return new;
end;
$$;

revoke all on function private.email_outbox_scope_inicial()
  from public, anon, authenticated, service_role;

drop trigger if exists email_outbox_scope_inicial on public.email_outbox;
create trigger email_outbox_scope_inicial
  before insert on public.email_outbox
  for each row
  execute function private.email_outbox_scope_inicial();

-- ─── 4. Supressão por conta ─────────────────────────────────────────────────

create table if not exists public.email_supressoes (
  user_id   uuid not null references auth.users (id) on delete cascade,
  motivo    text not null check (motivo in ('descadastro', 'hard_bounce', 'complaint')),
  origem    text not null check (origem in ('link_email', 'one_click', 'resend_webhook')),
  criado_em timestamptz not null default pg_catalog.now(),
  primary key (user_id, motivo)
);

alter table public.email_supressoes enable row level security;
alter table public.email_supressoes force row level security;
revoke all on table public.email_supressoes from public, anon, authenticated;
grant select, insert, update, delete on table public.email_supressoes to service_role;

comment on table public.email_supressoes is
  'Quem não recebe mais e-mail. descadastro = sem lembretes; hard_bounce/complaint = sem nenhum e-mail. Só user_id, sem endereço.';

create index if not exists email_outbox_user_purpose_created_idx
  on public.email_outbox (user_id, purpose, created_at desc);
create index if not exists email_outbox_provider_idx
  on public.email_outbox (provider_id)
  where provider_id is not null;

create or replace function public.registrar_supressao_email(
  p_user_id uuid,
  p_motivo  text,
  p_origem  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelados bigint := 0;
begin
  if p_user_id is null
     or p_motivo is null or p_motivo not in ('descadastro', 'hard_bounce', 'complaint')
     or p_origem is null or p_origem not in ('link_email', 'one_click', 'resend_webhook')
  then
    raise exception 'supressao_argumentos_invalidos';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return pg_catalog.jsonb_build_object('registrado', false, 'cancelados', 0);
  end if;

  insert into public.email_supressoes (user_id, motivo, origem)
  values (p_user_id, p_motivo, p_origem)
  on conflict (user_id, motivo) do nothing;

  -- Descadastro cancela só lembretes; bounce/reclamação cancelam tudo.
  update public.email_outbox o
     set status = 'dead_letter',
         error_code = 'suprimido_antes_do_envio',
         next_attempt_at = null,
         updated_at = pg_catalog.now()
   where o.user_id = p_user_id
     and o.status in ('pending', 'failed')
     and (p_motivo <> 'descadastro' or o.template <> 'boas_vindas');
  get diagnostics v_cancelados = row_count;

  return pg_catalog.jsonb_build_object('registrado', true, 'cancelados', v_cancelados);
end;
$$;

revoke all on function public.registrar_supressao_email(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_supressao_email(uuid, text, text)
  to service_role;

-- O webhook da Resend só conhece o id do e-mail; a conta sai da própria outbox.
create or replace function public.registrar_supressao_email_por_provider(
  p_provider_id text,
  p_motivo      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_provider_id is null
     or p_provider_id !~ '^[A-Za-z0-9._:-]{1,160}$'
     or p_motivo is null or p_motivo not in ('hard_bounce', 'complaint')
  then
    raise exception 'supressao_argumentos_invalidos';
  end if;

  select o.user_id
    into v_user_id
  from public.email_outbox o
  where o.provider_id = p_provider_id
  order by o.id
  limit 1;

  if v_user_id is null then
    return pg_catalog.jsonb_build_object('registrado', false, 'cancelados', 0);
  end if;

  return public.registrar_supressao_email(v_user_id, p_motivo, 'resend_webhook');
end;
$$;

revoke all on function public.registrar_supressao_email_por_provider(text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_supressao_email_por_provider(text, text)
  to service_role;

-- ─── 5a. Candidatos a lembrete (a decisão fina é do Worker, em JS puro) ─────
--
-- Pré-filtro barato e conservador. Devolve só dado de estado (sem e-mail, sem
-- nome): o destinatário é lido de auth.users dentro de enqueue_lembrete_email.
-- O plano efetivo usa a MESMA função do app (plano_comercial_efetivo) e a oferta
-- repete meu_estado_oferta_comercial para o tenant da conta.

create or replace function public.listar_candidatos_lembrete_email(
  p_now               timestamptz default pg_catalog.now(),
  p_ativacao_max_dias integer default 30,
  p_limit             integer default 50
)
returns table (candidato jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_periodo date;
begin
  if p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 day'
     or p_ativacao_max_dias is null or p_ativacao_max_dias < 7 or p_ativacao_max_dias > 60
     or p_limit is null or p_limit < 1 or p_limit > 200
  then
    raise exception 'candidatos_argumentos_invalidos';
  end if;

  v_periodo := pg_catalog.date_trunc('month', pg_catalog.timezone('UTC', p_now))::date;

  return query
  with usuarios as (
    select u.id as user_id, u.email_confirmed_at
    from auth.users u
    where u.email is not null
      and pg_catalog.btrim(u.email) <> ''
      and u.email_confirmed_at is not null
      and u.email_confirmed_at <= p_now
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= p_now)
      and coalesce(u.is_anonymous, false) = false
      and not exists (select 1 from public.email_supressoes s where s.user_id = u.id)
  ), base as (
    select
      us.user_id,
      us.email_confirmed_at,
      (
        select pg_catalog.count(*)
        from public.orcamentos o
        where (o.user_id = us.user_id or o.criado_por = us.user_id)
          and o.excluido_em is null
      ) as orcamentos,
      (select pg_catalog.count(*) from public.organizacoes o where o.owner_user_id = us.user_id) as orgs_dono,
      (
        select pg_catalog.count(*)
        from public.organizacao_membros m
        where m.user_id = us.user_id and m.ativo
      ) as membro_ativo
    from usuarios us
  ), contexto as (
    -- Mesmo desenho de contexto_comercial_atual(): dono de 1 org = tenant da org;
    -- sem org e sem equipe = conta solo (tenant = a própria conta); membro de
    -- equipe alheia ou ambíguo = sem tenant próprio (não recebe cobrança).
    select
      b.*,
      case
        when b.orgs_dono = 1 then (
          select o.id from public.organizacoes o where o.owner_user_id = b.user_id limit 1
        )
        when b.orgs_dono = 0 and b.membro_ativo = 0 then b.user_id
        else null
      end as tenant_id
    from base b
  ), enriquecido as (
    select
      c.*,
      a.plano as a_plano,
      a.status as a_status,
      a.current_period_end as a_period_end,
      a.admin_plano_override as a_override,
      a.admin_override_ativo as a_override_ativo,
      a.admin_override_ate as a_override_ate,
      (a.user_id is not null) as tem_assinatura,
      (
        coalesce(pg_catalog.btrim(a.stripe_subscription_id), '') <> ''
        or coalesce(pg_catalog.btrim(a.mp_preapproval_id), '') <> ''
      ) as recorrente,
      (
        select pg_catalog.count(*)
        from public.orcamento_envios_gratis e
        where c.tenant_id is not null
          and e.tenant_id = c.tenant_id
          and e.periodo = v_periodo
          and (e.estado = 'confirmado' or e.reserva_expira_em > p_now)
      ) as envios_usados
    from contexto c
    left join public.assinaturas a on a.user_id = c.user_id
  ), filtrado as (
    select e.*
    from enriquecido e
    where
      -- Ativação: conta solo/dona, zero orçamento, confirmada entre 3 e N dias.
      (
        e.orcamentos = 0
        and not (e.orgs_dono = 0 and e.membro_ativo > 0)
        and e.email_confirmed_at >= p_now - pg_catalog.make_interval(days => p_ativacao_max_dias)
        and e.email_confirmed_at <= p_now - interval '72 hours'
        and (
          select pg_catalog.count(*)
          from public.email_outbox o
          where o.user_id = e.user_id and o.purpose = 'activation_reminder'
        ) < 2
      )
      or
      -- Assinatura: dono do tenant, já tem orçamento, e perto de cota ou vencimento.
      (
        e.orcamentos >= 1
        and e.tenant_id is not null
        and (
          e.envios_usados >= 3
          or (
            e.tem_assinatura
            and e.a_period_end is not null
            and e.a_period_end between p_now - interval '4 days' and p_now + interval '4 days'
          )
        )
      )
  )
  select pg_catalog.jsonb_build_object(
    'userId', f.user_id,
    'confirmadoEm', f.email_confirmed_at,
    'orcamentos', least(f.orcamentos, 1000),
    'membroDeEquipe', (f.orgs_dono = 0 and f.membro_ativo > 0),
    'donoDoTenant', (f.tenant_id is not null),
    'assinatura', case when f.tem_assinatura then pg_catalog.jsonb_build_object(
      'plano', f.a_plano,
      'status', f.a_status,
      'current_period_end', f.a_period_end,
      'admin_plano_override', f.a_override,
      'admin_override_ativo', f.a_override_ativo,
      'admin_override_ate', f.a_override_ate,
      'recorrente', f.recorrente
    ) else null end,
    'oferta', case when f.tenant_id is null then null else (
      select pg_catalog.jsonb_build_object(
        'plano_efetivo', pl.plano,
        'limite_envios', case when pl.plano = 'gratis' then 5 else null end,
        'envios_usados', f.envios_usados,
        'envios_restantes', case when pl.plano = 'gratis' then greatest(0, 5 - f.envios_usados) else null end,
        'trial_estado', case
          when t.estado = 'active' and t.termina_em <= p_now then 'ended'
          else coalesce(t.estado, 'unstarted')
        end,
        'trial_termina_em', t.termina_em,
        'trial_dias', 14
      )
      from (select public.plano_comercial_efetivo(f.user_id, f.tenant_id, p_now) as plano) pl
      left join public.trials_comerciais t on t.tenant_id = f.tenant_id
    ) end,
    'historico', pg_catalog.jsonb_build_object(
      'ativacao', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'chave', o.idempotency_key,
            'janela', o.template_dados ->> 'janela',
            'em', o.created_at
          ) order by o.created_at, o.id
        )
        from public.email_outbox o
        where o.user_id = f.user_id and o.purpose = 'activation_reminder'
      ), '[]'::jsonb),
      'cobranca', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'chave', o.idempotency_key,
            'sequencia', o.template_dados ->> 'sequencia',
            'em', o.created_at
          ) order by o.created_at, o.id
        )
        from public.email_outbox o
        where o.user_id = f.user_id
          and o.purpose = 'billing_reminder'
          and o.created_at > p_now - interval '7 days'
      ), '[]'::jsonb)
    )
  )
  from filtrado f
  order by f.email_confirmed_at, f.user_id
  limit p_limit;
end;
$$;

revoke all on function public.listar_candidatos_lembrete_email(timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.listar_candidatos_lembrete_email(timestamptz, integer, integer)
  to service_role;

-- ─── 5b. Enfileirar um lembrete (tetos conferidos de novo, sob trava) ───────
--
-- O Worker já decidiu com a regra pura; o banco reconfere o que não pode falhar
-- nem com dois Workers em paralelo: idempotência, supressão, conta sem
-- orçamento, 2 e-mails de ativação no total (48h entre eles), 1 e-mail de
-- cobrança por semana (a sequência de renovação D-3/D0/D+1 de UM vencimento
-- conta como uma só) e um teto diário global.

create or replace function public.enqueue_lembrete_email(
  p_user_id          uuid,
  p_template         text,
  p_template_version text,
  p_purpose          text,
  p_idempotency_key  text,
  p_template_dados   jsonb,
  p_teto_diario      integer default 40,
  p_now              timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email      text;
  v_orcamentos bigint;
  v_sequencia  text;
  v_prefixo    text;
begin
  if p_user_id is null
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,240}$'
     or p_template_dados is null
     or pg_catalog.jsonb_typeof(p_template_dados) <> 'object'
     or pg_catalog.pg_column_size(p_template_dados) > 1024
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 500
     or p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'lembrete_argumentos_invalidos';
  end if;

  if (p_template, p_template_version, p_purpose) = ('lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder') then
    v_prefixo := 'onboarding:' || p_user_id::text || ':';
  elsif (p_template, p_template_version, p_purpose) = ('lembrete_assinatura', 'lembrete_assinatura.v1', 'billing_reminder') then
    v_prefixo := 'lembrete:assinatura:' || p_user_id::text || ':';
  else
    raise exception 'lembrete_template_invalido';
  end if;

  -- A chave carrega a conta: não dá para gravar um lembrete de A com a chave de B.
  if pg_catalog.left(p_idempotency_key, pg_catalog.length(v_prefixo)) <> v_prefixo then
    raise exception 'lembrete_chave_divergente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('olli.email_lembrete:' || p_user_id::text, 0)
  );

  if exists (select 1 from public.email_outbox o where o.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = p_user_id
    and u.email is not null
    and pg_catalog.btrim(u.email) <> ''
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= p_now);

  if v_email is null
     or v_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     or pg_catalog.length(v_email) > 254
  then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;

  if exists (select 1 from public.email_supressoes s where s.user_id = p_user_id) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'suprimido');
  end if;

  select pg_catalog.count(*)
    into v_orcamentos
  from public.orcamentos o
  where (o.user_id = p_user_id or o.criado_por = p_user_id)
    and o.excluido_em is null;

  if p_purpose = 'activation_reminder' then
    if v_orcamentos > 0 then
      return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'ja_tem_orcamento');
    end if;
    if (
      select pg_catalog.count(*) from public.email_outbox o
      where o.user_id = p_user_id and o.purpose = 'activation_reminder'
    ) >= 2 then
      return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_ativacao');
    end if;
    if exists (
      select 1 from public.email_outbox o
      where o.user_id = p_user_id
        and o.purpose = 'activation_reminder'
        and o.created_at > p_now - interval '48 hours'
    ) then
      return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'intervalo_minimo');
    end if;
  else
    -- Conta nova sem orçamento nunca recebe cobrança.
    if v_orcamentos < 1 then
      return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_sem_orcamento');
    end if;
    v_sequencia := p_template_dados ->> 'sequencia';
    if exists (
      select 1 from public.email_outbox o
      where o.user_id = p_user_id
        and o.purpose = 'billing_reminder'
        and o.created_at > p_now - interval '7 days'
        and (v_sequencia is null or (o.template_dados ->> 'sequencia') is distinct from v_sequencia)
    ) then
      return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'limite_semanal');
    end if;
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.purpose in ('activation_reminder', 'billing_reminder')
      and o.created_at > p_now - interval '24 hours'
  ) >= p_teto_diario then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_diario');
  end if;

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template, template_version,
    purpose, recipient, next_attempt_at, template_dados
  ) values (
    p_idempotency_key,
    p_user_id,
    null,
    p_idempotency_key,
    p_template,
    p_template_version,
    p_purpose,
    pg_catalog.lower(pg_catalog.btrim(v_email)),
    p_now,
    p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$$;

revoke all on function public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz)
  to service_role;

-- ─── 6. Claim devolve também user_id e template_dados ───────────────────────
-- O tipo de retorno muda, então é DROP + CREATE (mesma lógica de 20260904212747).
-- Worker antigo continua funcionando: ele ignora colunas que não lê.

drop function if exists public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz);

create function public.claim_email_welcome_outbox(
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
  dispatch_scope text,
  user_id uuid,
  template_dados jsonb
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
    c.dispatch_scope,
    c.user_id,
    c.template_dados
  from claimed c
  order by c.created_at, c.id;
end;
$$;

revoke all on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz)
  to service_role;

comment on function public.claim_email_welcome_outbox(text, text, integer, integer, timestamptz) is
  'Reserva atômica da outbox (boas-vindas e lembretes) com SKIP LOCKED, token e lease; somente service_role.';

-- ─── 7. Purge também limpa a outbox sem evento (lembretes) ──────────────────

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
  v_outbox_deleted  bigint := 0;
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

  -- Sem a FK, a outbox não cai mais em cascata com o evento: limpa por idade.
  delete from public.email_outbox o
   where o.pii_purged_at is not null
     and o.created_at <= p_now - interval '1 year';
  get diagnostics v_outbox_deleted = row_count;

  return query select v_pii_purged, v_records_deleted + v_outbox_deleted;
end;
$$;

revoke all on function public.purge_email_welcome_data(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_email_welcome_data(timestamptz)
  to service_role;

-- Rollback operacional (sem DROP):
--   update private.email_dispatch_config set dispatch_scope = 'hold';   -- linhas novas presas
--   update public.email_outbox set status = 'dead_letter', error_code = 'descartado_antes_do_envio',
--          next_attempt_at = null, updated_at = now()
--    where status = 'pending' and attempts = 0 and dispatch_scope = 'production';  -- se preciso
--   e WELCOME_DISPATCH_MODE / EMAIL_LEMBRETES_MODE = "off" no Worker.
