import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { definirMedicaoDaConta, lerMedicaoDaConta } from "@/lib/marketing";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Skeleton } from "@/ui/skeleton";
import { Switch } from "@/ui/switch";

const CHAVE = ["olli", "conta", "medicao-anuncios"] as const;

const dataBr = (iso?: string) => {
	if (!iso) return null;
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
};

/**
 * "MEDIÇÃO DE ANÚNCIOS" — liga/desliga o envio ao Meta (Conversions API) do cadastro e da assinatura desta conta.
 *
 * Por quê (parecer LEGAL 07/10/2026, ajuste 3; LGPD art. 8º §5º): o aceite do cadastro ficava congelado na conta e o
 * evento de assinatura pode sair semanas depois. Desligar aqui grava `consentimento = "nao"` na conta; o banco só envia
 * com "sim", então o que estiver pendente PARA de sair. Revogar tem de ser tão fácil quanto aceitar.
 *
 * 3 estados: carregando (esqueleto) · erro ("não consegui ver", com tentar de novo — nunca um interruptor desligado
 * fingindo resposta) · valor. O interruptor só muda depois que a conta confirma a gravação.
 */
export function MedicaoAnunciosCard() {
	const qc = useQueryClient();
	const q = useQuery({ queryKey: CHAVE, queryFn: lerMedicaoDaConta, staleTime: 30_000, retry: 1 });
	const salvar = useMutation({
		mutationFn: (ligar: boolean) => definirMedicaoDaConta(ligar ? "sim" : "nao"),
		onSuccess: (_r, ligar) => {
			qc.invalidateQueries({ queryKey: CHAVE });
			toast.success(ligar ? "Medição de anúncios ligada." : "Medição de anúncios desligada. Nada mais é enviado ao Meta.");
		},
		onError: () => toast.error("Não consegui salvar agora — continua como estava."),
	});

	const dado = q.data;
	const indisponivel = q.isError || dado?.estado === "indisponivel";
	const quando = dataBr(dado?.consentimentoEm);

	return (
		<Card className="p-5">
			<div className="flex gap-3">
				<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
					<Megaphone className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-start justify-between gap-4">
						<h2 id="medicao-anuncios-titulo" className="font-semibold text-text-primary">
							Medição de anúncios
						</h2>
						{dado && !indisponivel && (
							<Switch
								aria-labelledby="medicao-anuncios-titulo"
								checked={dado.estado === "ligada"}
								disabled={salvar.isPending}
								onCheckedChange={(v) => salvar.mutate(v)}
								className="mt-0.5"
							/>
						)}
					</div>
					{q.isLoading ? (
						<Skeleton className="mt-2 h-4 w-64" />
					) : indisponivel ? (
						<div className="mt-1 flex flex-wrap items-center gap-2">
							<p className="text-sm text-error">Não consegui ver sua preferência agora. Nada foi alterado.</p>
							<Button type="button" size="sm" variant="outline" onClick={() => q.refetch()} className="gap-1.5">
								<RotateCw className="size-3.5" />
								Tentar de novo
							</Button>
						</div>
					) : (
						<p className="mt-1 text-sm text-text-secondary">
							{dado?.estado === "ligada"
								? "Ligada: ao criar a conta ou assinar, avisamos o Meta com o seu e-mail em código (hash)."
								: dado?.estado === "desligada"
									? "Desligada: não enviamos nada ao Meta sobre esta conta."
									: "Você ainda não respondeu: não enviamos nada ao Meta sobre esta conta."}
							{quando ? ` Decisão de ${quando}.` : ""}{" "}
							<a className="underline" href="https://olliorcamentos.online/legal/privacidade/" target="_blank" rel="noreferrer">
								Saiba mais
							</a>
						</p>
					)}
				</div>
			</div>
		</Card>
	);
}
