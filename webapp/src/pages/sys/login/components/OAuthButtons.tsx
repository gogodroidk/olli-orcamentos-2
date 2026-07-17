import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui/button";

/**
 * Botões Google/Apple — o caminho de MENOR fricção pra entrar.
 *
 * Por que virou componente: o CC-01 (auditoria) apontou que estes botões só
 * existiam na tela de LOGIN. Quem chegava da landing pra CADASTRAR caía num
 * formulário de e-mail + senha + confirmação de e-mail + re-login (7+ passos, no
 * celular, no sol). `signInWithOAuth` CRIA a conta no primeiro acesso, sem
 * confirmação de e-mail — é o cadastro mais curto que existe. Então o mesmo bloco
 * tem de estar nas DUAS telas, e duplicar código de auth é como um bug entra numa
 * cópia e não na outra. Uma fonte só.
 */
type OAuthProvider = "google" | "apple";
const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

export function OAuthButtons() {
	const { t } = useTranslation();
	const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);

	// Espera a resposta e avisa em pt-BR se o provider falhar (ou não estiver
	// configurado no Supabase) — sem isso a tela parecia travada. Em sucesso, o
	// Supabase navega o navegador inteiro pro provider; não há mais o que fazer aqui.
	const signInWithProvider = async (provider: OAuthProvider) => {
		setOauthLoading(provider);
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: { redirectTo: window.location.origin },
			});
			if (error) {
				toast.error(`Não foi possível entrar com ${OAUTH_PROVIDER_LABEL[provider]}. Tente de novo.`, {
					position: "top-center",
				});
			}
		} catch {
			toast.error(`Não foi possível entrar com ${OAUTH_PROVIDER_LABEL[provider]}. Tente de novo.`, {
				position: "top-center",
			});
		} finally {
			setOauthLoading(null);
		}
	};

	return (
		<>
			<div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
				<span className="relative z-10 bg-background px-2 text-muted-foreground">{t("sys.login.otherSignIn")}</span>
			</div>
			<div className="flex justify-center gap-3">
				<Button
					type="button"
					variant="outline"
					className="flex-1"
					onClick={() => signInWithProvider("google")}
					disabled={oauthLoading !== null}
					aria-busy={oauthLoading === "google"}
				>
					{oauthLoading === "google" ? (
						<Loader2 className="animate-spin" size={18} />
					) : (
						<Icon icon="logos:google-icon" size={18} />
					)}
					<span className="ml-2">Google</span>
				</Button>
				<Button
					type="button"
					variant="outline"
					className="flex-1"
					onClick={() => signInWithProvider("apple")}
					disabled={oauthLoading !== null}
					aria-busy={oauthLoading === "apple"}
				>
					{oauthLoading === "apple" ? (
						<Loader2 className="animate-spin" size={20} />
					) : (
						<Icon icon="mdi:apple" size={20} />
					)}
					<span className="ml-2">Apple</span>
				</Button>
			</div>
		</>
	);
}

export default OAuthButtons;
