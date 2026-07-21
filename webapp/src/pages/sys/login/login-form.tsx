import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { SignInReq } from "@/api/services/userService";
import { GLOBAL_CONFIG } from "@/global-config";
import { useSignIn, useUserToken } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import { EmailAutocompleteInput } from "./components/EmailAutocompleteInput";
import { OAuthButtons } from "./components/OAuthButtons";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"form">) {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
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
									<EmailAutocompleteInput placeholder="voce@empresa.com.br" {...field} />
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

					<OAuthButtons />

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
