-- CQ-CONTAS-TESTE-FORA (D-0914, Igor 27/10/2026): contas internas/de teste fora dos números que ainda as contavam.
-- A pergunta é uma só: public.conta_interna(user_id) (20261007140000). Esta migration só ACRESCENTA a cláusula em
-- quatro leituras de relatório (service_role) que ficaram para trás. Nada muda para o app, nenhum dado é apagado,
-- nenhuma coluna muda de nome ou tipo (create or replace com a MESMA assinatura).
--
--   1. funil_uso_resumo  — "quantas pessoas chegaram a cada passo" (cadastrou, criou, enviou, pagou)
--   2. funil_uso_tempos  — medianas até o 1º orçamento / 1º envio / pagamento
--   3. telas_resumo      — visitas e pessoas por tela
--   4. cupom_atribuicao  — usos reservados e PAGOS por código de influenciador (base de comissão!)
--
-- NÃO mexe em `funil_uso` (a visão por pessoa): o painel a lê crua e separa as internas no worker para poder dizer
-- "N contas internas fora". As visões agregadas abaixo passam a ler só as contas de clientes.
-- Reverter: recriar as visões/função sem a cláusula (20261023160000_rastreio_funil.sql, 20261022110000_user_tela_log.sql,
-- 20261119090000_cupom_influenciador.sql).
begin;

create or replace view public.funil_uso_resumo
with (security_invoker = true) as
select count(*)                                  as pessoas_com_evento,
       count(sessao_1)                           as abriu_app,
       count(signup)                             as cadastrou,
       count(onboarding)                         as terminou_apresentacao,
       count(exemplo)                            as abriu_exemplo,
       count(orcamento_criado)                   as criou_orcamento,
       count(orcamento_enviado)                  as enviou_orcamento,
       count(gate)                               as viu_gate,
       count(planos)                             as abriu_planos,
       count(pix_gerado)                         as gerou_pix,
       count(pix_pago)                           as pagou
  from public.funil_uso
 where not public.conta_interna(user_id);
revoke all on public.funil_uso_resumo from public, anon, authenticated;

create or replace view public.funil_uso_tempos
with (security_invoker = true) as
select round((percentile_cont(0.5) within group (order by extract(epoch from (orcamento_criado - coalesce(signup, sessao_1))) / 60.0))::numeric, 1) as min_ate_1o_orcamento,
       round((percentile_cont(0.5) within group (order by extract(epoch from (orcamento_enviado - coalesce(signup, sessao_1))) / 60.0))::numeric, 1) as min_ate_1o_envio,
       round((percentile_cont(0.5) within group (order by extract(epoch from (pix_pago - pix_gerado)) / 60.0))::numeric, 1) as min_do_pix_ao_pagamento
  from public.funil_uso
 where not public.conta_interna(user_id);
revoke all on public.funil_uso_tempos from public, anon, authenticated;

create or replace view public.telas_resumo
with (security_invoker = true) as
select tela,
       count(*) as visitas,
       count(distinct user_id) as pessoas,
       round(avg(duracao_ms) / 1000.0, 1) as media_seg,
       round(((percentile_cont(0.5) within group (order by duracao_ms)) / 1000.0)::numeric, 1) as mediana_seg
  from public.user_tela_log
 where acao is null
   and not public.conta_interna(user_id)
 group by tela;
revoke all on public.telas_resumo from public, anon, authenticated;

create or replace function public.cupom_atribuicao()
returns table (codigo text, usos_max integer, valido_ate timestamptz, ativo boolean, reservados bigint, pagos bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select c.codigo, c.usos_max, c.valido_ate, c.ativo,
         count(u.user_id) filter (where u.estado = 'reservado'),
         count(u.user_id) filter (where u.estado = 'pago')
    from public.cupons_influenciador c
    left join public.cupom_usos u on u.codigo = c.codigo and not public.conta_interna(u.user_id)
   group by c.codigo order by c.criado_em desc
$$;
revoke all on function public.cupom_atribuicao() from public, anon, authenticated;
grant execute on function public.cupom_atribuicao() to service_role;

commit;
