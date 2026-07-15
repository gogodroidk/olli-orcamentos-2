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
					// Forma-função: casa qualquer módulo dentro da pasta do pacote em
					// node_modules, não só o entrypoint. Antes react-dom (o maior módulo)
					// escapava do vendor-core porque o array só pegava match exato de
					// especificador, e caía sozinho num chunk que muda a cada deploy.
					manualChunks(id) {
						if (/node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
							return "vendor-core";
						}
						if (/node_modules[\\/](styled-components|antd|@ant-design[\\/]cssinjs)[\\/]/.test(id)) {
							return "vendor-ui";
						}
						if (/node_modules[\\/](axios|dayjs|i18next|zustand|@iconify[\\/]react)[\\/]/.test(id)) {
							return "vendor-utils";
						}
						if (/node_modules[\\/](apexcharts|react-apexcharts)[\\/]/.test(id)) {
							return "vendor-charts";
						}
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
