/**
 * OS PLANOS — nome, tagline e benefícios vêm da TABELA ÚNICA `src/services/planosBase.ts`
 * (a mesma do app, da landing e dos e-mails). O PREÇO não mora aqui: vem de `@precos`
 * (a mesma fonte da landing, conferida contra a Stripe live). Ver `precos.ts`.
 *
 * Até 01/10/2026 este arquivo era uma CÓPIA à mão do `PLANOS_BASE` da tela do app —
 * e cópia de copy comercial é exatamente como este projeto já anunciou recurso que não
 * existia e limite que não valia. Agora não há o que copiar: o Grátis ilimitado, o
 * selo "Feito com OLLI" e o que o Pro/Empresa liberam são lidos de uma fonte só, cuja
 * guarda de coerência com `entitlements.ts` roda no import.
 */
import type { PlanoId } from "./tipos";

export {
	type BulletPlano,
	FRASE_GRATIS,
	NOTA_SELO_GRATIS,
	type PlanoBase,
	PLANOS_BASE,
	RECURSOS_GRATIS,
} from "../../../../../src/services/planosBase";

/** Nome de exibição do plano. */
export function nomeDoPlano(p: PlanoId): string {
	return p === "empresa" ? "Empresa" : p === "pro" ? "Pro" : "Grátis";
}
