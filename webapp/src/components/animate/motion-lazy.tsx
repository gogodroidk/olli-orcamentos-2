import { LazyMotion, m } from "motion/react";

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
 */
export function MotionLazy({ children }: Props) {
	return (
		<LazyMotion strict features={() => import("./motion-features").then((mod) => mod.default)}>
			<m.div style={{ height: "100%" }}> {children} </m.div>
		</LazyMotion>
	);
}
