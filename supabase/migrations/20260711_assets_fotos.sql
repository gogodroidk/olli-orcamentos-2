-- ============================================================================
-- OLLI Orcamentos — PMOC Fase 1, Frente A: coluna de FOTOS em public.assets.
-- ----------------------------------------------------------------------------
-- A fundacao PMOC (20260709_pmoc_fundacao.sql) criou public.assets SEM coluna de
-- fotos — o inventario de equipamentos precisa anexar fotos (placa/local/etiqueta)
-- ao ativo. Esta migration ADITIVA acrescenta essa coluna, no MESMO formato jsonb
-- array usado por ordens_servico.fotos (20260710_ordens_servico.sql): um array de
-- URIs (string[]), default array vazio. O app espelha a coluna local
-- equipamentos.fotos (TEXT JSON) para ca, enviando/recebendo um array (ver
-- src/services/cloudSync.ts, equipamentoToRow/rowToEquipamento e arrOrParse).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS — roda N vezes sem erro. NAO recria a
-- tabela, NAO mexe em RLS/triggers/policies (a fundacao ja os definiu para toda a
-- linha, incluindo colunas futuras). NOT NULL DEFAULT '[]'::jsonb preenche as
-- linhas existentes automaticamente (Postgres aplica o default nas linhas antigas).
--
-- IMPORTANTE (nao aplicar a mao): o INTEGRADOR revisa e aplica via
--   mcp__supabase__apply_migration quando o track PMOC Fase 1 abrir. Como a
--   fundacao public.assets JA ESTA APLICADA, esta migration pode ser aplicada
--   isoladamente sobre ela.
--
-- LGPD: fotos de equipamento podem conter dados do ambiente do cliente. A coluna
-- herda o RLS multi-tenant de public.assets (leitura/escrita so do dono e da equipe
-- ativa via donos_visiveis) — nenhuma exposicao publica nova e criada aqui.
-- SEGREDOS: zero. Nenhum token/segredo neste arquivo.
-- ============================================================================

alter table public.assets
  add column if not exists fotos jsonb not null default '[]'::jsonb;
