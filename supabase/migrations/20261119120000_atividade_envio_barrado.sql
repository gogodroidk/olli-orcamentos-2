-- OLLI — MEDIR O ENVIO BARRADO (CQ-ATIVACAO-LOTE1, achado 6 da revisão de ativação, D-2506, 19/11/2026).
--
-- NÃO APLICADA. Arquivo para o CTO aplicar (ordem: depois de 20261119080000_atividade_check_planos.sql;
-- esta aqui já repete a lista inteira, então aplicar só ela também deixa tudo certo).
--
-- Por quê: metade de quem orça não envia (9 de 18, coorte 01/10–19/11) e nada gravava ONDE o envio
-- trava. O painel passa a gravar:
--   - 'envio_barrado_cadastro'     a porta do cadastro segurou o orçamento (faltam dados do negócio);
--   - 'envio_barrado_sem_whatsapp' tocou em enviar pelo WhatsApp sem o número do cliente
--                                  (agora o número é pedido ali mesmo; o evento mede quantos chegam assim);
--   - 'orcamento_salvar_barrado'   (já aceito pela 20261119080000) o limite do Grátis segurou o envio.
-- Lição de 19/11: evento fora da CHECK some sem erro (o RPC falha e a telemetria engole). Por isso os
-- dois eventos novos entram na CHECK da tabela E na lista da função. O teste
-- scripts/teste-ativacao-lote1.ts confere que todo evento do painel está nas duas listas.
--
-- O resto da função fica IGUAL à 20261119080000 (que repete a de produção lida em 19/11 07h).
-- Sem dado pessoal: só user_id, evento de lista fechada, plataforma e horário.
--
-- Rollback: reaplicar 20261119080000_atividade_check_planos.sql (CHECK e função sem os 2 eventos).
-- Antes do rollback, apagar as linhas dos 2 eventos, senão a CHECK antiga não valida:
--   delete from public.user_activity_log where evento in ('envio_barrado_cadastro', 'envio_barrado_sem_whatsapp');
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
