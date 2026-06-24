-- Harden the helper event-trigger function so it cannot be called through RPC.
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.rls_auto_enable() from public;

-- Keep all user-owned data behind authenticated RLS policies while avoiding
-- per-row auth.uid() re-evaluation at scale.
drop policy if exists own_backup on public.backups;
create policy own_backup
  on public.backups
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists clientes_owner on public.clientes;
create policy clientes_owner
  on public.clientes
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists contadores_owner on public.contadores;
create policy contadores_owner
  on public.contadores
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists depoimentos_owner on public.depoimentos;
create policy depoimentos_owner
  on public.depoimentos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists empresa_owner on public.empresa;
create policy empresa_owner
  on public.empresa
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists modelos_owner on public.modelos;
create policy modelos_owner
  on public.modelos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists orcamentos_owner on public.orcamentos;
create policy orcamentos_owner
  on public.orcamentos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists produtos_owner on public.produtos;
create policy produtos_owner
  on public.produtos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists recibos_owner on public.recibos;
create policy recibos_owner
  on public.recibos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists servicos_owner on public.servicos;
create policy servicos_owner
  on public.servicos
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
