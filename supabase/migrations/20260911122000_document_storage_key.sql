-- Chave estável do artefato privado. `arquivo_uri` pode ser uma URL assinada
-- temporária; a chave permite regenerar a URL em outro aparelho sem expor
-- bucket público nem depender de file:// local.
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS arquivo_chave text;
ALTER TABLE public.documento_versoes
  ADD COLUMN IF NOT EXISTS arquivo_chave text;

COMMENT ON COLUMN public.documentos.arquivo_chave IS
  'Bucket/caminho privado do Storage; URI assinada pode expirar e ser regenerada.';
COMMENT ON COLUMN public.documento_versoes.arquivo_chave IS
  'Bucket/caminho privado do Storage da versão; imutável após inserção.';

-- Recompila a proteção depois da coluna existir. Sem este bloco o trigger
-- antigo continuaria ativo, mas não congelaria a nova chave.
CREATE OR REPLACE FUNCTION public.proteger_documento_biblioteca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documento_arquivado_preserva_historico' USING ERRCODE = '55000';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.criado_por IS DISTINCT FROM OLD.criado_por THEN
    RAISE EXCEPTION 'tenant_documento_imutavel' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('enviado', 'assinado', 'arquivado') THEN
    IF NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome
       OR NEW.origem_tipo IS DISTINCT FROM OLD.origem_tipo
       OR NEW.origem_id IS DISTINCT FROM OLD.origem_id
       OR NEW.origem_numero IS DISTINCT FROM OLD.origem_numero
       OR NEW.versao_atual IS DISTINCT FROM OLD.versao_atual
       OR NEW.dados IS DISTINCT FROM OLD.dados
       OR NEW.arquivo_uri IS DISTINCT FROM OLD.arquivo_uri
       OR NEW.arquivo_chave IS DISTINCT FROM OLD.arquivo_chave
       OR NEW.arquivo_hash IS DISTINCT FROM OLD.arquivo_hash
       OR NEW.enviado_em IS DISTINCT FROM OLD.enviado_em
       OR NEW.assinado_em IS DISTINCT FROM OLD.assinado_em THEN
      RAISE EXCEPTION 'documento_congelado_exige_nova_versao' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.proteger_documento_biblioteca() FROM PUBLIC, anon, authenticated;
