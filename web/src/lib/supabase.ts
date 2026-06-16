import { createClient } from '@supabase/supabase-js';

// A anon key é pública (RLS protege os dados). Defaults embutidos para o painel
// publicar sem precisar configurar variáveis; sobrescreva com VITE_* se quiser.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://yiaeplqinnnnniyvwtls.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpYWVwbHFpbm5ubm5peXZ3dGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTU5NzAsImV4cCI6MjA5NjY5MTk3MH0.P_EF248NN0y7XJ47FmUuqwW00N2gvjq_aNJBqan2COk';

/**
 * Browser Supabase client. The anon key is public; Row Level Security on every
 * table ensures a session only ever touches its own rows. The session is
 * persisted to localStorage and auto-refreshed. `detectSessionInUrl` stays on
 * so email magic-link / confirmation redirects are handled if ever enabled.
 */
// Untyped client. Per-table typing is provided by the helpers in `api.ts`
// (explicit return annotations + typed inputs), which is simpler and more
// robust than mirroring supabase-js's full generated `Database` generic.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'olli-web-auth',
  },
});
