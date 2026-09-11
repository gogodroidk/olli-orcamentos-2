/**
 * PRÉ-CARGA DE 1 ITEM NO ORÇAMENTO — réplica do `prefillItem` do app
 * (`src/screens/NovoOrcamentoScreen.tsx`, ~linha 153–258): "Criar orçamento com
 * este diagnóstico/código" (Diagnóstico IA, Códigos de erro) monta UM item de
 * serviço com nome/descrição já escritos, e o técnico só ajusta preço e
 * quantidade no editor — em vez de digitar tudo de novo do zero.
 *
 * O diagnóstico pode trazer um `precoSugerido`, mas o valor continua editável e
 * nunca é tratado como preço final. Quando a origem não tem preço confiável,
 * o item nasce com `preco: 0`, visível e óbvio no editor.
 */
import type { ItemOrcamento, Orcamento } from "@dominio";
import { novoId } from "../contrato";
import { comTotais } from "./totais";

export interface PrefillItemOrcamento {
	tipo: "servico" | "produto";
	nome: string;
	descricao?: string;
	quantidade?: number;
	/** Preço apenas como referência; o editor continua sendo a autoridade. */
	precoSugerido?: number;
	unidade?: string;
}

/**
 * Devolve o orçamento com o item de pré-carga ANEXADO aos itens já existentes
 * (nunca substitui) e os totais recalculados. Sem `nome`, devolve `o` intacto —
 * um item sem nome não é um item, é ruído no documento do cliente.
 */
export function orcamentoComItemPrefill(o: Orcamento, prefill: PrefillItemOrcamento): Orcamento {
	return orcamentoComItensPrefill(o, [prefill]);
}

/** Anexa vários itens de uma prévia Autopilot sem substituir o que já existe. */
export function orcamentoComItensPrefill(o: Orcamento, prefills: PrefillItemOrcamento[]): Orcamento {
	const itens = prefills.map((prefill): ItemOrcamento | null => {
		const nome = prefill.nome.trim();
		if (!nome) return null;
		const quantidade = Number.isFinite(prefill.quantidade) && (prefill.quantidade ?? 0) > 0 ? prefill.quantidade! : 1;
		const preco = Number.isFinite(prefill.precoSugerido) && (prefill.precoSugerido ?? 0) >= 0 ? prefill.precoSugerido! : 0;
		return {
			id: novoId(), tipo: prefill.tipo, catalogoId: "", nome,
			descricao: prefill.descricao?.trim() || undefined, preco, quantidade,
			unidade: prefill.unidade?.trim() || "un", subtotal: Math.round(preco * quantidade * 100) / 100,
		} as ItemOrcamento;
	}).filter((item): item is ItemOrcamento => item !== null);
	return itens.length ? comTotais({ ...o, itens: [...o.itens, ...itens] }) : o;
}
