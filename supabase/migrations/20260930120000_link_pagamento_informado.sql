-- ============================================================================
-- OLLI — Link do cliente: "Já paguei" (aviso de pagamento do cliente final)
-- ----------------------------------------------------------------------------
-- Frente "Cobrança e pós-venda com 1 toque" (30/09/2026).
--
-- Depois de APROVAR no link público (/o/<token>), o cliente vê "Pagar com Pix" com a
-- chave do PRESTADOR (dinheiro direto na conta dele; o OLLI não intermedeia) e um
-- botão "Já paguei". O botão NÃO marca pago: só AVISA o prestador, que confere no
-- banco e registra o recebimento no app. Para isso:
--
--   1) orcamentos_publicos.pagamento_informado_em — quando o cliente avisou (1ª vez;
--      o worker grava com filtro `pagamento_informado_em is null`, idempotente).
--   2) eventos_orcamento_publico.evento passa a aceitar 'pagamento_informado'
--      (trilha do cliente no app: "Cliente avisou que já pagou — confira no banco").
--
-- QUEM ESCREVE: só o worker (worker/src/link.js), via SERVICE_ROLE. Nenhuma policy
--   nova: a coluna herda a RLS owner-only de orcamentos_publicos (o dono lê; o
--   cliente anônimo não tem credencial de banco) e a trilha continua append-only
--   para authenticated (sem policy de INSERT/UPDATE/DELETE).
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do deploy do worker. Sem ela o worker
--   funciona (a leitura cai para as colunas antigas), mas o "Já paguei" fica
--   DESLIGADO — o botão não aparece e o POST responde `recurso_desligado`.
--
-- IDEMPOTENTE: add column if not exists; o CHECK é recriado por nome.
-- ============================================================================

alter table public.orcamentos_publicos
  add column if not exists pagamento_informado_em timestamptz;

comment on column public.orcamentos_publicos.pagamento_informado_em is
  'Quando o cliente tocou "Já paguei" no link público. Aviso para o prestador conferir — NÃO é confirmação de pagamento.';

alter table public.eventos_orcamento_publico
  drop constraint if exists eventos_orcamento_publico_evento_check;

alter table public.eventos_orcamento_publico
  add constraint eventos_orcamento_publico_evento_check
  check (evento in ('visualizado', 'aprovado', 'recusado', 'pagamento_informado'));

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='orcamentos_publicos'
--      and column_name='pagamento_informado_em';                    -- 1 linha
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname='eventos_orcamento_publico_evento_check';       -- inclui pagamento_informado
-- O texto desta migration é travado por scripts/teste-cobranca-posvenda.ts; a
-- execução (coluna, CHECK aceitando/recusando evento, filtro idempotente do worker)
-- foi conferida em Postgres embutido (PGlite) antes do PR — ver descrição do PR.
-- ============================================================================
