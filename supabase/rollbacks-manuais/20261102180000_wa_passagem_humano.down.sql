-- ROLLBACK MANUAL (aplicar só DEPOIS do .down de wa_resposta_ia). Volta as 4 funções ao original de 20261007110000_whatsapp_cloud_multinumero.sql.
-- CONFERIR antes contra pg_get_functiondef em prod: o original pode ter sido editado depois.
-- Antes: UPDATE de linhas com estado='humano' para 'novo' (senão o CHECK antigo falha). Aqui já incluído.
begin;
update public.wa_entrada set estado = 'novo' where estado = 'humano';
alter table public.wa_entrada drop constraint if exists wa_entrada_motivo_check;
alter table public.wa_entrada drop constraint if exists wa_entrada_estado_check;
alter table public.wa_entrada add constraint wa_entrada_estado_check check (estado in ('novo','em_atendimento','resolvido','saiu'));
alter table public.wa_entrada drop column if exists motivo;
drop function if exists private.wa_passagem_humano(text, boolean);
create or replace function public.wa_registrar_entradas(p_phone_number_id text, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item    jsonb;
  v_tel     text;
  v_tipo    text;
  v_ts      timestamptz;
  v_texto   text;
  v_registr integer := 0;
  v_dup     integer := 0;
  v_saiu    integer := 0;
  v_ign     integer := 0;
  v_id      bigint;
  v_sair    boolean;
begin
  if p_itens is null or pg_catalog.jsonb_typeof(p_itens) <> 'array' or pg_catalog.jsonb_array_length(p_itens) > 100 then
    raise exception 'wa_itens_invalidos';
  end if;
  if not exists (select 1 from public.wa_numeros where phone_number_id = p_phone_number_id and ativo) then
    return pg_catalog.jsonb_build_object('registradas', 0, 'duplicadas', 0, 'saiu', 0,
                                         'ignoradas', pg_catalog.jsonb_array_length(p_itens), 'motivo', 'numero_inativo');
  end if;

  for v_item in select * from pg_catalog.jsonb_array_elements(p_itens) loop
    v_tel := private.telefone_whatsapp_br(v_item ->> 'telefone');
    v_tipo := pg_catalog.lower(coalesce(v_item ->> 'tipo', 'desconhecido'));
    if v_tel is null or (v_item ->> 'id') is null or v_tipo !~ '^[a-z_]{2,30}$' then
      v_ign := v_ign + 1;
      continue;
    end if;
    v_ts := coalesce(pg_catalog.to_timestamp(nullif(v_item ->> 'ts', '')::double precision), pg_catalog.now());
    if v_ts > pg_catalog.now() + interval '5 minutes' then v_ts := pg_catalog.now(); end if;
    v_texto := pg_catalog.left(v_item ->> 'texto', 4096);
    v_sair := private.wa_texto_pede_sair(v_texto);

    v_id := null;
    insert into public.wa_entrada (phone_number_id, wa_message_id, telefone, perfil_nome, tipo, texto, recebido_em, estado)
    values (p_phone_number_id, v_item ->> 'id', v_tel, pg_catalog.left(v_item ->> 'perfil', 80), v_tipo, v_texto, v_ts,
            case when v_sair then 'saiu' else 'novo' end)
    on conflict (wa_message_id) do nothing
    returning id into v_id;

    if v_id is null then
      v_dup := v_dup + 1;
      continue;
    end if;
    v_registr := v_registr + 1;

    insert into public.wa_contatos (phone_number_id, telefone, ultima_entrada_em)
    values (p_phone_number_id, v_tel, v_ts)
    on conflict (phone_number_id, telefone)
    do update set ultima_entrada_em = greatest(coalesce(public.wa_contatos.ultima_entrada_em, excluded.ultima_entrada_em),
                                               excluded.ultima_entrada_em);

    if v_sair then
      perform public.registrar_nao_contatar_whatsapp(null, v_tel, 'pediu_sair', 'whatsapp');
      v_saiu := v_saiu + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object('registradas', v_registr, 'duplicadas', v_dup, 'saiu', v_saiu, 'ignoradas', v_ign);
end;
$$;
revoke all on function public.wa_registrar_entradas(text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_registrar_entradas(text, jsonb) to service_role;

create or replace function public.wa_fila_entrada(p_limit integer default 50)
returns table (id bigint, phone_number_id text, marca text, telefone text, perfil_nome text, tipo text,
               texto text, recebido_em timestamptz, estado text, janela_aberta_ate timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select e.id, e.phone_number_id, n.marca, e.telefone, e.perfil_nome, e.tipo, e.texto, e.recebido_em, e.estado,
         c.ultima_entrada_em + interval '24 hours'
  from public.wa_entrada e
  join public.wa_numeros n on n.phone_number_id = e.phone_number_id
  left join public.wa_contatos c on c.phone_number_id = e.phone_number_id and c.telefone = e.telefone
  where e.estado in ('novo', 'em_atendimento')
  order by e.recebido_em
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke all on function public.wa_fila_entrada(integer) from public, anon, authenticated;
grant execute on function public.wa_fila_entrada(integer) to service_role;

create or replace function public.wa_fila_atualizar(p_id bigint, p_estado text, p_atribuido_a text default null)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_estado is null or p_estado not in ('em_atendimento', 'resolvido') then return false; end if;
  update public.wa_entrada
     set estado = p_estado, atribuido_a = coalesce(pg_catalog.left(p_atribuido_a, 60), atribuido_a)
   where id = p_id and estado in ('novo', 'em_atendimento');
  return found;
end;
$$;
revoke all on function public.wa_fila_atualizar(bigint, text, text) from public, anon, authenticated;
grant execute on function public.wa_fila_atualizar(bigint, text, text) to service_role;

create or replace function public.wa_retencao_limpar(p_agora timestamptz default pg_catalog.now())
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_resolvidas integer;
  v_paradas integer;
  v_envios integer;
  v_contatos integer;
begin
  delete from public.wa_entrada
   where estado in ('resolvido', 'saiu') and recebido_em < p_agora - interval '180 days';
  get diagnostics v_resolvidas = row_count;

  delete from public.wa_entrada
   where estado in ('novo', 'em_atendimento') and recebido_em < p_agora - interval '12 months';
  get diagnostics v_paradas = row_count;

  delete from public.wa_envios where criado_em < p_agora - interval '12 months';
  get diagnostics v_envios = row_count;

  delete from public.wa_contatos c
   where coalesce(c.ultima_entrada_em, c.criado_em) < p_agora - interval '12 months'
     and not exists (select 1 from public.wa_entrada e where e.phone_number_id = c.phone_number_id and e.telefone = c.telefone)
     and not exists (select 1 from public.wa_envios v where v.phone_number_id = c.phone_number_id and v.telefone = c.telefone);
  get diagnostics v_contatos = row_count;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'entrada_resolvida_180d', v_resolvidas,
    'entrada_parada_12m', v_paradas,
    'envios_12m', v_envios,
    'contatos_12m', v_contatos
  );
end;
$$;
revoke all on function public.wa_retencao_limpar(timestamptz) from public, anon, authenticated;
grant execute on function public.wa_retencao_limpar(timestamptz) to service_role;

commit;
