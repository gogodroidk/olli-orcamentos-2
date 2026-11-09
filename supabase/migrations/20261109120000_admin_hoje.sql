-- Painel ADM, "O que fazer hoje" + "Números do mês" + aviso de saúde (Igor 09/11/2026, D-1859 e D-1861).
-- Leitura única, só service_role: o worker chama depois de exigir papel admin + aal2 (admin.js). Nada devolve e-mail.
-- Cada bloco é calculado à parte: se um falhar, ele vem NULL (o painel mostra "indisponível", nunca zero) e os
-- outros continuam. Contas internas (dono, funil_exclusoes, admin_memberships) ficam fora, como na receita do painel.
-- Origem dos dados (sem tabela nova):
--   Pix gerado:   webhook_events origem 'pix_cobranca' / tipo 'plano_pix_criada' (abacate.js, criarPixPlano)
--   Pix pago:     webhook_events origem 'abacate' (consumo único; payload {user_id, plano, valor_centavos})
--   Limite:       orcamento_envios_gratis (estado 'confirmado') x limite_gratis_config.limite
--   Teste do Pro: trials_comerciais
--   E-mail falho: email_outbox status 'dead_letter' (menos o descarte intencional 'descartado_antes_do_envio')
-- Depende de 20261008100000 (admin_assinaturas_pagantes, receita_conta_interna) e 20261026040000 (private.timestamptz_ou_nulo).
begin;

create or replace function public.admin_hoje(p_emails_excluidos text[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := pg_catalog.now();
  v_mes_ini timestamptz := pg_catalog.date_trunc('month', pg_catalog.timezone('America/Sao_Paulo', pg_catalog.now())) at time zone 'America/Sao_Paulo';
  v_periodo date := pg_catalog.date_trunc('month', pg_catalog.timezone('UTC', pg_catalog.now()))::date;
  v_limite integer;
  v_corte timestamptz;
  v_corte_antigas timestamptz;
  v_pix jsonb;
  v_limite_lista jsonb;
  v_testes jsonb;
  v_entrou bigint;
  v_pagantes integer;
  v_convertidos integer;
  v_emails jsonb;
  v_pix_sem_plano jsonb;
begin

  -- (a) Pix do plano gerado nos últimos 7 dias e ainda não pago (1 por conta, o mais recente).
  begin
    with cobr as (
      select w.event_id, w.recebido_em as criado, w.payload->>'plano' as plano,
             private.timestamptz_ou_nulo(w.payload->>'expires_at') as vence,
             case when w.payload->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (w.payload->>'user_id')::uuid end as uid
        from public.webhook_events w
       where w.origem = 'pix_cobranca' and w.tipo = 'plano_pix_criada'
         and w.recebido_em >= v_agora - interval '7 days'
    ), pend as (
      select distinct on (c.uid) c.*
        from cobr c
       where c.uid is not null
         and not exists (select 1 from public.webhook_events p
                          where p.origem = 'abacate'
                            and (p.event_id = c.event_id
                                 or (p.payload->>'user_id' = c.uid::text and p.recebido_em >= c.criado)))
         and public.receita_conta_interna(c.uid, p_emails_excluidos) is null
         -- quem já tem assinatura paga não entra (não cobrar de novo quem já paga)
         and not exists (select 1 from public.admin_assinaturas_pagantes(p_emails_excluidos) ap where ap.user_id = c.uid)
       order by c.uid, c.criado desc
    )
    select pg_catalog.jsonb_build_object(
             'total', (select pg_catalog.count(*) from pend),
             'itens', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                        'userId', x.uid, 'plano', x.plano, 'criadoEm', x.criado, 'venceEm', x.vence,
                        'vencido', x.vence is not null and x.vence < v_agora,
                        'nome', (select pr.nome from public.profiles pr where pr.user_id = x.uid limit 1),
                        'empresa', (select og.nome from public.organizacoes og where og.owner_user_id = x.uid order by og.id limit 1)
                      ) order by x.criado desc)
                 from (select * from pend order by criado desc limit 50) x), '[]'::jsonb))
      into v_pix;
  exception when others then v_pix := null;
  end;

  -- (b) Contas que já bateram o limite do Grátis neste mês (envios confirmados >= limite) e não são Pro/teste ativo.
  --     'limitada' segue a regra do banco (20261024150000): criada >= corte OU now() >= corte_antigas.
  --     'corteAtivo' = alguma conta já pode ser barrada agora.
  begin
    select c.limite, c.corte, c.corte_antigas into v_limite, v_corte, v_corte_antigas from public.limite_gratis_config c where c.id;
    if v_limite is null then
      v_limite_lista := null;
    else
      with envios as (
        select e.owner_user_id as uid, e.tenant_id, pg_catalog.count(*)::integer as n
          from public.orcamento_envios_gratis e
         where e.periodo = v_periodo and e.estado = 'confirmado'
         group by e.owner_user_id, e.tenant_id
        having pg_catalog.count(*) >= v_limite
      ), bateu as (
        select v.uid, pg_catalog.sum(v.n)::integer as n,
               pg_catalog.bool_or(u.created_at is not null and (
                 (v_corte is not null and u.created_at >= v_corte)
                 or (v_corte_antigas is not null and v_agora >= v_corte_antigas))) as limitada
          from envios v
          left join auth.users u on u.id = v.uid
         where public.plano_comercial_efetivo(v.uid, v.tenant_id, v_agora) not in ('pro', 'empresa')
           and public.receita_conta_interna(v.uid, p_emails_excluidos) is null
         group by v.uid
      )
      select pg_catalog.jsonb_build_object(
               'limite', v_limite,
               'corteAtivo', (v_corte is not null and v_agora >= v_corte)
                             or (v_corte_antigas is not null and v_agora >= v_corte_antigas),
               'total', (select pg_catalog.count(*) from bateu),
               'itens', coalesce((
                 select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                          'userId', x.uid, 'envios', x.n, 'limitada', x.limitada,
                          'nome', (select pr.nome from public.profiles pr where pr.user_id = x.uid limit 1),
                          'empresa', (select og.nome from public.organizacoes og where og.owner_user_id = x.uid order by og.id limit 1)
                        ) order by x.n desc, x.uid)
                   from (select * from bateu order by n desc, uid limit 50) x), '[]'::jsonb))
        into v_limite_lista;
    end if;
  exception when others then v_limite_lista := null;
  end;

  -- (c) Teste do Pro terminando nos próximos 3 dias.
  begin
    with t as (
      select tc.owner_user_id as uid, tc.termina_em
        from public.trials_comerciais tc
       where tc.estado = 'active' and tc.termina_em > v_agora and tc.termina_em <= v_agora + interval '3 days'
         and public.receita_conta_interna(tc.owner_user_id, p_emails_excluidos) is null
    )
    select pg_catalog.jsonb_build_object(
             'total', (select pg_catalog.count(*) from t),
             'itens', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                        'userId', x.uid, 'terminaEm', x.termina_em,
                        'nome', (select pr.nome from public.profiles pr where pr.user_id = x.uid limit 1),
                        'empresa', (select og.nome from public.organizacoes og where og.owner_user_id = x.uid order by og.id limit 1)
                      ) order by x.termina_em, x.uid)
                 from (select * from t order by termina_em, uid limit 50) x), '[]'::jsonb))
      into v_testes;
  exception when others then v_testes := null;
  end;

  -- Números do mês. Pix recebido = consumo confirmado pela AbacatePay no mês (fuso de Brasília), sem conta interna.
  begin
    select coalesce(pg_catalog.sum((w.payload->>'valor_centavos')::bigint), 0)::bigint into v_entrou
      from public.webhook_events w
     where w.origem = 'abacate' and w.tipo = 'plano_pix' and w.status = 'processado'
       and w.recebido_em >= v_mes_ini
       and w.payload->>'valor_centavos' ~ '^[0-9]{1,12}$'
       and case when w.payload->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then public.receita_conta_interna((w.payload->>'user_id')::uuid, p_emails_excluidos) is null
                else true end;
  exception when others then v_entrou := null;
  end;
  begin
    select pg_catalog.count(*)::integer into v_pagantes from public.admin_assinaturas_pagantes(p_emails_excluidos);
  exception when others then v_pagantes := null;
  end;
  begin
    select pg_catalog.count(*)::integer into v_convertidos
      from public.trials_comerciais tc
     where tc.estado = 'converted' and tc.convertido_em >= v_mes_ini
       and public.receita_conta_interna(tc.owner_user_id, p_emails_excluidos) is null;
  exception when others then v_convertidos := null;
  end;

  -- Saúde: e-mail em dead_letter nas últimas 24 h (sem o descarte intencional) e Pix pago que não liberou o plano
  -- (consumo 'falhou', ou 'recebido' há mais de 15 min: a concessão não terminou).
  begin
    select pg_catalog.jsonb_build_object(
             'total', coalesce(pg_catalog.sum(x.n), 0)::integer,
             'porTemplate', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('template', x.template, 'n', x.n) order by x.n desc), '[]'::jsonb))
      into v_emails
      from (
        select o.template, pg_catalog.count(*)::integer as n
          from public.email_outbox o
         where o.status = 'dead_letter'
           and coalesce(o.error_code, '') <> 'descartado_antes_do_envio'
           and o.updated_at >= v_agora - interval '24 hours'
         group by o.template
      ) x;
  exception when others then v_emails := null;
  end;
  begin
    with f as (
      select w.event_id, w.status, w.recebido_em, w.payload->>'plano' as plano,
             case when w.payload->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (w.payload->>'user_id')::uuid end as uid
        from public.webhook_events w
       where w.origem = 'abacate' and w.tipo = 'plano_pix'
         and w.recebido_em >= v_agora - interval '7 days'
         and (w.status = 'falhou' or (w.status = 'recebido' and w.recebido_em < v_agora - interval '15 minutes'))
    ), f2 as (
      select * from f where uid is null or public.receita_conta_interna(uid, p_emails_excluidos) is null
    )
    select pg_catalog.jsonb_build_object(
             'total', (select pg_catalog.count(*) from f2),
             'itens', coalesce((
               select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                        'userId', x.uid, 'plano', x.plano, 'recebidoEm', x.recebido_em, 'status', x.status
                      ) order by x.recebido_em desc)
                 from (select * from f2 order by recebido_em desc limit 20) x), '[]'::jsonb))
      into v_pix_sem_plano;
  exception when others then v_pix_sem_plano := null;
  end;

  return pg_catalog.jsonb_build_object(
    'geradoEm', v_agora,
    'pixPendentes', v_pix,
    'limiteGratis', v_limite_lista,
    'testesTerminando', v_testes,
    'mes', pg_catalog.jsonb_build_object(
      'entrouCentavos', v_entrou, 'pagantes', v_pagantes, 'testesViraramPagantes', v_convertidos),
    'saude', pg_catalog.jsonb_build_object('emailsFalhos24h', v_emails, 'pixPagoSemPlano', v_pix_sem_plano)
  );
end;
$$;

revoke all on function public.admin_hoje(text[]) from public, anon, authenticated;
grant execute on function public.admin_hoje(text[]) to service_role;

commit;
