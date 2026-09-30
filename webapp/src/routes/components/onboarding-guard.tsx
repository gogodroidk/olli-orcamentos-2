import { AlertTriangle, Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { useMinhaEmpresa } from "@/olli/data";
import { camposPendentesPerfil, perfilOperacionalCompleto, ROTULO_CAMPO_PERFIL } from "@/olli/onboarding";
import { Button } from "@/ui/button";

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
	const local = useLocation();
	const empresa = useMinhaEmpresa();
	const naConfiguracao = local.pathname === "/meu-negocio";

	if (empresa.isLoading) {
		return (
			<div className="grid min-h-svh place-items-center bg-background px-6" role="status">
				<div className="flex items-center gap-3 text-sm text-text-secondary">
					<Loader2 className="size-5 animate-spin" aria-hidden />
					Preparando seu espaço de trabalho…
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

	if (!perfilOperacionalCompleto(empresa.data) && !naConfiguracao) {
		const pendentes = camposPendentesPerfil(empresa.data).map((campo) => ROTULO_CAMPO_PERFIL[campo]).join(", ");
		const retorno = encodeURIComponent(`${local.pathname}${local.search}`);
		return <Navigate to={`/meu-negocio?onboarding=1&retorno=${retorno}&pendentes=${encodeURIComponent(pendentes)}`} replace />;
	}

	return <>{children}</>;
}
