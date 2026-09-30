-- OLLI Orçamentos — data real de conclusão da Ordem de Serviço.
-- Expansão aditiva: leitores antigos continuam usando status/atualizado_em;
-- leitores novos só usam concluido_em quando a OS está concluída.
-- Aplicar primeiro em staging; produção permanece fora deste lote.

alter table public.ordens_servico
  add column if not exists concluido_em timestamptz;

create index if not exists ordens_servico_concluido_idx
  on public.ordens_servico (user_id, concluido_em)
  where status = 'concluida' and concluido_em is not null;
