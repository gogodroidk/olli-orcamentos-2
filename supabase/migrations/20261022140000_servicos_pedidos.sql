-- ============================================================================
-- OLLI — Segundo andar: PEDIDOS DE DIAGNÓSTICO da página /servicos/
-- ----------------------------------------------------------------------------
-- Fila que o agente de serviços lê (pesquisa pública do negócio -> diagnóstico ->
-- proposta por regra). Escrita só pelo worker (service_role); ninguém mais lê.
-- LGPD: mínimo necessário + versão do aviso aceito + data. Retenção: apagar
-- pedidos sem proposta com mais de 180 dias (job futuro; ver `status`).
-- Idempotente.
-- ============================================================================
begin;

create table if not exists public.servicos_pedidos (
  id            bigint generated always as identity primary key,
  criado_em     timestamptz not null default now(),
  negocio       text not null check (length(negocio) between 1 and 120),
  cidade        text not null check (length(cidade) between 1 and 80),
  dor           text not null check (length(dor) between 1 and 600),
  whatsapp      text not null check (whatsapp ~ '^55[0-9]{10,11}$'),
  aviso_versao  text not null,
  status        text not null default 'novo'
                check (status in ('novo', 'em_pesquisa', 'proposta_enviada', 'pausado', 'descartado'))
);

create index if not exists servicos_pedidos_status_idx on public.servicos_pedidos (status, criado_em);

alter table public.servicos_pedidos enable row level security;
alter table public.servicos_pedidos force row level security;
revoke all on public.servicos_pedidos from public, anon, authenticated;
grant select, insert, update on public.servicos_pedidos to service_role;
grant usage, select on sequence public.servicos_pedidos_id_seq to service_role;

comment on table public.servicos_pedidos is
  'Pedidos de diagnóstico grátis do /servicos/. Só service_role. Preço nunca mora aqui.';

commit;
