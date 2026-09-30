import { useLayoutEffect, useRef } from "react";
import { avaliarCurva, TOKENS_MOTION } from "./tokens";
import { useMovimento } from "./use-movimento";

interface Props {
	/** O valor VERDADEIRO — é o que o leitor de tela lê e onde a contagem termina. */
	valor: number;
	/** De onde a contagem parte na montagem (ex.: o valor da última visita). Só sobe: menor que `valor`. */
	desde: number | null;
	formatar: (n: number) => string;
	className?: string;
}

/**
 * O NÚMERO EM REAIS QUE SOBE — o momento "dinheiro entrou".
 *
 * Conta de `desde` até `valor` em 700 ms (token `celebration`, curva `emphasized`),
 * e depois, se o valor mudar com a tela aberta (o recibo foi lançado no celular e o
 * painel releu ao voltar o foco), conta de onde estava até o novo.
 *
 * Três regras que não são estética:
 *  • SÓ SOBE. Valor que desce (estorno, virada do mês) troca direto — contar para
 *    baixo parece dinheiro indo embora em câmera lenta.
 *  • O leitor de tela lê o valor final, uma vez (`sr-only`); a contagem é `aria-hidden`.
 *  • "Reduzir movimento" → o número aparece pronto.
 *
 * Roda em requestAnimationFrame escrevendo `textContent` (nenhum re-render do React
 * por quadro) com a MESMA curva do token avaliada em `avaliarCurva` — sem trazer o
 * motor `animate()` do Motion para a primeira tela.
 */
export function ContadorDinheiro({ valor, desde, formatar, className }: Props) {
	const { reduzir } = useMovimento();
	const alvoRef = useRef<HTMLSpanElement>(null);
	// O que está NA TELA agora — a próxima contagem parte daqui, não do zero.
	const exibidoRef = useRef<number>(desde !== null && desde < valor && !reduzir ? desde : valor);
	const formatarRef = useRef(formatar);
	formatarRef.current = formatar;

	// Layout effect: o primeiro texto é escrito ANTES da pintura — nunca um quadro vazio
	// nem um quadro com o valor final antes de a contagem começar.
	useLayoutEffect(() => {
		const el = alvoRef.current;
		const de = exibidoRef.current;
		if (!el) return;
		el.textContent = formatarRef.current(de);
		if (reduzir || !(de < valor)) {
			exibidoRef.current = valor;
			el.textContent = formatarRef.current(valor);
			return;
		}
		const duracao = TOKENS_MOTION.duracao.celebration;
		let inicio: number | null = null;
		let quadro = 0;
		const passo = (agora: number) => {
			if (inicio === null) inicio = agora;
			const p = Math.min(1, (agora - inicio) / duracao);
			const atual = p >= 1 ? valor : de + (valor - de) * avaliarCurva(TOKENS_MOTION.curva.emphasized, p);
			exibidoRef.current = atual;
			el.textContent = formatarRef.current(atual);
			if (p < 1) quadro = requestAnimationFrame(passo);
		};
		quadro = requestAnimationFrame(passo);
		// Valor novo no meio da contagem: a próxima parte do número que está na tela
		// (`exibidoRef`), sem pular de volta.
		return () => cancelAnimationFrame(quadro);
	}, [valor, reduzir]);

	return (
		<>
			<span className="sr-only">{formatar(valor)}</span>
			{/* Sem filhos React de propósito: o texto é do efeito (senão o React e o rAF
			    disputariam o mesmo nó de texto). */}
			<span ref={alvoRef} aria-hidden="true" className={className} />
		</>
	);
}
