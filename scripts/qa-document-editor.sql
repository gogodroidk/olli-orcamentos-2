BEGIN;

DO $$
DECLARE
  uid uuid := '00000000-0000-4000-8000-000000000092';
  doc_key text := 'qa-doc-editor-20260911';
  editado public.documentos;
  versoes integer;
  bloqueado boolean := false;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
  VALUES (uid, 'authenticated', 'authenticated', 'qa-document-editor@invalid.test', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false, false)
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);

  INSERT INTO public.documentos (id, user_id, criado_por, tipo, status, titulo, cliente_nome, origem_tipo, versao_atual, dados, criado_em, atualizado_em)
  VALUES (doc_key, uid, uid, 'contrato', 'rascunho', 'Contrato QA', 'Cliente QA', 'manual', 1, '{"texto":"original"}'::jsonb, now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.documento_versoes (id, documento_id, user_id, numero_versao, dados, criado_em, criado_por)
  VALUES ('qa-doc-editor-version-1', doc_key, uid, 1, '{"texto":"original"}'::jsonb, now(), uid)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO editado FROM public.editar_documento_rascunho(doc_key, 'Contrato QA editado', '{"texto":"segunda versão"}'::jsonb);
  IF editado.titulo <> 'Contrato QA editado' OR editado.status <> 'rascunho' OR editado.versao_atual <> 2 THEN
    RAISE EXCEPTION 'qa_editor_nao_atualizou';
  END IF;
  SELECT count(*) INTO versoes FROM public.documento_versoes v WHERE v.documento_id = doc_key;
  IF versoes <> 2 THEN RAISE EXCEPTION 'qa_editor_versao_ausente'; END IF;

  UPDATE public.documentos SET status = 'enviado' WHERE id = doc_key;
  BEGIN
    PERFORM public.editar_documento_rascunho(doc_key, 'não pode', '{"texto":"bloqueado"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    bloqueado := SQLERRM LIKE '%documento_congelado_exige_nova_versao%';
  END;
  IF NOT bloqueado THEN RAISE EXCEPTION 'qa_editor_sobrescreveu_congelado'; END IF;
END;
$$;

ROLLBACK;
