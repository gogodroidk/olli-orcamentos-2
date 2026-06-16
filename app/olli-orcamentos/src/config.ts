declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
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
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Base do link público do cliente (Cloudflare Worker — Etapa 3).
 * Ex.: https://app.seudominio.com.br  → o link vira `${LINK_BASE_URL}/o/<token>`.
 * Vazio = recurso desligado (o app avisa para configurar o domínio).
 */
export const LINK_BASE_URL: string = (process.env.EXPO_PUBLIC_LINK_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * URL do Worker de diagnóstico no Cloudflare (Etapa 2). A chave da IA
 * (Gemini ou Claude) é SECRET do Worker — nunca uma var EXPO_PUBLIC do app.
 * Ex.: https://olli-diagnostico.SEU-USUARIO.workers.dev
 */
export const DIAGNOSTICO_URL: string = (process.env.EXPO_PUBLIC_DIAGNOSTICO_URL ?? 'https://olli-diagnostico.igoreluisa.workers.dev').replace(/\/+$/, '');

export function isDiagnosticoIADisponivel(): boolean {
  return !!DIAGNOSTICO_URL;
}
