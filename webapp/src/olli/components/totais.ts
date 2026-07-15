/**
 * TOTAIS DO ORÇAMENTO — réplica de `calcTotais` do app do celular.
 *
 * Fonte da verdade: `src/screens/NovoOrcamentoScreen.tsx` (`round2` na linha ~112,
 * `calcTotais` na ~114). Este arquivo é uma CÓPIA, não uma reinterpretação: o mesmo
 * orçamento aberto no celular e no painel tem que fechar no mesmo centavo. Um total
 * que não bate com a soma das linhas destrói a credibilidade do documento na frente
 * do cliente — e o cliente vê os dois (o PDF sai do blob, que os dois gravam).
 *
 * ⚠️ TRÊS ARMADILHAS QUE ESTA FUNÇÃO EXISTE PARA EVITAR:
 *
 * 1. `desconto` NEM SEMPRE É DINHEIRO. Quando `descontoTipo === 'percentual'`, o
 *    campo `desconto` guarda o PERCENTUAL (10 = 10%), não reais. Por isso devolvo
 *    os dois separados: `desconto` (o valor do CAMPO, na semântica do domínio) e
 *    `descontoEmReais` (só para EXIBIR). Gravar reais em `desconto` num orçamento
 *    percentual manda 10 reais de desconto onde o cliente esperava 10%.
 *
 * 2. DESCONTO EM R$ É RECLAMPADO ao subtotal. Sem isso, um desconto de R$100 dado
 *    com R$500 em itens continuaria valendo R$100 depois que o usuário apagasse
 *    itens e sobrasse R$50 — e o total iria a zero (ou negativo, se não fosse o max).
 *
 * 3. SINAL EM R$ TAMBÉM É RECLAMPADO ao novo total. Um sinal preso acima do total
 *    faria o Pix/PDF COBRAR MAIS que o próprio orçamento. O sinal em PERCENTUAL
 *    (sem `sinalValor`) fica intacto: um % é sempre válido sobre qualquer total.
 */
import type { ItemOrcamento, Orcamento } from "@dominio";

/** Duas casas — a moeda do documento. Idêntico ao `round2` do app. */
export const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Subtotal de UMA linha. O app faz `preco * quantidade` cru (Step2Itens); aqui
 * arredondo para 2 casas para não gravar `99.99000000000001` no blob e exibi-lo
 * na tela. É seguro: os somatórios abaixo já passam por `round2`, então o total
 * final é bit-a-bit o mesmo que o do celular.
 */
export function subtotalDoItem(item: Pick<ItemOrcamento, "preco" | "quantidade">): number {
	return round2(item.preco * item.quantidade);
}

export interface Totais {
	subtotalServicos: number;
	subtotalProdutos: number;
	subtotal: number;
	/**
	 * O valor do CAMPO `desconto` do domínio — percentual quando
	 * `descontoTipo === 'percentual'`, reais quando `'valor'` (já reclampado).
	 * É ESTE que vai para o blob.
	 */
	desconto: number;
	/** Desconto convertido em REAIS. Existe só para EXIBIR/somar na tela. NUNCA gravar em `desconto`. */
	descontoEmReais: number;
	valorTotal: number;
	/** Reclampado ao novo total quando existe. `undefined` = sinal em percentual (ou sem sinal). */
	sinalValor?: number;
	sinalPercentual?: number;
}

/**
 * Calcula os totais a partir dos itens. Não muta nada — devolve só os números.
 * Use em toda renderização de resumo (o rodapé "Subtotal / Desconto / Total").
 */
export function calcularTotais(
	o: Pick<Orcamento, "itens" | "desconto" | "descontoTipo" | "sinalValor" | "sinalPercentual">,
): Totais {
	const servicos = round2(o.itens.filter((i) => i.tipo === "servico").reduce((s, i) => s + i.subtotal, 0));
	const produtos = round2(o.itens.filter((i) => i.tipo === "produto").reduce((s, i) => s + i.subtotal, 0));
	const subtotal = round2(servicos + produtos);

	// Armadilha 2: em R$, o desconto é reclampado a [0, subtotal]. Em %, guarda-se o % cru.
	const desconto =
		o.descontoTipo === "valor" ? round2(Math.max(0, Math.min(subtotal, o.desconto))) : round2(o.desconto);

	// Armadilha 1: a conversão para reais acontece AQUI, e só aqui.
	const descontoEmReais = o.descontoTipo === "percentual" ? round2(subtotal * (desconto / 100)) : desconto;

	const valorTotal = round2(Math.max(0, subtotal - descontoEmReais));

	// Armadilha 3: sinal em R$ nunca pode passar do total.
	const sinalValor = o.sinalValor && o.sinalValor > 0 ? round2(Math.min(o.sinalValor, valorTotal)) : o.sinalValor;
	const sinalPercentual =
		sinalValor && sinalValor > 0 && valorTotal > 0 ? Math.round((sinalValor / valorTotal) * 100) : o.sinalPercentual;

	return {
		subtotalServicos: servicos,
		subtotalProdutos: produtos,
		subtotal,
		desconto,
		descontoEmReais,
		valorTotal,
		sinalValor,
		sinalPercentual,
	};
}

/**
 * O orçamento COM os totais recalculados — é este objeto que se salva.
 *
 * Espelha o retorno do `calcTotais` do app. Os campos são copiados um a um de
 * propósito: um `{ ...o, ...calcularTotais(o) }` injetaria `descontoEmReais`
 * (que NÃO existe no domínio) dentro do blob `dados`, e o app do celular passaria
 * a carregar uma chave fantasma para sempre.
 *
 * Chame a cada mudança de item/desconto — como o app faz.
 */
export function comTotais(o: Orcamento): Orcamento {
	const t = calcularTotais(o);
	return {
		...o,
		subtotalServicos: t.subtotalServicos,
		subtotalProdutos: t.subtotalProdutos,
		subtotal: t.subtotal,
		desconto: t.desconto,
		valorTotal: t.valorTotal,
		sinalValor: t.sinalValor,
		sinalPercentual: t.sinalPercentual,
	};
}
