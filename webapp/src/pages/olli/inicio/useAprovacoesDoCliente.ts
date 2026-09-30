import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Uma resposta "aprovado" do CLIENTE, gravada pelo portal /o/<token> (worker/src/link.js). */
export interface AprovacaoDoCliente {
	orcamento_id: string;
	respondido_em: string;
}

/** Janela do "aprovou enquanto você estava fora": aprovação mais velha que isso já é rotina. */
export const JANELA_APROVACOES_DIAS = 7;

/**
 * As aprovações que o CLIENTE fez pelo link nos últimos 7 dias — a fonte do momento
 * "orçamento aprovado" do Início.
 *
 * Lê `orcamentos_publicos` (status + `respondido_em`), e não a coluna `status` de
 * `orcamentos`: lá "aprovado" também é o dono arrastando o card no Quadro, e
 * celebrar a própria ação dele como se fosse do cliente seria mentir. Aqui só entra
 * o que o portal gravou quando o cliente tocou "Aprovar".
 *
 * RLS `orcamentos_publicos_owner`: só o DONO lê; membro de equipe recebe lista vazia
 * — e para ele o momento simplesmente não aparece (o status aprovado continua em
 * todas as listas, que são a fonte de verdade). Erro também não desenha nada: isto é
 * a celebração de uma notícia que já está no painel, nunca o único lugar dela.
 */
export function useAprovacoesDoCliente() {
	return useQuery({
		queryKey: ["olli", "aprovacoes-do-cliente", JANELA_APROVACOES_DIAS],
		queryFn: async (): Promise<AprovacaoDoCliente[]> => {
			const desde = new Date(Date.now() - JANELA_APROVACOES_DIAS * 24 * 60 * 60 * 1000).toISOString();
			const { data, error } = await supabase
				.from("orcamentos_publicos")
				.select("orcamento_id, respondido_em")
				.eq("status", "aprovado")
				.is("revogado_em", null)
				.gte("respondido_em", desde)
				.order("respondido_em", { ascending: false })
				.limit(5);
			if (error) throw error;
			return ((data ?? []) as Partial<AprovacaoDoCliente>[]).filter(
				(r): r is AprovacaoDoCliente => typeof r.orcamento_id === "string" && typeof r.respondido_em === "string",
			);
		},
	});
}
