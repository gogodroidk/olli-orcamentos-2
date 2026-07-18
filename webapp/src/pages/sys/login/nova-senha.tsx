import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import LocalePicker from "@/components/locale-picker";
import Logo from "@/components/logo";
import { GLOBAL_CONFIG } from "@/global-config";
import SettingButton from "@/layouts/components/setting-button";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorMessage } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import BrandHero from "./components/BrandHero";

type EstadoSessao = "verificando" | "pronta" | "invalida";

interface NovaSenhaValues {
	password: string;
	confirmPassword: string;
}

/**
 * Rota /nova-senha — completa o fluxo de "esqueci minha senha".
 *
 * `reset-form.tsx` envia o e-mail de recuperação com `redirectTo` apontando
 * pra cá. O cliente Supabase (detectSessionInUrl + PKCE, ver lib/supabase.ts)
 * troca o `?code=` da URL por uma sessão de recuperação automaticamente
 * durante a inicialização — por isso não lemos token nenhum aqui: só
 * esperamos a sessão aparecer (getSession ou o evento PASSWORD_RECOVERY) e
 * então chamamos `supabase.auth.updateUser({ password })`.
 *
 * Antes desta rota existir, o link do e-mail caía direto no /auth/login sem
 * nenhuma forma de trocar a senha — o fluxo de "esqueci minha senha" nunca
 * se completava.
 */
function NovaSenhaPage() {
	const navigate = useNavigate();
	const [sessao, setSessao] = useState<EstadoSessao>("verificando");
	const [loading, setLoading] = useState(false);
	const [concluido, setConcluido] = useState(false);

	const form = useForm<NovaSenhaValues>({ defaultValues: { password: "", confirmPassword: "" } });

	useEffect(() => {
		let ativo = true;
		const marcarPronta = () => {
			if (ativo) setSessao((atual) => (atual === "verificando" ? "pronta" : atual));
		};

		supabase.auth.getSession().then(({ data }) => {
			if (ativo && data.session) marcarPronta();
		});

		const { data: sub } = supabase.auth.onAuthStateChange((event) => {
			if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") marcarPronta();
		});

		// Link inválido/expirado/já usado: nem sessão nem evento aparecem.
		// Depois de um tempo razoável, desiste de esperar e mostra o erro em
		// vez de deixar a pessoa presa num spinner pra sempre.
		const timeout = window.setTimeout(() => {
			if (ativo) setSessao((atual) => (atual === "verificando" ? "invalida" : atual));
		}, 6000);

		return () => {
			ativo = false;
			sub.subscription.unsubscribe();
			window.clearTimeout(timeout);
		};
	}, []);

	const onFinish = async (values: NovaSenhaValues) => {
		if (loading) return;
		setLoading(true);
		try {
			const { error } = await supabase.auth.updateUser({ password: values.password });
			if (error) throw error;
			setConcluido(true);
			toast.success("Senha redefinida com sucesso.", { position: "top-center" });
			setTimeout(() => navigate(GLOBAL_CONFIG.defaultRoute, { replace: true }), 1200);
		} catch (err) {
			toast.error(mapAuthErrorMessage(err), { position: "top-center" });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="relative grid min-h-svh lg:grid-cols-2 bg-background">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<div className="flex justify-center gap-2 md:justify-start">
					<div className="flex items-center gap-2 font-medium">
						<Logo size={28} />
						<span>{GLOBAL_CONFIG.appName}</span>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<div className="mb-8 text-center">
							<Icon icon="local:ic-reset-password" size="100" className="text-primary!" />
						</div>

						{sessao === "verificando" && (
							<div className="flex flex-col items-center gap-3 text-center">
								<Loader2 className="animate-spin text-muted-foreground" size={24} />
								<p className="text-sm text-muted-foreground">Confirmando o link de redefinição...</p>
							</div>
						)}

						{sessao === "invalida" && (
							<div className="flex flex-col items-center gap-4 text-center">
								<h1 className="text-2xl font-bold">Link inválido ou expirado</h1>
								<p className="text-balance text-sm text-muted-foreground">
									Este link de redefinição de senha não é mais válido. Volte para o login e peça um novo e-mail.
								</p>
								<Button type="button" className="w-full" onClick={() => navigate("/auth/login")}>
									Voltar para o login
								</Button>
							</div>
						)}

						{sessao === "pronta" && !concluido && (
							<Form {...form}>
								<form onSubmit={form.handleSubmit(onFinish)} className="space-y-4">
									<div className="flex flex-col items-center gap-2 text-center">
										<h1 className="text-2xl font-bold">Defina sua nova senha</h1>
										<p className="text-balance text-sm text-muted-foreground">
											Escolha uma nova senha para acessar sua conta.
										</p>
									</div>

									<FormField
										control={form.control}
										name="password"
										rules={{
											required: "Informe a nova senha",
											minLength: { value: 6, message: "A senha precisa ter pelo menos 6 caracteres." },
										}}
										render={({ field }) => (
											<FormItem>
												<FormControl>
													<Input type="password" autoComplete="new-password" placeholder="Nova senha" {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="confirmPassword"
										rules={{
											required: "Confirme a nova senha",
											validate: (value) => value === form.getValues("password") || "As senhas não coincidem",
										}}
										render={({ field }) => (
											<FormItem>
												<FormControl>
													<Input
														type="password"
														autoComplete="new-password"
														placeholder="Confirmar nova senha"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
										{loading && <Loader2 className="animate-spin mr-2" size={16} />}
										Salvar nova senha
									</Button>
								</form>
							</Form>
						)}

						{concluido && (
							<output className="block text-center text-sm text-success-dark dark:text-success">
								Senha redefinida. Entrando no painel...
							</output>
						)}
					</div>
				</div>
			</div>

			<BrandHero />

			<div className="absolute right-2 top-0 flex flex-row">
				<LocalePicker />
				<SettingButton />
			</div>
		</div>
	);
}

export default NovaSenhaPage;
