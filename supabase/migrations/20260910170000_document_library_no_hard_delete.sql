-- Documentos enviados/assinados não podem ser apagados diretamente por um
-- cliente autenticado. A remoção operacional deve usar status=arquivado ou um
-- fluxo administrativo com trilha/retensão; as versões ficam preservadas.
drop policy if exists documentos_visible_delete on public.documentos;
