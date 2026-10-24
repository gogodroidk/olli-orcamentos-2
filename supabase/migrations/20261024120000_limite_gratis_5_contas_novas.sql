-- OLLI Orçamentos — LIMITE DO GRÁTIS: 5 envios/mês só para CONTA NOVA (P0-09, aprovado pelo Igor 22/10;
-- corte = dia do deploy, R0006 de 23/10; contas anteriores mantêm sem teto; decisão CPO D-0032).
--
-- COMO FUNCIONA
--   public.limite_gratis_config (1 linha): `corte` NULL = limite DESLIGADO (padrão). Ao ligar:
--     update public.limite_gratis_config set corte = now();   -- contas criadas desse instante em diante
--   Conta do Grátis com auth.users.created_at >= corte: o 6º envio do mês é recusado
--   (`permitido:false`, motivo `cota_esgotada` — nome de fio que o APK antigo já entende). Conta
--   anterior ao corte, Pro/Empresa e trial ativo: sem teto, como hoje.
--   Conta envio confirmado + reserva viva; só o ENVIO é barrado (orçamento segue salvo/editável).
--   `meu_estado_oferta_comercial` passa a devolver limite_envios/envios_restantes só p/ conta limitada.
-- NÃO APLICAR sem ordem do Igor. Aplicar com corte NULL é inofensivo; ligar o corte é um 2º passo.
-- Ao desligar: `update ... set corte = null` (dados preservados). Teste: scripts/teste-limite-gratis-5-sql.ts.

begin;

create table if not exists public.limite_gratis_config (
  id boolean primary key default true check (id),
  corte timestamptz,
  limite integer not null default 5 check (limite between 1 and 100),
  atualizado_em timestamptz not null default now()
);
insert into public.limite_gratis_config (id) values (true) on conflict (id) do nothing;
alter table public.limite_gratis_config enable row level security;
revoke all on public.limite_gratis_config from public, anon, authenticated;
comment on table public.limite_gratis_config is
  'Limite do Grátis em conta nova (P0-09). corte NULL = desligado. Só service_role/postgres altera.';

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
  select c.corte, c.limite into v_corte, v_limite from public.limite_gratis_config c where c.id;
  if v_corte is not null then
    select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
    v_limitada := v_criada is not null and v_criada >= v_corte;
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
        'limite_envios', v_limite, 'contabilizado_agora', false, 'requer_confirmacao', false,
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
  v_criada timestamptz;
  v_limitada boolean := false;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  v_plano := public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now());
  select count(*) into v_usados from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
      and (e.estado = 'confirmado' or e.reserva_expira_em > now());
  select c.corte, c.limite into v_corte, v_limite from public.limite_gratis_config c where c.id;
  if v_corte is not null and v_plano not in ('pro', 'empresa') then
    select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
    v_limitada := v_criada is not null and v_criada >= v_corte;
  end if;
  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id;
  return jsonb_build_object(
    'plano_efetivo', v_plano,
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
