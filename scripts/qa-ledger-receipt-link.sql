BEGIN;

DO $$
DECLARE
  uid uuid;
  pagamento_id text := 'qa-pay-link-20260911';
  recibo_key text := 'qa-rec-link-20260911';
  outro_recibo_id text := 'qa-rec-link-other-20260911';
  linked_id text;
  failed boolean := false;
BEGIN
  uid := '00000000-0000-4000-8000-000000000091';
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  VALUES (uid, 'authenticated', 'authenticated', 'qa-ledger-link@invalid.test', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false, false)
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);

  INSERT INTO public.recibos (id, user_id, numero, cliente_id, cliente_nome, valor_recebido, forma_pagamento, dados, criado_em, atualizado_em)
  VALUES (recibo_key, uid, 'QA-REC-1', NULL, 'QA', 10, 'PIX', '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.recibos (id, user_id, numero, cliente_id, cliente_nome, valor_recebido, forma_pagamento, dados, criado_em, atualizado_em)
  VALUES (outro_recibo_id, uid, 'QA-REC-2', NULL, 'QA', 10, 'PIX', '{}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.pagamentos (id, user_id, criado_por, valor, forma_pagamento, data_recebimento, idempotency_key)
  VALUES (pagamento_id, uid, uid, 10, 'PIX', now(), pagamento_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT v.recibo_id INTO linked_id FROM public.vincular_pagamento_recibo(pagamento_id, recibo_key) AS v;
  IF linked_id IS DISTINCT FROM recibo_key THEN RAISE EXCEPTION 'qa_vinculo_nao_gravou'; END IF;
  SELECT v.recibo_id INTO linked_id FROM public.vincular_pagamento_recibo(pagamento_id, recibo_key) AS v;
  IF linked_id IS DISTINCT FROM recibo_key THEN RAISE EXCEPTION 'qa_vinculo_nao_idempotente'; END IF;

  BEGIN
    PERFORM public.vincular_pagamento_recibo(pagamento_id, outro_recibo_id);
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM LIKE '%pagamento_ja_vinculado%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'qa_vinculo_duplo_aceito'; END IF;

  failed := false;
  BEGIN
    UPDATE public.pagamentos SET valor = 11 WHERE id = pagamento_id;
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM LIKE '%pagamento_evento_imutavel%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'qa_edicao_financeira_aceita'; END IF;

  failed := false;
  BEGIN
    DELETE FROM public.pagamentos WHERE id = pagamento_id;
  EXCEPTION WHEN OTHERS THEN
    failed := SQLERRM LIKE '%pagamento_append_only%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'qa_delete_financeiro_aceito'; END IF;
END;
$$;

ROLLBACK;
