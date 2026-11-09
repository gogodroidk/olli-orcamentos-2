import { Platform } from 'react-native';
import { supabase } from './supabase';
import { elevarSessaoComCodigo, precisaElevarSessao, type ResultadoElevacao } from './sessaoMfaCore';

/**
 * A sessão deste aparelho é `aal1` numa conta que tem TOTP? Leitura LOCAL (o
 * auth-js lê o JWT e os fatores guardados na sessão, sem rede). Nunca lança.
 * Ver services/sessaoMfaCore.ts para o porquê.
 */
export async function sessaoPrecisaDeCodigo(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return precisaElevarSessao(data.currentLevel, data.nextLevel, Platform.OS);
  } catch {
    return false;
  }
}

/** Confirma o código do autenticador e promove a sessão deste aparelho a `aal2`. */
export async function confirmarCodigoDaSessao(codigo: string): Promise<ResultadoElevacao> {
  if (!supabase) return 'erro';
  const mfa = supabase.auth.mfa;
  return elevarSessaoComCodigo(
    {
      listFactors: () => mfa.listFactors() as never,
      challengeAndVerify: (p) => mfa.challengeAndVerify(p) as never,
    },
    codigo,
  );
}
