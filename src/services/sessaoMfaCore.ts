/**
 * Sessão do app que não cai quando a mesma conta confirma o código (TOTP) no painel.
 *
 * O PORQUÊ (incidente 02–03/11/2026, conta do Igor): o Supabase Auth, a cada
 * verificação de MFA bem-sucedida (`POST /factors/{id}/verify`), APAGA todas as
 * sessões `aal1` do usuário (`InvalidateSessionsWithAALLessThan`, supabase/auth
 * internal/api/mfa.go). O painel admin exige o código do autenticador; o app
 * nunca pedia, então a sessão do celular era `aal1` e morria toda vez que o dono
 * entrava no painel num navegador novo. No próximo refresh o app recebia
 * `refresh_token_not_found` e caía no "Entrar" — sem `/logout` nenhum no log.
 *
 * A CORREÇÃO: quem tem fator TOTP verificado confirma o código uma vez no app.
 * A sessão do celular vira `aal2` e deixa de ser alvo da limpeza. Quem não tem
 * MFA (todo cliente comum) não vê nada. Este arquivo é só a regra (sem React
 * Native), para o teste rodar no Node.
 */

export type NivelAal = string | null | undefined;

export interface FatorMfa {
  id: string;
  factor_type?: string;
  status?: string;
}

/** Só o celular/tablet: na web (painel e app web) o fluxo continua o de sempre. */
export function precisaElevarSessao(atual: NivelAal, proximo: NivelAal, plataforma: string): boolean {
  if (plataforma === 'web') return false;
  return atual === 'aal1' && proximo === 'aal2';
}

/** Primeiro TOTP verificado (o painel só cadastra TOTP). */
export function escolherFatorTotp(fatores: FatorMfa[] | null | undefined): FatorMfa | null {
  if (!Array.isArray(fatores)) return null;
  return fatores.find((f) => !!f && typeof f.id === 'string' && f.id.length > 0
    && (f.factor_type ?? 'totp') === 'totp' && (f.status ?? 'verified') === 'verified') ?? null;
}

/** Aceita "123 456", "123-456"; devolve os 6 dígitos ou null. */
export function normalizarCodigoTotp(bruto: string): string | null {
  const digitos = (bruto ?? '').replace(/\D/g, '');
  return /^\d{6}$/.test(digitos) ? digitos : null;
}

export type ResultadoElevacao = 'ok' | 'codigo_invalido' | 'sem_fator' | 'erro';

export interface ApiMfa {
  listFactors(): Promise<{ data: { totp?: FatorMfa[] | null } | null; error: unknown }>;
  challengeAndVerify(params: { factorId: string; code: string }): Promise<{ error: unknown }>;
}

const ERROS_DE_CODIGO = new Set(['mfa_verification_failed', 'mfa_challenge_expired', 'mfa_verification_rejected']);

/** Nunca lança. */
export async function elevarSessaoComCodigo(api: ApiMfa, codigoBruto: string): Promise<ResultadoElevacao> {
  const codigo = normalizarCodigoTotp(codigoBruto);
  if (!codigo) return 'codigo_invalido';
  try {
    const { data, error } = await api.listFactors();
    if (error) return 'erro';
    const fator = escolherFatorTotp(data?.totp ?? null);
    if (!fator) return 'sem_fator';
    const { error: erroVerify } = await api.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (!erroVerify) return 'ok';
    const code = (erroVerify as { code?: unknown })?.code;
    if (typeof code === 'string' && ERROS_DE_CODIGO.has(code)) return 'codigo_invalido';
    const status = (erroVerify as { status?: unknown })?.status;
    if (status === 422 || status === 400) return 'codigo_invalido';
    return 'erro';
  } catch {
    return 'erro';
  }
}
