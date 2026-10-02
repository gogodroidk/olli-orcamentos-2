-- ============================================================================
-- OLLI — QR DO EQUIPAMENTO: check-in do técnico + etiqueta que vende
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   1) `ordens_servico.asset_id text` — o equipamento atendido. Nasce no check-in
--      pelo QR ("Iniciar atendimento" na ficha do equipamento). Soft ref a
--      `assets.id`, sem FK dura (mesmo padrão de pmoc_ordens_geradas.asset_id:
--      o sync do app grava a OS antes ou depois do equipamento, em qualquer ordem).
--      Nulo = OS sem equipamento ligado, a verdade de toda OS anterior.
--
--   2) `pedidos_orcamento_qr` — o pedido de orçamento que o cliente final faz na
--      página pública da etiqueta (/q/<token>). Quem grava é SÓ o worker
--      (service_role); o app do prestador LÊ e marca como atendido. O primeiro
--      contato continua humano: o registro só avisa o prestador e guarda o
--      telefone que a própria pessoa digitou para ser chamada.
--
--   3) `resumo_manutencao_equipamento(asset_id)` — "última manutenção" e "próxima
--      recomendada" da página pública, numa consulta só. SECURITY DEFINER e
--      executável SOMENTE por service_role: devolve apenas DATAS (nada de cliente,
--      valor, técnico ou endereço) e só para o equipamento pedido.
--
-- LGPD
--   - A página pública não mostra dado pessoal nenhum; o pedido guarda só o que a
--     pessoa digitou (nome, WhatsApp, mensagem) com o aviso de uso na própria tela.
--   - anon não lê nem grava nada aqui. authenticated lê só os pedidos do conjunto
--     visível (dono + equipe ativa, `donos_visiveis`) e só pode alterar
--     `atendido_em` (grant por coluna).
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do worker/APK novos. Sem ela:
--   - o app segue funcionando: o push detecta a coluna `asset_id` inexistente,
--     reenvia a OS sem ela e o pull preserva o vínculo local (cloudSync,
--     osSemColunaAsset);
--   - o worker mostra a etiqueta sem as datas (RPC 404 = "indisponível", nunca
--     "sem manutenção") e o formulário de pedido responde "indisponível agora".
--
-- IDEMPOTENTE: add column / create table / index if not exists; policies
--   recriadas por nome; função create or replace. SEGREDOS: zero.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) OS ligada ao equipamento
-- ────────────────────────────────────────────────────────────────────────────
alter table public.ordens_servico
  add column if not exists asset_id text;

comment on column public.ordens_servico.asset_id is
  'Equipamento atendido (assets.id, soft ref). Nasce no check-in pelo QR. Nulo = OS sem equipamento ligado.';

create index if not exists ordens_servico_asset_idx
  on public.ordens_servico (asset_id) where asset_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Pedidos de orçamento vindos da etiqueta QR
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.pedidos_orcamento_qr (
  id          uuid primary key default gen_random_uuid(),
  -- Dono do EQUIPAMENTO (assets.user_id), resolvido pelo worker a partir do token.
  user_id     uuid not null references auth.users (id) on delete cascade,
  asset_id    text not null,
  nome        text not null check (char_length(btrim(nome)) between 2 and 80),
  -- Só dígitos com DDI 55: o worker normaliza pela mesma regra do wa.me
  -- (telefoneWhatsapp.js). 12 dígitos = fixo/celular antigo, 13 = celular com 9.
  telefone    text not null check (telefone ~ '^55[1-9][0-9][0-9]{8,9}$'),
  mensagem    text check (mensagem is null or char_length(mensagem) <= 500),
  origem      text not null default 'etiqueta_qr' check (origem in ('etiqueta_qr')),
  atendido_em timestamptz,
  criado_em   timestamptz not null default now()
);

create index if not exists pedidos_orcamento_qr_user_idx
  on public.pedidos_orcamento_qr (user_id, criado_em desc);
-- Apoio ao teto anti-spam por equipamento (worker conta a última hora).
create index if not exists pedidos_orcamento_qr_asset_idx
  on public.pedidos_orcamento_qr (asset_id, criado_em desc);

alter table public.pedidos_orcamento_qr enable row level security;

revoke all on table public.pedidos_orcamento_qr from anon, public;
revoke all on table public.pedidos_orcamento_qr from authenticated;
grant select on table public.pedidos_orcamento_qr to authenticated;
-- UPDATE só da coluna de atendimento: nada de reescrever nome/telefone/dono.
grant update (atendido_em) on table public.pedidos_orcamento_qr to authenticated;

do $$
declare
  tem_dv boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
  expr text;
begin
  expr := case when tem_dv
               then 'user_id in (select public.donos_visiveis())'
               else 'user_id = (select auth.uid())' end;

  execute 'drop policy if exists pedidos_orcamento_qr_select on public.pedidos_orcamento_qr';
  execute format(
    'create policy pedidos_orcamento_qr_select on public.pedidos_orcamento_qr as permissive for select to authenticated using (%s)',
    expr
  );
  execute 'drop policy if exists pedidos_orcamento_qr_update on public.pedidos_orcamento_qr';
  execute format(
    'create policy pedidos_orcamento_qr_update on public.pedidos_orcamento_qr as permissive for update to authenticated using (%s) with check (%s)',
    expr, expr
  );
  -- Sem INSERT/DELETE para authenticated: quem grava é o worker (service_role).
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Resumo de manutenção para a página pública
-- ────────────────────────────────────────────────────────────────────────────
-- Última = a OS concluída mais recente do equipamento (ligada direto pelo
-- asset_id OU gerada para ele por um plano PMOC). Próxima = a data mais cedo,
-- de hoje em diante (fuso de Brasília), entre: OS ainda aberta do equipamento com
-- data agendada e visita PMOC gerada cujo vencimento ainda não passou e cuja OS
-- não foi concluída/cancelada. Tudo restrito ao MESMO dono do equipamento.
create or replace function public.resumo_manutencao_equipamento(p_asset_id text)
returns table (ultima_manutencao timestamptz, proxima_manutencao date, proxima_origem text)
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
    select g.ordem_id, g.vencimento
      from public.pmoc_ordens_geradas g
      join ativo on ativo.id = g.asset_id and ativo.user_id = g.user_id
     where g.excluido_em is null
  ),
  os_do_ativo as (
    select os.id, os.status, os.concluido_em, os.atualizado_em, os.data_agendada
      from public.ordens_servico os
      join ativo on ativo.user_id = os.user_id
     where os.excluido_em is null
       and (os.asset_id = ativo.id or os.id in (select ordem_id from geradas))
  ),
  hoje as (
    select (now() at time zone 'America/Sao_Paulo')::date as dia
  ),
  candidatas as (
    select (o.data_agendada at time zone 'America/Sao_Paulo')::date as dia, 'agendada'::text as origem
      from os_do_ativo o
     where o.status in ('aberta', 'agendada', 'pausada', 'em_execucao')
       and o.data_agendada is not null
    union all
    select g.vencimento, 'pmoc'::text
      from geradas g
      left join os_do_ativo o on o.id = g.ordem_id
     where g.vencimento is not null
       and coalesce(o.status, 'aberta') not in ('concluida', 'cancelada')
  ),
  futuras as (
    select c.dia, c.origem from candidatas c, hoje where c.dia >= hoje.dia
  )
  select
    (select max(coalesce(o.concluido_em, o.atualizado_em)) from os_do_ativo o where o.status = 'concluida'),
    (select f.dia from futuras f order by f.dia asc, f.origem asc limit 1),
    (select f.origem from futuras f order by f.dia asc, f.origem asc limit 1);
$$;

revoke all on function public.resumo_manutencao_equipamento(text) from public, anon, authenticated;
grant execute on function public.resumo_manutencao_equipamento(text) to service_role;

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='ordens_servico' and column_name='asset_id'; -- 1
--   select relrowsecurity from pg_class where relname='pedidos_orcamento_qr';                -- t
--   select * from public.resumo_manutencao_equipamento('<asset-id>');                       -- 1 linha
--
-- A execução (idempotência, RLS por dono, grant só de atendido_em, CHECK do
-- telefone, resumo por equipamento sem vazar outro tenant) roda em Postgres
-- embutido (PGlite) em scripts/teste-qr-equipamento-sql.ts, a cada `npm test`.
-- ============================================================================
