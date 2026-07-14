import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/ui/badge";
import { cn } from "@/utils";
import { type ColumnId, COLUMN_TITLES, type Orcamento } from "../utils/store";
import TaskCard from "./task-card";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Bolinha de status no cabeçalho da coluna (marca OLLI). */
const HEADER_DOT: Record<ColumnId, string> = {
	rascunho: "bg-muted-foreground/50",
	enviado: "bg-info",
	aprovado: "bg-success",
	recusado: "bg-error",
};

type Props = {
	columnId: ColumnId;
	orcamentos: Orcamento[];
};

export default function BoardColumn({ columnId, orcamentos }: Props) {
	const { setNodeRef, isOver } = useDroppable({ id: columnId, data: { type: "column" } });
	const total = orcamentos.reduce((sum, o) => sum + o.valor, 0);

	return (
		<div className="flex w-full shrink-0 flex-col md:w-[300px]">
			<div className="mb-3 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className={cn("size-2 rounded-full", HEADER_DOT[columnId])} />
					<span className="text-sm font-semibold text-text-primary">{COLUMN_TITLES[columnId]}</span>
					<Badge variant="secondary" className="pointer-events-none">
						{orcamentos.length}
					</Badge>
				</div>
				<span className="text-xs font-medium tabular-nums text-text-secondary">{BRL.format(total)}</span>
			</div>

			<div
				ref={setNodeRef}
				className={cn(
					"flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/40 p-2 transition-colors",
					isOver && "border-primary/40 bg-primary/5",
				)}
			>
				<SortableContext items={orcamentos.map((o) => o.id)} strategy={verticalListSortingStrategy}>
					{orcamentos.map((o) => (
						<TaskCard key={o.id} orcamento={o} columnId={columnId} />
					))}
				</SortableContext>

				{orcamentos.length === 0 && (
					<div className="grid flex-1 place-items-center py-6 text-xs text-text-secondary">Nenhum orçamento</div>
				)}
			</div>
		</div>
	);
}
