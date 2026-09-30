import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";
import Logo from "@/components/logo";
import { GLOBAL_CONFIG } from "@/global-config";
import { useTituloDaAba } from "@/hooks/use-titulo-da-aba";
import SettingButton from "@/layouts/components/setting-button";
import { destinoDepoisDoLogin, lerIntencaoPlano } from "@/olli/plano-intent";
import { useAuthHydrated, useUserToken } from "@/store/userStore";
import BrandHero from "./components/BrandHero";
import LoginForm from "./login-form";
import { LoginProvider } from "./providers/login-provider";
import RegisterForm from "./register-form";
import ResetForm from "./reset-form";
import { destinoDepoisDoOAuth, useRetornoOAuth } from "./use-retorno-oauth";

function LoginPage() {
	const token = useUserToken();
	const authHydrated = useAuthHydrated();
	useTituloDaAba("Entrar");
	// Volta do Google/Apple: avisa se o login não fechou e mede o funil (sem PII).
	useRetornoOAuth();

	if (!authHydrated) {
		return (
			// `role="status"` fica no filho: no próprio <main> ele trocaria o papel do
			// elemento e a página perderia o landmark que este <main> existe para dar.
			<main className="grid min-h-svh place-items-center bg-background">
				<div className="flex items-center gap-3 text-sm text-muted-foreground" role="status" aria-live="polite">
					<Loader2 className="size-5 animate-spin" aria-hidden />
					Verificando sua sessão…
				</div>
			</main>
		);
	}

	if (token.accessToken) {
		// Quem veio de um CTA de plano volta para o plano — pela URL (login por
		// e-mail) ou pela intenção guardada antes do redirect do OAuth.
		const destino =
			destinoDepoisDoLogin(lerIntencaoPlano(window.location.search)) ??
			destinoDepoisDoOAuth() ??
			GLOBAL_CONFIG.defaultRoute;
		return <Navigate to={destino} replace />;
	}

	return (
		<div className="relative grid min-h-svh lg:grid-cols-2 bg-background">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<div className="flex justify-center gap-2 md:justify-start">
					<div className="flex items-center gap-2 font-medium cursor-pointer">
						<Logo size={28} />
						<span>{GLOBAL_CONFIG.appName}</span>
					</div>
				</div>
				{/* Landmark `<main>`: o formulário é o conteúdo principal da página (leitor
				    de tela pula direto para cá; Lighthouse cobra a ausência). */}
				<main className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<LoginProvider>
							<LoginForm />
							<RegisterForm />
							<ResetForm />
						</LoginProvider>
					</div>
				</main>
			</div>

			<BrandHero />

			<div className="absolute right-2 top-0 flex flex-row">
				<SettingButton />
			</div>
		</div>
	);
}
export default LoginPage;
