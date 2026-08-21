import { criarCsv, linhasParaObjetos, numeroBr, parseCsv, protegerCsv } from "./parser.ts";
import { extrairOrcamentosOlli } from "./orcamento.ts";

function afirmar(condicao: unknown, mensagem: string): asserts condicao {
	if (!condicao) throw new Error(mensagem);
}

// Testes puros, sem DOM/rede: podem ser executados por qualquer runner TypeScript.
export function testarParserCentralDeDados() {
	afirmar(numeroBr("R$ 1.234,56") === 1234.56, "locale BR deve preservar centavos");
	afirmar(numeroBr("invalido") === null, "número inválido não pode virar zero");
	const objetos = linhasParaObjetos(parseCsv('nome;descrição\nFiltro;"A; B"\n'));
	afirmar(objetos[0]?.descrição === "A; B", "CSV deve aceitar delimitador entre aspas");
	afirmar(protegerCsv("=2+2").startsWith("'"), "exportação deve neutralizar fórmula");
	afirmar(criarCsv(["nome"], [["+55"]]).includes("'+55"), "telefones perigosos devem sair protegidos");
	afirmar(protegerCsv("-123,45") === "-123,45", "número negativo deve preservar o round-trip");
	afirmar(protegerCsv("-1+CMD()").startsWith("'"), "expressão iniciada por menos deve continuar neutralizada");
	const orcamento = {
		id: "123e4567-e89b-42d3-a456-426614174000", numero: "00126", clienteId: "", clienteNome: "Cliente", clienteTelefone: "",
		itens: [{ id: "i1", tipo: "servico", catalogoId: "", nome: "Visita", preco: 100, quantidade: 1, unidade: "un", subtotal: 100 }],
		subtotalServicos: 100, subtotalProdutos: 0, subtotal: 100, desconto: 0, descontoTipo: "valor", valorTotal: 100,
		status: "rascunho", dataEmissao: "2026-08-20T12:00:00.000Z", formasPagamento: { credito: false, debito: false, dinheiro: true, pix: true },
		exibirAssinatura: true, solicitarAssinaturaCliente: false, exibirAprovacao: true, exibirRecusa: true,
		criadoEm: "2026-08-20T12:00:00.000Z", atualizadoEm: "2026-08-20T12:00:00.000Z",
	};
	afirmar(extrairOrcamentosOlli(JSON.stringify({ formato: "olli-orcamentos", versao: 1, orcamentos: [orcamento] })).length === 1, "pacote OLLI deve importar orçamento completo");
	let rejeitou = false;
	try { extrairOrcamentosOlli(JSON.stringify({ formato: "olli-orcamentos", versao: 1, orcamentos: [{ ...orcamento, itens: [] }] })); } catch { rejeitou = true; }
	afirmar(rejeitou, "orçamento incompleto deve falhar fechado");
}
