/**
 * O que a Central de documentos abre em visual (orçamento, contrato, cláusulas, impressão).
 * Função pura: a tela só decide o destino; o gerador de PDF continua o oficial.
 */

const TIPOS_DE_ORCAMENTO = new Set(['orcamento', 'contrato', 'garantia', 'conclusao']);

export type AcaoVisualDocumento =
  | 'ver_orcamento'
  | 'ver_contrato'
  | 'editar_clausulas'
  | 'imprimir_orcamento'
  | 'imprimir_contrato';

export function abrePainelVisual(doc: {
  tipo: string;
  origemTipo?: string | null;
  origemId?: string | null;
}): boolean {
  return doc.origemTipo === 'orcamento' && !!doc.origemId && TIPOS_DE_ORCAMENTO.has(doc.tipo);
}

/** Ações do par orçamento/contrato. Garantia e conclusão também abrem o painel, com as mesmas. */
export function acoesVisuaisDoDocumento(doc: {
  tipo: string;
  origemTipo?: string | null;
  origemId?: string | null;
}): AcaoVisualDocumento[] {
  if (!abrePainelVisual(doc)) return [];
  if (doc.tipo !== 'orcamento' && doc.tipo !== 'contrato' && doc.tipo !== 'garantia' && doc.tipo !== 'conclusao') return [];
  return ['ver_orcamento', 'ver_contrato', 'editar_clausulas', 'imprimir_orcamento', 'imprimir_contrato'];
}
