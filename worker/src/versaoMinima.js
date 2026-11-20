/**
 * Versão mínima do app Android (D-1326), lida da var `APP_VERSAO_MINIMA_ANDROID` (versionCode inteiro).
 * Ausente, vazia ou inválida = 0 = desligada: valor estranho nunca tranca o app de ninguém.
 * Trava de configuração: só vale se `APP_VERSAO_PLAY_ATUAL` (o maior versionCode já publicado na Play, posto no
 * mesmo deploy) existir e for >= a mínima. Mínima acima do que a Play entrega trancaria todo mundo sem saída.
 */
function inteiro(valor) {
  const bruto = typeof valor === 'string' ? valor.trim() : '';
  return /^\d{1,6}$/.test(bruto) ? Number(bruto) : 0;
}

export function versaoMinimaAndroid(env) {
  const minima = inteiro(env?.APP_VERSAO_MINIMA_ANDROID);
  const playAtual = inteiro(env?.APP_VERSAO_PLAY_ATUAL);
  if (minima === 0 || playAtual === 0 || minima > playAtual) return 0;
  return minima;
}

/**
 * Chave remota da navegação v1.3 do app (CQ-APP-13-B): `APP_UI_V2_NAV=0` desliga
 * em todos os apps no próximo boot, sem versão nova. Ausente/qualquer outro
 * valor = true (o build decide). O servidor nunca LIGA o que o build não ligou.
 */
export function chaveUiV2Nav(env) {
  const bruto = typeof env?.APP_UI_V2_NAV === 'string' ? env.APP_UI_V2_NAV.trim() : '';
  return bruto !== '0';
}
