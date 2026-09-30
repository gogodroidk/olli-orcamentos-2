/**
 * CONTRATOS RECORRENTES no painel — leitura, gravação e geração de visitas.
 *
 * A regra mora em `src/utils/contratoRecorrente*.ts` (a MESMA do app do celular e do
 * cron do worker). Aqui só a cola com o React Query e o tenant de escrita:
 * gestor/admin grava no tenant do DONO (`useContextoDeEscrita`); sem saber o tenant,
 * não grava (fail-closed — a gravação "no tenant errado" some para a empresa).
 */
import type { ContratoRecorrente } from "@dominio";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { opcoesContextoDeEscrita } from "@/olli/mutacoes";
import type { ResultadoGeracaoContratos } from "../../../../../src/utils/contratoRecorrenteGeracao";
import {
	excluirContrato,
	gerarVisitas,
	type LeituraContratos,
	listarContratos,
	salvarContrato,
} from "../../../../../src/utils/contratoRecorrenteSupabase";

export const CHAVE_CONTRATOS = ["olli", "service_contracts"] as const;

export function useContratos() {
	return useQuery({
		queryKey: CHAVE_CONTRATOS,
		queryFn: (): Promise<LeituraContratos> => listarContratos(supabase),
		staleTime: 30_000,
	});
}

/** O que mudou depois de mexer em contrato: contratos, agenda e OS (as visitas geradas). */
function useInvalidarTudo() {
	const qc = useQueryClient();
	return () => {
		qc.invalidateQueries({ queryKey: CHAVE_CONTRATOS });
		qc.invalidateQueries({ queryKey: ["olli", "agendamentos"] });
		qc.invalidateQueries({ queryKey: ["olli", "ordens_servico"] });
	};
}

export function useSalvarContrato() {
	const qc = useQueryClient();
	const invalidar = useInvalidarTudo();
	return useMutation({
		mutationFn: async (
			contrato: ContratoRecorrente,
		): Promise<{ contrato: ContratoRecorrente; geracao: ResultadoGeracaoContratos | null }> => {
			const ctx = await qc.fetchQuery(opcoesContextoDeEscrita);
			const { data: sessao } = await supabase.auth.getUser();
			// Dono/pessoal grava no próprio id; membro grava no do dono. Sem sessão = não grava.
			const tenant = ctx.ownerUserId ?? sessao.user?.id ?? null;
			const salvo = await salvarContrato(supabase, contrato, tenant);
			let geracao: ResultadoGeracaoContratos | null = null;
			try {
				geracao = await gerarVisitas(supabase, [salvo]);
			} catch {
				geracao = null; // contrato salvo; a próxima abertura tenta gerar de novo
			}
			return { contrato: salvo, geracao };
		},
		onSuccess: invalidar,
	});
}

export function useExcluirContrato() {
	const invalidar = useInvalidarTudo();
	return useMutation({
		mutationFn: (c: ContratoRecorrente) => excluirContrato(supabase, c),
		onSuccess: invalidar,
	});
}

export function useGerarVisitas() {
	const invalidar = useInvalidarTudo();
	return useMutation({
		mutationFn: () => gerarVisitas(supabase),
		onSuccess: invalidar,
	});
}
