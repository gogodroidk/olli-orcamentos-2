import { novaTentativaOAuth } from "@oauth-retorno";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { linkAbrirNoNavegador, type NavegadorInApp, navegadorInAppAtual } from "@/lib/navegadorInApp";
import { registrarFunilAuth, supabase } from "@/lib/supabase";
import { guardarIntencaoOAuth } from "@/olli/plano-intent";
import { Button } from "@/ui/button";
import { useLoginStateContext } from "../providers/login-provider";
import { CHAVE_TENTATIVA_OAUTH } from "../use-retorno-oauth";

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

const NOME_APP: Record<NavegadorInApp, string> = { instagram: "Instagram", facebook: "Facebook" };

/**
 * No navegador embutido do Instagram/Facebook o Google recusa o login
 * (`disallowed_useragent`): no lugar dos botões, o caminho para o navegador do
 * aparelho. O cadastro por e-mail funciona aqui mesmo.
 */
function AvisoNavegadorInApp({ app }: { app: NavegadorInApp }) {
	const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
	const link = typeof window === "undefined" ? null : linkAbrirNoNavegador(window.location.href, ua);
	return (
		<div className="space-y-2 rounded-md border border-border p-3 text-sm" role="note">
			<p className="text-muted-foreground">
				Quer entrar com Google ou Apple? Dentro do app do {NOME_APP[app]} o Google não permite. Abra esta página no
				navegador do celular.
			</p>
			{link ? (
				<Button asChild type="button" variant="outline" className="w-full">
					<a href={link}>Abrir no navegador</a>
				</Button>
			) : (
				<p className="text-muted-foreground">
					Toque em <span aria-hidden="true">⋯</span>
					<span className="sr-only">no menu de três pontos</span> no canto da tela e escolha “Abrir no navegador”.
				</p>
			)}
		</div>
	);
}

export function OAuthButtons() {
	const { t } = useTranslation();
	const { callbackAuthPath, intencaoPlano } = useLoginStateContext();
	const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
	const [inApp] = useState(navegadorInAppAtual);

	// Espera a resposta e avisa em pt-BR se o provider falhar (ou não estiver
	// configurado no Supabase) — sem isto a tela parecia travada. Em sucesso, o
	// Supabase navega o navegador inteiro pro provider; a volta é tratada em
	// `useRetornoOAuth` (tela de login), que também avisa se o login não fechar.
	//
	// O redirect é SEMPRE `/auth/login` sem query (ver caminhoCallbackAuth): a
	// intenção de plano vai no sessionStorage e a tentativa ganha um id aleatório
	// só pra ligar "iniciado" ao resultado no funil — nada que identifique a pessoa.
	const signInWithProvider = async (provider: OAuthProvider) => {
		setOauthLoading(provider);
		const tentativa = novaTentativaOAuth();
		try {
			guardarIntencaoOAuth(window.sessionStorage, intencaoPlano);
			window.sessionStorage.setItem(CHAVE_TENTATIVA_OAUTH, JSON.stringify({ tentativa, provedor: provider }));
		} catch {
			// storage bloqueado: o login segue, só perde intenção/correlação do funil
		}
		void registrarFunilAuth("oauth_iniciado", { plataforma: "web", provedor: provider, tentativa });
		try {
			const { error } = await supabase.auth.signInWithOAuth({
				provider,
				options: { redirectTo: `${window.location.origin}${callbackAuthPath}` },
			});
			if (error) {
				void registrarFunilAuth("oauth_erro", { plataforma: "web", provedor: provider, tentativa, motivo: "provedor" });
				toast.error(`Não foi possível entrar com ${OAUTH_PROVIDER_LABEL[provider]}. Tente de novo.`, {
					position: "top-center",
				});
			}
		} catch {
			void registrarFunilAuth("oauth_erro", { plataforma: "web", provedor: provider, tentativa, motivo: "rede" });
			toast.error(`Não foi possível entrar com ${OAUTH_PROVIDER_LABEL[provider]}. Tente de novo.`, {
				position: "top-center",
			});
		} finally {
			setOauthLoading(null);
		}
	};

	if (inApp) return <AvisoNavegadorInApp app={inApp} />;

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
