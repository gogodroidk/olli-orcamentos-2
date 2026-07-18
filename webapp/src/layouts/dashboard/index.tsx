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
			{isMobile ? <MobileLayout /> : <PcLayout />}
		</div>
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
