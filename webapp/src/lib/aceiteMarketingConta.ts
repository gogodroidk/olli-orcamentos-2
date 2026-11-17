import { supabase } from "@/lib/supabase";
import { lerMarcadorAceite, textoDaVersao } from "./aceiteMarketing";

type UsuarioComMetadata = { user_metadata?: Record<string, unknown> | null };

/**
 * Passa o aceite marcado no cadastro (guardado em user_metadata até haver sessão) para public.consentimentos
 * e limpa o marcador. Só age se a caixa foi marcada; falha nunca derruba o login e tenta de novo no próximo.
 */
export async function registrarAceiteMarketingPendente(user: UsuarioComMetadata): Promise<void> {
	try {
		const marcador = lerMarcadorAceite(user.user_metadata);
		if (!marcador) return;
		const texto = textoDaVersao(marcador.versao);
		if (!texto) return;
		const { error } = await supabase.rpc("registrar_aceite_marketing", {
			p_origem: marcador.origem,
			p_texto: texto,
			p_versao: marcador.versao,
			p_aceito_em: marcador.aceito_em,
		});
		if (error) {
			console.warn("[aceite] não foi possível registrar o aceite de marketing:", error.message);
			return;
		}
		await supabase.auth.updateUser({ data: { marketing_aceite: null } });
	} catch {
		// tenta de novo no próximo login
	}
}
