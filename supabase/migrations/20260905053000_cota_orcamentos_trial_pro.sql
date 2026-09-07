-- OLLI Orçamentos — cota mensal do Grátis + trial Pro opt-in por tenant.
--
-- Aplicação em produção é um gate separado. Esta migration é aditiva, não apaga
-- orçamentos no downgrade e não toca em cartão/provider. Toda autoridade vem da
-- sessão: tenant, owner, assinatura e elegibilidade nunca são aceitos do client.

create table if not exists public.trials_comerciais (
  tenant_id       uuid primary key,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  estado          text not null check (estado in ('eligible', 'active', 'ended', 'converted', 'revoked')),
  gatilho         text not null check (gatilho in ('first_pdf', 'first_link', 'first_whatsapp', 'quota_limit', 'pro_attempt', 'ai_limit', 'radar_return')),
  elegivel_em     timestamptz not null default now(),
  iniciado_em     timestamptz,
  termina_em      timestamptz,
  encerrado_em    timestamptz,
  convertido_em  timestamptz,
  criado_por      uuid not null default auth.uid() references auth.users(id) on delete restrict,
  atualizado_em   timestamptz not null default now(),
  check (
    (estado = 'eligible' and iniciado_em is null and termina_em is null)
    or (estado = 'active' and iniciado_em is not null and termina_em > iniciado_em and encerrado_em is null and convertido_em is null)
    or (estado in ('ended', 'revoked') and iniciado_em is not null and termina_em > iniciado_em and encerrado_em is not null)
    or (estado = 'converted' and iniciado_em is not null and termina_em > iniciado_em and encerrado_em is not null and convertido_em is not null)
  )
);

create table if not exists public.orcamento_envios_gratis (
  tenant_id       uuid not null,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  periodo         date not null,
  orcamento_id    text not null check (char_length(orcamento_id) between 1 and 160),
  primeiro_canal  text not null check (primeiro_canal in ('pdf', 'link', 'whatsapp')),
  estado          text not null default 'reservado' check (estado in ('reservado', 'confirmado')),
  reserva_token   uuid not null default gen_random_uuid(),
  reserva_expira_em timestamptz not null default (now() + interval '10 minutes'),
  confirmado_em   timestamptz,
  criado_por      uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em       timestamptz not null default now(),
  primary key (tenant_id, periodo, orcamento_id),
  check (
    (estado = 'reservado' and confirmado_em is null)
    or (estado = 'confirmado' and confirmado_em is not null)
  )
);

create index if not exists orcamento_envios_gratis_owner_periodo_idx
  on public.orcamento_envios_gratis (owner_user_id, periodo);

alter table public.trials_comerciais enable row level security;
alter table public.trials_comerciais force row level security;
alter table public.orcamento_envios_gratis enable row level security;
alter table public.orcamento_envios_gratis force row level security;

revoke all on table public.trials_comerciais from public, anon, authenticated;
revoke all on table public.orcamento_envios_gratis from public, anon, authenticated;
grant select on table public.trials_comerciais to authenticated;
grant select on table public.orcamento_envios_gratis to authenticated;

drop policy if exists trials_comerciais_tenant_select on public.trials_comerciais;
create policy trials_comerciais_tenant_select
  on public.trials_comerciais for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacao_membros m
      where m.org_id = tenant_id and m.user_id = (select auth.uid()) and m.ativo
    )
  );

drop policy if exists orcamento_envios_gratis_tenant_select on public.orcamento_envios_gratis;
create policy orcamento_envios_gratis_tenant_select
  on public.orcamento_envios_gratis for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacao_membros m
      where m.org_id = tenant_id and m.user_id = (select auth.uid()) and m.ativo
    )
  );

create or replace function public.contexto_comercial_atual()
returns table (tenant_id uuid, owner_user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_total integer;
begin
  if v_uid is null then raise exception 'sessao_obrigatoria'; end if;

  select count(*) into v_total
  from public.organizacoes o
  where o.owner_user_id = v_uid;
  if v_total > 1 then raise exception 'tenant_ambiguo'; end if;

  return query
    select o.id, o.owner_user_id
    from public.organizacoes o
    where o.owner_user_id = v_uid
    limit 1;
  if found then return; end if;

  select count(*) into v_total
  from public.organizacao_membros m
  where m.user_id = v_uid and m.ativo;
  if v_total > 1 then raise exception 'tenant_ambiguo'; end if;

  return query
    select o.id, o.owner_user_id
    from public.organizacao_membros m
    join public.organizacoes o on o.id = m.org_id
    where m.user_id = v_uid and m.ativo
    limit 1;
  if found then return; end if;

  return query select v_uid, v_uid;
end;
$$;

create or replace function public.plano_comercial_efetivo(
  p_owner_user_id uuid,
  p_tenant_id uuid,
  p_agora timestamptz default now()
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
  v_plano text := 'gratis';
begin
  select * into v_assinatura
  from public.assinaturas a
  where a.user_id = p_owner_user_id
  limit 1;

  if found
     and v_assinatura.status in ('active', 'trialing', 'past_due')
     and (v_assinatura.current_period_end is null or v_assinatura.current_period_end >= p_agora)
     and v_assinatura.plano in ('pro', 'empresa') then
    v_plano := v_assinatura.plano;
  end if;

  if found
     and v_assinatura.admin_override_ativo is true
     and (v_assinatura.admin_override_ate is null or v_assinatura.admin_override_ate >= p_agora)
     and v_assinatura.admin_plano_override in ('pro', 'empresa')
     and (v_plano = 'gratis' or v_assinatura.admin_plano_override = 'empresa') then
    v_plano := v_assinatura.admin_plano_override;
  end if;

  if v_plano = 'gratis' and exists (
    select 1 from public.trials_comerciais t
    where t.tenant_id = p_tenant_id
      and t.estado = 'active'
      and t.iniciado_em <= p_agora
      and t.termina_em > p_agora
  ) then
    return 'pro';
  end if;

  return v_plano;
end;
$$;

create or replace function public.plano_comercial_para_usuario(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_owner_user_id uuid;
  v_total integer;
begin
  if p_user_id is null then raise exception 'usuario_obrigatorio'; end if;

  select count(*) into v_total from public.organizacoes o where o.owner_user_id = p_user_id;
  if v_total > 1 then raise exception 'tenant_ambiguo'; end if;
  select o.id, o.owner_user_id into v_tenant_id, v_owner_user_id
  from public.organizacoes o where o.owner_user_id = p_user_id limit 1;

  if v_tenant_id is null then
    select count(*) into v_total
    from public.organizacao_membros m where m.user_id = p_user_id and m.ativo;
    if v_total > 1 then raise exception 'tenant_ambiguo'; end if;
    select o.id, o.owner_user_id into v_tenant_id, v_owner_user_id
    from public.organizacao_membros m
    join public.organizacoes o on o.id = m.org_id
    where m.user_id = p_user_id and m.ativo limit 1;
  end if;

  return public.plano_comercial_efetivo(
    coalesce(v_owner_user_id, p_user_id),
    coalesce(v_tenant_id, p_user_id),
    now()
  );
end;
$$;

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
  v_expira_em timestamptz;
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
      'permitido', true,
      'plano_efetivo', v_plano,
      'usados', 0,
      'restantes', null,
      'contabilizado_agora', false,
      'requer_confirmacao', false,
      'reserva_token', null,
      'trial_elegivel', false,
      'motivo', case when exists (
        select 1 from public.trials_comerciais t
        where t.tenant_id = v_contexto.tenant_id and t.estado = 'active' and t.termina_em > now()
      ) then 'trial_ativo' else 'plano_pago' end
    );
  end if;

  delete from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id
    and e.periodo = v_periodo
    and e.estado = 'reservado'
    and e.reserva_expira_em <= now();

  select count(*) into v_usados
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo;

  select e.estado, e.reserva_token, e.reserva_expira_em
  into v_estado, v_reserva_token, v_expira_em
  from public.orcamento_envios_gratis e
    where e.tenant_id = v_contexto.tenant_id
      and e.periodo = v_periodo
      and e.orcamento_id = trim(p_orcamento_id);
  if found then
    select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;
    return jsonb_build_object(
      'permitido', true, 'plano_efetivo', 'gratis', 'usados', v_usados,
      'restantes', greatest(0, 5 - v_usados), 'contabilizado_agora', false,
      'requer_confirmacao', v_estado = 'reservado',
      'reserva_token', case when v_estado = 'reservado' then v_reserva_token else null end,
      'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
    );
  end if;

  if v_usados >= 5 then
    insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
    values (v_contexto.tenant_id, v_contexto.owner_user_id, 'eligible', 'quota_limit', auth.uid())
    on conflict (tenant_id) do nothing;
    select estado into v_trial_estado from public.trials_comerciais where tenant_id = v_contexto.tenant_id;
    return jsonb_build_object(
      'permitido', false, 'plano_efetivo', 'gratis', 'usados', v_usados,
      'restantes', 0, 'contabilizado_agora', false,
      'requer_confirmacao', false, 'reserva_token', null,
      'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'cota_esgotada'
    );
  end if;

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
    'restantes', greatest(0, 5 - v_usados), 'contabilizado_agora', v_inseridos = 1,
    'requer_confirmacao', true, 'reserva_token', v_reserva_token,
    'trial_elegivel', v_trial_estado = 'eligible', 'motivo', 'dentro_da_cota'
  );
end;
$$;

create or replace function public.confirmar_envio_orcamento_gratis(
  p_orcamento_id text,
  p_reserva_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_periodo date := date_trunc('month', timezone('UTC', now()))::date;
  v_canal text;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':' || v_periodo::text, 0));

  update public.orcamento_envios_gratis e
  set estado = 'confirmado', confirmado_em = now()
  where e.tenant_id = v_contexto.tenant_id
    and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id)
    and e.reserva_token = p_reserva_token
    and e.estado = 'reservado'
    and e.reserva_expira_em > now()
  returning e.primeiro_canal into v_canal;

  if not found then
    return exists (
      select 1 from public.orcamento_envios_gratis e
      where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
        and e.orcamento_id = trim(p_orcamento_id) and e.estado = 'confirmado'
    );
  end if;

  insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
  values (
    v_contexto.tenant_id, v_contexto.owner_user_id, 'eligible',
    case v_canal when 'pdf' then 'first_pdf' when 'link' then 'first_link' else 'first_whatsapp' end,
    auth.uid()
  ) on conflict (tenant_id) do nothing;
  return true;
end;
$$;

create or replace function public.cancelar_reserva_envio_orcamento_gratis(
  p_orcamento_id text,
  p_reserva_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_periodo date := date_trunc('month', timezone('UTC', now()))::date;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  delete from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id)
    and e.reserva_token = p_reserva_token and e.estado = 'reservado';
  return found;
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
    'limite_envios', case when v_plano = 'gratis' then 5 else null end,
    'envios_usados', v_usados,
    'envios_restantes', case when v_plano = 'gratis' then greatest(0, 5 - v_usados) else null end,
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

create or replace function public.iniciar_trial_pro(p_gatilho text default 'pro_attempt')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_trial public.trials_comerciais%rowtype;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  if p_gatilho not in ('first_pdf', 'first_link', 'first_whatsapp', 'quota_limit', 'pro_attempt', 'ai_limit', 'radar_return') then
    raise exception 'gatilho_invalido';
  end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  if auth.uid() <> v_contexto.owner_user_id then raise exception 'somente_owner_inicia_trial'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':trial', 0));

  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id for update;
  if not found then raise exception 'trial_nao_elegivel'; end if;
  if v_trial.estado = 'active' and v_trial.termina_em > now() then
    return jsonb_build_object('iniciado', false, 'replay', true, 'termina_em', v_trial.termina_em);
  end if;
  if v_trial.estado <> 'eligible' then raise exception 'trial_ja_consumido'; end if;

  update public.trials_comerciais
  set estado = 'active', gatilho = p_gatilho, iniciado_em = now(),
      termina_em = now() + interval '14 days', atualizado_em = now()
  where tenant_id = v_contexto.tenant_id
  returning * into v_trial;

  return jsonb_build_object(
    'iniciado', true, 'replay', false, 'termina_em', v_trial.termina_em,
    'trial_dias', 14, 'requires_card', false, 'auto_renews', false,
    'data_disposition', 'preserve'
  );
end;
$$;

revoke all on function public.contexto_comercial_atual() from public, anon, authenticated;
revoke all on function public.plano_comercial_efetivo(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.plano_comercial_para_usuario(uuid) from public, anon, authenticated;
revoke all on function public.reservar_envio_orcamento_gratis(text,text) from public, anon;
revoke all on function public.confirmar_envio_orcamento_gratis(text,uuid) from public, anon;
revoke all on function public.cancelar_reserva_envio_orcamento_gratis(text,uuid) from public, anon;
revoke all on function public.meu_estado_oferta_comercial() from public, anon;
revoke all on function public.iniciar_trial_pro(text) from public, anon;
grant execute on function public.reservar_envio_orcamento_gratis(text,text) to authenticated;
grant execute on function public.confirmar_envio_orcamento_gratis(text,uuid) to authenticated;
grant execute on function public.cancelar_reserva_envio_orcamento_gratis(text,uuid) to authenticated;
grant execute on function public.meu_estado_oferta_comercial() to authenticated;
grant execute on function public.iniciar_trial_pro(text) to authenticated;
grant execute on function public.plano_comercial_para_usuario(uuid) to service_role;

comment on table public.orcamento_envios_gratis is
  'Cota mensal em duas fases: só a entrega confirmada consome; reserva falha pode ser cancelada e também expira.';
comment on table public.trials_comerciais is
  'Trial Pro opt-in, uma vez por tenant, 14 dias, sem cartão/auto-renovação; downgrade nunca apaga dados.';
