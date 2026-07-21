/**
 * MEDE O SCROLL HORIZONTAL do quadro — para dizer, na tela, que ainda há coluna
 * fora do campo de visão.
 *
 * O `TableOverflowHint` das listas (`@/olli/components/TableOverflowHint`) é uma
 * sombra SEMPRE ligada: numa tabela que quase sempre estoura a largura, ele acerta.
 * Aqui não serve como está — na maior parte dos notebooks as 5 colunas do funil
 * CABEM, e uma sombra permanente na borda direita passaria a mentir ("tem mais
 * coluna ali") todo santo dia. Então medimos de verdade e só mostramos o sinal
 * quando ele é verdade, dos dois lados.
 *
 * Além da sombra, devolvemos `rolar`: a sombra diz que existe algo à direita, o
 * botão deixa CHEGAR lá sem trackpad de rolagem horizontal (que muito mouse comum
 * não tem) e sem precisar caçar a barra de rolagem.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE `ref` É UMA FUNÇÃO, E NÃO UM `RefObject`
 * ═══════════════════════════════════════════════════════════════════════════════
 * O quadro só existe DEPOIS do carregamento: no primeiro render a tela é esqueleto e
 * o scroller nem está no DOM. Com um `useRef` comum, o efeito rodaria uma vez (com
 * `current` nulo), não teria motivo para rodar de novo quando o quadro de verdade
 * aparecesse — e o medidor ficaria calado para sempre, escondendo colunas em silêncio.
 * A ref de callback avisa a montagem, e é ela que dispara a primeira medição.
 */
import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";

/** Folga em px: abaixo disso é arredondamento de layout, não conteúdo escondido. */
const FOLGA = 4;

export interface OverflowLateral<T extends HTMLElement> {
	/** Ref de callback para o elemento que rola. */
	ref: RefCallback<T>;
	/** O elemento medido, para quem precisa dele fora do React (o modifier do dnd-kit). */
	obterElemento: () => T | null;
	/** Há conteúdo escondido à ESQUERDA (já rolou um pouco). */
	antes: boolean;
	/** Há conteúdo escondido à DIREITA. */
	depois: boolean;
	rolar: (direcao: -1 | 1) => void;
}

/**
 * @param recalcularQuando qualquer valor que mude junto com a LARGURA do conteúdo
 * (o número de colunas, por exemplo). O `ResizeObserver` enxerga o elemento mudar de
 * tamanho, mas não o `scrollWidth` crescer porque uma 6ª coluna nasceu dentro dele.
 */
export function useOverflowLateral<T extends HTMLElement>(recalcularQuando: unknown): OverflowLateral<T> {
	const alvo = useRef<T | null>(null);
	const [montado, setMontado] = useState(false);
	const [antes, setAntes] = useState(false);
	const [depois, setDepois] = useState(false);

	const ref = useCallback<RefCallback<T>>((no) => {
		alvo.current = no;
		setMontado(no !== null);
	}, []);

	const medir = useCallback(() => {
		const el = alvo.current;
		if (!el) return;
		const maximo = el.scrollWidth - el.clientWidth;
		setAntes(el.scrollLeft > FOLGA);
		setDepois(maximo > FOLGA && el.scrollLeft < maximo - FOLGA);
	}, []);

	// `recalcularQuando` é dependência de GATILHO, não de leitura: o efeito reage à
	// mudança dela (nasceu uma coluna, o `scrollWidth` cresceu) sem usar o valor. Sem
	// ela, a 6ª coluna "Outros" apareceria e a seta de rolagem continuaria escondida.
	// biome-ignore lint/correctness/useExhaustiveDependencies: gatilho de remedição, ver acima.
	useEffect(() => {
		const el = alvo.current;
		if (!montado || !el) {
			// Quadro fora da tela (carregando, erro, vazio): sem sinal nenhum na borda.
			setAntes(false);
			setDepois(false);
			return;
		}

		medir();
		el.addEventListener("scroll", medir, { passive: true });
		window.addEventListener("resize", medir);

		// Só observa o próprio scroller: ele muda de largura junto com a janela e com o
		// menu lateral (que anima `padding-left` por 300ms — sem observer, a sombra
		// ficaria congelada no estado de antes da animação).
		const observador = typeof ResizeObserver === "function" ? new ResizeObserver(() => medir()) : null;
		observador?.observe(el);

		return () => {
			el.removeEventListener("scroll", medir);
			window.removeEventListener("resize", medir);
			observador?.disconnect();
		};
	}, [medir, montado, recalcularQuando]);

	/**
	 * SALTO INSTANTÂNEO, de propósito. A primeira versão usava
	 * `scrollBy({behavior:"smooth"})` e o botão NÃO FAZIA NADA — medido neste próprio
	 * navegador: com `behavior:"smooth"` o `scrollLeft` ficava em 0, com `"auto"` ia até
	 * o fim. A rolagem suave (tanto a do JS quanto a do CSS `scroll-behavior`) é
	 * ignorada em ambientes com animação desligada, e um botão que falha em silêncio é
	 * pior do que um botão sem enfeite. A atribuição direta sempre chega ao destino — e
	 * de quebra já respeita `prefers-reduced-motion`, porque não anima nada.
	 */
	const rolar = useCallback(
		(direcao: -1 | 1) => {
			const el = alvo.current;
			if (!el) return;
			// ~60% da largura visível por clique: revela a próxima coluna sem perder de vista
			// a que o usuário estava olhando.
			const passo = Math.max(220, Math.round(el.clientWidth * 0.6));
			const maximo = el.scrollWidth - el.clientWidth;
			el.scrollLeft = Math.max(0, Math.min(maximo, el.scrollLeft + direcao * passo));
			// Remede NA HORA em vez de esperar o evento `scroll`: rolagem feita por código
			// não dispara `scroll` em todo ambiente (medido aqui — atribuir `scrollLeft` não
			// disparou nada). Sem esta linha, o usuário chegaria ao fim do quadro com a seta
			// da direita ainda na tela, apontando para coluna nenhuma.
			medir();
		},
		[medir],
	);

	const obterElemento = useCallback(() => alvo.current, []);

	return { ref, obterElemento, antes, depois, rolar };
}
