/**
 * IMPORTAR CLIENTES DOS CONTATOS — painel web (D-2245).
 *
 * Três portas, uma regra só:
 *  1. Chrome no Android: Contact Picker API (`navigator.contacts.select`). O próprio
 *     navegador mostra a agenda e devolve SÓ os contatos que a pessoa marcou: o site
 *     nunca lê a agenda inteira.
 *  2. iPhone e computador (o navegador não oferece a agenda): arquivo .vcf (exportado
 *     do app Contatos ou compartilhado pelo WhatsApp) ou .csv (Google Contatos, Outlook).
 *  3. Contato compartilhado pelo WhatsApp com o painel instalado (share_target):
 *     chega como .vcf e cai no mesmo caminho do item 2.
 *
 * LGPD: nada sobe sem a pessoa ver a prévia e confirmar. Telefone normalizado pela
 * mesma regra do resto do painel (`lerTelefone`, da fonte compartilhada com o app).
 *
 * Caminho RELATIVO para a fonte (como `importacao/parser.ts`): os testes rodam no Node puro.
 */
import {
	COLUNA_NOME_COMPOSTO,
	decodificarTexto,
	detectarModelo,
	LIMITE_ARQUIVO_BYTES,
	LIMITE_LINHAS,
	lerTelefone,
	linhasParaObjetos,
	mapeamentoInicial,
	parseCsv,
	parseVcf,
	prepararLinhas,
} from "../../../../src/services/importacao.ts";

export type ContatoLido = { nome: string; telefone: string };

/** Uma linha da prévia: o que vai acontecer com cada contato. */
export type ItemPrevia =
	| { tipo: "novo"; contato: ContatoLido }
	| { tipo: "repetido"; contato: ContatoLido; motivo: string }
	| { tipo: "sem_telefone"; nome: string };

// ─── 1. Contact Picker API (Chrome Android) ─────────────────────────────────

type ContatoDoNavegador = { name?: string[]; tel?: string[] };
type GerenteDeContatos = {
	select(props: string[], opcoes?: { multiple?: boolean }): Promise<ContatoDoNavegador[]>;
	getProperties?: () => Promise<string[]>;
};

function gerente(): GerenteDeContatos | null {
	const nav = (typeof navigator !== "undefined" ? navigator : undefined) as (Navigator & { contacts?: GerenteDeContatos }) | undefined;
	return nav?.contacts && typeof nav.contacts.select === "function" ? nav.contacts : null;
}

/** O navegador oferece a agenda? (Chrome no Android, em HTTPS.) iPhone e computador: não. */
export function seletorDeContatosDisponivel(): boolean {
	return gerente() !== null;
}

/**
 * Abre a agenda do celular. `[]` = a pessoa cancelou. Lança erro quando o navegador
 * recusa: quem chama mostra o erro e oferece o arquivo (erro nunca vira silêncio).
 */
export async function escolherNaAgenda(multiplos: boolean): Promise<ContatoDoNavegador[]> {
	const g = gerente();
	if (!g) throw new Error("agenda_indisponivel");
	return g.select(["name", "tel"], { multiple: multiplos });
}

/** Do formato do navegador para o nosso: 1º nome não vazio e todos os telefones. */
export function doNavegador(lista: ContatoDoNavegador[]): Array<{ nome: string; telefones: string[] }> {
	return lista.map((c) => ({
		nome: (c.name ?? []).map((n) => String(n ?? "").trim()).find(Boolean) ?? "",
		telefones: (c.tel ?? []).map((t) => String(t ?? "").trim()).filter(Boolean),
	}));
}

// ─── 2. Arquivo .vcf / .csv ──────────────────────────────────────────────────

export type ResultadoArquivo = { ok: true; contatos: Array<{ nome: string; telefones: string[] }> } | { ok: false; motivo: string };

/** Lê o arquivo de contatos. Formato pelo conteúdo, não só pela extensão. */
export function lerArquivoDeContatos(nomeArquivo: string, bytes: Uint8Array): ResultadoArquivo {
	if (bytes.byteLength > LIMITE_ARQUIVO_BYTES) return { ok: false, motivo: "O arquivo passa de 10 MB." };
	const texto = decodificarTexto(bytes);
	const pareceVcf = /\.vcf$/i.test(nomeArquivo) || /^\s*BEGIN:VCARD/im.test(texto.slice(0, 2000));
	if (pareceVcf) {
		const lidos = parseVcf(texto).slice(0, LIMITE_LINHAS);
		if (!lidos.length) return { ok: false, motivo: "Não achei nenhum contato nesse arquivo .vcf." };
		return { ok: true, contatos: lidos.map((c) => ({ nome: c.nome, telefones: c.telefones })) };
	}
	if (/\.csv$/i.test(nomeArquivo) || /text\/csv/.test(nomeArquivo)) {
		const objetos = linhasParaObjetos(parseCsv(texto)).slice(0, LIMITE_LINHAS);
		if (!objetos.length) return { ok: false, motivo: "A planilha está vazia." };
		const cabecalhos = Object.keys(objetos[0] ?? {});
		const modelo = detectarModelo(cabecalhos);
		const linhas = prepararLinhas(objetos, modelo);
		const mapa = mapeamentoInicial("clientes", Object.keys(linhas[0] ?? {}), modelo);
		const colNome = mapa.nome || (COLUNA_NOME_COMPOSTO in (linhas[0] ?? {}) ? COLUNA_NOME_COMPOSTO : "");
		if (!colNome || !mapa.telefone) return { ok: false, motivo: "Não achei as colunas de nome e telefone. Use a Central de dados para escolher as colunas." };
		return { ok: true, contatos: linhas.map((l) => ({ nome: (l[colNome] ?? "").trim(), telefones: [l[mapa.telefone] ?? ""] })) };
	}
	return { ok: false, motivo: "Use um arquivo .vcf (contatos) ou .csv (planilha)." };
}

// ─── 3. Prévia: novo, repetido, sem telefone ─────────────────────────────────

/** Chave de comparação: só os dígitos nacionais (sem 55), para "(11) 9…" e "+55 11 9…" baterem. */
function chave(telefone: string): string {
	const d = telefone.replace(/\D/g, "");
	return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
}

/**
 * Monta a prévia sem gravar nada. Telefone = o 1º válido com DDD. Repetido = já existe
 * cliente com o mesmo número (ou aparece 2× na mesma importação). Sem nome válido, usa o telefone.
 */
export function montarPrevia(
	lidos: Array<{ nome: string; telefones: string[] }>,
	telefonesJaCadastrados: string[],
): ItemPrevia[] {
	const existentes = new Set(telefonesJaCadastrados.map(chave).filter(Boolean));
	const nestaLeva = new Set<string>();
	return lidos.map((c) => {
		const lido = lerTelefone(c.telefones.join(" / "));
		const nome = c.nome.trim();
		if (!lido.ok || !lido.digitos) return { tipo: "sem_telefone", nome: nome || "(sem nome)" } as const;
		const contato = { nome: nome || lido.formatado, telefone: lido.formatado };
		const k = chave(lido.digitos);
		if (existentes.has(k)) return { tipo: "repetido", contato, motivo: "Já é seu cliente" } as const;
		if (nestaLeva.has(k)) return { tipo: "repetido", contato, motivo: "Repetido nesta lista" } as const;
		nestaLeva.add(k);
		return { tipo: "novo", contato } as const;
	});
}

/** Para o diálogo "Qual o WhatsApp de X?": o 1º telefone válido do contato escolhido. */
export function primeiroTelefone(lidos: Array<{ telefones: string[] }>): string | null {
	for (const c of lidos) {
		const t = lerTelefone(c.telefones.join(" / "));
		if (t.ok && t.digitos) return t.formatado;
	}
	return null;
}
