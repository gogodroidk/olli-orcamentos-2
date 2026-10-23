-- Rastreio de uso, parte 2 (E3, 23/10/2026): funil de ativação até o 1º pagamento, em cima de user_tela_log.
-- Os 10 eventos do funil entram como `acao` (nome fixo) pelo mesmo RPC registrar_telas_usuario; não há PII.
-- Retenção de 90 dias: DELETE diário no worker (worker/src/rastreioRetencao.js, 06:17 UTC).
-- Leitura só service_role (painel admin): o usuário não lê o próprio log.

-- Passo a passo por pessoa: quando cada marco ACONTECEU pela 1ª vez (nulo = ainda não).
create or replace view public.funil_uso
with (security_invoker = true) as
select user_id,
       min(criado_em) filter (where acao = 'sessao_iniciada')        as sessao_1,
       min(criado_em) filter (where acao = 'signup')                 as signup,
       min(criado_em) filter (where acao = 'onboarding_completed')   as onboarding,
       min(criado_em) filter (where acao = 'ativacao_exemplo_aberto') as exemplo,
       min(criado_em) filter (where acao = 'quote_created')          as orcamento_criado,
       min(criado_em) filter (where acao = 'quote_sent')             as orcamento_enviado,
       min(criado_em) filter (where acao = 'gate_visto')             as gate,
       min(criado_em) filter (where acao = 'planos_aberto')          as planos,
       min(criado_em) filter (where acao = 'pix_gerado')             as pix_gerado,
       min(criado_em) filter (where acao = 'pix_pago')               as pix_pago
  from public.user_tela_log
 where acao is not null
 group by user_id;
revoke all on public.funil_uso from public, anon, authenticated;

-- Quantas pessoas chegaram a cada passo (para ver ONDE o funil trava).
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
  from public.funil_uso;
revoke all on public.funil_uso_resumo from public, anon, authenticated;

-- Tempo entre marcos (mediana, em minutos): quanto demora do cadastro ao 1º orçamento e ao 1º envio.
create or replace view public.funil_uso_tempos
with (security_invoker = true) as
select round((percentile_cont(0.5) within group (order by extract(epoch from (orcamento_criado - coalesce(signup, sessao_1))) / 60.0))::numeric, 1) as min_ate_1o_orcamento,
       round((percentile_cont(0.5) within group (order by extract(epoch from (orcamento_enviado - coalesce(signup, sessao_1))) / 60.0))::numeric, 1) as min_ate_1o_envio,
       round((percentile_cont(0.5) within group (order by extract(epoch from (pix_pago - pix_gerado)) / 60.0))::numeric, 1) as min_do_pix_ao_pagamento
  from public.funil_uso;
revoke all on public.funil_uso_tempos from public, anon, authenticated;
