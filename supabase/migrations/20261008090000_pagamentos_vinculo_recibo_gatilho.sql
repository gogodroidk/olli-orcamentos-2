-- T-026: public.vincular_pagamento_recibo respondia HTTP 500 em produção.
--
-- CAUSA: a migration 20260911124652 (receipt_link) permitia UMA exceção à imutabilidade do
-- ledger: ligar o recibo a um pagamento que ainda não tinha recibo (recibo_id NULL -> valor).
-- Só que ela tem timestamp ANTERIOR à 20260911130000 (que cria a tabela e o gatilho), e as
-- migrations 132000, 133000 e 134000 recriaram o gatilho SEM essa exceção. O estado final tratava
-- recibo_id como imutável: todo UPDATE de vínculo caía em 'pagamento_evento_imutavel' (55000),
-- que o PostgREST devolve como 500.
--
-- CORREÇÃO: recoloca a exceção, só para NULL -> valor, com todos os outros campos travados,
-- recibo do mesmo dono e um recibo por pagamento registrado. Os demais caminhos
-- (INSERT, estorno, transição de estado, mudança de recibo já preenchido) não mudam.
-- O teste scripts/teste-ledger-pagamentos.ts agora confere a ÚLTIMA migration que define o
-- gatilho, não a primeira: foi por olhar a primeira que o bug passou despercebido.

CREATE OR REPLACE FUNCTION public.proteger_pagamento_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  total_orcamento numeric;
  recebido numeric;
  vinculo_recibo boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pagamento_append_only' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'registrado'
       OR NEW.motivo_estorno IS NOT NULL
       OR NEW.estornado_em IS NOT NULL
       OR NEW.estornado_por IS NOT NULL
    THEN
      RAISE EXCEPTION 'pagamento_nasce_registrado' USING ERRCODE = '23514';
    END IF;
    IF NEW.recibo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.recibos r WHERE r.id = NEW.recibo_id AND r.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'recibo_do_pagamento_nao_encontrado' USING ERRCODE = '23503';
    END IF;
    IF NEW.orcamento_id IS NOT NULL THEN
      SELECT o.valor_total INTO total_orcamento
        FROM public.orcamentos o
       WHERE o.id = NEW.orcamento_id
         AND o.user_id = NEW.user_id
         AND o.status IN ('aprovado','convertido')
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'orcamento_nao_recebivel' USING ERRCODE = '23514';
      END IF;
      SELECT COALESCE(SUM(p.valor), 0) INTO recebido
        FROM public.pagamentos p
       WHERE p.user_id = NEW.user_id
         AND p.orcamento_id = NEW.orcamento_id
         AND p.estado = 'registrado';
      IF recebido + NEW.valor > total_orcamento + 0.005 THEN
        RAISE EXCEPTION 'recebimento_ultrapassa_saldo' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  vinculo_recibo := OLD.recibo_id IS NULL AND NEW.recibo_id IS NOT NULL;

  IF OLD.estado = 'estornado' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
       OR NEW.orcamento_id IS DISTINCT FROM OLD.orcamento_id
       OR NEW.recibo_id IS DISTINCT FROM OLD.recibo_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
       OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.comprovante_chave IS DISTINCT FROM OLD.comprovante_chave
       OR NEW.comprovante_hash IS DISTINCT FROM OLD.comprovante_hash
       OR NEW.comprovante_mime IS DISTINCT FROM OLD.comprovante_mime
       OR NEW.comprovante_tamanho IS DISTINCT FROM OLD.comprovante_tamanho
       OR NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.motivo_estorno IS DISTINCT FROM OLD.motivo_estorno
       OR NEW.estornado_em IS DISTINCT FROM OLD.estornado_em
       OR NEW.estornado_por IS DISTINCT FROM OLD.estornado_por
    THEN
      RAISE EXCEPTION 'pagamento_evento_imutavel' USING ERRCODE = '55000';
    END IF;
  ELSIF vinculo_recibo THEN
    -- Única exceção à imutabilidade: o recibo local foi sincronizado depois do
    -- ledger. Nenhum campo financeiro ou de auditoria pode mudar junto.
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
       OR NEW.orcamento_id IS DISTINCT FROM OLD.orcamento_id
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
       OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.comprovante_chave IS DISTINCT FROM OLD.comprovante_chave
       OR NEW.comprovante_hash IS DISTINCT FROM OLD.comprovante_hash
       OR NEW.comprovante_mime IS DISTINCT FROM OLD.comprovante_mime
       OR NEW.comprovante_tamanho IS DISTINCT FROM OLD.comprovante_tamanho
       OR NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.motivo_estorno IS DISTINCT FROM OLD.motivo_estorno
       OR NEW.estornado_em IS DISTINCT FROM OLD.estornado_em
       OR NEW.estornado_por IS DISTINCT FROM OLD.estornado_por
    THEN
      RAISE EXCEPTION 'pagamento_evento_imutavel' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.recibos r WHERE r.id = NEW.recibo_id AND r.user_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION 'recibo_do_pagamento_nao_encontrado' USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.pagamentos p
       WHERE p.recibo_id = NEW.recibo_id
         AND p.id <> OLD.id
         AND p.estado = 'registrado'
    ) THEN
      RAISE EXCEPTION 'recibo_pagamento_ja_vinculado' USING ERRCODE = '23505';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
     OR NEW.orcamento_id IS DISTINCT FROM OLD.orcamento_id
     OR NEW.recibo_id IS DISTINCT FROM OLD.recibo_id
     OR NEW.valor IS DISTINCT FROM OLD.valor
     OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento
     OR NEW.data_recebimento IS DISTINCT FROM OLD.data_recebimento
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.comprovante_chave IS DISTINCT FROM OLD.comprovante_chave
     OR NEW.comprovante_hash IS DISTINCT FROM OLD.comprovante_hash
     OR NEW.comprovante_mime IS DISTINCT FROM OLD.comprovante_mime
     OR NEW.comprovante_tamanho IS DISTINCT FROM OLD.comprovante_tamanho
  THEN
    RAISE EXCEPTION 'pagamento_evento_imutavel' USING ERRCODE = '55000';
  END IF;

  IF OLD.estado = 'registrado' AND NEW.estado = 'registrado'
     AND (NEW.motivo_estorno IS DISTINCT FROM OLD.motivo_estorno
       OR NEW.estornado_em IS DISTINCT FROM OLD.estornado_em
       OR NEW.estornado_por IS DISTINCT FROM OLD.estornado_por)
  THEN
    RAISE EXCEPTION 'pagamento_evento_imutavel' USING ERRCODE = '55000';
  END IF;

  IF OLD.estado = 'registrado' AND NEW.estado = 'estornado' THEN
    IF NEW.estornado_em IS NULL
       OR NEW.estornado_por IS DISTINCT FROM (SELECT auth.uid())
       OR NEW.motivo_estorno IS NULL
       OR char_length(btrim(NEW.motivo_estorno)) < 3 THEN
      RAISE EXCEPTION 'estorno_auditavel_obrigatorio' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'transicao_pagamento_invalida' USING ERRCODE = '23514';
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_pagamento_append_only() FROM PUBLIC, anon, authenticated;
