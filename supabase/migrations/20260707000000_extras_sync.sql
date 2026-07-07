-- extras_sync — tabela CHAVE-VALOR por usuário para os "extras" do app que até
-- então ficavam SÓ no aparelho (checklist do Hoje, snooze do radar de clientes e
-- os relatórios diários falados). Uma única tabela genérica evita explosão de
-- tabelas: cada extra é uma linha (user_id, chave) com o payload em `dados` jsonb.
--
-- Convenções (iguais às demais tabelas do projeto):
--  - `user_id` tem DEFAULT auth.uid() e referencia auth.users → o app faz upsert
--    SEM enviar user_id; o default + RLS preenchem/protegem (padrão de cloudSync).
--  - PK composta (user_id, chave) → upsert idempotente por (dono, chave).
--  - `atualizado_em` carimba a versão para o sync fazer last-write-wins.
--  - RLS: dono (select/insert/update/delete) via (select auth.uid()) = user_id,
--    avaliado 1x por query (mesmo padrão de perf das migrations 20260615/20260624).

create table if not exists public.extras_sync (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chave text not null,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table public.extras_sync enable row level security;

drop policy if exists extras_sync_owner on public.extras_sync;
create policy extras_sync_owner
  on public.extras_sync
  as permissive
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
