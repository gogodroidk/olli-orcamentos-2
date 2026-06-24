-- Otimiza as 3 policies que reavaliavam auth.uid() por linha (perf em escala).
-- Troca auth.uid() por (select auth.uid()) — mesma semântica, avaliado 1x/query.
-- Espelha o estado aplicado no projeto via MCP em 2026-06-24. As outras 11 tabelas
-- já usavam (select auth.uid()) (migration 20260615160744).

DROP POLICY IF EXISTS agendamentos_owner ON public.agendamentos;
CREATE POLICY agendamentos_owner ON public.agendamentos
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS exclusoes_owner ON public.exclusoes;
CREATE POLICY exclusoes_owner ON public.exclusoes
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS orcamentos_publicos_owner ON public.orcamentos_publicos;
CREATE POLICY orcamentos_publicos_owner ON public.orcamentos_publicos
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
