import type { VerticalId } from './verticais';

export interface EntradaPrecificacao {
	custoMateriais: number;
	horas: number;
	valorHora: number;
	deslocamento?: number;
	outrosCustos?: number;
	despesasFixasRateadas?: number;
	impostoPct?: number;
	taxaPagamentoPct?: number;
	reservaPct?: number;
	margemPct?: number;
}

export interface EntradaPrecificacaoProduto {
	custoCompra: number;
	frete?: number;
	embalagem?: number;
	outrosCustos?: number;
	despesasFixasRateadas?: number;
	impostoPct?: number;
	taxaPagamentoPct?: number;
	reservaPct?: number;
	margemPct?: number;
}

export interface ResultadoPrecificacao {
	custoDireto: number;
	precoEquilibrio: number;
	precoSugerido: number;
	lucroEstimado: number;
	margemRealPct: number;
	markupPct: number;
	descontoMaxSemPrejuizoPct: number;
	memoria: string[];
}

function arredondarCima(valor: number): number {
	return Math.ceil(valor * 100) / 100;
}

function calcularPrecoBase(input: {
	custoDireto: number;
	impostoPct?: number;
	taxaPagamentoPct?: number;
	reservaPct?: number;
	margemPct?: number;
	memoriaCustos: string[];
}): ResultadoPrecificacao | null {
	const custoDireto = Number(input.custoDireto);
	const percentuais = [input.impostoPct ?? 0, input.taxaPagamentoPct ?? 0, input.reservaPct ?? 0, input.margemPct ?? 0].map(Number);
	if (!Number.isFinite(custoDireto) || custoDireto <= 0 || !percentuais.every(Number.isFinite)) return null;
	if (percentuais.some((valor) => valor < 0 || valor >= 100)) return null;
	const [impostoPct, taxaPagamentoPct, reservaPct, margemPct] = percentuais;
	const deducoes = (impostoPct + taxaPagamentoPct + reservaPct) / 100;
	const margem = margemPct / 100;
	if (deducoes >= 0.95 || deducoes + margem >= 0.95) return null;

	const precoEquilibrio = arredondarCima(custoDireto / (1 - deducoes));
	const precoSugerido = arredondarCima(custoDireto / (1 - deducoes - margem));
	const lucroEstimado = Math.max(0, Math.round((precoSugerido * (1 - deducoes) - custoDireto) * 100) / 100);
	const margemRealPct = Math.round((lucroEstimado / precoSugerido) * 10_000) / 100;
	const markupPct = Math.round(((precoSugerido / custoDireto) - 1) * 10_000) / 100;
	const descontoMaxSemPrejuizoPct = Math.max(0, Math.round(((precoSugerido - precoEquilibrio) / precoSugerido) * 10_000) / 100);
	return {
		custoDireto,
		precoEquilibrio,
		precoSugerido,
		lucroEstimado,
		margemRealPct,
		markupPct,
		descontoMaxSemPrejuizoPct,
		memoria: [
			...input.memoriaCustos,
			`Impostos sobre a venda: ${impostoPct.toFixed(2)}%`,
			`Taxa de pagamento: ${taxaPagamentoPct.toFixed(2)}%`,
			`Reserva de risco e garantia: ${reservaPct.toFixed(2)}%`,
			`Margem alvo: ${margemPct.toFixed(2)}%`,
		],
	};
}

/** Calcula um preço de venda sem esconder custo, imposto ou margem. */
export function calcularPrecoServico(entrada: EntradaPrecificacao): ResultadoPrecificacao | null {
	const materiais = Number(entrada.custoMateriais);
	const horas = Number(entrada.horas);
	const valorHora = Number(entrada.valorHora);
	const deslocamento = Number(entrada.deslocamento ?? 0);
	const outrosCustos = Number(entrada.outrosCustos ?? 0);
	const despesasFixasRateadas = Number(entrada.despesasFixasRateadas ?? 0);
	if (![materiais, horas, valorHora, deslocamento, outrosCustos, despesasFixasRateadas].every(Number.isFinite)) return null;
	if ([materiais, horas, valorHora, deslocamento, outrosCustos, despesasFixasRateadas].some((valor) => valor < 0)) return null;
	const maoDeObra = horas * valorHora;
	return calcularPrecoBase({
		custoDireto: materiais + maoDeObra + deslocamento + outrosCustos + despesasFixasRateadas,
		impostoPct: entrada.impostoPct,
		taxaPagamentoPct: entrada.taxaPagamentoPct,
		reservaPct: entrada.reservaPct,
		margemPct: entrada.margemPct,
		memoriaCustos: [
			`Materiais e peças: ${materiais.toFixed(2)}`,
			`Mão de obra: ${horas.toFixed(2)} h × ${valorHora.toFixed(2)} = ${maoDeObra.toFixed(2)}`,
			`Deslocamento: ${deslocamento.toFixed(2)}`,
			`Outros custos: ${outrosCustos.toFixed(2)}`,
			`Rateio de despesas fixas: ${despesasFixasRateadas.toFixed(2)}`,
		],
	});
}

/** Calcula preço unitário de produto, peça ou material para revenda. */
export function calcularPrecoProduto(entrada: EntradaPrecificacaoProduto): ResultadoPrecificacao | null {
	const custoCompra = Number(entrada.custoCompra);
	const frete = Number(entrada.frete ?? 0);
	const embalagem = Number(entrada.embalagem ?? 0);
	const outrosCustos = Number(entrada.outrosCustos ?? 0);
	const despesasFixasRateadas = Number(entrada.despesasFixasRateadas ?? 0);
	const custos = [custoCompra, frete, embalagem, outrosCustos, despesasFixasRateadas];
	if (!custos.every(Number.isFinite) || custos.some((valor) => valor < 0)) return null;
	return calcularPrecoBase({
		custoDireto: custos.reduce((total, valor) => total + valor, 0),
		impostoPct: entrada.impostoPct,
		taxaPagamentoPct: entrada.taxaPagamentoPct,
		reservaPct: entrada.reservaPct,
		margemPct: entrada.margemPct,
		memoriaCustos: [
			`Compra da peça/produto: ${custoCompra.toFixed(2)}`,
			`Frete por unidade: ${frete.toFixed(2)}`,
			`Embalagem por unidade: ${embalagem.toFixed(2)}`,
			`Outros custos por unidade: ${outrosCustos.toFixed(2)}`,
			`Rateio de despesas fixas: ${despesasFixasRateadas.toFixed(2)}`,
		],
	});
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
	{ id: 'caixa-dagua-limpeza', vertical: 'caixa_dagua', nome: "Limpeza de caixa d'água", itens: ['Esvaziamento', 'Limpeza e desinfecção', 'Certificado'] },
	{ id: 'piscina-mensal', vertical: 'piscina', nome: 'Manutenção mensal de piscina', itens: ['Visitas', 'Produtos', 'Deslocamento'] },
	{ id: 'extintores-recarga', vertical: 'extintores', nome: 'Recarga de extintores', itens: ['Recarga', 'Inspeção', 'Deslocamento'] },
	{ id: 'jardinagem-manutencao', vertical: 'jardinagem', nome: 'Manutenção de jardim', itens: ['Poda', 'Adubação', 'Limpeza'] },
];
