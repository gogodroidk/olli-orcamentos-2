import { supabase } from "@/lib/supabase";

const WORKER_URL = (
	(import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online"
).replace(/\/+$/, "");

export const IA_AUTOPILOT_MAX_BYTES = 4 * 1024 * 1024;
export const IA_AUTOPILOT_MAX_TEXTO = 20_000;

export type IntencaoAutopilot = "cadastro" | "orcamento" | "documento" | "conversa";

export type AutopilotCliente = {
	nome: string;
	telefone: string;
	email: string;
	documento: string;
	endereco: string;
	cidade: string;
	estado: string;
	cep: string;
	confianca: number;
	evidencia: string;
};

export type AutopilotCatalogo = {
	nome: string;
	descricao: string;
	unidade: string;
	precoSugerido: number;
	custoSugerido: number;
	marca: string;
	modelo: string;
	confianca: number;
	evidencia: string;
};

export type AutopilotItem = {
	tipo: "servico" | "produto";
	nome: string;
	descricao: string;
	unidade: string;
	quantidade: number;
	precoSugerido: number;
	confianca: number;
	evidencia: string;
};

export type AutopilotDocumento = {
	tipo: "contrato" | "garantia" | "conclusao" | "pmoc" | "outro";
	titulo: string;
	texto: string;
	confianca: number;
	evidencia: string;
};

export type AutopilotPreview = {
	id: string;
	version: string;
	tenantId: string;
	atorId: string;
	estado: "aguardando_confirmacao";
	intencao: IntencaoAutopilot;
	pedidoOriginal: string;
	fonte: { nome: string; mime: string; bytes: number; hash: string; parser: string };
	candidatos: {
		clientes: AutopilotCliente[];
		produtos: AutopilotCatalogo[];
		servicos: AutopilotCatalogo[];
		orcamento: {
			clienteNome: string;
			clienteTelefone: string;
			clienteEndereco: string;
			observacoes: string;
			itens: AutopilotItem[];
			confianca: number;
			evidencia: string;
		};
		documentos: AutopilotDocumento[];
		avisos: string[];
	};
	criadaEm: string;
	fingerprint: string;
	requiresReview: true;
	persistida: false;
};

function texto(value: unknown, max: number, required = false): string {
	if (typeof value !== "string") return "";
	const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, max);
	return required && !clean ? "" : clean;
}

function numero(value: unknown, max = 100_000_000): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0;
}

function confianca(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 1000) / 1000 : 0;
}

function objeto(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function lista<T>(value: unknown, max: number, mapear: (item: unknown) => T | null): T[] {
	return Array.isArray(value) ? value.map(mapear).filter((item): item is T => item !== null).slice(0, max) : [];
}

function cliente(value: unknown): AutopilotCliente | null {
	const raw = objeto(value);
	if (!raw) return null;
	const nome = texto(raw.nome, 160, true);
	return nome ? {
		nome, telefone: texto(raw.telefone, 40), email: texto(raw.email, 160), documento: texto(raw.documento, 40),
		endereco: texto(raw.endereco, 240), cidade: texto(raw.cidade, 100), estado: texto(raw.estado, 2).toUpperCase(),
		cep: texto(raw.cep, 12), confianca: confianca(raw.confianca), evidencia: texto(raw.evidencia, 280),
	} : null;
}

function catalogo(value: unknown): AutopilotCatalogo | null {
	const raw = objeto(value);
	if (!raw) return null;
	const nome = texto(raw.nome, 160, true);
	return nome ? {
		nome, descricao: texto(raw.descricao, 500), unidade: texto(raw.unidade, 30) || "un",
		precoSugerido: numero(raw.precoSugerido), custoSugerido: numero(raw.custoSugerido),
		marca: texto(raw.marca, 100), modelo: texto(raw.modelo, 100), confianca: confianca(raw.confianca),
		evidencia: texto(raw.evidencia, 280),
	} : null;
}

function item(value: unknown): AutopilotItem | null {
	const raw = objeto(value);
	if (!raw || (raw.tipo !== "produto" && raw.tipo !== "servico")) return null;
	const nome = texto(raw.nome, 160, true);
	return nome ? {
		tipo: raw.tipo, nome, descricao: texto(raw.descricao, 500), unidade: texto(raw.unidade, 30) || "un",
		quantidade: numero(raw.quantidade, 10_000) || 1, precoSugerido: numero(raw.precoSugerido),
		confianca: confianca(raw.confianca), evidencia: texto(raw.evidencia, 280),
	} : null;
}

function documento(value: unknown): AutopilotDocumento | null {
	const raw = objeto(value);
	if (!raw || !["contrato", "garantia", "conclusao", "pmoc", "outro"].includes(String(raw.tipo))) return null;
	const titulo = texto(raw.titulo, 180, true);
	return titulo ? {
		tipo: raw.tipo as AutopilotDocumento["tipo"], titulo, texto: texto(raw.texto, 2_000),
		confianca: confianca(raw.confianca), evidencia: texto(raw.evidencia, 280),
	} : null;
}

function normalizarPreview(value: unknown): AutopilotPreview | null {
	const raw = objeto(value);
	const fonte = objeto(raw?.fonte);
	const candidatos = objeto(raw?.candidatos);
	const orcamento = objeto(candidatos?.orcamento);
	if (!raw || !fonte || !candidatos || !orcamento || raw.estado !== "aguardando_confirmacao" || raw.requiresReview !== true || raw.persistida !== false) return null;
	if (!texto(raw.id, 160, true) || !texto(raw.version, 80, true) || !texto(raw.tenantId, 80, true) || !texto(raw.atorId, 80, true)) return null;
	if (!["cadastro", "orcamento", "documento", "conversa"].includes(String(raw.intencao))) return null;
	const fonteNormalizada = {
		nome: texto(fonte.nome, 180, true), mime: texto(fonte.mime, 120, true), bytes: numero(fonte.bytes, IA_AUTOPILOT_MAX_BYTES),
		hash: texto(fonte.hash, 64, true), parser: texto(fonte.parser, 80, true),
	};
	if (!fonteNormalizada.nome || !fonteNormalizada.mime || !fonteNormalizada.hash || !fonteNormalizada.parser || !fonteNormalizada.bytes) return null;
	const resultado = {
		clientes: lista(candidatos.clientes, 50, cliente), produtos: lista(candidatos.produtos, 50, catalogo),
		servicos: lista(candidatos.servicos, 50, catalogo),
		orcamento: {
			clienteNome: texto(orcamento.clienteNome, 160), clienteTelefone: texto(orcamento.clienteTelefone, 40),
			clienteEndereco: texto(orcamento.clienteEndereco, 240), observacoes: texto(orcamento.observacoes, 2_000),
			itens: lista(orcamento.itens, 50, item), confianca: confianca(orcamento.confianca), evidencia: texto(orcamento.evidencia, 280),
		},
		documentos: lista(candidatos.documentos, 10, documento), avisos: lista(candidatos.avisos, 12, (v) => {
			const valueText = texto(v, 320, true);
			return valueText || null;
		}),
	};
	if (!resultado.clientes.length && !resultado.produtos.length && !resultado.servicos.length && !resultado.orcamento.itens.length && !resultado.documentos.length) return null;
	return {
		id: texto(raw.id, 160), version: texto(raw.version, 80), tenantId: texto(raw.tenantId, 80), atorId: texto(raw.atorId, 80),
		estado: "aguardando_confirmacao", intencao: raw.intencao as IntencaoAutopilot, pedidoOriginal: texto(raw.pedidoOriginal, 2_000),
		fonte: fonteNormalizada, candidatos: resultado, criadaEm: texto(raw.criadaEm, 50), fingerprint: texto(raw.fingerprint, 64),
		requiresReview: true, persistida: false,
	};
}

function bytesParaBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let inicio = 0; inicio < bytes.length; inicio += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(inicio, Math.min(inicio + 0x8000, bytes.length)));
	}
	return btoa(binary);
}

function mimeDoArquivo(file: File): string {
	const informado = file.type.toLowerCase();
	if (["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv", "application/json"].includes(informado)) return informado;
	const extensao = file.name.toLowerCase().split(".").pop() ?? "";
	return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", txt: "text/plain", csv: "text/csv", json: "application/json" } as Record<string, string>)[extensao] ?? "";
}

export async function prepararPreviaAutopilot(input: {
	arquivo?: File | null;
	texto?: string;
	intencao?: IntencaoAutopilot;
	pedidoOriginal?: string;
	referencias?: Array<{ tipo: "produto" | "servico"; nome: string; descricao?: string; unidade?: string; preco?: number; custo?: number }>;
}): Promise<AutopilotPreview> {
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token) throw new Error("Entre na sua conta antes de usar o Autopilot.");

	const corpo: Record<string, unknown> = {
		intencao: input.intencao ?? "cadastro",
		pedidoOriginal: texto(input.pedidoOriginal, 2_000),
		referencias: input.referencias?.slice(0, 50) ?? [],
	};
	if (input.arquivo) {
		if (input.arquivo.size <= 0 || input.arquivo.size > IA_AUTOPILOT_MAX_BYTES) throw new Error("Use um arquivo de até 4 MB.");
		const mime = mimeDoArquivo(input.arquivo);
		if (!mime) throw new Error("Use PDF, PNG, JPG, WEBP, TXT, CSV ou JSON.");
		const bytes = new Uint8Array(await input.arquivo.arrayBuffer());
		corpo.arquivo = { nome: input.arquivo.name, mimeType: mime, conteudoBase64: bytesParaBase64(bytes) };
	} else {
		const textoColado = texto(input.texto, IA_AUTOPILOT_MAX_TEXTO, true);
		if (!textoColado) throw new Error("Cole a conversa ou escolha um arquivo.");
		corpo.texto = textoColado;
	}

	const controller = new AbortController();
	const timer = window.setTimeout(() => controller.abort(), 45_000);
	try {
		const response = await fetch(`${WORKER_URL}/ia/autopilot/preview`, {
			method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify(corpo), signal: controller.signal,
		});
		const dataResposta = await response.json().catch(() => null) as Record<string, unknown> | null;
		const previa = normalizarPreview(dataResposta?.previa);
		if (response.ok && previa) return previa;
		const mensagem = typeof dataResposta?.mensagem === "string" ? dataResposta.mensagem : "Não consegui preparar a prévia agora. Nada foi alterado.";
		throw new Error(mensagem);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw new Error("O Autopilot demorou demais. Tente um arquivo menor ou uma imagem mais simples.");
		throw error;
	} finally {
		window.clearTimeout(timer);
	}
}
