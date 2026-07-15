import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AgendamentoRow } from "./helpers";

/**
 * Agenda de HOJE — filtrada no SERVIDOR pelo intervalo do dia local.
 *
 * `useOlliList("agendamentos")` baixaria a tabela INTEIRA (sem limit) para só depois
 * filtrar "hoje" em memória. O PostgREST tem um cap silencioso de 1000 linhas: numa
 * conta com histórico de agenda grande, o compromisso de HOJE pode nem chegar ao
 * cliente (fica fora das 1000 linhas mais antigas em ordem ascendente) — a faixa vira
 * "Nenhum compromisso marcado para hoje", um vazio FALSO que faz o dono perder a visita.
 *
 * `inicio` é timestamptz DE VERDADE nesta tabela (ao contrário de `recibos.data_recebimento`,
 * ver `webapp/src/olli/datas.ts`), então dá para comparar com `Date` local sem medo:
 * `.gte(inicioDoDia).lt(fimDoDia)` já devolve só o dia — pouquíssimas linhas, sempre.
 */
export function useAgendamentosDoDia(agora: Date = new Date()) {
	const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
	const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 0, 0);
	const inicioIso = inicioDoDia.toISOString();
	const fimIso = fimDoDia.toISOString();

	return useQuery({
		queryKey: ["olli", "agendamentos", "hoje", inicioIso],
		queryFn: async (): Promise<AgendamentoRow[]> => {
			const { data, error } = await supabase
				.from("agendamentos")
				.select("*")
				.is("excluido_em", null) // soft delete — a lixeira não aparece na agenda
				.gte("inicio", inicioIso)
				.lt("inicio", fimIso)
				.order("inicio", { ascending: true });
			if (error) throw error;
			return (data ?? []) as AgendamentoRow[];
		},
		staleTime: 30_000,
	});
}
