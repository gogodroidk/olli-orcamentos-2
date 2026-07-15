-- Índices de cobertura para chaves estrangeiras sem índice (Supabase performance
-- advisor: unindexed_foreign_keys). FK sem índice força varredura sequencial em
-- JOINs e, principalmente, em DELETE/UPDATE do lado referenciado (auth.users,
-- organizacoes) — pode escalar lock. Todos os alvos são tabelas pequenas.
--
-- JÁ APLICADO EM PRODUÇÃO em 2026-07-14 via Management API com
-- CREATE INDEX CONCURRENTLY (sem bloquear escrita). Este arquivo replica o estado
-- para o schema versionado; idempotente (IF NOT EXISTS) — no-op onde já existe.
-- Runners que suportam statements fora de transação podem trocar por CONCURRENTLY.

create index if not exists acessos_equipe_user_id_idx        on public.acessos_equipe (user_id);
create index if not exists convites_aceito_por_idx           on public.convites (aceito_por);
create index if not exists convites_criado_por_idx           on public.convites (criado_por);
create index if not exists convites_org_id_idx               on public.convites (org_id);
create index if not exists feedback_user_id_idx              on public.feedback (user_id);
create index if not exists localizacoes_equipe_user_id_idx   on public.localizacoes_equipe (user_id);
