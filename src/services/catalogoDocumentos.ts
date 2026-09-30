import type { RootStackParamList } from '../navigation/AppNavigator';

export type ItemCatalogoDocumento = {
  tipo: 'orcamento' | 'contrato' | 'ordem_servico' | 'pmoc' | 'recibo' | 'garantia' | 'conclusao' | 'laudo' | 'checklist' | 'certificado';
  titulo: string;
  descricao: string;
  icone: keyof typeof import('@expo/vector-icons').MaterialCommunityIcons.glyphMap;
  destino: keyof RootStackParamList;
};

export const CATALOGO_DOCUMENTOS: readonly ItemCatalogoDocumento[] = [
  { tipo: 'orcamento', titulo: 'Orçamento', descricao: 'Itens, valores e revisão segura.', icone: 'file-document-outline', destino: 'Orcamentos' },
  { tipo: 'contrato', titulo: 'Contrato de serviço', descricao: 'Cláusulas, prazo e assinatura.', icone: 'file-sign', destino: 'ModelosDocumento' },
  { tipo: 'ordem_servico', titulo: 'Ordem de serviço', descricao: 'Checklist, técnico e conclusão.', icone: 'clipboard-text-outline', destino: 'OrdemServico' },
  { tipo: 'pmoc', titulo: 'PMOC', descricao: 'Plano, equipamentos e periodicidade.', icone: 'calendar-sync-outline', destino: 'Pmoc' },
  { tipo: 'recibo', titulo: 'Recibo', descricao: 'Recebimento e segunda via.', icone: 'receipt-text-check-outline', destino: 'EmitirRecibo' },
  { tipo: 'garantia', titulo: 'Garantia', descricao: 'Cobertura e condições do serviço.', icone: 'shield-check-outline', destino: 'ModelosDocumento' },
  { tipo: 'conclusao', titulo: 'Conclusão', descricao: 'Entrega, aceite e observações.', icone: 'file-check-outline', destino: 'ModelosDocumento' },
  { tipo: 'laudo', titulo: 'Laudo técnico', descricao: 'Achados e recomendações.', icone: 'clipboard-text-search-outline', destino: 'ModelosDocumento' },
  { tipo: 'checklist', titulo: 'Checklist', descricao: 'Rotina operacional editável.', icone: 'format-list-checks', destino: 'ModelosDocumento' },
  { tipo: 'certificado', titulo: 'Certificado', descricao: 'Modelo para revisar antes de emitir.', icone: 'certificate-outline', destino: 'CertificadoAnvisa' },
];
