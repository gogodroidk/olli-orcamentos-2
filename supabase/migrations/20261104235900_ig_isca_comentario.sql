-- Z-117 rascunho. Isca "comente MODELO" do Instagram.
-- Este arquivo NÃO foi aplicado. A rota do worker não está ligada.
-- Não guarda username, texto do comentário, telefone nem token.
-- O id da pessoa entra só como hash SHA-256 (sal fora do banco).

create table if not exists public.ig_isca_optout (
  autor_hash text primary key check (autor_hash ~ '^[0-9a-f]{64}$'),
  criado_em  timestamptz not null default now()
);

create table if not exists public.ig_isca_evento (
  id               bigint generated always as identity primary key,
  comentario_hash  text not null unique check (comentario_hash ~ '^[0-9a-f]{64}$'),
  autor_hash       text not null check (autor_hash ~ '^[0-9a-f]{64}$'),
  media_id         text not null check (media_id ~ '^[0-9]{5,40}$'),
  palavra          text not null check (palavra = 'MODELO'),
  acao             text not null check (acao in ('resposta_privada', 'optout', 'pergunta_oficio', 'confirmacao_sair', 'oficio')),
  oficio           text check (oficio is null or oficio ~ '^[a-z_]{2,40}$'),
  criado_em        timestamptz not null default now()
);

create index if not exists ig_isca_evento_hora_idx
  on public.ig_isca_evento (criado_em desc)
  where acao in ('resposta_privada', 'pergunta_oficio', 'confirmacao_sair');

alter table public.ig_isca_optout enable row level security;
alter table public.ig_isca_evento enable row level security;
revoke all on public.ig_isca_optout, public.ig_isca_evento from anon, authenticated;
