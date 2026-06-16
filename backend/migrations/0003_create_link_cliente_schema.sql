-- Etapa 3 — Link do cliente (Cloudflare Worker + Supabase).
-- O app publica um snapshot do orçamento aqui; o Worker (service_role) lê por
-- token e grava a resposta do cliente (aprovar/recusar). Projeto "OLLI ORCAMENTOS".
-- NÃO aplicada automaticamente.

create table if not exists public.orcamentos_publicos (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  orcamento_id text not null,
  numero text,
  cliente_nome text,
  valor_total numeric not null default 0,
  prestador_nome text,
  prestador_whatsapp text,
  dados jsonb not null,                       -- snapshot público (itens, totais, validade…)
  status text not null default 'enviado',     -- enviado | aprovado | recusado | duvida
  resposta_cliente text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

alter table public.orcamentos_publicos enable row level security;

-- O prestador (dono) cria/gerencia os seus links.
create policy "orcamentos_publicos_owner" on public.orcamentos_publicos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Leitura pública por token e a gravação da resposta do cliente são feitas pelo
-- Cloudflare Worker usando a chave service_role (que ignora a RLS). Por isso NÃO
-- há policy para 'anon' aqui — a página pública nunca recebe a anon key.

create index if not exists orcamentos_publicos_user_id_idx on public.orcamentos_publicos(user_id);
create index if not exists orcamentos_publicos_orcamento_idx on public.orcamentos_publicos(user_id, orcamento_id);
