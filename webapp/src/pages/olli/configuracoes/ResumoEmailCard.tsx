import { interpretarEstadoResumoEmail, linhaResumoEmail, ROTULO_RESUMO_EMAIL } from "@resumo-email";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { Switch } from "@/ui/switch";

const CHAVE = ["olli", "email", "resumo-dinheiro"] as const;

async function lerEstado() {
	const { data, error } = await supabase.rpc("meu_resumo_dinheiro_email");
	if (error) throw error;
	const estado = interpretarEstadoResumoEmail(data);
	if (!estado) throw new Error("resposta_invalida");
	return estado;
}

/**
 * "RECEBER RESUMO DIÁRIO POR E-MAIL" — a mesma preferência do app (Conta →
 * Notificações), gravada na conta pelo banco (`definir_resumo_dinheiro_email`).
 *
 * O e-mail das 7h resume exatamente o que a tela Início mostra (mesma regra,
 * `@radar-dinheiro`): dinheiro a receber, propostas paradas e clientes sumidos.
 * Os textos vêm de `@resumo-email`, iguais aos do celular.
 *
 * 3 estados: carregando (esqueleto) · erro ("não consegui ver", com tentar de novo —
 * nunca um interruptor desligado fingindo resposta) · valor. O interruptor só muda
 * depois que o banco confirma.
 */
export function ResumoEmailCard() {
	const qc = useQueryClient();
	const q = useQuery({ queryKey: CHAVE, queryFn: lerEstado, staleTime: 60_000, retry: 1 });
	const salvar = useMutation({
		mutationFn: async (ligar: boolean) => {
			const { data, error } = await supabase.rpc("definir_resumo_dinheiro_email", { p_ativo: ligar, p_origem: "painel" });
			if (error) throw error;
			const estado = interpretarEstadoResumoEmail(data);
			if (!estado) throw new Error("resposta_invalida");
			return estado;
		},
		onSuccess: (estado) => {
			qc.setQueryData(CHAVE, estado);
			toast.success(estado.ativo ? "Resumo diário ligado." : "Resumo diário desligado.");
		},
		onError: () => toast.error("Não consegui salvar agora — continua como estava."),
	});

	const linha = q.data ? linhaResumoEmail(q.data) : null;

	return (
		<Card className="p-5">
			<div className="flex gap-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
					<MailCheck className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-4">
						<h2 id="resumo-email-titulo" className="font-semibold text-text-primary">
							{ROTULO_RESUMO_EMAIL}
						</h2>
						{linha && (
							<Switch
								aria-labelledby="resumo-email-titulo"
								checked={linha.ligado}
								disabled={!linha.podeAlternar || salvar.isPending}
								onCheckedChange={(v) => salvar.mutate(v)}
								className="mt-0.5"
							/>
						)}
					</div>
					{q.isLoading ? (
						<Skeleton className="mt-2 h-4 w-64" />
					) : q.isError || !linha ? (
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<p className="text-sm text-error">Não consegui ver sua preferência agora. Nada foi alterado.</p>
							<Button type="button" size="sm" variant="outline" onClick={() => q.refetch()} className="gap-1.5">
								<RotateCw className="size-3.5" />
								Tentar de novo
							</Button>
						</div>
					) : (
						<p className="mt-1 text-sm text-text-secondary">{linha.descricao}</p>
					)}
				</div>
			</div>
		</Card>
	);
}
