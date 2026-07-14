/**
 * QUADRO (funil) DE ORÇAMENTOS — dado real, gravação real.
 *
 * 3 ESTADOS (regra 8): carregando (esqueleto) · ERRO com "Tentar de novo" · vazio de
 * verdade. Erro NUNCA vira quadro vazio: um funil vazio por engano faz o dono achar
 * que não tem venda nenhuma.
 *
 * Arrastar entre colunas grava. NÃO existe reordenar dentro da coluna: não há coluna
 * de ordem no banco, então uma ordem "arrastada" morreria no F5 — exatamente a
 * mentira que este quadro veio consertar. A ordem é a última movimentação (mais
 * recente no topo), e isso está escrito na tela.
 */
import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { AlertTriangle, Inbox, RotateCw, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { useQuadro } from "../hooks/useQuadro";
import { COLUNAS } from "../utils/colunas";
import { createRestrictToContainer } from "../utils/restrict-to-container";
import BoardColumn from "./board-column";
import { CartaoFantasma } from "./task-card";

const ESQUELETO_CARDS = ["e1", "e2", "e3"];

export default function KanbanBoard() {
	const { colunas, total, isLoading, isError, error, refetch, mover, emVoo, erro, limparErro } = useQuadro();

	const [arrastando, setArrastando] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	/** Prende o card arrastado dentro da área do quadro. Estável: lê o container por ref. */
	const restringirAoQuadro = useMemo(() => createRestrictToContainer(() => containerRef.current), []);

	const sensores = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor),
	);

	const emArraste = useMemo(() => {
		if (!arrastando) return null;
		for (const c of colunas) {
			const achado = c.cartoes.find((x) => x.id === arrastando);
			if (achado) return { cartao: achado, coluna: c.coluna };
		}
		return null;
	}, [arrastando, colunas]);

	const aoSoltar = (evento: DragEndEvent) => {
		setArrastando(null);
		const { active, over } = evento;
		if (!over) return;

		const origem = active.data.current?.colunaId as string | undefined;
		const destinoId = String(over.id);
		if (!origem || origem === destinoId) return; // soltou na própria coluna: nada muda.

		const destino = COLUNAS.find((c) => c.id === destinoId);
		if (!destino?.destino) return; // "Outros" não recebe (ver board-column).

		const cartao = colunas.flatMap((c) => c.cartoes).find((c) => c.id === String(active.id));
		if (cartao) mover(cartao, destino.destino);
	};

	if (isLoading) {
		return (
			<div className="flex w-full flex-col gap-4 md:flex-row">
				{COLUNAS.map((c) => (
					<div key={c.id} className="flex w-full flex-col md:w-[290px]">
						<div className="mb-3 flex items-center gap-2">
							<Skeleton className="size-2 rounded-full" />
							<Skeleton className="h-3.5 w-24" />
						</div>
						<div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2">
							{ESQUELETO_CARDS.map((k) => (
								<Skeleton key={`${c.id}-${k}`} className="h-[86px] w-full rounded-lg" />
							))}
						</div>
					</div>
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<Card className="flex flex-col items-center justify-center gap-4 p-12 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl bg-error/10">
					<AlertTriangle className="size-7 text-error" aria-hidden />
				</div>
				<div>
					<p className="text-base font-semibold text-text-primary">Não foi possível carregar o quadro</p>
					<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
						{(error as Error)?.message ?? "Erro ao consultar seus orçamentos."}
					</p>
				</div>
				<Button variant="outline" onClick={() => refetch()}>
					<RotateCw className="size-4" aria-hidden />
					Tentar de novo
				</Button>
			</Card>
		);
	}

	if (total === 0) {
		return (
			<Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
				<div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
					<Inbox className="size-7 text-text-disabled" aria-hidden />
				</div>
				<div>
					<p className="text-base font-semibold text-text-primary">Nenhum orçamento ainda</p>
					<p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
						Assim que você criar um orçamento, ele aparece aqui em Rascunho e você acompanha o funil até o Aprovado.
					</p>
				</div>
			</Card>
		);
	}

	return (
		<div>
			{erro && (
				<output
					aria-live="assertive"
					className="mb-4 flex w-full items-start gap-3 rounded-xl border border-error/30 bg-error/5 p-3 text-sm"
				>
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
					<span className="flex-1 text-text-primary">{erro}</span>
					<button
						type="button"
						onClick={limparErro}
						aria-label="Fechar aviso"
						className="shrink-0 rounded p-0.5 text-text-secondary hover:text-text-primary"
					>
						<X className="size-4" aria-hidden />
					</button>
				</output>
			)}

			<DndContext
				sensors={sensores}
				collisionDetection={closestCorners}
				modifiers={[restringirAoQuadro]}
				onDragStart={(e: DragStartEvent) => setArrastando(String(e.active.id))}
				onDragEnd={aoSoltar}
				onDragCancel={() => setArrastando(null)}
			>
				<div
					ref={containerRef}
					className="flex w-full flex-col items-stretch gap-4 overflow-x-auto pb-4 md:flex-row md:items-start"
				>
					{colunas.map((m) => (
						<BoardColumn key={m.coluna.id} montada={m} emVoo={emVoo} onMover={mover} />
					))}
				</div>

				<DragOverlay>
					{emArraste ? <CartaoFantasma cartao={emArraste.cartao} coluna={emArraste.coluna} /> : null}
				</DragOverlay>
			</DndContext>
		</div>
	);
}
