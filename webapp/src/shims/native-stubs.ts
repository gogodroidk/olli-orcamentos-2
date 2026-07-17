/**
 * Stubs de módulos NATIVOS para o build web do painel.
 *
 * POR QUE EXISTEM: o painel reusa `montarHtmlOrcamentoCompleto` do app
 * (`src/utils/pdfGenerator.ts`) — o MESMO gerador que produz o PDF do celular, pra
 * o documento não divergir entre app e painel. Esse gerador importa
 * `exportarDocumento.ts` e `imagemDataUri.ts`, que no topo fazem
 * `import { Platform } from 'react-native'` e, no ramo NATIVO, `require('expo-print')`,
 * `require('expo-sharing')`, `require('expo-file-system/legacy')`.
 *
 * Nenhum desses roda na web: os arquivos checam `Platform.OS === 'web'` e tomam o
 * ramo web (iframe + print, data URI direto). MAS o Vite/Rollup precisa RESOLVER os
 * módulos em tempo de build, mesmo o código nativo nunca sendo executado. O painel
 * não tem react-native nem expo instalados (é React puro), então sem stub o build
 * falha em "Could not resolve 'expo-print'".
 *
 * Estes stubs dão ao bundler algo pra resolver. `Platform.OS = 'web'` é a única
 * coisa lida na web, e é a VERDADE (o painel É web) — então o ramo web é escolhido,
 * que é exatamente o que queremos. Os módulos expo ficam vazios: se algum dia forem
 * chamados na web (não são), o erro é explícito em vez de silencioso.
 */

/** react-native → só o que a árvore do PDF lê na web. */
export const Platform = { OS: "web" as const };

/**
 * NativeModules — a ponte pra código nativo. Na web não existe; objeto vazio pra
 * qualquer coisa que o importe (ex.: react-native-url-polyfill) resolver no build.
 * O polyfill em si é aliasado pra fora (o navegador já tem URL), mas manter isto
 * evita quebra caso outro pacote toque em NativeModules.
 */
export const NativeModules = {};

/** require('react-native').Linking (ramo nativo do abrirWhatsApp — nunca chamado aqui). */
export const Linking = {
	openURL: async () => {
		throw new Error("Linking indisponível no painel web (use window.open).");
	},
};

// expo-print / expo-sharing / expo-file-system só têm efeito no nativo. Na web o
// ramo que os usa não roda; o objeto vazio existe só pra o bundler resolver.
export default {};
