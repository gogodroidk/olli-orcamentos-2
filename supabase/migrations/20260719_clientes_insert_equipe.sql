-- Achado P1-3 da auditoria geral (docs/AUDITORIA_GERAL.md): cliente cadastrado
-- pelo TÉCNICO no wizard (Step1Cliente) sumia pro dono/equipe SEM ERRO NENHUM.
-- Idempotente. Aplicar após 20260707_multitenant.sql (depende de
-- public.donos_visiveis()).
--
-- CAUSA:
--   `clientes` era a única tabela org-scoped de escrita "só do dono": a policy
--   `clientes_owner_write` (FOR ALL) exigia `auth.uid() = user_id` em qualquer
--   INSERT/UPDATE/DELETE. Como a coluna `user_id` tem DEFAULT auth.uid(), um
--   técnico que cadastra cliente no wizard grava com o PRÓPRIO user_id — a
--   policy deixa passar (afinal `auth.uid() = user_id` bate), mas o registro
--   nasce fora do tenant do dono e some da lista da empresa. O comentário
--   original da 20260707_multitenant.sql ("se a Onda 2/UI precisar de técnico
--   criando cliente, amplia-se o INSERT igual a orcamentos") é exatamente este
--   caso — o wizard já deixa, então a RLS precisa acompanhar.
--
-- CORREÇÃO (opção (a) recomendada pela auditoria, alinhada com o que
-- usePermissao.ts já documenta — `tecnico` tem `ver_clientes`+`criar_orcamento`):
--   1) Coluna `criado_por` (mesmo padrão de orcamentos/agendamentos/
--      ordens_servico — DEFAULT auth.uid(), carimba a autoria do técnico).
--   2) `clientes_owner_write` (FOR ALL) vira 3 policies: UPDATE/DELETE
--      permanecem só do dono (fora do escopo deste achado — P1-3 é só sobre o
--      cliente NASCER no tenant certo); INSERT ganha o caminho do membro ATIVO
--      gravando em nome do owner da sua org, espelhando EXATAMENTE
--      `orcamentos_membro_insert` (20260707_multitenant.sql).
--   O app-side (cloudSync.ts pushRowUnchecked) já foi ajustado para injetar
--   `user_id = contextoEquipeOwner` em `clientes` como faz para as demais
--   tabelas de escrita da equipe — sem isso o INSERT continuaria indo pro
--   próprio tenant do técnico mesmo com a RLS aberta.

-- 1) autoria do técnico.
alter table public.clientes
  add column if not exists criado_por uuid default auth.uid();

-- 2) troca a policy única FOR ALL por 3 policies dedicadas.
drop policy if exists clientes_owner_write on public.clientes;

-- UPDATE: continua só do dono (conservador — não é o que P1-3 pede).
drop policy if exists clientes_owner_update on public.clientes;
create policy clientes_owner_update
  on public.clientes
  as permissive for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- DELETE: continua só do dono.
drop policy if exists clientes_owner_delete on public.clientes;
create policy clientes_owner_delete
  on public.clientes
  as permissive for delete to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT: dono grava o próprio (single-tenant intacto) OU membro ativo grava em
-- nome do owner da sua org, carimbando a própria autoria em criado_por — mesmo
-- padrão de orcamentos_membro_insert.
drop policy if exists clientes_membro_insert on public.clientes;
create policy clientes_membro_insert
  on public.clientes
  as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (
      user_id in (select public.donos_visiveis())
      and criado_por = (select auth.uid())
    )
  );

-- ============================================================================
-- TESTES SQL (rodar MANUALMENTE — o integrador executa; RLS com 2 JWTs A/B).
-- Substitua <A> (dono) e <B> (técnico ATIVO da org de A — ver 20260707 §8 T3).
--
-- ── T1: dono cria cliente e o lê (single-tenant intacto) ────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   insert into public.clientes (id, nome) values ('cli-teste-1', 'Cliente do dono');  -- PASSA
--   reset role;
--
-- ── T2: técnico ATIVO cria cliente EM NOME do dono (autoria carimbada) ──────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   insert into public.clientes (id, user_id, criado_por, nome)
--     values ('cli-teste-2', '<A>', '<B>', 'Cliente do técnico');  -- PASSA (nasce no tenant de A)
--   select count(*) from public.clientes where id = 'cli-teste-2';  -- 1 (o dono e a equipe enxergam)
--   -- proibido: gravar em nome de A mas sem ser o autor → viola o WITH CHECK
--   -- insert into public.clientes (id, user_id, criado_por) values ('cli-x','<A>','<C-qualquer>'); -- FALHA
--   reset role;
--
-- ── T3: técnico NÃO edita/apaga cliente do dono (escrita conservadora) ──────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   update public.clientes set nome = 'hack' where id = 'cli-teste-1';  -- 0 linhas (WITH CHECK barra)
--   delete from public.clientes where id = 'cli-teste-1';               -- 0 linhas
--   reset role;
-- ============================================================================
