/**
 * Lê o ARQUIVO escolhido na importação (CSV, XLSX ou vCard) e devolve linhas
 * com cabeçalho — sem rede, sem IA, tudo no aparelho.
 *
 * Por que um leitor de XLSX próprio: o painel usa `read-excel-file`, que não
 * existe no app; e o Excel no celular é o formato mais comum de "planilha de
 * clientes". XLSX é um ZIP de XML: o `fflate` (já empacotado no APK como
 * dependência do `fast-png`, agora declarado direto) descompacta, e o XML da
 * primeira aba é lido aqui com expressões simples — sem DOMParser, que o
 * Hermes não tem. Fórmulas NUNCA são avaliadas: vale o último valor que o
 * Excel gravou na célula.
 *
 * Puro (sem React Native): `scripts/teste-importacao.ts` monta um XLSX de
 * verdade com o próprio fflate e confere a leitura.
 */
import { unzipSync } from 'fflate';
import {
	contatosParaLinhas,
	decodificarTexto,
	LIMITE_ARQUIVO_BYTES,
	limitarLinhas,
	linhasParaObjetos,
	parseCsv,
	parseVcf,
	type LinhaBruta,
} from './importacao.ts';

export type FormatoImportacao = 'csv' | 'xlsx' | 'vcf';

export type ArquivoLido = { formato: FormatoImportacao; linhas: LinhaBruta[] };

/** Teto do XML descompactado: barra "zip bomb" (10 MB de XLSX não chega perto). */
const LIMITE_DESCOMPACTADO = 80 * 1024 * 1024;

function extensao(nome: string): string {
	const m = /\.([a-z0-9]+)$/i.exec(nome.trim());
	return (m?.[1] ?? '').toLowerCase();
}

/** Byte de controle (fora TAB/LF/CR/FF/VT) no começo = binário, não texto. */
function temCaractereDeControle(texto: string): boolean {
	for (let i = 0; i < texto.length; i += 1) {
		const c = texto.charCodeAt(i);
		if (c <= 0x08 || (c >= 0x0e && c <= 0x1f)) return true;
	}
	return false;
}

function comecaCom(bytes: Uint8Array, assinatura: number[]): boolean {
	return assinatura.every((b, i) => bytes[i] === b);
}

/**
 * Decide o formato pelo CONTEÚDO (o Android muitas vezes entrega CSV como
 * `application/octet-stream` e o nome sem extensão), com a extensão de desempate.
 * Erros de formato saem como erro com o que fazer — nunca como "0 linhas".
 */
export function lerArquivoImportacao(nome: string, bytes: Uint8Array): ArquivoLido {
	if (!bytes.length) throw new Error('O arquivo está vazio.');
	if (bytes.length > LIMITE_ARQUIVO_BYTES) {
		throw new Error(`Use arquivos de até ${Math.round(LIMITE_ARQUIVO_BYTES / 1024 / 1024)} MB.`);
	}
	const ext = extensao(nome);
	if (comecaCom(bytes, [0x25, 0x50, 0x44, 0x46])) {
		throw new Error('Isto é um PDF. Para orçamento antigo em PDF ou foto, use "Foto de orçamento antigo".');
	}
	if (comecaCom(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
		throw new Error('Planilha XLS antiga. No Excel ou Google Planilhas, salve como XLSX ou CSV e escolha de novo.');
	}
	if (comecaCom(bytes, [0x50, 0x4b, 0x03, 0x04])) {
		if (ext && ext !== 'xlsx' && ext !== 'xlsm') {
			throw new Error('Este arquivo compactado não é uma planilha XLSX. Exporte como XLSX ou CSV.');
		}
		return { formato: 'xlsx', linhas: linhasParaObjetos(limitarLinhas(lerXlsx(bytes))) };
	}
	const texto = decodificarTexto(bytes);
	if (/^\s*BEGIN:VCARD/im.test(texto.slice(0, 2_000)) || ext === 'vcf') {
		const contatos = parseVcf(texto);
		if (!contatos.length) throw new Error('Não encontrei nenhum contato neste arquivo .vcf.');
		return { formato: 'vcf', linhas: contatosParaLinhas(contatos) };
	}
	if (temCaractereDeControle(texto.slice(0, 4_000))) {
		throw new Error('Formato não reconhecido. Use CSV, XLSX ou contatos (.vcf).');
	}
	return { formato: 'csv', linhas: linhasParaObjetos(limitarLinhas(parseCsv(texto))) };
}

// ─── XLSX ──────────────────────────────────────────────────────────────────

function desescaparXml(texto: string): string {
	return texto
		.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
		.replace(/&#x([0-9A-Fa-f]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number.parseInt(d, 10)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

/** Texto de um <si>/<is>: todas as <t> (rich text vem em vários <r>), sem a fonética <rPh>. */
function textoRico(xml: string): string {
	const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
	let texto = '';
	for (const m of semFonetica.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) texto += m[1] ?? '';
	return desescaparXml(texto);
}

function atributo(attrs: string, nome: string): string | undefined {
	return new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(attrs)?.[1];
}

/** "AB12" → 27 (base 0). */
function indiceColuna(ref: string): number {
	const letras = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? '';
	let n = 0;
	for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
	return n - 1;
}

/** Número como o Excel grava ("1.2E+10", "0.30000000000000004") → texto legível. */
function numeroCelula(v: string): string {
	const n = Number(v);
	if (!Number.isFinite(n)) return v;
	if (Number.isInteger(n)) return Math.abs(n) < 1e21 ? n.toFixed(0) : v;
	return String(Math.round(n * 1e10) / 1e10);
}

/** Primeira aba do XLSX como matriz de texto (linhas vazias descartadas). */
export function lerXlsx(bytes: Uint8Array): string[][] {
	let total = 0;
	let arquivos: Record<string, Uint8Array>;
	try {
		arquivos = unzipSync(bytes, {
			filter: (f) => {
				const util = f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml' || f.name.startsWith('xl/worksheets/');
				if (util) total += f.originalSize;
				return util;
			},
		});
	} catch {
		throw new Error('Não consegui abrir esta planilha XLSX (arquivo corrompido ou protegido por senha).');
	}
	if (total > LIMITE_DESCOMPACTADO) throw new Error('A planilha é grande demais para abrir no celular. Divida em arquivos menores.');
	const ler = (caminho: string): string | null => {
		const conteudo = arquivos[caminho];
		return conteudo ? decodificarTexto(conteudo) : null;
	};

	// Primeira aba visível na ORDEM do workbook (não "sheet1.xml", que pode ser outra).
	let caminhoAba = 'xl/worksheets/sheet1.xml';
	const workbook = ler('xl/workbook.xml');
	const rels = ler('xl/_rels/workbook.xml.rels');
	if (workbook && rels) {
		const abas = [...workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)].map((m) => m[1] ?? '');
		const primeira = abas.find((a) => atributo(a, 'state') !== 'hidden') ?? abas[0];
		const rid = primeira ? atributo(primeira, 'r:id') : undefined;
		if (rid) {
			for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
				const attrs = m[1] ?? '';
				if (atributo(attrs, 'Id') !== rid) continue;
				const alvo = atributo(attrs, 'Target') ?? '';
				caminhoAba = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
			}
		}
	}
	const aba = ler(caminhoAba);
	if (!aba) throw new Error('Não encontrei a primeira aba desta planilha.');

	const compartilhadas: string[] = [];
	const shared = ler('xl/sharedStrings.xml');
	if (shared) for (const m of shared.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) compartilhadas.push(textoRico(m[1] ?? ''));

	const linhas: string[][] = [];
	const dados = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(aba)?.[1] ?? '';
	for (const linhaXml of dados.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
		const celulas: string[] = [];
		let proxima = 0;
		for (const c of (linhaXml[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
			const attrs = c[1] ?? '';
			const corpo = c[2] ?? '';
			const ref = atributo(attrs, 'r');
			const coluna = ref ? indiceColuna(ref) : proxima;
			proxima = coluna + 1;
			if (coluna < 0 || coluna > 500) continue;
			const tipo = atributo(attrs, 't') ?? 'n';
			const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
			let valor = '';
			if (tipo === 's') valor = compartilhadas[Number(v)] ?? '';
			else if (tipo === 'inlineStr') valor = textoRico(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(corpo)?.[1] ?? '');
			else if (tipo === 'str') valor = desescaparXml(v ?? '');
			else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : v === '0' ? 'FALSO' : '';
			else if (tipo === 'e') valor = '';
			else valor = v === undefined ? '' : numeroCelula(desescaparXml(v));
			while (celulas.length < coluna) celulas.push('');
			celulas[coluna] = valor.trim();
		}
		if (celulas.some(Boolean)) linhas.push(celulas);
	}
	if (!linhas.length) throw new Error('A primeira aba da planilha está vazia.');
	return linhas;
}
