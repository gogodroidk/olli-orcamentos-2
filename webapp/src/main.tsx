import "./global.css";
import "./theme/theme.css";
import "./locales/i18n";
import * as Sentry from "@sentry/react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import App from "./App";
import menuService from "./api/services/menuService";
import { registerLocalIcons } from "./components/icon";
import { GLOBAL_CONFIG } from "./global-config";
import ErrorBoundary from "./routes/components/error-boundary";
import { routesSection } from "./routes/sections";
import { urlJoin } from "./utils";

/**
 * Sentry — crash reporting do painel. Roda ANTES de qualquer await/render, para
 * pegar erro de boot (ex.: registerLocalIcons ou o menuService falhando).
 *
 * A DSN é pública por natureza (vai no bundle de qualquer jeito) e está fixa de
 * propósito: em env var, uma variável faltando desligaria o monitoramento em
 * silêncio — o padrão "erro vira vazio" que estamos matando.
 *
 * ATENÇÃO: o domínio de ingestão precisa estar no connect-src da CSP em
 * public/_headers. Sem isso o navegador bloqueia o envio e o Sentry fica MUDO.
 */
Sentry.init({
	dsn: "https://d7ae2f4d668a5b5ddfe25f612c6f4181@o4511745793327104.ingest.us.sentry.io/4511745839726592",
	environment: import.meta.env.PROD ? "production" : "development",
	// LGPD: nada de IP/dado pessoal do cliente.
	sendDefaultPii: false,
	// Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
	tracesSampleRate: 0.1,
});

await registerLocalIcons();
// MSW (mock /api) SÓ no DEV — em produção o OLLI fala direto com o Supabase, o
// mock não é usado. O dynamic import condicional deixa o rollup remover o
// @faker-js/faker + MSW (~4MB) do bundle de produção (dead-code elimination).
if (import.meta.env.DEV) {
	const { worker } = await import("./_mock");
	await worker.start({
		onUnhandledRequest: "bypass",
		serviceWorker: { url: urlJoin(GLOBAL_CONFIG.publicPath, "mockServiceWorker.js") },
	});
}
if (GLOBAL_CONFIG.routerMode === "backend") {
	await menuService.getMenuList();
}

const router = createBrowserRouter(
	[
		{
			Component: () => (
				<App>
					<Outlet />
				</App>
			),
			errorElement: <ErrorBoundary />,
			children: routesSection,
		},
	],
	{
		basename: GLOBAL_CONFIG.publicPath,
	},
);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(<RouterProvider router={router} />);
