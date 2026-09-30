-- ============================================================================
-- OLLI Orçamentos — "OLLI prepara a nota" (NFS-e pelo Emissor Nacional)
-- ----------------------------------------------------------------------------
-- O OLLI NÃO emite a nota. A partir de um recibo, o app/painel monta os dados
-- da NFS-e (regra pura em src/utils/notaServico.ts) e o prestador emite no
-- Emissor Nacional com a conta gov.br dele. Esta migration só GUARDA:
--
--   1. public.notas_preparadas — os dados preparados (snapshot `dados`, jsonb) e
--      o status: 'preparada' ou 'emitida' (pelo prestador, com o número que o
--      portal deu). Uma linha por recibo do tenant.
--   2. public.nota_automatica_interesse — quem tocou em "Quero a nota automática"
--      (pré-venda: mede interesse, sem preço e sem cobrança). Uma linha por conta.
--
-- Tenant = user_id do DONO da conta (mesmo modelo de `recibos`):
--   * leitura: dono e membros ativos da organização (public.donos_visiveis());
--   * escrita: só o dono (auth.uid() = user_id), igual a recibos — membro de
--     equipe não emite recibo, então também não prepara a nota do dono.
--   * sem DELETE: nota preparada/emitida é registro fiscal do prestador.
--
-- Coerência no banco (não só na tela):
--   * status 'emitida' exige número (NFS-e com até 13 dígitos ou a chave de
--     acesso de 50) e data; 'preparada' não pode ter número;
--   * depois de emitida, os `dados` não mudam (volta para 'preparada' primeiro);
--   * `atualizado_em` é carimbado pelo banco.
--
-- NÃO aplicar direto na produção sem revisão: arquivo novo, aplicado depois do
-- merge (Management API ou MCP) e conferido por SELECT (ver o PR).
-- ============================================================================

begin;

create table if not exists public.notas_preparadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recibo_id text not null,
  dados jsonb not null,
  status text not null default 'preparada',
  numero_nota text,
  emitida_em timestamptz,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint notas_preparadas_recibo_unico unique (user_id, recibo_id),
  constraint notas_preparadas_recibo_id_tamanho check (char_length(recibo_id) between 1 and 100),
  constraint notas_preparadas_dados_objeto check (jsonb_typeof(dados) = 'object' and pg_column_size(dados) <= 32768),
  constraint notas_preparadas_status_valido check (status in ('preparada', 'emitida')),
  constraint notas_preparadas_numero_formato check (numero_nota is null or numero_nota ~ '^([0-9]{1,13}|[0-9]{50})$'),
  constraint notas_preparadas_status_coerente check (
    (status = 'preparada' and numero_nota is null and emitida_em is null)
    or (status = 'emitida' and numero_nota is not null and emitida_em is not null)
  )
);

comment on table public.notas_preparadas is
  'Dados de NFS-e preparados pelo OLLI a partir de um recibo. O OLLI não emite: status emitida = o prestador informou o número que o Emissor Nacional deu.';

create index if not exists notas_preparadas_user_atualizado_idx
  on public.notas_preparadas (user_id, atualizado_em desc);

-- Carimbo do relógio + trava dos dados de nota já emitida.
create or replace function public.notas_preparadas_antes_de_gravar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id or new.recibo_id is distinct from old.recibo_id then
      raise exception 'nota_preparada_origem_imutavel' using errcode = '23514';
    end if;
    if old.status = 'emitida' and new.status = 'emitida' and new.dados is distinct from old.dados then
      raise exception 'nota_emitida_imutavel' using errcode = '23514';
    end if;
    new.criado_em := old.criado_em;
    new.criado_por := old.criado_por;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists notas_preparadas_antes_de_gravar on public.notas_preparadas;
create trigger notas_preparadas_antes_de_gravar
  before insert or update on public.notas_preparadas
  for each row execute function public.notas_preparadas_antes_de_gravar();

alter table public.notas_preparadas enable row level security;
alter table public.notas_preparadas force row level security;

drop policy if exists notas_preparadas_select on public.notas_preparadas;
create policy notas_preparadas_select
  on public.notas_preparadas
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists notas_preparadas_insert on public.notas_preparadas;
create policy notas_preparadas_insert
  on public.notas_preparadas
  as permissive for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists notas_preparadas_update on public.notas_preparadas;
create policy notas_preparadas_update
  on public.notas_preparadas
  as permissive for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.notas_preparadas from public, anon, authenticated;
grant select, insert, update on table public.notas_preparadas to authenticated;
grant all on table public.notas_preparadas to service_role;
revoke all on function public.notas_preparadas_antes_de_gravar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interesse na nota automática (pré-venda). Uma linha por conta; tocar de novo
-- não duplica (a tela trata o 23505 como "já registrado"). Só a própria conta lê
-- a sua linha; a contagem é feita pelo dono do produto com service_role:
--   select origem, count(*) from public.nota_automatica_interesse group by 1;
-- ---------------------------------------------------------------------------
create table if not exists public.nota_automatica_interesse (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  origem text not null,
  criado_em timestamptz not null default now(),
  constraint nota_automatica_interesse_origem check (origem in ('app', 'painel'))
);

comment on table public.nota_automatica_interesse is
  'Quem pediu "Quero a nota automática" (mede a pré-venda; não há preço nem cobrança).';

alter table public.nota_automatica_interesse enable row level security;
alter table public.nota_automatica_interesse force row level security;

drop policy if exists nota_automatica_interesse_select on public.nota_automatica_interesse;
create policy nota_automatica_interesse_select
  on public.nota_automatica_interesse
  as permissive for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists nota_automatica_interesse_insert on public.nota_automatica_interesse;
create policy nota_automatica_interesse_insert
  on public.nota_automatica_interesse
  as permissive for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.nota_automatica_interesse from public, anon, authenticated;
grant select, insert on table public.nota_automatica_interesse to authenticated;
grant all on table public.nota_automatica_interesse to service_role;

commit;

-- Rollback (sem dado de outro lugar dependendo destas tabelas):
--   drop table if exists public.nota_automatica_interesse;
--   drop table if exists public.notas_preparadas;
--   drop function if exists public.notas_preparadas_antes_de_gravar();
