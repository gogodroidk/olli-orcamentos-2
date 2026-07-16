import tailwindcss from "@tailwindcss/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const base = env.VITE_APP_PUBLIC_PATH || "/";
	const isProduction = mode === "production";

	return {
		base,
		plugins: [
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
					manualChunks: {
						"vendor-core": ["react", "react-dom", "react-router"],
						"vendor-ui": ["antd", "@ant-design/cssinjs", "styled-components"],
						"vendor-utils": ["axios", "dayjs", "i18next", "zustand", "@iconify/react"],
						"vendor-charts": ["apexcharts", "react-apexcharts"],
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
