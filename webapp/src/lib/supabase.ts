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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		flowType: "pkce",
	},
});
