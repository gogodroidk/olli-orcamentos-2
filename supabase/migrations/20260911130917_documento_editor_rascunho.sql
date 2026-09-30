-- Editor seguro da Central de Documentos.
-- Uma edição só é válida para rascunho/pronto e cria uma nova versão + atualiza
-- o ponteiro do documento na mesma transação. Estados enviados, assinados ou
-- arquivados continuam congelados.

CREATE OR REPLACE FUNCTION public.editar_documento_rascunho(
  p_documento_id text,
  p_titulo text,
  p_dados jsonb
)
RETURNS public.documentos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ator uuid := (SELECT auth.uid());
  atual public.documentos;
  proxima_versao integer;
  atualizado public.documentos;
BEGIN
  IF ator IS NULL THEN
    RAISE EXCEPTION 'sessao_obrigatoria' USING ERRCODE = '42501';
  END IF;
  IF p_documento_id IS NULL OR char_length(btrim(p_documento_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'documento_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_titulo IS NULL OR char_length(btrim(p_titulo)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'titulo_documento_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'dados_documento_invalidos' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(p_dados) > 1048576 THEN
    RAISE EXCEPTION 'dados_documento_excedem_limite' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO atual
    FROM public.documentos
   WHERE id = btrim(p_documento_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_nao_encontrado' USING ERRCODE = '23503';
  END IF;
  IF atual.status IN ('enviado', 'assinado', 'arquivado') THEN
    RAISE EXCEPTION 'documento_congelado_exige_nova_versao' USING ERRCODE = '55000';
  END IF;

  SELECT GREATEST(
    atual.versao_atual,
    COALESCE(MAX(v.numero_versao), 0)
  ) + 1
    INTO proxima_versao
    FROM public.documento_versoes v
   WHERE v.documento_id = atual.id;

  INSERT INTO public.documento_versoes (
    id, documento_id, user_id, numero_versao, dados, criado_em, criado_por
  ) VALUES (
    gen_random_uuid()::text, atual.id, atual.user_id, proxima_versao,
    p_dados, now(), ator
  );

  UPDATE public.documentos
     SET titulo = btrim(p_titulo),
         dados = p_dados,
         versao_atual = proxima_versao,
         status = 'rascunho',
         atualizado_em = now()
   WHERE id = atual.id
  RETURNING * INTO atualizado;
  RETURN atualizado;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_documento_rascunho(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_documento_rascunho(text,text,jsonb) TO authenticated;

COMMENT ON FUNCTION public.editar_documento_rascunho(text,text,jsonb) IS
  'Edita apenas documento não congelado; cria versão append-only e atualiza o ponteiro de forma atômica.';
