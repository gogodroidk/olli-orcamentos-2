import { TAMANHO_CODIGO, TEXTO_CODIGO_ENVIADO, TEXTO_CONTA_GOOGLE } from "@acesso-codigo";
import { useNavigate } from "react-router";
import { GLOBAL_CONFIG } from "@/global-config";
import { supabase } from "@/lib/supabase";
import { obterTokenCaptcha, opcoesCaptcha } from "@/lib/captcha";
import { Button } from "@/ui/button";
import { ReturnButton } from "./components/ReturnButton";
import { TrilhoCodigo } from "./components/TrilhoCodigo";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";
import { useAcessoCodigo } from "./use-acesso-codigo";

/**
 * "Entrar com código por e-mail" — login sem senha no painel.
 *
 * `shouldCreateUser: false` de propósito: o cadastro pede nome e aceite (e é por
 * ele que o funil mede o signup); um código pedido com o e-mail digitado errado
 * criaria uma conta fantasma. Para quem não tem conta, o Supabase responde
 * "Signups not allowed for otp" — e a tela responde IGUAL a um envio que deu certo
 * (`resultadoDoEnvio`), para não virar um verificador de e-mails cadastrados.
 * O rodapé convida a criar conta caso o código não chegue.
 */
function CodigoForm() {
	const navigate = useNavigate();
	const { loginState, setLoginState, backToLogin, destinoPosLogin } = useLoginStateContext();
	const destino = destinoPosLogin ?? GLOBAL_CONFIG.defaultRoute;

	const trilho = useAcessoCodigo({
		textoEnviado: TEXTO_CODIGO_ENVIADO,
		pedir: async (email) => {
			try {
				const captchaToken = await obterTokenCaptcha();
				const { error } = await supabase.auth.signInWithOtp({
					email,
					options: { shouldCreateUser: false, ...opcoesCaptcha(captchaToken) },
				});
				return { error };
			} catch (error) {
				return { error };
			}
		},
		conferir: async (email, codigo) => {
			const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "email" });
			// Sem erro e sem sessão = "não sei": nunca conta como entrou.
			if (!error && !data?.session) return { ok: false, error: new Error("sem_sessao") };
			return { ok: !error, error };
		},
		// A sessão chega ao userStore pelo onAuthStateChange (useAuthSync); a tela de
		// login também redireciona sozinha quando o token aparece.
		aoConfirmar: () => navigate(destino, { replace: true }),
	});

	if (loginState !== LoginStateEnum.CODIGO) return null;

	return (
		<div className="flex flex-col gap-4">
			<TrilhoCodigo
				trilho={trilho}
				titulo="Entrar com código"
				descricao={`Sem senha: enviamos um código de ${TAMANHO_CODIGO} dígitos para o seu e-mail. ${TEXTO_CONTA_GOOGLE}`}
				rotuloEnviar="Enviar código"
				rodape={
					<div className="text-center text-sm text-muted-foreground">
						Ainda não tem conta?
						<Button type="button" variant="link" className="px-1" onClick={() => setLoginState(LoginStateEnum.REGISTER)}>
							Criar conta
						</Button>
					</div>
				}
			/>
			<ReturnButton onClick={backToLogin} />
		</div>
	);
}

export default CodigoForm;
