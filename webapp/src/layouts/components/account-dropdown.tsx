import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { useUserInfo } from "@/store/userStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { ConfirmarSairDialog } from "./sair";

/**
 * Account Dropdown
 *
 * "Está faltando SAIR": o Sair sempre existiu aqui dentro — o que faltava era
 * ENXERGAR a porta. No escuro o gatilho é um avatar sem foto, e o fallback (a
 * inicial) não tinha cor de texto: herdava o preto padrão do navegador sobre o
 * `bg-muted` #16304D = 1,56:1. O botão parecia vazio, então o menu (e o Sair)
 * não existiam para quem olhava. Agora a inicial usa `text-text-primary`
 * (13,43:1 no escuro, 14,32:1 no claro) e o avatar ganhou um anel de borda para
 * ler como botão mesmo sem foto.
 */
export default function AccountDropdown() {
	const { username, email, avatar } = useUserInfo();
	const { t } = useTranslation();
	const [confirmandoSair, setConfirmandoSair] = useState(false);
	const initial = (email || username || "?").trim().charAt(0).toUpperCase();

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="rounded-full min-h-[44px] min-w-[44px] text-text-primary"
						aria-label="Minha conta e sair"
					>
						<Avatar className="h-8 w-8 ring-1 ring-border">
							<AvatarImage src={avatar} alt="" />
							<AvatarFallback className="text-xs font-semibold text-text-primary">{initial}</AvatarFallback>
						</Avatar>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-56">
					<div className="flex items-center gap-2 p-2">
						<Avatar className="h-10 w-10 ring-1 ring-border">
							<AvatarImage src={avatar} alt="" />
							<AvatarFallback className="font-semibold text-text-primary">{initial}</AvatarFallback>
						</Avatar>
						<div className="flex flex-col items-start">
							<div className="text-text-primary text-sm font-medium">{username}</div>
							<div className="text-text-secondary text-xs">{email}</div>
						</div>
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild className="min-h-[44px]">
						<NavLink to="/meu-negocio">Meu negócio</NavLink>
					</DropdownMenuItem>
					<DropdownMenuItem asChild className="min-h-[44px]">
						<NavLink to="/planos">Planos</NavLink>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{/* onSelect (não onClick) para o Radix fechar o menu antes; o diálogo
					    vive FORA do DropdownMenu, senão ele desmontaria junto com o menu. */}
					<DropdownMenuItem
						className="min-h-[44px] font-bold text-warning-darker dark:text-warning"
						onSelect={() => setConfirmandoSair(true)}
					>
						{t("sys.login.logout")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ConfirmarSairDialog open={confirmandoSair} onOpenChange={setConfirmandoSair} />
		</>
	);
}
