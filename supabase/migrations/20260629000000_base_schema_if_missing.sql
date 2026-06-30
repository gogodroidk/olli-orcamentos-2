-- Base schema for OLLI Orçamentos.
-- Purpose: make a new Supabase project reproducible before the hardening
-- migrations in this folder run. This file is idempotent and should be reviewed
-- before applying to an existing production project.

create table if not exists public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.empresa (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

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

create table if not exists public.modelos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  descricao text,
  dados jsonb not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.depoimentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome_cliente text not null,
  estrelas integer not null default 5,
  texto text,
  criado_em timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id text,
  cliente_nome text not null,
  titulo text not null,
  tipo text not null,
  inicio timestamptz not null,
  fim timestamptz,
  endereco text,
  status text not null default 'agendado',
  orcamento_id text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.contadores (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave text not null,
  valor integer not null default 0,
  primary key (user_id, chave)
);

create table if not exists public.exclusoes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tabela text not null,
  item_id text not null,
  excluido_em timestamptz not null default now(),
  primary key (user_id, tabela, item_id)
);

create table if not exists public.orcamentos_publicos (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  orcamento_id text not null,
  numero text,
  cliente_nome text,
  valor_total numeric not null default 0,
  prestador_nome text,
  prestador_whatsapp text,
  dados jsonb not null,
  status text not null default 'enviado',
  resposta_cliente text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create index if not exists clientes_user_id_idx on public.clientes(user_id);
create index if not exists servicos_user_id_idx on public.servicos(user_id);
create index if not exists produtos_user_id_idx on public.produtos(user_id);
create index if not exists orcamentos_user_id_idx on public.orcamentos(user_id);
create index if not exists orcamentos_user_criado_idx on public.orcamentos(user_id, criado_em desc);
create index if not exists orcamentos_user_status_idx on public.orcamentos(user_id, status);
create index if not exists recibos_user_id_idx on public.recibos(user_id);
create index if not exists modelos_user_id_idx on public.modelos(user_id);
create index if not exists depoimentos_user_id_idx on public.depoimentos(user_id);
create index if not exists agendamentos_user_id_idx on public.agendamentos(user_id);
create index if not exists agendamentos_inicio_idx on public.agendamentos(user_id, inicio);
create index if not exists exclusoes_user_id_idx on public.exclusoes(user_id);
create index if not exists orcamentos_publicos_user_id_idx on public.orcamentos_publicos(user_id);
create index if not exists orcamentos_publicos_orcamento_idx on public.orcamentos_publicos(user_id, orcamento_id);

alter table public.backups enable row level security;
alter table public.empresa enable row level security;
alter table public.clientes enable row level security;
alter table public.servicos enable row level security;
alter table public.produtos enable row level security;
alter table public.orcamentos enable row level security;
alter table public.recibos enable row level security;
alter table public.modelos enable row level security;
alter table public.depoimentos enable row level security;
alter table public.agendamentos enable row level security;
alter table public.contadores enable row level security;
alter table public.exclusoes enable row level security;
alter table public.orcamentos_publicos enable row level security;

grant select, insert, update, delete on
  public.backups,
  public.empresa,
  public.clientes,
  public.servicos,
  public.produtos,
  public.orcamentos,
  public.recibos,
  public.modelos,
  public.depoimentos,
  public.agendamentos,
  public.contadores,
  public.exclusoes,
  public.orcamentos_publicos
to authenticated;

