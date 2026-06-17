import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the initial session has been resolved from storage. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Creates an account. Returns the sign-up `data` so callers can tell whether
   * a session was issued immediately (email confirmation off → `data.session`
   * is set) or the user must confirm by e-mail first (`data.session` is null).
   */
  signUp: (email: string, password: string, nome?: string) => Promise<AuthResponse['data']>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Resolve the persisted session on first mount.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Keep state in sync with sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      async signUp(email, password, nome) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: nome ? { data: { full_name: nome } } : undefined,
        });
        if (error) throw error;
        return data;
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return ctx;
}
