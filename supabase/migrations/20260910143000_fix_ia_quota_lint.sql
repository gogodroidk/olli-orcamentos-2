-- Corrige findings do advisor/lint sem mudar o contrato das RPCs.
-- Staging-first; produção só depois do gate de release.

-- O staging possui a PK lógica com nome legado e um índice auxiliar com outro
-- nome. A RPC abaixo usa a chave de colunas, sem depender de nomes de catálogo.

create or replace function public.reservar_cota_ia_diaria(
  p_user uuid,
  p_familia text,
  p_request_id text,
  p_limite_global integer,
  p_limite_usuario integer,
  p_unidades integer
)
returns table (
  estado text,
  dia date,
  usados_global integer,
  usados_usuario integer,
  limite_global integer,
  limite_usuario integer,
  unidades integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_familia text := pg_catalog.lower(pg_catalog.btrim(p_familia));
  v_request_id text := pg_catalog.btrim(p_request_id);
  v_usados_global integer;
  v_usados_usuario integer;
begin
  if p_user is null then raise exception 'p_user invalido' using errcode = '22023'; end if;
  if v_familia is null or v_familia not in ('openrouter', 'whisper') then
    raise exception 'p_familia invalida' using errcode = '22023';
  end if;
  if v_request_id is null
     or pg_catalog.char_length(v_request_id) not between 16 and 128
     or v_request_id !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'p_request_id invalido' using errcode = '22023';
  end if;
  if p_limite_global is null or p_limite_usuario is null or p_unidades is null
     or p_limite_global not between 1 and 1000000
     or p_limite_usuario not between 1 and p_limite_global
     or p_unidades not between 1 and p_limite_usuario then
    raise exception 'limites invalidos' using errcode = '22023';
  end if;

  insert into public.ia_cota_global_diaria (dia, familia)
  values (v_dia, v_familia)
  on conflict on constraint ia_cota_global_diaria_pkey do nothing;
  select g.usados into v_usados_global
  from public.ia_cota_global_diaria as g
  where g.dia = v_dia and g.familia = v_familia
  for update;
  if not found then raise exception 'contador global indisponivel' using errcode = '55000'; end if;

  insert into public.ia_cota_usuario_diaria (dia, familia, user_id)
  values (v_dia, v_familia, p_user)
  on conflict on constraint ia_cota_usuario_diaria_pkey do nothing;
  select u.usados into v_usados_usuario
  from public.ia_cota_usuario_diaria as u
  where u.dia = v_dia and u.familia = v_familia and u.user_id = p_user
  for update;
  if not found then raise exception 'contador de usuario indisponivel' using errcode = '55000'; end if;

  if exists (
    select 1 from public.ia_cota_reservas as r
    where r.dia = v_dia and r.familia = v_familia
      and r.user_id = p_user and r.request_id = v_request_id
  ) then
    return query select 'ja_reservado'::text, v_dia, v_usados_global,
      v_usados_usuario, p_limite_global, p_limite_usuario, p_unidades;
    return;
  end if;
  if v_usados_global > p_limite_global - p_unidades then
    return query select 'limite_global'::text, v_dia, v_usados_global,
      v_usados_usuario, p_limite_global, p_limite_usuario, p_unidades;
    return;
  end if;
  if v_usados_usuario > p_limite_usuario - p_unidades then
    return query select 'limite_usuario'::text, v_dia, v_usados_global,
      v_usados_usuario, p_limite_global, p_limite_usuario, p_unidades;
    return;
  end if;

  update public.ia_cota_global_diaria as g
  set usados = g.usados + p_unidades,
      atualizado_em = pg_catalog.clock_timestamp()
  where g.dia = v_dia and g.familia = v_familia
  returning g.usados into v_usados_global;
  update public.ia_cota_usuario_diaria as u
  set usados = u.usados + p_unidades,
      atualizado_em = pg_catalog.clock_timestamp()
  where u.dia = v_dia and u.familia = v_familia and u.user_id = p_user
  returning u.usados into v_usados_usuario;

  insert into public.ia_cota_reservas (
    dia, familia, user_id, request_id, unidades, limite_global, limite_usuario,
    usados_global_apos, usados_usuario_apos
  ) values (
    v_dia, v_familia, p_user, v_request_id, p_unidades, p_limite_global,
    p_limite_usuario, v_usados_global, v_usados_usuario
  );
  return query select 'permitido'::text, v_dia, v_usados_global,
    v_usados_usuario, p_limite_global, p_limite_usuario, p_unidades;
end;
$$;

create or replace function public.consumir_cota_ia(
  p_user uuid,
  p_acao text,
  p_ref text,
  p_limite integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_janela constant interval := interval '10 minutes';
  v_periodo text := pg_catalog.to_char((pg_catalog.now() at time zone 'utc'), 'YYYY-MM');
  -- O literal tipado evita o finding nullif(text, unknown) no advisor.
  v_acao text := coalesce(nullif(pg_catalog.btrim(p_acao), ''), 'voz_ia'::text);
  v_limite integer := greatest(coalesce(p_limite, 0), 0);
  v_usados integer;
  v_agora timestamptz := pg_catalog.now();
  v_bucket timestamptz;
begin
  if p_user is null then return 'indisponivel'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user::text || ':' || v_periodo || ':' || v_acao, 0)
  );

  if p_ref is not null and exists (
    select 1 from public.ia_uso_gratis as u
    where u.user_id = p_user and u.acao = v_acao and u.ref = p_ref
      and u.criado_em > v_agora - v_janela
  ) then
    return 'ja_contada';
  end if;

  select pg_catalog.count(*) into v_usados
  from public.ia_uso_gratis as u
  where u.user_id = p_user and u.periodo = v_periodo and u.acao = v_acao;
  if v_usados >= v_limite then return 'esgotada'; end if;

  v_bucket := pg_catalog.to_timestamp(
    (pg_catalog.floor(extract(epoch from v_agora) / extract(epoch from v_janela))
      * extract(epoch from v_janela))::double precision
  );
  insert into public.ia_uso_gratis (user_id, periodo, acao, ref, janela)
  values (p_user, v_periodo, v_acao, p_ref, v_bucket)
  on conflict do nothing;
  return 'consumida';
end;
$$;

create or replace function public.consumir_creditos_atomico(
  p_user uuid,
  p_custo integer,
  p_ref text,
  p_descricao text
)
returns table (estado text, saldo bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := pg_catalog.btrim(p_ref);
  v_descricao text := coalesce(
    nullif(pg_catalog.btrim(p_descricao), ''),
    'consumo'::text
  );
  v_saldo bigint;
  v_ref_user uuid;
begin
  if p_user is null then raise exception 'p_user invalido' using errcode = '22023'; end if;
  if p_custo is null or p_custo not between 1 and 1000000 then
    raise exception 'p_custo invalido' using errcode = '22023';
  end if;
  if v_ref is null or pg_catalog.char_length(v_ref) not between 1 and 512 then
    raise exception 'p_ref invalido' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_descricao) > 500 then
    raise exception 'p_descricao invalida' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('olli:creditos:' || p_user::text, 20260817)
  );

  select l.user_id into v_ref_user
  from public.credit_ledger as l
  where l.origem = 'consumo' and l.ref = v_ref
  limit 1;
  if found then
    if v_ref_user <> p_user then
      raise exception 'p_ref ja pertence a outro usuario' using errcode = '22023';
    end if;
    select coalesce(pg_catalog.sum(l.delta), 0)::bigint into v_saldo
    from public.credit_ledger as l where l.user_id = p_user;
    return query select 'ja_consumido'::text, v_saldo;
    return;
  end if;

  select coalesce(pg_catalog.sum(l.delta), 0)::bigint into v_saldo
  from public.credit_ledger as l where l.user_id = p_user;
  if v_saldo < p_custo then
    return query select 'sem_saldo'::text, v_saldo;
    return;
  end if;

  insert into public.credit_ledger (user_id, delta, origem, ref, descricao)
  values (p_user, -p_custo, 'consumo', v_ref, v_descricao);
  v_saldo := v_saldo - p_custo;
  return query select 'consumido'::text, v_saldo;
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

  select count(*) into v_usados
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo;

  -- A expiração é usada pelo DELETE acima; não precisa ser transportada como
  -- variável local, eliminando o warning de variável nunca lida.
  select e.estado, e.reserva_token into v_estado, v_reserva_token
  from public.orcamento_envios_gratis e
  where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
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
      'permitido', false, 'plano_efetivo', 'gratis', 'usados', v_usados, 'restantes', 0,
      'contabilizado_agora', false, 'requer_confirmacao', false, 'reserva_token', null,
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
