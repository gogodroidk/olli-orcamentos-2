/**
 * GRAVA o WhatsApp do cliente digitado no diálogo de envio (CQ-ATIVACAO-LOTE1, achado 3).
 *
 * Fica FORA de `useEnviarWhatsApp` de propósito: lá só mora o envio, e o status do orçamento
 * só muda pela porta única `useMarcarEnviado` (teste-empurrao-envio). Aqui só o telefone muda.
 *
 *  - No ORÇAMENTO: relê o blob FRESCO e grava só `clienteTelefone` por cima (nunca um blob velho).
 *  - No CLIENTE cadastrado: só se ele ainda não tinha número válido (nunca troca um número bom
 *    em silêncio). É bônus: se falhar, o orçamento já tem o número e o envio segue.
 */
import type { Orcamento } from "@dominio";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { numeroParaWhatsApp } from "@/olli/linkWhatsApp";
import { useSalvar } from "@/olli/mutacoes";

/** Devolve uma função que grava `telefone` (já com máscara) e lança se o ORÇAMENTO não foi salvo. */
export function useSalvarWhatsAppDoCliente() {
	const qc = useQueryClient();
	const salvarOrcamento = useSalvar("orcamentos");

	return useCallback(
		async (orcamentoId: string, telefone: string): Promise<void> => {
			const { data, error } = await supabase.from("orcamentos").select("dados").eq("id", orcamentoId).maybeSingle();
			if (error) throw error;
			const fresco = data?.dados as Orcamento | null | undefined;
			if (!fresco || typeof fresco !== "object") throw new Error("orçamento não encontrado");
			await salvarOrcamento.mutateAsync({ ...fresco, clienteTelefone: telefone, atualizadoEm: new Date().toISOString() });
			if (fresco.clienteId) {
				try {
					const { data: cli } = await supabase.from("clientes").select("telefone").eq("id", fresco.clienteId).maybeSingle();
					if (cli && !numeroParaWhatsApp(cli.telefone as string | null)) {
						const { error: erroCliente } = await supabase
							.from("clientes")
							.update({ telefone, atualizado_em: new Date().toISOString() })
							.eq("id", fresco.clienteId);
						if (!erroCliente) void qc.invalidateQueries({ queryKey: ["olli", "clientes"] });
					}
				} catch {
					// o envio segue com o número salvo no orçamento
				}
			}
			void qc.invalidateQueries({ queryKey: ["olli", "orcamentos"] });
		},
		[salvarOrcamento, qc],
	);
}
