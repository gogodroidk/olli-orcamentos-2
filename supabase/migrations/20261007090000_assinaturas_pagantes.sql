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
--   'vigencia_manual' vigência a mais de 2 anos (nenhum gateway vende isso: é
--                     concessão escrita à mão, ex.: 2099).
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
    when p_current_period_end > p_agora + interval '732 days'
      then 'vigencia_manual'
  end;
$$;

comment on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz) is
  'Por que a assinatura NÃO conta como pagante (null = conta). Só para métricas (pagantes/MRR/conversão); nunca para acesso.';

create or replace view public.assinaturas_pagantes
with (security_invoker = true)
as
select a.user_id, a.plano, a.status, a.current_period_end, a.atualizado_em
  from public.assinaturas a
 where public.assinatura_motivo_nao_pagante(
         a.plano, a.status, a.current_period_end,
         a.stripe_subscription_id, a.stripe_customer_id,
         a.admin_plano_override, a.admin_override_ativo, a.admin_override_ate
       ) is null;

comment on view public.assinaturas_pagantes is
  'Assinaturas que PAGAM por gateway (fora cortesia comp_*, demo sub_demo_*, override do painel e vigência manual). Base única de pagantes/MRR/conversão; não decide acesso. Só service_role.';

revoke all on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.assinatura_motivo_nao_pagante(text, text, timestamptz, text, text, text, boolean, timestamptz, timestamptz)
  to service_role;
-- A view é security_invoker: quem lê (service_role) precisa executar as duas.
grant execute on function public.funil_assinatura_ficticia(text, text) to service_role;

revoke all on table public.assinaturas_pagantes from public, anon, authenticated;
grant select on table public.assinaturas_pagantes to service_role;
