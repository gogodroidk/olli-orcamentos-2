import type { VerticalId } from './verticais';

export interface EntradaPrecificacao {
	custoMateriais: number;
	horas: number;
	valorHora: number;
	deslocamento?: number;
	impostoPct?: number;
	margemPct?: number;
}

export interface ResultadoPrecificacao {
	custoDireto: number;
	precoSugerido: number;
	lucroEstimado: number;
	memoria: string[];
}

/** Calcula um preço de venda sem esconder custo, imposto ou margem. */
export function calcularPrecoServico(entrada: EntradaPrecificacao): ResultadoPrecificacao | null {
	const materiais = Number(entrada.custoMateriais);
	const horas = Number(entrada.horas);
	const valorHora = Number(entrada.valorHora);
	const deslocamento = Number(entrada.deslocamento ?? 0);
	const imposto = Math.max(0, Number(entrada.impostoPct ?? 0)) / 100;
	const margem = Math.max(0, Number(entrada.margemPct ?? 0)) / 100;
	if (![materiais, horas, valorHora, deslocamento, imposto, margem].every(Number.isFinite)) return null;
	if (materiais < 0 || horas < 0 || valorHora < 0 || deslocamento < 0 || imposto >= 1 || margem >= 1 || imposto + margem >= 0.95) return null;
	const custoDireto = materiais + horas * valorHora + deslocamento;
	if (custoDireto <= 0) return null;
	const precoSugerido = Math.ceil((custoDireto / (1 - imposto - margem)) * 100) / 100;
	const lucroEstimado = Math.max(0, precoSugerido * (1 - imposto) - custoDireto);
	return {
		custoDireto,
		precoSugerido,
		lucroEstimado,
		memoria: [
			`Materiais: ${materiais.toFixed(2)}`,
			`Mão de obra: ${horas.toFixed(2)} h × ${valorHora.toFixed(2)}`,
			`Deslocamento: ${deslocamento.toFixed(2)}`,
			`Imposto: ${(imposto * 100).toFixed(2)}% · margem alvo: ${(margem * 100).toFixed(2)}%`,
		],
	};
}

export interface PackOficio {
	id: string;
	vertical: VerticalId;
	nome: string;
	itens: readonly string[];
}

/** Packs iniciais são atalhos de catálogo; preço sempre é recalculado pelos custos reais. */
export const PACKS_OFICIO: readonly PackOficio[] = [
	{ id: 'eletrica-visita', vertical: 'eletrica', nome: 'Visita elétrica', itens: ['Diagnóstico', 'Deslocamento', 'Materiais'] },
	{ id: 'hidraulica-vazamento', vertical: 'hidraulica', nome: 'Vazamento e reparo', itens: ['Visita', 'Mão de obra', 'Peças'] },
	{ id: 'pintura-ambiente', vertical: 'pintura', nome: 'Pintura de ambiente', itens: ['Preparação', 'Tinta', 'Aplicação'] },
	{ id: 'dedetizacao-residencial', vertical: 'dedetizacao', nome: 'Controle residencial', itens: ['Inspeção', 'Aplicação', 'Retorno'] },
	{ id: 'jardinagem-manutencao', vertical: 'jardinagem', nome: 'Manutenção de jardim', itens: ['Poda', 'Adubação', 'Limpeza'] },
];
