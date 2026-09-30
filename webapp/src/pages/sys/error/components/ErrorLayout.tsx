import { atrasoEscalonado } from "@/components/animate/tokens";
import { GLOBAL_CONFIG } from "@/global-config";
import { useTituloDaAba } from "@/hooks/use-titulo-da-aba";
import { Button } from "@/ui/button";
import { Text, Title } from "@/ui/typography";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

interface ErrorLayoutProps {
	title: string;
	desc?: ReactNode;
	svg?: ReactNode;
	helmetTitle?: string;
	homePath?: string;
	buttonText?: string;
	slots?: {
		footer?: ReactNode;
	};
}

export default function ErrorLayout({
	title,
	desc,
	svg,
	helmetTitle,
	homePath = GLOBAL_CONFIG.defaultRoute,
	buttonText = "Voltar ao início",
	slots = {},
}: ErrorLayoutProps) {
	// Era <Helmet>, que não aplica nada sob o React 19 (ver o hook).
	useTituloDaAba(helmetTitle);
	return (
		<>
			<main className="m-auto max-w-[400px] flex items-center justify-center h-full">
				{/*
				 * Tela de erro com entrada em CSS (`surgir`, tokens.css), escalonada. Era o
				 * `varBounce` do Motion com `initial` invisível: justo na tela de ERRO — que
				 * aparece quando algo não carregou — o texto dependia de mais um chunk de JS
				 * para ficar visível. Em CSS ele aparece de qualquer jeito.
				 */}
				<div className="flex flex-col items-center justify-center px-2 w-full gap-2">
					<div className="surgir">
						<Title as="h1" className="text-center">
							{title}
						</Title>
					</div>
					{desc && (
						<div className="surgir" style={{ animationDelay: `${atrasoEscalonado(1, "relaxed")}s` }}>
							<Text variant="subTitle1" color="secondary" align="center">
								{desc}
							</Text>
						</div>
					)}
					{svg && (
						<div className="surgir" style={{ animationDelay: `${atrasoEscalonado(2, "relaxed")}s` }}>
							{svg}
						</div>
					)}

					{/* Slots: footer */}
					{slots.footer ? (
						slots.footer
					) : (
						<NavLink to={homePath} className="mt-4 w-full flex justify-center">
							<Button size="lg" variant="contrast">
								{buttonText}
							</Button>
						</NavLink>
					)}
				</div>
			</main>
		</>
	);
}
