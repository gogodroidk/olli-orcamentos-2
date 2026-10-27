-- OLLI Orçamentos — CIÊNCIA DO AVISO antes de limitar CONTA ANTIGA (P0-09; parecer LEGAL R0012 §2,
-- Entregas Claude/OLLI/2026-10-24-cpo-r0012-pacote-unico/PARECER-LEGAL-ANTIGAS-15-X-30-TERMOS-E-AVISO.md).
-- Depende de 20261024150000 (corte_antigas). Os Termos (PR #234) dizem: "Conta anterior ainda não avisada passa a ter
-- o limite só depois de ver o aviso." Sem esta migration o banco limitava a antiga em corte_antigas sem saber se ela viu.
--
-- COMO FUNCIONA
--   `limite_gratis_ciencia`: 1 linha por tenant com a 1ª exibição do aviso (data/hora + versão do texto + canal).
--   Gravada só pela RPC `registrar_ciencia_limite_gratis` (app/painel chamam quando o banner aparece).
--   Início do limite da conta antiga (`limite_gratis_inicio_antiga`):
--     viu o aviso até corte_antigas        -> corte_antigas (D+30, como antes);
--     não viu até corte_antigas            -> corte_antigas + 7 dias (o banner segue no ar com ESTA data, então a
--                                             data mostrada é sempre a verdadeira; quem vê depois do corte não
--                                             antecipa nada).
--   Envio feito ANTES do início não conta para o limite da antiga (mudança vale só para o futuro).
--   Conta nova (criada >= corte) não muda.
--   Com corte_antigas NULL (padrão) nada muda e a RPC não grava nada.
-- Rollback: recriar as 2 funções de 20261024150000 e `drop table public.limite_gratis_ciencia`.
-- Teste: scripts/teste-limite-gratis-5-sql.ts.

begin;

create table if not exists public.limite_gratis_ciencia (
  tenant_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  visto_em timestamptz not null default now(),
  versao_texto text not null check (char_length(versao_texto) between 1 and 80),
  canal text not null check (canal in ('app', 'painel'))
);
comment on table public.limite_gratis_ciencia is
  'Ciência do aviso do limite do Grátis nas contas antigas (1ª exibição). Só a RPC grava; ninguém lê direto.';
create index if not exists limite_gratis_ciencia_user_id_idx on public.limite_gratis_ciencia (user_id);
alter table public.limite_gratis_ciencia enable row level security;
revoke all on table public.limite_gratis_ciencia from public, anon, authenticated;

create or replace function public.limite_gratis_inicio_antiga(p_tenant_id uuid, p_corte_antigas timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_corte_antigas is null then null
    when exists (
      select 1 from public.limite_gratis_ciencia c
      where c.tenant_id = p_tenant_id and c.visto_em <= p_corte_antigas
    ) then p_corte_antigas
    else p_corte_antigas + interval '7 days'
  end
$$;
revoke all on function public.limite_gratis_inicio_antiga(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.registrar_ciencia_limite_gratis(p_versao text, p_canal text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_corte_antigas timestamptz;
  v_visto timestamptz;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  if p_versao is null or char_length(trim(p_versao)) not between 1 and 80 then raise exception 'versao_invalida'; end if;
  if p_canal not in ('app', 'painel') then raise exception 'canal_invalido'; end if;
  select c.corte_antigas into v_corte_antigas from public.limite_gratis_config c where c.id;
  -- Sem aviso no ar não há do que ter ciência.
  if v_corte_antigas is null then return null; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  insert into public.limite_gratis_ciencia (tenant_id, user_id, versao_texto, canal)
  values (v_contexto.tenant_id, auth.uid(), trim(p_versao), p_canal)
  on conflict (tenant_id) do nothing;
  select c.visto_em into v_visto from public.limite_gratis_ciencia c where c.tenant_id = v_contexto.tenant_id;
  return v_visto;
end;
$$;
revoke all on function public.registrar_ciencia_limite_gratis(text, text) from public, anon;
grant execute on function public.registrar_ciencia_limite_gratis(text, text) to authenticated;

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
  v_criada timestamptz;
  v_limitada boolean := false;
  v_nova boolean := false;
  v_desde timestamptz := '-infinity';
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

  -- Limite do Grátis (P0-09): conta NOVA (criada em/depois do corte) desde sempre; conta ANTIGA a partir do início
  -- dela (corte_antigas se viu o aviso a tempo, senão corte_antigas + 7 dias), contando só envios desde esse início.
  select c.corte, c.limite, c.corte_antigas into v_corte, v_limite, v_corte_antigas from public.limite_gratis_config c where c.id;
  if v_corte is not null or v_corte_antigas is not null then
    select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
    v_nova := v_criada is not null and v_corte is not null and v_criada >= v_corte;
    if v_nova then
      v_limitada := true;
    elsif v_criada is not null and v_corte_antigas is not null then
      v_desde := public.limite_gratis_inicio_antiga(v_contexto.tenant_id, v_corte_antigas);
      v_limitada := now() >= v_desde;
    end if;
  end if;

  -- Mesmo orçamento no mesmo mês: idempotente (devolve a reserva viva, se houver).
  select e.estado, e.reserva_token into v_estado, v_reserva_token
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id);
  if found then
    select count(*) into v_usados
    from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo and e.criado_em >= v_desde;
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

  -- Teto do Grátis: conta envio confirmado + reserva viva (as expiradas já saíram acima), desde o início do limite.
  -- O 6º ENVIO é barrado; o orçamento continua editável e salvo (o app só bloqueia o envio).
  if v_limitada then
    select count(*) into v_ativos
    from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo and e.criado_em >= v_desde
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
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo and e.criado_em >= v_desde;
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
  v_criada timestamptz;
  v_limitada boolean := false;
  v_nova boolean := false;
  v_antiga boolean := false;
  v_desde timestamptz := '-infinity';
  v_usados_30d integer := 0;
  v_aviso jsonb := null;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  v_plano := public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now());
  select c.corte, c.limite, c.corte_antigas into v_corte, v_limite, v_corte_antigas from public.limite_gratis_config c where c.id;
  if (v_corte is not null or v_corte_antigas is not null) and v_plano not in ('pro', 'empresa') then
    select u.created_at into v_criada from auth.users u where u.id = v_contexto.owner_user_id;
    v_nova := v_criada is not null and v_corte is not null and v_criada >= v_corte;
    if not v_nova and v_criada is not null and v_corte_antigas is not null then
      v_desde := public.limite_gratis_inicio_antiga(v_contexto.tenant_id, v_corte_antigas);
      v_antiga := now() >= v_desde;
      if not v_antiga then
        select count(*) into v_usados_30d from public.orcamento_envios_gratis e
          where e.tenant_id = v_contexto.tenant_id and e.estado = 'confirmado' and e.criado_em >= now() - interval '30 days';
        -- a_partir_de = o início REAL desta conta (D+30, ou D+37 se ainda não viu o aviso no corte).
        v_aviso := jsonb_build_object(
          'a_partir_de', v_desde,
          'usados_30d', v_usados_30d,
          'ciencia_registrada', exists (select 1 from public.limite_gratis_ciencia c where c.tenant_id = v_contexto.tenant_id)
        );
      end if;
    end if;
    v_limitada := v_nova or v_antiga;
  end if;
  select count(*) into v_usados from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo and e.criado_em >= v_desde
      and (e.estado = 'confirmado' or e.reserva_expira_em > now());
  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id;
  return jsonb_build_object(
    'plano_efetivo', v_plano,
    -- SINAL do servidor NOVO: só ele manda `limite_conta_nova`. O servidor ANTIGO (antes de 20261002150000) mandava
    -- limite_envios=5 para todo Grátis sem este campo; o app só acredita no teto quando o sinal vem junto (CDC: nada de
    -- 'X de 5' sem limite real).
    'limite_conta_nova', v_nova,
    'limite_conta_antiga', v_antiga,
    'aviso_limite_antigas', v_aviso,
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
