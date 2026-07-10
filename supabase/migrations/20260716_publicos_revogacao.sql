-- ============================================================================
-- 20260716_publicos_revogacao.sql — o link público morre junto com o orçamento.
-- APLICADA em 2026-07-09.
--
-- O BUG (vazamento de dado pessoal + LGPD)
--   `orcamentos_publicos` é uma tabela SEPARADA, lida pelo worker com SERVICE_ROLE
--   (a RLS não a protege). Ela guarda `orcamento_id`, mas NADA a ligava ao ciclo de
--   vida do orçamento: mandar o orçamento para a lixeira, ou excluí-lo de vez, não
--   tocava nela. O link /o/<token> continuava servindo para sempre o nome do
--   cliente, o valor total, todos os itens e o WhatsApp do prestador — e continuava
--   ACEITANDO aprovação/recusa, porque ler e responder passam pelo mesmo getRow.
--
--   Não era teoria: ao aplicar esta migration havia 1 linha pública cujo orçamento
--   de origem já não existia.
--
-- POR QUE UM GATILHO, E NÃO SÓ UM FILTRO NO WORKER
--   O filtro no worker é a borda; ele protege quem passa por aquele código. Esta
--   tabela é lida com service_role, então qualquer leitor futuro (um relatório, um
--   webhook, outro worker) a veria inteira. A revogação precisa morar no BANCO, ao
--   lado do dado. O worker ganha o filtro também — defesa em profundidade, não
--   redundância.
--
-- RESTAURAR TAMBÉM VOLTA: tirar o orçamento da lixeira reativa o link. É a
-- semântica que o usuário espera de uma lixeira, e o gatilho a implementa nos dois
-- sentidos.
--
-- Idempotente. Sem segredos.
-- ============================================================================

alter table public.orcamentos_publicos
  add column if not exists revogado_em timestamptz;

comment on column public.orcamentos_publicos.revogado_em is
  'Preenchido = o link /o/<token> não resolve mais (orçamento na lixeira ou excluído). Mantido por trilha; nunca apagamos a linha, para não perder o histórico de eventos.';

create index if not exists orcamentos_publicos_vivos_idx
  on public.orcamentos_publicos (token) where revogado_em is null;

-- ────────────────────────────────────────────────────────────────────────────
-- Gatilho: o ciclo de vida do orçamento manda no link.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.sincronizar_revogacao_publico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Hard delete: revoga, mas PRESERVA a linha (a trilha de eventos aponta para
    -- ela). Apagar aqui perderia o histórico de que o cliente viu e aprovou.
    update public.orcamentos_publicos
       set revogado_em = coalesce(revogado_em, now())
     where orcamento_id = old.id;
    return old;
  end if;

  -- Soft delete → revoga. Restaurar → reativa (a lixeira é reversível dos dois lados).
  if new.excluido_em is not null and old.excluido_em is null then
    update public.orcamentos_publicos
       set revogado_em = new.excluido_em
     where orcamento_id = new.id;
  elsif new.excluido_em is null and old.excluido_em is not null then
    update public.orcamentos_publicos
       set revogado_em = null
     where orcamento_id = new.id;
  end if;

  return new;
end $$;

drop trigger if exists orcamentos_revoga_publico_upd on public.orcamentos;
create trigger orcamentos_revoga_publico_upd
  after update of excluido_em on public.orcamentos
  for each row execute function public.sincronizar_revogacao_publico();

drop trigger if exists orcamentos_revoga_publico_del on public.orcamentos;
create trigger orcamentos_revoga_publico_del
  after delete on public.orcamentos
  for each row execute function public.sincronizar_revogacao_publico();

-- ────────────────────────────────────────────────────────────────────────────
-- Backfill: fecha o que já estava aberto.
--   (a) link cujo orçamento de origem sumiu (hard delete anterior ao gatilho);
--   (b) link cujo orçamento está na lixeira.
-- ────────────────────────────────────────────────────────────────────────────
update public.orcamentos_publicos p
   set revogado_em = now()
 where p.revogado_em is null
   and not exists (select 1 from public.orcamentos o where o.id = p.orcamento_id);

update public.orcamentos_publicos p
   set revogado_em = o.excluido_em
  from public.orcamentos o
 where o.id = p.orcamento_id
   and o.excluido_em is not null
   and p.revogado_em is null;
