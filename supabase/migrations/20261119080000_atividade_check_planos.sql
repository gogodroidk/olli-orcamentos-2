-- OLLI — CONSERTO DA MEDIÇÃO DE PLANOS (TECH — CTO, 19/11/2026; achado do SALOMÃO, RP-1119-07-CTO).
--
-- Bug: a 20261030070000 pôs 'planos_visto' e 'plano_pagar_clicado' na allowlist da função
-- registrar_atividade_usuario, mas esqueceu a CHECK da tabela user_activity_log (de 20261007100000).
-- O insert estoura a CHECK, o RPC devolve erro, o cliente ignora (telemetria best-effort) e o evento
-- some. Produção em 19/11 07h: 0 linhas desses dois eventos desde 30/10.
--
-- O que muda:
--   1) a CHECK passa a aceitar os dois eventos de planos;
--   2) entra 'orcamento_salvar_barrado' (quem tenta salvar o 1º orçamento e é barrado pelo limite),
--      na CHECK e na função, para o cadeado já nascer medido sem outra migration.
-- O resto da função fica IGUAL ao de produção (pg_get_functiondef lido em 19/11 07h).
-- Sem dado pessoal: só user_id, evento de lista fechada, plataforma e horário.
--
-- Rollback (versão anterior anotada em Entregas Claude/OLLI/2026-11-19-migration-eventos-planos/):
--   recriar a CHECK com os 12 eventos de 20261007100000 e a função de 20261030070000.
begin;

alter table public.user_activity_log
  drop constraint if exists user_activity_log_evento_check;

alter table public.user_activity_log
  add constraint user_activity_log_evento_check check (evento in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create',
    'ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado',
    'planos_visto', 'plano_pagar_clicado', 'orcamento_salvar_barrado'
  ));

create or replace function public.registrar_atividade_usuario(p_evento text, p_plataforma text default 'unknown'::text)
returns void
language plpgsql
set search_path to ''
as $function$
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
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado',
    'planos_visto', 'plano_pagar_clicado', 'orcamento_salvar_barrado'
  ) then
    raise exception 'evento_invalido';
  end if;

  if plataforma_normalizada not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plataforma_normalizada := 'unknown';
  end if;

  if private.atividade_recente(evento_normalizado) then
    return;
  end if;

  insert into public.user_activity_log (user_id, evento, plataforma)
  values ((select auth.uid()), evento_normalizado, plataforma_normalizada);
end;
$function$;

commit;
