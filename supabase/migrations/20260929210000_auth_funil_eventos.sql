-- Funil mínimo do login social (Google/Apple), SEM PII.
--
-- Por quê: entre 16 e 25/09/2026, 13 de 18 cadastros pelo Google criaram o usuário
-- e nunca ganharam sessão (o `?code=` caía na landing por redirect fora da
-- allowlist). Ninguém percebeu por 10 dias porque não havia medida nenhuma entre
-- "clicou em Google" e "entrou". Esta tabela fecha esse buraco.
--
-- O que NÃO guarda: user_id, e-mail, IP, user agent, URL, code, token, texto de
-- erro cru. Só: evento, plataforma, provedor, um motivo de lista fechada e um id
-- ALEATÓRIO da tentativa (gerado no cliente; liga iniciado → resultado, não liga
-- a pessoa nenhuma).
--
-- Quem escreve: o cliente, ANTES do login existir (oauth_iniciado/oauth_erro são
-- anônimos por natureza) → INSERT liberado para anon e authenticated, SEM SELECT,
-- UPDATE ou DELETE. Leitura só pelo service_role (painel admin / SQL).
--
-- Leitura do funil (service_role):
--   select date_trunc('day', criado_em) dia, plataforma, evento, motivo, count(*)
--     from public.auth_funil_eventos
--    where criado_em > now() - interval '14 days'
--    group by 1, 2, 3, 4 order by 1, 2, 3;
--
-- Os clientes são tolerantes à ausência desta tabela (desligam o registro no
-- primeiro erro "tabela não existe"), então aplicar depois do deploy é seguro.

create table if not exists public.auth_funil_eventos (
  id          bigint generated always as identity primary key,
  evento      text not null check (evento in ('oauth_iniciado', 'oauth_sessao_criada', 'oauth_erro')),
  plataforma  text not null default 'unknown' check (plataforma in ('web', 'android', 'ios', 'unknown')),
  provedor    text not null default 'google' check (provedor in ('google', 'apple')),
  motivo      text check (motivo is null or motivo in (
    'cancelado', 'provedor', 'codigo_expirado', 'navegador_trocado',
    'sem_codigo', 'sem_sessao', 'rede', 'desconhecido'
  )),
  tentativa   uuid not null,
  criado_em   timestamptz not null default now(),
  -- Só erro tem motivo; sucesso e início nunca carregam motivo.
  constraint auth_funil_eventos_motivo_so_em_erro
    check ((evento = 'oauth_erro') = (motivo is not null))
);

create index if not exists auth_funil_eventos_criado_idx
  on public.auth_funil_eventos (criado_em desc);

alter table public.auth_funil_eventos enable row level security;
alter table public.auth_funil_eventos force row level security;

revoke all on table public.auth_funil_eventos from public, anon, authenticated;
-- Colunas explícitas: o cliente não escolhe id nem criado_em.
grant insert (evento, plataforma, provedor, motivo, tentativa)
  on table public.auth_funil_eventos to anon, authenticated;

drop policy if exists auth_funil_eventos_insert on public.auth_funil_eventos;
create policy auth_funil_eventos_insert
  on public.auth_funil_eventos
  for insert
  to anon, authenticated
  with check (tentativa is not null);

comment on table public.auth_funil_eventos is
  'Funil do login social sem PII (oauth_iniciado/oauth_sessao_criada/oauth_erro). INSERT anon, leitura só service_role. Ver src/services/oauthRetorno.ts.';
