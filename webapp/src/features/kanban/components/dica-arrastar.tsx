/**
 * A LINHA QUE ENSINA O GESTO. Aparece uma vez (ver `useDicaDeArraste`), some sozinha.
 *
 * Ela mostra os DOIS ícones de verdade do card — a alça e o menu — porque o texto
 * "use a alça" só ajuda quem consegue ligar a palavra ao desenho que está na tela.
 * Os ícones são decorativos (`aria-hidden`); o texto lido em voz alta funciona sem
 * eles, e quem usa leitor de tela recebe as instruções completas do arraste pelo
 * próprio dnd-kit (ver `INSTRUCOES_LEITOR_DE_TELA` em `kanban-board.tsx`).
 *
 * Sem `aria-live`: isto é uma dica, não um acontecimento. Anunciar por cima do que
 * o usuário está fazendo seria interromper para dizer algo que ele já vai ouvir ao
 * chegar no card.
 *
 * Movimento: só `opacity`, e a transição desliga em `prefers-reduced-motion`.
 */
import { GripVertical, Lightbulb, MoreVertical, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils";

/** O ícone como ele aparece no card, para o olho fazer a ligação. */
function Tecla({ children }: { children: ReactNode }) {
	return (
		<span
			aria-hidden
			className="mx-0.5 inline-flex size-5 translate-y-1 items-center justify-center rounded border border-border bg-background text-text-secondary"
		>
			{children}
		</span>
	);
}

export default function DicaDeArraste({ saindo, aoFechar }: { saindo: boolean; aoFechar: () => void }) {
	return (
		<div
			className={cn(
				"mb-3 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 p-3",
				"transition-opacity duration-200 motion-reduce:transition-none",
				saindo ? "opacity-0" : "opacity-100",
			)}
		>
			<Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />

			<p className="flex-1 text-sm leading-relaxed text-text-primary">
				<span className="font-semibold">Dá para arrastar.</span> Pegue o card pela alça
				<Tecla>
					<GripVertical className="size-3" />
				</Tecla>
				<span className="sr-only">(o ícone de arrastar, no canto esquerdo do card)</span> e solte em outra coluna. Sem
				arrastar — no celular ou pelo teclado — abra o menu do card
				<Tecla>
					<MoreVertical className="size-3" />
				</Tecla>
				<span className="sr-only">(três pontinhos, no canto direito do card)</span> e use{" "}
				<span className="font-medium">Mover para</span>.
			</p>

			<button
				type="button"
				onClick={aoFechar}
				title="Fechar dica"
				aria-label="Fechar dica"
				className="-m-1 shrink-0 rounded p-1 text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				<X className="size-4" aria-hidden />
			</button>
		</div>
	);
}
