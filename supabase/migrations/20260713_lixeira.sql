-- ============================================================================
-- OLLI Orcamentos — LIXEIRA (soft delete acessivel + expurgo).
-- Frente 1: exclusao recuperavel. Risco combatido: perda de dado por engano.
-- ----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ (tudo IDEMPOTENTE — pode rodar N vezes sem erro):
--   Acrescenta a coluna `excluido_em timestamptz` (NULLABLE, default NULL) as 10
--   entidades do usuario. Semantica:
--     - excluido_em IS NULL      → item ATIVO (aparece nas listas normais).
--     - excluido_em IS NOT NULL  → item na LIXEIRA (excluido pelo usuario, ainda
--                                  recuperavel; some das listas normais).
--   O app EXCLUIR (do usuario) vira SOFT DELETE: seta excluido_em = now() e mantem
--   a linha, sincronizando como UPDATE normal (NAO usa tombstone/public.exclusoes).
--   A LIXEIRA lista os itens com excluido_em IS NOT NULL e oferece RESTAURAR
--   (excluido_em = null) e EXCLUIR DEFINITIVAMENTE (o DELETE real + tombstone, que
--   ja existem). O EXPURGO hard-deleta itens na lixeira ha mais de 30 dias.
--
-- Para cada tabela criamos tambem um INDICE PARCIAL `X_ativos_idx` sobre
-- (user_id) WHERE excluido_em IS NULL — o caminho quente (listar ativos do dono)
-- fica coberto e o custo de indexar a lixeira (linhas raras) e zero.
--
-- NOMES DE NUVEM: equipamentos (tabela local) vive em public.assets. As demais 9
-- tem o mesmo nome local/nuvem. Todas ja possuem `user_id` (multi-tenant por
-- camada de acesso, ver 20260707_multitenant / 20260709_pmoc_fundacao) — por isso
-- o indice parcial em (user_id) e valido.
--
-- ADITIVA e SEGURA: add column IF NOT EXISTS (nao recria tabela, nao mexe em
-- RLS/triggers/policies — a linha inteira, incluindo colunas futuras, ja e coberta
-- pelas policies existentes). A coluna nasce NULL em todas as linhas antigas, ou
-- seja, todo dado existente continua ATIVO (nada e escondido retroativamente).
--
-- IMPORTANTE (nao aplicar a mao): o INTEGRADOR revisa e aplica via
--   mcp__supabase__apply_migration. LGPD: nenhuma exposicao publica nova; a coluna
--   herda o RLS multi-tenant de cada tabela. SEGREDOS: zero neste arquivo.
-- ============================================================================

-- clientes ------------------------------------------------------------------
alter table public.clientes       add column if not exists excluido_em timestamptz;
create index if not exists clientes_ativos_idx       on public.clientes       (user_id) where excluido_em is null;

-- servicos ------------------------------------------------------------------
alter table public.servicos       add column if not exists excluido_em timestamptz;
create index if not exists servicos_ativos_idx       on public.servicos       (user_id) where excluido_em is null;

-- produtos ------------------------------------------------------------------
alter table public.produtos       add column if not exists excluido_em timestamptz;
create index if not exists produtos_ativos_idx       on public.produtos       (user_id) where excluido_em is null;

-- orcamentos ----------------------------------------------------------------
alter table public.orcamentos     add column if not exists excluido_em timestamptz;
create index if not exists orcamentos_ativos_idx     on public.orcamentos     (user_id) where excluido_em is null;

-- recibos -------------------------------------------------------------------
alter table public.recibos        add column if not exists excluido_em timestamptz;
create index if not exists recibos_ativos_idx        on public.recibos        (user_id) where excluido_em is null;

-- modelos -------------------------------------------------------------------
alter table public.modelos        add column if not exists excluido_em timestamptz;
create index if not exists modelos_ativos_idx        on public.modelos        (user_id) where excluido_em is null;

-- depoimentos ---------------------------------------------------------------
alter table public.depoimentos    add column if not exists excluido_em timestamptz;
create index if not exists depoimentos_ativos_idx    on public.depoimentos    (user_id) where excluido_em is null;

-- agendamentos --------------------------------------------------------------
alter table public.agendamentos   add column if not exists excluido_em timestamptz;
create index if not exists agendamentos_ativos_idx   on public.agendamentos   (user_id) where excluido_em is null;

-- ordens_servico ------------------------------------------------------------
alter table public.ordens_servico add column if not exists excluido_em timestamptz;
create index if not exists ordens_servico_ativos_idx on public.ordens_servico (user_id) where excluido_em is null;

-- assets (equipamentos, PMOC) -----------------------------------------------
alter table public.assets         add column if not exists excluido_em timestamptz;
create index if not exists assets_ativos_idx         on public.assets         (user_id) where excluido_em is null;


-- ============================================================================
-- TESTE (rodar MANUALMENTE — o integrador executa). Prova a semantica soft-delete
-- e a IDEMPOTENCIA (rodar 2x nao quebra). Substitua <A> por um auth.users real.
-- ----------------------------------------------------------------------------
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--
--   -- 1) a coluna existe e nasce NULL (item ativo):
--   insert into public.clientes (id, nome, criado_em)
--     values ('cli-lix-1', 'Teste Lixeira', now());
--   select excluido_em is null as ativo from public.clientes where id = 'cli-lix-1';  -- t
--
--   -- 2) SOFT DELETE (vai para a lixeira) — a linha PERMANECE:
--   update public.clientes set excluido_em = now() where id = 'cli-lix-1';
--   select count(*) from public.clientes where id = 'cli-lix-1';                       -- 1
--   select count(*) from public.clientes where excluido_em is not null and id='cli-lix-1'; -- 1
--
--   -- 3) RESTAURAR (volta a ativa):
--   update public.clientes set excluido_em = null where id = 'cli-lix-1';
--   select excluido_em is null as ativo from public.clientes where id = 'cli-lix-1';  -- t
--
--   -- limpeza:
--   delete from public.clientes where id = 'cli-lix-1';
--   reset role;
-- ============================================================================
