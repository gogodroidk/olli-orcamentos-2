/**
 * PONTE DE PREÇO — reexporta a FONTE ÚNICA de preço (`web/src/data/planos.ts`, a mesma
 * da landing, conferida contra a Stripe live) para o painel, e mapeia plano → preço.
 *
 * Nenhum valor de R$ é digitado nesta pasta: tudo vem daqui. Preço errado é a copy mais
 * cara de errar — para menos é prejuízo, para mais é propaganda enganosa (CDC art. 37) —
 * então mora num lugar só. Se o número mudar, muda em `@precos` e todo o resto acompanha.
 */
import { PRECO_EMPRESA, PRECO_PRO } from "@precos";
import type { PlanoId } from "./tipos";

export { DESCONTO_ANUAL_ROTULO, precoNoPeriodo, reais } from "@precos";
export type { PeriodoCobranca } from "@precos";

/** O preço derivado (mensal, anual/mês, total do ano e economia) — usado nos cartões. */
export type PrecoDerivado = typeof PRECO_PRO;

/** O preço de um plano PAGO. `null` no Grátis (não tem período nem cobrança). */
export function precoDoPlano(id: PlanoId): PrecoDerivado | null {
	if (id === "pro") return PRECO_PRO;
	if (id === "empresa") return PRECO_EMPRESA;
	return null;
}
