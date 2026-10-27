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
 *  - não há → cria uma OS já concluída, ligada ao orçamento.
 * Nunca mexe em OS cancelada (cancelar foi decisão do dono).
 */
export function planoDeFinalizacao(ordens: OsDoOrcamento[]): { acao: "concluir"; osId: string } | { acao: "criar" } {
	const abertas = ordens
		.filter((o) => o.status !== "concluida" && o.status !== "cancelada")
		.sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
	return abertas.length > 0 ? { acao: "concluir", osId: abertas[0].id } : { acao: "criar" };
}
