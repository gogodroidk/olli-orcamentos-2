/**
 * PRÉ-CARGA DE 1 ITEM NO ORÇAMENTO — réplica do `prefillItem` do app
 * (`src/screens/NovoOrcamentoScreen.tsx`, ~linha 153–258): "Criar orçamento com
 * este diagnóstico/código" (Diagnóstico IA, Códigos de erro) monta UM item de
 * serviço com nome/descrição já escritos, e o técnico só ajusta preço e
 * quantidade no editor — em vez de digitar tudo de novo do zero.
 *
 * O item nasce com `preco: 0` DE PROPÓSITO (mesma regra do app): o diagnóstico
 * não sabe precificar o reparo, só descrevê-lo. Preço 0 é visível e óbvio no
 * editor (não é um valor "esquecido"), diferente de inventar um preço.
 */
import type { ItemOrcamento, Orcamento } from "@dominio";
import { novoId } from "../contrato";
import { comTotais } from "./totais";

export interface PrefillItemOrcamento {
	tipo: "servico" | "produto";
	nome: string;
	descricao?: string;
}

/**
 * Devolve o orçamento com o item de pré-carga ANEXADO aos itens já existentes
 * (nunca substitui) e os totais recalculados. Sem `nome`, devolve `o` intacto —
 * um item sem nome não é um item, é ruído no documento do cliente.
 */
export function orcamentoComItemPrefill(o: Orcamento, prefill: PrefillItemOrcamento): Orcamento {
	const nome = prefill.nome.trim();
	if (!nome) return o;
	const item: ItemOrcamento = {
		id: novoId(),
		tipo: prefill.tipo,
		catalogoId: "",
		nome,
		descricao: prefill.descricao?.trim() || undefined,
		preco: 0,
		quantidade: 1,
		unidade: "un",
		subtotal: 0,
	};
	return comTotais({ ...o, itens: [...o.itens, item] });
}
