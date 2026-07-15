import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Busca por CÓDIGO DE ERRO — a base oficial HVAC (`public.hvac_codigos`, 698
 * códigos) direto no Supabase, sem depender do Worker de IA. É o mesmo dado que
 * o app do celular consulta e que o Worker usa para ATERRAR o diagnóstico por
 * IA (ver worker/src/index.js → buscarBaseHvac): marca, código, falha, causa,
 * ação, severidade e a fonte oficial.
 *
 * A tabela é protegida por RLS: só responde a um usuário AUTENTICADO (o painel
 * sempre está logado). O `select` traz só as colunas que a tela mostra.
 *
 * Estratégia de UX: carregamos a base INTEIRA uma vez (são poucas centenas de
 * linhas, < 1000, cabe numa resposta do PostgREST) e filtramos no cliente. Isso
 * dá busca instantânea (sem ida à rede a cada tecla) e mantém os 3 estados
 * honestos num único ponto: carregando / erro (com "Tentar de novo") / vazio.
 */

export interface HvacCodigo {
	id: number;
	marca: string;
	familia: string | null;
	tipo: string | null;
	codigo: string;
	exibicao: string | null;
	falha: string | null;
	cat_bruta: string | null;
	cat_app: string | null;
	severidade: string | null;
	causa: string | null;
	acao: string | null;
	confianca: string | null;
	fonte_id: string | null;
	url: string | null;
}

const COLUNAS =
	"id,marca,familia,tipo,codigo,exibicao,falha,cat_bruta,cat_app,severidade,causa,acao,confianca,fonte_id,url";

/** Carrega a base oficial de códigos (uma vez, com cache). Nunca "vira vazio" em erro: lança. */
export function useBaseHvac(): UseQueryResult<HvacCodigo[], Error> {
	return useQuery({
		queryKey: ["hvac_codigos", "base"],
		queryFn: async (): Promise<HvacCodigo[]> => {
			const { data, error } = await supabase
				.from("hvac_codigos")
				.select(COLUNAS)
				.order("marca", { ascending: true })
				.order("codigo", { ascending: true })
				.limit(1000);
			if (error) throw error;
			return (data ?? []) as unknown as HvacCodigo[];
		},
		// A base é praticamente estática — não revalida a cada foco de janela.
		staleTime: 10 * 60_000,
		gcTime: 30 * 60_000,
	});
}

/** Normaliza para comparar sem acento/caixa/espaço extra. */
function norm(s?: string | null): string {
	return (s ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
}

/** Compara códigos ignorando separadores comuns ("E-5", "E 5", "E5" → "e5"). */
function normCodigo(s?: string | null): string {
	return norm(s).replace(/[\s\-_.]/g, "");
}

/** Lista de marcas presentes na base, com a contagem de códigos de cada uma. */
export function marcasDaBase(base: HvacCodigo[]): { marca: string; total: number }[] {
	const mapa = new Map<string, number>();
	for (const c of base) {
		if (!c.marca) continue;
		mapa.set(c.marca, (mapa.get(c.marca) ?? 0) + 1);
	}
	return [...mapa.entries()]
		.map(([marca, total]) => ({ marca, total }))
		.sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR"));
}

export interface FiltroCodigo {
	/** Marca exata (valor do seletor) ou vazio = todas. */
	marca: string;
	/** Texto livre: código, nome da falha, causa… */
	termo: string;
}

/**
 * Filtra a base pelo {marca, termo} e ORDENA por relevância: primeiro o código
 * idêntico ao que foi digitado, depois código que começa com o termo, depois o
 * resto. Assim o técnico que digita "E5" vê o E5 no topo, não perdido na lista.
 */
export function filtrarCodigos(base: HvacCodigo[], filtro: FiltroCodigo): HvacCodigo[] {
	const marca = filtro.marca.trim();
	const termo = norm(filtro.termo);
	const termoCod = normCodigo(filtro.termo);

	let linhas = marca ? base.filter((c) => c.marca === marca) : base;

	if (termo) {
		linhas = linhas.filter((c) => {
			const cod = normCodigo(c.codigo);
			return (
				cod.includes(termoCod) ||
				norm(c.codigo).includes(termo) ||
				norm(c.falha).includes(termo) ||
				norm(c.causa).includes(termo) ||
				norm(c.exibicao).includes(termo) ||
				norm(c.familia).includes(termo)
			);
		});
	}

	if (!termoCod) return linhas;

	// Ranqueia por proximidade do CÓDIGO (o campo mais provável da busca).
	const peso = (c: HvacCodigo): number => {
		const cod = normCodigo(c.codigo);
		if (cod === termoCod) return 0;
		if (cod.startsWith(termoCod)) return 1;
		if (cod.includes(termoCod)) return 2;
		return 3;
	};
	return [...linhas].sort((a, b) => peso(a) - peso(b));
}

/* ── Cores de severidade / confiança (mapeiam para as variantes do Badge) ── */

export type VarianteBadge = "error" | "warning" | "info" | "success" | "secondary";

export function varianteSeveridade(sev?: string | null): VarianteBadge {
	const s = norm(sev);
	if (s.startsWith("alta") || s.startsWith("crit")) return "error";
	if (s.startsWith("med")) return "warning";
	if (s.startsWith("baix")) return "info";
	if (s.startsWith("info") || s.startsWith("status")) return "secondary";
	return "secondary";
}

export function varianteConfianca(conf?: string | null): VarianteBadge {
	const s = norm(conf);
	if (s.startsWith("alta")) return "success";
	if (s.includes("alta")) return "success"; // "Média/Alta"
	if (s.startsWith("med")) return "warning";
	if (s.startsWith("baix")) return "error";
	return "secondary";
}
