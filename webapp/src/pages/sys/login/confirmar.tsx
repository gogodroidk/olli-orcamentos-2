import {
	CAMINHO_NOVA_SENHA,
	classificarFalhaAcesso,
	type LeituraConfirmacao,
	liberaReenvioEm,
	lerConfirmacao,
	type MotivoFalhaAcesso,
	mensagemAguarde,
	mensagemFalhaEnvio,
	mensagemFalhaLink,
	reenvioDoLink,
	resultadoDoEnvio,
	type TipoLinkEmail,
	URL_PAINEL,
	urlRecuperacaoSenha,
} from "@acesso-codigo";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { GLOBAL_CONFIG } from "@/global-config";
import { supabase, urlDeEntrada } from "@/lib/supabase";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { AuthShell } from "./components/AuthShell";
import { useSegundosParaReenviar } from "./components/BotaoReenviar";

type Estado =
	| { tipo: "pronto"; tokenHash: string; tipoLink: TipoLinkEmail; destino: string }
	| { tipo: "confirmando" }
	| { tipo: "aguardando_sessao"; destino: string }
	| { tipo: "ok"; destino: string }
	| { tipo: "erro"; motivo: MotivoFalhaAcesso; tipoLink: TipoLinkEmail | null };

const TITULO_POR_TIPO: Record<TipoLinkEmail, { titulo: string; botao: string }> = {
	recovery: { titulo: "Criar uma nova senha", botao: "Continuar para a nova senha" },
	signup: { titulo: "Confirmar seu cadastro", botao: "Confirmar e entrar" },
	email: { titulo: "Confirmar seu e-mail", botao: "Confirmar e entrar" },
	magiclink: { titulo: "Entrar no OLLI", botao: "Entrar agora" },
	email_change: { titulo: "Confirmar o novo e-mail", botao: "Confirmar novo e-mail" },
	invite: { titulo: "Aceitar o convite", botao: "Aceitar e criar minha senha" },
};

function estadoInicial(leitura: LeituraConfirmacao): Estado {
	if (leitura.tipo === "token")
		return { tipo: "pronto", tokenHash: leitura.tokenHash, tipoLink: leitura.tipoLink, destino: leitura.destino };
	if (leitura.tipo === "codigo_pkce") return { tipo: "aguardando_sessao", destino: leitura.destino };
	return leitura;
}

/**
 * A URL que a tela deve ler. O supabase-js troca o `?code=` (link antigo, PKCE) e o
 * APAGA da barra antes de esta página (lazy) montar, quando a rede dele ganha a
 * corrida. Nesse caso vale a URL de entrada, guardada antes do client existir.
 * Só o `code` é apagado por ele; `token_hash` e `#error` ficam na barra.
 */
function urlDaConfirmacao(): string {
	const atual = window.location.href;
	try {
		const entrada = new URL(urlDeEntrada);
		const agora = new URL(atual);
		if (entrada.pathname === agora.pathname && entrada.searchParams.has("code") && !agora.searchParams.has("code")) {
			return urlDeEntrada;
		}
	} catch {
		// URL de entrada ilegível: fica com a atual.
	}
	return atual;
}

/** Tira o token da barra de endereço (histórico, Referer, print de tela). */
function limparUrl() {
	try {
		window.history.replaceState(window.history.state, "", "/auth/confirm");
	} catch {
		// sem History API: a URL fica, nada quebra
	}
}

/**
 * Rota /auth/confirm — o destino de TODO link de e-mail de acesso (contrato:
 * `?token_hash=…&type=…&next=…`). Confirma com `verifyOtp({ token_hash, type })`,
 * que não depende do navegador onde o pedido começou: o link do "esqueci a senha"
 * aberto no celular funciona mesmo que a pessoa tenha pedido no computador.
 *
 * A confirmação espera UM clique de propósito. Antivírus de e-mail (Outlook Safe
 * Links e parecidos) abrem os links sozinhos para inspecionar; se a página
 * confirmasse ao carregar, o robô gastaria o link e a pessoa veria "já foi usado".
 *
 * Link do template antigo (`?code=`, PKCE) também é aceito: o supabase-js troca o
 * code sozinho e a tela só espera a sessão.
 */
function ConfirmarPage() {
	const navigate = useNavigate();
	const [estado, setEstado] = useState<Estado>(() =>
		estadoInicial(lerConfirmacao(urlDaConfirmacao(), GLOBAL_CONFIG.defaultRoute)),
	);
	const vivo = useRef(true);
	useEffect(
		() => () => {
			vivo.current = false;
		},
		[],
	);

	// Link antigo (PKCE): espera a troca automática do code terminar.
	const aguardando = estado.tipo === "aguardando_sessao" ? estado.destino : null;
	useEffect(() => {
		if (aguardando === null) return;
		let ativo = true;
		// O link antigo não traz `type`; se ia para a nova senha, era recuperação — e o
		// reenvio certo é outro link de senha, não um código de login.
		const tipoLink: TipoLinkEmail | null = aguardando === CAMINHO_NOVA_SENHA ? "recovery" : null;
		supabase.auth
			.initialize()
			.then(async ({ error }) => {
				const { data } = await supabase.auth.getSession();
				if (!ativo) return;
				if (data.session) setEstado({ tipo: "ok", destino: aguardando });
				else setEstado({ tipo: "erro", motivo: error ? classificarFalhaAcesso(error) : "desconhecido", tipoLink });
			})
			.catch((e) => {
				if (ativo) setEstado({ tipo: "erro", motivo: classificarFalhaAcesso(e), tipoLink });
			})
			.finally(limparUrl);
		return () => {
			ativo = false;
		};
	}, [aguardando]);

	// Sucesso: segue para o destino (a sessão já está no userStore via useAuthSync).
	const destinoOk = estado.tipo === "ok" ? estado.destino : null;
	useEffect(() => {
		if (destinoOk) navigate(destinoOk, { replace: true });
	}, [destinoOk, navigate]);

	async function confirmar() {
		if (estado.tipo !== "pronto") return;
		const { tokenHash, tipoLink, destino } = estado;
		setEstado({ tipo: "confirmando" });
		try {
			const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipoLink });
			if (!vivo.current) return;
			if (error || !data?.session) {
				setEstado({ tipo: "erro", motivo: error ? classificarFalhaAcesso(error) : "desconhecido", tipoLink });
			} else {
				setEstado({ tipo: "ok", destino });
			}
		} catch (e) {
			if (vivo.current) setEstado({ tipo: "erro", motivo: classificarFalhaAcesso(e), tipoLink });
		} finally {
			limparUrl();
		}
	}

	return (
		<AuthShell>
			{estado.tipo === "pronto" && (
				<div className="flex flex-col items-center gap-4 text-center">
					<h1 className="text-2xl font-bold">{TITULO_POR_TIPO[estado.tipoLink].titulo}</h1>
					<p className="text-balance text-sm text-muted-foreground">
						Toque no botão para confirmar que é você. O link funciona uma vez.
					</p>
					<Button type="button" className="w-full" autoFocus onClick={() => void confirmar()}>
						{TITULO_POR_TIPO[estado.tipoLink].botao}
					</Button>
				</div>
			)}

			{(estado.tipo === "confirmando" || estado.tipo === "aguardando_sessao") && (
				<output className="flex flex-col items-center gap-3 text-center" aria-live="polite">
					<Loader2 className="animate-spin text-muted-foreground" size={24} aria-hidden />
					<span className="text-sm text-muted-foreground">Confirmando o link…</span>
				</output>
			)}

			{estado.tipo === "ok" && (
				<output className="flex flex-col items-center gap-3 text-center" aria-live="polite">
					<CheckCircle2 className="text-success-dark dark:text-success" size={28} aria-hidden />
					<span className="text-sm font-medium">Tudo certo. Entrando…</span>
				</output>
			)}

			{estado.tipo === "erro" && <FalhaDoLink motivo={estado.motivo} tipoLink={estado.tipoLink} />}
		</AuthShell>
	);
}

/** Link vencido/usado/cortado: explica em pt-BR e oferece o reenvio certo. */
function FalhaDoLink({ motivo, tipoLink }: { motivo: MotivoFalhaAcesso; tipoLink: TipoLinkEmail | null }) {
	const navigate = useNavigate();
	const { titulo, texto } = mensagemFalhaLink(motivo, tipoLink);
	const reenvio = reenvioDoLink(tipoLink);
	const [email, setEmail] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [aviso, setAviso] = useState<string | null>(null);
	const [liberaEm, setLiberaEm] = useState<number | null>(null);
	const segundos = useSegundosParaReenviar(liberaEm);
	const valido = /^\S+@\S+\.\S+$/.test(email.trim());

	async function pedir(alvo: string) {
		switch (reenvio) {
			case "recuperacao":
				return (await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: urlRecuperacaoSenha() })).error;
			case "confirmacao_cadastro":
				return (
					await supabase.auth.resend({ type: "signup", email: alvo, options: { emailRedirectTo: `${URL_PAINEL}/auth/login` } })
				).error;
			case "troca_email":
				return (await supabase.auth.resend({ type: "email_change", email: alvo })).error;
			default:
				return (await supabase.auth.signInWithOtp({ email: alvo, options: { shouldCreateUser: false } })).error;
		}
	}

	async function reenviar() {
		if (!valido || enviando || segundos > 0) return;
		setEnviando(true);
		setAviso(null);
		let falha: unknown = null;
		try {
			falha = await pedir(email.trim());
		} catch (e) {
			falha = e;
		}
		const r = resultadoDoEnvio(falha);
		setLiberaEm(liberaReenvioEm(r, Date.now()));
		setEnviando(false);
		if (r.tipo === "enviado")
			setAviso("Se houver uma conta com este e-mail, enviamos um novo link com um código de 6 dígitos. Confira também o spam.");
		else if (r.tipo === "aguarde") setAviso(mensagemAguarde(r.segundos));
		else setAviso(mensagemFalhaEnvio(r.motivo));
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col items-center gap-2 text-center" role="alert">
				<MailWarning className="text-muted-foreground" size={28} aria-hidden />
				<h1 className="text-2xl font-bold">{titulo}</h1>
				<p className="text-balance text-sm text-muted-foreground">{texto}</p>
			</div>

			{reenvio === "nenhum" ? (
				<p className="text-center text-sm">Peça um novo convite para quem convidou você para a equipe.</p>
			) : (
				<form
					className="space-y-3"
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						void reenviar();
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="confirmar-email">Seu e-mail</Label>
						<Input
							id="confirmar-email"
							type="email"
							autoComplete="email"
							placeholder="voce@empresa.com.br"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<Button type="submit" className="w-full" disabled={!valido || enviando || segundos > 0} aria-busy={enviando}>
						{enviando && <Loader2 className="mr-2 animate-spin" size={16} />}
						{segundos > 0 ? `Pedir um novo link em ${segundos}s` : "Pedir um novo link"}
					</Button>
					<p aria-live="polite" className="min-h-5 text-center text-sm font-medium">
						{aviso}
					</p>
				</form>
			)}

			<Button type="button" variant="link" onClick={() => navigate("/auth/login", { replace: true })}>
				Voltar para o login
			</Button>
		</div>
	);
}

export default ConfirmarPage;
