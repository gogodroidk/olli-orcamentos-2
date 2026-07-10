-- Caixa de feedback + erros. O app (usuario logado) INSERE; so o painel /admin
-- (service_role, que ignora RLS) LE. Sem policy de SELECT => leitura negada aos
-- papeis publicos. Aplicada em producao em 2026-07-10 via Management API.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  tipo text not null default 'feedback' check (tipo in ('feedback','sugestao','bug','elogio','erro')),
  mensagem text not null,
  contexto jsonb not null default '{}'::jsonb,
  resolvido boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists feedback_criado_em_idx on public.feedback (criado_em desc);
create index if not exists feedback_tipo_idx on public.feedback (tipo);
create index if not exists feedback_resolvido_idx on public.feedback (resolvido) where resolvido = false;

alter table public.feedback enable row level security;

-- authenticated so pode INSERIR o proprio feedback. Nenhuma policy de SELECT/UPDATE
-- para papeis publicos: o painel /admin le e resolve via service_role.
-- OBS: o app usa `insert()` sem `.select()` (Prefer: return=minimal) — com
-- return=representation o PostgREST faria um SELECT pos-insert que a ausencia de
-- policy de leitura barraria (erro 42501). O caminho do app funciona.
drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant insert on public.feedback to authenticated;
