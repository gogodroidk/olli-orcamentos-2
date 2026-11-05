import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/ui/skeleton";
import { useMinhaEmpresa } from "@/olli/data";
import { Button } from "@/ui/button";

/**
 * Espera saber QUAL empresa é desta sessão antes de abrir o painel (3 estados: sem
 * leitura confirmada, nada operacional abre). NÃO exige mais o cadastro completo:
 * desde 04/10/2026 (paridade com o app 1.2.0) a pessoa entra, faz o primeiro
 * orçamento, e o cadastro é cobrado só quando um documento vai SAIR com os dados do
 * negócio — porta única em `olli/exigirCadastro.ts`. A trava antiga segurou 38 de 61
 * contas antes de qualquer orçamento.
 */
export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const empresa = useMinhaEmpresa();

	if (empresa.isLoading) {
		return (
			<div className="grid min-h-svh place-items-center bg-background px-6" role="status">
				<div className="flex w-full max-w-xs flex-col items-center gap-4">
					<Skeleton className="h-2.5 w-40 rounded-full" />
					<p className="text-sm text-text-secondary">Preparando seu espaço de trabalho…</p>
				</div>
			</div>
		);
	}

	if (empresa.isError) {
		return (
			<div className="grid min-h-svh place-items-center bg-background px-6">
				<div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm" role="alert">
					<AlertTriangle className="size-6 text-warning-dark" aria-hidden />
					<h1 className="mt-4 text-xl font-bold text-text-primary">Não consegui confirmar seu cadastro</h1>
					<p className="mt-2 text-sm leading-relaxed text-text-secondary">
						Nenhuma área operacional foi liberada sem saber qual empresa pertence a esta sessão.
					</p>
					<Button type="button" className="mt-5" onClick={() => empresa.refetch()}>
						Tentar de novo
					</Button>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
