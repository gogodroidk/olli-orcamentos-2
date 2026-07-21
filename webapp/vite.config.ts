import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Módulos NATIVOS (react-native/expo) que a árvore do gerador de PDF reusado do app
// importa mas NUNCA executa na web — resolvidos para um stub só pra o bundler não
// falhar. Ver webapp/src/shims/native-stubs.ts para o porquê completo.
const nativeStub = fileURLToPath(new URL("./src/shims/native-stubs.ts", import.meta.url));
const exportarDocStub = fileURLToPath(new URL("./src/shims/exportarDocumento.web.ts", import.meta.url));
const imagemDataUriStub = fileURLToPath(new URL("./src/shims/imagemDataUri.web.ts", import.meta.url));
const clienteLinkStub = fileURLToPath(new URL("./src/shims/clienteLink.web.ts", import.meta.url));

// FONTES DE VERDADE compartilhadas com a landing (preço) e o app (entitlements).
// Diferente de `@dominio` (só tipos, apagados no build), estes são imports de VALOR
// em runtime — então o alias precisa estar TAMBÉM aqui, no resolver do Vite, e não só
// no tsconfig. Ambos os arquivos são TypeScript puro, sem imports, seguros de empacotar.
const precosFonte = fileURLToPath(new URL("../web/src/data/planos.ts", import.meta.url));
const entitlementsFonte = fileURLToPath(new URL("../src/services/entitlements.ts", import.meta.url));

/**
 * Substitui os módulos-fronteira do app (exportarDocumento, imagemDataUri, clienteLink) por
 * versões browser SÓ no build do painel. Ambos importam react-native e fazem require de
 * expo-* no ramo nativo, arrastando expo-modules-core → TurboModuleRegistry → uma
 * cascata nativa que o Vite não resolve. gerarHtmlOrcamento (o que o painel usa) não
 * executa nada deles (exportarHtmlComoPdf/imagemParaDataUri só rodam em populateImages
 * e no export, que o painel não chama). resolveId com enforce:'pre' pega o import
 * relativo antes do resolver padrão — mais confiável que alias de path relativo.
 */
const stubModulosNativos = {
	name: "olli-stub-modulos-nativos",
	enforce: "pre" as const,
	resolveId(source: string) {
		if (/(^|\/)exportarDocumento(\.ts)?$/.test(source)) return exportarDocStub;
		if (/(^|\/)imagemDataUri(\.ts)?$/.test(source)) return imagemDataUriStub;
		if (/(^|\/)clienteLink(\.ts)?$/.test(source)) return clienteLinkStub;
		return null;
	},
};

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const base = env.VITE_APP_PUBLIC_PATH || "/";
	const isProduction = mode === "production";

	return {
		base,
		// Bandeiras que o próprio Sentry documenta para o bundler podar o SDK.
		// O painel só usa crash reporting: nunca adicionamos `browserTracingIntegration`,
		// então o código de tracing era peso morto que baixava junto. `__SENTRY_DEBUG__`
		// tira os avisos de console que só servem em desenvolvimento.
		define: {
			__SENTRY_DEBUG__: JSON.stringify(false),
			__SENTRY_TRACING__: JSON.stringify(false),
		},
		resolve: {
			alias: {
				// Fontes de verdade compartilhadas (ver comentário na criação das consts):
				// preço da landing e entitlements do app, empacotados como valor.
				"@precos": precosFonte,
				"@entitlements": entitlementsFonte,
				// A ORDEM IMPORTA: o /auto e o base do url-polyfill vêm ANTES de "react-native"
				// pra o Vite casar o prefixo mais específico primeiro. O polyfill de URL é
				// para React Native (que não tem URL completo); o navegador tem — então some
				// do bundle inteiro em vez de virar mais um require nativo pra stubar.
				"react-native-url-polyfill/auto": nativeStub,
				"react-native-url-polyfill": nativeStub,
				"react-native": nativeStub,
				"expo-print": nativeStub,
				"expo-sharing": nativeStub,
				"expo-file-system/legacy": nativeStub,
			},
		},
		plugins: [
			stubModulosNativos,
			react(),
			vanillaExtractPlugin({
				identifiers: ({ debugId }) => `${debugId}`,
			}),
			tailwindcss(),
			tsconfigPaths(),

			isProduction &&
				visualizer({
					open: true,
					gzipSize: true,
					brotliSize: true,
					template: "treemap",
				}),
		].filter(Boolean),

		server: {
			open: true,
			host: true,
			port: 3001,
			proxy: {
				"/api": {
					target: "http://localhost:3000",
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, ""),
					secure: false,
				},
			},
		},

		build: {
			target: "esnext",
			minify: "esbuild",
			sourcemap: !isProduction,
			cssCodeSplit: true,
			chunkSizeWarningLimit: 1500,
			rollupOptions: {
				output: {
					// NÃO troque isto por manualChunks(id) sem ler este comentário.
					//
					// Em e9a4efe isto virou forma-função (regex em node_modules) para forçar
					// o react-dom no vendor-core e parar o churn de hash. Efeito colateral:
					// TELA BRANCA no build de produção.
					//   Uncaught TypeError: Cannot set properties of undefined (setting 'Children')
					//   em vendor-core.js:1  — e o console parecia LIMPO, porque o erro estoura
					//   durante a avaliação do módulo, antes de qualquer listener existir.
					//
					// Causa: a forma-função atribui cada módulo a um chunk, mas os helpers de
					// interop CommonJS que o Rollup gera têm id virtual (\0commonjsHelpers) e
					// não casam com o regex — caem no chunk de entrada. O entry importa o
					// vendor-core, que executa ANTES, com o helper ainda não inicializado:
					// `exports` fica undefined e `exports.Children = ...` estoura. O React 19
					// ainda é CJS, então ele é a primeira vítima.
					//
					// A forma-array abaixo deixa o Rollup montar o grafo (ele resolve o helper
					// junto) e é a que roda em produção HOJE, funcionando. O react-dom escapar
					// pro chunk index é um custo de CACHE — irritante, mas cosmético. Tela
					// branca não é. Se for otimizar de novo: valide com build+preview real,
					// não só `build` exit 0 — o build passa mesmo quebrado.
					// O `axios` SAIU do vendor-utils em 18/07. Ele só é usado pelo
					// menuService (modo "backend", que o OLLI não usa) e o vendor-utils é
					// baixado no boot por causa do i18next/zustand/iconify — ou seja, listar
					// o axios aqui obrigava TODO usuário a baixar ~94 KB de HTTP client para
					// um caminho que nunca roda. Fora da lista, ele acompanha o import()
					// dinâmico do menuService e some do primeiro carregamento.
					// NÃO acrescente "motion" nesta lista. O `m`/`LazyMotion` são importados
					// de forma ESTÁTICA (motion-lazy.tsx); listar o pacote junta tudo num
					// chunk só, o `domMax` volta a ser dependência de boot e a separação do
					// motion-features.ts morre em silêncio — build passa, peso volta.
					manualChunks: {
						"vendor-core": ["react", "react-dom", "react-router"],
						"vendor-ui": ["antd", "@ant-design/cssinjs", "styled-components"],
						"vendor-utils": ["dayjs", "i18next", "zustand", "@iconify/react"],
						"vendor-charts": ["apexcharts", "react-apexcharts"],
						// Sentry só chega por import() (ver main.tsx). Isolar aqui impede que
						// o rollup o funda no chunk das features do motion: sem isso, a
						// animação da primeira tela puxava o SDK de crash junto, ~160 KB gzip
						// numa tacada só logo depois da pintura.
						"vendor-sentry": ["@sentry/react"],
					},
				},
			},
		},

		optimizeDeps: {
			include: ["react", "react-dom", "react-router", "axios", "dayjs"],
			exclude: ["@iconify/react"],
		},

		esbuild: {
			drop: isProduction ? ["console", "debugger"] : [],
			legalComments: "none",
			target: "esnext",
		},
	};
});
