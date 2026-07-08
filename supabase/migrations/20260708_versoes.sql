-- ============================================================================
-- OLLI Orçamentos — VERSÕES de orçamento + trilha de VISUALIZAÇÃO do cliente.
-- Onda 3, frente "Versões de orçamento + status expandido" (mestre 13/13.5/35).
-- ----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ (tudo ADITIVO e IDEMPOTENTE — pode rodar N vezes):
--   1) public.orcamento_versoes: histórico append-only dos snapshots congelados
--      pelo app ANTES de editar uma proposta JÁ ENVIADA (regra de ouro 13.5).
--   2) public.orcamentos_publicos.visualizado_em: carimba QUANDO o cliente abriu
--      o link — alimenta a trilha (enviado → visualizado → aprovado/recusado).
--
-- IMPORTANTE (não aplicar à mão): o INTEGRADOR revisa e aplica via
--   mcp__supabase__apply_migration, e roda os testes SQL do rodapé. O worker
--   (worker/src/link.js) que grava `visualizado_em` é de OUTRA frente — esta
--   migration só PREPARA a coluna; o app já lê com fallback se ela faltar.
--
-- PADRÕES HERDADOS (mantidos para não divergir do multi-tenant da Onda 2):
--   - `user_id` com DEFAULT auth.uid() + FK auth.users → o app faz upsert SEM
--     enviar user_id; o default + RLS preenchem/protegem (padrão de cloudSync).
--   - RLS de PERF: SEMPRE `(select auth.uid())` (InitPlan, 1x por query).
--   - Leitura COMPARTILHADA pela equipe via `public.donos_visiveis()` (a mesma
--     helper SECURITY DEFINER da migration 20260707_multitenant), para um técnico
--     ativo enxergar as versões dos orçamentos do dono. Escrita: dono OU membro
--     ativo da org do dono (mesma política de `orcamentos`).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) TABELA: public.orcamento_versoes
--    Snapshot íntegro do orçamento (jsonb `dados`) no momento em que a versão foi
--    congelada. `numero_versao` é sequencial POR orçamento (controlado pelo app).
--    PK = id (uuid gerado no app, estável entre aparelhos — igual às demais tabelas).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.orcamento_versoes (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  orcamento_id   text not null,
  numero_versao  integer not null,
  dados          jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now()
);

-- Índice de apoio à listagem por orçamento (histórico ordenado por versão) e às
-- policies que filtram por dono.
create index if not exists orcamento_versoes_orc_idx
  on public.orcamento_versoes (orcamento_id, numero_versao);
create index if not exists orcamento_versoes_user_idx
  on public.orcamento_versoes (user_id);

-- Uma versão é única por (orçamento, número) — evita duplicar o mesmo snapshot se
-- dois aparelhos congelarem a "v3" do mesmo orçamento. (O id continua sendo a PK;
-- esta UNIQUE é a garantia semântica da numeração.)
create unique index if not exists orcamento_versoes_orc_num_uidx
  on public.orcamento_versoes (orcamento_id, numero_versao);

alter table public.orcamento_versoes enable row level security;

-- user_id IMUTÁVEL (mesmo hardening de orcamentos/agendamentos na Onda 2): impede
-- que um membro dê UPDATE trocando o dono e transfira o histórico para si. A função
-- public.bloquear_troca_user_id já existe (20260708_multitenant_fixes); reusamos.
-- Guarda defensiva: só cria o trigger se a função existir (a fundação já a criou).
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bloquear_troca_user_id'
  ) then
    drop trigger if exists orcamento_versoes_user_id_imutavel on public.orcamento_versoes;
    create trigger orcamento_versoes_user_id_imutavel
      before update on public.orcamento_versoes
      for each row execute function public.bloquear_troca_user_id();
  end if;
end $$;

-- RLS — SELECT: dono OU membro ativo da org do dono (leitura compartilhada).
-- Fallback defensivo: se `donos_visiveis()` não existir (projeto sem a fundação
-- multi-tenant aplicada), cai para a policy simples "só o dono" — nunca vaza.
do $$
begin
  drop policy if exists orcamento_versoes_select on public.orcamento_versoes;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy orcamento_versoes_select
      on public.orcamento_versoes
      as permissive for select to authenticated
      using (user_id in (select public.donos_visiveis()));
  else
    create policy orcamento_versoes_select
      on public.orcamento_versoes
      as permissive for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

-- RLS — INSERT: dono grava o próprio (single-tenant intacto) OU membro ativo grava
-- em nome do owner da sua org. Espelha a policy de INSERT de `orcamentos`.
do $$
begin
  drop policy if exists orcamento_versoes_insert on public.orcamento_versoes;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy orcamento_versoes_insert
      on public.orcamento_versoes
      as permissive for insert to authenticated
      with check (
        user_id = (select auth.uid())
        or user_id in (select public.donos_visiveis())
      );
  else
    create policy orcamento_versoes_insert
      on public.orcamento_versoes
      as permissive for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- RLS — UPDATE: histórico é append-only, mas o upsert por id do app precisa poder
-- reescrever a MESMA versão (idempotência do sync). Restrito ao conjunto visível.
do $$
begin
  drop policy if exists orcamento_versoes_update on public.orcamento_versoes;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy orcamento_versoes_update
      on public.orcamento_versoes
      as permissive for update to authenticated
      using (user_id in (select public.donos_visiveis()))
      with check (user_id in (select public.donos_visiveis()));
  else
    create policy orcamento_versoes_update
      on public.orcamento_versoes
      as permissive for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- RLS — DELETE: dono OU membro ativo da org do dono (para o delete em cascata do
-- orçamento pai, feito pelo app, também poder limpar o histórico na nuvem).
do $$
begin
  drop policy if exists orcamento_versoes_delete on public.orcamento_versoes;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy orcamento_versoes_delete
      on public.orcamento_versoes
      as permissive for delete to authenticated
      using (user_id in (select public.donos_visiveis()));
  else
    create policy orcamento_versoes_delete
      on public.orcamento_versoes
      as permissive for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) TRILHA: public.orcamentos_publicos.visualizado_em
--    Carimba a PRIMEIRA visualização do cliente no link. Coluna NULLABLE (links
--    antigos e não-visualizados ficam NULL). O worker (outra frente) fará o
--    UPDATE quando o GET /o/<token> for aberto; o app apenas LÊ (com fallback se
--    a coluna faltar). NÃO altera nenhuma policy existente da tabela.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.orcamentos_publicos
  add column if not exists visualizado_em timestamptz;

-- Comentário de documentação (visível no catálogo do banco / painel Supabase).
comment on column public.orcamentos_publicos.visualizado_em is
  'Primeira vez que o cliente abriu o link público (trilha: enviado → visualizado → resposta). Gravado pelo Worker; lido pelo app.';


-- ============================================================================
-- 3) TESTES SQL (rodar MANUALMENTE — o integrador executa; RLS com 2 JWTs).
-- ----------------------------------------------------------------------------
-- Substitua <A> (dono) e <B> (técnico da org de A) por auth.users reais e um
-- <ORC> por um orcamento_id existente de A.
--
-- ── T1: dono insere versão e a lê (single-tenant intacto) ──────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.orcamento_versoes (id, orcamento_id, numero_versao, dados)
--     values ('ver-teste-1', '<ORC>', 1, '{"valorTotal": 100}');   -- PASSA (user_id=default A)
--   select count(*) from public.orcamento_versoes where orcamento_id = '<ORC>';  -- 1
--   reset role;
--
-- ── T2: outro user SEM org NÃO vê a versão de A (zero vazamento) ────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.orcamento_versoes where orcamento_id = '<ORC>';  -- 0 (se B não é membro de A)
--   reset role;
--
-- ── T3: técnico ATIVO da org de A vê e cria versão em nome de A ─────────────
--   -- (após A ter criado a org e B ter aceitado o convite — ver 20260707_multitenant T3)
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.orcamento_versoes where orcamento_id = '<ORC>';  -- >= 1 (vê as de A)
--   insert into public.orcamento_versoes (id, user_id, orcamento_id, numero_versao, dados)
--     values ('ver-teste-2', '<A>', '<ORC>', 2, '{"valorTotal": 120}');          -- PASSA (grava no tenant de A)
--   reset role;
--
-- ── T4: numeração única por orçamento (a UNIQUE barra duplicata) ────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.orcamento_versoes (id, orcamento_id, numero_versao, dados)
--     values ('ver-teste-3', '<ORC>', 1, '{}');   -- FALHA: (orcamento_id, numero_versao) já existe
--   reset role;
--
-- ── T5: user_id imutável (não transfere histórico) ─────────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   update public.orcamento_versoes set user_id = '<B>' where id = 'ver-teste-1';  -- FALHA: 'user_id é imutável'
--   reset role;
--
-- ── T6: coluna visualizado_em existe e aceita carimbo ──────────────────────
--   -- (como service_role/worker, RLS off:)
--   update public.orcamentos_publicos set visualizado_em = now()
--     where orcamento_id = '<ORC>';                 -- PASSA; app passa a ler a visualização
-- ============================================================================
