-- Fail-closed de entitlement pago.
--
-- Antes desta migration, `past_due` e uma vigência NULL liberavam Pro/Empresa.
-- O reconciliador novo já negava esse estado, mas a RPC autoritativa ainda o
-- promovia. Enquanto não existir uma política de carência aprovada, com prazo
-- server-side explícito e auditável, somente active/trialing + vigência futura
-- podem ampliar privilégio. Dados e histórico continuam preservados.

create or replace function public.plano_comercial_efetivo(
  p_owner_user_id uuid,
  p_tenant_id uuid,
  p_agora timestamptz default now()
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
  v_plano text := 'gratis';
begin
  select * into v_assinatura
  from public.assinaturas a
  where a.user_id = p_owner_user_id
  limit 1;

  if found
     and v_assinatura.status in ('active', 'trialing')
     and v_assinatura.current_period_end is not null
     and v_assinatura.current_period_end > p_agora
     and v_assinatura.plano in ('pro', 'empresa') then
    v_plano := v_assinatura.plano;
  end if;

  if found
     and v_assinatura.admin_override_ativo is true
     and (v_assinatura.admin_override_ate is null or v_assinatura.admin_override_ate >= p_agora)
     and v_assinatura.admin_plano_override in ('pro', 'empresa')
     and (v_plano = 'gratis' or v_assinatura.admin_plano_override = 'empresa') then
    v_plano := v_assinatura.admin_plano_override;
  end if;

  if v_plano = 'gratis' and exists (
    select 1 from public.trials_comerciais t
    where t.tenant_id = p_tenant_id
      and t.estado = 'active'
      and t.iniciado_em <= p_agora
      and t.termina_em > p_agora
  ) then
    return 'pro';
  end if;

  return v_plano;
end;
$$;

revoke all on function public.plano_comercial_efetivo(uuid,uuid,timestamptz)
  from public, anon, authenticated;

comment on function public.plano_comercial_efetivo(uuid,uuid,timestamptz) is
  'Entitlement fail-closed: plano pago exige active/trialing e vigência futura; past_due só poderá usar carência explícita futura.';
