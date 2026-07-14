import KanbanBoard from "@/features/kanban/components/kanban-board";

/** Quadro comercial: funil de orçamentos com arrastar-e-soltar. */
export default function QuadroPage() {
	return (
		<div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
			<h1 className="text-2xl font-bold text-text-primary">Quadro</h1>
			<p className="mt-1 text-sm text-text-secondary">
				Acompanhe seus orçamentos pelo funil — arraste os cards entre as colunas.
			</p>
			<div className="mt-6">
				<KanbanBoard />
			</div>
		</div>
	);
}
