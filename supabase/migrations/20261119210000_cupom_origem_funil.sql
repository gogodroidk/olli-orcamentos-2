-- Cupom de influenciador — consulta por código: de onde vieram os cadastros e até onde chegaram.
-- A origem do cadastro já grava o código (user_metadata.origem_utm.*_toque.cupom, vindo do link ?cupom=CODIGO);
-- aqui só se LÊ. Sem tabela nem campo novo. Devolve SÓ contagens (nenhum e-mail, nome ou id).
-- Conta de teste/interna (funil_exclusoes) fica de fora. Nasce sem efeito: nada chama esta função
-- além da rota do admin (AAL2). NÃO aplicada: o integrador aplica. Idempotente (create or replace).
--
--   cadastros  = contas cuja origem (primeiro OU último toque) trouxe o código
--   orcaram    = destas, as que enviaram ao menos 1 orçamento (funil_marcos.orcamento_enviado)
--   pagaram    = destas, as que pagaram (funil_marcos.pagou, não estimado)
create or replace function public.cupom_origem_funil(p_codigo text)
returns table (codigo text, cadastros bigint, orcaram bigint, pagaram bigint)
language sql
stable
security definer
set search_path to ''
as $$
  with cod as (select upper(btrim(coalesce(p_codigo, ''))) as c),
  contas as (
    select u.id
      from auth.users u, cod
     where cod.c ~ '^[A-Z0-9]{4,20}$'
       and u.deleted_at is null
       and (upper(u.raw_user_meta_data -> 'origem_utm' -> 'primeiro_toque' ->> 'cupom') = cod.c
         or upper(u.raw_user_meta_data -> 'origem_utm' -> 'ultimo_toque' ->> 'cupom') = cod.c)
       and not exists (
             select 1 from public.funil_exclusoes e
              where e.user_id = u.id or (e.email is not null and lower(e.email) = lower(u.email::text)))
  )
  select (select c from cod),
         (select count(*) from contas),
         (select count(*) from contas k where exists (
            select 1 from public.funil_marcos m where m.user_id = k.id and m.marco = 'orcamento_enviado')),
         (select count(*) from contas k where exists (
            select 1 from public.funil_marcos m where m.user_id = k.id and m.marco = 'pagou' and not m.estimado))
$$;
revoke all on function public.cupom_origem_funil(text) from public, anon, authenticated;
grant execute on function public.cupom_origem_funil(text) to service_role;
