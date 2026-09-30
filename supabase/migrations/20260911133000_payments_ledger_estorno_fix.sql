-- Permite a única transição registrada -> estornado sem abrir edição do evento.
CREATE OR REPLACE FUNCTION public.proteger_pagamento_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pagamento_append_only' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

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
