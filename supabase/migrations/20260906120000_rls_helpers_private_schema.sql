-- ============================================================================
-- OLLI Orçamentos — helpers de RLS fora do schema exposto
-- ----------------------------------------------------------------------------
-- O Advisor do Supabase apontou cinco helpers SECURITY DEFINER no schema
-- `public` (`eh_membro_ativo`, `eh_gestao`, `eh_admin_org`,
-- `donos_visiveis` e `perfil_visivel`). Eles precisam de SECURITY DEFINER para
-- consultar a relação de equipe sem recursão de RLS, mas não são endpoints de
-- negócio. Mantê-los no schema exposto faz o Advisor tratá-los como RPCs de
-- aplicação disponíveis a usuários autenticados.
--
-- Esta migration mantém o contrato de todas as policies existentes:
--   * o nome e a assinatura pública continuam iguais;
--   * os wrappers públicos passam a SECURITY INVOKER;
--   * a implementação privilegiada fica em `private`, schema que não está em
--     [api].schemas de supabase/config.toml;
--   * `auth.uid()` continua sendo a única identidade usada na autorização;
--   * `anon` e `public` não recebem EXECUTE em nenhum helper.
--
-- NÃO aplicar diretamente na produção. O projeto live ainda exige janela de
-- migration, backup schema-only, canário com dois JWTs e reexecução do Advisor.
-- ============================================================================

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Implementações privilegiadas. O search_path vazio + nomes qualificados é
-- obrigatório: o owner ignora RLS somente nestes SELECTs internos e nenhuma
-- resolução de objeto pode ser influenciada por um schema do chamador.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function private.eh_membro_ativo(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizacao_membros m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.ativo
  );
$$;

create or replace function private.eh_gestao(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizacao_membros m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.ativo
      and m.papel in ('owner', 'admin', 'gestor')
  );
$$;

create or replace function private.eh_admin_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizacao_membros m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.ativo
      and m.papel in ('owner', 'admin')
  );
$$;

create or replace function private.donos_visiveis()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid())
  union
  select o.owner_user_id
  from public.organizacoes o
  join public.organizacao_membros m on m.org_id = o.id
  where m.user_id = (select auth.uid())
    and m.ativo;
$$;

create or replace function private.perfil_visivel(alvo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select alvo = (select auth.uid())
      or exists (
        select 1
        from public.organizacao_membros meu
        join public.organizacao_membros dele on dele.org_id = meu.org_id
        where meu.user_id = (select auth.uid())
          and private.eh_gestao(meu.org_id)
          and dele.user_id = alvo
      );
$$;

-- A chamada parte do wrapper invoker com o papel do cliente. Execute explícito
-- é necessário para a resolução da função, mas o schema privado não é exposto
-- pela Data API. O próprio helper continua limitado a auth.uid().
revoke all on function private.eh_membro_ativo(uuid) from public, anon;
revoke all on function private.eh_gestao(uuid) from public, anon;
revoke all on function private.eh_admin_org(uuid) from public, anon;
revoke all on function private.donos_visiveis() from public, anon;
revoke all on function private.perfil_visivel(uuid) from public, anon;
grant execute on function private.eh_membro_ativo(uuid) to authenticated, service_role;
grant execute on function private.eh_gestao(uuid) to authenticated, service_role;
grant execute on function private.eh_admin_org(uuid) to authenticated, service_role;
grant execute on function private.donos_visiveis() to authenticated, service_role;
grant execute on function private.perfil_visivel(uuid) to authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Wrappers compatíveis no schema público. SECURITY INVOKER é intencional: a
-- policy continua sendo avaliada como o usuário da requisição e só delega o
-- SELECT interno que precisa ignorar RLS.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.eh_membro_ativo(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.eh_membro_ativo(p_org);
$$;

create or replace function public.eh_gestao(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.eh_gestao(p_org);
$$;

create or replace function public.eh_admin_org(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.eh_admin_org(p_org);
$$;

create or replace function public.donos_visiveis()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.donos_visiveis();
$$;

create or replace function public.perfil_visivel(alvo uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.perfil_visivel(alvo);
$$;

revoke all on function public.eh_membro_ativo(uuid) from public, anon;
revoke all on function public.eh_gestao(uuid) from public, anon;
revoke all on function public.eh_admin_org(uuid) from public, anon;
revoke all on function public.donos_visiveis() from public, anon;
revoke all on function public.perfil_visivel(uuid) from public, anon;
grant execute on function public.eh_membro_ativo(uuid) to authenticated, service_role;
grant execute on function public.eh_gestao(uuid) to authenticated, service_role;
grant execute on function public.eh_admin_org(uuid) to authenticated, service_role;
grant execute on function public.donos_visiveis() to authenticated, service_role;
grant execute on function public.perfil_visivel(uuid) to authenticated, service_role;

commit;

-- Rollback: recriar os cinco corpos SECURITY DEFINER públicos a partir de
-- `20260707_multitenant.sql` e `20260723_profiles_view_hardening.sql`, mantendo
-- os mesmos REVOKE/GRANT. Não remova o schema `private` numa janela que ainda
-- tenha wrappers apontando para ele.
