/**
 * IMPORTAÇÃO "TROQUE EM 5 MINUTOS" — regras puras, compartilhadas por app e painel.
 *
 * Este arquivo é a fonte única de:
 *  - leitura de CSV (RFC-4180, BOM, `;` ou `,`), número em pt-BR e proteção de
 *    fórmula na exportação (antes moravam só no painel, em
 *    `webapp/src/olli/importacao/parser.ts`, que agora reexporta daqui);
 *  - decodificação de bytes (UTF-8 estrito com recuo para Windows-1252, o
 *    "CSV do Excel brasileiro") sem `TextDecoder` — o Hermes já derrubou o APK
 *    com `TextDecoder('latin1')` (memória olli-hermes-emulador);
 *  - vCard (.vcf) exportado pelo app Contatos, inclusive QUOTED-PRINTABLE do Android;
 *  - campos de cada cadastro, apelidos de cabeçalho e modelos de colunas
 *    conhecidos (OLLI, Google Contatos, Outlook). Concorrentes cuja exportação
 *    ainda não conferimos com um arquivo real aparecem como "não conferido" e
 *    caem no reconhecimento por apelido + mapeamento manual — nunca inventamos
 *    a coluna de ninguém;
 *  - a PRÉVIA linha a linha (novo / possível duplicado / erro, com motivo) e a
 *    gravação item a item com relatório próprio por linha.
 *
 * Regras que este arquivo segura (e `scripts/teste-importacao.ts` prende):
 *  - nada é gravado sem prévia; erro de linha aparece como erro com o número da
 *    linha, nunca some calado;
 *  - cadastro atual ilegível (`null`) = "não conferido": a prévia se recusa a
 *    liberar a gravação (3 estados — erro nunca vira "não tem duplicado");
 *  - duplicado (no cadastro ou repetido no próprio arquivo) é avisado e nasce
 *    desmarcado; a decisão de importar mesmo assim é do usuário;
 *  - a falha de um item não derruba os outros e nunca conta como sucesso.
 *
 * Só `import type` e o `UNIDADES` do domínio: o módulo roda igual no Node (testes),
 * no Metro (app) e no Vite (painel).
 */
import { UNIDADES, type Cliente, type ProdutoItem, type ServicoItem } from '../types/index.ts';
import { numeroWhatsAppBR } from '../utils/telefoneWhatsapp.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Primitivas de planilha (movidas do painel — mesmo comportamento)
// ═══════════════════════════════════════════════════════════════════════════

export const LIMITE_ARQUIVO_BYTES = 10 * 1024 * 1024;
export const LIMITE_LINHAS = 5_000;

export type LinhaBruta = Record<string, string>;

/** Acentos separados pelo NFD. Escape em string (o caractere combinante literal é invisível no editor). */
const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');

export function normalizarCabecalho(valor: string): string {
	return valor
		.normalize('NFD')
		.replace(DIACRITICOS, '')
		.trim()
		.toLocaleLowerCase('pt-BR')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function normalizarChave(valor: string | null | undefined): string {
	return String(valor ?? '')
		.normalize('NFD')
		.replace(DIACRITICOS, '')
		.toLocaleLowerCase('pt-BR')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Interpreta R$ 1.234,56 e 1234.56 sem depender do locale da máquina. */
export function numeroBr(valor: string | null | undefined): number | null {
	const texto = String(valor ?? '').trim();
	if (!texto) return null;
	const limpo = texto.replace(/R\$|\s/g, '');
	const ultimoPonto = limpo.lastIndexOf('.');
	const ultimaVirgula = limpo.lastIndexOf(',');
	const normalizado =
		ultimaVirgula > ultimoPonto
			? limpo.replace(/\./g, '').replace(',', '.')
			: limpo.replace(/,/g, '');
	if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
	const numero = Number(normalizado);
	return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null;
}

/**
 * CSV RFC-4180 suficiente para exportações usuais (aspas, CRLF e BOM).
 * A escolha do delimitador é feita fora das aspas, por frequência no cabeçalho.
 */
export function parseCsv(texto: string): string[][] {
	const fonte = texto.replace(/^﻿/, '');
	const primeiraLinha = fonte.split(/\r?\n/, 1)[0] ?? '';
	const delimitador = escolherDelimitador(primeiraLinha);
	const linhas: string[][] = [];
	let linha: string[] = [];
	let celula = '';
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
			celula = '';
			continue;
		}
		if (!emAspas && (caractere === '\n' || caractere === '\r')) {
			if (caractere === '\r' && fonte[i + 1] === '\n') i += 1;
			linha.push(celula.trim());
			if (linha.some(Boolean)) linhas.push(linha);
			linha = [];
			celula = '';
			continue;
		}
		celula += caractere;
	}
	if (emAspas) throw new Error('O CSV termina com aspas abertas. Corrija o arquivo e tente de novo.');
	linha.push(celula.trim());
	if (linha.some(Boolean)) linhas.push(linha);
	return linhas;
}

/** `;` (Excel pt-BR), `,` (Google/Outlook) ou TAB (copiar-colar de planilha). */
function escolherDelimitador(primeiraLinha: string): string {
	const pontoVirgula = contarForaDasAspas(primeiraLinha, ';');
	const virgula = contarForaDasAspas(primeiraLinha, ',');
	const tab = contarForaDasAspas(primeiraLinha, '\t');
	if (tab > pontoVirgula && tab > virgula) return '\t';
	return pontoVirgula > virgula ? ';' : ',';
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
	const cabecalhos = (linhas[0] ?? []).map((c, i) => c.trim() || `coluna_${i + 1}`);
	if (new Set(cabecalhos.map(normalizarCabecalho)).size !== cabecalhos.length) {
		throw new Error('Há cabeçalhos repetidos. Renomeie as colunas para continuar.');
	}
	return linhas.slice(1, LIMITE_LINHAS + 1).map((linha) =>
		Object.fromEntries(cabecalhos.map((cabecalho, i) => [cabecalho, linha[i] ?? ''])),
	);
}

/** Prefixo neutro evita que Excel/Sheets execute uma célula exportada como fórmula. */
export function protegerCsv(valor: unknown): string {
	const texto = String(valor ?? '');
	// Alguns leitores de planilha ignoram espaços/tabulações antes da fórmula.
	// Um número negativo puro é dado, não fórmula. Preservá-lo mantém o
	// round-trip sem abrir a porta para expressões como "-1+CMD(...)".
	const numeroNegativoSeguro = /^\s*-\d+(?:[.,]\d+)?\s*$/.test(texto);
	const protegido = !numeroNegativoSeguro && /^[\t ]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
	return /[",\r\n;]/.test(protegido) ? `"${protegido.replace(/"/g, '""')}"` : protegido;
}

export function criarCsv(cabecalhos: string[], linhas: Array<Array<unknown>>): string {
	return `﻿${[cabecalhos, ...linhas].map((linha) => linha.map(protegerCsv).join(';')).join('\r\n')}\r\n`;
}

export function limitarLinhas(linhas: string[][]): string[][] {
	if (linhas.length > LIMITE_LINHAS + 1) {
		throw new Error(`O arquivo tem mais de ${LIMITE_LINHAS.toLocaleString('pt-BR')} linhas. Divida-o em arquivos menores.`);
	}
	return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Bytes → texto (sem TextDecoder)
// ═══════════════════════════════════════════════════════════════════════════

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VALOR: Record<string, number> = Object.fromEntries([...BASE64].map((c, i) => [c, i]));

/** Base64 (o que o `expo-file-system` devolve) → bytes. Aceita quebra de linha e o alfabeto URL-safe. */
export function base64ParaBytes(base64: string): Uint8Array {
	const limpo = base64.replace(/[\s=]/g, '').replace(/-/g, '+').replace(/_/g, '/');
	const saida = new Uint8Array(Math.floor((limpo.length * 3) / 4));
	let bits = 0;
	let acumulado = 0;
	let posicao = 0;
	for (const caractere of limpo) {
		const valor = BASE64_VALOR[caractere];
		if (valor === undefined) throw new Error('Arquivo ilegível (base64 inválido).');
		acumulado = (acumulado << 6) | valor;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			saida[posicao] = (acumulado >> bits) & 0xff;
			posicao += 1;
		}
	}
	return saida.subarray(0, posicao);
}

/** 0x80–0x9F do Windows-1252 (o resto coincide com Latin-1). */
const CP1252_ALTO = [
	0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
	0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function deCodePoints(pontos: number[]): string {
	let texto = '';
	for (let i = 0; i < pontos.length; i += 4096) texto += String.fromCodePoint(...pontos.slice(i, i + 4096));
	return texto;
}

/** UTF-8 ESTRITO: devolve `null` na primeira sequência inválida (então não é UTF-8). */
export function utf8Estrito(bytes: Uint8Array): string | null {
	const pontos: number[] = [];
	let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
	while (i < bytes.length) {
		const b0 = bytes[i] ?? 0;
		if (b0 < 0x80) { pontos.push(b0); i += 1; continue; }
		let extra: number;
		let ponto: number;
		let minimo: number;
		if (b0 >= 0xc2 && b0 <= 0xdf) { extra = 1; ponto = b0 & 0x1f; minimo = 0x80; }
		else if (b0 >= 0xe0 && b0 <= 0xef) { extra = 2; ponto = b0 & 0x0f; minimo = 0x800; }
		else if (b0 >= 0xf0 && b0 <= 0xf4) { extra = 3; ponto = b0 & 0x07; minimo = 0x10000; }
		else return null;
		for (let k = 1; k <= extra; k += 1) {
			const b = bytes[i + k];
			if (b === undefined || (b & 0xc0) !== 0x80) return null;
			ponto = (ponto << 6) | (b & 0x3f);
		}
		if (ponto < minimo || ponto > 0x10ffff || (ponto >= 0xd800 && ponto <= 0xdfff)) return null;
		pontos.push(ponto);
		i += extra + 1;
	}
	return deCodePoints(pontos);
}

function cp1252(bytes: Uint8Array): string {
	const pontos: number[] = [];
	for (const b of bytes) pontos.push(b >= 0x80 && b <= 0x9f ? (CP1252_ALTO[b - 0x80] ?? b) : b);
	return deCodePoints(pontos);
}

/**
 * Texto de arquivo vindo do celular: UTF-8 (Google, LibreOffice, OLLI) ou
 * Windows-1252 (o "CSV separado por ponto e vírgula" do Excel brasileiro).
 * Ler o segundo como UTF-8 trocaria "João" por "Jo�o" calado.
 */
export function decodificarTexto(bytes: Uint8Array): string {
	return utf8Estrito(bytes) ?? cp1252(bytes);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. vCard (.vcf) — contatos do celular
// ═══════════════════════════════════════════════════════════════════════════

export type ContatoVcf = {
	nome: string;
	telefones: string[];
	endereco: string;
	cidade: string;
	estado: string;
	cep: string;
	empresa: string;
};

function decodificarQuotedPrintable(valor: string): string {
	const bytes: number[] = [];
	for (let i = 0; i < valor.length; i += 1) {
		const c = valor[i];
		if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(valor.slice(i + 1, i + 3))) {
			bytes.push(Number.parseInt(valor.slice(i + 1, i + 3), 16));
			i += 2;
		} else {
			bytes.push(...utf8Bytes(c ?? ''));
		}
	}
	return decodificarTexto(Uint8Array.from(bytes));
}

/** Codificador UTF-8 mínimo (só para caractere não-ASCII que sobrou no meio de um QP). */
function utf8Bytes(texto: string): number[] {
	const bytes: number[] = [];
	for (const ch of texto) {
		const p = ch.codePointAt(0) ?? 0;
		if (p < 0x80) bytes.push(p);
		else if (p < 0x800) bytes.push(0xc0 | (p >> 6), 0x80 | (p & 0x3f));
		else if (p < 0x10000) bytes.push(0xe0 | (p >> 12), 0x80 | ((p >> 6) & 0x3f), 0x80 | (p & 0x3f));
		else bytes.push(0xf0 | (p >> 18), 0x80 | ((p >> 12) & 0x3f), 0x80 | ((p >> 6) & 0x3f), 0x80 | (p & 0x3f));
	}
	return bytes;
}

/** `\,` `\;` `\n` `\\` do vCard 3/4. */
function desescaparVcf(valor: string): string {
	return valor.replace(/\\([\\,;nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c));
}

/** Divide valor estruturado (N, ADR) no `;` não escapado. */
function partesVcf(valor: string): string[] {
	const partes: string[] = [];
	let atual = '';
	for (let i = 0; i < valor.length; i += 1) {
		const c = valor[i];
		if (c === '\\' && i + 1 < valor.length) { atual += c + (valor[i + 1] ?? ''); i += 1; continue; }
		if (c === ';') { partes.push(desescaparVcf(atual).trim()); atual = ''; continue; }
		atual += c;
	}
	partes.push(desescaparVcf(atual).trim());
	return partes;
}

/**
 * Lê um arquivo .vcf (vCard 2.1, 3.0 ou 4.0). Linhas dobradas (espaço/TAB) e
 * a quebra suave do QUOTED-PRINTABLE (linha terminando em `=`, comum no
 * "Exportar contatos" do Android) são juntadas antes de interpretar.
 */
export function parseVcf(texto: string): ContatoVcf[] {
	const brutas = texto.replace(/^﻿/, '').split(/\r\n|\r|\n/);
	const linhas: string[] = [];
	for (let i = 0; i < brutas.length; i += 1) {
		const linha = brutas[i] ?? '';
		if ((linha.startsWith(' ') || linha.startsWith('\t')) && linhas.length) {
			linhas[linhas.length - 1] += linha.slice(1);
			continue;
		}
		let completa = linha;
		if (/QUOTED-PRINTABLE/i.test(completa.split(':', 1)[0] ?? '')) {
			while (completa.endsWith('=') && i + 1 < brutas.length) {
				completa = completa.slice(0, -1) + (brutas[i + 1] ?? '');
				i += 1;
			}
		}
		linhas.push(completa);
	}

	const contatos: ContatoVcf[] = [];
	let atual: (ContatoVcf & { nomeEstruturado: string; telPreferido: string[] }) | null = null;
	for (const linha of linhas) {
		const doisPontos = linha.indexOf(':');
		if (doisPontos < 0) continue;
		const esquerda = linha.slice(0, doisPontos);
		let valor = linha.slice(doisPontos + 1);
		const [nomeBruto = '', ...parametros] = esquerda.split(';');
		const propriedade = (nomeBruto.split('.').pop() ?? '').trim().toUpperCase();
		const params = parametros.map((p) => p.trim().toUpperCase());
		if (propriedade === 'BEGIN' && valor.trim().toUpperCase() === 'VCARD') {
			atual = { nome: '', telefones: [], telPreferido: [], endereco: '', cidade: '', estado: '', cep: '', empresa: '', nomeEstruturado: '' };
			continue;
		}
		if (!atual) continue;
		if (propriedade === 'END') {
			const { nomeEstruturado, telPreferido, ...resto } = atual;
			const telefones = [...telPreferido, ...resto.telefones.filter((t) => !telPreferido.includes(t))];
			contatos.push({ ...resto, telefones, nome: resto.nome || nomeEstruturado || resto.empresa });
			atual = null;
			continue;
		}
		if (params.some((p) => p === 'ENCODING=QUOTED-PRINTABLE' || p === 'QUOTED-PRINTABLE')) valor = decodificarQuotedPrintable(valor);
		if (propriedade === 'FN') atual.nome = desescaparVcf(valor).replace(/\s+/g, ' ').trim();
		else if (propriedade === 'N') {
			const [sobrenome = '', dado = '', meio = ''] = partesVcf(valor);
			atual.nomeEstruturado = [dado, meio, sobrenome].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
		} else if (propriedade === 'ORG') atual.empresa = (partesVcf(valor)[0] ?? '').trim();
		else if (propriedade === 'TEL') {
			const numero = desescaparVcf(valor).replace(/^tel:/i, '').trim();
			if (!numero) continue;
			const tipos = params.join(';');
			const preferido = /PREF|CELL|MOBILE/.test(tipos);
			if (preferido) atual.telPreferido.push(numero);
			else atual.telefones.push(numero);
		} else if (propriedade === 'ADR' && !atual.endereco) {
			// ADR: caixa postal ; complemento ; rua ; cidade ; estado ; CEP ; país
			const [, complemento = '', rua = '', cidade = '', estado = '', cep = ''] = partesVcf(valor);
			atual.endereco = [rua, complemento].filter(Boolean).join(', ');
			atual.cidade = cidade;
			atual.estado = estado;
			atual.cep = cep;
		}
	}
	return contatos;
}

/** Cabeçalhos que a prévia de clientes reconhece sozinha (ver `CAMPOS_IMPORTACAO`). */
export function contatosParaLinhas(contatos: ContatoVcf[]): LinhaBruta[] {
	return contatos.slice(0, LIMITE_LINHAS).map((c) => ({
		Nome: c.nome,
		Telefone: c.telefones.join(' / '),
		Endereço: c.endereco,
		Cidade: c.cidade,
		UF: c.estado,
		CEP: c.cep,
	}));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Campos, apelidos e modelos de colunas
// ═══════════════════════════════════════════════════════════════════════════

export type TipoImportacaoCadastro = 'clientes' | 'produtos' | 'servicos';
export type CampoImportacao =
	| 'nome' | 'telefone' | 'cpf' | 'cnpj' | 'endereco' | 'numero' | 'bairro' | 'complemento'
	| 'cidade' | 'estado' | 'cep' | 'descricao' | 'marca' | 'modelo' | 'unidade' | 'preco' | 'custo';

export type DefinicaoCampo = { id: CampoImportacao; rotulo: string; obrigatorio?: boolean; aliases: string[] };

/**
 * Apelidos JÁ NORMALIZADOS (`normalizarCabecalho`: sem acento, minúsculo, só
 * letras/números separados por espaço). Os em inglês cobrem Google Contatos e
 * Outlook, que exportam o cabeçalho em inglês mesmo com o celular em português.
 */
export const CAMPOS_IMPORTACAO: Record<TipoImportacaoCadastro | 'fornecedor', DefinicaoCampo[]> = {
	clientes: [
		{ id: 'nome', rotulo: 'Nome', obrigatorio: true, aliases: ['nome', 'cliente', 'nome do cliente', 'nome completo', 'razao social', 'razao', 'name', 'full name', 'nome cliente'] },
		{ id: 'telefone', rotulo: 'Telefone', aliases: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'telefone 1', 'celular whatsapp', 'contato', 'phone', 'mobile phone', 'phone 1 value', 'primary phone', 'home phone', 'business phone'] },
		{ id: 'cpf', rotulo: 'CPF (ou CPF/CNPJ)', aliases: ['cpf', 'documento', 'cpf cnpj', 'cpf ou cnpj', 'doc'] },
		{ id: 'cnpj', rotulo: 'CNPJ', aliases: ['cnpj'] },
		{ id: 'endereco', rotulo: 'Endereço', aliases: ['endereco', 'logradouro', 'rua', 'endereco completo', 'address 1 street', 'home street', 'business street', 'address 1 formatted'] },
		{ id: 'numero', rotulo: 'Número', aliases: ['numero', 'n', 'no', 'num', 'nro'] },
		{ id: 'bairro', rotulo: 'Bairro', aliases: ['bairro'] },
		{ id: 'complemento', rotulo: 'Complemento', aliases: ['complemento', 'apto', 'apartamento'] },
		{ id: 'cidade', rotulo: 'Cidade', aliases: ['cidade', 'municipio', 'address 1 city', 'home city', 'business city'] },
		{ id: 'estado', rotulo: 'UF', aliases: ['uf', 'estado', 'address 1 region', 'home state', 'business state'] },
		{ id: 'cep', rotulo: 'CEP', aliases: ['cep', 'address 1 postal code', 'home postal code', 'business postal code'] },
	],
	produtos: [
		{ id: 'nome', rotulo: 'Produto', obrigatorio: true, aliases: ['nome', 'produto', 'descricao', 'item', 'nome do produto', 'material', 'peca'] },
		{ id: 'marca', rotulo: 'Marca', aliases: ['marca', 'fabricante'] },
		{ id: 'modelo', rotulo: 'Modelo', aliases: ['modelo', 'referencia', 'sku', 'codigo'] },
		{ id: 'descricao', rotulo: 'Descrição', aliases: ['descricao', 'detalhes', 'observacao'] },
		{ id: 'unidade', rotulo: 'Unidade', aliases: ['unidade', 'un', 'unid', 'medida', 'und'] },
		{ id: 'preco', rotulo: 'Preço de venda', obrigatorio: true, aliases: ['preco', 'valor', 'venda', 'preco venda', 'preco de venda', 'valor unitario', 'preco unitario', 'valor venda'] },
		{ id: 'custo', rotulo: 'Custo', aliases: ['custo', 'preco custo', 'preco de custo', 'valor custo'] },
	],
	servicos: [
		{ id: 'nome', rotulo: 'Serviço', obrigatorio: true, aliases: ['nome', 'servico', 'descricao', 'item', 'nome do servico'] },
		{ id: 'descricao', rotulo: 'Descrição', aliases: ['descricao', 'detalhes', 'observacao'] },
		{ id: 'unidade', rotulo: 'Unidade', aliases: ['unidade', 'un', 'unid', 'medida', 'und'] },
		{ id: 'preco', rotulo: 'Preço de venda', obrigatorio: true, aliases: ['preco', 'valor', 'venda', 'preco venda', 'preco de venda', 'valor unitario', 'mao de obra', 'valor servico'] },
		{ id: 'custo', rotulo: 'Custo', aliases: ['custo', 'preco custo', 'preco de custo', 'valor custo'] },
	],
	fornecedor: [
		{ id: 'nome', rotulo: 'Produto', obrigatorio: true, aliases: ['nome', 'produto', 'descricao', 'item'] },
		{ id: 'marca', rotulo: 'Marca', aliases: ['marca', 'fabricante'] },
		{ id: 'modelo', rotulo: 'Modelo', aliases: ['modelo', 'referencia', 'sku'] },
		{ id: 'custo', rotulo: 'Novo custo', obrigatorio: true, aliases: ['custo', 'preco', 'valor', 'preco custo'] },
	],
};

/** Coluna sintética criada por um modelo (ex.: Google separa nome e sobrenome). */
export const COLUNA_NOME_COMPOSTO = 'Nome (montado)';

export type ModeloColunas = {
	id: string;
	rotulo: string;
	/**
	 * `true` = colunas conferidas contra um arquivo real desse formato.
	 * `false` = ainda não temos a exportação real: o OLLI tenta pelos apelidos
	 * e o usuário confere o mapeamento. Nunca afirmamos coluna que não vimos.
	 */
	conferido: boolean;
	/** Cabeçalhos normalizados que, juntos, identificam o formato. Vazio = não detecta sozinho. */
	assinatura: string[];
	/** Partes do nome, na ordem, quando o formato separa nome e sobrenome. */
	partesNome?: string[];
	/** Preferência explícita de coluna por campo (cabeçalhos normalizados). */
	colunas?: Partial<Record<CampoImportacao, string[]>>;
	nota: string;
};

export const MODELOS_COLUNAS: ModeloColunas[] = [
	{
		id: 'olli', rotulo: 'OLLI (Central de dados)', conferido: true,
		// Exatamente as colunas que a exportação CSV do painel grava.
		assinatura: ['nome', 'telefone', 'cpf', 'cnpj', 'endereco', 'cidade', 'estado', 'cep'],
		nota: 'CSV exportado pela Central de dados do painel OLLI.',
	},
	{
		id: 'google_contatos', rotulo: 'Google Contatos', conferido: true,
		assinatura: ['first name', 'last name', 'phone 1 value'],
		partesNome: ['first name', 'middle name', 'last name'],
		colunas: { telefone: ['phone 1 value', 'phone 2 value'], endereco: ['address 1 street', 'address 1 formatted'], cidade: ['address 1 city'], estado: ['address 1 region'], cep: ['address 1 postal code'] },
		nota: 'contacts.google.com → Exportar → "CSV do Google".',
	},
	{
		id: 'google_contatos_antigo', rotulo: 'Google Contatos (formato antigo)', conferido: true,
		assinatura: ['given name', 'family name', 'phone 1 value'],
		partesNome: ['given name', 'additional name', 'family name'],
		colunas: { nome: ['name'], telefone: ['phone 1 value', 'phone 2 value'], endereco: ['address 1 street', 'address 1 formatted'], cidade: ['address 1 city'], estado: ['address 1 region'], cep: ['address 1 postal code'] },
		nota: 'Exportação "Google CSV" anterior a 2023.',
	},
	{
		id: 'outlook', rotulo: 'Outlook', conferido: true,
		assinatura: ['first name', 'last name', 'mobile phone'],
		partesNome: ['first name', 'middle name', 'last name'],
		colunas: { telefone: ['mobile phone', 'primary phone', 'business phone', 'home phone'], endereco: ['home street', 'business street'], cidade: ['home city', 'business city'], estado: ['home state', 'business state'], cep: ['home postal code', 'business postal code'] },
		nota: 'Pessoas do Outlook → Gerenciar → Exportar contatos.',
	},
	{
		id: 'profissa', rotulo: 'Profissa / Orçamento PRO', conferido: false, assinatura: [],
		nota: 'Ainda não conferimos uma exportação real do Profissa. O OLLI reconhece colunas comuns (Nome, Telefone, Celular, WhatsApp, Endereço, Valor…) e você confere o mapeamento abaixo.',
	},
	{
		id: 'climabot', rotulo: 'Clima Bot', conferido: false, assinatura: [],
		nota: 'Ainda não conferimos uma exportação real do Clima Bot. O OLLI reconhece colunas comuns e você confere o mapeamento abaixo.',
	},
	{
		id: 'refrimaq', rotulo: 'Refrimaq', conferido: false, assinatura: [],
		nota: 'Ainda não conferimos uma exportação real da Refrimaq. O OLLI reconhece colunas comuns e você confere o mapeamento abaixo.',
	},
	{
		id: 'generica', rotulo: 'Outra planilha', conferido: true, assinatura: [],
		nota: 'Qualquer planilha com uma linha de cabeçalho. Confira o mapeamento abaixo.',
	},
];

export function modeloPorId(id: string | null | undefined): ModeloColunas | undefined {
	return MODELOS_COLUNAS.find((m) => m.id === id);
}

/** Primeiro modelo com assinatura completa nos cabeçalhos; `null` se nenhum. */
export function detectarModelo(cabecalhos: string[]): ModeloColunas | null {
	const presentes = new Set(cabecalhos.map(normalizarCabecalho));
	return MODELOS_COLUNAS.find((m) => m.assinatura.length > 0 && m.assinatura.every((c) => presentes.has(c))) ?? null;
}

/**
 * Acrescenta colunas derivadas do modelo (hoje: nome montado de nome + sobrenome).
 * Não altera as colunas originais — o mapeamento manual continua vendo todas.
 */
export function prepararLinhas(linhas: LinhaBruta[], modelo: ModeloColunas | null | undefined): LinhaBruta[] {
	if (!modelo?.partesNome?.length || !linhas.length) return linhas;
	const cabecalhos = Object.keys(linhas[0] ?? {});
	const porNormal = new Map(cabecalhos.map((c) => [normalizarCabecalho(c), c]));
	const colunasNome = modelo.partesNome.map((p) => porNormal.get(p)).filter((c): c is string => Boolean(c));
	if (!colunasNome.length || porNormal.has(normalizarCabecalho(COLUNA_NOME_COMPOSTO))) return linhas;
	return linhas.map((linha) => ({
		...linha,
		[COLUNA_NOME_COMPOSTO]: colunasNome.map((c) => (linha[c] ?? '').trim()).filter(Boolean).join(' '),
	}));
}

/**
 * Sugere a coluna de cada campo: primeiro a preferência do modelo, depois os
 * apelidos. Uma coluna nunca é usada por dois campos. O usuário confere tudo.
 */
export function mapeamentoInicial(
	tipo: TipoImportacaoCadastro | 'fornecedor',
	cabecalhos: string[],
	modelo?: ModeloColunas | null,
): Record<string, string> {
	const usados = new Set<string>();
	const porNormal = new Map(cabecalhos.map((c) => [normalizarCabecalho(c), c]));
	const pegar = (normal: string): string | undefined => {
		const original = porNormal.get(normal);
		return original && !usados.has(original) ? original : undefined;
	};
	return Object.fromEntries(
		CAMPOS_IMPORTACAO[tipo].map((campo) => {
			let achado: string | undefined;
			if (campo.id === 'nome' && modelo?.partesNome?.length && porNormal.has(normalizarCabecalho(COLUNA_NOME_COMPOSTO))) {
				achado = pegar(normalizarCabecalho(COLUNA_NOME_COMPOSTO));
			}
			for (const preferida of modelo?.colunas?.[campo.id] ?? []) achado ??= pegar(preferida);
			for (const alias of campo.aliases) achado ??= pegar(alias);
			if (achado) usados.add(achado);
			return [campo.id, achado ?? ''];
		}),
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Normalização de campos brasileiros
// ═══════════════════════════════════════════════════════════════════════════

const soDigitos = (valor?: string | null): string => (valor ?? '').replace(/\D/g, '');

export type TelefoneLido = { ok: true; digitos: string; formatado: string } | { ok: false; motivo: string } | { ok: true; digitos: ''; formatado: '' };

function formatarTelefone(d: string): string {
	return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/**
 * Telefone brasileiro com DDD. Aceita +55, 0 de operadora/tronco e vários
 * números na mesma célula ("11 99999-0000 / 11 3333-4444": vale o primeiro válido).
 * Sem DDD (8–9 dígitos) usa o `dddPadrao`, se o usuário informou um.
 */
export function lerTelefone(valor: string, dddPadrao?: string): TelefoneLido {
	const candidatos = valor.split(/[\/;,|]| ou /i).map((v) => v.trim()).filter(Boolean);
	if (!candidatos.length) return { ok: true, digitos: '', formatado: '' };
	const ddd = soDigitos(dddPadrao).slice(0, 2);
	let motivo = '';
	for (const candidato of candidatos) {
		let d = soDigitos(candidato);
		if (!d) continue;
		if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
		else if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.replace(/^0+/, '');
		if ((d.length === 8 || d.length === 9) && ddd.length === 2) d = ddd + d;
		if ((d.length === 10 || d.length === 11) && !d.startsWith('0')) return { ok: true, digitos: d, formatado: formatarTelefone(d) };
		motivo = d.length === 8 || d.length === 9
			? `Telefone sem DDD (${candidato}). Informe o DDD padrão ou corrija no arquivo.`
			: `Telefone inválido (${candidato}).`;
	}
	return { ok: false, motivo: motivo || 'Telefone inválido.' };
}

function cpfValido(d: string): boolean {
	if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
	const dv = (n: number) => {
		let soma = 0;
		for (let i = 0; i < n; i += 1) soma += Number(d[i]) * (n + 1 - i);
		const r = (soma * 10) % 11;
		return r === 10 ? 0 : r;
	};
	return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d: string): boolean {
	if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
	const dv = (base: string) => {
		const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
		const soma = [...base].reduce((acc, c, i) => acc + Number(c) * (pesos[i] ?? 0), 0);
		const r = soma % 11;
		return r < 2 ? 0 : 11 - r;
	};
	return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13]);
}

const formatarCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
const formatarCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

const UFS: Record<string, string> = {
	acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF',
	'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
	'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI',
	'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
	'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const SIGLAS_UF = new Set(Object.values(UFS));

export function lerUf(valor: string): string | null {
	const normal = normalizarChave(valor);
	if (!normal) return '';
	const sigla = normal.toUpperCase();
	if (SIGLAS_UF.has(sigla)) return sigla;
	return UFS[normal] ?? null;
}

const APELIDOS_UNIDADE: Record<string, string> = {
	un: 'un', und: 'un', unid: 'un', unidade: 'un', uni: 'un', u: 'un', pc: 'pç', pca: 'pç', peca: 'pç', pecas: 'pç',
	m: 'm', metro: 'm', metros: 'm', mt: 'm', ml: 'm', m2: 'm²', 'm 2': 'm²', 'metro quadrado': 'm²', m3: 'm³', 'm 3': 'm³',
	kg: 'kg', quilo: 'kg', l: 'L', lt: 'L', litro: 'L', litros: 'L', h: 'h', hr: 'h', hora: 'h', horas: 'h',
	dia: 'dia', dias: 'dia', diaria: 'dia', cx: 'cx', caixa: 'cx', serv: 'un', servico: 'un', vb: 'un', verba: 'un',
};

/** Unidade do catálogo OLLI (`UNIDADES`). Desconhecida volta `null` (vira 'un' com aviso). */
export function lerUnidade(valor: string): string | null {
	const bruto = valor.trim();
	if (!bruto) return 'un';
	if ((UNIDADES as string[]).includes(bruto)) return bruto;
	const normal = normalizarChave(bruto.replace('²', '2').replace('³', '3'));
	const achada = APELIDOS_UNIDADE[normal];
	return achada && (UNIDADES as string[]).includes(achada) ? achada : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Prévia linha a linha
// ═══════════════════════════════════════════════════════════════════════════

export type TipoLinhaImportacao = 'cliente' | 'produto' | 'servico';
export type AcaoLinhaImportacao = 'novo' | 'duplicado' | 'erro';

export type RegistroCliente = Omit<Cliente, 'id' | 'criadoEm' | 'excluidoEm' | 'atualizadoEm'>;
export type RegistroItem = Omit<ProdutoItem, 'id' | 'criadoEm' | 'excluidoEm' | 'atualizadoEm' | 'fotoUri'>;

export type LinhaPrevia = {
	/** Estável dentro da prévia: `tipo:índice`. */
	chave: string;
	tipo: TipoLinhaImportacao;
	/** Como o usuário acha a linha no arquivo: "Linha 7", "Contato 12", "Item 3 da foto". */
	rotulo: string;
	acao: AcaoLinhaImportacao;
	nome: string;
	/** Telefone ou "R$ 120,00 · un" — o que aparece embaixo do nome. */
	detalhe: string;
	motivo: string;
	avisos: string[];
	registro?: RegistroCliente | RegistroItem;
};

/** `null` = a leitura falhou (ou o papel não pode ler). Nunca use `[]` para "não sei". */
export type ExistentesImportacao = {
	clientes: Array<Pick<Cliente, 'id' | 'nome' | 'telefone' | 'cpf' | 'cnpj' | 'excluidoEm'>> | null;
	produtos: Array<Pick<ProdutoItem, 'id' | 'nome' | 'marca' | 'modelo' | 'unidade' | 'excluidoEm'>> | null;
	servicos: Array<Pick<ServicoItem, 'id' | 'nome' | 'unidade' | 'excluidoEm'>> | null;
};

export type OpcoesPrevia = {
	/** DDD usado nos telefones sem DDD (contatos salvos como "99999-0000"). */
	dddPadrao?: string;
	/** Prefixo do rótulo da linha: "Linha" (planilha, conta o cabeçalho), "Contato", "Item". */
	rotulo?: 'linha' | 'contato' | 'item';
	/**
	 * Planilha exige preço (como a Central de dados). A foto lida pela IA pode
	 * vir sem preço: aí entra com R$ 0 e um aviso para definir antes de orçar.
	 */
	precoObrigatorio?: boolean;
};

function rotuloDa(indice: number, rotulo: OpcoesPrevia['rotulo']): string {
	if (rotulo === 'contato') return `Contato ${indice + 1}`;
	if (rotulo === 'item') return `Item ${indice + 1}`;
	return `Linha ${indice + 2}`;
}

function valorDe(linha: LinhaBruta, mapeamento: Record<string, string>, campo: CampoImportacao): string {
	const coluna = mapeamento[campo];
	return coluna ? String(linha[coluna] ?? '').replace(/\s+/g, ' ').trim() : '';
}

const moeda = (valor: number) => `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ativos = <T extends { excluidoEm?: string }>(lista: T[] | null): T[] | null => (lista ? lista.filter((i) => !i.excluidoEm) : null);

export function chaveCatalogo(nome: string, marca?: string | null, modelo?: string | null): string {
	return [nome, marca, modelo].map((v) => normalizarChave(v)).join('|');
}

function previaClientes(linhas: LinhaBruta[], mapeamento: Record<string, string>, existentes: ExistentesImportacao, opcoes: OpcoesPrevia): LinhaPrevia[] {
	const atuais = ativos(existentes.clientes) ?? [];
	const vistosTel = new Map<string, string>();
	const vistosDoc = new Map<string, string>();
	const vistosNome = new Map<string, string>();
	return linhas.map((linha, indice) => {
		const base = { chave: `cliente:${indice}`, tipo: 'cliente' as const, rotulo: rotuloDa(indice, opcoes.rotulo) };
		const nome = valorDe(linha, mapeamento, 'nome').slice(0, 160);
		const telefoneBruto = valorDe(linha, mapeamento, 'telefone');
		if (!nome) {
			return { ...base, acao: 'erro' as const, nome: telefoneBruto || '(sem nome)', detalhe: '', motivo: 'Sem nome — não dá para cadastrar.', avisos: [] };
		}
		const avisos: string[] = [];
		const tel = lerTelefone(telefoneBruto, opcoes.dddPadrao);
		if (!tel.ok) return { ...base, acao: 'erro' as const, nome, detalhe: telefoneBruto, motivo: tel.motivo, avisos };
		if (!tel.digitos) avisos.push('Sem telefone.');

		const registro: RegistroCliente = { nome, telefone: tel.formatado };
		let documento = '';
		for (const campo of ['cpf', 'cnpj'] as const) {
			const bruto = valorDe(linha, mapeamento, campo);
			const d = soDigitos(bruto);
			if (!d) continue;
			if (d.length === 11 && cpfValido(d)) { registro.cpf = formatarCpf(d); documento = d; }
			else if (d.length === 14 && cnpjValido(d)) { registro.cnpj = formatarCnpj(d); documento = d; }
			else avisos.push(`Documento inválido (${bruto}) — não foi importado.`);
		}
		const endereco = valorDe(linha, mapeamento, 'endereco');
		const numero = valorDe(linha, mapeamento, 'numero');
		const bairro = valorDe(linha, mapeamento, 'bairro');
		const enderecoCompleto = [[endereco, numero].filter(Boolean).join(', '), bairro].filter(Boolean).join(' - ');
		if (enderecoCompleto) registro.endereco = enderecoCompleto.slice(0, 300);
		const complemento = valorDe(linha, mapeamento, 'complemento');
		if (complemento) registro.complemento = complemento.slice(0, 120);
		const cidade = valorDe(linha, mapeamento, 'cidade');
		if (cidade) registro.cidade = cidade.slice(0, 120);
		const ufBruta = valorDe(linha, mapeamento, 'estado');
		const uf = lerUf(ufBruta);
		if (uf) registro.estado = uf;
		else if (uf === null) avisos.push(`UF desconhecida (${ufBruta}) — não foi importada.`);
		const cepBruto = valorDe(linha, mapeamento, 'cep');
		const cep = soDigitos(cepBruto);
		if (cep.length === 8) registro.cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;
		else if (cep) avisos.push(`CEP inválido (${cepBruto}) — não foi importado.`);

		const nomeNorm = normalizarChave(nome);
		// Mesma régua do WhatsApp (`numeroWhatsAppBR`): "+55 (11) 99999-0000", "011 99999-0000" e
		// "11999990000" são a MESMA pessoa — comparar só os dígitos crus deixava passar o cliente repetido.
		const alvoWhats = tel.digitos.length >= 10 ? numeroWhatsAppBR(tel.digitos) : null;
		const noCadastro = atuais.find((c) => {
			if (tel.digitos.length >= 10 && soDigitos(c.telefone) === tel.digitos) return true;
			if (alvoWhats && numeroWhatsAppBR(c.telefone) === alvoWhats) return true;
			if (documento && (soDigitos(c.cpf) === documento || soDigitos(c.cnpj) === documento)) return true;
			return normalizarChave(c.nome) === nomeNorm;
		});
		let motivo = 'Cliente novo.';
		let acao: AcaoLinhaImportacao = 'novo';
		if (noCadastro) {
			acao = 'duplicado';
			motivo = `Já existe "${noCadastro.nome}" no seu cadastro.`;
		} else {
			const repetido = (tel.digitos && vistosTel.get(tel.digitos)) || (documento && vistosDoc.get(documento)) || vistosNome.get(nomeNorm);
			if (repetido) { acao = 'duplicado'; motivo = `Repetido no arquivo (${repetido}).`; }
		}
		if (tel.digitos && !vistosTel.has(tel.digitos)) vistosTel.set(tel.digitos, `${base.rotulo}: ${nome}`);
		if (documento && !vistosDoc.has(documento)) vistosDoc.set(documento, `${base.rotulo}: ${nome}`);
		if (!vistosNome.has(nomeNorm)) vistosNome.set(nomeNorm, `${base.rotulo}: ${nome}`);
		return { ...base, acao, nome, detalhe: tel.formatado || 'Sem telefone', motivo, avisos, registro };
	});
}

function previaCatalogo(tipo: 'produto' | 'servico', linhas: LinhaBruta[], mapeamento: Record<string, string>, existentes: ExistentesImportacao, opcoes: OpcoesPrevia): LinhaPrevia[] {
	const atuais = ativos(tipo === 'produto' ? existentes.produtos : existentes.servicos) ?? [];
	const chaveDe = (nome: string, marca?: string | null, modelo?: string | null, unidade?: string | null) =>
		tipo === 'produto' ? chaveCatalogo(nome, marca, modelo) : `${normalizarChave(nome)}|${normalizarChave(unidade ?? 'un')}`;
	const vistos = new Map<string, string>();
	const precoObrigatorio = opcoes.precoObrigatorio ?? true;
	return linhas.map((linha, indice) => {
		const base = { chave: `${tipo}:${indice}`, tipo, rotulo: rotuloDa(indice, opcoes.rotulo) };
		const nome = valorDe(linha, mapeamento, 'nome').slice(0, 160);
		if (!nome) return { ...base, acao: 'erro' as const, nome: '(sem nome)', detalhe: '', motivo: 'Sem nome — não dá para cadastrar.', avisos: [] };
		const avisos: string[] = [];
		const precoBruto = valorDe(linha, mapeamento, 'preco');
		let preco = numeroBr(precoBruto);
		if (preco == null || preco < 0) {
			if (precoObrigatorio || (precoBruto && preco == null) || (preco != null && preco < 0)) {
				return { ...base, acao: 'erro' as const, nome, detalhe: precoBruto, motivo: precoBruto ? `Preço inválido (${precoBruto}).` : 'Sem preço de venda.', avisos };
			}
			preco = 0;
		}
		if (preco === 0) avisos.push('Sem preço — defina antes de usar no orçamento.');
		const unidadeBruta = valorDe(linha, mapeamento, 'unidade');
		let unidade = lerUnidade(unidadeBruta);
		if (!unidade) { avisos.push(`Unidade "${unidadeBruta}" não existe no OLLI — ficou "un".`); unidade = 'un'; }
		const registro: RegistroItem = { nome, preco, unidade };
		const descricao = valorDe(linha, mapeamento, 'descricao');
		if (descricao && normalizarChave(descricao) !== normalizarChave(nome)) registro.descricao = descricao.slice(0, 500);
		const custoBruto = valorDe(linha, mapeamento, 'custo');
		const custo = numeroBr(custoBruto);
		if (custo != null && custo >= 0) registro.custo = custo;
		else if (custoBruto) avisos.push(`Custo inválido (${custoBruto}) — não foi importado.`);
		if (tipo === 'produto') {
			const marca = valorDe(linha, mapeamento, 'marca');
			const modelo = valorDe(linha, mapeamento, 'modelo');
			if (marca) registro.marca = marca.slice(0, 80);
			if (modelo) registro.modelo = modelo.slice(0, 80);
		}
		const chave = chaveDe(nome, registro.marca, registro.modelo, unidade);
		const noCadastro = atuais.find((item) => chaveDe(item.nome, (item as { marca?: string }).marca, (item as { modelo?: string }).modelo, item.unidade) === chave);
		let acao: AcaoLinhaImportacao = 'novo';
		let motivo = tipo === 'produto' ? 'Produto novo.' : 'Serviço novo.';
		if (noCadastro) { acao = 'duplicado'; motivo = `Já existe "${noCadastro.nome}" no seu catálogo.`; }
		else if (vistos.has(chave)) { acao = 'duplicado'; motivo = `Repetido no arquivo (${vistos.get(chave)}).`; }
		if (!vistos.has(chave)) vistos.set(chave, `${base.rotulo}: ${nome}`);
		return { ...base, acao, nome, detalhe: `${moeda(preco)} · ${unidade}`, motivo, avisos, registro };
	});
}

const TIPO_LINHA: Record<TipoImportacaoCadastro, TipoLinhaImportacao> = { clientes: 'cliente', produtos: 'produto', servicos: 'servico' };

/** Prévia de uma planilha/lista de contatos de UM tipo de cadastro. */
export function montarPrevia(
	tipo: TipoImportacaoCadastro,
	linhas: LinhaBruta[],
	mapeamento: Record<string, string>,
	existentes: ExistentesImportacao,
	opcoes: OpcoesPrevia = {},
): LinhaPrevia[] {
	const linhaTipo = TIPO_LINHA[tipo];
	return linhaTipo === 'cliente'
		? previaClientes(linhas, mapeamento, existentes, opcoes)
		: previaCatalogo(linhaTipo, linhas, mapeamento, existentes, opcoes);
}

/** A prévia só libera gravação quando o cadastro do tipo foi LIDO (não `null`). */
export function previaConferida(tipos: Iterable<TipoLinhaImportacao>, existentes: ExistentesImportacao): boolean {
	for (const tipo of tipos) {
		const lista = tipo === 'cliente' ? existentes.clientes : tipo === 'produto' ? existentes.produtos : existentes.servicos;
		if (lista === null) return false;
	}
	return true;
}

/**
 * Seleção inicial: os novos entram marcados — exceto CONTATOS do celular, onde
 * a agenda pessoal (família, amigos) se mistura com clientes: lá o usuário marca.
 * Duplicado nasce desmarcado; erro nunca é marcável.
 */
export function selecaoInicialImportacao(previa: LinhaPrevia[], origem: 'planilha' | 'contatos' | 'foto'): Set<string> {
	if (origem === 'contatos') return new Set();
	return new Set(previa.filter((l) => l.acao === 'novo').map((l) => l.chave));
}

export type TotaisPrevia = Record<AcaoLinhaImportacao, number>;

export function totaisPrevia(previa: LinhaPrevia[]): TotaisPrevia {
	const totais: TotaisPrevia = { novo: 0, duplicado: 0, erro: 0 };
	for (const l of previa) totais[l.acao] += 1;
	return totais;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Foto de orçamento antigo (prévia do Autopilot → mesma prévia)
// ═══════════════════════════════════════════════════════════════════════════

/** Forma mínima do candidato da IA (services/iaAutopilot.ts), sem importar o cliente HTTP. */
export type CandidatoIa = { tipo: string; nome: string; telefone?: string; descricao: string; unidade: string; precoSugerido: number };
export type CandidatosIa = {
	clientes: CandidatoIa[];
	produtos: CandidatoIa[];
	servicos: CandidatoIa[];
	orcamento: { clienteNome: string; itens: CandidatoIa[] };
};

const precoTexto = (v: number) => (Number.isFinite(v) && v > 0 ? String(v) : '');

/**
 * Converte a leitura da IA nas mesmas linhas da planilha. Itens do orçamento
 * que a IA não classificou viram serviço, salvo quando o nome bate com um
 * produto lido ou já cadastrado (mesma regra do Autopilot → Orçar).
 */
export function linhasDaFoto(candidatos: CandidatosIa, nomesProdutosCadastro: string[] = []): Record<TipoImportacaoCadastro, LinhaBruta[]> {
	const clientes: LinhaBruta[] = candidatos.clientes.map((c) => ({ Nome: c.nome, Telefone: c.telefone ?? '' }));
	const nomeCliente = candidatos.orcamento.clienteNome.trim();
	if (nomeCliente && !clientes.some((c) => normalizarChave(c.Nome) === normalizarChave(nomeCliente))) {
		clientes.push({ Nome: nomeCliente, Telefone: '' });
	}
	const item = (c: CandidatoIa): LinhaBruta => ({ Nome: c.nome, Descrição: c.descricao, Unidade: c.unidade, Preço: precoTexto(c.precoSugerido) });
	const produtos = candidatos.produtos.map(item);
	const servicos = candidatos.servicos.map(item);
	const conhecidos = new Set([...candidatos.produtos, ...candidatos.servicos].map((c) => normalizarChave(c.nome)));
	const nomesProduto = new Set([...candidatos.produtos.map((c) => c.nome), ...nomesProdutosCadastro].map(normalizarChave));
	for (const it of candidatos.orcamento.itens) {
		const n = normalizarChave(it.nome);
		if (!n || conhecidos.has(n)) continue;
		conhecidos.add(n);
		if (it.tipo === 'produto' || nomesProduto.has(n)) produtos.push(item(it));
		else servicos.push(item(it));
	}
	return { clientes, produtos, servicos };
}

/** Mapeamento fixo das linhas montadas aqui (contatos e foto). */
export const MAPEAMENTO_FIXO: Record<TipoImportacaoCadastro, Record<string, string>> = {
	clientes: { nome: 'Nome', telefone: 'Telefone', endereco: 'Endereço', cidade: 'Cidade', estado: 'UF', cep: 'CEP' },
	produtos: { nome: 'Nome', descricao: 'Descrição', unidade: 'Unidade', preco: 'Preço' },
	servicos: { nome: 'Nome', descricao: 'Descrição', unidade: 'Unidade', preco: 'Preço' },
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. Gravação item a item, com relatório por linha
// ═══════════════════════════════════════════════════════════════════════════

export type ResultadoLinhaImportacao =
	| { chave: string; rotulo: string; tipo: TipoLinhaImportacao; nome: string; ok: true; id: string }
	| { chave: string; rotulo: string; tipo: TipoLinhaImportacao; nome: string; ok: false; erro: string };

export type RelatorioImportacao = { itens: ResultadoLinhaImportacao[]; gravados: number; falhas: number };

export type DependenciasImportacao = {
	saveCliente: (c: Cliente) => Promise<void>;
	saveProduto: (p: ProdutoItem) => Promise<void>;
	saveServico: (s: ServicoItem) => Promise<void>;
	gerarId: () => string;
	agora: () => string;
	/** Mesmas portas das telas: Clientes (`ver_clientes`) e catálogo (`ver_valores_agregados`). */
	permissoes: { clientes: boolean; catalogo: boolean };
	/** Progresso para a tela (gravados+falhas, total). */
	aoProgredir?: (feitos: number, total: number) => void;
};

const ROTULO_TIPO: Record<TipoLinhaImportacao, string> = { cliente: 'cliente', produto: 'produto', servico: 'serviço' };

/**
 * Grava as linhas marcadas, uma por uma, pelos MESMOS saves das telas de
 * cadastro (que carimbam o relógio de sync e espelham na nuvem). Linha com erro
 * na prévia nunca é gravada, mesmo que alguém a marque.
 */
export async function gravarImportacao(
	previa: LinhaPrevia[],
	selecionados: ReadonlySet<string>,
	deps: DependenciasImportacao,
): Promise<RelatorioImportacao> {
	const alvo = previa.filter((l) => selecionados.has(l.chave));
	const itens: ResultadoLinhaImportacao[] = [];
	for (const l of alvo) {
		const base = { chave: l.chave, rotulo: l.rotulo, tipo: l.tipo, nome: l.nome };
		const falhar = (erro: string) => itens.push({ ...base, ok: false, erro });
		if (l.acao === 'erro' || !l.registro) falhar(l.motivo || 'Linha com erro — corrija no arquivo.');
		else if (l.tipo === 'cliente' ? !deps.permissoes.clientes : !deps.permissoes.catalogo) {
			falhar(`Seu papel na empresa não permite cadastrar ${ROTULO_TIPO[l.tipo]}.`);
		} else {
			const id = deps.gerarId();
			const criadoEm = deps.agora();
			try {
				if (l.tipo === 'cliente') await deps.saveCliente({ ...(l.registro as RegistroCliente), id, criadoEm });
				else if (l.tipo === 'produto') await deps.saveProduto({ ...(l.registro as RegistroItem), id, criadoEm });
				else {
					const { marca: _m, modelo: _mo, ...servico } = l.registro as RegistroItem;
					await deps.saveServico({ ...servico, id, criadoEm });
				}
				itens.push({ ...base, ok: true, id });
			} catch (erro) {
				const detalhe = (erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '').trim().slice(0, 160);
				falhar(`Não foi gravado no aparelho${detalhe ? `: ${detalhe}` : '.'}`);
			}
		}
		deps.aoProgredir?.(itens.length, alvo.length);
	}
	const gravados = itens.filter((i) => i.ok).length;
	return { itens, gravados, falhas: itens.length - gravados };
}

export function resumoRelatorio(r: RelatorioImportacao): string {
	if (!r.itens.length) return 'Nenhuma linha marcada para importar.';
	const ok = `${r.gravados} ${r.gravados === 1 ? 'registro importado' : 'registros importados'}`;
	return r.falhas ? `${ok} · ${r.falhas} com erro` : ok;
}
