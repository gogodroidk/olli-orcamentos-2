-- OLLI Orçamentos — ASSINATURAS PAGANTES: definição única de "quem paga" para
-- contagem (pagantes, MRR, conversão). T-011, 04/10/2026.
--
-- Por quê: MRR real é zero, mas as métricas contavam 2 assinaturas 'active' que
-- não pagam — a cortesia do dono gravada até 2099 com id de gateway inventado
-- ('comp_manual_empresa') e a conta interna/demo ('sub_demo_…' ou liberada pelo
-- override do painel, admin_override_ativo).
--
-- SÓ CONTAGEM. Nada aqui decide acesso: entitlement, cotas e RLS continuam lendo
-- public.assinaturas como antes (billing_entitlement_status, derivarEntitlement).
--
-- Mesma regra do worker em worker/src/assinaturasPagantes.js (o teste
-- scripts/teste-assinaturas-pagantes.ts roda os mesmos casos nas duas).
-- Uma linha NÃO é pagante quando:
--   'sem_pagamento'   status fora de active/trialing, vigência vencida/ausente
--                     ou plano fora de pro/empresa;
--   'id_ficticio'     id Stripe inventado (comp_*, sub_demo_*, reviewer_*) —
--                     public.funil_assinatura_ficticia, já usada pelo funil;
--   'override_admin'  plano liberado à mão pelo painel e ainda vigente;
--   'vigencia_manual' vigência a mais de 3 anos. Um ciclo pago é no máximo 1 ano,
--                     mas a AbacatePay soma a renovação à vigência em curso
--                     (~25 meses no pior caso); 3 anos dá folga e ainda pega a
--                     concessão escrita à mão (ex.: 2099).
--
-- CONTA INTERNA também fica fora (mesma lista do funil de receita,
-- funil_contas_marcos): e-mail do dono (passado pelo chamador), funil_exclusoes
-- ("Marcar como conta interna") e admin_memberships. Pagamento real de conta
-- interna (ex.: Pix de teste do dono) não é receita — e o "pagou" do funil
-- também não o conta.
--   - view assinaturas_pagantes: gateway + lista interna do banco (sem o e-mail
--     do dono, que só o worker conhece);
--   - admin_assinaturas_pagantes(p_emails_excluidos): o mesmo + e-mail do dono.
--     É a leitura completa, equivalente ao painel.
--
-- Leitura: só service_role (worker/painel admin). Idempotente.

create or replace function public.assinatura_motivo_nao_pagante(
  p_plano text,
  p_status text,
  p_current_period_end timestamptz,
  p_stripe_subscription_id text,
  p_stripe_customer_id text,
  p_admin_plano_override text,
  p_admin_override_ativo boolean,
  p_admin_override_ate timestamptz,
  p_agora timestamptz default now()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status is null or p_status not in ('active', 'trialing')
      or p_current_period_end is null or p_current_period_end < p_agora
      or p_plano is null or p_plano not in ('pro', 'empresa')
      then 'sem_pagamento'
    when public.funil_assinatura_ficticia(p_stripe_subscription_id, p_stripe_customer_id)
      then 'id_ficticio'
    when p_admin_override_ativo is true
      and p_admin_plano_override in ('pro', 'empresa')
      and (p_admin_override_ate is null or p_admin_override_ate >= p_agora)
      then 'override_admin'
    when p_current_period_end > p_agora + interval '1096 days'
      then 'vigencia_manual'
  end;
$$;

comment on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz) is
  'Por que a assinatura NÃO conta como pagante (null = conta). Só para métricas (pagantes/MRR/conversão); nunca para acesso.';

-- Conta interna: mesmas três primeiras regras de funil_contas_marcos. Lê
-- auth.users / funil_exclusoes / admin_memberships, por isso SECURITY DEFINER
-- com search_path vazio; execução só para service_role.
create or replace function public.receita_conta_interna(
  p_user_id uuid,
  p_emails_excluidos text[] default '{}'
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select lower(btrim(coalesce(x.email, ''))) as email
      from auth.users x
     where x.id = p_user_id
  )
  select case
    when exists (
      select 1 from u, unnest(coalesce(p_emails_excluidos, '{}'::text[])) as e
       where u.email <> '' and u.email = lower(btrim(e))
    ) then 'dono'
    when exists (select 1 from public.funil_exclusoes x where x.user_id = p_user_id)
      or exists (select 1 from u join public.funil_exclusoes x on x.email = u.email where u.email <> '')
      then 'lista_interna'
    when exists (select 1 from public.admin_memberships am where am.user_id = p_user_id)
      then 'admin'
  end;
$$;

revoke all on function public.receita_conta_interna(uuid, text[]) from public, anon, authenticated;
grant execute on function public.receita_conta_interna(uuid, text[]) to service_role;

create or replace view public.assinaturas_pagantes
with (security_invoker = true)
as
select a.user_id, a.plano, a.status, a.current_period_end, a.atualizado_em
  from public.assinaturas a
 where public.assinatura_motivo_nao_pagante(
         a.plano, a.status, a.current_period_end,
         a.stripe_subscription_id, a.stripe_customer_id,
         a.admin_plano_override, a.admin_override_ativo, a.admin_override_ate
       ) is null
   and public.receita_conta_interna(a.user_id) is null;

comment on view public.assinaturas_pagantes is
  'Assinaturas que PAGAM por gateway (fora cortesia comp_*, demo sub_demo_*, override do painel, vigência manual e conta interna do banco). Base única de pagantes/MRR/conversão; não decide acesso. Sem o e-mail do dono: para isso, admin_assinaturas_pagantes. Só service_role.';

revoke all on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz)
  to service_role;
-- A view é security_invoker: quem lê (service_role) precisa executar as duas.
grant execute on function public.funil_assinatura_ficticia(text, text) to service_role;

revoke all on table public.assinaturas_pagantes from public, anon, authenticated;
grant select on table public.assinaturas_pagantes to service_role;

-- Leitura completa (igual ao painel): a view + e-mail do dono vindo do worker.
create or replace function public.admin_assinaturas_pagantes(p_emails_excluidos text[] default '{}')
returns table (user_id uuid, plano text, status text, current_period_end timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.user_id, p.plano, p.status, p.current_period_end
    from public.assinaturas_pagantes p
   where public.receita_conta_interna(p.user_id, p_emails_excluidos) is null;
$$;

revoke all on function public.admin_assinaturas_pagantes(text[]) from public, anon, authenticated;
grant execute on function public.admin_assinaturas_pagantes(text[]) to service_role;
