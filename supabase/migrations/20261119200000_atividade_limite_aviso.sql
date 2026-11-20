-- OLLI — MEDIR O AVISO DO LIMITE DO GRÁTIS (CQ-DINHEIRO-LOTE1, D-2506; dono: PRODUCT — CPO, 19/11/2026).
--
-- O aviso "Limite do mês atingido" do painel ganhou o botão "Liberar no Pro" (leva ao Pix do Pro).
-- Para saber quantos são barrados e quantos clicam em pagar, entram 2 eventos de lista fechada:
--   'limite_aviso_visto'         → o aviso apareceu (o envio foi barrado pelo limite de 5/mês);
--   'limite_aviso_pagar_clicado' → a pessoa tocou em "Liberar no Pro".
-- Sem o evento na CHECK, o insert estoura, o RPC devolve erro e o cliente ignora (telemetria
-- best-effort) — o mesmo bug que a 20261119080000 consertou para 'planos_visto'.
--
-- O que muda: a CHECK da user_activity_log e a allowlist de registrar_atividade_usuario ganham os
-- 2 eventos. O resto da função fica IGUAL à 20261119080000 (a última versão escrita no repo).
-- Sem dado pessoal: só user_id, evento de lista fechada, plataforma e horário.
--
-- NÃO APLICADA. Depende da 20261119080000 já estar no banco (está em produção desde 19/11 08h).
-- Rollback: reaplicar a 20261119080000 (mesma CHECK e função, sem os 2 eventos).
-- UNIÃO (TECH — CTO, 19/11 23h): #421 e #424 reescrevem a mesma CHECK e a mesma função. Para nenhuma apagar
-- os eventos da outra, as DUAS trazem os 4 eventos novos (lista de produção lida por pg_get_constraintdef
-- em 19/11 22h58 = os 15 da 20261119080000 + estes 4). Qualquer ordem de aplicação deixa os 19.
-- Rollback das duas: delete from public.user_activity_log where evento in ('envio_barrado_cadastro',
--   'envio_barrado_sem_whatsapp', 'limite_aviso_visto', 'limite_aviso_pagar_clicado'); e reaplicar a 20261119080000.
begin;

alter table public.user_activity_log
  drop constraint if exists user_activity_log_evento_check;

alter table public.user_activity_log
  add constraint user_activity_log_evento_check check (evento in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create',
    'ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
    'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado',
    'planos_visto', 'plano_pagar_clicado', 'orcamento_salvar_barrado',
    'envio_barrado_cadastro', 'envio_barrado_sem_whatsapp',
    'limite_aviso_visto', 'limite_aviso_pagar_clicado'
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
    'planos_visto', 'plano_pagar_clicado', 'orcamento_salvar_barrado',
    'envio_barrado_cadastro', 'envio_barrado_sem_whatsapp',
    'limite_aviso_visto', 'limite_aviso_pagar_clicado'
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
