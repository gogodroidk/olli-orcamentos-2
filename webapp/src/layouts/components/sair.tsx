import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { resetBrandColor } from "@/olli/branding";
import { useLoginStateContext } from "@/pages/sys/login/providers/login-provider";
import { useRouter } from "@/routes/hooks";
import { useSignOut } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/dialog";

/**
 * SAIR — um só caminho de código para encerrar a sessão.
 *
 * Antes isto morava solto dentro do account-dropdown. Agora o menu da conta (PC)
 * e o rodapé do menu lateral (celular) chamam exatamente a MESMA função, para não
 * existir um "sair que limpa tudo" e um "sair pela metade".
 *
 * A limpeza é intencionalmente no `finally`: mesmo que o `signOut` falhe (offline,
 * token já expirado), o cache e a marca do tenant anterior TÊM que sumir desta aba,
 * senão o próximo usuário a entrar neste navegador vê dado de quem saiu.
 */
export function useSair() {
	const { replace } = useRouter();
	const signOut = useSignOut();
	const queryClient = useQueryClient();
	const { backToLogin } = useLoginStateContext();
	const [saindo, setSaindo] = useState(false);

	const sair = useCallback(async () => {
		setSaindo(true);
		try {
			await signOut(); // encerra a sessão no Supabase + limpa o userStore (localStorage)
			backToLogin();
		} catch (error) {
			console.error(error);
		} finally {
			queryClient.clear(); // não vaza dados cacheados de um tenant p/ outro
			resetBrandColor(); // volta a cor da marca pro padrão OLLI
			replace("/auth/login");
		}
	}, [signOut, backToLogin, queryClient, replace]);

	return { sair, saindo };
}

type ConfirmarSairDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

/**
 * Confirmação antes de sair. Sair é um toque só e derruba a sessão inteira —
 * sem esta pergunta, um toque acidental no cabeçalho tira o usuário do trabalho
 * que ele estava fazendo.
 */
export function ConfirmarSairDialog({ open, onOpenChange }: ConfirmarSairDialogProps) {
	const { t } = useTranslation();
	const { sair, saindo } = useSair();
	const rotulo = t("sys.login.logout");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{rotulo} da conta?</DialogTitle>
					{/* Descrição derivada do que o código REALMENTE faz em useSair():
					    signOut no Supabase + queryClient.clear() + reset da marca + volta
					    para /auth/login. Nada de promessa que o código não cumpre. */}
					<DialogDescription>
						Você volta para a tela de entrar e os dados desta conta saem deste navegador.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						className="min-h-[44px] text-text-primary"
						onClick={() => onOpenChange(false)}
						disabled={saindo}
					>
						Cancelar
					</Button>
					{/* variant="default" (e não "destructive"): o botão destructive do
					    projeto é branco sobre #E5484D = 3,92:1, abaixo de 4,5:1. O primary
					    dá 5,02:1 e, no white-label, o branding calcula um
					    `--primary-foreground` legível para a cor de cada empresa. */}
					<Button className="min-h-[44px]" onClick={sair} disabled={saindo}>
						{saindo ? "Saindo…" : rotulo}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Botão "Sair" de largura total — para o rodapé do menu lateral no celular, que é
 * onde a pessoa procura sair quando o cabeçalho é só ícone.
 *
 * Ele NÃO carrega o diálogo junto de propósito: o drawer do celular é um Sheet
 * `modal={false}`, e um diálogo aberto de dentro dele viveria numa camada acima —
 * o primeiro toque no diálogo contaria como "clique fora" do Sheet, o Sheet
 * fecharia, este botão desmontaria e levaria o diálogo embora antes do clique
 * virar ação. Por isso quem chama fecha o drawer e mantém o diálogo como IRMÃO
 * do Sheet (ver nav-mobile-layout.tsx).
 */
export function SairBotao({ onSolicitar }: { onSolicitar: () => void }) {
	const { t } = useTranslation();

	return (
		<Button
			variant="ghost"
			onClick={onSolicitar}
			className="w-full min-h-[44px] justify-start font-bold text-warning-darker dark:text-warning"
		>
			{t("sys.login.logout")}
		</Button>
	);
}
