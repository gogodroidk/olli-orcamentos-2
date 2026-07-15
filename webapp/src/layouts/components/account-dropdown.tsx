import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { resetBrandColor } from "@/olli/branding";
import { useLoginStateContext } from "@/pages/sys/login/providers/login-provider";
import { useRouter } from "@/routes/hooks";
import { useSignOut, useUserInfo } from "@/store/userStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/avatar";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";

/**
 * Account Dropdown
 */
export default function AccountDropdown() {
	const { replace } = useRouter();
	const { username, email, avatar } = useUserInfo();
	const signOut = useSignOut();
	const queryClient = useQueryClient();
	const { backToLogin } = useLoginStateContext();
	const { t } = useTranslation();
	const initial = (email || username || "?").trim().charAt(0).toUpperCase();

	const logout = async () => {
		try {
			await signOut(); // encerra a sessão no Supabase + limpa o store
			backToLogin();
		} catch (error) {
			console.error(error);
		} finally {
			// Sempre limpar, mesmo se o signOut falhar: nunca deixar cache/marca
			// do tenant anterior vazando para a próxima sessão nesta aba.
			queryClient.clear(); // não vaza dados cacheados de um tenant p/ outro
			resetBrandColor(); // volta a cor da marca pro padrão OLLI
			replace("/auth/login");
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full" aria-label="Minha conta">
					<Avatar className="h-6 w-6">
						<AvatarImage src={avatar} alt="" />
						<AvatarFallback className="text-xs">{initial}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56">
				<div className="flex items-center gap-2 p-2">
					<Avatar className="h-10 w-10">
						<AvatarImage src={avatar} alt="" />
						<AvatarFallback>{initial}</AvatarFallback>
					</Avatar>
					<div className="flex flex-col items-start">
						<div className="text-text-primary text-sm font-medium">{username}</div>
						<div className="text-text-secondary text-xs">{email}</div>
					</div>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<NavLink to="/meu-negocio">Meu negócio</NavLink>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<NavLink to="/planos">Planos</NavLink>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="font-bold text-warning-darker dark:text-warning" onClick={logout}>
					{t("sys.login.logout")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
