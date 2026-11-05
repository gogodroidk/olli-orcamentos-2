import KanbanBoard from "@/features/kanban/components/kanban-board";

/** Quadro comercial: o funil de orçamentos, com os dados e a gravação de verdade. */
export default function QuadroPage() {
	return (
		<div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
			<h1 className="text-2xl font-bold tracking-tight text-text-primary">Quadro</h1>
			<p className="mt-1 max-w-2xl text-sm text-text-secondary">
				O funil dos seus orçamentos e serviços. Em cada card,{" "}
				<span className="font-medium text-text-primary">Mover</span> troca o estágio — no celular e no computador, sem
				arrastar. A alça continua lá para quem preferir soltar na coluna. A mudança é salva na hora e o aplicativo do
				celular passa a ver o novo status. Dentro de cada coluna, os mais recém-movimentados vêm primeiro. Serviços com
				uma OS concluída aparecem em Finalizados e deixam de contar como dinheiro parado.
			</p>
			<div className="mt-6">
				<KanbanBoard />
			</div>
		</div>
	);
}
