import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo web/.env.',
  );
}

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
