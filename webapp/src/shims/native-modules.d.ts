/**
 * Declarações ambientes dos módulos nativos que a árvore do gerador de PDF importa.
 *
 * O build do painel é `tsc && vite build`. O `tsc` type-checa `montarHtmlOrcamentoCompleto`
 * (importado do app) e, com ele, `exportarDocumento.ts`/`imagemDataUri.ts`, que importam
 * `react-native` e fazem require de `expo-*`. Sem estas declarações, o tsc erra
 * "Cannot find module 'react-native'". O runtime resolve pelos aliases do vite.config
 * → src/shims/native-stubs.ts. Ver o cabeçalho de native-stubs.ts.
 */

declare module "react-native" {
	export const Platform: { OS: string };
	export const Linking: { openURL: (url: string) => Promise<void> };
}

declare module "expo-print" {
	const anything: any;
	export = anything;
}

declare module "expo-sharing" {
	const anything: any;
	export = anything;
}

declare module "expo-file-system/legacy" {
	const anything: any;
	export = anything;
}
