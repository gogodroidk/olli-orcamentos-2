import type { Centavos, Moeda, PortaDisponivel, ResultadoPorta } from './comum';

/**
 * PaymentProvider — COBRANÇA DO PRESTADOR AO CLIENTE FINAL dele (PIX, boleto,
 * cartão, link de pagamento). NÃO é a assinatura do SaaS (essa é
 * SubscriptionProvider). O prestador do OLLI cobra o cliente dele por um
 * serviço/orçamento aprovado; o OLLI só orquestra a cobrança atrás desta porta.
 *
 * Provider escolhido (candidato): Asaas (PIX/boleto/cartão/recorrência, BR),
 * ver docs/INTEGRATION_BACKLOG.md item PAY. O segredo do Asaas fica SÓ no
 * worker Cloudflare — jamais no bundle do app.
 *
 * Impl de-facto HOJE: NENHUMA cobrança online do cliente final existe ainda. O
 * fluxo atual é registrar pagamento manual + emitir recibo — ver
 * `src/services/pagamentos.ts` (`registrarPagamento`), que a Onda 3 mantém. Esta
 * porta modela o passo SEGUINTE (cobrar de verdade), não o registro manual.
 *
 * Onda de fiação: Onda 9 (Financeiro operacional) — depois de contas a receber.
 * Fluxo obrigatório do backlog: sandbox → idempotência → fila → verificação de
 * webhook → conciliação → estorno/chargeback. Nunca implementar sem tudo isso.
 */
export interface PaymentProvider extends PortaDisponivel {
  /**
   * Cria uma cobrança para o cliente final e devolve como pagá-la (URL do link
   * de pagamento / copia-e-cola PIX / linha digitável do boleto). `idempotencyKey`
   * é obrigatória: reenviar a mesma chave NÃO gera cobrança duplicada.
   */
  criarCobranca(input: CriarCobrancaInput): Promise<ResultadoPorta<Cobranca>>;

  /** Estado atual de uma cobrança (a fonte da verdade é o provider + webhook). */
  consultarCobranca(cobrancaId: string): Promise<ResultadoPorta<Cobranca>>;

  /** Estorna (total ou parcial) uma cobrança já paga. `valor` ausente = total. */
  estornarCobranca(cobrancaId: string, valor?: Centavos): Promise<ResultadoPorta<Cobranca>>;
}

export type FormaCobranca = 'pix' | 'boleto' | 'cartao' | 'link';

export type StatusCobranca =
  | 'pendente'
  | 'pago'
  | 'vencido'
  | 'estornado'
  | 'cancelado'
  | 'falhou';

export interface CriarCobrancaInput {
  /** Id do orçamento (referência de domínio — ver Orcamento em src/types). */
  orcamentoId: string;
  valor: Centavos;
  moeda: Moeda;
  forma: FormaCobranca;
  /** Nome do cliente final para exibição na cobrança. */
  clienteNome: string;
  /** Descrição curta do que está sendo cobrado (aparece para o pagador). */
  descricao?: string;
  /** Vencimento (ISO 8601) para boleto/PIX com prazo. */
  vencimento?: string;
  /** Impede duplicidade em retentativa (padrão obrigatório do backlog). */
  idempotencyKey: string;
}

export interface Cobranca {
  id: string;
  status: StatusCobranca;
  valor: Centavos;
  moeda: Moeda;
  forma: FormaCobranca;
  /** URL para o cliente pagar (link/checkout), quando aplicável. */
  urlPagamento?: string;
  /** Copia-e-cola do PIX, quando forma = 'pix'. */
  pixCopiaECola?: string;
  /** Linha digitável do boleto, quando forma = 'boleto'. */
  boletoLinhaDigitavel?: string;
  criadoEm: string;
  pagoEm?: string;
}
