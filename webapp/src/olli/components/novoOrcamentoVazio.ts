/**
 * ORÇAMENTO EM BRANCO — réplica de `emptyOrcamento`
 * (`src/screens/NovoOrcamentoScreen.tsx`, ~linha 61).
 *
 * Não é "um objeto com os campos zerados": os defaults são REGRA DE NEGÓCIO. O app
 * do celular e o painel precisam nascer com os mesmos padrões: sem cobrança
 * embutida, assinatura visível, aprovação/recusa no PDF e validade de 15 dias.
 *
 * ⚠️ `numero` NASCE VAZIO, de propósito. O número só pode ser gerado NA HORA DE
 * SALVAR (`proximoNumeroDocumento('orcamento')` de `@/olli/mutacoes`): gerar ao abrir
 * o formulário QUEIMA o número se o usuário desistir, e aí o documento 003 nunca
 * existe. Preencha `numero` no submit, nunca antes.
 *
 * ⚠️ CHAVES OPCIONAIS SÃO OMITIDAS, não gravadas como `null`. O app omite a chave
 * quando não há valor (o `JSON.stringify` descarta `undefined`); gravar `null`
 * explícito criaria uma divergência silenciosa no blob.
 */
import type { Empresa, Orcamento } from "@dominio";
import { novoId } from "../contrato";
import { agoraIso, emDiasBr, hojeYmd } from "../datas";

/** Campo legado preservado no blob, mas cobrança no orçamento fica desativada. */
const FORMAS_PADRAO = { credito: false, debito: false, dinheiro: false, pix: false } as const;

/** Validade padrão quando a empresa não configurou a dela. */
const VALIDADE_DIAS_PADRAO = 15;

/**
 * Um orçamento novo, já com os padrões da empresa (aba "Meu Negócio" →
 * Personalização) quando existirem — o usuário ainda sobrescreve tudo no formulário.
 *
 * @param empresa linha de `empresa` (opcional). Sem ela, valem os padrões do app.
 */
export function novoOrcamentoVazio(empresa?: Empresa | null): Orcamento {
	const validadeDias = empresa?.validadeDiasPadrao ?? VALIDADE_DIAS_PADRAO;
	const agora = agoraIso();

	const orcamento: Orcamento = {
		id: novoId(),
		// Preenchido no submit — ver aviso no topo do arquivo.
		numero: "",

		clienteId: "",
		clienteNome: "",
		clienteTelefone: "",

		itens: [],
		subtotalServicos: 0,
		subtotalProdutos: 0,
		subtotal: 0,
		desconto: 0,
		descontoTipo: "valor",
		valorTotal: 0,

		status: "rascunho",
		dataEmissao: hojeYmd(), // 'YYYY-MM-DD'
		validadeOrcamento: emDiasBr(validadeDias), // 'DD/MM/AAAA' — formato diferente, e é assim mesmo

		formasPagamento: { ...FORMAS_PADRAO },
		exibirAssinatura: true,
		solicitarAssinaturaCliente: false,
		exibirAprovacao: true,
		exibirRecusa: true,

		criadoEm: agora,
		atualizadoEm: agora,
	};

	// Opcionais: a chave só existe quando há valor (regra da omissão — ver topo).
	// `|| undefined` e não `?? undefined`: no app, string vazia em "Meu Negócio"
	// significa "não configurado", não "configurado como vazio".
	if (empresa?.garantiaPadrao) orcamento.garantia = empresa.garantiaPadrao;
	if (empresa?.condicoesPagamentoPadrao) orcamento.condicoesPagamento = empresa.condicoesPagamentoPadrao;
	if (empresa?.observacoesPadrao) orcamento.informacoesAdicionais = empresa.observacoesPadrao;
	if (empresa?.corMarca) orcamento.corMarca = empresa.corMarca;
	if (empresa?.modeloPdfPadrao) orcamento.modeloPdf = empresa.modeloPdfPadrao;

	return orcamento;
}
