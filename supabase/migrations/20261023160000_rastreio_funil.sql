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

-- ─── Parecer do Dr. Paulo sobre o PR #214 (24/10/2026): 4 condições + P2 da LIVRE ───────────────────────────
-- (2) Opt-out NA CONTA (não só no aparelho): vale em qualquer dispositivo e a partir do 1º evento — o RPC
--     descarta tudo de quem desligou, e o app só envia depois de LER esta preferência no servidor.
create table if not exists public.rastreio_uso_optout (
  user_id uuid primary key references auth.users (id) on delete cascade, -- (4) excluir a conta apaga também isto
  desligado_em timestamptz not null default now()
);
alter table public.rastreio_uso_optout enable row level security;
alter table public.rastreio_uso_optout force row level security;
revoke all on public.rastreio_uso_optout from public, anon, authenticated;

create or replace function public.rastreio_uso_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null
              else not exists (select 1 from public.rastreio_uso_optout o where o.user_id = (select auth.uid())) end
$$;
revoke all on function public.rastreio_uso_ativo() from public, anon;
grant execute on function public.rastreio_uso_ativo() to authenticated;

create or replace function public.rastreio_uso_definir(p_ativo boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  if p_ativo is null then raise exception 'valor_invalido'; end if;
  if p_ativo then
    delete from public.rastreio_uso_optout where user_id = (select auth.uid());
  else
    insert into public.rastreio_uso_optout (user_id) values ((select auth.uid())) on conflict do nothing;
    -- Desligar também apaga o que já foi coletado dessa pessoa (minimização; vale "a partir desse momento" e daqui para trás).
    delete from public.user_tela_log where user_id = (select auth.uid());
  end if;
  return p_ativo;
end;
$$;
revoke all on function public.rastreio_uso_definir(boolean) from public, anon;
grant execute on function public.rastreio_uso_definir(boolean) to authenticated;

-- (3) SEM texto livre: `acao` só pode ser um dos 10 eventos do funil (lista fechada, no banco e não só no app).
alter table public.user_tela_log drop constraint if exists user_tela_log_acao_check;
alter table public.user_tela_log add constraint user_tela_log_acao_funil check (acao is null or acao in (
  'sessao_iniciada', 'signup', 'onboarding_completed', 'ativacao_exemplo_aberto', 'quote_created',
  'quote_sent', 'gate_visto', 'planos_aberto', 'pix_gerado', 'pix_pago'));

-- RPC final: respeita o opt-out da conta, só aceita ação da lista fechada e `tela` no formato de nome de rota.
create or replace function public.registrar_telas_usuario(p_itens jsonb, p_plataforma text default 'unknown')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plat text := lower(trim(coalesce(p_plataforma, 'unknown')));
  it jsonb;
  acoes constant text[] := array['sessao_iniciada', 'signup', 'onboarding_completed', 'ativacao_exemplo_aberto',
    'quote_created', 'quote_sent', 'gate_visto', 'planos_aberto', 'pix_gerado', 'pix_pago'];
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 20 then raise exception 'lote_invalido'; end if;
  if exists (select 1 from public.rastreio_uso_optout o where o.user_id = (select auth.uid())) then return; end if; -- opt-out da conta
  if plat not in ('web', 'ios', 'android', 'desktop', 'unknown') then plat := 'unknown'; end if;
  if (select count(*) from public.user_tela_log
       where user_id = (select auth.uid()) and criado_em > now() - interval '24 hours') >= 1000 then
    return;
  end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    if coalesce(it ->> 'tela', '') !~ '^[A-Za-z0-9_]{1,40}$' then continue; end if;
    -- ação fora da lista fechada: o item inteiro é descartado (nunca vira texto livre no banco).
    if it ->> 'acao' is not null and not ((it ->> 'acao') = any (acoes)) then continue; end if;
    insert into public.user_tela_log (user_id, tela, acao, duracao_ms, plataforma)
    values ((select auth.uid()), it ->> 'tela', it ->> 'acao',
            least(greatest(coalesce((it ->> 'duracao_ms')::int, 0), 0), 14400000), plat);
  end loop;
end;
$$;
revoke all on function public.registrar_telas_usuario(jsonb, text) from public, anon;
grant execute on function public.registrar_telas_usuario(jsonb, text) to authenticated;
