import { useReducedMotion } from "motion/react";
import { TRANSICAO } from "./tokens";

type NomeTransicao = keyof typeof TRANSICAO;

/**
 * A porta de TODA animação por JS do painel.
 *
 * Devolve `reduzir` (o "Reduzir movimento" do sistema) e `t(nome)`, a transição do
 * token — que vira `{ duration: 0 }` quando o usuário pediu menos movimento. O
 * `MotionConfig reducedMotion="user"` (motion-lazy.tsx) já corta transform/layout;
 * este hook corta o resto (opacidade, contador), para o estado final aparecer direto.
 *
 * `scripts/teste-motion-painel.ts` exige que todo arquivo que anima com o Motion
 * passe por aqui (ou por `useReducedMotion`) — esquecer não compila no CI.
 */
export function useMovimento() {
	const reduzir = useReducedMotion() ?? false;
	const t = <N extends NomeTransicao>(nome: N) => (reduzir ? { duration: 0 } : TRANSICAO[nome]);
	return { reduzir, t };
}
