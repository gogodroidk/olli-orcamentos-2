-- Painel ADM, aba "E-mails" (Igor 09/11/2026, D-1859): saúde dos e-mails automáticos e candidatas à oferta do Pro.
-- Só leitura e só service_role: o worker chama depois de exigir papel admin + aal2 (admin.js). Nada devolve e-mail.
-- Depende de 20261108120000_oferta_pro_email.sql (private.oferta_pro_fatos).
begin;

create or replace function public.admin_emails_resumo(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz;
begin
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'admin_emails_argumentos_invalidos';
  end if;
  v_desde := pg_catalog.now() - pg_catalog.make_interval(days => p_dias);
  return pg_catalog.jsonb_build_object(
    'dias', p_dias,
    'porTemplate', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object('template', x.template, 'status', x.status, 'n', x.n)
               order by x.template, x.status)
        from (
          select o.template, o.status, pg_catalog.count(*)::integer as n
            from public.email_outbox o
           where o.created_at >= v_desde
           group by o.template, o.status
        ) x
    ), '[]'::jsonb),
    'supressoes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('motivo', y.motivo, 'n', y.n) order by y.motivo)
        from (
          select s.motivo, pg_catalog.count(*)::integer as n
            from public.email_supressoes s
           where s.criado_em >= v_desde
           group by s.motivo
        ) y
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_emails_resumo(integer) from public, anon, authenticated;
grant execute on function public.admin_emails_resumo(integer) to service_role;

-- Contas com uso real (pelo menos 1 orçamento não excluído), mais usadas primeiro, com os fatos da oferta do Pro.
-- p_user_ids filtra (até 50) para o envio: o worker remonta o texto só a partir do que o banco diz agora.
create or replace function public.admin_oferta_pro_candidatas(p_user_ids uuid[] default null, p_limite integer default 100)
returns table(candidata jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limite is null or p_limite < 1 or p_limite > 500
     or (p_user_ids is not null
         and (pg_catalog.cardinality(p_user_ids) < 1 or pg_catalog.cardinality(p_user_ids) > 50))
  then
    raise exception 'admin_emails_argumentos_invalidos';
  end if;
  return query
  with uso as (
    select o.user_id,
           pg_catalog.count(*)::integer as orcamentos,
           pg_catalog.max(coalesce(o.atualizado_em, o.criado_em)) as ultimo
      from public.orcamentos o
     where o.excluido_em is null
       and o.user_id is not null
       and (p_user_ids is null or o.user_id = any (p_user_ids))
     group by o.user_id
  ),
  envios as (
    select e.owner_user_id as user_id,
           (pg_catalog.count(*) filter (where e.confirmado_em is not null))::integer as total,
           (pg_catalog.count(*) filter (
              where e.confirmado_em is not null
                and e.periodo = pg_catalog.date_trunc('month', pg_catalog.timezone('UTC', pg_catalog.now()))::date
           ))::integer as mes
      from public.orcamento_envios_gratis e
     where p_user_ids is null or e.owner_user_id = any (p_user_ids)
     group by e.owner_user_id
  )
  select pg_catalog.jsonb_build_object(
           'userId', u.user_id,
           'orcamentos', u.orcamentos,
           'ultimoUso', u.ultimo,
           'enviosTotal', coalesce(e.total, 0),
           'enviosMes', coalesce(e.mes, 0),
           'nome', (select p.nome from public.profiles p where p.user_id = u.user_id limit 1),
           'empresa', (select og.nome from public.organizacoes og where og.owner_user_id = u.user_id order by og.id limit 1),
           'testeFim', (select pg_catalog.max(t.termina_em) from public.trials_comerciais t where t.owner_user_id = u.user_id),
           'fatos', private.oferta_pro_fatos(u.user_id, pg_catalog.now()) - 'userId'
         )
    from uso u
    left join envios e on e.user_id = u.user_id
   order by u.orcamentos desc, u.user_id
   limit p_limite;
end;
$$;
revoke all on function public.admin_oferta_pro_candidatas(uuid[], integer) from public, anon, authenticated;
grant execute on function public.admin_oferta_pro_candidatas(uuid[], integer) to service_role;

commit;
