import { CAMINHO_NOVA_SENHA, TAMANHO_CODIGO, TEXTO_RECUPERACAO_ENVIADA, urlRecuperacaoSenha } from "@acesso-codigo";
import { useNavigate } from "react-router";
import { Icon } from "@/components/icon";
import { supabase } from "@/lib/supabase";
import { ReturnButton } from "./components/ReturnButton";
import { TrilhoCodigo } from "./components/TrilhoCodigo";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";
import { useAcessoCodigo } from "./use-acesso-codigo";

/**
 * "Esqueci a senha" do painel. O e-mail traz DOIS caminhos para a mesma coisa:
 *  - o link `/auth/confirm?token_hash=…&type=recovery` (confirmar.tsx), que funciona
 *    em QUALQUER aparelho — não depende do code_verifier do PKCE deste navegador,
 *    que era o motivo de o link antigo falhar quando aberto no celular;
 *  - o código de 6 dígitos, digitado aqui mesmo.
 * Os dois terminam em /auth/nova-senha com uma sessão de recuperação.
 *
 * O Supabase responde sucesso para e-mail sem conta; a tela diz sempre "se houver
 * uma conta" (anti-enumeração) e o reenvio espera o tempo do servidor.
 */
function ResetForm() {
	const navigate = useNavigate();
	const { loginState, backToLogin } = useLoginStateContext();

	const trilho = useAcessoCodigo({
		textoEnviado: TEXTO_RECUPERACAO_ENVIADA,
		pedir: async (email) => {
			const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlRecuperacaoSenha() });
			return { error };
		},
		conferir: async (email, codigo) => {
			const { data, error } = await supabase.auth.verifyOtp({ email, token: codigo, type: "recovery" });
			if (!error && !data?.session) return { ok: false, error: new Error("sem_sessao") };
			return { ok: !error, error };
		},
		aoConfirmar: () => navigate(CAMINHO_NOVA_SENHA, { replace: true }),
	});

	if (loginState !== LoginStateEnum.RESET_PASSWORD) return null;

	return (
		<>
			<div className="mb-8 text-center">
				<Icon icon="local:ic-reset-password" size="100" className="text-primary!" />
			</div>
			<div className="flex flex-col gap-4">
				<TrilhoCodigo
					trilho={trilho}
					titulo="Esqueceu a senha?"
					descricao={`Enviamos um link e um código de ${TAMANHO_CODIGO} dígitos. Use o que for mais fácil, em qualquer aparelho.`}
					rotuloEnviar="Enviar link e código"
					textoSucesso="Código confirmado. Agora crie a senha nova…"
					rodape={
						<p className="text-center text-xs text-muted-foreground">
							Entrou com o Google ou a Apple? Você não precisa de senha: volte e toque no botão do Google ou da
							Apple. Se quiser, crie uma senha por aqui também.
						</p>
					}
				/>
				<ReturnButton onClick={backToLogin} />
			</div>
		</>
	);
}

export default ResetForm;
