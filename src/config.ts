declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_LINK_BASE_URL?: string;
    EXPO_PUBLIC_DIAGNOSTICO_URL?: string;
  };
};

/**
 * Configuração pública da nuvem (Supabase).
 *
 * O app continua funcionando offline quando estes valores não existem.
 * Para habilitar login e backup, crie um `.env.local` baseado em `.env.example`.
 * Não coloque `service_role` nem chaves secretas aqui: variáveis EXPO_PUBLIC
 * entram no bundle do aplicativo.
 */
export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://yiaeplqinnnnniyvwtls.supabase.co';
export const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpYWVwbHFpbm5ubm5peXZ3dGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTU5NzAsImV4cCI6MjA5NjY5MTk3MH0.P_EF248NN0y7XJ47FmUuqwW00N2gvjq_aNJBqan2COk';

/**
 * Base do link público do cliente (Cloudflare Worker — Etapa 3).
 * Ex.: https://app.seudominio.com.br  → o link vira `${LINK_BASE_URL}/o/<token>`.
 * Vazio = recurso desligado (o app avisa para configurar o domínio).
 */
export const LINK_BASE_URL: string = (process.env.EXPO_PUBLIC_LINK_BASE_URL ?? 'https://link.olliorcamentos.online').replace(/\/+$/, '');

/**
 * URL do Worker de diagnóstico no Cloudflare (Etapa 2). A chave da IA
 * (Gemini ou Claude) é SECRET do Worker — nunca uma var EXPO_PUBLIC do app.
 * Ex.: https://olli-diagnostico.SEU-USUARIO.workers.dev
 */
export const DIAGNOSTICO_URL: string = (process.env.EXPO_PUBLIC_DIAGNOSTICO_URL ?? 'https://link.olliorcamentos.online').replace(/\/+$/, '');

export function isDiagnosticoIADisponivel(): boolean {
  return !!DIAGNOSTICO_URL;
}
