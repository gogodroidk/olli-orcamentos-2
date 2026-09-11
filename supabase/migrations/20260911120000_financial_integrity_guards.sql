-- OLLI Orçamentos — integridade financeira e de estados (staging-first).
--
-- Os recibos continuam sendo o evento financeiro compatível com o app atual.
-- Esta migration adiciona duas camadas que a validação de UI não consegue
-- oferecer sozinha:
--   1) CHECKs defensivos para valores/status gravados diretamente pela Data API;
--   2) trigger transacional que trava a linha do orçamento antes de somar os
--      recibos, impedindo que dois aparelhos ultrapassem o total em corrida.
--
-- `NOT VALID` preserva linhas legadas possivelmente fora do contrato. A regra
-- passa a valer imediatamente para INSERT/UPDATE novos e pode ser validada em
-- uma janela posterior após a limpeza explícita de legado.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orcamentos'::regclass
      AND conname = 'orcamentos_status_valido_ck'
  ) THEN
    ALTER TABLE public.orcamentos
      ADD CONSTRAINT orcamentos_status_valido_ck
      CHECK (status IN (
        'rascunho', 'enviado', 'visualizado', 'em_negociacao',
        'aguardando_assinatura', 'aprovado', 'recusado', 'expirado',
        'cancelado', 'convertido'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orcamentos'::regclass
      AND conname = 'orcamentos_valores_nao_negativos_ck'
  ) THEN
    ALTER TABLE public.orcamentos
      ADD CONSTRAINT orcamentos_valores_nao_negativos_ck
      CHECK (subtotal >= 0 AND desconto >= 0 AND valor_total >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ordens_servico'::regclass
      AND conname = 'ordens_servico_status_valido_ck'
  ) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_status_valido_ck
      CHECK (status IN ('aberta', 'agendada', 'em_execucao', 'pausada', 'concluida', 'cancelada')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ordens_servico'::regclass
      AND conname = 'ordens_servico_valor_nao_negativo_ck'
  ) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_valor_nao_negativo_ck
      CHECK (valor IS NULL OR valor >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recibos'::regclass
      AND conname = 'recibos_valor_positivo_ck'
  ) THEN
    ALTER TABLE public.recibos
      ADD CONSTRAINT recibos_valor_positivo_ck
      CHECK (valor_recebido > 0) NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT orcamentos_status_valido_ck ON public.orcamentos IS
  'Contrato de estados do orçamento; NOT VALID mantém legado e protege novas escritas.';
COMMENT ON CONSTRAINT orcamentos_valores_nao_negativos_ck ON public.orcamentos IS
  'Valores monetários não podem ser negativos em novas escritas.';
COMMENT ON CONSTRAINT ordens_servico_status_valido_ck ON public.ordens_servico IS
  'Contrato de estados da OS; NOT VALID mantém legado e protege novas escritas.';
COMMENT ON CONSTRAINT ordens_servico_valor_nao_negativo_ck ON public.ordens_servico IS
  'Valor da OS, quando informado, não pode ser negativo.';
COMMENT ON CONSTRAINT recibos_valor_positivo_ck ON public.recibos IS
  'Recibos representam recebimentos reais e precisam ter valor positivo.';

CREATE OR REPLACE FUNCTION public.validar_recibo_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  total_orcamento numeric;
  recebimentos_anteriores numeric;
BEGIN
  IF NEW.valor_recebido IS NULL OR NEW.valor_recebido <= 0 THEN
    RAISE EXCEPTION 'valor_recebido_deve_ser_positivo'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.forma_pagamento IS NOT NULL AND btrim(NEW.forma_pagamento) = '' THEN
    RAISE EXCEPTION 'forma_pagamento_deve_ser_informada'
      USING ERRCODE = '23514';
  END IF;

  -- Recebimento avulso não tem saldo de orçamento para limitar.
  IF NEW.orcamento_id IS NULL OR NEW.excluido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- A trava por orçamento serializa dois aparelhos que tentem registrar a
  -- mesma última parcela. O filtro por user_id mantém o vínculo no tenant.
  SELECT o.valor_total
    INTO total_orcamento
    FROM public.orcamentos o
   WHERE o.id = NEW.orcamento_id
     AND o.user_id = NEW.user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'orcamento_do_recebimento_nao_encontrado'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(SUM(r.valor_recebido), 0)
    INTO recebimentos_anteriores
    FROM public.recibos r
   WHERE r.user_id = NEW.user_id
     AND r.orcamento_id = NEW.orcamento_id
     AND r.id <> NEW.id
     AND r.excluido_em IS NULL;

  IF recebimentos_anteriores + NEW.valor_recebido > total_orcamento + 0.005 THEN
    RAISE EXCEPTION 'recebimento_ultrapassa_saldo'
      USING ERRCODE = '23514',
            DETAIL = 'O total dos recebimentos vinculados não pode ultrapassar o valor do orçamento.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_recibo_financeiro() FROM PUBLIC;

DROP TRIGGER IF EXISTS recibos_validar_financeiro ON public.recibos;
CREATE TRIGGER recibos_validar_financeiro
  BEFORE INSERT OR UPDATE OF valor_recebido, orcamento_id, user_id, excluido_em
  ON public.recibos
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_recibo_financeiro();

COMMENT ON FUNCTION public.validar_recibo_financeiro() IS
  'Valida recebimento positivo e saldo por orçamento sob lock; não substitui o ledger futuro, mas fecha a corrida atual.';
