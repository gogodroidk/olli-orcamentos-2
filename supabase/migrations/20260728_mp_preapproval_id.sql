-- ─────────────────────────────────────────────────────────────────────────────
-- ASSINATURA RECORRENTE DO MERCADO PAGO: guardar o id que permite CANCELAR
--
-- O QUE FALTAVA: `public.assinaturas` guarda `stripe_subscription_id`, e é por ele
-- que `/conta/excluir` cancela a cobrança antes de apagar o usuário (worker/src/
-- conta.js). A assinatura recorrente do Mercado Pago (preapproval, cartão) não
-- tinha onde ser guardada — o webhook gravava até `stripe_subscription_id: null`.
-- Resultado: quem assinasse pelo MP e excluísse a conta continuava com o CARTÃO
-- SENDO COBRADO, sem conta pela qual cancelar. Cobrança indevida.
--
-- Uma coluna, texto, opcional. O worker já trata a ausência dela sem quebrar
-- (grava sem o campo e loga), então este arquivo pode ser aplicado depois do
-- deploy sem janela de erro.
-- Idempotente: pode rodar de novo sem efeito.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.assinaturas
  add column if not exists mp_preapproval_id text;

comment on column public.assinaturas.mp_preapproval_id is
  'Id da preapproval (assinatura recorrente) no Mercado Pago. Usado para (1) cancelar a cobranca do cartao na exclusao de conta e (2) provar que um webhook de cancelamento se refere A assinatura que sustenta o plano vigente — sem essa prova, o worker NAO reduz o plano.';

-- Busca pelo id (reconciliação manual do dono: "de quem é esta preapproval?").
create index if not exists assinaturas_mp_preapproval_idx
  on public.assinaturas (mp_preapproval_id) where mp_preapproval_id is not null;

-- ── Prova (rodar no SQL editor depois de aplicar) ────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'assinaturas'
--      and column_name = 'mp_preapproval_id';  -- 1 linha
