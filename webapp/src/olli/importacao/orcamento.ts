import type { Orcamento } from "@dominio";
import { LIMITE_ARQUIVO_BYTES, LIMITE_LINHAS } from "./parser.ts";

const STATUS = new Set([
	"rascunho", "enviado", "visualizado", "em_negociacao", "aguardando_assinatura",
	"aprovado", "recusado", "expirado", "cancelado", "convertido",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objeto(valor: unknown): valor is Record<string, unknown> {
	return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

function texto(valor: unknown, maximo: number, vazio = false): valor is string {
	return typeof valor === "string" && valor.length <= maximo && (vazio || valor.trim().length > 0);
}

function numero(valor: unknown): valor is number {
	return typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
}

function dataIso(valor: unknown): valor is string {
	return texto(valor, 50) && !Number.isNaN(new Date(valor).getTime());
}

function orcamentoValido(valor: unknown): valor is Orcamento {
	if (!objeto(valor) || !texto(valor.id, 64) || !UUID.test(valor.id)) return false;
	if (!texto(valor.numero, 50) || !texto(valor.clienteId, 64, true) || !texto(valor.clienteNome, 200, true) || !texto(valor.clienteTelefone, 50, true)) return false;
	if (!Array.isArray(valor.itens) || valor.itens.length === 0 || valor.itens.length > 500) return false;
	if (!valor.itens.every((item) => objeto(item)
		&& texto(item.id, 64)
		&& (item.tipo === "servico" || item.tipo === "produto")
		&& texto(item.catalogoId, 64, true)
		&& texto(item.nome, 300)
		&& numero(item.preco)
		&& numero(item.quantidade) && item.quantidade > 0
		&& texto(item.unidade, 30)
		&& numero(item.subtotal))) return false;
	if (![valor.subtotalServicos, valor.subtotalProdutos, valor.subtotal, valor.desconto, valor.valorTotal].every(numero)) return false;
	if (valor.descontoTipo !== "valor" && valor.descontoTipo !== "percentual") return false;
	if (!STATUS.has(String(valor.status)) || !dataIso(valor.dataEmissao) || !dataIso(valor.criadoEm) || !dataIso(valor.atualizadoEm)) return false;
	const formas = valor.formasPagamento;
	if (!objeto(formas) || !["credito", "debito", "dinheiro", "pix"].every((campo) => typeof formas[campo] === "boolean")) return false;
	return [valor.exibirAssinatura, valor.solicitarAssinaturaCliente, valor.exibirAprovacao, valor.exibirRecusa].every((v) => typeof v === "boolean");
}

/** Aceita somente JSON exportado pelo próprio OLLI e valida o objeto inteiro. */
export function extrairOrcamentosOlli(textoJson: string): Orcamento[] {
	if (new TextEncoder().encode(textoJson).length > LIMITE_ARQUIVO_BYTES) throw new Error("O arquivo passa de 10 MB.");
	let raiz: unknown;
	try { raiz = JSON.parse(textoJson); } catch { throw new Error("O JSON não é válido."); }
	if (!objeto(raiz)) throw new Error("O arquivo não é um pacote OLLI válido.");
	let lista: unknown;
	if (raiz.formato === "olli-orcamentos" && raiz.versao === 1) lista = raiz.orcamentos;
	else if (raiz.formato === "olli-pacote-operacional" && raiz.versao === 1 && objeto(raiz.registros)) lista = raiz.registros.orcamentos;
	else throw new Error("Use um JSON de orçamentos exportado pela Central de Dados do OLLI.");
	if (!Array.isArray(lista) || lista.length === 0) throw new Error("O pacote não contém orçamentos.");
	if (lista.length > LIMITE_LINHAS) throw new Error(`O pacote tem mais de ${LIMITE_LINHAS.toLocaleString("pt-BR")} orçamentos.`);
	const invalido = lista.findIndex((item) => !orcamentoValido(item));
	if (invalido >= 0) throw new Error(`O orçamento ${invalido + 1} está incompleto ou foi alterado fora do OLLI.`);
	return lista as Orcamento[];
}
