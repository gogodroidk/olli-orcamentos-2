/**
 * O MODELO DO QUADRO — 5 colunas cobrindo os 10 status do funil.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * POR QUE UM `Record<StatusOrcamento, ColunaId>` E NÃO UM `switch`
 * ═══════════════════════════════════════════════════════════════════════════════
 * O app do celular tem 10 status (`StatusOrcamento`, em `@dominio`). O quadro
 * mostra 5 colunas. Se um dia o app ganhar um 11º status e ele não estiver aqui,
 * os orçamentos nesse status SUMIRIAM do quadro — o dono acharia que perdeu venda.
 *
 * Duas travas contra isso:
 *  1. `COLUNA_DO_STATUS` é um `Record<StatusOrcamento, …>` COMPLETO: status novo no
 *     app = ERRO DE COMPILAÇÃO aqui. Não dá para esquecer em silêncio.
 *  2. Em runtime, status que não esteja no mapa (linha antiga, lixo no banco) cai na
 *     coluna "Outros", que só aparece quando tem card. Nada some, nunca.
 */
import { type Orcamento, STATUS_LABELS, type StatusOrcamento } from "@dominio";

/** Linha da tabela `orcamentos` como ela volta do Supabase (colunas-espelho + blob). */
export interface LinhaOrcamento {
	id: string;
	numero: string | null;
	cliente_nome: string | null;
	status: string | null;
	valor_total: number | null;
	criado_em: string | null;
	atualizado_em: string | null;
	/** O BLOB — o objeto de domínio INTEIRO. É a verdade; as colunas acima são espelhos. */
	dados: Orcamento | null;
}

export type ColunaId = "rascunho" | "enviado" | "negociacao" | "aprovado" | "perdido" | "outros";

/**
 * Status → coluna. A ORDEM das chaves é a ordem do funil e alimenta o menu
 * "Mover para" (a lista de status de cada coluna sai daqui, não de uma 2ª cópia).
 */
export const COLUNA_DO_STATUS: Record<StatusOrcamento, Exclude<ColunaId, "outros">> = {
	rascunho: "rascunho",
	enviado: "enviado",
	visualizado: "enviado",
	em_negociacao: "negociacao",
	aguardando_assinatura: "negociacao",
	aprovado: "aprovado",
	convertido: "aprovado",
	recusado: "perdido",
	expirado: "perdido",
	cancelado: "perdido",
};

const TODOS_OS_STATUS = Object.keys(COLUNA_DO_STATUS) as StatusOrcamento[];

export interface Coluna {
	id: ColunaId;
	titulo: string;
	/** Os status que esta coluna abriga, na ordem do funil. */
	status: StatusOrcamento[];
	/**
	 * Status gravado quando um card é SOLTO nesta coluna. É o 1º status da coluna
	 * (o "canônico"): arrastar para Enviado grava `enviado`, não `visualizado` —
	 * `visualizado` quem carimba é a trilha do link público, não o dono à mão.
	 * `null` em "Outros": não existe status "desconhecido" para gravar, então essa
	 * coluna NÃO aceita drop (e não aparece no menu "Mover para").
	 */
	destino: StatusOrcamento | null;
	/** Bolinha do cabeçalho. */
	ponto: string;
	/** Faixa de cor à esquerda do card. */
	faixa: string;
}

function statusDaColuna(id: Exclude<ColunaId, "outros">): StatusOrcamento[] {
	return TODOS_OS_STATUS.filter((s) => COLUNA_DO_STATUS[s] === id);
}

const CORES: Record<ColunaId, { ponto: string; faixa: string }> = {
	rascunho: { ponto: "bg-muted-foreground/50", faixa: "border-l-muted-foreground/40" },
	enviado: { ponto: "bg-info", faixa: "border-l-info" },
	negociacao: { ponto: "bg-warning", faixa: "border-l-warning" },
	aprovado: { ponto: "bg-success", faixa: "border-l-success" },
	perdido: { ponto: "bg-error", faixa: "border-l-error" },
	outros: { ponto: "bg-muted-foreground/50", faixa: "border-l-muted-foreground/40" },
};

const TITULOS: Record<ColunaId, string> = {
	rascunho: "Rascunho",
	enviado: "Enviado",
	negociacao: "Em negociação",
	aprovado: "Aprovado",
	perdido: "Perdido",
	outros: "Outros",
};

function montar(id: Exclude<ColunaId, "outros">): Coluna {
	const status = statusDaColuna(id);
	return { id, titulo: TITULOS[id], status, destino: status[0], ...CORES[id] };
}

/** As 5 colunas reais — as únicas que aceitam drop e aparecem no menu "Mover para". */
export const COLUNAS: Coluna[] = [
	montar("rascunho"),
	montar("enviado"),
	montar("negociacao"),
	montar("aprovado"),
	montar("perdido"),
];

/** A 6ª coluna, de segurança: só é renderizada quando tem card (ver cabeçalho). */
export const COLUNA_OUTROS: Coluna = {
	id: "outros",
	titulo: TITULOS.outros,
	status: [],
	destino: null,
	...CORES.outros,
};

export function colunaDoStatus(status: string | null | undefined): ColunaId {
	if (!status) return "outros";
	return COLUNA_DO_STATUS[status as StatusOrcamento] ?? "outros";
}

/** Rótulo de um status. Vem do app (`STATUS_LABELS`); desconhecido mostra o valor cru. */
export function rotuloDoStatus(status: string | null | undefined): string {
	if (!status) return "Sem status";
	return STATUS_LABELS[status as StatusOrcamento] ?? status;
}

/* ───────────────────────────────  O card  ──────────────────────────────────── */

export interface Cartao {
	id: string;
	numero: string;
	cliente: string;
	/**
	 * `null` = o valor NÃO é conhecido — e aí o card mostra "—", nunca "R$ 0,00".
	 * Fingir zero num quadro comercial é mentir sobre o tamanho do funil.
	 */
	valor: number | null;
	status: string | null;
	colunaId: ColunaId;
	/** Dias desde a última movimentação (`atualizado_em`, com `criado_em` de reserva). */
	diasParado: number | null;
	linha: LinhaOrcamento;
}

/** Dias inteiros de calendário entre a data e hoje. `null` quando não dá para saber. */
export function diasDesde(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const entao = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const agora = new Date();
	const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
	const dias = Math.round((hoje - entao) / 86_400_000);
	return dias < 0 ? 0 : dias;
}

export function rotuloParado(dias: number | null): string {
	if (dias === null) return "sem data";
	if (dias === 0) return "hoje";
	if (dias === 1) return "há 1 dia";
	return `há ${dias} dias`;
}

/** A partir de quantos dados parados um card no meio do funil vira alerta visual. */
export const DIAS_DE_ALERTA = 7;

export function linhaParaCartao(linha: LinhaOrcamento): Cartao {
	// A coluna-espelho `valor_total` pode estar vazia numa linha antiga; o blob é a
	// verdade e serve de reserva. Se nem o blob tiver, o valor é DESCONHECIDO (null).
	const valor = linha.valor_total ?? linha.dados?.valorTotal ?? null;
	return {
		id: linha.id,
		numero: linha.numero?.trim() || "sem número",
		cliente: linha.cliente_nome?.trim() || linha.dados?.clienteNome?.trim() || "Sem cliente",
		valor: typeof valor === "number" && Number.isFinite(valor) ? valor : null,
		status: linha.status,
		colunaId: colunaDoStatus(linha.status),
		diasParado: diasDesde(linha.atualizado_em ?? linha.criado_em),
		linha,
	};
}

export interface ColunaMontada {
	coluna: Coluna;
	cartoes: Cartao[];
	/** Soma dos valores CONHECIDOS. */
	soma: number;
	/** true se algum card da coluna está sem valor — o cabeçalho avisa em vez de mentir. */
	temSemValor: boolean;
}

/** Agrupa as linhas nas colunas. "Outros" só entra no resultado se tiver card. */
export function montarColunas(linhas: LinhaOrcamento[]): ColunaMontada[] {
	const cartoes = linhas.map(linhaParaCartao);
	const todas: Coluna[] = [...COLUNAS, COLUNA_OUTROS];

	return todas
		.map((coluna) => {
			const meus = cartoes.filter((c) => c.colunaId === coluna.id);
			return {
				coluna,
				cartoes: meus,
				soma: meus.reduce((t, c) => t + (c.valor ?? 0), 0),
				temSemValor: meus.some((c) => c.valor === null),
			};
		})
		.filter((c) => c.coluna.id !== "outros" || c.cartoes.length > 0);
}

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
