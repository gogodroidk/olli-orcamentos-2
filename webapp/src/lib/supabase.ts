import { criarRegistroFunilAuth, lerRetornoOAuth, type RetornoOAuth } from "@oauth-retorno";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase do OLLI (web).
 *
 * A URL e a `anon key` são PÚBLICAS por design — a segurança dos dados é o RLS
 * no Postgres (cada usuário só enxerga as próprias linhas). Nunca coloque aqui
 * a `service_role` nem qualquer secret: isso vai para o bundle do front.
 *
 * Fallbacks apontam para o projeto real (`yiaeplqinnnnniyvwtls`) para o app
 * funcionar sem `.env`; em produção, sobrescreva por `VITE_SUPABASE_*`.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://yiaeplqinnnnniyvwtls.supabase.co";
const SUPABASE_ANON_KEY =
	import.meta.env.VITE_SUPABASE_ANON_KEY ??
	"sb_publishable_uDltTEnZAUek_YYGFhKaUw_q0DNu_6_";

/**
 * Retorno do OAuth lido ANTES de criar o client. Com `detectSessionInUrl`, o
 * supabase-js troca o `?code=` e o APAGA da barra de endereço sozinho — e, se não
 * conseguir (code_verifier ausente, code vencido, erro do Google na URL), falha
 * sem avisar ninguém. Guardar a URL aqui é o que permite à tela de login dizer o
 * que aconteceu e medir o funil (`useRetornoOAuth`). Ver src/services/oauthRetorno.ts.
 */
export const retornoOAuthInicial: RetornoOAuth =
	typeof window === "undefined" ? { tipo: "nenhum" } : lerRetornoOAuth(window.location.href);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		flowType: "pkce",
	},
});

/**
 * Funil do login social sem PII (`public.auth_funil_eventos`, INSERT de anon sem
 * SELECT). Sem a migration aplicada, desliga sozinho no primeiro erro.
 */
export const registrarFunilAuth = criarRegistroFunilAuth((linha) => supabase.from("auth_funil_eventos").insert(linha));
