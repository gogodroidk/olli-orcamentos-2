-- ============================================================================
-- OLLI — Realtime no link do cliente (Onda 2, item 2.10: detalhe do orçamento)
-- ----------------------------------------------------------------------------
-- A linha do tempo do detalhe do orçamento escuta mudanças em
-- public.orcamentos_publicos (o cliente abriu, aprovou, recusou ou avisou que
-- pagou) para se atualizar com a tela aberta, sem o prestador puxar para baixo.
--
-- Até 01/10/2026 a publicação `supabase_realtime` estava VAZIA (nenhuma tabela).
-- Esta migration só inclui orcamentos_publicos nela. Nada muda na RLS: o Realtime
-- (postgres_changes) aplica a policy `orcamentos_publicos_owner` com o JWT de quem
-- escuta — o dono recebe só as linhas dele; o cliente anônimo do link não tem
-- credencial de banco e não recebe nada.
--
-- SEM ESTA MIGRATION o app funciona igual: a inscrição não recebe evento e a
-- linha do tempo segue atualizando no foco da tela e no "puxar para atualizar".
-- O app não promete "ao vivo" em nenhum texto.
--
-- CUSTO: Realtime faz parte do plano gratuito do Supabase (cota de mensagens e
-- conexões simultâneas). Uma conexão por detalhe de orçamento aberto.
--
-- IDEMPOTENTE: só adiciona se ainda não estiver na publicação.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orcamentos_publicos'
  ) then
    alter publication supabase_realtime add table public.orcamentos_publicos;
  end if;
end
$$;
