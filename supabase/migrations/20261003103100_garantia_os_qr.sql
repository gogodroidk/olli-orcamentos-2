-- ============================================================================
-- OLLI — GARANTIA QUE SE CUIDA SOZINHA (Onda I3, jogada 12)
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   1) `ordens_servico.garantia text` — o prazo de garantia DESTA OS como o
--      prestador escreveu ("90 dias", "6 meses"). Nasce do orçamento de origem
--      (campo `garantia`) e é editável na OS. Nulo = a OS não declara garantia.
--   2) `ordens_servico.garantia_ate date` — o último dia da garantia, calculado
--      pelo APP a partir do texto + data de conclusão (regra única em
--      src/utils/garantiaServico.ts). Nulo = sem prazo legível ou OS não
--      concluída: a etiqueta pública NUNCA afirma garantia que não foi escrita.
--   3) `ordens_servico.garantia_de_os_id text` — esta OS é um RETORNO DE
--      GARANTIA daquela (soft ref, como `asset_id`). Nasce do chamado de garantia
--      feito pela etiqueta QR.
--   4) `pedidos_orcamento_qr.motivo` — 'orcamento' (o de sempre) ou 'garantia'
--      ("Voltou o problema? Chamar a garantia" na página /q/<token>). O worker só
--      aceita 'garantia' quando o equipamento tem garantia vigente.
--   5) `garantia_vigente_equipamento(asset_id)` — o último dia de garantia
--      vigente do equipamento (OS concluída ligada direto ou por PMOC, do MESMO
--      dono). SECURITY DEFINER e SÓ service_role: devolve apenas uma DATA.
--
-- LGPD: a página pública passa a mostrar "Em garantia até dd/mm/aaaa" — uma data,
--   nenhum dado do cliente, do técnico ou de valor.
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do worker/APK novos. Sem ela:
--   - o app segue funcionando: o push detecta as colunas inexistentes, reenvia a
--     OS sem elas e o pull preserva a garantia local (cloudSync,
--     osSemColunasGarantia);
--   - o worker não mostra garantia na etiqueta (RPC 404 = "indisponível", nunca
--     "sem garantia") e o pedido grava sem `motivo`, com "Chamado de garantia:" no
--     começo da mensagem para nada se perder.
--
-- IDEMPOTENTE: add column if not exists; constraint recriada por nome; função
--   create or replace. SEGREDOS: zero.
-- ============================================================================

begin;

alter table public.ordens_servico
  add column if not exists garantia          text,
  add column if not exists garantia_ate      date,
  add column if not exists garantia_de_os_id text;

alter table public.ordens_servico drop constraint if exists ordens_servico_garantia_ck;
alter table public.ordens_servico add constraint ordens_servico_garantia_ck
  check (garantia is null or char_length(garantia) <= 200);

comment on column public.ordens_servico.garantia is
  'Prazo de garantia da OS como escrito pelo prestador ("90 dias"). Nulo = sem garantia declarada.';
comment on column public.ordens_servico.garantia_ate is
  'Último dia da garantia (app: texto + conclusão). Nulo = sem prazo legível ou OS não concluída.';
comment on column public.ordens_servico.garantia_de_os_id is
  'Esta OS é retorno de garantia daquela (ordens_servico.id, soft ref).';

create index if not exists ordens_servico_garantia_de_idx
  on public.ordens_servico (garantia_de_os_id) where garantia_de_os_id is not null;

alter table public.pedidos_orcamento_qr
  add column if not exists motivo text not null default 'orcamento';

alter table public.pedidos_orcamento_qr drop constraint if exists pedidos_orcamento_qr_motivo_ck;
alter table public.pedidos_orcamento_qr add constraint pedidos_orcamento_qr_motivo_ck
  check (motivo in ('orcamento', 'garantia'));

comment on column public.pedidos_orcamento_qr.motivo is
  '''orcamento'' = pedido de orçamento; ''garantia'' = chamado de garantia pela etiqueta (só com garantia vigente).';

-- ────────────────────────────────────────────────────────────────────────────
-- Garantia vigente do equipamento (página pública)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.garantia_vigente_equipamento(p_asset_id text)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  with ativo as (
    select a.id, a.user_id
      from public.assets a
     where a.id = p_asset_id
  ),
  geradas as (
    select g.ordem_id
      from public.pmoc_ordens_geradas g
      join ativo on ativo.id = g.asset_id and ativo.user_id = g.user_id
     where g.excluido_em is null
  )
  select max(os.garantia_ate)
    from public.ordens_servico os
    join ativo on ativo.user_id = os.user_id
   where os.excluido_em is null
     and os.status = 'concluida'
     and (os.asset_id = ativo.id or os.id in (select ordem_id from geradas))
     and os.garantia_ate is not null
     and os.garantia_ate >= (now() at time zone 'America/Sao_Paulo')::date;
$$;

revoke all on function public.garantia_vigente_equipamento(text) from public, anon, authenticated;
grant execute on function public.garantia_vigente_equipamento(text) to service_role;

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name from information_schema.columns
--    where table_name = 'ordens_servico' and column_name like 'garantia%'; -- 3
--   select public.garantia_vigente_equipamento('<asset-id>');            -- data ou null
--
-- Execução em PGlite: scripts/teste-vespera-garantia-sql.ts (a cada `npm test`).
-- ============================================================================
