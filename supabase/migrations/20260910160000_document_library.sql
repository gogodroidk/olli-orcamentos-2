-- Biblioteca de documentos: registro atual + versões append-only.
-- Staging-first. PDFs/arquivos não são inventados aqui; Storage entra quando o
-- artefato for efetivamente persistido pelo adapter de exportação.

create table if not exists public.documentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('orcamento','contrato','garantia','conclusao','recibo','ordem_servico','pmoc','laudo','checklist','certificado')),
  status text not null default 'rascunho' check (status in ('rascunho','pronto','enviado','assinado','arquivado')),
  titulo text not null,
  cliente_id text,
  cliente_nome text not null default '',
  origem_tipo text not null check (origem_tipo in ('orcamento','recibo','ordem_servico','pmoc','manual')),
  origem_id text,
  origem_numero text,
  versao_atual integer not null default 1 check (versao_atual >= 1),
  dados jsonb not null default '{}'::jsonb,
  arquivo_uri text,
  arquivo_hash text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz,
  assinado_em timestamptz,
  excluido_em timestamptz
);

create unique index if not exists documentos_origem_ativo_unica
  on public.documentos (user_id, tipo, origem_tipo, origem_id)
  where excluido_em is null and origem_id is not null;
create index if not exists documentos_user_atualizado_idx
  on public.documentos (user_id, atualizado_em desc);
create index if not exists documentos_cliente_idx
  on public.documentos (user_id, cliente_id, atualizado_em desc);

create table if not exists public.documento_versoes (
  id text primary key,
  documento_id text not null references public.documentos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero_versao integer not null check (numero_versao >= 1),
  dados jsonb not null default '{}'::jsonb,
  arquivo_uri text,
  arquivo_hash text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  unique (documento_id, numero_versao)
);
create index if not exists documento_versoes_user_idx
  on public.documento_versoes (user_id, documento_id, numero_versao desc);

alter table public.documentos enable row level security;
alter table public.documentos force row level security;
alter table public.documento_versoes enable row level security;
alter table public.documento_versoes force row level security;

drop policy if exists documentos_visible_select on public.documentos;
create policy documentos_visible_select on public.documentos
  for select to authenticated
  using (user_id in (select public.donos_visiveis()));
drop policy if exists documentos_visible_insert on public.documentos;
create policy documentos_visible_insert on public.documentos
  for insert to authenticated
  with check (user_id in (select public.donos_visiveis()));
drop policy if exists documentos_visible_update on public.documentos;
create policy documentos_visible_update on public.documentos
  for update to authenticated
  using (user_id in (select public.donos_visiveis()))
  with check (user_id in (select public.donos_visiveis()));
drop policy if exists documentos_visible_delete on public.documentos;
create policy documentos_visible_delete on public.documentos
  for delete to authenticated
  using (user_id in (select public.donos_visiveis()));

drop policy if exists documento_versoes_visible_select on public.documento_versoes;
create policy documento_versoes_visible_select on public.documento_versoes
  for select to authenticated
  using (user_id in (select public.donos_visiveis()));
drop policy if exists documento_versoes_visible_insert on public.documento_versoes;
create policy documento_versoes_visible_insert on public.documento_versoes
  for insert to authenticated
  with check (user_id in (select public.donos_visiveis()));

comment on table public.documentos is 'Biblioteca OLLI: registro atual de documento; versões e artefatos não devem ser sobrescritos após envio.';
comment on table public.documento_versoes is 'Snapshots append-only de documentos OLLI; uma versão enviada/assinada não é editada.';
