import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Camada de dados do OLLI (web) — online-first, direto no Supabase.
 * O RLS do Postgres já limita cada consulta ao tenant do usuário logado
 * (dono ou membro da organização), então um `select('*')` simples já volta
 * só o que a conta PODE ver. As telas seguem a regra dos 3 estados via
 * TanStack Query: `isLoading` (carregando) · `isError` (erro, NUNCA vira
 * "vazio") · `data` (valor).
 */
export function useOlliList<T = Record<string, unknown>>(
	table: string,
	opts?: { orderBy?: string; ascending?: boolean; limit?: number },
) {
	return useQuery({
		queryKey: ["olli", table, opts],
		queryFn: async (): Promise<T[]> => {
			let q = supabase.from(table).select("*");
			if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: opts?.ascending ?? false });
			if (opts?.limit) q = q.limit(opts.limit);
			const { data, error } = await q;
			if (error) throw error;
			return (data ?? []) as T[];
		},
		staleTime: 30_000,
	});
}

/** Contagem exata de linhas visíveis (para KPIs). Respeita RLS. */
export function useOlliCount(table: string) {
	return useQuery({
		queryKey: ["olli-count", table],
		queryFn: async (): Promise<number> => {
			const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
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
