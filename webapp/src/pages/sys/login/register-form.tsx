import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorMessage } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { EmailAutocompleteInput } from "./components/EmailAutocompleteInput";
import { OAuthButtons } from "./components/OAuthButtons";
import { ReturnButton } from "./components/ReturnButton";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";

interface RegisterFormValues {
	email: string;
	password: string;
	confirmPassword: string;
}

// Landing (Astro) publica os termos e a política — fica fora do domínio do
// painel, então o link é absoluto (não depende de o painel estar no mesmo
// domínio) e abre em nova aba para não perder o cadastro em andamento.
const LANDING_ORIGIN = "https://olliorcamentos.online";

function RegisterForm() {
	const { t } = useTranslation();
	const { loginState, backToLogin } = useLoginStateContext();
	const [loading, setLoading] = useState(false);

	const form = useForm<RegisterFormValues>({
		defaultValues: {
			email: "",
			password: "",
			confirmPassword: "",
		},
	});

	const onFinish = async (values: RegisterFormValues) => {
		if (loading) return;
		setLoading(true);
		try {
			const { error } = await supabase.auth.signUp({
				email: values.email.trim(),
				password: values.password,
				options: { emailRedirectTo: `${window.location.origin}/auth/login` },
			});
			if (error) throw error;
			toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro.", {
				position: "top-center",
			});
			backToLogin();
		} catch (err) {
			toast.error(mapAuthErrorMessage(err), { position: "top-center" });
		} finally {
			setLoading(false);
		}
	};

	if (loginState !== LoginStateEnum.REGISTER) return null;

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onFinish)} className="space-y-4">
				<div className="flex flex-col items-center gap-2 text-center">
					<h1 className="text-2xl font-bold">{t("sys.login.signUpFormTitle")}</h1>
				</div>

				{/*
					OAuth ANTES do e-mail: signInWithOAuth cria a conta no 1º acesso, sem
					confirmação de e-mail nem senha — é 1 clique contra os 7+ passos do
					cadastro por e-mail. Quem chega da landing pra experimentar não quer
					preencher formulário; quer estar dentro. O formulário de e-mail
					continua abaixo pra quem preferir. (CC-01)
				*/}
				<OAuthButtons />

				<div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
					<span className="relative z-10 bg-background px-2 text-muted-foreground">
						{t("sys.login.registerButton")}
					</span>
				</div>

				<FormField
					control={form.control}
					name="email"
					rules={{
						required: t("sys.login.emaildPlaceholder"),
						pattern: { value: /^\S+@\S+\.\S+$/, message: t("sys.login.emaildPlaceholder") },
					}}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<EmailAutocompleteInput placeholder={t("sys.login.email")} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="password"
					rules={{
						required: t("sys.login.passwordPlaceholder"),
						minLength: { value: 6, message: "A senha precisa ter pelo menos 6 caracteres." },
					}}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input type="password" autoComplete="new-password" placeholder={t("sys.login.password")} {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="confirmPassword"
					rules={{
						required: t("sys.login.confirmPasswordPlaceholder"),
						validate: (value) => value === form.getValues("password") || t("sys.login.diffPwd"),
					}}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input
									type="password"
									autoComplete="new-password"
									placeholder={t("sys.login.confirmPassword")}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
					{loading && <Loader2 className="animate-spin mr-2" />}
					{t("sys.login.registerButton")}
				</Button>

				<div className="mb-2 text-xs text-gray">
					<span>{t("sys.login.registerAndAgree")}</span>
					<a
						href={`${LANDING_ORIGIN}/legal/termos`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm underline! text-primary!"
					>
						{t("sys.login.termsOfService")}
					</a>
					{" & "}
					<a
						href={`${LANDING_ORIGIN}/legal/privacidade`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-sm underline! text-primary!"
					>
						{t("sys.login.privacyPolicy")}
					</a>
				</div>

				<ReturnButton onClick={backToLogin} />
			</form>
		</Form>
	);
}

export default RegisterForm;
