import { avaliarSenha, ROTULO_NIVEL_SENHA } from "@acesso-codigo";
import { SENHA_MINIMA } from "@auth-policy";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { GLOBAL_CONFIG } from "@/global-config";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorMessage } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { cn } from "@/utils";
import { AuthShell } from "./components/AuthShell";

type EstadoSessao = "verificando" | "pronta" | "invalida";

interface NovaSenhaValues {
	password: string;
	confirmPassword: string;
}

const COR_NIVEL = {
	vazia: "bg-muted",
	fraca: "bg-destructive",
	media: "bg-warning",
	forte: "bg-success",
} as const;
const PARTES_NIVEL = { vazia: 0, fraca: 1, media: 2, forte: 3 } as const;

/** Erros de troca de senha que o mapa geral não cobre. */
function mensagemErroSenha(err: unknown): string {
	const code = (err as { code?: string } | null)?.code;
	if (code === "same_password") return "A nova senha precisa ser diferente da anterior.";
	if (code === "reauthentication_needed") return "Por segurança, peça um novo link ou código em Esqueci a senha.";
	return mapAuthErrorMessage(err);
}

/**
 * Rota /auth/nova-senha (e a antiga /nova-senha) — último passo do "esqueci a senha".
 *
 * Chega-se aqui com uma sessão de recuperação criada por um destes caminhos:
 *  - o link do e-mail, confirmado em /auth/confirm (`verifyOtp` com token_hash);
 *  - o código de 6 dígitos digitado no "Esqueci a senha" (`verifyOtp` recovery);
 *  - um link antigo (`?code=` PKCE), trocado sozinho pelo supabase-js.
 * A tela só espera a sessão aparecer e chama `updateUser({ password })`. Sem
 * sessão depois de alguns segundos = link inválido, com caminho de volta.
 */
function NovaSenhaPage() {
	const navigate = useNavigate();
	const [sessao, setSessao] = useState<EstadoSessao>("verificando");
	const [loading, setLoading] = useState(false);
	const [concluido, setConcluido] = useState(false);
	const [verSenha, setVerSenha] = useState(false);

	const form = useForm<NovaSenhaValues>({ defaultValues: { password: "", confirmPassword: "" }, mode: "onTouched" });
	const senha = form.watch("password");
	const avaliacao = avaliarSenha(senha, SENHA_MINIMA);

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
			navigate(GLOBAL_CONFIG.defaultRoute, { replace: true });
		} catch (err) {
			toast.error(mensagemErroSenha(err), { position: "top-center" });
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthShell>
			<div className="mb-8 text-center">
				<Icon icon="local:ic-reset-password" size="100" className="text-primary!" />
			</div>

			{sessao === "verificando" && (
				<output className="flex flex-col items-center gap-3 text-center" aria-live="polite">
					<Loader2 className="animate-spin text-muted-foreground" size={24} aria-hidden />
					<span className="text-sm text-muted-foreground">Confirmando o acesso...</span>
				</output>
			)}

			{sessao === "invalida" && (
				<div className="flex flex-col items-center gap-4 text-center" role="alert">
					<h1 className="text-2xl font-bold">Link inválido ou expirado</h1>
					<p className="text-balance text-sm text-muted-foreground">
						Este link de redefinição de senha não é mais válido. Peça um novo link ou código em "Esqueci a senha".
					</p>
					<Button type="button" className="w-full" onClick={() => navigate("/auth/login?modo=esqueci")}>
						Pedir um novo link ou código
					</Button>
				</div>
			)}

			{sessao === "pronta" && !concluido && (
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onFinish)} className="space-y-4">
						<div className="flex flex-col items-center gap-2 text-center">
							<h1 className="text-2xl font-bold">Defina sua nova senha</h1>
							<p className="text-balance text-sm text-muted-foreground">
								Pelo menos {SENHA_MINIMA} caracteres, com letra e número.
							</p>
						</div>

						<FormField
							control={form.control}
							name="password"
							rules={{
								required: "Informe a nova senha",
								validate: (value) => avaliarSenha(value, SENHA_MINIMA).faltas[0] ?? true,
							}}
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nova senha</FormLabel>
									<div className="relative">
										<FormControl>
											<Input
												type={verSenha ? "text" : "password"}
												autoComplete="new-password"
												placeholder="Nova senha"
												className="pr-10"
												{...field}
											/>
										</FormControl>
										<button
											type="button"
											className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
											onClick={() => setVerSenha((v) => !v)}
											aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
											aria-pressed={verSenha}
										>
											{verSenha ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
										</button>
									</div>
									{senha && (
										<div aria-live="polite" className="space-y-1">
											<div className="flex gap-1" aria-hidden>
												{[1, 2, 3].map((parte) => (
													<span
														key={parte}
														className={cn(
															"h-1 flex-1 rounded-full",
															PARTES_NIVEL[avaliacao.nivel] >= parte ? COR_NIVEL[avaliacao.nivel] : "bg-muted",
														)}
													/>
												))}
											</div>
											<p className="text-xs font-medium">{ROTULO_NIVEL_SENHA[avaliacao.nivel]}</p>
											{avaliacao.faltas.length > 0 && (
												<ul className="list-inside list-disc text-xs text-muted-foreground">
													{avaliacao.faltas.map((f) => (
														<li key={f}>{f}</li>
													))}
												</ul>
											)}
										</div>
									)}
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
									<FormLabel>Confirme a nova senha</FormLabel>
									<FormControl>
										<Input
											type={verSenha ? "text" : "password"}
											autoComplete="new-password"
											placeholder="Confirmar nova senha"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button type="submit" className="w-full" disabled={loading || !avaliacao.valida} aria-busy={loading}>
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
		</AuthShell>
	);
}

export default NovaSenhaPage;
