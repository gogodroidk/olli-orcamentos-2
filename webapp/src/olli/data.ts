import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Camada de dados do OLLI (web) — online-first, direto no Supabase.
 * O RLS do Postgres já limita cada consulta ao tenant do usuário logado
 * (dono ou membro da organização), então um `select('*')` simples já volta
 * só o que a conta PODE ver. As telas seguem a regra dos 3 estados via
 * TanStack Query: `isLoading` (carregando) · `isError` (erro, NUNCA vira
 * "vazio") · `data` (valor).
 */

/** Teto de linhas que o PostgREST devolve por resposta (`db.max-rows`, ~1000). */
const TAMANHO_PAGINA = 1000;
/** Trava de segurança: até 100k linhas por lista antes de acender `truncado`. */
const MAX_PAGINAS = 100;

export interface OpcoesLista {
	orderBy?: string;
	ascending?: boolean;
	/** Teto EXPLÍCITO de linhas: quando presente, buscamos numa query só (sem paginar). */
	limit?: number;
	incluirExcluidos?: boolean;
	/**
	 * Colunas a trazer (ex.: `"id, numero, status, valor_total"`). Padrão `"*"`.
	 * Use os espelhos e NÃO traga o blob `dados` (jsonb) quando a tela só lista —
	 * o blob é relido por id na hora de editar (padrão do Kanban).
	 */
	colunas?: string;
}

export function useOlliList<T = Record<string, unknown>>(
	table: string,
	opts?: OpcoesLista,
): UseQueryResult<T[], Error> & { truncado: boolean } {
	// `truncado` sinaliza que a trava de segurança cortou a leitura antes do fim.
	// Fica num ref porque é um efeito colateral do queryFn; quando a query resolve,
	// o re-render do React Query já lê o valor atualizado.
	const truncadoRef = useRef(false);

	const query = useQuery({
		queryKey: ["olli", table, opts],
		queryFn: async (): Promise<T[]> => {
			truncadoRef.current = false;
			const colunas = opts?.colunas ?? "*";

			// Monta a consulta-base (filtro de lixeira + ordenação ESTÁVEL). A ordem
			// estável é obrigatória para paginar com `.range` sem pular nem repetir
			// linha: sem `orderBy`, ordenamos por `id` (presente e único em toda tabela).
			const base = () => {
				let q = supabase.from(table).select(colunas);
				// A exclusão no OLLI é SOFT (carimba `excluido_em`) — apagar de verdade faria
				// o celular ressuscitar a linha no próximo sync. Sem este filtro, o que o
				// usuário "excluiu" continuaria na lista e o botão pareceria quebrado.
				if (!opts?.incluirExcluidos) q = q.is("excluido_em", null);
				if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: opts?.ascending ?? false });
				q = q.order("id", { ascending: true });
				return q;
			};

			// Caminho com teto EXPLÍCITO: o chamador pediu um recorte — respeitamos (1 query).
			if (opts?.limit) {
				const { data, error } = await base().limit(opts.limit);
				if (error) throw error;
				return (data ?? []) as T[];
			}

			// Sem teto: pagina com `.range` até esgotar. O PostgREST capa CADA resposta em
			// ~1000 linhas; sem isto, o que passa de 1000 sumia da lista/KPIs SEM erro — a
			// versão em escala do bug crônico da casa ("dado que existe vira invisível").
			const linhas: T[] = [];
			for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
				const inicio = pagina * TAMANHO_PAGINA;
				const { data, error } = await base().range(inicio, inicio + TAMANHO_PAGINA - 1);
				if (error) throw error;
				const lote = (data ?? []) as T[];
				linhas.push(...lote);
				if (lote.length < TAMANHO_PAGINA) return linhas; // página curta = acabou
			}
			// Estouramos a trava de segurança: existe MAIS do que buscamos. Melhor AVISAR
			// (`truncado`) do que devolver um recorte silencioso fingindo ser o total.
			truncadoRef.current = true;
			return linhas;
		},
		staleTime: 30_000,
	});

	// Propriedade ADITIVA: quem não usa `truncado` continua igual; as telas que
	// quiserem podem acender um aviso âmbar quando `truncado === true`.
	return Object.assign(query, { truncado: truncadoRef.current });
}

/** Contagem exata de linhas visíveis (para KPIs). Respeita RLS e ignora a lixeira. */
export function useOlliCount(table: string) {
	return useQuery({
		queryKey: ["olli-count", table],
		queryFn: async (): Promise<number> => {
			const { count, error } = await supabase
				.from(table)
				.select("*", { count: "exact", head: true })
				.is("excluido_em", null);
			if (error) throw error;
			return count ?? 0;
		},
		staleTime: 30_000,
	});
}

/** A empresa (tenant) do usuário logado — para nome, logo e cor de marca (white-label). */
export function useMinhaEmpresa() {
	return useQuery({
		queryKey: ["olli", "empresa", "me"],
		queryFn: async () => {
			const { data, error } = await supabase.from("empresa").select("*").limit(1).maybeSingle();
			if (error) throw error;
			return data as Record<string, unknown> | null;
		},
		staleTime: 60_000,
	});
}
