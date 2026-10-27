/**
 * Versão mínima do app Android (D-1326), lida da var `APP_VERSAO_MINIMA_ANDROID` (versionCode inteiro).
 * Ausente, vazia ou inválida = 0 = desligada: valor estranho nunca tranca o app de ninguém.
 */
export function versaoMinimaAndroid(env) {
  const bruto = typeof env?.APP_VERSAO_MINIMA_ANDROID === 'string' ? env.APP_VERSAO_MINIMA_ANDROID.trim() : '';
  if (!/^\d{1,6}$/.test(bruto)) return 0;
  return Number(bruto);
}
