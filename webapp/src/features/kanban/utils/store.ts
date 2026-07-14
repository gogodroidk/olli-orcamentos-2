import { arrayMove } from "@dnd-kit/sortable";
import { create } from "zustand";

/** Um orçamento (card do funil). Dados de exemplo em memória — sem Supabase por ora. */
export type Orcamento = {
	id: string;
	numero: string;
	cliente: string;
	valor: number;
};

/** Colunas do pipeline comercial do OLLI. */
export type ColumnId = "rascunho" | "enviado" | "aprovado" | "recusado";

export const COLUMN_ORDER: ColumnId[] = ["rascunho", "enviado", "aprovado", "recusado"];

export const COLUMN_TITLES: Record<ColumnId, string> = {
	rascunho: "Rascunho",
	enviado: "Enviado",
	aprovado: "Aprovado",
	recusado: "Recusado",
};

export type Columns = Record<ColumnId, Orcamento[]>;

const initialColumns: Columns = {
	rascunho: [
		{ id: "orc-1042", numero: "ORC-1042", cliente: "Refrigeração Ártico Ltda", valor: 3450 },
		{ id: "orc-1048", numero: "ORC-1048", cliente: "Padaria Pão Quente", valor: 1280.5 },
		{ id: "orc-1051", numero: "ORC-1051", cliente: "Condomínio Solar das Palmeiras", valor: 8900 },
	],
	enviado: [
		{ id: "orc-1039", numero: "ORC-1039", cliente: "Mercado Bom Preço", valor: 5620 },
		{ id: "orc-1044", numero: "ORC-1044", cliente: "Academia Corpo em Forma", valor: 2340 },
		{ id: "orc-1046", numero: "ORC-1046", cliente: "Clínica Vida & Saúde", valor: 12750 },
	],
	aprovado: [
		{ id: "orc-1031", numero: "ORC-1031", cliente: "Restaurante Sabor Caseiro", valor: 4100 },
		{ id: "orc-1035", numero: "ORC-1035", cliente: "Escritório Advocacia Lima", valor: 1990 },
	],
	recusado: [{ id: "orc-1028", numero: "ORC-1028", cliente: "Loja do Zé Materiais", valor: 760 }],
};

/** Descobre a coluna de um id — seja o id de uma coluna ou de um card. */
export function findColumnId(columns: Columns, id: string): ColumnId | null {
	if ((COLUMN_ORDER as string[]).includes(id)) return id as ColumnId;
	for (const col of COLUMN_ORDER) {
		if (columns[col].some((o) => o.id === id)) return col;
	}
	return null;
}

type KanbanState = {
	columns: Columns;
	setColumns: (columns: Columns) => void;
	/** Move um card para outra coluna durante o arraste (chamado no onDragOver). */
	moveAcross: (activeId: string, overId: string) => void;
	/** Reordena um card dentro da mesma coluna ao soltar (chamado no onDragEnd). */
	reorderInColumn: (activeId: string, overId: string) => void;
};

export const useKanbanStore = create<KanbanState>()((set) => ({
	columns: initialColumns,

	setColumns: (columns) => set({ columns }),

	moveAcross: (activeId, overId) =>
		set((state) => {
			const from = findColumnId(state.columns, activeId);
			const to = findColumnId(state.columns, overId);
			if (!from || !to || from === to) return state;

			const fromItems = state.columns[from];
			const toItems = state.columns[to];
			const activeIndex = fromItems.findIndex((o) => o.id === activeId);
			if (activeIndex === -1) return state;

			const item = fromItems[activeIndex];
			if (!item) return state;

			const overIsColumn = (COLUMN_ORDER as string[]).includes(overId);
			const overIndex = toItems.findIndex((o) => o.id === overId);
			const insertAt = overIsColumn || overIndex === -1 ? toItems.length : overIndex;

			return {
				columns: {
					...state.columns,
					[from]: fromItems.filter((o) => o.id !== activeId),
					[to]: [...toItems.slice(0, insertAt), item, ...toItems.slice(insertAt)],
				},
			};
		}),

	reorderInColumn: (activeId, overId) =>
		set((state) => {
			const col = findColumnId(state.columns, activeId);
			if (!col) return state;

			const items = state.columns[col];
			const oldIndex = items.findIndex((o) => o.id === activeId);
			const newIndex = items.findIndex((o) => o.id === overId);
			if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state;

			return {
				columns: { ...state.columns, [col]: arrayMove(items, oldIndex, newIndex) },
			};
		}),
}));
