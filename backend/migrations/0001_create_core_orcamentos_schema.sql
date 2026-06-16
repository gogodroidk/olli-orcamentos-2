-- Core relational schema for OLLI Orçamentos (shared between the mobile app and the web PWA).
-- Every table is scoped per-user via user_id (defaults to auth.uid()) and protected by RLS.
-- The existing public.backups table is intentionally left untouched.
-- Applied to project "OLLI ORCAMENTOS" (yiaeplqinnnnniyvwtls).

-- Helper: keep atualizado_em fresh on update (SECURITY INVOKER + locked search_path)
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ── EMPRESA (one profile per user) ───────────────────────────────
create table if not exists public.empresa (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.empresa enable row level security;
create policy "empresa_owner" on public.empresa
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger empresa_set_atualizado_em before update on public.empresa
  for each row execute function public.set_atualizado_em();

-- ── CLIENTES ─────────────────────────────────────────────────────
create table if not exists public.clientes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  telefone text,
  cpf text,
  cnpj text,
  endereco text,
  complemento text,
  estado text,
  cidade text,
  cep text,
  criado_em timestamptz not null default now()
);
alter table public.clientes enable row level security;
create policy "clientes_owner" on public.clientes
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists clientes_user_id_idx on public.clientes(user_id);

-- ── SERVICOS ─────────────────────────────────────────────────────
create table if not exists public.servicos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric not null default 0,
  custo numeric,
  unidade text default 'un',
  foto_uri text,
  criado_em timestamptz not null default now()
);
alter table public.servicos enable row level security;
create policy "servicos_owner" on public.servicos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists servicos_user_id_idx on public.servicos(user_id);

-- ── PRODUTOS ─────────────────────────────────────────────────────
create table if not exists public.produtos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  preco numeric not null default 0,
  custo numeric,
  marca text,
  modelo text,
  unidade text default 'un',
  foto_uri text,
  criado_em timestamptz not null default now()
);
alter table public.produtos enable row level security;
create policy "produtos_owner" on public.produtos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists produtos_user_id_idx on public.produtos(user_id);

-- ── ORCAMENTOS (hybrid: queryable columns + full object in dados) ─
create table if not exists public.orcamentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero text not null,
  cliente_id text,
  cliente_nome text,
  status text not null default 'rascunho',
  subtotal numeric not null default 0,
  desconto numeric not null default 0,
  valor_total numeric not null default 0,
  data_emissao timestamptz,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.orcamentos enable row level security;
create policy "orcamentos_owner" on public.orcamentos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists orcamentos_user_id_idx on public.orcamentos(user_id);
create index if not exists orcamentos_user_status_idx on public.orcamentos(user_id, status);
create index if not exists orcamentos_user_criado_idx on public.orcamentos(user_id, criado_em desc);
create trigger orcamentos_set_atualizado_em before update on public.orcamentos
  for each row execute function public.set_atualizado_em();

-- ── RECIBOS ──────────────────────────────────────────────────────
create table if not exists public.recibos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero text not null,
  orcamento_id text,
  cliente_id text,
  cliente_nome text,
  valor_recebido numeric not null default 0,
  forma_pagamento text,
  data_recebimento timestamptz,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.recibos enable row level security;
create policy "recibos_owner" on public.recibos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists recibos_user_id_idx on public.recibos(user_id);

-- ── MODELOS ──────────────────────────────────────────────────────
create table if not exists public.modelos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.modelos enable row level security;
create policy "modelos_owner" on public.modelos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists modelos_user_id_idx on public.modelos(user_id);

-- ── DEPOIMENTOS ──────────────────────────────────────────────────
create table if not exists public.depoimentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome_cliente text not null,
  estrelas int not null default 5,
  texto text,
  criado_em timestamptz not null default now()
);
alter table public.depoimentos enable row level security;
create policy "depoimentos_owner" on public.depoimentos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists depoimentos_user_id_idx on public.depoimentos(user_id);

-- ── CONTADORES (monotonic sequence per user) ─────────────────────
create table if not exists public.contadores (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave text not null,
  valor int not null default 0,
  primary key (user_id, chave)
);
alter table public.contadores enable row level security;
create policy "contadores_owner" on public.contadores
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
