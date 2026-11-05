/**
 * Troca SÓ o status de uma OS já relida do banco.
 *
 * O resto (fotos, checklist, técnico, orçamento) fica na mesma referência:
 * o upsert grava a linha inteira, e um objeto montado do zero apagaria o que
 * o técnico fez no celular. Mesmo status devolve o mesmo objeto — não carimba
 * `atualizadoEm` à toa.
 */
export function aplicarStatusOs<T extends { status: string; concluidoEm?: string; atualizadoEm: string }>(
	fresca: T,
	status: T["status"],
	agora: string,
	concluidoEm: string | undefined,
): T {
	if (fresca.status === status) return fresca;
	return { ...fresca, status, concluidoEm, atualizadoEm: agora };
}
