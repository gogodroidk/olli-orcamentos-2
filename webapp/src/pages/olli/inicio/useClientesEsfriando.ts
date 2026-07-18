import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOlliList } from "@/olli/data";
import type { AgendamentoRow } from "./helpers";
import { type ClienteRow, COLUNAS_AGENDA_RADAR, COLUNAS_CLIENTES_RADAR } from "./radares";

/**
 * As leituras EXTRAS do radar de clientes — as duas que a tela Início ainda não fazia.
 *
 * Orçamentos e recibos já estão carregados na página (a mesma leitura que alimenta os
 * KPIs e o dinheiro parado) e chegam por parâmetro no card. Aqui só faltam os clientes
 * e a agenda, e os dois vêm com COLUNAS MÍNIMAS (`COLUNAS_*_RADAR`): sem o blob, sem
 * endereço, sem histórico — o radar só precisa saber quem é, como falar com ele e
 * quando foi a última visita concluída.
 */
export function useClientesRadar() {
	return useOlliList<ClienteRow>("clientes", { colunas: COLUNAS_CLIENTES_RADAR, orderBy: "criado_em" });
}

export function useAgendaRadar() {
	return useOlliList<AgendamentoRow>("agendamentos", { colunas: COLUNAS_AGENDA_RADAR, orderBy: "inicio" });
}

/** Formato do `dados` de `extras_sync`/'radar.snooze': clienteId → ISO de até quando. */
type MapaAdiados = Record<string, string>;

/**
 * Os adiamentos do radar feitos NO CELULAR (`extras_sync`, chave `radar.snooze`).
 *
 * O painel só LÊ. Quem adia é o app — lá o "adiar 30 dias" grava no AsyncStorage e
 * sincroniza (ver `adiarClienteRadar` em `src/services/radarClientes.ts`). Sem esta
 * leitura, o cliente que o dono tirou do radar no aparelho voltaria a aparecer no
 * computador, e o painel pareceria não ter entendido a decisão dele.
 *
 * ERRO AQUI NÃO ESCONDE NINGUÉM: quem consome usa `data ?? {}`. Falhar a leitura do
 * snooze faz o radar mostrar de MAIS (talvez um cliente já adiado), nunca de menos —
 * é o único lado seguro. A regra da casa proíbe erro virar "você não tem nada"; um
 * mapa de adiamentos vazio faz exatamente o contrário.
 */
export function useRadarSnooze() {
	return useQuery({
		queryKey: ["olli", "extras", "radar.snooze"],
		queryFn: async (): Promise<MapaAdiados> => {
			const { data, error } = await supabase
				.from("extras_sync")
				.select("dados")
				.eq("chave", "radar.snooze")
				.maybeSingle();
			if (error) throw error;
			const dados = (data as { dados?: unknown } | null)?.dados;
			if (!dados || typeof dados !== "object" || Array.isArray(dados)) return {};
			// Só pares string→string entram: um valor estranho vindo de uma versão futura
			// do app não pode virar `new Date(undefined)` e adiar um cliente para sempre.
			const mapa: MapaAdiados = {};
			for (const [id, ate] of Object.entries(dados as Record<string, unknown>)) {
				if (typeof ate === "string" && ate) mapa[id] = ate;
			}
			return mapa;
		},
		staleTime: 60_000,
	});
}
