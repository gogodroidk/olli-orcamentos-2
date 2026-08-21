import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import Logo from "@/components/logo";
import { supabase } from "@/lib/supabase";
import { limparIndicioDeSessao, marcarIndicioDeSessao } from "@/lib/session-hint";

/**
 * Ponte segura entre `olliorcamentos.online` e o painel.
 *
 * A landing só enxerga um cookie booleano. Esta tela é quem consulta a sessão
 * real no origin do app antes de liberar `/inicio`; portanto o cookie jamais
 * funciona como credencial ou substituto do guard de autenticação.
 */
export default function EntradaPage() {
	const [destino, setDestino] = useState<string | null>(null);

	useEffect(() => {
		let ativo = true;
		supabase.auth
			.getSession()
			.then(({ data, error }) => {
				if (!ativo) return;
				if (!error && data.session) {
					marcarIndicioDeSessao();
					setDestino("/inicio");
					return;
				}
				limparIndicioDeSessao();
				setDestino("/auth/login");
			})
			.catch(() => {
				if (!ativo) return;
				// Uma falha de rede não pode ser interpretada como sessão válida.
				limparIndicioDeSessao();
				setDestino("/auth/login");
			});
		return () => {
			ativo = false;
		};
	}, []);

	if (destino) return <Navigate to={destino} replace />;

	return (
		<main className="grid min-h-svh place-items-center bg-background px-6 text-center">
			<div className="flex flex-col items-center gap-4">
				<Logo size={42} />
				<div>
					<h1 className="text-lg font-bold text-text-primary">Abrindo sua OLLI</h1>
					<p className="mt-1 text-sm text-text-secondary">Confirmando sua sessão com segurança…</p>
				</div>
				<Loader2 className="size-5 animate-spin text-primary" aria-label="Carregando" />
			</div>
		</main>
	);
}
