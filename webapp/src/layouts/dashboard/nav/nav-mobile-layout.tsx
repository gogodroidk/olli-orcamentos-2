import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Icon } from "@/components/icon";
import Logo from "@/components/logo";
import { NavVertical } from "@/components/nav";
import type { NavProps } from "@/components/nav/types";
import { GLOBAL_CONFIG } from "@/global-config";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/ui/sheet";
import { ConfirmarSairDialog, SairBotao } from "../../components/sair";

export function NavMobileLayout({ data }: NavProps) {
	const [open, setOpen] = useState(false);
	const [confirmandoSair, setConfirmandoSair] = useState(false);
	const { pathname } = useLocation();

	// Fecha o drawer ao navegar (tocar num item de menu não deixava mais fechado).
	// biome-ignore lint/correctness/useExhaustiveDependencies: intencional — reage à MUDANÇA de pathname, não usa o valor.
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	// Fecha o drawer ANTES de abrir a confirmação: o diálogo é irmão do Sheet
	// (nunca filho), senão o Sheet não-modal o desmontaria no primeiro toque.
	const pedirParaSair = () => {
		setOpen(false);
		setConfirmandoSair(true);
	};

	return (
		<>
		<Sheet modal={false} open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				{/* ic-menu.svg é currentColor; sem cor no ghost o "sanduíche" herdava
				    preto (1,11:1 no escuro). Token = 18,94:1. 44px de alvo de toque. */}
				<Button
					variant="ghost"
					size="icon"
					className="min-h-[44px] min-w-[44px] text-text-primary"
					aria-label="Abrir menu"
				>
					<Icon icon="local:ic-menu" size={24} />
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="[&>button]:hidden px-2 w-[280px] flex flex-col">
				<div className="flex gap-2 px-2 h-[var(--layout-header-height)] items-center shrink-0">
					<Logo />
					<span className="text-xl font-bold text-text-primary">{GLOBAL_CONFIG.appName}</span>
				</div>
				<ScrollArea className="flex-1 min-h-0">
					<NavVertical data={data} />
				</ScrollArea>
				{/* SAIR no rodapé do menu: no celular é aqui que o usuário procura sair,
				    não atrás do avatar do cabeçalho. Mesma ação e mesma confirmação do
				    menu da conta — um só caminho de código (ver components/sair.tsx). */}
				<div className="shrink-0 border-t px-2 py-3">
					<SairBotao onSolicitar={pedirParaSair} />
				</div>
			</SheetContent>
		</Sheet>
		<ConfirmarSairDialog open={confirmandoSair} onOpenChange={setConfirmandoSair} />
		</>
	);
}
