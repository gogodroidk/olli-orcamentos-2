/**
 * Precificação com IA (D-1438) — contrato do painel.
 *
 * A flag do painel é VITE_PRECIFICACAO_IA exatamente "on". A do Worker é outra
 * (PRECIFICACAO_IA). As duas nascem desligadas. O modelo não devolve preço:
 * esta camada só aceita números e a calculadora existente faz a conta.
 */

export const PRECIFICACAO_IA_MAX_TEXTO = 2_000;
export const ROTA_PRECIFICACAO_IA = "/ia/precificacao/rascunho";

const TETO_DINHEIRO = 100_000_000;
const TETO_PERCENTUAL = 90;

const CHAVES_SERVICO = ["custoMateriais", "horas", "valorHora", "deslocamento"] as const;
const CHAVES_PRODUTO = ["custoCompra", "frete", "embalagem"] as const;
const CHAVES_COMUNS = [
	"outrosCustos",
	"despesasFixasRateadas",
	"impostoPct",
	"taxaPagamentoPct",
	"reservaPct",
	"margemPct",
] as const;

const PERCENTUAIS = new Set<string>(["impostoPct", "taxaPagamentoPct", "reservaPct", "margemPct"]);

export type ModoPrecificacaoIa = "servico" | "produto";

export type CamposPrecificacaoForm = {
	nome: string;
	custoMateriais: number;
	horas: number;
	valorHora: number;
	deslocamento: number;
	custoCompra: number;
	frete: number;
	embalagem: number;
	outrosCustos: number;
	despesasFixasRateadas: number;
	impostoPct: number;
	taxaPagamentoPct: number;
	reservaPct: number;
	margemPct: number;
};

export type RascunhoPrecificacaoIa = {
	modo: ModoPrecificacaoIa | "";
	nome: string;
	custoMateriais: number | null;
	horas: number | null;
	valorHora: number | null;
	deslocamento: number | null;
	custoCompra: number | null;
	frete: number | null;
	embalagem: number | null;
	outrosCustos: number | null;
	despesasFixasRateadas: number | null;
	impostoPct: number | null;
	taxaPagamentoPct: number | null;
	reservaPct: number | null;
	margemPct: number | null;
	faltando: string[];
	avisos: string[];
	confianca: number;
	evidencia: string;
};

export type ResultadoPedidoPrecificacao =
	| { ok: true; rascunho: RascunhoPrecificacaoIa }
	| { ok: false; erro: string; mensagem: string };

const MENSAGENS: Record<string, string> = {
	desligada: "O rascunho com IA está desligado. A calculadora segue normal.",
	texto_obrigatorio: "Escreva o serviço ou a peça com os números que você já sabe.",
	texto_longo: "Encurte o texto. Nada foi enviado à IA e a calculadora não mudou.",
	resposta_invalida: "A leitura não veio em formato seguro. Nada foi colocado na calculadora.",
	auth: "Entre na sua conta para usar o rascunho.",
	sem_creditos: "A cota grátis da IA acabou.",
	cotaDiaria: "A cota de IA de hoje acabou. A calculadora continua disponível.",
	limite: "Muitas leituras em pouco tempo. Espere um pouco e tente de novo.",
	rede: "Não consegui falar com a IA agora. A calculadora não mudou.",
	generico: "Não consegui ler o texto agora. A calculadora não foi alterada.",
};

export function painelPrecificacaoIaLigado(valor: unknown): boolean {
	return valor === "on";
}

export const PRECIFICACAO_IA_LIGADA = painelPrecificacaoIaLigado(import.meta.env?.VITE_PRECIFICACAO_IA);

function textoCurto(valor: unknown, max: number): string {
	if (typeof valor !== "string") return "";
	let limpo = "";
	for (const ch of valor) {
		const cp = ch.codePointAt(0) ?? 0;
		limpo += cp <= 0x1f || cp === 0x7f || ch === "<" || ch === ">" ? " " : ch;
	}
	return limpo.replace(/\s+/g, " ").trim().slice(0, max);
}

function numeroOuNulo(valor: unknown, percentual: boolean): number | null {
	if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
	const teto = percentual ? TETO_PERCENTUAL : TETO_DINHEIRO;
	if (valor > teto) return null;
	return Math.round(valor * 100) / 100;
}

function lista(valor: unknown, max: number, limite: number): string[] {
	if (!Array.isArray(valor)) return [];
	const saida: string[] = [];
	for (const item of valor) {
		const texto = textoCurto(item, limite);
		if (texto) saida.push(texto);
		if (saida.length >= max) break;
	}
	return saida;
}

/** Descarta preço de venda e qualquer campo que o modelo invente fora da lista. */
export function lerRascunhoPrecificacao(valor: unknown): RascunhoPrecificacaoIa | null {
	if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
	const bruto = valor as Record<string, unknown>;
	const modo = bruto.modo === "servico" || bruto.modo === "produto" ? bruto.modo : "";
	const confiancaBruta = bruto.confianca;
	const confianca = typeof confiancaBruta === "number" && Number.isFinite(confiancaBruta) && confiancaBruta >= 0 && confiancaBruta <= 1
		? Math.round(confiancaBruta * 1000) / 1000
		: 0;
	return {
		modo,
		nome: textoCurto(bruto.nome, 160),
		custoMateriais: numeroOuNulo(bruto.custoMateriais, false),
		horas: numeroOuNulo(bruto.horas, false),
		valorHora: numeroOuNulo(bruto.valorHora, false),
		deslocamento: numeroOuNulo(bruto.deslocamento, false),
		custoCompra: numeroOuNulo(bruto.custoCompra, false),
		frete: numeroOuNulo(bruto.frete, false),
		embalagem: numeroOuNulo(bruto.embalagem, false),
		outrosCustos: numeroOuNulo(bruto.outrosCustos, false),
		despesasFixasRateadas: numeroOuNulo(bruto.despesasFixasRateadas, false),
		impostoPct: numeroOuNulo(bruto.impostoPct, true),
		taxaPagamentoPct: numeroOuNulo(bruto.taxaPagamentoPct, true),
		reservaPct: numeroOuNulo(bruto.reservaPct, true),
		margemPct: numeroOuNulo(bruto.margemPct, true),
		faltando: lista(bruto.faltando, 8, 160),
		avisos: lista(bruto.avisos, 6, 240),
		confianca,
		evidencia: textoCurto(bruto.evidencia, 280),
	};
}

type ChaveNumero = Exclude<keyof CamposPrecificacaoForm, "nome">;

function chavesDoModo(modo: RascunhoPrecificacaoIa["modo"]): readonly ChaveNumero[] {
	if (modo === "produto") return [...CHAVES_PRODUTO, ...CHAVES_COMUNS];
	if (modo === "servico") return [...CHAVES_SERVICO, ...CHAVES_COMUNS];
	return [...CHAVES_SERVICO, ...CHAVES_PRODUTO, ...CHAVES_COMUNS];
}

export function aplicarRascunhoPrecificacao(
	campos: CamposPrecificacaoForm,
	rascunho: RascunhoPrecificacaoIa,
): { campos: CamposPrecificacaoForm; preenchidos: (keyof CamposPrecificacaoForm)[]; modo: ModoPrecificacaoIa | null } {
	const proximo: CamposPrecificacaoForm = { ...campos };
	const preenchidos: (keyof CamposPrecificacaoForm)[] = [];
	for (const chave of chavesDoModo(rascunho.modo)) {
		const valor = rascunho[chave];
		if (typeof valor !== "number") continue;
		proximo[chave] = valor;
		preenchidos.push(chave);
	}
	if (rascunho.nome) {
		proximo.nome = rascunho.nome;
		preenchidos.push("nome");
	}
	const modo = rascunho.modo === "servico" || rascunho.modo === "produto" ? rascunho.modo : null;
	return { campos: proximo, preenchidos, modo };
}

export function rotuloCampoPrecificacao(chave: keyof CamposPrecificacaoForm): string {
	const rotulos: Record<keyof CamposPrecificacaoForm, string> = {
		nome: "Nome",
		custoMateriais: "Materiais e peças",
		horas: "Horas",
		valorHora: "Valor da hora",
		deslocamento: "Deslocamento",
		custoCompra: "Custo de compra",
		frete: "Frete",
		embalagem: "Embalagem",
		outrosCustos: "Outros custos",
		despesasFixasRateadas: "Rateio de despesas fixas",
		impostoPct: "Impostos",
		taxaPagamentoPct: "Taxa de pagamento",
		reservaPct: "Reserva",
		margemPct: "Margem",
	};
	return rotulos[chave];
}

export function textoCampoPrecificacao(chave: keyof CamposPrecificacaoForm, valor: number | string): string {
	if (chave === "nome") return String(valor);
	if (chave === "horas") return `${valor} h`;
	if (PERCENTUAIS.has(chave)) return `${valor}%`;
	return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mensagemDoErro(erro: string): string {
	return MENSAGENS[erro] ?? MENSAGENS.generico;
}

function urlDoWorker(): string {
	const bruto = import.meta.env?.VITE_DIAGNOSTICO_URL;
	const base = typeof bruto === "string" && bruto.trim() ? bruto : "https://diagnostico.olliorcamentos.online";
	return base.replace(/\/+$/, "");
}

/**
 * Chama o Worker só com a flag do painel ligada. Com a flag desligada não há
 * rede. O crédito, quando a cota grátis acaba, só sai com confirmarCredito.
 */
export async function pedirRascunhoPrecificacao(
	texto: string,
	opcoes: { confirmarCredito?: boolean; creditoRef?: string } = {},
): Promise<ResultadoPedidoPrecificacao> {
	if (!PRECIFICACAO_IA_LIGADA) {
		return { ok: false, erro: "desligada", mensagem: mensagemDoErro("desligada") };
	}
	const limpo = textoCurto(texto, PRECIFICACAO_IA_MAX_TEXTO + 1);
	if (!limpo) return { ok: false, erro: "texto_obrigatorio", mensagem: mensagemDoErro("texto_obrigatorio") };
	if (limpo.length > PRECIFICACAO_IA_MAX_TEXTO) {
		return { ok: false, erro: "texto_longo", mensagem: mensagemDoErro("texto_longo") };
	}

	const { supabase } = await import("@/lib/supabase");
	let token: string | null = null;
	try {
		const { data } = await supabase.auth.getSession();
		token = data.session?.access_token ?? null;
	} catch {
		token = null;
	}
	if (!token) return { ok: false, erro: "auth", mensagem: mensagemDoErro("auth") };

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 30_000);
	try {
		const resposta = await fetch(`${urlDoWorker()}${ROTA_PRECIFICACAO_IA}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				texto: limpo,
				confirmarCredito: opcoes.confirmarCredito === true,
				creditoRef: opcoes.creditoRef,
			}),
			signal: controller.signal,
		});
		const corpo = (await resposta.json().catch(() => null)) as {
			ok?: boolean;
			erro?: unknown;
			motivo?: unknown;
			rascunho?: unknown;
		} | null;
		const erro = typeof corpo?.erro === "string" ? corpo.erro : "";
		if (corpo?.ok === true) {
			const rascunho = lerRascunhoPrecificacao(corpo.rascunho);
			if (!rascunho) return { ok: false, erro: "resposta_invalida", mensagem: mensagemDoErro("resposta_invalida") };
			return { ok: true, rascunho };
		}
		if (erro === "cota_ia_diaria" || erro === "cota_ia_global") {
			return { ok: false, erro: "cotaDiaria", mensagem: mensagemDoErro("cotaDiaria") };
		}
		if (erro === "sem_creditos") return { ok: false, erro: "sem_creditos", mensagem: mensagemDoErro("sem_creditos") };
		if (erro === "muitas_requisicoes" || resposta.status === 429) {
			return { ok: false, erro: "limite", mensagem: mensagemDoErro("limite") };
		}
		if (corpo?.motivo === "nao_autorizado" || resposta.status === 401) {
			return { ok: false, erro: "auth", mensagem: mensagemDoErro("auth") };
		}
		if (resposta.status === 404 || erro === "desligada") {
			return { ok: false, erro: "desligada", mensagem: mensagemDoErro("desligada") };
		}
		if (erro === "texto_obrigatorio" || erro === "texto_longo" || erro === "resposta_invalida") {
			return { ok: false, erro, mensagem: mensagemDoErro(erro) };
		}
		return { ok: false, erro: "generico", mensagem: mensagemDoErro("generico") };
	} catch {
		return { ok: false, erro: "rede", mensagem: mensagemDoErro("rede") };
	} finally {
		clearTimeout(timer);
	}
}
