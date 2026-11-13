/**
 * Exemplos de orçamento por ofício — as páginas /para/<ofício> que o ChatGPT mais cita.
 *
 * São EXEMPLOS ILUSTRATIVOS, escritos à mão de propósito: serviço, quantidade e valor mostram
 * o formato de um orçamento do ofício, não uma tabela de preço da OLLI. A página sempre rotula
 * o bloco como exemplo (CDC: nada que pareça preço tabelado ou promessa). O total é SOMADO
 * no build — nunca digitado —, então item e total não divergem.
 *
 * Ofício sem entrada aqui não renderiza o bloco (some, não inventa).
 */
import type { VerticalId } from "../../../src/services/verticais";

export interface ItemExemplo {
	descricao: string;
	qtd: number;
	unidade: string;
	/** Valor unitário em reais inteiros. */
	unitario: number;
}

export interface ExemploOrcamentoOficio {
	/** Frase do serviço, ex.: "Troca de quadro de disjuntores". */
	servico: string;
	itens: ItemExemplo[];
}

export const EXEMPLOS_ORCAMENTO: Partial<Record<VerticalId, ExemploOrcamentoOficio>> = {
	eletrica: {
		servico: "Troca do quadro de disjuntores de um apartamento",
		itens: [
			{ descricao: "Quadro de distribuição de embutir, 12 disjuntores", qtd: 1, unidade: "un", unitario: 280 },
			{ descricao: "Disjuntor DIN 20 A", qtd: 6, unidade: "un", unitario: 28 },
			{ descricao: "Disjuntor DR 40 A / 30 mA", qtd: 1, unidade: "un", unitario: 190 },
			{ descricao: "Cabo flexível 2,5 mm²", qtd: 30, unidade: "m", unitario: 4.5 },
			{ descricao: "Mão de obra: instalação e identificação dos circuitos", qtd: 1, unidade: "serviço", unitario: 650 },
		],
	},
	jardinagem: {
		servico: "Manutenção mensal de jardim residencial de 80 m²",
		itens: [
			{ descricao: "Corte e acabamento do gramado", qtd: 80, unidade: "m²", unitario: 2.5 },
			{ descricao: "Poda de arbustos e cerca viva", qtd: 1, unidade: "serviço", unitario: 180 },
			{ descricao: "Adubação de cobertura", qtd: 1, unidade: "serviço", unitario: 90 },
			{ descricao: "Retirada dos resíduos", qtd: 1, unidade: "serviço", unitario: 60 },
		],
	},
	refrigeracao: {
		servico: "Instalação de ar-condicionado split 12.000 BTU/h",
		itens: [
			{ descricao: "Instalação do split (evaporadora e condensadora)", qtd: 1, unidade: "serviço", unitario: 650 },
			{ descricao: "Tubulação de cobre, kit com 3 m", qtd: 1, unidade: "kit", unitario: 220 },
			{ descricao: "Metro adicional de tubulação", qtd: 2, unidade: "m", unitario: 55 },
			{ descricao: "Suporte da condensadora", qtd: 1, unidade: "un", unitario: 70 },
			{ descricao: "Dreno e acabamento", qtd: 1, unidade: "serviço", unitario: 90 },
		],
	},
	dedetizacao: {
		servico: "Controle de baratas e formigas em apartamento de 70 m²",
		itens: [
			{ descricao: "Vistoria e inspeção dos focos", qtd: 1, unidade: "serviço", unitario: 80 },
			{ descricao: "Aplicação de gel e pulverização em frestas e rodapés", qtd: 70, unidade: "m²", unitario: 3.5 },
			{ descricao: "Retorno de reforço em 30 dias", qtd: 1, unidade: "visita", unitario: 100 },
		],
	},
};

export function totalExemplo(e: ExemploOrcamentoOficio): number {
	return e.itens.reduce((s, i) => s + i.qtd * i.unitario, 0);
}
