import { LazyMotion, MotionConfig, m } from "motion/react";
import { TOKENS_MOTION, TRANSICAO } from "./tokens";

type Props = {
	children: React.ReactNode;
};

/**
 * [Reduce bundle size by lazy-loading a subset of Motion's features](https://www.framer.com/motion/lazy-motion/)
 *
 * O `features` vai como FUNÇÃO (`() => import(...)`), não como valor. Essa é a
 * diferença entre o LazyMotion economizar peso ou ser enfeite: com o `domMax`
 * importado direto no topo (como era até 18/07), o pacote de features entra no
 * chunk de ENTRADA e o prestador baixa tudo antes de ver a primeira tela. Com a
 * função, ele baixa depois da pintura, em paralelo com os dados.
 *
 * Enquanto as features não chegam, os `m.*` renderizam no estado final, sem animar
 * — some a animação de entrada, nunca o conteúdo. É o comportamento documentado do
 * Motion para esse modo, e é o certo aqui: numa rede ruim o dono precisa VER a
 * tela, não a transição.
 *
 * ⚠️ Isso vale para quem NÃO declara `initial`. Um `m.div initial={{ opacity: 0 }}`
 * nasce invisível e só aparece quando as features chegam — se o chunk falhar, fica
 * invisível. Por isso as ENTRADAS de conteúdo do painel são CSS (`surgir`, em
 * tokens.css) e o Motion fica com saída e layout (que não escondem nada se faltarem).
 *
 * `MotionConfig reducedMotion="user"`: com "Reduzir movimento" ligado no sistema, o
 * Motion desliga transform e layout em TODO `m.*` do painel — a rede de segurança
 * de quem esquecer o `useMovimento`. A transição padrão é a do token `entrar`.
 */
export function MotionLazy({ children }: Props) {
	return (
		<LazyMotion strict features={() => import("./motion-features").then((mod) => mod.default)}>
			<MotionConfig reducedMotion={TOKENS_MOTION.politica.reducedMotion} transition={TRANSICAO.entrar}>
				<m.div style={{ height: "100%" }}> {children} </m.div>
			</MotionConfig>
		</LazyMotion>
	);
}
