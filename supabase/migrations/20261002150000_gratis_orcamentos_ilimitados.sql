-- OLLI Orçamentos — Grátis com orçamentos ILIMITADOS (decisão do dono, 01/10/2026).
--
-- O QUE MUDA
--   Até aqui o Grátis tinha uma cota de 5 orçamentos enviados por mês, aplicada
--   por `reservar_envio_orcamento_gratis`. A cota sai. O que o Grátis "paga" agora
--   é o selo discreto "Feito com OLLI" no PDF, no recibo e no link /o/<token>
--   (entitlement `remove_olli_brand` tira o selo no Pro/Empresa).
--
-- O QUE NÃO MUDA (de propósito)
--   - A reserva/confirmação em duas fases continua: ela deixou de ser PORTÃO e
--     virou REGISTRO. É a confirmação do 1º envio que inicia o teste do Pro de 14
--     dias (20260930120000) e alimenta o funil de receita (20260930120100). Por isso
--     a tabela `orcamento_envios_gratis` e as funções de confirmar/cancelar ficam
--     como estão.
--   - Os NOMES de fio: todo envio do Grátis responde `motivo: 'dentro_da_cota'`,
--     `permitido: true`. O APK 1.1.x que está na mão dos clientes rejeita motivo
--     desconhecido e bloquearia o envio — com estes nomes ele envia normalmente.
--     `restantes`/`limite_envios`/`envios_restantes` passam a vir `null` (o app novo
--     ignora; o antigo só usa para texto informativo).
--   - Nenhum dado é apagado. Nenhuma assinatura, trial ou cobrança é tocada.
--
-- O QUE SAI JUNTO
--   - O gatilho `quota_limit` do teste do Pro deixa de ser disparado (a cota não
--     existe). O valor continua aceito na CHECK de `trials_comerciais` para o
--     histórico de quem já entrou por ele.
--   - O pré-filtro dos lembretes por e-mail deixa de selecionar contas "perto da
--     cota" (`envios_usados >= 3`). A regra do worker (`emailLembretesPolicy.js`) já
--     não manda e-mail de cota; isto só evita ler candidatos à toa.
--
-- Aplicação em produção é um gate SEPARADO, depois do merge (não aplicar daqui).
-- Ordem segura: pode ir antes ou depois do app novo — o app novo nunca barra envio
-- (`limitesComerciais.ts`) e o antigo, com esta migration, também não.
-- Teste: scripts/teste-gratis-ilimitado-sql.ts (PGlite, roda o SQL de verdade).

-- ─── 1. Reserva = REGISTRO, sem teto ─────────────────────────────────────────

create or replace function public.reservar_envio_orcamento_gratis(
  p_orcamento_id text,
  p_canal text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_periodo date := date_trunc('month', timezone('UTC', now()))::date;
  v_plano text;
  v_usados integer;
  v_inseridos integer := 0;
  v_trial_estado text;
  v_reserva_token uuid;
  v_estado text;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  if p_orcamento_id is null or char_length(trim(p_orcamento_id)) not between 1 and 160 then
    raise exception 'orcamento_id_invalido';
  end if;
  if p_canal not in ('pdf', 'link', 'whatsapp') then raise exception 'canal_invalido'; end if;

  select * into strict v_contexto from public.contexto_comercial_atual();
  perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':' || v_periodo::text, 0));
  v_plano := public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now());

  if v_plano in ('pro', 'empresa') then
    return jsonb_build_object(
      'permitido', true, 'plano_efetivo', v_plano, 'usados', 0, 'restantes', null,
      'contabilizado_agora', false, 'requer_confirmacao', false, 'reserva_token', null,
      'trial_elegivel', false, 'motivo', case when exists (
        select 1 from public.trials_comerciais t
        where t.tenant_id = v_contexto.tenant_id and t.estado = 'active' and t.termina_em > now()
      ) then 'trial_ativo' else 'plano_pago' end
    );
  end if;

  delete from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
    and e.estado = 'reservado' and e.reserva_expira_em <= now();

  -- Mesmo orçamento no mesmo mês: idempotente (devolve a reserva viva, se houver).
  select e.estado, e.reserva_token into v_estado, v_reserva_token
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id);
  if found then
    select count(*) into v_usados
    from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo;
    select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;
    return jsonb_build_object(
      'permitido', true, 'plano_efetivo', 'gratis', 'usados', v_usados,
      'restantes', null, 'contabilizado_agora', false,
      'requer_confirmacao', v_estado = 'reservado',
      'reserva_token', case when v_estado = 'reservado' then v_reserva_token else null end,
      'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
    );
  end if;

  -- Sem teto para o PRESTADOR: todo envio do Grátis é permitido. O REGISTRO, porém,
  -- tem um teto técnico por tenant/mês (2000 linhas): sem ele, qualquer conta
  -- grátis com sessão chamaria esta RPC em loop com ids inventados e encheria a
  -- tabela sem limite (antes a cota de 5 fazia esse papel por acaso). Passado o
  -- teto, o envio SEGUE permitido, só não é registrado de novo — o registro existe
  -- para o 1º envio (teste do Pro) e para o funil, e nenhum dos dois precisa da
  -- linha 2001. `requer_confirmacao: false` + token nulo é o mesmo formato que o
  -- Pro já devolve, aceito pelo APK antigo e pelo novo.
  select count(*) into v_usados
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo;
  if v_usados >= 2000 then
    select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;
    return jsonb_build_object(
      'permitido', true, 'plano_efetivo', 'gratis', 'usados', v_usados,
      'restantes', null, 'contabilizado_agora', false,
      'requer_confirmacao', false, 'reserva_token', null,
      'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
    );
  end if;

  -- Abaixo do teto técnico: o envio é registrado (e permitido).
  insert into public.orcamento_envios_gratis (
    tenant_id, owner_user_id, periodo, orcamento_id, primeiro_canal, criado_por
  ) values (
    v_contexto.tenant_id, v_contexto.owner_user_id, v_periodo, trim(p_orcamento_id), p_canal, auth.uid()
  ) on conflict (tenant_id, periodo, orcamento_id) do nothing;
  get diagnostics v_inseridos = row_count;

  select e.reserva_token into v_reserva_token
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id);
  select count(*) into v_usados
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo;
  select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;

  return jsonb_build_object(
    'permitido', true, 'plano_efetivo', 'gratis', 'usados', v_usados,
    'restantes', null, 'contabilizado_agora', v_inseridos = 1,
    'requer_confirmacao', true, 'reserva_token', v_reserva_token,
    'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
  );
end;
$$;

revoke all on function public.reservar_envio_orcamento_gratis(text,text) from public, anon;
grant execute on function public.reservar_envio_orcamento_gratis(text,text) to authenticated;

comment on function public.reservar_envio_orcamento_gratis(text,text) is
  'Registra o envio de um orçamento do Grátis (sem teto desde 01/10/2026). Idempotente por tenant/mês/orçamento; motivo dentro_da_cota mantido pelo APK antigo.';

comment on table public.orcamento_envios_gratis is
  'Registro mensal dos envios do Grátis em duas fases (reserva → confirmação). Desde 01/10/2026 não é cota: alimenta o teste automático do Pro e o funil.';

-- ─── 2. Estado da oferta: sem limite no Grátis ───────────────────────────────

create or replace function public.meu_estado_oferta_comercial()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_periodo date := date_trunc('month', timezone('UTC', now()))::date;
  v_plano text;
  v_usados integer;
  v_trial public.trials_comerciais%rowtype;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  v_plano := public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now());
  select count(*) into v_usados from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
      and (e.estado = 'confirmado' or e.reserva_expira_em > now());
  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id;
  return jsonb_build_object(
    'plano_efetivo', v_plano,
    'limite_envios', null,
    'envios_usados', v_usados,
    'envios_restantes', null,
    'trial_estado', case
      when v_trial.estado = 'active' and v_trial.termina_em <= now() then 'ended'
      else coalesce(v_trial.estado, 'unstarted') end,
    'trial_termina_em', v_trial.termina_em,
    'trial_dias', 14,
    'requires_card', false,
    'auto_renews', false,
    'data_disposition', 'preserve'
  );
end;
$$;

revoke all on function public.meu_estado_oferta_comercial() from public, anon;
grant execute on function public.meu_estado_oferta_comercial() to authenticated;

-- ─── 3. Candidatos a lembrete por e-mail: sem o critério "perto da cota" ─────
-- Cópia de 20260929200000 (seção 5a) com duas mudanças: o pré-filtro de
-- assinatura deixa de selecionar `envios_usados >= 3` e a oferta devolve
-- `limite_envios`/`envios_restantes` nulos. O resto é idêntico.

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
      -- Assinatura: dono do tenant, já tem orçamento, e perto do VENCIMENTO.
      -- (Desde 01/10/2026 o Grátis é ilimitado: "perto da cota" deixou de existir.)
      (
        e.orcamentos >= 1
        and e.tenant_id is not null
        and e.tem_assinatura
        and e.a_period_end is not null
        and e.a_period_end between p_now - interval '4 days' and p_now + interval '4 days'
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
        'limite_envios', null,
        'envios_usados', f.envios_usados,
        'envios_restantes', null,
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
