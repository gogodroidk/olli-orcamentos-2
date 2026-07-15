import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { SignInReq } from "@/api/services/userService";
import { Icon } from "@/components/icon";
import { GLOBAL_CONFIG } from "@/global-config";
import { supabase } from "@/lib/supabase";
import { useSignIn, useUserToken } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";

type OAuthProvider = "google" | "apple";
const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"form">) {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
	const navigatge = useNavigate();

	const { loginState, setLoginState } = useLoginStateContext();
	const signIn = useSignIn();

	// Depois do login com Google/Apple, o Supabase volta pra ESTA tela com a sessão
	// já criada. Sem isto, ela ficava mostrando o formulário e o usuário tinha que
	// clicar "Entrar" de novo. Assim que a sessão aparece (via useAuthSync), entra
	// direto no sistema.
	const { accessToken } = useUserToken();
	useEffect(() => {
		if (accessToken) navigatge(GLOBAL_CONFIG.defaultRoute, { replace: true });
	}, [accessToken, navigatge]);

	// Prefill de conveniência SÓ em DEV, e SÓ a partir de variáveis de ambiente
	// locais (.env, fora do git). A credencial NUNCA fica no código: este é um
	// repositório PÚBLICO — hardcodar senha aqui vaza a conta pra qualquer um.
	const form = useForm<SignInReq>({
		defaultValues:
			import.meta.env.DEV && import.meta.env.VITE_DEMO_EMAIL
				? {
						username: import.meta.env.VITE_DEMO_EMAIL,
						password: import.meta.env.VITE_DEMO_PASSWORD ?? "",
					}
				: { username: "", password: "" },
	});

	// Antes o retorno { error } era descartado: se o provider falhasse (ou não
	// estivesse configurado no Supabase), a tela simplesmente não fazia nada —
	// parecia travada. Agora espera a resposta, mostra loading no botão certo
	// e avisa em pt-BR quando dá errado.
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
			// Sucesso navega o navegador inteiro pro provider — não há mais nada a fazer aqui.
		} catch {
			toast.error(`Não foi possível entrar com ${OAUTH_PROVIDER_LABEL[provider]}. Tente de novo.`, {
				position: "top-center",
			});
		} finally {
			setOauthLoading(null);
		}
	};

	if (loginState !== LoginStateEnum.LOGIN) return null;

	const handleFinish = async (values: SignInReq) => {
		if (loading) return; // trava clique duplo: um segundo submit no meio do primeiro logaria duas vezes
		setLoading(true);
		try {
			await signIn(values);
			navigatge(GLOBAL_CONFIG.defaultRoute, { replace: true });
			toast.success(t("sys.login.loginSuccessTitle"), {
				closeButton: true,
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className={cn("flex flex-col gap-6", className)}>
			<Form {...form} {...props}>
				<form onSubmit={form.handleSubmit(handleFinish)} className="space-y-4">
					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-bold">{t("sys.login.signInFormTitle")}</h1>
						<p className="text-balance text-sm text-muted-foreground">{t("sys.login.signInFormDescription")}</p>
					</div>

					<FormField
						control={form.control}
						name="username"
						rules={{ required: t("sys.login.accountPlaceholder") }}
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("sys.login.userName")}</FormLabel>
								<FormControl>
									<Input type="email" autoComplete="email" placeholder="voce@empresa.com.br" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="password"
						rules={{ required: t("sys.login.passwordPlaceholder") }}
						render={({ field }) => (
							<FormItem>
								<FormLabel>{t("sys.login.password")}</FormLabel>
								<FormControl>
									<Input
										type="password"
										autoComplete="current-password"
										placeholder="••••••••"
										{...field}
										suppressHydrationWarning
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					{/* Esqueceu a senha */}
					<div className="flex flex-row justify-end">
						<Button type="button" variant="link" onClick={() => setLoginState(LoginStateEnum.RESET_PASSWORD)} size="sm">
							{t("sys.login.forgetPassword")}
						</Button>
					</div>

					{/* 登录按钮 */}
					<Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
						{loading && <Loader2 className="animate-spin mr-2" />}
						{t("sys.login.loginButton")}
					</Button>

					{/* Login por celular/QR do template ficam escondidos até terem backend real. */}

					{/* 其他登录方式 */}
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

					{/* 注册 */}
					<div className="text-center text-sm">
						{t("sys.login.noAccount")}
						<Button
							type="button"
							variant="link"
							className="px-1"
							onClick={() => setLoginState(LoginStateEnum.REGISTER)}
						>
							{t("sys.login.signUpFormTitle")}
						</Button>
					</div>
				</form>
			</Form>
		</div>
	);
}

export default LoginForm;
