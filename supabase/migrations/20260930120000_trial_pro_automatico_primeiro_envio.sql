-- OLLI Orçamentos — teste do Pro AUTOMÁTICO no primeiro envio confirmado.
--
-- Por quê: o teste de 14 dias era opt-in e ninguém apertava o botão. Em 30/09/2026
-- havia 3 tenants 'eligible' (já tinham enviado) e nenhum com o teste iniciado.
-- O contrato comercial não muda: 14 dias, sem cartão, sem cobrança automática,
-- uma vez por tenant, downgrade preserva os dados. O que muda é QUEM aperta o
-- botão: o próprio envio confirmado do orçamento.
--
-- Mora no SERVIDOR (e não no app) de propósito: o APK velho, que só chama
-- `confirmar_envio_orcamento_gratis` e espera `true`, passa a liberar o teste sem
-- precisar de atualização. A assinatura da função e o retorno (boolean) são os
-- mesmos — cliente antigo não percebe diferença além do Pro liberado.
--
-- Regras (todas testadas em scripts/teste-trial-automatico-sql.ts, com PGlite):
--  • só inicia a partir de 'eligible' ou de "sem linha" (unstarted). Teste 'active',
--    'ended', 'converted' ou 'revoked' NUNCA é reiniciado — nem teste 'active' já
--    vencido (que o `meu_estado_oferta_comercial` reporta como 'ended');
--  • só o DONO do tenant dispara (mesma regra de `iniciar_trial_pro`): um membro
--    da equipe não consome o teste da empresa;
--  • só quando o plano efetivo AINDA é 'gratis' no momento da confirmação;
--  • idempotente: reconfirmar o mesmo envio não mexe em nada, e o UPDATE só casa
--    com a linha em 'eligible';
--  • FAIL-CLOSED e isolado: qualquer erro ao ler plano/trial desfaz SÓ o bloco do
--    teste (subtransação) — a confirmação do envio segue válida e o teste continua
--    'eligible' para o opt-in manual. Nunca se concede nada a partir de leitura
--    que falhou.
--
-- Aplicação em produção é um gate separado (depois do merge). Aditiva: uma coluna
-- nova com default e o `create or replace` da função de confirmação.

alter table public.trials_comerciais
  add column if not exists inicio_automatico boolean not null default false;

comment on column public.trials_comerciais.inicio_automatico is
  'true quando o teste foi iniciado pelo primeiro envio confirmado (confirmar_envio_orcamento_gratis), não pelo botão.';

create or replace function public.confirmar_envio_orcamento_gratis(
  p_orcamento_id text,
  p_reserva_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_periodo date := date_trunc('month', timezone('UTC', now()))::date;
  v_canal text;
  v_gatilho text;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':' || v_periodo::text, 0));

  update public.orcamento_envios_gratis e
  set estado = 'confirmado', confirmado_em = now()
  where e.tenant_id = v_contexto.tenant_id
    and e.periodo = v_periodo
    and e.orcamento_id = trim(p_orcamento_id)
    and e.reserva_token = p_reserva_token
    and e.estado = 'reservado'
    and e.reserva_expira_em > now()
  returning e.primeiro_canal into v_canal;

  if not found then
    -- Reconfirmação (ou reserva vencida): responde se o envio consta como
    -- confirmado e NÃO toca no teste — é o que torna a função idempotente.
    return exists (
      select 1 from public.orcamento_envios_gratis e
      where e.tenant_id = v_contexto.tenant_id and e.periodo = v_periodo
        and e.orcamento_id = trim(p_orcamento_id) and e.estado = 'confirmado'
    );
  end if;

  v_gatilho := case v_canal when 'pdf' then 'first_pdf' when 'link' then 'first_link' else 'first_whatsapp' end;

  insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
  values (v_contexto.tenant_id, v_contexto.owner_user_id, 'eligible', v_gatilho, auth.uid())
  on conflict (tenant_id) do nothing;

  -- Teste do Pro automático. Bloco com EXCEPTION = subtransação: se algo falhar
  -- aqui, só o teste é desfeito; a entrega (que já aconteceu) continua confirmada.
  begin
    if auth.uid() = v_contexto.owner_user_id
       and public.plano_comercial_efetivo(v_contexto.owner_user_id, v_contexto.tenant_id, now()) = 'gratis' then
      -- Mesma trava de `iniciar_trial_pro`: botão e envio simultâneos não iniciam duas vezes.
      perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':trial', 0));
      update public.trials_comerciais t
      set estado = 'active',
          gatilho = v_gatilho,
          iniciado_em = now(),
          termina_em = now() + interval '14 days',
          inicio_automatico = true,
          atualizado_em = now()
      where t.tenant_id = v_contexto.tenant_id
        and t.estado = 'eligible';
    end if;
  exception when others then
    raise warning 'trial_automatico_nao_iniciado: %', sqlstate;
  end;

  return true;
end;
$$;

revoke all on function public.confirmar_envio_orcamento_gratis(text,uuid) from public, anon;
grant execute on function public.confirmar_envio_orcamento_gratis(text,uuid) to authenticated;

comment on function public.confirmar_envio_orcamento_gratis(text,uuid) is
  'Confirma o consumo da cota do Grátis e, no primeiro envio do dono em tenant elegível, inicia o teste Pro de 14 dias (sem cartão, sem cobrança automática). Idempotente.';

comment on table public.trials_comerciais is
  'Trial Pro uma vez por tenant, 14 dias, sem cartão/auto-renovação; inicia no 1º envio confirmado do dono ou pelo botão; downgrade nunca apaga dados.';
