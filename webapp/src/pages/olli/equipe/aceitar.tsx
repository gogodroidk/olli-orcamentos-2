import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
	consumirConvitePendente,
	interpretarAceiteConvite,
	lerConvitePendente,
	mensagemAceiteConvite,
	podeAceitarConvite,
	sessaoTemGoogle,
} from "@convite-google";
import { supabase } from "@/lib/supabase";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { buscarResumoConvite, entrarComGoogleDoConvite } from "@/olli/convite-equipe";

type Fase =
	| { tipo: "lendo" }
	| { tipo: "sem_token" }
	| { tipo: "pronto"; texto: string; email: string }
	| { tipo: "ocupado" }
	| { tipo: "erro"; mensagem: string; email: string };

/**
 * Aceite explícito depois do Google. Abrir o link não entra na equipe:
 * o botão é que chama `aceitar_convite`.
 */
export default function AceitarConvitePage() {
	const navigate = useNavigate();
	const [fase, setFase] = useState<Fase>({ tipo: "lendo" });

	useEffect(() => {
		let vivo = true;
		const token = lerConvitePendente(window.sessionStorage);
		if (!token) {
			setFase({ tipo: "sem_token" });
			return;
		}
		buscarResumoConvite(token).then((resumo) => {
			if (!vivo) return;
			if (!resumo.ok && resumo.erro !== "indisponivel") {
				const codigo = resumo.erro === "invalido" ? "invalido" : resumo.erro;
				setFase({ tipo: "erro", mensagem: mensagemAceiteConvite(codigo), email: "" });
				return;
			}
			const empresa = resumo.ok && resumo.empresa ? ` de ${resumo.empresa}` : "";
			const conta =
				resumo.ok && resumo.temEmail
					? " A entrada vale para o Google do e-mail que recebeu o convite."
					: "";
			setFase({
				tipo: "pronto",
				texto: `Você foi convidado para uma equipe${empresa}.${conta} Ao aceitar, o que você cadastrar passa a ficar nessa equipe.`,
				email: resumo.ok ? resumo.email : "",
			});
		});
		return () => {
			vivo = false;
		};
	}, []);

	async function aceitar() {
		const token = lerConvitePendente(window.sessionStorage);
		if (!token) {
			setFase({ tipo: "sem_token" });
			return;
		}
		setFase({ tipo: "ocupado" });
		const resumo = await buscarResumoConvite(token);
		const { data: sessao } = await supabase.auth.getSession();
		const user = sessao.session?.user;
		if (resumo.ok) {
			const gate = podeAceitarConvite({
				sabeEmail: true,
				temEmail: resumo.temEmail,
				emailConvite: resumo.email,
				emailConta: user?.email,
				temGoogle: sessaoTemGoogle(user),
			});
			if (!gate.ok) {
				setFase({ tipo: "erro", mensagem: mensagemAceiteConvite(gate.codigo), email: resumo.email });
				return;
			}
		}
		const { data, error } = await supabase.rpc("aceitar_convite", { p_token: token });
		if (error) {
			setFase({
				tipo: "erro",
				mensagem: "Não consegui aceitar o convite agora. Tente de novo.",
				email: resumo.ok ? resumo.email : "",
			});
			return;
		}
		const lido = interpretarAceiteConvite(data);
		if (!lido.ok) {
			setFase({ tipo: "erro", mensagem: mensagemAceiteConvite(lido.codigo), email: resumo.ok ? resumo.email : "" });
			return;
		}
		consumirConvitePendente(window.sessionStorage);
		toast.success(lido.jaAceito ? "Você já estava nesta equipe." : "Você entrou na equipe.");
		navigate("/inicio", { replace: true });
	}

	function recusar() {
		consumirConvitePendente(window.sessionStorage);
		navigate("/inicio", { replace: true });
	}

	async function trocarConta(email: string) {
		const falha = await entrarComGoogleDoConvite(email);
		if (falha) setFase({ tipo: "erro", mensagem: falha, email });
	}

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-lg items-center p-4">
			<Card className="w-full space-y-4 p-6">
				<h1 className="text-xl font-semibold text-text-primary">Convite de equipe</h1>
				{fase.tipo === "lendo" || fase.tipo === "ocupado" ? (
					<p className="flex items-center gap-2 text-sm text-text-secondary" aria-live="polite">
						<Loader2 className="size-4 animate-spin" aria-hidden />
						{fase.tipo === "ocupado" ? "Aceitando o convite…" : "Lendo o convite…"}
					</p>
				) : null}
				{fase.tipo === "sem_token" ? (
					<p className="text-sm text-text-secondary">Abra de novo o link do convite para entrar na equipe.</p>
				) : null}
				{fase.tipo === "pronto" ? <p className="text-sm text-text-secondary">{fase.texto} Só aceite se você conhece quem enviou.</p> : null}
				{fase.tipo === "erro" ? (
					<p className="text-sm text-error" role="alert">
						{fase.mensagem}
					</p>
				) : null}
				{fase.tipo === "pronto" || fase.tipo === "erro" ? (
					<div className="flex flex-col gap-2 sm:flex-row">
						{fase.tipo === "pronto" ? (
							<Button type="button" onClick={() => void aceitar()}>
								Aceitar convite
							</Button>
						) : null}
						{fase.tipo === "erro" && fase.email ? (
							<Button type="button" onClick={() => void trocarConta(fase.email)}>
								Entrar com o Google do convite
							</Button>
						) : null}
						<Button type="button" variant="outline" onClick={recusar}>
							Agora não
						</Button>
					</div>
				) : null}
				{fase.tipo === "sem_token" ? (
					<Button type="button" variant="outline" onClick={() => navigate("/inicio", { replace: true })}>
						Ir para o início
					</Button>
				) : null}
			</Card>
		</div>
	);
}
