/**
 * Stub WEB de src/utils/imagemDataUri.ts — usado só no build do painel.
 *
 * O real importa `react-native` (Platform) e faz `require('expo-file-system/legacy')`
 * no ramo nativo, que arrasta expo-modules-core e a cascata nativa pro build do Vite.
 * `gerarHtmlOrcamento` (o que o painel chama) NUNCA executa `imagemParaDataUri` — ela
 * só roda dentro de `populateImages` (async), que o painel não usa. Este stub existe
 * só pra o import de pdfGenerator resolver sem a árvore nativa.
 *
 * Ainda assim damos a ela um comportamento WEB CORRETO, caso um dia seja chamada: URIs
 * `data:` e `http(s):` já são exibíveis no navegador → passam direto; `file://` (do
 * celular) não abre na web → null, e o PDF segue sem ESTA imagem (o gerador já trata
 * null). Sem fetch aqui: no painel as imagens do blob já são data:/http.
 */
export async function imagemParaDataUri(uri?: string): Promise<string | null> {
	if (!uri) return null;
	if (uri.startsWith("data:")) return uri;
	if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
	return null;
}
