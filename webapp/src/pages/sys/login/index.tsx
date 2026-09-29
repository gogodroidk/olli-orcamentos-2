import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";
import Logo from "@/components/logo";
import { GLOBAL_CONFIG } from "@/global-config";
import SettingButton from "@/layouts/components/setting-button";
import { useAuthHydrated, useUserToken } from "@/store/userStore";
import BrandHero from "./components/BrandHero";
import LoginForm from "./login-form";
import { LoginProvider } from "./providers/login-provider";
import RegisterForm from "./register-form";
import ResetForm from "./reset-form";

function LoginPage() {
	const token = useUserToken();
	const authHydrated = useAuthHydrated();

	if (!authHydrated) {
		return (
			<div className="grid min-h-svh place-items-center bg-background" role="status" aria-live="polite">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<Loader2 className="size-5 animate-spin" aria-hidden />
					Verificando sua sessão…
				</div>
			</div>
		);
	}

	if (token.accessToken) {
		return <Navigate to={GLOBAL_CONFIG.defaultRoute} replace />;
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
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<LoginProvider>
							<LoginForm />
							<RegisterForm />
							<ResetForm />
						</LoginProvider>
					</div>
				</div>
			</div>

			<BrandHero />

			<div className="absolute right-2 top-0 flex flex-row">
				<SettingButton />
			</div>
		</div>
	);
}
export default LoginPage;
