/**
 * Regra PURA de "finalizar o serviço" de um orçamento no Quadro (sem import, para o teste rodar no node).
 */
/** OS do orçamento, só o que a decisão precisa. */
export interface OsDoOrcamento {
	id: string;
	status: string;
	atualizado_em: string | null;
}

/**
 * Como FINALIZAR o serviço de um orçamento (soltar em "Finalizados" ou menu "Finalizar serviço").
 * "Finalizado" no quadro = o orçamento tem uma OS concluída. Então:
 *  - há OS em andamento (nem concluída nem cancelada) → conclui a mais recente;
 *  - não há, e nenhuma já está concluída → cria uma OS já concluída, ligada ao orçamento;
 *  - já existe OS concluída (card já finalizado, ou sync atrasado) → nada (LIVRE #260 P2: criar outra
 *    duplicaria o serviço no histórico e no faturamento).
 * Nunca mexe em OS cancelada (cancelar foi decisão do dono).
 */
export function planoDeFinalizacao(
	ordens: OsDoOrcamento[],
): { acao: "concluir"; osId: string } | { acao: "criar" } | { acao: "nada" } {
	const abertas = ordens
		.filter((o) => o.status !== "concluida" && o.status !== "cancelada")
		.sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
	if (abertas.length > 0) return { acao: "concluir", osId: abertas[0].id };
	return ordens.some((o) => o.status === "concluida") ? { acao: "nada" } : { acao: "criar" };
}
