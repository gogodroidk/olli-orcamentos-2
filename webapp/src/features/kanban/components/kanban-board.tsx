import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useRef, useState } from "react";
import { COLUMN_ORDER, findColumnId, useKanbanStore } from "../utils/store";
import { createRestrictToContainer } from "../utils/restrict-to-container";
import BoardColumn from "./board-column";
import TaskCard from "./task-card";

/** Quadro (pipeline) de orçamentos do OLLI. Arraste os cards entre as colunas. */
export default function KanbanBoard() {
	const columns = useKanbanStore((s) => s.columns);
	const moveAcross = useKanbanStore((s) => s.moveAcross);
	const reorderInColumn = useKanbanStore((s) => s.reorderInColumn);

	const [activeId, setActiveId] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: fábrica estável após o mount
	const restrictToBoard = useCallback(
		createRestrictToContainer(() => containerRef.current),
		[],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const activeColumn = activeId ? findColumnId(columns, activeId) : null;
	const activeOrcamento =
		activeId && activeColumn ? (columns[activeColumn].find((o) => o.id === activeId) ?? null) : null;

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragOver = (event: DragOverEvent) => {
		const { active, over } = event;
		if (!over) return;
		// Move o card entre colunas ao vivo; no-op quando origem e destino são a mesma coluna.
		moveAcross(active.id as string, over.id as string);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (over) reorderInColumn(active.id as string, over.id as string);
		setActiveId(null);
	};

	const handleDragCancel = () => setActiveId(null);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			modifiers={[restrictToBoard]}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div
				ref={containerRef}
				className="flex w-full flex-col items-stretch gap-4 overflow-x-auto pb-4 md:flex-row md:items-start"
			>
				{COLUMN_ORDER.map((columnId) => (
					<BoardColumn key={columnId} columnId={columnId} orcamentos={columns[columnId]} />
				))}
			</div>

			<DragOverlay>
				{activeOrcamento && activeColumn ? (
					<TaskCard orcamento={activeOrcamento} columnId={activeColumn} overlay />
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
