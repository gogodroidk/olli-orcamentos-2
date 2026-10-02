-- ============================================================================
-- OLLI — "ENCERRAR ATENDIMENTO" NA OS (encerramento em 60 segundos)
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   `ordens_servico.encerramento jsonb` — o progresso do fluxo único que fecha a
--   visita na casa do cliente: fotos do depois, assinatura do cliente, cobrança,
--   recibo, próxima visita e pedido de avaliação. Cada passo fica como
--   {"estado": "feito"|"pulado", "em": ISO}; junto vão a assinatura do cliente
--   (data URI PNG gerado no aparelho), o id do recibo e o da próxima visita
--   criados no fluxo. Formato e leitura tolerante: src/utils/encerramentoOS.ts.
--   Nulo = a OS nunca passou pelo fluxo (a verdade de toda OS anterior).
--
-- O QUE NÃO MUDA
--   - status/concluido_em continuam sendo a verdade da conclusão (o fluxo só
--     conclui a OS pelo caminho de sempre, que também fecha a visita da agenda);
--   - nenhuma policy nova: a coluna herda as policies da linha (dono + equipe).
--
-- LGPD
--   A assinatura do cliente é dado pessoal do cliente DO PRESTADOR, guardado para
--   comprovar a execução do serviço (mesma base da assinatura do orçamento, que já
--   vive no blob de `orcamentos`). Não é assinatura digital certificada.
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do APK novo. Sem ela o app segue
--   funcionando: o push detecta a coluna inexistente, reenvia a OS sem ela e o
--   pull PRESERVA o encerramento local (cloudSync, osSemColunaEncerramento).
--
-- IDEMPOTENTE: add column if not exists; constraint recriada por nome.
-- SEGREDOS: zero.
-- ============================================================================

begin;

alter table public.ordens_servico
  add column if not exists encerramento jsonb;

comment on column public.ordens_servico.encerramento is
  'Encerrar atendimento: passos (feito/pulado), assinatura do cliente, recibo e próxima visita criados no fluxo. Nulo = a OS não passou pelo fluxo.';

-- Só objeto (ou nulo) e com teto de tamanho: a assinatura é um PNG pequeno
-- (até 520x180, traço fino); 512 KB cobre com folga e barra lixo gigante.
alter table public.ordens_servico
  drop constraint if exists ordens_servico_encerramento_formato;
alter table public.ordens_servico
  add constraint ordens_servico_encerramento_formato
  check (
    encerramento is null
    or (jsonb_typeof(encerramento) = 'object' and pg_column_size(encerramento) <= 524288)
  ) not valid;
alter table public.ordens_servico
  validate constraint ordens_servico_encerramento_formato;

commit;
