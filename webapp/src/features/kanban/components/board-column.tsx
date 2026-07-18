/**
 * A COLUNA — cabeçalho com CONTAGEM e SOMA em R$, e a pilha de cards.
 *
 * O cabeçalho nunca inventa dinheiro: se algum card da coluna está sem valor, a
 * soma aparece com um "+ ?" em vez de fingir que a coluna vale exatamente aquilo.
 */
import { useDroppable } from "@dnd-kit/core";
import type { StatusOrcamento } from "@dominio";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils";
import { BRL, type Cartao, type ColunaMontada } from "../utils/colunas";
import TaskCard from "./task-card";

type Props = {
	montada: ColunaMontada;
	emVoo: ReadonlySet<string>;
	onMover: (cartao: Cartao, novoStatus: StatusOrcamento) => void;
	onAbrir: (cartao: Cartao) => void;
};

export default function BoardColumn({ montada, emVoo, onMover, onAbrir }: Props) {
	const { coluna, cartoes, soma, temSemValor } = montada;

	// "Outros" (status desconhecido) não tem status canônico para gravar — então não
	// aceita drop. Ela existe só para que NENHUM orçamento suma do quadro.
	const podeReceber = coluna.destino !== null;
	const { setNodeRef, isOver } = useDroppable({ id: coluna.id, disabled: !podeReceber });

	return (
		<section aria-label={coluna.titulo} className="flex w-full shrink-0 flex-col md:w-[290px]">
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className={cn("size-2 shrink-0 rounded-full", coluna.ponto)} aria-hidden />
					<span className="truncate text-sm font-semibold text-text-primary">{coluna.titulo}</span>
					<Badge variant="secondary" className="pointer-events-none shrink-0 tabular-nums">
						{cartoes.length}
					</Badge>
				</div>
				<span className="shrink-0 text-xs font-medium tabular-nums text-text-secondary">
					{BRL.format(soma)}
					{temSemValor && (
						<>
							<span aria-hidden> + ?</span>
							<span className="sr-only">, mais orçamentos sem valor informado</span>
						</>
					)}
				</span>
			</div>

			<div
				ref={setNodeRef}
				className={cn(
					"flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/40 p-2",
					// Motion funcional (regra 9): a cor só muda para dizer "pode soltar aqui".
					"transition-colors",
					isOver && podeReceber && "border-primary/50 bg-primary/5",
				)}
			>
				{cartoes.map((c) => (
					<TaskCard
						key={c.id}
						cartao={c}
						coluna={coluna}
						salvando={emVoo.has(c.id)}
						onMover={onMover}
						onAbrir={onAbrir}
					/>
				))}

				{cartoes.length === 0 && (
					<div className="grid flex-1 place-items-center px-2 py-6 text-center text-xs text-text-secondary">
						Nenhum orçamento aqui
					</div>
				)}
			</div>
		</section>
	);
}
