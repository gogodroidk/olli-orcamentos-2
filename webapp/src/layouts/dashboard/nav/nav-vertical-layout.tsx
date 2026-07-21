import { Icon } from "@/components/icon";
import Logo from "@/components/logo";
import { NavMini, NavVertical } from "@/components/nav";
import type { NavProps } from "@/components/nav/types";
import { GLOBAL_CONFIG } from "@/global-config";
import { useSettingActions, useSettings } from "@/store/settingStore";
import { ThemeLayout } from "@/types/enum";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { cn } from "@/utils";

type Props = {
	data: NavProps["data"];
	className?: string;
};

export function NavVerticalLayout({ data, className }: Props) {
	const settings = useSettings();
	const { themeLayout } = settings;
	const { setSettings } = useSettingActions();

	const navWidth = themeLayout === ThemeLayout.Vertical ? "var(--layout-nav-width)" : "var(--layout-nav-width-mini)";
	const handleToggle = () => {
		setSettings({
			...settings,
			themeLayout: themeLayout === ThemeLayout.Mini ? ThemeLayout.Vertical : ThemeLayout.Mini,
		});
	};
	return (
		<nav
			data-slot="slash-layout-nav"
			// Sem nome, o leitor de tela anunciava só "navegação" — e o painel tem três
			// marcos de navegação (menu, trilha, e o menu do celular).
			aria-label="Menu principal"
			className={cn(
				"fixed inset-y-0 left-0 flex-col h-full bg-background border-r border-dashed z-nav transition-[width] duration-300 ease-in-out",
				className,
			)}
			style={{
				width: navWidth,
			}}
		>
			<div
				className={cn("relative flex items-center py-4 px-2 h-[var(--layout-header-height)] ", {
					"justify-center": themeLayout === ThemeLayout.Mini,
				})}
			>
				<div className="flex items-center justify-center">
					<Logo />
					{/* O nome da marca some no escuro sem `text-text-primary`: sem classe
					    de cor ele herda o preto padrão do navegador (1,11:1 sobre o navy).
					    Com o token: branco no escuro (18,94:1) e cinza-800 no claro (15,51:1). */}
					<span
						className="text-xl font-bold text-text-primary transition-all duration-300 ease-in-out overflow-hidden"
						style={{
							opacity: themeLayout === ThemeLayout.Mini ? 0 : 1,
							maxWidth: themeLayout === ThemeLayout.Mini ? 0 : "200px",
							whiteSpace: "nowrap",
							marginLeft: themeLayout === ThemeLayout.Mini ? 0 : "8px",
						}}
					>
						{GLOBAL_CONFIG.appName}
					</span>
				</div>

				{/* variant="outline" pinta borda e fundo, mas NÃO a cor do texto — a seta
				    herdava preto e sumia no escuro (1,11:1); com o token, 18,94:1. */}
				<Button
					variant="outline"
					size="icon"
					onClick={handleToggle}
					aria-label={themeLayout === ThemeLayout.Mini ? "Expandir menu" : "Recolher menu"}
					className="h-7 w-7 absolute right-0 translate-x-1/2 text-text-primary"
				>
					{themeLayout === ThemeLayout.Mini ? (
						<Icon icon="lucide:arrow-right-to-line" size={12} />
					) : (
						<Icon icon="lucide:arrow-left-to-line" size={12} />
					)}
				</Button>
			</div>

			<ScrollArea className={cn("h-[calc(100vh-var(--layout-header-height))] px-2 bg-background")}>
				{themeLayout === ThemeLayout.Mini ? <NavMini data={data} /> : <NavVertical data={data} />}
			</ScrollArea>
		</nav>
	);
}
