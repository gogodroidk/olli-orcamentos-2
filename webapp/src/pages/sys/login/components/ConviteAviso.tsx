import { mascararEmailConvite, mensagemAceiteConvite } from "@convite-google";
import { useEffect, useState } from "react";
import { buscarResumoConvite } from "@/olli/convite-equipe";
import { useLoginStateContext } from "../providers/login-provider";

/** Explica o convite e guarda o e-mail que o botão Google vai sugerir. */
export function ConviteAviso() {
	const { conviteToken, setLoginHintGoogle } = useLoginStateContext();
	const [texto, setTexto] = useState(
		"Você foi convidado para uma equipe. Entre com o Google do e-mail que recebeu o convite.",
	);

	useEffect(() => {
		if (!conviteToken) return;
		let vivo = true;
		buscarResumoConvite(conviteToken).then((resumo) => {
			if (!vivo) return;
			if (!resumo.ok) {
				if (resumo.erro !== "indisponivel") {
					const codigo = resumo.erro === "invalido" ? "invalido" : resumo.erro;
					setTexto(mensagemAceiteConvite(codigo));
				}
				return;
			}
			if (resumo.temEmail) setLoginHintGoogle(resumo.email);
			const quem = resumo.empresa ? ` de ${resumo.empresa}` : "";
			const conta = resumo.temEmail
				? ` Use o Google da conta ${mascararEmailConvite(resumo.email)}.`
				: " Escolha a conta Google que vai trabalhar nesta equipe.";
			setTexto(`Você foi convidado para a equipe${quem}.${conta}`);
		});
		return () => {
			vivo = false;
		};
	}, [conviteToken, setLoginHintGoogle]);

	if (!conviteToken) return null;
	return (
		<div className="rounded-md border border-border p-3 text-sm text-muted-foreground" role="note">
			{texto}
		</div>
	);
}
