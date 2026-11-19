import { destinoDoConvitePendente, extrairTokenConviteDaBusca, guardarConvitePendente } from "@convite-google";
import { Navigate } from "react-router";
import Logo from "@/components/logo";
import { GLOBAL_CONFIG } from "@/global-config";
import { useTituloDaAba } from "@/hooks/use-titulo-da-aba";
import SettingButton from "@/layouts/components/setting-button";
import { destinoDepoisDoLogin, lerIntencaoPlano } from "@/olli/plano-intent";
import { useAuthHydrated, useUserToken } from "@/store/userStore";
import { Skeleton } from "@/ui/skeleton";
import CodigoForm from "./codigo-form";
import BrandHero, { FRASE_MARCA } from "./components/BrandHero";
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
			<main className="grid min-h-svh place-items-center bg-background px-6">
				<div className="flex w-full max-w-xs flex-col items-center gap-4" role="status" aria-live="polite">
					<Skeleton className="h-2.5 w-40 rounded-full" />
					<p className="text-sm text-muted-foreground">Verificando sua sessão…</p>
				</div>
			</main>
		);
	}

	if (token.accessToken) {
		// Quem já está logado não monta o LoginProvider. Sem gravar agora, o
		// ?convite= da página do convite se perde no redirect.
		const daUrl = extrairTokenConviteDaBusca(window.location.search);
		if (daUrl) guardarConvitePendente(window.sessionStorage, daUrl);
		// Quem veio de um CTA de plano volta para o plano — pela URL (login por
		// e-mail) ou pela intenção guardada antes do redirect do OAuth.
		const destino =
			destinoDoConvitePendente(window.sessionStorage) ??
			destinoDepoisDoLogin(lerIntencaoPlano(window.location.search)) ??
			destinoDepoisDoOAuth() ??
			GLOBAL_CONFIG.defaultRoute;
		return <Navigate to={destino} replace />;
	}

	return (
		<div className="relative grid h-[calc(100svh-var(--olli-consent,0px))] overflow-y-auto lg:grid-cols-2 bg-background">
			<div className="flex flex-col gap-1 p-4 pt-2 md:gap-4 md:p-10">
				<div className="flex justify-center gap-2 md:justify-start">
					<div className="flex items-center gap-2 font-medium cursor-pointer">
						<Logo size={28} />
						<span>{GLOBAL_CONFIG.appName}</span>
					</div>
				</div>
				{/* D-2151 #5: no celular o painel azul (BrandHero) some e quem chega novo via só "Entrar". */}
				<p className="text-center text-sm text-muted-foreground lg:hidden">{FRASE_MARCA}</p>
				{/* Landmark `<main>`: o formulário é o conteúdo principal da página (leitor
				    de tela pula direto para cá; Lighthouse cobra a ausência). */}
				<main className="flex flex-1 items-start justify-center md:items-center">
					<div className="w-full max-w-xs rounded-2xl bg-card p-4 shadow-card md:p-6">
						<LoginProvider>
							<LoginForm />
							<RegisterForm />
							<ResetForm />
							<CodigoForm />
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
