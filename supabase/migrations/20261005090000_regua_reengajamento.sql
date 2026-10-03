-- Régua de e-mail completa (03/10/2026, ordem do dono): quem não entrou / não usou.
--
-- Já existiam (e continuam iguais): boas-vindas (D+0), ativação D+3/D+7 para conta
-- com zero orçamento até 30 dias, cobrança de renovação (D-3/D0/D+1) e o resumo
-- diário do dinheiro. Esta migration acrescenta o template `lembrete_reengajamento`
-- (purpose `reengagement_reminder`) para os segmentos que ninguém cobria:
--   * ativacao_ultima — zero orçamento, conta com mais de N dias (janela da ativação)
--     e até 120 dias: UM e-mail na vida;
--   * parou           — já orçou e não faz orçamento novo há 7 (d7) e 14 dias (d14):
--     no máximo 2 por episódio (a data do último orçamento); depois de 30 dias para;
--   * trial_acabando  — teste do Pro ativo terminando em 24–72 h: 1 por teste.
-- E o TETO DE FREQUÊNCIA pedido pelo dono: no máximo 1 e-mail por pessoa a cada 24 h,
-- somando todos os tipos (boas-vindas, lembretes, cobrança, reengajamento e resumo).
--
-- Descadastro: o mesmo link "Parar de receber lembretes" (email_supressoes) já barra
-- o novo template — `listar_candidatos` e `enqueue` conferem a supressão.
-- Envio: o trigger `email_outbox_scope_inicial` põe todo template que não é
-- boas_vindas/resumo no canal `lembretes` (já em production).

-- ─── 1. Catálogo da outbox ──────────────────────────────────────────────────────
alter table public.email_outbox drop constraint if exists email_outbox_template_catalogo_check;
alter table public.email_outbox
  add constraint email_outbox_template_catalogo_check
  check (
    (template = 'boas_vindas' and template_version = 'boas_vindas.v1' and purpose = 'account_onboarding')
    or (template = 'lembrete_ativacao' and template_version = 'lembrete_ativacao.v1' and purpose = 'activation_reminder')
    or (template = 'lembrete_assinatura' and template_version = 'lembrete_assinatura.v1' and purpose = 'billing_reminder')
    or (template = 'lembrete_reengajamento' and template_version = 'lembrete_reengajamento.v1' and purpose = 'reengagement_reminder')
    or (template = 'resumo_dinheiro' and template_version = 'resumo_dinheiro.v1' and purpose = 'money_digest')
    or (template = 'resumo_dinheiro' and template_version = 'resumo_dinheiro.v2' and purpose = 'money_digest')
  );

-- ─── 2. Teto por pessoa (fonte única para os dois enqueues) ─────────────────────
-- Conta tudo que foi ou vai ser enviado (dead_letter não saiu, não conta).
create or replace function private.email_recebeu_ultimas_24h(p_user_id uuid, p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.email_outbox o
    where o.user_id = p_user_id
      and o.status <> 'dead_letter'
      and o.created_at > p_now - interval '24 hours'
  );
$$;
revoke all on function private.email_recebeu_ultimas_24h(uuid, timestamptz) from public, anon, authenticated;

-- ─── 3. Enqueue dos lembretes ───────────────────────────────────────────────────
create or replace function public.enqueue_lembrete_email(
  p_user_id uuid,
  p_template text,
  p_template_version text,
  p_purpose text,
  p_idempotency_key text,
  p_template_dados jsonb,
  p_teto_diario integer default 40,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email      text;
  v_orcamentos bigint;
  v_sequencia  text;
  v_prefixo    text;
  v_tipo       text;
  v_ultimo     timestamptz;
  v_dias       numeric;
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
  elsif (p_template, p_template_version, p_purpose) = ('lembrete_reengajamento', 'lembrete_reengajamento.v1', 'reengagement_reminder') then
    v_prefixo := 'reengajamento:' || p_user_id::text || ':';
    v_tipo := p_template_dados ->> 'tipo';
    if v_tipo is null or v_tipo not in ('ativacao_ultima', 'parou', 'trial_acabando') then
      raise exception 'lembrete_dados_invalidos';
    end if;
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

  -- Teto de frequência do dono: 1 e-mail por pessoa a cada 24 h, qualquer tipo.
  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_pessoa_dia');
  end if;

  select pg_catalog.count(*), pg_catalog.max(o.criado_em)
    into v_orcamentos, v_ultimo
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

  elsif p_purpose = 'billing_reminder' then
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

  else -- reengagement_reminder: reconfere o segmento AGORA, sob a trava.
    if v_tipo = 'ativacao_ultima' then
      if v_orcamentos > 0 then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'ja_tem_orcamento');
      end if;
      if exists (
        select 1 from public.email_outbox o
        where o.user_id = p_user_id and o.purpose = 'reengagement_reminder'
          and o.template_dados ->> 'tipo' = 'ativacao_ultima'
      ) then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'ja_enviado');
      end if;

    elsif v_tipo = 'parou' then
      if v_orcamentos < 1 or v_ultimo is null then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_sem_orcamento');
      end if;
      -- Orçamento novo depois do pedido = episódio vencido (a pessoa voltou).
      if (p_template_dados ->> 'ultimoOrcamentoEm') is distinct from
         pg_catalog.to_char(v_ultimo at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'episodio_vencido');
      end if;
      v_dias := extract(epoch from (p_now - v_ultimo)) / 86400.0;
      if not ((p_template_dados ->> 'etapa' = 'd7' and v_dias >= 7 and v_dias < 14)
              or (p_template_dados ->> 'etapa' = 'd14' and v_dias >= 14 and v_dias < 30)) then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'fora_da_janela');
      end if;
      if (
        select pg_catalog.count(*) from public.email_outbox o
        where o.user_id = p_user_id and o.purpose = 'reengagement_reminder'
          and o.template_dados ->> 'tipo' = 'parou'
          and o.template_dados ->> 'ultimoOrcamentoEm' = p_template_dados ->> 'ultimoOrcamentoEm'
      ) >= 2 then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_episodio');
      end if;

    else -- trial_acabando
      if not exists (
        select 1 from public.trials_comerciais t
        where t.owner_user_id = p_user_id
          and t.estado = 'active'
          and t.termina_em > p_now + interval '24 hours'
          and t.termina_em <= p_now + interval '72 hours'
          and pg_catalog.to_char(t.termina_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              = p_template_dados ->> 'terminaEm'
      ) then
        return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'trial_fora_da_janela');
      end if;
    end if;
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.purpose in ('activation_reminder', 'billing_reminder', 'reengagement_reminder')
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
$function$;

-- ─── 4. Resumo do dinheiro respeita o mesmo teto ────────────────────────────────
create or replace function public.enqueue_resumo_dinheiro_email(
  p_user_id uuid,
  p_idempotency_key text,
  p_template_dados jsonb,
  p_max_semana integer default 3,
  p_intervalo_min_horas integer default 44,
  p_teto_diario integer default 100,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email   text;
  v_local   timestamp;
  v_dia     text;
  v_estado  jsonb;
  v_cent    bigint;
  v_itens   bigint;
  v_parados bigint;
  v_lembrar bigint;
begin
  if p_user_id is null
     or p_idempotency_key is null
     or p_template_dados is null
     or pg_catalog.jsonb_typeof(p_template_dados) <> 'object'
     or pg_catalog.pg_column_size(p_template_dados) > 1024
     or p_max_semana is null or p_max_semana < 1 or p_max_semana > 7
     or p_intervalo_min_horas is null or p_intervalo_min_horas < 20 or p_intervalo_min_horas > 168
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 1000
     or p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'resumo_argumentos_invalidos';
  end if;

  -- Janela e dia no relógio de Brasília: 7h–8h, nunca domingo.
  v_local := p_now at time zone 'America/Sao_Paulo';
  v_dia := pg_catalog.to_char(v_local, 'YYYY-MM-DD');
  if pg_catalog.date_part('hour', v_local) <> 7 then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'fora_da_janela');
  end if;
  if pg_catalog.date_part('dow', v_local) = 0 then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'domingo');
  end if;

  -- A chave carrega a conta E o dia: não dá para gravar o resumo de A com a chave de B,
  -- nem o de hoje com a data de ontem.
  if p_idempotency_key <> 'resumo:dinheiro:' || p_user_id::text || ':' || v_dia
     or (p_template_dados ->> 'data') is distinct from v_dia
  then
    raise exception 'resumo_chave_divergente';
  end if;

  -- Só números inteiros não negativos; e só sai se houver algo acionável.
  begin
    v_cent := (p_template_dados ->> 'aReceberCentavos')::bigint;
    v_itens := (p_template_dados ->> 'aReceberItens')::bigint;
    v_parados := (p_template_dados ->> 'propostasParadas')::bigint;
    v_lembrar := (p_template_dados ->> 'clientesParaLembrar')::bigint;
  exception when others then
    raise exception 'resumo_dados_invalidos';
  end;
  if v_cent is null or v_itens is null or v_parados is null or v_lembrar is null
     or v_cent < 0 or v_itens < 0 or v_parados < 0 or v_lembrar < 0
  then
    raise exception 'resumo_dados_invalidos';
  end if;
  if not ((v_cent > 0 and v_itens > 0) or v_parados > 0 or v_lembrar > 0) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nada_acionavel');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('olli.email_resumo:' || p_user_id::text, 0)
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
    and (u.banned_until is null or u.banned_until <= p_now)
    and coalesce(u.is_anonymous, false) = false;

  if v_email is null
     or v_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     or pg_catalog.length(v_email) > 254
  then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;

  v_estado := private.resumo_dinheiro_estado(p_user_id);
  if not (v_estado ->> 'elegivel')::boolean then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nao_e_dono');
  end if;
  if not (v_estado ->> 'ativo')::boolean then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'desligado');
  end if;

  -- Teto de frequência do dono: 1 e-mail por pessoa a cada 24 h, qualquer tipo.
  if private.email_recebeu_ultimas_24h(p_user_id, p_now) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_pessoa_dia');
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.user_id = p_user_id and o.purpose = 'money_digest'
      and o.created_at > p_now - interval '7 days'
  ) >= p_max_semana then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_semanal');
  end if;

  if exists (
    select 1 from public.email_outbox o
    where o.user_id = p_user_id and o.purpose = 'money_digest'
      and o.created_at > p_now - pg_catalog.make_interval(hours => p_intervalo_min_horas)
  ) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'intervalo_minimo');
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.purpose = 'money_digest'
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
    'resumo_dinheiro',
    'resumo_dinheiro.v2',
    'money_digest',
    pg_catalog.lower(pg_catalog.btrim(v_email)),
    p_now,
    p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$function$;

-- ─── 5. Candidatos: os três segmentos novos + o que a política precisa ──────────
create or replace function public.listar_candidatos_lembrete_email(
  p_now timestamptz default now(),
  p_ativacao_max_dias integer default 30,
  p_limit integer default 50
)
returns table(candidato jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
      -- Teto de 1 e-mail/dia por pessoa: quem já recebeu nem entra na lista
      -- (senão ocuparia as vagas da rodada à toa).
      and not private.email_recebeu_ultimas_24h(u.id, p_now)
  ), base as (
    select
      us.user_id,
      us.email_confirmed_at,
      oc.orcamentos,
      oc.ultimo_orcamento,
      (select pg_catalog.count(*) from public.organizacoes o where o.owner_user_id = us.user_id) as orgs_dono,
      (
        select pg_catalog.count(*)
        from public.organizacao_membros m
        where m.user_id = us.user_id and m.ativo
      ) as membro_ativo
    from usuarios us
    cross join lateral (
      select pg_catalog.count(*) as orcamentos, pg_catalog.max(o.criado_em) as ultimo_orcamento
      from public.orcamentos o
      where (o.user_id = us.user_id or o.criado_por = us.user_id)
        and o.excluido_em is null
    ) oc
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
        -- Google Play (Play Billing direto): a Play renova sozinha e cobra pela
        -- conta Google. "Renove com Pix" aqui seria cobrança em dobro (e, dentro
        -- do Android, pagamento fora da Play). Vínculo = hash do purchaseToken.
        or exists (
          select 1 from public.play_compras p
           where p.token_sha256 = a.revenuecat_transacao_id
             and p.auto_renovacao is true
             and p.estado in ('SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')
        )
      ) as recorrente,
      (
        select pg_catalog.count(*)
        from public.orcamento_envios_gratis e
        where c.tenant_id is not null
          and e.tenant_id = c.tenant_id
          and e.periodo = v_periodo
          and (e.estado = 'confirmado' or e.reserva_expira_em > p_now)
      ) as envios_usados,
      t.estado as t_estado,
      t.termina_em as t_termina_em
    from contexto c
    left join public.assinaturas a on a.user_id = c.user_id
    left join public.trials_comerciais t on t.tenant_id = c.tenant_id
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
      -- Reengajamento — última chamada: zero orçamento, conta entre N e 120 dias.
      (
        e.orcamentos = 0
        and not (e.orgs_dono = 0 and e.membro_ativo > 0)
        and e.email_confirmed_at < p_now - pg_catalog.make_interval(days => p_ativacao_max_dias)
        and e.email_confirmed_at >= p_now - interval '120 days'
        and not exists (
          select 1 from public.email_outbox o
          where o.user_id = e.user_id and o.purpose = 'reengagement_reminder'
            and o.template_dados ->> 'tipo' = 'ativacao_ultima'
        )
      )
      or
      -- Assinatura: dono do tenant, já tem orçamento, e perto do VENCIMENTO.
      (
        e.orcamentos >= 1
        and e.tenant_id is not null
        and e.tem_assinatura
        and e.a_period_end is not null
        and e.a_period_end between p_now - interval '4 days' and p_now + interval '4 days'
      )
      or
      -- Reengajamento — orçou e parou: último orçamento entre 7 e 30 dias atrás.
      (
        e.orcamentos >= 1
        and e.tenant_id is not null
        and e.ultimo_orcamento <= p_now - interval '7 days'
        and e.ultimo_orcamento > p_now - interval '30 days'
      )
      or
      -- Reengajamento — teste do Pro terminando em 24–72 h.
      (
        e.tenant_id is not null
        and e.t_estado = 'active'
        and e.t_termina_em > p_now + interval '24 hours'
        and e.t_termina_em <= p_now + interval '72 hours'
      )
  )
  select pg_catalog.jsonb_build_object(
    'userId', f.user_id,
    'confirmadoEm', f.email_confirmed_at,
    'orcamentos', least(f.orcamentos, 1000),
    'ultimoOrcamentoEm', case when f.ultimo_orcamento is null then null
      else pg_catalog.to_char(f.ultimo_orcamento at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    -- Quem recebeu e-mail nas últimas 24 h já ficou fora da lista; o campo existe
    -- para a política conferir a mesma regra sem depender da ordem dos filtros.
    'ultimoEmailEm', (
      select pg_catalog.max(o.created_at) from public.email_outbox o
      where o.user_id = f.user_id and o.status <> 'dead_letter'
    ),
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
        'limite_envios', null,
        'envios_usados', f.envios_usados,
        'envios_restantes', null,
        'trial_estado', case
          when f.t_estado = 'active' and f.t_termina_em <= p_now then 'ended'
          else coalesce(f.t_estado, 'unstarted')
        end,
        'trial_termina_em', case when f.t_termina_em is null then null
          else pg_catalog.to_char(f.t_termina_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'trial_dias', 14
      )
      from (select public.plano_comercial_efetivo(f.user_id, f.tenant_id, p_now) as plano) pl
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
      ), '[]'::jsonb),
      'reengajamento', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'chave', o.idempotency_key,
            'tipo', o.template_dados ->> 'tipo',
            'em', o.created_at
          ) order by o.created_at, o.id
        )
        from public.email_outbox o
        where o.user_id = f.user_id and o.purpose = 'reengagement_reminder'
      ), '[]'::jsonb)
    )
  )
  from filtrado f
  order by f.email_confirmed_at, f.user_id
  limit p_limit;
end;
$function$;

revoke all on function public.listar_candidatos_lembrete_email(timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_resumo_dinheiro_email(uuid, text, jsonb, integer, integer, integer, timestamptz) from public, anon, authenticated;
