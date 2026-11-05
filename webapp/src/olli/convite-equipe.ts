import {
	lerResumoConvite,
	queryParamsEscolherContaGoogle,
	queryParamsGoogleConvite,
	type ResumoConvite,
} from "@convite-google";
import { supabase } from "@/lib/supabase";

const WORKER = ((import.meta.env.VITE_DIAGNOSTICO_URL as string | undefined) ?? "https://diagnostico.olliorcamentos.online").replace(
	/\/+$/,
	"",
);

export async function buscarResumoConvite(token: string): Promise<ResumoConvite> {
	try {
		const resposta = await fetch(`${WORKER}/equipe/convite/${encodeURIComponent(token)}/resumo`);
		const dados = await resposta.json().catch(() => null);
		return lerResumoConvite(resposta.status, dados);
	} catch {
		return { ok: false, erro: "indisponivel" };
	}
}

/**
 * Volta sempre para `/auth/login`, sem query. Endereço novo na allowlist do
 * Auth exigiria mudança de configuração, e esta branch não faz isso.
 */
export async function entrarComGoogleDoConvite(email: string): Promise<string | null> {
	const queryParams = queryParamsGoogleConvite(email) ?? queryParamsEscolherContaGoogle();
	try {
		const { error } = await supabase.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: `${window.location.origin}/auth/login`,
				queryParams,
			},
		});
		if (error) return "Não foi possível entrar com o Google. Tente de novo.";
		return null;
	} catch {
		return "Não foi possível entrar com o Google. Tente de novo.";
	}
}
