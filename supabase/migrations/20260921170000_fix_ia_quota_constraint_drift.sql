-- Corrige o drift entre a função da cota e os nomes reais das constraints em
-- produção. A migração de lint de 2026-09-10 referenciou *_pkey, mas o schema
-- canônico usa *_pk; isso fazia o PostgREST retornar 42704 antes de reservar
-- qualquer unidade e deixava o Assistente bloqueado com limite_indisponivel.
-- A função continua atômica, service_role-only e sem alterar dados existentes.

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
  if p_user is null then
    raise exception 'p_user invalido' using errcode = '22023';
  end if;
  if v_familia is null or v_familia not in ('openrouter', 'whisper') then
    raise exception 'p_familia invalida' using errcode = '22023';
  end if;
  if v_request_id is null
     or pg_catalog.char_length(v_request_id) not between 16 and 128
     or v_request_id !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'p_request_id invalido' using errcode = '22023';
  end if;
  if p_limite_global is null
     or p_limite_usuario is null
     or p_unidades is null
     or p_limite_global not between 1 and 1000000
     or p_limite_usuario not between 1 and p_limite_global
     or p_unidades not between 1 and p_limite_usuario then
    raise exception 'limites invalidos' using errcode = '22023';
  end if;

  -- Os nomes das constraints são os do schema real: *_pk, não *_pkey.
  insert into public.ia_cota_global_diaria (dia, familia)
  values (v_dia, v_familia)
  on conflict on constraint ia_cota_global_diaria_pk do nothing;
  select g.usados into v_usados_global
    from public.ia_cota_global_diaria as g
   where g.dia = v_dia and g.familia = v_familia
   for update;
  if not found then
    raise exception 'contador global indisponivel' using errcode = '55000';
  end if;

  insert into public.ia_cota_usuario_diaria (dia, familia, user_id)
  values (v_dia, v_familia, p_user)
  on conflict on constraint ia_cota_usuario_diaria_pk do nothing;
  select u.usados into v_usados_usuario
    from public.ia_cota_usuario_diaria as u
   where u.dia = v_dia and u.familia = v_familia and u.user_id = p_user
   for update;
  if not found then
    raise exception 'contador de usuario indisponivel' using errcode = '55000';
  end if;

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

comment on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer) is
  'Reserva atomicamente unidades de cota diária antes do dispatch; usa constraints *_pk do schema canônico.';

revoke all on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer)
  to service_role;
