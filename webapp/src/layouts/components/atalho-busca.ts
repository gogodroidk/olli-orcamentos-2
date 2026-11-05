/**
 * Atalho da busca do topo.
 *
 * Ctrl+K e Cmd+K são o atalho de paleta. Ctrl+Q também abre (pedido do Igor,
 * D-1438). Cmd+Q no Mac encerra o navegador — esse não pode ser interceptado.
 */
export type TeclasAtalho = {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	repeat: boolean;
};

export function atalhoAbreBusca(e: TeclasAtalho): boolean {
	if (e.repeat || e.altKey || e.shiftKey) return false;
	const tecla = e.key.toLowerCase();
	if (tecla === "k" && (e.ctrlKey || e.metaKey)) return true;
	if (tecla === "q" && e.ctrlKey && !e.metaKey) return true;
	return false;
}
