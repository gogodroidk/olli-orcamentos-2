import { LIMITE_ARQUIVO_BYTES, limitarLinhas, linhasParaObjetos, parseCsv, type LinhaBruta } from "./parser";

export async function lerArquivoTabular(arquivo: File): Promise<LinhaBruta[]> {
	if (arquivo.size === 0) throw new Error("O arquivo está vazio.");
	if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
		throw new Error(`Use arquivos de até ${Math.round(LIMITE_ARQUIVO_BYTES / 1024 / 1024)} MB.`);
	}
	const nome = arquivo.name.toLocaleLowerCase("pt-BR");
	if (nome.endsWith(".csv")) return linhasParaObjetos(limitarLinhas(parseCsv(await arquivo.text())));
	if (!nome.endsWith(".xlsx")) {
		throw new Error("Aceitamos CSV ou XLSX. Arquivos XLS antigos e PDF não são importados automaticamente por segurança.");
	}

	// Import lazy: o parser de XLSX não pesa na tela até o usuário escolher um arquivo.
	const { readSheet } = await import("read-excel-file/browser");
	const linhas = await readSheet(arquivo, 1);
	return linhasParaObjetos(
		limitarLinhas(linhas.map((linha) => linha.map((celula) => (celula == null ? "" : String(celula))))),
	);
}
