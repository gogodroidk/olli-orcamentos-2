-- OLLI Orçamentos — LIMITE DO GRÁTIS TAMBÉM NAS CONTAS ANTIGAS (ordem do Igor via Maestro, 24/10/2026).
--
-- `limite_gratis_config.corte_antigas` (NULL = DESLIGADO, padrão): a partir desse instante o MESMO limite (5/mês, `limite`)
-- vale para toda conta do Grátis, inclusive as criadas antes do corte das novas. Combinado: corte_antigas = D+30 00:00 (-03),
-- com o AVISO de 30 dias saindo no deploy. NÃO ligar antes de o aviso ter saído e a data valer.
-- Reversível na hora: `update public.limite_gratis_config set corte_antigas = null;`. Pro/Empresa e teste do Pro ativo seguem sem teto.
-- A resposta ganha `limite_origem` ('nova'|'antiga'); `limite_conta_nova` continua sendo o sinal (true = há teto).
-- Depende de 20261024120000. Idempotente. NÃO aplicar sem ordem do Igor.
-- Teste: scripts/teste-limite-gratis-antigas-sql.ts.

begin;

alter table public.limite_gratis_config add column if not exists corte_antigas timestamptz;
comment on column public.limite_gratis_config.corte_antigas is
  'Instante a partir do qual o limite vale também para contas criadas ANTES de `corte`. NULL = desligado.';

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
  v_limite integer;
  v_corte timestamptz;
  v_corte_antigas timestamptz;
  v_origem text;
  v_criada timestamptz;
  v_limitada boolean := false;
  v_ativos integer;
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

  -- Limite do Grátis (P0-09): só vale para CONTA NOVA (criada em/depois do corte). Sem corte
  -- configurado (padrão), ou conta anterior ao corte, nada muda: o envio segue sem teto.
  select c.corte, c.corte_antigas, c.limite into v_corte, v_corte_antigas, v_limite from public.limite_gratis_config c where c.id;
  -- Regra única, duas portas: conta NOVA (criada >= corte) e conta ANTIGA (a partir de corte_antigas, que vale para todas).
  if v_corte is not null then
    select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
    if v_criada is not null and v_criada >= v_corte then
      v_limitada := true;
      v_origem := 'nova';
    end if;
  end if;
  if not v_limitada and v_corte_antigas is not null and now() >= v_corte_antigas then
    v_limitada := true;
    v_origem := 'antiga';
  end if;

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
      'restantes', case when v_limitada then greatest(0, v_limite - v_usados) else null end,
      'contabilizado_agora', false,
      'requer_confirmacao', v_estado = 'reservado',
      'reserva_token', case when v_estado = 'reservado' then v_reserva_token else null end,
      'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
    );
  end if;

  -- Teto do Grátis em conta nova: conta envio confirmado + reserva viva (as expiradas já saíram acima).
  -- O 6º ENVIO é barrado; o orçamento continua editável e salvo (o app só bloqueia o envio).
  if v_limitada then
    select count(*) into v_ativos
    from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
      and (e.estado = 'confirmado' or e.reserva_expira_em > now());
    if v_ativos >= v_limite then
      select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;
      return jsonb_build_object(
        'permitido', false, 'plano_efetivo', 'gratis', 'usados', v_ativos, 'restantes', 0,
        'limite_envios', v_limite, 'limite_origem', v_origem, 'contabilizado_agora', false, 'requer_confirmacao', false,
        'reserva_token', null, 'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'cota_esgotada'
      );
    end if;
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
    'restantes', case when v_limitada then greatest(0, v_limite - v_usados) else null end,
    'contabilizado_agora', v_inseridos = 1,
    'requer_confirmacao', true, 'reserva_token', v_reserva_token,
    'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
  );
end;
$$;

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
  v_limite integer;
  v_corte timestamptz;
  v_corte_antigas timestamptz;
  v_origem text;
  v_criada timestamptz;
  v_limitada boolean := false;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  v_plano := public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now());
  select count(*) into v_usados from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
      and (e.estado = 'confirmado' or e.reserva_expira_em > now());
  select c.corte, c.corte_antigas, c.limite into v_corte, v_corte_antigas, v_limite from public.limite_gratis_config c where c.id;
  if v_plano not in ('pro', 'empresa') then
    if v_corte is not null then
      select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
      if v_criada is not null and v_criada >= v_corte then
        v_limitada := true;
        v_origem := 'nova';
      end if;
    end if;
    if not v_limitada and v_corte_antigas is not null and now() >= v_corte_antigas then
      v_limitada := true;
      v_origem := 'antiga';
    end if;
  end if;
  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id;
  return jsonb_build_object(
    'plano_efetivo', v_plano,
    -- SINAL do servidor NOVO: só ele manda `limite_conta_nova`. O servidor ANTIGO (antes de 20261002150000) mandava
    -- limite_envios=5 para todo Grátis sem este campo; o app só acredita no teto quando o sinal vem junto (CDC: nada de
    -- 'X de 5' sem limite real).
    -- `limite_conta_nova` é o SINAL que o app já exige (nome histórico): true = há teto de verdade (conta nova OU antiga);
    -- `limite_origem` diz qual porta ('nova'|'antiga') para a copy do aviso.
    'limite_conta_nova', v_limitada,
    'limite_origem', v_origem,
    'limite_envios', case when v_limitada then v_limite else null end,
    'envios_usados', v_usados,
    'envios_restantes', case when v_limitada then greatest(0, v_limite - v_usados) else null end,
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

revoke all on function public.reservar_envio_orcamento_gratis(text,text) from public, anon;
grant execute on function public.reservar_envio_orcamento_gratis(text,text) to authenticated;
revoke all on function public.meu_estado_oferta_comercial() from public, anon;
grant execute on function public.meu_estado_oferta_comercial() to authenticated;

commit;
