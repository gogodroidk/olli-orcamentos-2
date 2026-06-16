declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
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
