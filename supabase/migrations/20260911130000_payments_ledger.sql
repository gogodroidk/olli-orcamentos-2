-- OLLI Orçamentos — ledger financeiro por recebimento.
--
-- `recibos` continua existindo para compatibilidade com o app e para o PDF
-- comercial. Esta tabela é o evento financeiro autoritativo no servidor:
-- append-first, idempotente por tenant/chave e com estorno explícito (sem DELETE).

CREATE TABLE IF NOT EXISTS public.pagamentos (
  id                    text PRIMARY KEY,
  user_id               uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  criado_por            uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  orcamento_id          text REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  recibo_id             text REFERENCES public.recibos(id) ON DELETE SET NULL,
  valor                 numeric NOT NULL CHECK (valor > 0),
  forma_pagamento       text NOT NULL CHECK (char_length(btrim(forma_pagamento)) BETWEEN 1 AND 80),
  data_recebimento      timestamptz NOT NULL,
  idempotency_key       text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,160}$'),
  comprovante_chave     text,
  comprovante_hash      text CHECK (comprovante_hash IS NULL OR comprovante_hash ~ '^[a-f0-9]{64}$'),
  comprovante_mime      text CHECK (comprovante_mime IS NULL OR comprovante_mime IN ('application/pdf','image/png','image/jpeg','image/webp')),
  comprovante_tamanho   integer CHECK (comprovante_tamanho IS NULL OR comprovante_tamanho BETWEEN 1 AND 20971520),
  estado                text NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','estornado')),
  motivo_estorno       text CHECK (motivo_estorno IS NULL OR char_length(btrim(motivo_estorno)) BETWEEN 3 AND 500),
  estornado_em         timestamptz,
  estornado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS pagamentos_user_orcamento_idx
  ON public.pagamentos (user_id, orcamento_id, criado_em DESC)
  WHERE estado = 'registrado';
CREATE INDEX IF NOT EXISTS pagamentos_user_criado_idx
  ON public.pagamentos (user_id, criado_em DESC);

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pagamentos_select_visiveis ON public.pagamentos;
CREATE POLICY pagamentos_select_visiveis ON public.pagamentos
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT public.donos_visiveis()));

DROP POLICY IF EXISTS pagamentos_insert_owner ON public.pagamentos;
CREATE POLICY pagamentos_insert_owner ON public.pagamentos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (criado_por IS NULL OR criado_por = (SELECT auth.uid())));

DROP POLICY IF EXISTS pagamentos_update_owner ON public.pagamentos;
CREATE POLICY pagamentos_update_owner ON public.pagamentos
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS pagamentos_delete_owner ON public.pagamentos;
-- Sem DELETE: correção financeira é estorno, não apagamento.

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

DROP TRIGGER IF EXISTS pagamentos_proteger_append_only ON public.pagamentos;
CREATE TRIGGER pagamentos_proteger_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_pagamento_append_only();

CREATE OR REPLACE FUNCTION public.registrar_pagamento_financeiro(
  p_id text,
  p_orcamento_id text,
  p_valor numeric,
  p_forma_pagamento text,
  p_data_recebimento timestamptz,
  p_idempotency_key text,
  p_recibo_id text DEFAULT NULL,
  p_comprovante_chave text DEFAULT NULL,
  p_comprovante_hash text DEFAULT NULL,
  p_comprovante_mime text DEFAULT NULL,
  p_comprovante_tamanho integer DEFAULT NULL
)
RETURNS public.pagamentos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existente public.pagamentos;
  novo public.pagamentos;
  total_orcamento numeric;
  recebido numeric;
  owner_id uuid := (SELECT auth.uid());
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'sessao_obrigatoria' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_id !~ '^[A-Za-z0-9._:-]{8,160}$' THEN
    RAISE EXCEPTION 'id_pagamento_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,160}$' THEN
    RAISE EXCEPTION 'idempotency_key_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor > 100000000 THEN
    RAISE EXCEPTION 'valor_pagamento_invalido' USING ERRCODE = '23514';
  END IF;
  IF p_forma_pagamento IS NULL OR char_length(btrim(p_forma_pagamento)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'forma_pagamento_invalida' USING ERRCODE = '23514';
  END IF;
  IF p_data_recebimento IS NULL THEN
    RAISE EXCEPTION 'data_recebimento_invalida' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO existente
    FROM public.pagamentos
   WHERE user_id = owner_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existente.id IS DISTINCT FROM p_id
       OR existente.orcamento_id IS DISTINCT FROM p_orcamento_id
       OR existente.valor IS DISTINCT FROM p_valor
       OR existente.forma_pagamento IS DISTINCT FROM btrim(p_forma_pagamento)
    THEN
      RAISE EXCEPTION 'idempotency_key_reutilizada' USING ERRCODE = '23505';
    END IF;
    RETURN existente;
  END IF;

  IF p_orcamento_id IS NOT NULL THEN
    SELECT o.valor_total INTO total_orcamento
      FROM public.orcamentos o
     WHERE o.id = p_orcamento_id AND o.user_id = owner_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'orcamento_do_pagamento_nao_encontrado' USING ERRCODE = '23503';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.orcamentos o
       WHERE o.id = p_orcamento_id AND o.user_id = owner_id
         AND o.status IN ('aprovado','convertido')
    ) THEN
      RAISE EXCEPTION 'orcamento_nao_recebivel' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(SUM(p.valor), 0) INTO recebido
      FROM public.pagamentos p
     WHERE p.user_id = owner_id
       AND p.orcamento_id = p_orcamento_id
       AND p.estado = 'registrado';
    IF recebido + p_valor > total_orcamento + 0.005 THEN
      RAISE EXCEPTION 'recebimento_ultrapassa_saldo' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.pagamentos (
    id, user_id, criado_por, orcamento_id, recibo_id, valor, forma_pagamento,
    data_recebimento, idempotency_key, comprovante_chave, comprovante_hash,
    comprovante_mime, comprovante_tamanho
  ) VALUES (
    p_id, owner_id, owner_id, p_orcamento_id, p_recibo_id, p_valor,
    btrim(p_forma_pagamento), p_data_recebimento, p_idempotency_key,
    p_comprovante_chave, p_comprovante_hash, p_comprovante_mime, p_comprovante_tamanho
  ) RETURNING * INTO novo;
  RETURN novo;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pagamento_financeiro(text,text,numeric,text,timestamptz,text,text,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_financeiro(text,text,numeric,text,timestamptz,text,text,text,text,text,integer) TO authenticated;

COMMENT ON TABLE public.pagamentos IS
  'Ledger append-only por recebimento; não substituir por edição de recibo. Estorno exige motivo e actor.';
