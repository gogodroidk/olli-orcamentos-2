import { useCallback, useRef, useState } from "react";

/**
 * Avisa quando o elemento encosta na tela — e nunca mais desliga.
 *
 * Serve para adiar download caro (gráfico, mapa) até existir alguém olhando. No
 * celular do prestador o donut de status fica MUITO abaixo da dobra: sem isto,
 * abrir o Início baixava a biblioteca de gráficos inteira (~157 KB comprimidos)
 * para desenhar algo que o dono talvez nem role até ver.
 *
 * "Uma vez" é de propósito: depois de visível, continua visível para sempre. Um
 * gráfico que se desmonta ao rolar para fora e recarrega ao voltar pisca e gasta
 * dados de novo.
 *
 * `margem` adianta o gatilho — o download começa um pouco ANTES de entrar na tela,
 * então na hora em que o dono chega o gráfico já está lá.
 *
 * POR QUE REF DE CALLBACK, E NÃO useRef + useEffect. A versão anterior lia
 * `ref.current` dentro de um efeito com deps `[visivel, margem]`. Quando o
 * elemento observado só entra na árvore depois (carregamento de dados, render
 * condicional), no momento em que o efeito rodou `ref.current` ainda era null: o
 * efeito saía pelo `return`, nenhuma das deps mudava depois, e ele NUNCA rodava
 * de novo — o observador jamais era ligado e o gráfico não aparecia nunca. A ref
 * de callback resolve na raiz porque o React a chama no instante exato em que o
 * nó monta e desmonta, sem depender de ordem de efeito.
 */
export function useVisivelUmaVez<T extends HTMLElement>(margem = "300px") {
	// Navegador sem IntersectionObserver (WebView antigo) começa VISÍVEL: o certo,
	// se não dá para saber, é mostrar o conteúdo. Esconder o gráfico por falta de
	// uma API de otimização seria trocar peso por dado que some.
	const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === "undefined");
	const observadorRef = useRef<IntersectionObserver | null>(null);

	const ref = useCallback(
		(no: T | null) => {
			// Desliga o observador anterior antes de qualquer coisa: sem isto, um
			// remount deixaria observadores acumulados vigiando nós mortos.
			observadorRef.current?.disconnect();
			observadorRef.current = null;

			if (!no || typeof IntersectionObserver === "undefined") return;

			const observador = new IntersectionObserver(
				(entradas) => {
					if (entradas.some((e) => e.isIntersecting)) {
						setVisivel(true);
						observador.disconnect();
						observadorRef.current = null;
					}
				},
				{ rootMargin: margem },
			);
			observador.observe(no);
			observadorRef.current = observador;
		},
		[margem],
	);

	return { ref, visivel };
}
