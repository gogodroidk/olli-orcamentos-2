-- Etapas 0 e 1 do PROCESSO: fundação (cache de IA, eventos) + o anzol (códigos de erro).
-- O app já funciona 100% offline com SQLite local; estas tabelas espelham o schema
-- na nuvem para quando o sync/diagnóstico-IA/painel master forem ligados.
-- Projeto "OLLI ORCAMENTOS" (yiaeplqinnnnniyvwtls). NÃO aplicada automaticamente.

-- ── CACHE DE IA (Etapa 0.3) ──────────────────────────────────────
-- Cache COMPARTILHADO por (código+marca): a mesma resposta serve todos os
-- técnicos e corta ~80% das chamadas de IA. Leitura para qualquer autenticado;
-- escrita só via service_role (edge function de diagnóstico), que ignora RLS.
create table if not exists public.cache_ia (
  chave text primary key,
  resposta text not null,
  criado_em timestamptz not null default now()
);
alter table public.cache_ia enable row level security;
create policy "cache_ia_read" on public.cache_ia
  for select to authenticated using (true);

-- ── EVENTOS (Etapa 0.4 — instrumentação do funil) ────────────────
create table if not exists public.eventos (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  evento text not null,
  props jsonb,
  criado_em timestamptz not null default now()
);
alter table public.eventos enable row level security;
create policy "eventos_owner" on public.eventos
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists eventos_user_id_idx on public.eventos(user_id);
create index if not exists eventos_evento_idx on public.eventos(evento);
create index if not exists eventos_criado_idx on public.eventos(criado_em desc);

-- ── CÓDIGOS DE ERRO (Etapa 1.1 — base de 602, dados de referência) ─
-- Globais (iguais para todos). Leitura para qualquer autenticado; o app
-- importa o asset local na 1ª abertura, então aqui é fonte de verdade/atualização.
create table if not exists public.codigos_erro (
  id bigint generated always as identity primary key,
  marca text not null,
  familia text,
  tipo text,
  codigo text,
  exibicao text,
  falha text,
  cat_bruta text,
  cat_app text,
  severidade text,
  causa text,
  acao text,
  confianca text,
  fonte_id text,
  url text,
  obs text
);
alter table public.codigos_erro enable row level security;
create policy "codigos_erro_read" on public.codigos_erro
  for select to authenticated using (true);
create index if not exists codigos_erro_marca_idx on public.codigos_erro(marca);
create index if not exists codigos_erro_codigo_idx on public.codigos_erro(codigo);

-- ── CASOS "NÃO ACHEI MEU ERRO" (Etapa 1.6 — enriquecimento) ───────
create table if not exists public.casos_erro (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  marca text,
  modelo text,
  codigo text,
  sintoma text,
  criado_em timestamptz not null default now()
);
alter table public.casos_erro enable row level security;
create policy "casos_erro_owner" on public.casos_erro
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists casos_erro_user_id_idx on public.casos_erro(user_id);
