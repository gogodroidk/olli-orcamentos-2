-- ============================================================================
-- 20260715_pmoc_fase2.sql — PMOC Fase 2: periodicidade + ordens recorrentes.
-- APLICADA em 2026-07-09.
--
-- CAVEAT LEGAL (inegociável, herdado de 20260709_pmoc_fundacao.sql): nada aqui
-- declara conformidade legal. As PERIODICIDADES (mensal/trimestral/…), as
-- atividades e as referências normativas vivem em `pmoc_plan_versions.dados`
-- (jsonb VERSIONADO e configurável), nunca como coluna ou constante de código —
-- prazo de norma muda, e quem valida é o responsável habilitado, não o app.
--
-- O QUE ESTA FASE ACRESCENTA
--   `pmoc_ordens_geradas`: o LIVRO-CAIXA da geração recorrente. Cada linha diz
--   "para o plano P, o equipamento E, no período 2026-07, a periodicidade M já
--   virou a ordem de serviço O". É uma tabela de ligação, não de conteúdo.
--
-- IDEMPOTÊNCIA MORA AQUI, NÃO NA LÓGICA (a razão de existir desta tabela)
--   A geração roda no boot, em vários aparelhos, às vezes offline e sincronizada
--   depois. Sem uma restrição no BANCO, dois aparelhos gerando "a manutenção de
--   julho" criam DUAS ordens e o técnico vai duas vezes ao mesmo endereço.
--   `pmoc_ordens_geradas_unica` é o que torna a operação segura de repetir.
--   `periodicidade_id` entra na chave com DEFAULT '' (jamais null): em índice
--   único do Postgres, dois NULLs NÃO colidem — a chave viraria decorativa.
--
-- SEGREDOS: zero.
-- Idempotente: create ... if not exists / add column if not exists / drop policy
-- if exists antes de create. Roda N vezes sem erro.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Soft delete no plano (a Lixeira do Bloco A cobre 10 entidades; o plano PMOC
--    é a 11ª). `atualizado_em` já existe em pmoc_plans desde a fundação.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.pmoc_plans add column if not exists excluido_em timestamptz;
create index if not exists pmoc_plans_ativos_idx
  on public.pmoc_plans (user_id) where excluido_em is null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Livro-caixa da geração recorrente.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.pmoc_ordens_geradas (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por       uuid default auth.uid(),

  plano_id         text not null,          -- soft ref a pmoc_plans.id
  asset_id         text not null,          -- soft ref a assets.id (o equipamento atendido)
  -- Rótulo do período JÁ NORMALIZADO pelo app: '2026-07' (mensal), '2026-T3'
  -- (trimestral), '2026-S1' (semestral), '2026' (anual). É texto de propósito:
  -- o vocabulário de periodicidade é dado configurável, não enum de schema.
  periodo          text not null,
  -- Qual periodicidade do plano gerou esta ordem. NOT NULL DEFAULT '' porque
  -- entra no índice único (ver cabeçalho: NULLs não colidem).
  periodicidade_id text not null default '',

  ordem_id         text not null,          -- ordens_servico.id criada
  vencimento       date,                   -- quando a manutenção do período vence

  atualizado_em    timestamptz not null default now(),
  criado_em        timestamptz not null default now(),
  excluido_em      timestamptz
);

-- A CHAVE. Uma ordem por (plano, equipamento, período, periodicidade). Repetir a
-- geração vira no-op em vez de duplicar visita.
create unique index if not exists pmoc_ordens_geradas_unica
  on public.pmoc_ordens_geradas (plano_id, asset_id, periodo, periodicidade_id);

create index if not exists pmoc_ordens_geradas_user_idx   on public.pmoc_ordens_geradas (user_id);
create index if not exists pmoc_ordens_geradas_plano_idx  on public.pmoc_ordens_geradas (plano_id, periodo);
create index if not exists pmoc_ordens_geradas_ordem_idx  on public.pmoc_ordens_geradas (ordem_id);
create index if not exists pmoc_ordens_geradas_ativos_idx
  on public.pmoc_ordens_geradas (user_id) where excluido_em is null;

alter table public.pmoc_ordens_geradas enable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) TRIGGER: user_id/criado_por imutáveis (mesma helper das outras tabelas).
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bloquear_troca_user_id'
  ) then
    drop trigger if exists pmoc_ordens_geradas_user_id_imutavel on public.pmoc_ordens_geradas;
    create trigger pmoc_ordens_geradas_user_id_imutavel
      before update on public.pmoc_ordens_geradas
      for each row execute function public.bloquear_troca_user_id();
  end if;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RLS — mesma fábrica da fundação (conjunto visível via donos_visiveis(),
--    fallback só-o-dono se a função não existir).
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text := 'pmoc_ordens_geradas';
  tem_dv boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
  expr_self    text := 'user_id = (select auth.uid())';
  expr_visivel text;
begin
  expr_visivel := case when tem_dv
                       then 'user_id in (select public.donos_visiveis())'
                       else expr_self end;

  execute format('drop policy if exists %I on public.%I', t || '_select', t);
  execute format(
    'create policy %I on public.%I as permissive for select to authenticated using (%s)',
    t || '_select', t, expr_visivel
  );

  execute format('drop policy if exists %I on public.%I', t || '_insert', t);
  if tem_dv then
    execute format(
      'create policy %I on public.%I as permissive for insert to authenticated with check (%s or (%s and criado_por = (select auth.uid())))',
      t || '_insert', t, expr_self, expr_visivel
    );
  else
    execute format(
      'create policy %I on public.%I as permissive for insert to authenticated with check (%s)',
      t || '_insert', t, expr_self
    );
  end if;

  execute format('drop policy if exists %I on public.%I', t || '_update', t);
  execute format(
    'create policy %I on public.%I as permissive for update to authenticated using (%s) with check (%s)',
    t || '_update', t, expr_visivel, expr_visivel
  );

  execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  execute format(
    'create policy %I on public.%I as permissive for delete to authenticated using (%s)',
    t || '_delete', t, expr_visivel
  );
end $$;
