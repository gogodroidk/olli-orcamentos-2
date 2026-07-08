-- ============================================================================
-- OLLI Orçamentos — Multi-tenant (fundação): organizações, membros, papéis,
-- convites, localização e acessos da equipe + RLS que abre os dados do OWNER
-- para os membros ATIVOS da organização.
-- ----------------------------------------------------------------------------
-- Onda 2, frente "Schema multi-tenant + RLS (fundação)".
--
-- DECISÃO ARQUITETURAL FIRME (não mude sem revisar toda a onda):
--   Os dados do negócio (orcamentos/clientes/servicos/produtos/recibos/empresa/
--   agendamentos) continuam sendo do OWNER — NÃO migramos nada para org_id.
--   A organização é uma CAMADA de acesso: um membro ATIVO "enxerga" e "escreve"
--   nos dados cujo user_id é o owner_user_id da org à qual ele pertence.
--   Assim o modelo single-tenant existente continua 100% funcional (dono sozinho
--   sem org nenhuma vê exatamente o que via antes) e ninguém sem org vaza dado.
--
-- IDEMPOTÊNCIA: tudo é `create table if not exists`, `add column if not exists`,
--   `drop policy if exists` antes de `create policy`, `create or replace function`.
--   Pode rodar N vezes sem erro. NÃO aplique esta migration à mão — o integrador
--   revisa e aplica via mcp__supabase__apply_migration.
--
-- PADRÃO DE PERF (herdado de 20260615/20260624): SEMPRE `(select auth.uid())`
--   (subquery = InitPlan, avaliado 1x por query), nunca `auth.uid()` cru.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) TABELAS NOVAS
-- ────────────────────────────────────────────────────────────────────────────

-- organizacoes: uma por dono. owner_user_id é UNIQUE → um user é dono de no
-- máximo uma organização (regra do produto: a empresa É o negócio do dono).
create table if not exists public.organizacoes (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users (id) on delete cascade,
  nome          text,
  criado_em     timestamptz not null default now()
);

-- organizacao_membros: quem pertence a qual org e com que papel. O próprio
-- owner também vira uma linha aqui (papel 'owner') no ato da criação da org
-- (ver função criar_organizacao mais abaixo), para uniformizar os joins de RLS.
create table if not exists public.organizacao_membros (
  org_id     uuid not null references public.organizacoes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  papel      text not null check (papel in ('owner', 'admin', 'gestor', 'tecnico')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- convites: link tokenizado para entrar numa org. Aceite via função
-- SECURITY DEFINER aceitar_convite(token). aceito_por/aceito_em ficam nulos
-- até o convidado aceitar.
create table if not exists public.convites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes (id) on delete cascade,
  email      text not null,
  papel      text not null check (papel in ('admin', 'gestor', 'tecnico')),
  token      text not null unique,
  expira_em  timestamptz not null,
  aceito_por uuid references auth.users (id) on delete set null,
  aceito_em  timestamptz,
  criado_em  timestamptz not null default now()
);

-- localizacoes_equipe: última posição conhecida de cada membro (UPSERT por
-- (org_id,user_id) → uma linha por técnico, sempre a mais recente).
create table if not exists public.localizacoes_equipe (
  org_id       uuid not null references public.organizacoes (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  lat          float8,
  lng          float8,
  precisao     float8,
  capturado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- acessos_equipe: log append-only de eventos dos membros (login/app_open...).
-- Alimenta "ver todos os acessos" no dashboard empresa.
create table if not exists public.acessos_equipe (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizacoes (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  evento     text not null,
  plataforma text,
  criado_em  timestamptz not null default now()
);

-- Índices de apoio às policies/joins (idempotentes).
create index if not exists organizacao_membros_user_idx
  on public.organizacao_membros (user_id) where ativo;
create index if not exists convites_token_idx
  on public.convites (token);
create index if not exists convites_email_idx
  on public.convites (lower(email));
create index if not exists acessos_equipe_org_idx
  on public.acessos_equipe (org_id, criado_em desc);


-- ────────────────────────────────────────────────────────────────────────────
-- 2) COLUNA criado_por NAS TABELAS DE ESCRITA DA EQUIPE
--    Registra QUEM (técnico) criou o registro que pertence ao owner.
--    DEFAULT auth.uid() → o dono continua gravando sem enviar nada e a coluna
--    reflete ele mesmo; o técnico grava user_id=owner + criado_por=ele.
--    NOTA: em DEFAULT de coluna NÃO se pode usar subquery, então aqui é
--    `auth.uid()` cru (o truque `(select auth.uid())` só vale DENTRO de policies,
--    onde vira InitPlan — mesmo padrão do default de user_id em extras_sync).
-- ────────────────────────────────────────────────────────────────────────────
alter table public.orcamentos
  add column if not exists criado_por uuid default auth.uid();
alter table public.agendamentos
  add column if not exists criado_por uuid default auth.uid();


-- ────────────────────────────────────────────────────────────────────────────
-- 3) HABILITAR RLS NAS TABELAS NOVAS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.organizacoes         enable row level security;
alter table public.organizacao_membros  enable row level security;
alter table public.convites             enable row level security;
alter table public.localizacoes_equipe  enable row level security;
alter table public.acessos_equipe       enable row level security;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) FUNÇÕES AUXILIARES DE RLS (SECURITY DEFINER, STABLE)
--    Encapsulam os joins de pertencimento para: (a) evitar recursão de RLS entre
--    organizacoes ↔ organizacao_membros (uma policy que consulta a outra tabela
--    dispararia a RLS dela → recursão); (b) reusar a mesma lógica nas 7 tabelas
--    de dados. SECURITY DEFINER roda como owner do schema (ignora RLS por dentro),
--    então é seguro consultar as tabelas de membros aqui.
--    search_path travado em '' + nomes qualificados (padrão de hardening).
-- ────────────────────────────────────────────────────────────────────────────

-- É o usuário atual dono OU membro ATIVO da organização `p_org`?
create or replace function public.eh_membro_ativo(p_org uuid)
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

-- O usuário atual tem papel de GESTÃO (owner/admin/gestor) na organização `p_org`?
-- Usado para leitura de acessos/localizações e futura gestão de equipe.
create or replace function public.eh_gestao(p_org uuid)
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

-- O usuário atual é OWNER/ADMIN da organização `p_org`? (gestão de membros/convites)
create or replace function public.eh_admin_org(p_org uuid)
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

-- Conjunto de user_ids "donos de dados" que o usuário atual pode acessar:
-- ele próprio (single-tenant) + owners das orgs onde é membro ATIVO.
-- É a peça central que abre os dados do owner para os técnicos, SEM vazar para
-- quem não é membro. STABLE + SECURITY DEFINER (lê organizacoes/membros sem RLS).
create or replace function public.donos_visiveis()
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

revoke execute on function public.eh_membro_ativo(uuid)  from anon, public;
revoke execute on function public.eh_gestao(uuid)        from anon, public;
revoke execute on function public.eh_admin_org(uuid)     from anon, public;
revoke execute on function public.donos_visiveis()       from anon, public;
grant  execute on function public.eh_membro_ativo(uuid)  to authenticated;
grant  execute on function public.eh_gestao(uuid)        to authenticated;
grant  execute on function public.eh_admin_org(uuid)     to authenticated;
grant  execute on function public.donos_visiveis()       to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 5) RLS DAS TABELAS NOVAS
-- ────────────────────────────────────────────────────────────────────────────

-- organizacoes ---------------------------------------------------------------
-- SELECT: qualquer membro ativo vê a própria org (usa a helper, sem recursão).
drop policy if exists organizacoes_membro_select on public.organizacoes;
create policy organizacoes_membro_select
  on public.organizacoes
  as permissive for select to authenticated
  using (public.eh_membro_ativo(id));

-- INSERT: só o próprio user pode criar SUA org (owner_user_id = ele). Na prática
-- o app cria via função criar_organizacao (abaixo), mas manter a policy alinhada.
drop policy if exists organizacoes_owner_insert on public.organizacoes;
create policy organizacoes_owner_insert
  on public.organizacoes
  as permissive for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

-- UPDATE/DELETE: só o dono da org.
drop policy if exists organizacoes_owner_update on public.organizacoes;
create policy organizacoes_owner_update
  on public.organizacoes
  as permissive for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists organizacoes_owner_delete on public.organizacoes;
create policy organizacoes_owner_delete
  on public.organizacoes
  as permissive for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- organizacao_membros --------------------------------------------------------
-- SELECT: o próprio membro vê a própria linha; gestão vê todos da org.
drop policy if exists membros_self_ou_gestao_select on public.organizacao_membros;
create policy membros_self_ou_gestao_select
  on public.organizacao_membros
  as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.eh_gestao(org_id)
  );

-- INSERT direto: só owner/admin adiciona membros manualmente. (O caminho normal
-- é aceitar_convite, que é SECURITY DEFINER e não passa por esta policy.)
drop policy if exists membros_admin_insert on public.organizacao_membros;
create policy membros_admin_insert
  on public.organizacao_membros
  as permissive for insert to authenticated
  with check (public.eh_admin_org(org_id));

-- UPDATE (ativar/desativar, trocar papel): owner/admin. Guard extra: nunca
-- rebaixar/alterar a linha 'owner' via esta policy (papel owner é intocável aqui).
drop policy if exists membros_admin_update on public.organizacao_membros;
create policy membros_admin_update
  on public.organizacao_membros
  as permissive for update to authenticated
  using (public.eh_admin_org(org_id) and papel <> 'owner')
  with check (public.eh_admin_org(org_id) and papel <> 'owner');

-- DELETE: owner/admin remove membro (menos a linha do próprio owner).
drop policy if exists membros_admin_delete on public.organizacao_membros;
create policy membros_admin_delete
  on public.organizacao_membros
  as permissive for delete to authenticated
  using (public.eh_admin_org(org_id) and papel <> 'owner');

-- convites -------------------------------------------------------------------
-- SELECT: gestão da org vê os convites que emitiu. (O aceite lê o convite por
-- token via função SECURITY DEFINER, não precisa de SELECT aberto ao convidado.)
drop policy if exists convites_gestao_select on public.convites;
create policy convites_gestao_select
  on public.convites
  as permissive for select to authenticated
  using (public.eh_admin_org(org_id));

-- INSERT: owner/admin cria convites para a própria org.
drop policy if exists convites_gestao_insert on public.convites;
create policy convites_gestao_insert
  on public.convites
  as permissive for insert to authenticated
  with check (public.eh_admin_org(org_id));

-- DELETE (revogar convite): owner/admin.
drop policy if exists convites_gestao_delete on public.convites;
create policy convites_gestao_delete
  on public.convites
  as permissive for delete to authenticated
  using (public.eh_admin_org(org_id));

-- localizacoes_equipe --------------------------------------------------------
-- SELECT: gestão vê a equipe toda; o técnico vê a própria linha.
drop policy if exists loc_equipe_select on public.localizacoes_equipe;
create policy loc_equipe_select
  on public.localizacoes_equipe
  as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.eh_gestao(org_id)
  );

-- INSERT/UPDATE: o próprio membro ativo grava/atualiza SUA localização (upsert).
drop policy if exists loc_equipe_self_insert on public.localizacoes_equipe;
create policy loc_equipe_self_insert
  on public.localizacoes_equipe
  as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_membro_ativo(org_id));

drop policy if exists loc_equipe_self_update on public.localizacoes_equipe;
create policy loc_equipe_self_update
  on public.localizacoes_equipe
  as permissive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.eh_membro_ativo(org_id));

-- acessos_equipe -------------------------------------------------------------
-- SELECT: gestão vê o log da org; o membro vê os próprios acessos.
drop policy if exists acessos_select on public.acessos_equipe;
create policy acessos_select
  on public.acessos_equipe
  as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.eh_gestao(org_id)
  );

-- INSERT: o próprio membro ativo registra o próprio evento (login/app_open).
drop policy if exists acessos_self_insert on public.acessos_equipe;
create policy acessos_self_insert
  on public.acessos_equipe
  as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and public.eh_membro_ativo(org_id));
-- (sem UPDATE/DELETE: log é append-only)


-- ────────────────────────────────────────────────────────────────────────────
-- 6) REESCRITA DAS POLICIES DAS TABELAS DE DADOS EXISTENTES
--    Substituímos a policy única `*_owner` (FOR ALL) por policies separadas:
--      - SELECT: dono OU membro ativo da org do dono  → usa donos_visiveis()
--      - INSERT: dono (self) OU técnico gravando em nome do owner da sua org
--      - UPDATE/DELETE: dono OU membro ativo da org do dono (escrita compartilhada)
--    IMPORTANTE: dono sozinho (sem org) → donos_visiveis() = {ele} → comportamento
--    IDÊNTICO ao single-tenant atual. Nenhuma regressão para quem não tem equipe.
--
--    Tabelas SEM escrita de equipe (só leitura compartilhada + dono escreve):
--      empresa, clientes, servicos, produtos, recibos → SELECT amplia; escrita
--      permanece restrita ao dono (o técnico lê o catálogo/empresa, mas quem
--      edita o cadastro da empresa/cliente base é o dono/gestão via app).
--    Tabelas COM escrita de equipe (técnico cria em nome do owner):
--      orcamentos, agendamentos → INSERT/UPDATE/DELETE ampliados p/ membro ativo.
-- ────────────────────────────────────────────────────────────────────────────

-- ---- empresa (leitura compartilhada; escrita só do dono) --------------------
drop policy if exists empresa_owner on public.empresa;

drop policy if exists empresa_select on public.empresa;
create policy empresa_select
  on public.empresa
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists empresa_owner_write on public.empresa;
create policy empresa_owner_write
  on public.empresa
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- clientes (leitura compartilhada; escrita só do dono) -------------------
-- (o técnico cria clientes? Sim, mas via app grava com user_id=owner. Para
--  simplicidade e segurança da fundação, a escrita de clientes fica com o dono
--  e a gestão; se a Onda 2/UI precisar de técnico criando cliente, amplia-se o
--  INSERT igual a orcamentos. Deixado conservador de propósito — ver docs.)
drop policy if exists clientes_owner on public.clientes;

drop policy if exists clientes_select on public.clientes;
create policy clientes_select
  on public.clientes
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists clientes_owner_write on public.clientes;
create policy clientes_owner_write
  on public.clientes
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- servicos (catálogo: leitura compartilhada; escrita do dono) ------------
drop policy if exists servicos_owner on public.servicos;

drop policy if exists servicos_select on public.servicos;
create policy servicos_select
  on public.servicos
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists servicos_owner_write on public.servicos;
create policy servicos_owner_write
  on public.servicos
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- produtos (catálogo: leitura compartilhada; escrita do dono) ------------
drop policy if exists produtos_owner on public.produtos;

drop policy if exists produtos_select on public.produtos;
create policy produtos_select
  on public.produtos
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists produtos_owner_write on public.produtos;
create policy produtos_owner_write
  on public.produtos
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- recibos (leitura compartilhada; escrita do dono) -----------------------
drop policy if exists recibos_owner on public.recibos;

drop policy if exists recibos_select on public.recibos;
create policy recibos_select
  on public.recibos
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists recibos_owner_write on public.recibos;
create policy recibos_owner_write
  on public.recibos
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- orcamentos (leitura + ESCRITA compartilhada da equipe) -----------------
-- Técnico cria orçamento "em nome" do owner: user_id = owner da sua org e
-- criado_por = ele mesmo. UPDATE/DELETE liberados a membros ativos p/ tocar nos
-- dados do dono (a UI/usePermissao afina quem pode o quê; a RLS é o piso).
drop policy if exists orcamentos_owner on public.orcamentos;

drop policy if exists orcamentos_select on public.orcamentos;
create policy orcamentos_select
  on public.orcamentos
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists orcamentos_membro_insert on public.orcamentos;
create policy orcamentos_membro_insert
  on public.orcamentos
  as permissive for insert to authenticated
  with check (
    -- dono gravando o próprio dado (single-tenant intacto)...
    user_id = (select auth.uid())
    -- ...ou membro ativo gravando em nome do owner da sua org, carimbando autoria
    or (
      user_id in (select public.donos_visiveis())
      and criado_por = (select auth.uid())
    )
  );

drop policy if exists orcamentos_membro_update on public.orcamentos;
create policy orcamentos_membro_update
  on public.orcamentos
  as permissive for update to authenticated
  using (user_id in (select public.donos_visiveis()))
  with check (user_id in (select public.donos_visiveis()));

drop policy if exists orcamentos_membro_delete on public.orcamentos;
create policy orcamentos_membro_delete
  on public.orcamentos
  as permissive for delete to authenticated
  using (user_id in (select public.donos_visiveis()));

-- ---- agendamentos (leitura + ESCRITA compartilhada da equipe) ---------------
drop policy if exists agendamentos_owner on public.agendamentos;

drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select
  on public.agendamentos
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists agendamentos_membro_insert on public.agendamentos;
create policy agendamentos_membro_insert
  on public.agendamentos
  as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (
      user_id in (select public.donos_visiveis())
      and criado_por = (select auth.uid())
    )
  );

drop policy if exists agendamentos_membro_update on public.agendamentos;
create policy agendamentos_membro_update
  on public.agendamentos
  as permissive for update to authenticated
  using (user_id in (select public.donos_visiveis()))
  with check (user_id in (select public.donos_visiveis()));

drop policy if exists agendamentos_membro_delete on public.agendamentos;
create policy agendamentos_membro_delete
  on public.agendamentos
  as permissive for delete to authenticated
  using (user_id in (select public.donos_visiveis()));


-- ────────────────────────────────────────────────────────────────────────────
-- 7) FUNÇÕES DE NEGÓCIO (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────────────────────

-- criar_organizacao(nome): cria a org do usuário atual (owner) e já o inscreve
-- como membro 'owner' ativo. Idempotente: se já existir a org do usuário, só
-- retorna o id (não duplica). Retorna o id da organização.
create or replace function public.criar_organizacao(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'nao autenticado';
  end if;

  select id into v_org from public.organizacoes where owner_user_id = v_uid;

  if v_org is null then
    insert into public.organizacoes (owner_user_id, nome)
    values (v_uid, nullif(btrim(coalesce(p_nome, '')), ''))
    returning id into v_org;
  elsif nullif(btrim(coalesce(p_nome, '')), '') is not null then
    update public.organizacoes set nome = btrim(p_nome) where id = v_org;
  end if;

  -- garante a linha de membro 'owner' ativa (idempotente)
  insert into public.organizacao_membros (org_id, user_id, papel, ativo)
  values (v_org, v_uid, 'owner', true)
  on conflict (org_id, user_id) do update
    set papel = 'owner', ativo = true;

  return v_org;
end;
$$;

-- aceitar_convite(token): valida o convite (existe, não expirou, não foi aceito),
-- inscreve o usuário atual como membro ativo com o papel do convite e marca o
-- convite como aceito. Retorna texto de status legível pelo app.
-- SECURITY DEFINER: precisa ler/gravar convites e membros ignorando a RLS do
-- convidado (que ainda não é membro). search_path travado.
create or replace function public.aceitar_convite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv public.convites%rowtype;
begin
  if v_uid is null then
    return 'erro:nao_autenticado';
  end if;

  select * into v_conv
  from public.convites
  where token = p_token
  for update;

  if not found then
    return 'erro:convite_invalido';
  end if;

  if v_conv.aceito_em is not null then
    -- Se foi o próprio usuário que já aceitou, trata como sucesso idempotente.
    if v_conv.aceito_por = v_uid then
      return 'ja_aceito';
    end if;
    return 'erro:convite_ja_usado';
  end if;

  if v_conv.expira_em < now() then
    return 'erro:convite_expirado';
  end if;

  -- Inscreve/reativa o membro com o papel do convite (idempotente).
  insert into public.organizacao_membros (org_id, user_id, papel, ativo)
  values (v_conv.org_id, v_uid, v_conv.papel, true)
  on conflict (org_id, user_id) do update
    set papel = excluded.papel, ativo = true;

  update public.convites
    set aceito_por = v_uid, aceito_em = now()
    where id = v_conv.id;

  return 'ok';
end;
$$;

revoke execute on function public.criar_organizacao(text) from anon, public;
revoke execute on function public.aceitar_convite(text)   from anon, public;
grant  execute on function public.criar_organizacao(text) to authenticated;
grant  execute on function public.aceitar_convite(text)   to authenticated;


-- ============================================================================
-- 8) TESTES SQL (rodar MANUALMENTE com 2 JWTs — o integrador executa).
-- ----------------------------------------------------------------------------
-- Como rodar: use dois usuários reais A (dono) e B (técnico). No SQL editor do
-- Supabase, cada bloco `set request.jwt.claim.sub` simula um JWT. Substitua os
-- UUIDs <A> e <B> pelos auth.users reais. `set role authenticated` faz a RLS
-- valer (o role postgres/owner ignora RLS).
--
-- Preparação (como service_role / owner, RLS off):
--   -- garanta que A tem dados:
--   -- insert into public.orcamentos (id,user_id,numero,status) values (gen_random_uuid(), '<A>', 1, 'rascunho');
--
-- ── T1: dono sozinho NÃO regride (single-tenant intacto) ───────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select count(*) from public.orcamentos;         -- deve ver os dados de A
--   select count(*) from public.clientes;            -- idem
--   reset role;
--
-- ── T2: B (sem org) NÃO vê nada de A (zero vazamento) ──────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.orcamentos;          -- deve ser 0 (só o de B)
--   select count(*) from public.empresa;             -- 0 (não vê a empresa de A)
--   reset role;
--
-- ── T3: A cria org e convida B; B aceita; B passa a ver os dados de A ───────
--   -- A cria a org:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   select public.criar_organizacao('Empresa do A');           -- retorna org_id
--   -- A cria convite (pegue o org_id acima):
--   insert into public.convites (org_id, email, papel, token, expira_em)
--     values ('<ORG>', 'b@ex.com', 'tecnico', 'tok-teste-123', now() + interval '7 days');
--   reset role;
--   -- B aceita:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select public.aceitar_convite('tok-teste-123');            -- 'ok'
--   -- agora B enxerga os dados de A (via donos_visiveis):
--   select count(*) from public.orcamentos;    -- > 0 (vê os de A)
--   select count(*) from public.empresa;       -- vê a empresa de A
--   select count(*) from public.clientes;      -- vê os clientes de A
--   reset role;
--
-- ── T4: B (técnico ativo) cria orçamento EM NOME de A ──────────────────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   insert into public.orcamentos (id, user_id, numero, status, criado_por)
--     values (gen_random_uuid(), '<A>', 999, 'rascunho', '<B>');  -- deve PASSAR
--   -- tentativa proibida: gravar em nome de A mas sem ser o autor → deve FALHAR
--   -- insert ... values (..., '<A>', ..., '<C-qualquer>');       -- viola WITH CHECK
--   reset role;
--
-- ── T5: desativar B corta o acesso (ativo=false) ───────────────────────────
--   -- A desativa B:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<A>","role":"authenticated"}';
--   update public.organizacao_membros set ativo = false
--     where org_id = '<ORG>' and user_id = '<B>';
--   reset role;
--   -- B volta a não ver nada de A:
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   select count(*) from public.orcamentos;    -- só os de B (0 de A)
--   reset role;
--
-- ── T6: convite expirado/reuso ─────────────────────────────────────────────
--   -- aceitar token inexistente → 'erro:convite_invalido'
--   -- aceitar de novo o mesmo token pelo mesmo user → 'ja_aceito'
--   -- token com expira_em no passado → 'erro:convite_expirado'
--
-- ── T7: técnico NÃO edita catálogo/empresa (escrita conservadora) ──────────
--   set role authenticated;
--   set request.jwt.claims = '{"sub":"<B>","role":"authenticated"}';
--   update public.empresa set nome = 'hack' where user_id = '<A>';  -- 0 linhas (WITH CHECK barra)
--   -- (B lê a empresa de A, mas não edita — quem edita cadastro é o dono/gestão)
--   reset role;
-- ============================================================================
