-- Fase 2 — Agenda do prestador (visitas, instalações, manutenções…).
-- O app é offline-first (SQLite local); esta tabela espelha a agenda na nuvem
-- para o backup/restore do Supabase. Projeto "OLLI ORCAMENTOS".
-- NÃO aplicada automaticamente.

create table if not exists public.agendamentos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id text,
  cliente_nome text not null,
  titulo text not null,
  tipo text not null,                          -- orcamento | limpeza | instalacao | manutencao | visita | outro
  inicio timestamptz not null,
  fim timestamptz,
  endereco text,
  status text not null default 'agendado',     -- agendado | concluido | cancelado
  orcamento_id text,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.agendamentos enable row level security;

-- O prestador (dono) cria/gerencia somente os seus agendamentos.
create policy "agendamentos_owner" on public.agendamentos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists agendamentos_user_id_idx on public.agendamentos(user_id);
create index if not exists agendamentos_inicio_idx on public.agendamentos(user_id, inicio);
