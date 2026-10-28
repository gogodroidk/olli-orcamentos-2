-- OLLI — DEVOLVER A COTA DIÁRIA DE IA QUANDO O PROVEDOR FALHA (critério do CPO no hotfix D-1527).
-- `reservar_cota_ia_diaria` reserva 1 unidade ANTES da chamada (anti-abuso/custo) e não devolvia nada:
-- falha do provedor (cota grátis do Workers AI, capacidade, prazo, resposta vazia) gastava 1 das 15 do dia.
-- Esta RPC desfaz UMA reserva pelo request_id: apaga a linha e desconta as duas contagens.
-- Mesma ordem de locks da reserva (global -> usuário). Só service_role. Idempotente: 2ª chamada = false.
-- O uso do Grátis (ia_uso_gratis) não passa por aqui: ele só é cobrado depois da resposta válida.
begin;

create or replace function public.devolver_cota_ia_diaria(
  p_user uuid,
  p_familia text,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date;
  v_unidades integer;
begin
  if p_user is null or p_familia is null or p_request_id is null then return false; end if;
  select r.dia into v_dia from public.ia_cota_reservas r
    where r.user_id = p_user and r.familia = p_familia and r.request_id = p_request_id;
  if not found then return false; end if;

  perform 1 from public.ia_cota_global_diaria g where g.dia = v_dia and g.familia = p_familia for update;
  perform 1 from public.ia_cota_usuario_diaria u
    where u.dia = v_dia and u.familia = p_familia and u.user_id = p_user for update;

  delete from public.ia_cota_reservas r
    where r.dia = v_dia and r.familia = p_familia and r.user_id = p_user and r.request_id = p_request_id
    returning r.unidades into v_unidades;
  if v_unidades is null then return false; end if;

  update public.ia_cota_global_diaria
    set usados = greatest(0, usados - v_unidades), atualizado_em = pg_catalog.clock_timestamp()
    where dia = v_dia and familia = p_familia;
  update public.ia_cota_usuario_diaria
    set usados = greatest(0, usados - v_unidades), atualizado_em = pg_catalog.clock_timestamp()
    where dia = v_dia and familia = p_familia and user_id = p_user;
  return true;
end;
$$;

revoke all on function public.devolver_cota_ia_diaria(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.devolver_cota_ia_diaria(uuid, text, text) to service_role;

commit;
