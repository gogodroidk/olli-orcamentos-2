/**
 * Move um orçamento de RASCUNHO para ENVIADO — a mesma regra do "Já enviei" do WhatsApp e do
 * "Já enviei" depois do PDF. Uma só porta para o painel não ter duas versões da regra.
 *
 *  - relê o documento FRESCO no servidor (nunca grava por cima de um blob velho da tela);
 *  - só move `rascunho` → `enviado`: nunca rebaixa quem já foi aprovado/negociado;
 *  - 3 estados: 'enviado' (moveu) · 'ja_avancado' (não era rascunho, nada a fazer) · 'falhou'
 *    (não consegui ler/gravar — o chamador AVISA, nunca finge que marcou).
 */
import type { Orcamento, StatusOrcamento } from "@dominio";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useSalvar } from "@/olli/mutacoes";

export type ResultadoMarcarEnviado = "enviado" | "ja_avancado" | "falhou";

export function useMarcarEnviado() {
	const qc = useQueryClient();
	const salvar = useSalvar("orcamentos");

	return useCallback(
		async (orcamentoId: string): Promise<ResultadoMarcarEnviado> => {
			try {
				const { data, error } = await supabase.from("orcamentos").select("dados").eq("id", orcamentoId).maybeSingle();
				if (error) throw error;
				const fresco = data?.dados as Orcamento | null | undefined;
				if (!fresco || typeof fresco !== "object") throw new Error("sem dados");
				if (fresco.status !== "rascunho") return "ja_avancado";
				await salvar.mutateAsync({ ...fresco, status: "enviado" as StatusOrcamento, atualizadoEm: new Date().toISOString() });
				void qc.invalidateQueries({ queryKey: ["olli", "orcamentos"] });
				return "enviado";
			} catch {
				return "falhou";
			}
		},
		[salvar, qc],
	);
}
