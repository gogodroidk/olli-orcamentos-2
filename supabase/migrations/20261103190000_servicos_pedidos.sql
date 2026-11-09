-- ============================================================================
-- OLLI — Segundo andar: PEDIDOS DE DIAGNÓSTICO da página /servicos/
-- ----------------------------------------------------------------------------
-- Fila que o comercial lê (pesquisa pública do negócio -> diagnóstico ->
-- proposta por regra). Escrita só pelo worker (service_role); ninguém mais lê.
-- LGPD: mínimo necessário + versão do aviso aceito + data.
-- Retenção: servicos_pedidos_retencao_limpar apaga pedido SEM proposta com
-- mais de 180 dias. O worker só chama com SERVICOS_RETENCAO_MODE=production.
-- NÃO APLICAR em produção neste PR: o arquivo existe para o portão do Igor.
-- Idempotente.
-- ============================================================================
begin;

create table if not exists public.servicos_pedidos (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default pg_catalog.now(),
  negocio text not null constraint servicos_pedidos_negocio_ck check (length(negocio) between 1 and 120),
  cidade text not null constraint servicos_pedidos_cidade_ck check (length(cidade) between 1 and 80),
  dor text not null constraint servicos_pedidos_dor_ck check (length(dor) between 1 and 600),
  whatsapp text not null constraint servicos_pedidos_whatsapp_ck check (whatsapp ~ '^55[0-9]{10,11}$'),
  aviso_versao text not null,
  status text not null default 'novo'
    constraint servicos_pedidos_status_ck check (
      status in ('novo', 'em_pesquisa', 'proposta_enviada', 'pausado', 'descartado')
    )
);

create index if not exists servicos_pedidos_status_idx on public.servicos_pedidos (status, criado_em);

alter table public.servicos_pedidos enable row level security;
alter table public.servicos_pedidos force row level security;
revoke all on public.servicos_pedidos from public, anon, authenticated;
grant select, insert, update on public.servicos_pedidos to service_role;
grant usage, select on sequence public.servicos_pedidos_id_seq to service_role;

comment on table public.servicos_pedidos is
  'Pedidos de diagnóstico grátis do /servicos/. Só service_role. Preço nunca mora aqui.';

create or replace function public.servicos_pedidos_retencao_limpar(p_agora timestamptz default pg_catalog.now())
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_apagados integer;
begin
  delete from public.servicos_pedidos
   where status in ('novo', 'em_pesquisa', 'pausado', 'descartado')
     and criado_em < p_agora - interval '180 days';
  get diagnostics v_apagados = row_count;
  return pg_catalog.jsonb_build_object('ok', true, 'apagados', v_apagados);
end;
$$;

revoke all on function public.servicos_pedidos_retencao_limpar(timestamptz) from public, anon, authenticated;
grant execute on function public.servicos_pedidos_retencao_limpar(timestamptz) to service_role;

commit;
