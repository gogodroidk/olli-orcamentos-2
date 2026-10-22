-- ============================================================================
-- OLLI — STATUS DO ORÇAMENTO ACOMPANHA O LINK PÚBLICO (aprovado/recusado/visto/enviado)
-- ----------------------------------------------------------------------------
-- BUG: o cliente aprova (ou recusa) pelo link /o/<token>, mas o orçamento do
-- prestador continua "enviado"/"rascunho". Medido em 22/10: 7 com link ainda em
-- rascunho, 2 aprovados no link ainda em rascunho, 9 com link já visto. Um de R$ 480
-- aprovado em 06/10 nunca entrou no "Dinheiro parado".
--
-- REGRA (decisão da CPO): link criado→enviado; visto→visualizado; aprovado→aprovado;
-- recusado→recusado. NUNCA rebaixa e NUNCA mexe em status que o prestador moveu
-- (em_negociacao, convertido, cancelado…): só sobe a partir de rascunho/enviado/visualizado.
--
-- ONDE ESTÁ A VERDADE (revisão CTO — corrige o RASCUNHO-v2): o app e o painel leem
-- o status do BLOB `orcamentos.dados` (cloudSync.rowToOrcamento; painel "a verdade é o
-- blob"), NÃO da coluna `status`. E o app só aceita a linha da nuvem se
-- `dados.atualizadoEm` for MAIS NOVO que o local (cloudSync.localMaisNovoOrcamento).
-- Por isso o trigger grava as TRÊS coisas juntas: coluna `status`, `dados.status` e
-- `dados.atualizadoEm`. Só a coluna não mudaria nada na tela de ninguém.
--
-- FUNIL / CAPI: o UPDATE de status dispara `funil_marco_orcamento`, e o CAPI lê
-- `funil_marcos` ('orcamento_enviado', criado_em < 7 dias, estimado=false, consentimento
-- 'sim'). Para eventos NOVOS isso é correto (o link foi aprovado agora). No BACKFILL
-- seria uma data falsa de hoje e um evento falso ao Meta; então o backfill grava o marco
-- ANTES, com a data real e estimado=true (origem 'retroativo', padrão do seed de 30/09),
-- e o trigger fica sem efeito de funil nessas contas.
--
-- NÃO APLICADA. Aplicar só com OK; primeiro numa transação com ROLLBACK (ver docs no PR).
-- Idempotente.
-- ============================================================================
begin;

create or replace function private.promover_status_orcamento_pelo_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  alvo text;
  carimbo text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if new.revogado_em is not null then
    return new;
  end if;

  alvo := case
    when new.status = 'aprovado' then 'aprovado'
    when new.status = 'recusado' then 'recusado'
    when new.visualizado_em is not null then 'visualizado'
    when new.status = 'enviado' then 'enviado'
  end;
  if alvo is null then
    return new;
  end if;

  update public.orcamentos o
     set status = alvo,
         dados = jsonb_set(
                   jsonb_set(coalesce(o.dados, '{}'::jsonb), '{status}', to_jsonb(alvo)),
                   '{atualizadoEm}', to_jsonb(carimbo))
   where o.id = new.orcamento_id
     and o.user_id = new.user_id
     and o.excluido_em is null
     -- degrau atual pelo BLOB (a verdade); status fora da escada = o prestador moveu, não toca.
     and case coalesce(o.dados ->> 'status', o.status)
           when 'rascunho' then 0 when 'enviado' then 1 when 'visualizado' then 2 else 9 end
       < case alvo when 'enviado' then 1 when 'visualizado' then 2 else 3 end;

  return new;
end
$$;

revoke all on function private.promover_status_orcamento_pelo_link() from public, anon, authenticated;

drop trigger if exists trg_promover_status_pelo_link on public.orcamentos_publicos;
create trigger trg_promover_status_pelo_link
  after insert or update of status, visualizado_em, revogado_em on public.orcamentos_publicos
  for each row execute function private.promover_status_orcamento_pelo_link();

-- ----------------------------------------------------------------------------
-- BACKFILL (uma vez), em duas etapas e nesta ordem.
-- 1) Marcos de funil com a data REAL e estimado=true, só para quem ainda não tem o
--    marco (on conflict do nothing). Data real = resposta do cliente, senão a visita
--    ao link, senão a criação do link. Só orçamento que o trigger vai promover.
-- ----------------------------------------------------------------------------
with alvo as (
  select p.user_id,
         p.status as status_link,
         coalesce(p.respondido_em, p.visualizado_em, p.criado_em) as quando
    from public.orcamentos_publicos p
    join public.orcamentos o on o.id = p.orcamento_id and o.user_id = p.user_id
   where p.revogado_em is null
     and o.excluido_em is null
     and coalesce(o.dados ->> 'status', o.status) in ('rascunho', 'enviado', 'visualizado')
     and (p.status in ('enviado', 'aprovado', 'recusado') or p.visualizado_em is not null)
)
insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select user_id, 'orcamento_enviado', 'retroativo', min(quando), true
  from alvo
 group by user_id
on conflict (user_id, marco) do nothing;

insert into public.funil_marcos (user_id, marco, origem, criado_em, estimado)
select p.user_id, 'orcamento_aprovado', 'retroativo', min(coalesce(p.respondido_em, p.visualizado_em, p.criado_em)), true
  from public.orcamentos_publicos p
  join public.orcamentos o on o.id = p.orcamento_id and o.user_id = p.user_id
 where p.revogado_em is null
   and o.excluido_em is null
   and p.status = 'aprovado'
   and coalesce(o.dados ->> 'status', o.status) in ('rascunho', 'enviado', 'visualizado')
 group by p.user_id
on conflict (user_id, marco) do nothing;

-- 2) Reaplica a regra do trigger linha a linha (sem duplicar a lógica).
update public.orcamentos_publicos set status = status where revogado_em is null;

-- Conferência pós-backfill (esperado 0): link já respondido/visto e orçamento ainda em rascunho.
--   select count(*) from public.orcamentos o
--     join public.orcamentos_publicos p on p.orcamento_id = o.id and p.user_id = o.user_id and p.revogado_em is null
--    where coalesce(o.dados ->> 'status', o.status) = 'rascunho' and o.excluido_em is null
--      and (p.status in ('enviado','aprovado','recusado') or p.visualizado_em is not null);

commit;
