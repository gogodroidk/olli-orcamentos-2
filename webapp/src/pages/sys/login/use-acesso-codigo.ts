import {
	classificarFalhaAcesso,
	deveVerificar,
	type EstadoCampoCodigo,
	liberaReenvioEm,
	mensagemAguarde,
	mensagemFalhaCodigo,
	mensagemFalhaEnvio,
	resultadoDoEnvio,
} from "@acesso-codigo";
import { useEffect, useRef, useState } from "react";
import { useSegundosParaReenviar } from "./components/BotaoReenviar";

interface Opcoes {
	/** Pede o código/link. Devolve o erro cru do Supabase (a regra anti-enumeração é aplicada aqui). */
	pedir: (email: string) => Promise<{ error: unknown }>;
	/** Confere o código. `ok` só com sessão criada. */
	conferir: (email: string, codigo: string) => Promise<{ ok: boolean; error: unknown }>;
	/** Depois do sucesso (sessão criada). */
	aoConfirmar: () => void;
	/** Texto mostrado depois de pedir (igual com ou sem conta). */
	textoEnviado: string;
}

/**
 * Estado do trilho "e-mail → código de 6 dígitos" do painel, o mesmo no login por
 * código e no "esqueci a senha". As regras (anti-enumeração, espera do reenvio,
 * mensagens) vêm de `@acesso-codigo`, compartilhado com o app.
 */
export function useAcessoCodigo({ pedir, conferir, aoConfirmar, textoEnviado }: Opcoes) {
	const [etapa, setEtapa] = useState<"email" | "codigo">("email");
	const [email, setEmail] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [aviso, setAviso] = useState<string | null>(null);
	const [liberaEm, setLiberaEm] = useState<number | null>(null);
	const segundos = useSegundosParaReenviar(liberaEm);

	const [codigo, setCodigo] = useState("");
	const [estado, setEstado] = useState<EstadoCampoCodigo>("digitando");
	const [erro, setErro] = useState<string | null>(null);

	const vivo = useRef(true);
	useEffect(
		() => () => {
			vivo.current = false;
		},
		[],
	);

	async function enviar(alvo = email) {
		if (enviando || segundos > 0) return;
		const limpo = alvo.trim();
		setEmail(limpo);
		setEnviando(true);
		setAviso(null);
		let falha: unknown = null;
		try {
			falha = (await pedir(limpo)).error;
		} catch (e) {
			falha = e;
		}
		if (!vivo.current) return;
		const r = resultadoDoEnvio(falha);
		setLiberaEm(liberaReenvioEm(r, Date.now()));
		setEnviando(false);
		if (r.tipo === "enviado") {
			setEtapa("codigo");
			setCodigo("");
			setEstado("digitando");
			setErro(null);
			setAviso(textoEnviado);
		} else if (r.tipo === "aguarde") {
			setAviso(mensagemAguarde(r.segundos));
		} else {
			setAviso(mensagemFalhaEnvio(r.motivo));
		}
	}

	async function verificar(c: string) {
		if (!deveVerificar(c, estado)) return;
		setEstado("verificando");
		setErro(null);
		let res: { ok: boolean; error: unknown };
		try {
			res = await conferir(email, c);
		} catch (e) {
			res = { ok: false, error: e };
		}
		if (!vivo.current) return;
		if (!res.ok) {
			setEstado("erro");
			setErro(mensagemFalhaCodigo(classificarFalhaAcesso(res.error)));
			return;
		}
		setEstado("sucesso");
		aoConfirmar();
	}

	function mudarCodigo(novo: string) {
		setCodigo(novo);
		if (estado === "erro") {
			setEstado("digitando");
			setErro(null);
		}
	}

	function trocarEmail() {
		setEtapa("email");
		setCodigo("");
		setEstado("digitando");
		setErro(null);
		setAviso(null);
	}

	return {
		etapa,
		email,
		setEmail,
		enviando,
		aviso,
		segundos,
		codigo,
		estado,
		erro,
		enviar,
		verificar,
		mudarCodigo,
		trocarEmail,
	};
}
