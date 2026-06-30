import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

WebBrowser.maybeCompleteAuthSession();

export const AUTH_REDIRECT_PATH = 'auth/callback';
export const AUTH_SCHEME = 'olliorcamentos';

export function isSupabaseConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && SUPABASE_URL.startsWith('http');
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// ─── Auth helpers ──────────────────────────────────────────────
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export function getAuthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/${AUTH_REDIRECT_PATH}`;
  }
  return `${AUTH_SCHEME}://${AUTH_REDIRECT_PATH}`;
}

export async function handleAuthRedirectUrl(url: string) {
  if (!supabase || !url) return null;

  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  if (params.error_description || params.error) {
    throw new Error(String(params.error_description ?? params.error));
  }

  const code = params.code;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
    if (error) throw error;
    return data.session ?? null;
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken) return null;
  if (!refreshToken) throw new Error('Link de autenticacao sem refresh token.');

  const { data, error } = await supabase.auth.setSession({
    access_token: String(accessToken),
    refresh_token: String(refreshToken),
  });
  if (error) throw error;
  return data.session ?? null;
}

export async function signUp(email: string, password: string, nome?: string) {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      ...(nome ? { data: { full_name: nome } } : {}),
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Backup na nuvem não configurado.');
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Backup na nuvem nao configurado.');
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Nao foi possivel abrir o login do Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null;
  return handleAuthRedirectUrl(result.url);
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Backup na nuvem nao configurado.');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl(),
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
