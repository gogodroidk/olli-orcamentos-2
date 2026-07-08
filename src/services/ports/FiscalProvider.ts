import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * FiscalProvider — emissão de documento FISCAL (NFS-e para serviço; NF-e quando
 * aplicável), consulta, cancelamento e download do XML. Interface genérica de
 * propósito: a regra fiscal varia por município, então a chamada nunca pode
 * ficar espalhada nas telas (pesquisa §5.2 Nuvem Fiscal).
 *
 * Provider escolhido (candidato): Nuvem Fiscal, com rollout POR MUNICÍPIO e
 * ambiente de homologação primeiro. Certificados e segredos SÓ no backend. Ver
 * backlog FISCAL.
 *
 * Impl de-facto HOJE: NENHUMA. O OLLI NÃO emite nota — e não deve, até o
 * financeiro e o status estarem sólidos (pesquisa §15: "emitir nota antes de
 * financeiro e status estarem sólidos" é explicitamente proibido). O recibo
 * atual (`src/services/pagamentos.ts` + `EmitirReciboScreen`, Onda 3) é
 * comprovante comercial, NÃO documento fiscal — não confundir os dois.
 *
 * Onda de fiação: depois da Onda 9 (Financeiro operacional). Requisito legal do
 * PMOC (Onda 11) pode antecipar a necessidade, mas nunca antes do financeiro.
 */
export interface FiscalProvider extends PortaDisponivel {
  /** Emite uma NFS-e a partir dos dados do serviço. */
  emitirNotaServico(input: NotaServicoInput): Promise<ResultadoPorta<DocumentoFiscal>>;

  /** Cancela um documento fiscal já emitido, com justificativa. */
  cancelar(documentoId: string, motivo: string): Promise<ResultadoPorta<DocumentoFiscal>>;

  /** Estado atual do documento (processando/autorizado/rejeitado/cancelado). */
  consultarStatus(documentoId: string): Promise<ResultadoPorta<DocumentoFiscal>>;
}

export interface NotaServicoInput {
  /** Referência ao orçamento/serviço de origem (ver Orcamento em src/types). */
  orcamentoId: string;
  /** Valor total do serviço em centavos. */
  valorTotalCentavos: number;
  descricaoServico: string;
  /** Documento do tomador (CPF/CNPJ) — vai só ao backend fiscal, nunca a logs. */
  tomadorDocumento?: string;
  tomadorNome?: string;
  /** Código do serviço municipal, quando o município exigir. */
  codigoServicoMunicipal?: string;
}

export type StatusFiscal = 'processando' | 'autorizado' | 'rejeitado' | 'cancelado';

export interface DocumentoFiscal {
  id: string;
  status: StatusFiscal;
  /** Número da nota, quando autorizada. */
  numero?: string;
  /** URL do XML autorizado (no Storage/provider), quando houver. */
  xmlUrl?: string;
  /** URL do PDF/DANFE, quando houver. */
  pdfUrl?: string;
  /** Motivo da rejeição, quando `status === 'rejeitado'`. */
  motivoRejeicao?: string;
}
