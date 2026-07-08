import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * SignatureProvider — assinatura/aceite FORMAL de documentos com trilha
 * (contrato, termo, autorização, PMOC com múltiplos signatários). NÃO é o
 * simples "aprovar orçamento" do portal do cliente: esse aceite leve já é
 * tratado pela Onda 3 no link público (`src/services/clienteLink.ts` →
 * `trilhaDoLink`, com visualizado/aprovado/recusado) e NÃO precisa desta porta.
 *
 * Provider escolhido: Documenso (open-source, campos de assinatura, webhooks,
 * certificado) para documentos juridicamente relevantes / múltiplos signatários
 * — ver backlog SIGNATURE. Antes disso, assinatura interna simples (imagem de
 * assinatura no recibo) cobre o caso leve.
 *
 * Impl de-facto HOJE:
 *   - aceite leve do cliente (aprovar/recusar + trilha): `clienteLink.ts` (Onda 3);
 *   - assinatura como IMAGEM no recibo/orçamento: flags `exibirAssinatura` /
 *     `solicitarAssinaturaCliente` (ver Recibo/Orcamento em src/types e
 *     `src/screens/EmitirReciboScreen.tsx`, da Onda 3).
 * Documenso NÃO deve ser usado para o botão "aprovar orçamento" — só quando
 * houver contrato/termo formal.
 *
 * Onda de fiação: quando entrar contratos (Onda 9/gestão em diante) e, com
 * força, no módulo PMOC (Onda 11) — plano/contrato exigem assinatura de
 * responsável técnico. Nunca antes de existir o documento formal para assinar.
 */
export interface SignatureProvider extends PortaDisponivel {
  /**
   * Envia um documento para assinatura e devolve como acompanhá-lo. Os
   * signatários assinam pelos links devolvidos; o status evolui por webhook.
   */
  solicitarAssinatura(input: SolicitarAssinaturaInput): Promise<ResultadoPorta<PedidoAssinatura>>;

  /** Estado atual do pedido de assinatura (fonte da verdade = provider + webhook). */
  consultarStatus(pedidoId: string): Promise<ResultadoPorta<PedidoAssinatura>>;
}

export interface Signatario {
  nome: string;
  email: string;
  /** Papel para exibição (ex.: 'cliente', 'responsável técnico'). */
  papel?: string;
}

export interface SolicitarAssinaturaInput {
  /** URL do documento a assinar (ex.: PDF já no Storage). */
  documentoUrl: string;
  titulo: string;
  signatarios: Signatario[];
}

export type StatusAssinatura = 'pendente' | 'parcial' | 'concluida' | 'recusada' | 'expirada';

export interface PedidoAssinatura {
  id: string;
  status: StatusAssinatura;
  /** Links de assinatura por signatário (mesma ordem de `signatarios`). */
  linksAssinatura: string[];
  /** URL do documento assinado + certificado, quando `status === 'concluida'`. */
  documentoAssinadoUrl?: string;
}
