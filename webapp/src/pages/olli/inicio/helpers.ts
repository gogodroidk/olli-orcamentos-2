/**
 * Utilidades da tela Início (dashboard do OLLI).
 *
 * Fonte da verdade dos STATUS de orçamento espelha `src/types` do app nativo
 * (mesmos valores gravados no Supabase pela sincronização — ver
 * `cloudSync.orcamentoToRow`): a coluna `status` guarda um destes slugs. Aqui a
 * gente só mapeia cada slug para rótulo pt-BR, cor (paleta da marca) e a variante
 * de Badge usada na lista de recentes. Slug desconhecido nunca quebra: cai no
 * fallback neutro (regra de nunca "sumir" com dado que existe).
 */

/** Linha crua da tabela relacional `orcamentos` (o que o `select('*')` devolve). */
export interface OrcamentoRow {
	id?: string | null;
	numero?: string | null;
	cliente_nome?: string | null;
	status?: string | null;
	valor_total?: number | null;
	subtotal?: number | null;
	criado_em?: string | null;
}

export type BadgeVariant = "default" | "secondary" | "info" | "warning" | "success" | "error";

export interface StatusMeta {
	label: string;
	/** Cor da fatia no donut (hex) — paleta OLLI. */
	color: string;
	/** Variante do <Badge> na lista de recentes. */
	badge: BadgeVariant;
}

/** Ordem lógica do funil comercial — dita a ordem das fatias/legenda do donut. */
export const STATUS_ORDER = [
	"rascunho",
	"enviado",
	"visualizado",
	"em_negociacao",
	"aguardando_assinatura",
	"aprovado",
	"convertido",
	"recusado",
	"expirado",
	"cancelado",
] as const;

const STATUS_META: Record<string, StatusMeta> = {
	rascunho: { label: "Rascunho", color: "#94A3B8", badge: "secondary" },
	enviado: { label: "Enviado", color: "#0B6FCE", badge: "info" },
	visualizado: { label: "Visualizado", color: "#3FD8EA", badge: "info" },
	em_negociacao: { label: "Em negociação", color: "#F59E0B", badge: "warning" },
	aguardando_assinatura: { label: "Aguardando assinatura", color: "#FBBF24", badge: "warning" },
	aprovado: { label: "Aprovado", color: "#2BE39A", badge: "success" },
	convertido: { label: "Convertido", color: "#0EA5E9", badge: "success" },
	recusado: { label: "Recusado", color: "#EF4444", badge: "error" },
	expirado: { label: "Expirado", color: "#A16207", badge: "warning" },
	cancelado: { label: "Cancelado", color: "#6B7280", badge: "secondary" },
};

function titulizar(slug: string): string {
	return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Metadados de um status; slug vazio/desconhecido → fallback neutro (nunca quebra). */
export function metaStatus(status?: string | null): StatusMeta {
	const key = (status ?? "").trim().toLowerCase();
	if (key && STATUS_META[key]) return STATUS_META[key];
	return { label: key ? titulizar(key) : "Sem status", color: "#94A3B8", badge: "secondary" };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em Real (pt-BR). Não-número vira "—" (erro/ausência nunca vira R$ 0,00 falso). */
export function formatBRL(v: unknown): string {
	const n = typeof v === "number" ? v : Number(v);
	if (!Number.isFinite(n)) return "—";
	return BRL.format(n);
}

const INT = new Intl.NumberFormat("pt-BR");

/** Inteiro com separador de milhar pt-BR (ex.: 1.234). */
export function formatInt(v: number): string {
	return INT.format(v);
}

/** Melhor esforço para o valor do orçamento: total → subtotal. */
export function valorOrcamento(o: OrcamentoRow): number | null {
	if (typeof o.valor_total === "number") return o.valor_total;
	if (typeof o.subtotal === "number") return o.subtotal;
	return null;
}

/** Nome do cliente com fallback amigável. */
export function clienteOrcamento(o: OrcamentoRow): string {
	const nome = (o.cliente_nome ?? "").trim();
	return nome || "Cliente não informado";
}

/** Saudação pelo horário local. */
export function saudacao(d = new Date()): string {
	const h = d.getHours();
	if (h < 12) return "Bom dia";
	if (h < 18) return "Boa tarde";
	return "Boa noite";
}

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
});

/** Data por extenso, capitalizada (ex.: "Segunda-feira, 14 de julho de 2026"). */
export function dataLonga(d = new Date()): string {
	const s = DATA_LONGA.format(d);
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Contagem de orçamentos por status, já na ordem do funil (só os que aparecem). */
export function agruparPorStatus(rows: OrcamentoRow[]): { slug: string; meta: StatusMeta; total: number }[] {
	const counts = new Map<string, number>();
	for (const o of rows) {
		const slug = (o.status ?? "").trim().toLowerCase() || "sem_status";
		counts.set(slug, (counts.get(slug) ?? 0) + 1);
	}
	const ordenados = [...counts.keys()].sort((a, b) => {
		const ia = (STATUS_ORDER as readonly string[]).indexOf(a);
		const ib = (STATUS_ORDER as readonly string[]).indexOf(b);
		return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
	});
	return ordenados.map((slug) => ({ slug, meta: metaStatus(slug), total: counts.get(slug) ?? 0 }));
}
