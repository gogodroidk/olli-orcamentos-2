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
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpYWVwbHFpbm5ubm5peXZ3dGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTU5NzAsImV4cCI6MjA5NjY5MTk3MH0.P_EF248NN0y7XJ47FmUuqwW00N2gvjq_aNJBqan2COk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
		flowType: "pkce",
	},
});
