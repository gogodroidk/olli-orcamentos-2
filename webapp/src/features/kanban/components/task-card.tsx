import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { cn } from "@/utils";
import type { ColumnId, Orcamento } from "../utils/store";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Faixa de cor à esquerda do card conforme o estágio do funil (marca OLLI). */
const ACCENT: Record<ColumnId, string> = {
	rascunho: "border-l-muted-foreground/40",
	enviado: "border-l-info",
	aprovado: "border-l-success",
	recusado: "border-l-error",
};

type Props = {
	orcamento: Orcamento;
	columnId: ColumnId;
	/** true quando renderizado dentro do DragOverlay (o card "fantasma" que segue o cursor). */
	overlay?: boolean;
};

export default function TaskCard({ orcamento, columnId, overlay }: Props) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: orcamento.id,
		data: { type: "item", columnId },
	});

	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={cn(
				"touch-none select-none rounded-lg border border-l-4 bg-card p-3 shadow-sm",
				"cursor-grab transition-shadow hover:shadow-md active:cursor-grabbing",
				ACCENT[columnId],
				isDragging && !overlay && "opacity-40",
				overlay && "shadow-lg",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-xs font-semibold text-text-secondary">{orcamento.numero}</span>
				<span className="text-sm font-bold text-text-primary">{BRL.format(orcamento.valor)}</span>
			</div>
			<div className="mt-1.5 line-clamp-1 text-sm font-medium text-text-primary">{orcamento.cliente}</div>
		</div>
	);
}
