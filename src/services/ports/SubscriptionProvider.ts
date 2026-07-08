import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * SubscriptionProvider — ASSINATURA DO SAAS OLLI (o prestador paga o OLLI). É
 * DIFERENTE de PaymentProvider (cobrança do prestador ao cliente dele). Aqui o
 * "cliente" é o próprio usuário do app assinando Pro/Empresa.
 *
 * Provider escolhido: Stripe (Checkout mensal/anual + parcelado 12x, e Portal do
 * cliente). O 12x do Pro é `mode=payment` que grava acesso de 12 meses via
 * webhook (D-03: webhook Stripe é a FONTE DA VERDADE do plano). Segredos (chave
 * secreta, webhook signing) vivem no worker; o app só recebe a URL de checkout.
 *
 * Impl de-facto HOJE (já em produção, Onda 1 concluída):
 *   - abrir checkout/portal: `src/screens/PlanosScreen.tsx` (`abrirUrlPagamento`
 *     → `POST ${PAGAMENTOS_URL}/stripe/checkout` | `/stripe/portal`);
 *   - rotas do worker: `worker/src/stripe.js`;
 *   - LER o plano efetivo (fonte de verdade = tabela `assinaturas`, gravada pelo
 *     webhook): `src/services/planos.ts` (`getPlanoAtual`).
 * Esta porta é a interface que UNIFICA "abrir checkout/portal" + "ler plano"
 * quando formos extrair um adaptador Stripe explícito.
 *
 * Onda de fiação: já operante como impl concreta; formalizar o adaptador é
 * refino da Onda 5/Web (baixa prioridade — só troca o call-site por injeção).
 */
export interface SubscriptionProvider extends PortaDisponivel {
  /**
   * Devolve a URL do Stripe Checkout para o `plano` (ex.: 'pro_mensal',
   * 'pro_anual', 'pro_12x', 'empresa_mensal', 'empresa_anual'). A UI abre a URL;
   * o webhook depois atualiza o plano no banco (nunca o app).
   */
  iniciarCheckout(plano: PlanoCheckout): Promise<ResultadoPorta<{ url: string }>>;

  /** URL do Portal do cliente Stripe (gerenciar/cancelar assinatura). */
  abrirPortal(): Promise<ResultadoPorta<{ url: string }>>;

  /**
   * Plano efetivo do usuário logado. Fonte de verdade = tabela `assinaturas`
   * (gravada pelo webhook). Espelha o retorno de `planos.ts.getPlanoAtual`.
   */
  planoAtual(): Promise<ResultadoPorta<AssinaturaAtual>>;
}

/** Identificador do produto/período que o worker Stripe aceita em /stripe/checkout. */
export type PlanoCheckout =
  | 'pro_mensal'
  | 'pro_anual'
  | 'pro_12x'
  | 'empresa_mensal'
  | 'empresa_anual';

export interface AssinaturaAtual {
  /** Alinhado a PlanoId de `src/services/planos.ts`. */
  plano: 'gratis' | 'pro' | 'empresa';
  /** Status bruto do Stripe (active/trialing/past_due/canceled…), quando houver. */
  status?: string;
  /** Fim do período vigente (ISO), quando houver. */
  validoAte?: string;
}
