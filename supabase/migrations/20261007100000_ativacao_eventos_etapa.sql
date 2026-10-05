-- Etapas da 1ª sessão até o 1º orçamento, no log de atividade já existente.
--
-- Por quê (04/10/2026): 61 contas, 10 com orçamento, 48 de 51 sem orçamento
-- nunca voltaram depois da 1ª sessão (<36 min). O e-mail de ativação teve 0/37
-- de conversão. Não sabemos EM QUE TELA a 1ª sessão morre: o log só tinha
-- 'login'/'app_open', e 'quote_create'/'client_create' nunca eram disparados.
--
-- O que muda: a allowlist de `user_activity_log.evento` e de
-- `registrar_atividade_usuario` ganha as etapas abaixo. Continua sem PII: só
-- user_id (derivado de auth.uid() no servidor), evento de lista fechada,
-- plataforma e horário. Leitura só service_role.
--
--   ativacao_card_visto    cartão "Seu primeiro orçamento em 1 minuto" apareceu
--   ativacao_card_clicado  tocou no CTA do cartão
--   oficio_escolhido       escolheu o ofício no cartão
--   orcamento_novo_aberto  abriu a tela de orçamento novo
--   empresa_salva          salvou dados da empresa
--   orcamento_enviado      enviou/compartilhou o orçamento
--
-- Anti-ruído no servidor: o mesmo evento do mesmo usuário em menos de 10 s é
-- ignorado (o cliente também deduplica; isto protege contra re-render em loop).
--
-- Clientes antigos continuam funcionando (só mandam login/app_open). Clientes
-- novos chamando antes desta migration recebem 'evento_invalido' e ignoram
-- (telemetria é best-effort), então a ordem deploy/migration não importa.
--
-- Leitura (service_role) — onde a 1ª sessão morre:
--   select * from public.ativacao_funil_etapas;

alter table public.user_activity_log
  drop constraint if exists user_activity_log_evento_check;

alter table public.user_activity_log
  add constraint user_activity_log_evento_check check (evento in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create',
    'ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado'
  ));

create or replace function public.registrar_atividade_usuario(
  p_evento text,
  p_plataforma text default 'unknown'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  evento_normalizado text := lower(trim(coalesce(p_evento, '')));
  plataforma_normalizada text := lower(trim(coalesce(p_plataforma, 'unknown')));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if evento_normalizado not in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create',
    'ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado'
  ) then
    raise exception 'evento_invalido';
  end if;

  if plataforma_normalizada not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plataforma_normalizada := 'unknown';
  end if;

  -- Sem RETURNING (o usuário não tem SELECT na tabela). A janela de 10 s é
  -- checada por uma função SECURITY DEFINER mínima, porque o usuário não lê o log.
  if private.atividade_recente(evento_normalizado) then
    return;
  end if;

  insert into public.user_activity_log (user_id, evento, plataforma)
  values ((select auth.uid()), evento_normalizado, plataforma_normalizada);
end;
$$;

revoke all on function public.registrar_atividade_usuario(text, text) from public, anon;
grant execute on function public.registrar_atividade_usuario(text, text) to authenticated;

create schema if not exists private;

-- Responde só "este usuário registrou este evento nos últimos 10 s?" para o
-- próprio auth.uid(). Não devolve linha nenhuma do log.
create or replace function private.atividade_recente(p_evento text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_activity_log l
     where l.user_id = (select auth.uid())
       and l.evento = p_evento
       and l.criado_em > now() - interval '10 seconds'
  );
$$;

revoke all on function private.atividade_recente(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.atividade_recente(text) to authenticated;

-- Funil por etapa: das contas reais (fora de funil_exclusoes), quantas
-- chegaram a cada etapa, por plataforma da 1ª vez que a etapa ocorreu.
--
-- Definição de "1ª sessão": para cada user_id, inicio = min(criado_em) entre
-- TODOS os eventos dele. Um evento conta em pessoas_1a_sessao só se a 1ª
-- ocorrência dele caiu dentro de 60 minutos desde o inicio (janela fixa e
-- documentada; a mediana da 1ª sessão medida foi < 36 min). Quem voltou dias
-- depois NÃO entra em pessoas_1a_sessao; entra só em pessoas_alguma_vez
-- (1ª ocorrência vitalícia, sem janela).
create or replace view public.ativacao_funil_etapas
with (security_invoker = true) as
with ev as (
  select l.user_id, l.evento, l.plataforma, l.criado_em,
         min(l.criado_em) over (partition by l.user_id) as inicio
    from public.user_activity_log l
   where not exists (select 1 from public.funil_exclusoes f where f.user_id = l.user_id)
),
primeira as (
  select e.user_id, e.evento, min(e.criado_em) as em, min(e.inicio) as inicio,
         (array_agg(e.plataforma order by e.criado_em))[1] as plataforma
    from ev e
   group by e.user_id, e.evento
)
select p.evento,
       p.plataforma,
       count(*) filter (where p.em <= p.inicio + interval '60 minutes') as pessoas_1a_sessao,
       count(*) as pessoas_alguma_vez,
       max(p.em) as ultima_vez
  from primeira p
 group by p.evento, p.plataforma
 order by array_position(array[
   'login', 'app_open', 'ativacao_card_visto', 'oficio_escolhido', 'ativacao_card_clicado',
   'empresa_salva', 'client_create', 'orcamento_novo_aberto', 'quote_create', 'orcamento_enviado',
   'ia_use', 'document_create'
 ], p.evento), p.plataforma;

revoke all on public.ativacao_funil_etapas from public, anon, authenticated;
grant select on public.ativacao_funil_etapas to service_role;

comment on view public.ativacao_funil_etapas is
  'Onde a 1ª sessão morre: pessoas por etapa e plataforma; pessoas_1a_sessao = 1ª ocorrência em até 60 min do 1º evento da conta; pessoas_alguma_vez = sem janela. Só service_role.';
