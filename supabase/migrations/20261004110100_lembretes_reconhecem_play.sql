-- Lembretes e funil reconhecem a assinatura da GOOGLE PLAY (item 55; R6).
--
-- Desde o Play Billing direto (worker/src/play.js), quem assina pela Play tem a
-- linha de public.assinaturas com `revenuecat_transacao_id` = SHA-256 do
-- purchaseToken (nome antigo da coluna mantido — decisão C4) e SEM
-- stripe_subscription_id/mp_preapproval_id. Dois lugares só conheciam Stripe e
-- Mercado Pago como "recorrente":
--
--  1. listar_candidatos_lembrete_email (última versão: 20261002150000): a flag
--     `recorrente` decide se o e-mail de vencimento diz "renove com Pix". Para a
--     Play isso seria cobrança em dobro — a Play renova sozinha. Cópia INTEGRAL da
--     função de 20261002150000 com UMA mudança: `recorrente` também é verdadeiro
--     com vínculo da Play.
--  2. funil_marco_assinatura (20260930120100): o marco "pagou" ganha a origem
--     'google_play' (antes cairia em 'avulso', como se fosse Pix) e NÃO conta
--     compra de licença de teste (play_compras.teste) como receita.
--
-- Depende de 20261004110000_play_compras.sql (o trigger consulta play_compras).

-- ─── 1. Lembretes: a Play é recorrente ──────────────────────────────────────
create or replace function public.listar_candidatos_lembrete_email(
  p_now               timestamptz default pg_catalog.now(),
  p_ativacao_max_dias integer default 30,
  p_limit             integer default 50
)
returns table (candidato jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_periodo date;
begin
  if p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 day'
     or p_ativacao_max_dias is null or p_ativacao_max_dias < 7 or p_ativacao_max_dias > 60
     or p_limit is null or p_limit < 1 or p_limit > 200
  then
    raise exception 'candidatos_argumentos_invalidos';
  end if;

  v_periodo := pg_catalog.date_trunc('month', pg_catalog.timezone('UTC', p_now))::date;

  return query
  with usuarios as (
    select u.id as user_id, u.email_confirmed_at
    from auth.users u
    where u.email is not null
      and pg_catalog.btrim(u.email) <> ''
      and u.email_confirmed_at is not null
      and u.email_confirmed_at <= p_now
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= p_now)
      and coalesce(u.is_anonymous, false) = false
      and not exists (select 1 from public.email_supressoes s where s.user_id = u.id)
  ), base as (
    select
      us.user_id,
      us.email_confirmed_at,
      (
        select pg_catalog.count(*)
        from public.orcamentos o
        where (o.user_id = us.user_id or o.criado_por = us.user_id)
          and o.excluido_em is null
      ) as orcamentos,
      (select pg_catalog.count(*) from public.organizacoes o where o.owner_user_id = us.user_id) as orgs_dono,
      (
        select pg_catalog.count(*)
        from public.organizacao_membros m
        where m.user_id = us.user_id and m.ativo
      ) as membro_ativo
    from usuarios us
  ), contexto as (
    -- Mesmo desenho de contexto_comercial_atual(): dono de 1 org = tenant da org;
    -- sem org e sem equipe = conta solo (tenant = a própria conta); membro de
    -- equipe alheia ou ambíguo = sem tenant próprio (não recebe cobrança).
    select
      b.*,
      case
        when b.orgs_dono = 1 then (
          select o.id from public.organizacoes o where o.owner_user_id = b.user_id limit 1
        )
        when b.orgs_dono = 0 and b.membro_ativo = 0 then b.user_id
        else null
      end as tenant_id
    from base b
  ), enriquecido as (
    select
      c.*,
      a.plano as a_plano,
      a.status as a_status,
      a.current_period_end as a_period_end,
      a.admin_plano_override as a_override,
      a.admin_override_ativo as a_override_ativo,
      a.admin_override_ate as a_override_ate,
      (a.user_id is not null) as tem_assinatura,
      (
        coalesce(pg_catalog.btrim(a.stripe_subscription_id), '') <> ''
        or coalesce(pg_catalog.btrim(a.mp_preapproval_id), '') <> ''
        -- Google Play (Play Billing direto): a Play renova sozinha e cobra pela
        -- conta Google. "Renove com Pix" aqui seria cobrança em dobro (e, dentro
        -- do Android, pagamento fora da Play). Vínculo = hash do purchaseToken.
        or coalesce(pg_catalog.btrim(a.revenuecat_transacao_id), '') <> ''
      ) as recorrente,
      (
        select pg_catalog.count(*)
        from public.orcamento_envios_gratis e
        where c.tenant_id is not null
          and e.tenant_id = c.tenant_id
          and e.periodo = v_periodo
          and (e.estado = 'confirmado' or e.reserva_expira_em > p_now)
      ) as envios_usados
    from contexto c
    left join public.assinaturas a on a.user_id = c.user_id
  ), filtrado as (
    select e.*
    from enriquecido e
    where
      -- Ativação: conta solo/dona, zero orçamento, confirmada entre 3 e N dias.
      (
        e.orcamentos = 0
        and not (e.orgs_dono = 0 and e.membro_ativo > 0)
        and e.email_confirmed_at >= p_now - pg_catalog.make_interval(days => p_ativacao_max_dias)
        and e.email_confirmed_at <= p_now - interval '72 hours'
        and (
          select pg_catalog.count(*)
          from public.email_outbox o
          where o.user_id = e.user_id and o.purpose = 'activation_reminder'
        ) < 2
      )
      or
      -- Assinatura: dono do tenant, já tem orçamento, e perto do VENCIMENTO.
      -- (Desde 01/10/2026 o Grátis é ilimitado: "perto da cota" deixou de existir.)
      (
        e.orcamentos >= 1
        and e.tenant_id is not null
        and e.tem_assinatura
        and e.a_period_end is not null
        and e.a_period_end between p_now - interval '4 days' and p_now + interval '4 days'
      )
  )
  select pg_catalog.jsonb_build_object(
    'userId', f.user_id,
    'confirmadoEm', f.email_confirmed_at,
    'orcamentos', least(f.orcamentos, 1000),
    'membroDeEquipe', (f.orgs_dono = 0 and f.membro_ativo > 0),
    'donoDoTenant', (f.tenant_id is not null),
    'assinatura', case when f.tem_assinatura then pg_catalog.jsonb_build_object(
      'plano', f.a_plano,
      'status', f.a_status,
      'current_period_end', f.a_period_end,
      'admin_plano_override', f.a_override,
      'admin_override_ativo', f.a_override_ativo,
      'admin_override_ate', f.a_override_ate,
      'recorrente', f.recorrente
    ) else null end,
    'oferta', case when f.tenant_id is null then null else (
      select pg_catalog.jsonb_build_object(
        'plano_efetivo', pl.plano,
        'limite_envios', null,
        'envios_usados', f.envios_usados,
        'envios_restantes', null,
        'trial_estado', case
          when t.estado = 'active' and t.termina_em <= p_now then 'ended'
          else coalesce(t.estado, 'unstarted')
        end,
        'trial_termina_em', t.termina_em,
        'trial_dias', 14
      )
      from (select public.plano_comercial_efetivo(f.user_id, f.tenant_id, p_now) as plano) pl
      left join public.trials_comerciais t on t.tenant_id = f.tenant_id
    ) end,
    'historico', pg_catalog.jsonb_build_object(
      'ativacao', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'chave', o.idempotency_key,
            'janela', o.template_dados ->> 'janela',
            'em', o.created_at
          ) order by o.created_at, o.id
        )
        from public.email_outbox o
        where o.user_id = f.user_id and o.purpose = 'activation_reminder'
      ), '[]'::jsonb),
      'cobranca', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'chave', o.idempotency_key,
            'sequencia', o.template_dados ->> 'sequencia',
            'em', o.created_at
          ) order by o.created_at, o.id
        )
        from public.email_outbox o
        where o.user_id = f.user_id
          and o.purpose = 'billing_reminder'
          and o.created_at > p_now - interval '7 days'
      ), '[]'::jsonb)
    )
  )
  from filtrado f
  order by f.email_confirmed_at, f.user_id
  limit p_limit;
end;
$$;

revoke all on function public.listar_candidatos_lembrete_email(timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.listar_candidatos_lembrete_email(timestamptz, integer, integer)
  to service_role;

-- ─── 2. Funil: origem 'google_play' e compra de teste não é receita ─────────
alter table public.funil_marcos drop constraint if exists funil_marcos_origem_check;
alter table public.funil_marcos add constraint funil_marcos_origem_check check (origem in (
  'empresa', 'orcamento', 'stripe', 'mercado_pago', 'google_play', 'avulso', 'retroativo'
));

-- Mesma função de 20260930120100 com a origem da Play e o filtro de teste.
create or replace function public.funil_marco_assinatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.plano in ('pro', 'empresa')
     and not public.funil_assinatura_ficticia(new.stripe_subscription_id, new.stripe_customer_id)
     -- Licença de teste da Play compra "de verdade" no app de produção, mas não é
     -- dinheiro: não vira marco de pagamento.
     and not exists (
       select 1 from public.play_compras p
        where new.revenuecat_transacao_id is not null
          and p.token_sha256 = new.revenuecat_transacao_id
          and p.teste
     )
  then
    perform public.funil_registrar_marco(
      new.user_id,
      'pagou',
      case
        when new.stripe_subscription_id is not null then 'stripe'
        when new.mp_preapproval_id is not null then 'mercado_pago'
        when new.revenuecat_transacao_id is not null then 'google_play'
        -- Pagamento avulso: Pix (AbacatePay/Mercado Pago) ou 12x da Stripe.
        else 'avulso'
      end
    );
  end if;
  return null;
end;
$$;

revoke all on function public.funil_marco_assinatura() from public, anon, authenticated;
