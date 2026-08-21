/**
 * Primitivas puras da Central de dados.
 *
 * Não usamos CSV como "código". Tudo entra como texto, números são convertidos
 * explicitamente no locale pt-BR e fórmulas nunca são avaliadas no navegador.
 */
export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;
export const LIMITE_LINHAS = 5_000;

export type LinhaBruta = Record<string, string>;

export function normalizarCabecalho(valor: string): string {
	return valor
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
		.toLocaleLowerCase("pt-BR")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function normalizarChave(valor: string | null | undefined): string {
	return String(valor ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase("pt-BR")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Interpreta R$ 1.234,56 e 1234.56 sem depender do locale da máquina. */
export function numeroBr(valor: string | null | undefined): number | null {
	const texto = String(valor ?? "").trim();
	if (!texto) return null;
	const limpo = texto.replace(/R\$|\s/g, "");
	const ultimoPonto = limpo.lastIndexOf(".");
	const ultimaVirgula = limpo.lastIndexOf(",");
	const normalizado =
		ultimaVirgula > ultimoPonto
			? limpo.replace(/\./g, "").replace(",", ".")
			: limpo.replace(/,/g, "");
	if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
	const numero = Number(normalizado);
	return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null;
}

/**
 * CSV RFC-4180 suficiente para exportações usuais (aspas, CRLF e BOM).
 * A escolha do delimitador é feita fora das aspas, por frequência no cabeçalho.
 */
export function parseCsv(texto: string): string[][] {
	const fonte = texto.replace(/^\uFEFF/, "");
	const primeiraLinha = fonte.split(/\r?\n/, 1)[0] ?? "";
	const delimitador = contarForaDasAspas(primeiraLinha, ";") > contarForaDasAspas(primeiraLinha, ",") ? ";" : ",";
	const linhas: string[][] = [];
	let linha: string[] = [];
	let celula = "";
	let emAspas = false;

	for (let i = 0; i < fonte.length; i += 1) {
		const caractere = fonte[i];
		if (caractere === '"') {
			if (emAspas && fonte[i + 1] === '"') {
				celula += '"';
				i += 1;
			} else emAspas = !emAspas;
			continue;
		}
		if (!emAspas && caractere === delimitador) {
			linha.push(celula.trim());
			celula = "";
			continue;
		}
		if (!emAspas && (caractere === "\n" || caractere === "\r")) {
			if (caractere === "\r" && fonte[i + 1] === "\n") i += 1;
			linha.push(celula.trim());
			if (linha.some(Boolean)) linhas.push(linha);
			linha = [];
			celula = "";
			continue;
		}
		celula += caractere;
	}
	if (emAspas) throw new Error("O CSV termina com aspas abertas. Corrija o arquivo e tente de novo.");
	linha.push(celula.trim());
	if (linha.some(Boolean)) linhas.push(linha);
	return linhas;
}

function contarForaDasAspas(texto: string, procurado: string): number {
	let total = 0;
	let emAspas = false;
	for (const caractere of texto) {
		if (caractere === '"') emAspas = !emAspas;
		else if (!emAspas && caractere === procurado) total += 1;
	}
	return total;
}

export function linhasParaObjetos(linhas: string[][]): LinhaBruta[] {
	if (linhas.length < 2) return [];
	const cabecalhos = linhas[0].map((c, i) => c.trim() || `coluna_${i + 1}`);
	if (new Set(cabecalhos.map(normalizarCabecalho)).size !== cabecalhos.length) {
		throw new Error("Há cabeçalhos repetidos. Renomeie as colunas para continuar.");
	}
	return linhas.slice(1, LIMITE_LINHAS + 1).map((linha) =>
		Object.fromEntries(cabecalhos.map((cabecalho, i) => [cabecalho, linha[i] ?? ""])),
	);
}

/** Prefixo neutro evita que Excel/Sheets execute uma célula exportada como fórmula. */
export function protegerCsv(valor: unknown): string {
	const texto = String(valor ?? "");
	// Alguns leitores de planilha ignoram espaços/tabulações antes da fórmula.
	// Um número negativo puro é dado, não fórmula. Preservá-lo mantém o
	// round-trip sem abrir a porta para expressões como "-1+CMD(...)".
	const numeroNegativoSeguro = /^\s*-\d+(?:[.,]\d+)?\s*$/.test(texto);
	const protegido = !numeroNegativoSeguro && /^[\t ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
	return /[",\r\n;]/.test(protegido) ? `"${protegido.replace(/"/g, '""')}"` : protegido;
}

export function criarCsv(cabecalhos: string[], linhas: Array<Array<unknown>>): string {
	return `\uFEFF${[cabecalhos, ...linhas].map((linha) => linha.map(protegerCsv).join(";")).join("\r\n")}\r\n`;
}

export function limitarLinhas(linhas: string[][]): string[][] {
	if (linhas.length > LIMITE_LINHAS + 1) {
		throw new Error(`O arquivo tem mais de ${LIMITE_LINHAS.toLocaleString("pt-BR")} linhas. Divida-o em arquivos menores.`);
	}
	return linhas;
}
