-- ============================================================================
-- OLLI Orçamentos — ORDENS DE SERVIÇO (OS mínima + base do app do técnico).
-- Onda 4, frente A "Fundação (schema + dados + service)".
-- ----------------------------------------------------------------------------
-- O QUE ESTA MIGRATION FAZ (tudo IDEMPOTENTE — pode rodar N vezes sem erro):
--   1) public.ordens_servico: a Ordem de Serviço executável (aberta → agendada →
--      em_execução → pausada → concluída/cancelada). Nasce de um orçamento
--      APROVADO (orcamento_id) ou é criada à mão. Guarda checklist e fotos como
--      jsonb, técnico atribuído, e o valor herdado do orçamento.
--
-- IMPORTANTE (não aplicar à mão): o INTEGRADOR revisa e aplica via
--   mcp__supabase__apply_migration e roda os testes SQL do rodapé (2 JWTs A/B).
--
-- PADRÕES HERDADOS (idênticos a 20260707_multitenant / 20260708_versoes — NÃO
-- divergir): PK `text` gerada no app (id estável entre aparelhos, igual
-- orcamento_versoes); `user_id uuid not null default auth.uid()` + FK auth.users
-- → o app faz upsert SEM enviar user_id (o default + RLS preenchem/protegem, padrão
-- de cloudSync); `criado_por uuid default auth.uid()` carimba a autoria do técnico
-- que criou em nome do dono. Multi-tenant por CAMADA DE ACESSO: os dados são do
-- OWNER (user_id = dono); a equipe ativa enxerga/escreve via public.donos_visiveis()
-- (SECURITY DEFINER, search_path=''). RLS de PERF: SEMPRE `(select auth.uid())`
-- (InitPlan, avaliado 1x por query). `tecnico_id` NÃO é o dono da linha — é só a
-- atribuição (quem vai executar); os dados continuam do owner.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) TABELA: public.ordens_servico
--    PK = id (text gerado no app). `orcamento_id` NULLABLE = origem (OS avulsa não
--    tem orçamento). checklist/fotos como jsonb (mesmo padrão de orcamento_versoes.
--    dados / assets). `valor` numeric herdado do orçamento aprovado.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.ordens_servico (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por    uuid default auth.uid(),
  numero        text,
  orcamento_id  text,                    -- origem (nullable): OS gerada de um orçamento aprovado
  cliente_id    text,
  cliente_nome  text,
  titulo        text,
  descricao     text,
  status        text not null default 'aberta'
                check (status in ('aberta','agendada','em_execucao','pausada','concluida','cancelada')),
  tecnico_id    uuid,                     -- atribuição (quem executa) — NÃO é o dono da linha
  tecnico_nome  text,
  data_agendada timestamptz,
  checklist     jsonb not null default '[]'::jsonb,
  fotos         jsonb not null default '[]'::jsonb,
  observacoes   text,
  valor         numeric,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Índices de apoio às policies/joins e às consultas do app (minhas OS, por status).
create index if not exists ordens_servico_user_idx      on public.ordens_servico (user_id);
create index if not exists ordens_servico_orcamento_idx  on public.ordens_servico (orcamento_id);
create index if not exists ordens_servico_tecnico_idx    on public.ordens_servico (tecnico_id);
create index if not exists ordens_servico_status_idx     on public.ordens_servico (status);

alter table public.ordens_servico enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) TRIGGER: user_id IMUTÁVEL (mesmo hardening de orcamentos/agendamentos/versoes).
--    Impede que um membro dê UPDATE trocando o dono e exfiltre a OS do tenant.
--    A helper public.bloquear_troca_user_id já existe (20260708_multitenant_fixes);
--    reusamos. Guarda defensiva: só cria o trigger se a função existir.
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bloquear_troca_user_id'
  ) then
    drop trigger if exists ordens_servico_user_id_imutavel on public.ordens_servico;
    create trigger ordens_servico_user_id_imutavel
      before update on public.ordens_servico
      for each row execute function public.bloquear_troca_user_id();
  end if;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) RLS — dados do dono com LEITURA/ESCRITA COMPARTILHADA pela equipe ativa.
--    Padrão idêntico a orcamentos/orcamento_versoes:
--      SELECT: user_id in (select donos_visiveis())         [fallback: só o dono]
--      INSERT: dono (self) OU membro ativo em nome do owner, carimbando criado_por
--      UPDATE/DELETE: quem está no conjunto donos_visiveis() [fallback: só o dono]
--    Blocos `do $$` verificam a existência de donos_visiveis p/ o fallback seguro
--    (projeto sem a fundação multi-tenant → cai para "só o dono", NUNCA vaza).
-- ────────────────────────────────────────────────────────────────────────────

-- SELECT: dono OU membro ativo da org do dono (leitura compartilhada).
do $$
begin
  drop policy if exists ordens_servico_select on public.ordens_servico;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy ordens_servico_select
      on public.ordens_servico
      as permissive for select to authenticated
      using (user_id in (select public.donos_visiveis()));
  else
    create policy ordens_servico_select
      on public.ordens_servico
      as permissive for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

-- INSERT: dono grava o próprio (single-tenant intacto) OU membro ativo grava em
-- nome do owner da sua org, carimbando a própria autoria em criado_por.
do $$
begin
  drop policy if exists ordens_servico_insert on public.ordens_servico;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy ordens_servico_insert
      on public.ordens_servico
      as permissive for insert to authenticated
      with check (
        user_id = (select auth.uid())
        or (
          user_id in (select public.donos_visiveis())
          and criado_por = (select auth.uid())
        )
      );
  else
    create policy ordens_servico_insert
      on public.ordens_servico
      as permissive for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- UPDATE: dono OU membro ativo da org do dono (escrita compartilhada — o técnico
-- toca status/checklist/fotos da OS do dono). O trigger acima já barra troca de dono.
do $$
begin
  drop policy if exists ordens_servico_update on public.ordens_servico;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy ordens_servico_update
      on public.ordens_servico
      as permissive for update to authenticated
      using (user_id in (select public.donos_visiveis()))
      with check (user_id in (select public.donos_visiveis()));
  else
    create policy ordens_servico_update
      on public.ordens_servico
      as permissive for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- DELETE: dono OU membro ativo da org do dono.
do $$
begin
  drop policy if exists ordens_servico_delete on public.ordens_servico;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  ) then
    create policy ordens_servico_delete
      on public.ordens_servico
      as permissive for delete to authenticated
      using (user_id in (select public.donos_visiveis()));
  else
    create policy ordens_servico_delete
      on public.ordens_servico
      as permissive for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;


-- ============================================================================
-- 4) TESTES SQL (rodar MANUALMENTE — o integrador executa; RLS com 2 JWTs A/B).
-- ----------------------------------------------------------------------------
-- Substitua <A> (dono) e <B> (técnico da org de A) por auth.users reais. A
-- preparação de A/org/convite: ver 20260707_multitenant §8 T3.
--
-- ── T1: dono cria OS e a lê (single-tenant intacto) ────────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.ordens_servico (id, numero, titulo, status)
--     values ('os-teste-1', 'OS-0001', 'Instalação split', 'aberta');   -- PASSA (user_id=default A)
--   select count(*) from public.ordens_servico where id = 'os-teste-1';  -- 1
--   reset role;
--
-- ── T2: outro user SEM org NÃO vê a OS de A (zero vazamento entre tenants) ──
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.ordens_servico where id = 'os-teste-1';  -- 0 (se B não é membro de A)
--   reset role;
--
-- ── T3: técnico ATIVO da org de A vê e cria OS em nome de A (autoria carimbada) ─
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.ordens_servico where id = 'os-teste-1';  -- >= 1 (vê as de A)
--   insert into public.ordens_servico (id, user_id, criado_por, numero, titulo)
--     values ('os-teste-2', '<A>', '<B>', 'OS-0002', 'Manutenção');      -- PASSA (grava no tenant de A, autor B)
--   -- proibido: gravar em nome de A sem ser o autor → viola o WITH CHECK do INSERT
--   -- insert into public.ordens_servico (id, user_id, criado_por) values ('os-x','<A>','<C-qualquer>'); -- FALHA
--   reset role;
--
-- ── T4: membro ativo atualiza status/checklist da OS de A ──────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   update public.ordens_servico set status = 'em_execucao' where id = 'os-teste-1';  -- PASSA
--   reset role;
--
-- ── T5: user_id imutável (não transfere a OS do tenant de A para B) ─────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   update public.ordens_servico set user_id = '<B>' where id = 'os-teste-1';  -- FALHA: 'user_id é imutável'
--   reset role;
--
-- ── T6: desativar B corta o acesso (ativo=false) ───────────────────────────
--   -- A desativa B (ver 20260707_multitenant §8 T5), depois:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.ordens_servico where id = 'os-teste-1';  -- 0 (perde o acesso ao tenant de A)
--   reset role;
--
-- ── T7: check do status barra valor inválido ───────────────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.ordens_servico (id, status) values ('os-bad', 'faturada');  -- FALHA: check status
--   reset role;
-- ============================================================================
