import { ThemeLayout } from "#/enum";
import Logo from "@/components/logo";
import { down, useMediaQuery } from "@/hooks";
import { useApplyBranding } from "@/olli/branding";
import { useSettings } from "@/store/settingStore";
import Header from "./header";
import Main from "./main";
import { NavHorizontalLayout, NavMobileLayout, NavVerticalLayout, useFilteredNavData } from "./nav";

export default function DashboardLayout() {
	const isMobile = useMediaQuery(down("md"));
	// White-label: pinta o painel com a cor da marca da empresa logada.
	useApplyBranding();

	return (
		// `text-foreground` NÃO é decoração: é a raiz do bug "no escuro some tudo".
		// Nada neste projeto define `color` no <html>/<body> (global.css só define
		// `background-color`), então a cor de texto INICIAL é a do navegador —
		// preto. No claro isso passa despercebido (preto no branco); no escuro,
		// todo elemento que não traz uma classe de cor própria herda PRETO sobre o
		// navy #07111F: 1,11:1 — invisível. Era esta a causa da engrenagem sumida,
		// do nome OLLI apagado, do avatar e do ícone de busca invisíveis.
		// Aqui a gente ancora a herança em `--foreground` (branco no escuro,
		// #09090B no claro). Portais (Sheet/Dropdown/Dialog) saem para fora desta
		// div e por isso já trazem foreground próprio nos componentes de ui/.
		<div data-slot="slash-layout-root" className="w-full min-h-screen bg-background text-foreground">
			<PularParaConteudo />
			{isMobile ? <MobileLayout /> : <PcLayout />}
		</div>
	);
}

/**
 * "Pular para o conteúdo" — o primeiro Tab de qualquer tela do painel.
 *
 * Medido no painel carregado (desktop, 1280px): a tela de Início tem 37 paradas de
 * foco, e as 22 PRIMEIRAS são o menu lateral. Sem este atalho, quem usa teclado
 * atravessava o menu inteiro a CADA troca de tela só para chegar no conteúdo — e o
 * painel não tinha nenhum (a landing já tinha o dela).
 *
 * `focus:` e não `focus-visible:`: o link é invisível até receber foco, então ele
 * PRECISA aparecer em qualquer forma de foco, senão o usuário estaria com o foco
 * num link que não existe na tela.
 */
function PularParaConteudo() {
	return (
		<a
			href="#conteudo"
			onClick={(e) => {
				// Foco explícito em vez de deixar o navegador resolver o "#": com o
				// react-router no meio, o pulo por hash rola a página mas nem sempre
				// move o foco — e mover o foco é o ponto inteiro do atalho.
				const alvo = document.getElementById("conteudo");
				if (!alvo) return;
				e.preventDefault();
				alvo.focus();
				alvo.scrollIntoView({ block: "start" });
			}}
			className="sr-only rounded-lg font-semibold text-sm focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-tooltip focus:bg-primary focus:px-4 focus:py-2.5 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-primary"
		>
			Pular para o conteúdo
		</a>
	);
}

function MobileLayout() {
	const navData = useFilteredNavData();
	return (
		<>
			{/* Sticky Header */}
			<Header leftSlot={<NavMobileLayout data={navData} />} />
			<Main />
		</>
	);
}

function PcLayout() {
	const { themeLayout } = useSettings();

	if (themeLayout === ThemeLayout.Horizontal) return <PcHorizontalLayout />;
	return <PcVerticalLayout />;
}

function PcHorizontalLayout() {
	const navData = useFilteredNavData();
	return (
		<>
			{/* Sticky Header */}
			<Header leftSlot={<Logo />} />
			{/* Sticky Nav */}
			<NavHorizontalLayout data={navData} />

			<Main />
		</>
	);
}

function PcVerticalLayout() {
	const settings = useSettings();
	const { themeLayout } = settings;
	const navData = useFilteredNavData();

	const mainPaddingLeft =
		themeLayout === ThemeLayout.Vertical ? "var(--layout-nav-width)" : "var(--layout-nav-width-mini)";

	return (
		<>
			{/* Fixed Header */}
			<NavVerticalLayout data={navData} />

			<div
				className="relative w-full min-h-screen flex flex-col transition-[padding] duration-300 ease-in-out"
				style={{
					paddingLeft: mainPaddingLeft,
				}}
			>
				<Header />
				<Main />
			</div>
		</>
	);
}
