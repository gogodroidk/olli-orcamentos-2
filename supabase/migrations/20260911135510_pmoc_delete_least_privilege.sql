-- Menor privilégio para a camada PMOC/ativos.
-- Técnicos continuam podendo trabalhar nos dados permitidos pela policy de
-- UPDATE, mas não podem apagar o histórico nem remover dados da empresa. A
-- exclusão dos cabeçalhos fica restrita ao dono/admin/gestor da organização;
-- versões, tokens e contratos versionados não têm DELETE para authenticated.

DO $$
DECLARE
  tabela text;
  compartilhados text[] := ARRAY[
    'assets', 'service_contracts', 'pmoc_plans', 'pmoc_ordens_geradas'
  ];
  historicos text[] := ARRAY[
    'asset_qr_tokens', 'service_contract_versions', 'pmoc_plan_versions'
  ];
BEGIN
  FOREACH tabela IN ARRAY compartilhados LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tabela || '_delete', tabela);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (
         %I.user_id = (SELECT auth.uid())
         OR EXISTS (
           SELECT 1 FROM public.organizacoes o
            WHERE o.owner_user_id = %I.user_id
              AND public.eh_gestao(o.id)
         )
       )',
      tabela || '_delete_gestao', tabela, tabela, tabela
    );
  END LOOP;

  FOREACH tabela IN ARRAY historicos LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tabela || '_delete', tabela);
    -- Sem policy de DELETE, FORCE RLS nega a operação para authenticated.
  END LOOP;
END;
$$;

COMMENT ON POLICY assets_delete_gestao ON public.assets IS
  'Exclusão de ativo somente pelo dono/admin/gestor; técnico mantém leitura/edição compartilhada.';
COMMENT ON POLICY pmoc_plans_delete_gestao ON public.pmoc_plans IS
  'Exclusão de plano PMOC somente por gestão; versões permanecem históricas.';
