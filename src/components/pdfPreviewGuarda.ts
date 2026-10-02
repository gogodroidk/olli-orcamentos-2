/**
 * Guarda de navegação do WebView da PRÉVIA DO PDF (auditoria de segurança 02/10, S6).
 *
 * Módulo PURO (sem react-native) para o teste rodar a função de verdade no Node —
 * inclusive dentro do `createOnShouldStartLoadWithRequest` REAL do
 * react-native-webview (`scripts/teste-pdf-preview-seguro.ts`).
 *
 * Por que `originWhitelist={['*']}` e não `['about:blank']`: no react-native-webview
 * 13.x, uma URL FORA do `originWhitelist` nem chega ao `onShouldStartLoadWithRequest`
 * — vai direto para `Linking.openURL`, ou seja, todo link `https:`, `tel:` ou
 * `whatsapp:` do HTML abriria FORA do app. Com o curinga, TODA navegação passa por
 * esta guarda, e o que ela recusa não carrega nem abre em lugar nenhum.
 */

/** Origens do WebView da prévia: todas — quem decide é `permitirCargaDaPrevia`. */
export const ORIGENS_DA_PREVIA: string[] = ['*'];

/**
 * Única carga que o WebView da prévia aceita: o próprio documento (`about:blank` /
 * `data:` do `source.html`). Qualquer link, redirecionamento ou iframe com outro
 * destino é bloqueado.
 */
export function permitirCargaDaPrevia(req: { url?: string }): boolean {
  const url = (req?.url ?? '').trim().toLowerCase();
  return url === 'about:blank' || url.startsWith('data:text/html');
}
