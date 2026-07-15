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

export function NavMobileLayout({ data }: NavProps) {
	const [open, setOpen] = useState(false);
	const { pathname } = useLocation();

	// Fecha o drawer ao navegar (tocar num item de menu não deixava mais fechado).
	// biome-ignore lint/correctness/useExhaustiveDependencies: intencional — reage à MUDANÇA de pathname, não usa o valor.
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<Sheet modal={false} open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Abrir menu">
					<Icon icon="local:ic-menu" size={24} />
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="[&>button]:hidden px-2 w-[280px]">
				<div className="flex gap-2 px-2 h-[var(--layout-header-height)] items-center">
					<Logo />
					<span className="text-xl font-bold">{GLOBAL_CONFIG.appName}</span>
				</div>
				<ScrollArea className="h-full">
					<NavVertical data={data} />
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
