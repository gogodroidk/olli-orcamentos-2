import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorMessage } from "@/store/userStore";
import { SENHA_MINIMA } from "@auth-policy";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { EmailAutocompleteInput } from "./components/EmailAutocompleteInput";
import { OAuthButtons } from "./components/OAuthButtons";
import { ReturnButton } from "./components/ReturnButton";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";

interface RegisterFormValues {
	name: string;
	phone: string;
	email: string;
	password: string;
	confirmPassword: string;
}

// Landing (Astro) publica os termos e a política — fica fora do domínio do
// painel, então o link é absoluto (não depende de o painel estar no mesmo
// domínio) e abre em nova aba para não perder o cadastro em andamento.
const LANDING_ORIGIN = "https://olliorcamentos.online";

function telefoneE164Brasil(valor: string): string {
	const digitos = valor.replace(/\D/g, "");
	const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
	return `+55${nacional}`;
}

function RegisterForm() {
	const { t } = useTranslation();
	const { loginState, backToLogin } = useLoginStateContext();
	const [loading, setLoading] = useState(false);

	const form = useForm<RegisterFormValues>({
		defaultValues: {
			name: "",
			phone: "",
			email: "",
			password: "",
			confirmPassword: "",
		},
	});

	const onFinish = async (values: RegisterFormValues) => {
		if (loading) return;
		setLoading(true);
		try {
			const phone = telefoneE164Brasil(values.phone);
			const { error } = await supabase.auth.signUp({
				email: values.email.trim(),
				password: values.password,
				options: {
					emailRedirectTo: `${window.location.origin}/auth/login`,
					data: {
						full_name: values.name.trim(),
						name: values.name.trim(),
						phone,
					},
				},
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

				{/* OAuth reduz a entrada a um clique. Nome, telefone e dados do negócio
				    são exigidos pelo onboarding no primeiro acesso social. */}
				<OAuthButtons />

				<div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
					<span className="relative z-10 bg-background px-2 text-muted-foreground">
						ou crie com e-mail
					</span>
				</div>

				<FormField
					control={form.control}
					name="name"
					rules={{
						required: "Informe seu nome.",
						minLength: { value: 2, message: "Use pelo menos 2 caracteres." },
					}}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input autoComplete="name" placeholder="Seu nome" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="phone"
					rules={{
						required: "Informe seu telefone com DDD.",
						validate: (value) => {
							const n = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
							return /^\d{10,11}$/.test(n) || "Use DDD + telefone, com 10 ou 11 dígitos.";
						},
					}}
					render={({ field }) => (
						<FormItem>
							<FormControl>
								<Input
									type="tel"
									inputMode="tel"
									autoComplete="tel-national"
									placeholder="Telefone com DDD"
									{...field}
								/>
							</FormControl>
							<FormMessage />
							<p className="text-xs leading-relaxed text-muted-foreground">
								Usado para sua conta e para preencher seu negócio. Mensagens de marketing exigem uma escolha separada.
							</p>
						</FormItem>
					)}
				/>

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
						minLength: { value: SENHA_MINIMA, message: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` },
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
