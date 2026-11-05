/**
 * O que o botão "Mover" oferece num card do Quadro.
 *
 * Sem import de domínio de propósito: o teste roda no `node`, e a lista de
 * status continua saindo de `COLUNAS` (uma fonte só). Coluna sem status
 * ("Finalizados", "Outros") não vira título vazio no menu.
 */
export interface ColunaMenu {
	id: string;
	titulo: string;
	status: readonly string[];
}

export interface OpcaoMover {
	id: string;
	grupo: string;
	atual: boolean;
	/** true = conclui o serviço (a mesma confirmação de soltar em Finalizados). */
	finalizar: boolean;
}

export function opcoesParaMover(
	colunas: readonly ColunaMenu[],
	statusAtual: string | null,
	colunaId: string,
): OpcaoMover[] {
	const opcoes: OpcaoMover[] = [];
	for (const coluna of colunas) {
		for (const status of coluna.status) {
			opcoes.push({
				id: status,
				grupo: coluna.titulo,
				atual: status === statusAtual,
				finalizar: false,
			});
		}
	}
	if (colunaId !== "finalizados") {
		opcoes.push({ id: "finalizar", grupo: "Serviço", atual: false, finalizar: true });
	}
	return opcoes;
}
