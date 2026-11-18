-- Paridade repo = produção: 5 policies que só existiam em produção (criadas à mão,
-- fora de migration). Definição LIDA de produção em 18/11/2026 (pg_policies, só
-- leitura) e registrada aqui para o repositório aplicar do zero e o staging ter
-- a mesma RLS. Em produção esta migration não muda nada (mesma definição; o
-- drop+create corre na mesma transação, sem janela sem policy).
--
--   backups_versionados  backup_ver_select_own / _insert_own / _delete_own
--       authenticated, só a própria linha (user_id = auth.uid()); sem UPDATE
--       (a versão é imutável pelo cliente).
--   hvac_chunks / hvac_codigos  hvac_*_leitura
--       base de conhecimento HVAC pública para quem está logado (leitura);
--       escrita só por service_role.
--
-- Não mexe em grants (continuam os padrão do Supabase; a RLS é quem restringe).

alter table public.backups_versionados enable row level security;
alter table public.hvac_chunks enable row level security;
alter table public.hvac_codigos enable row level security;

drop policy if exists backup_ver_select_own on public.backups_versionados;
create policy backup_ver_select_own on public.backups_versionados
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists backup_ver_insert_own on public.backups_versionados;
create policy backup_ver_insert_own on public.backups_versionados
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists backup_ver_delete_own on public.backups_versionados;
create policy backup_ver_delete_own on public.backups_versionados
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists hvac_chunks_leitura on public.hvac_chunks;
create policy hvac_chunks_leitura on public.hvac_chunks
  for select to authenticated
  using (true);

drop policy if exists hvac_codigos_leitura on public.hvac_codigos;
create policy hvac_codigos_leitura on public.hvac_codigos
  for select to authenticated
  using (true);
