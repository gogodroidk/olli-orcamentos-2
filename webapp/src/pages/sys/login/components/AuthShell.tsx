import type { ReactNode } from "react";
import Logo from "@/components/logo";
import { GLOBAL_CONFIG } from "@/global-config";
import SettingButton from "@/layouts/components/setting-button";
import BrandHero from "./BrandHero";

/**
 * Moldura das páginas de acesso fora do /auth/login (confirmar link, nova senha):
 * a mesma da tela de login — logo, coluna do formulário e o herói da marca.
 */
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<div className="relative grid min-h-svh lg:grid-cols-2 bg-background">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<div className="flex justify-center gap-2 md:justify-start">
					<div className="flex items-center gap-2 font-medium">
						<Logo size={28} />
						<span>{GLOBAL_CONFIG.appName}</span>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">{children}</div>
				</div>
			</div>

			<BrandHero />

			<div className="absolute right-2 top-0 flex flex-row">
				<SettingButton />
			</div>
		</div>
	);
}

export default AuthShell;
