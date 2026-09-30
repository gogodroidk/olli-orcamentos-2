import "./global.css";
import { capturarExcecao, conectarSentry } from "@sentry-captura";
import { limparBreadcrumbSentry, limparEventoSentry } from "@sentry-scrub";
import "./theme/theme.css";
import "./locales/i18n";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import App from "./App";
import { registerLocalIcons } from "./components/icon";
import { GLOBAL_CONFIG } from "./global-config";
import { ligarWebVitals } from "./olli/webVitals";
import ErrorBoundary from "./routes/components/error-boundary";
import { routesSection } from "./routes/sections";
import { urlJoin } from "./utils";

/**
 * Sentry — crash reporting do painel.
 *
 * A DSN é pública por natureza (vai no bundle de qualquer jeito) e está fixa de
 * propósito: em env var, uma variável faltando desligaria o monitoramento em
 * silêncio — o padrão "erro vira vazio" que estamos matando.
 *
 * ATENÇÃO: o domínio de ingestão precisa estar no connect-src da CSP em
 * public/_headers. Sem isso o navegador bloqueia o envio e o Sentry fica MUDO.
 *
 * POR QUE ELE NÃO CARREGA MAIS ANTES DO RENDER (mudou em 18/07): o SDK são ~190 KB
 * antes de minificar. Baixar isso ANTES da primeira tela custa segundos no 4G do
 * meio da rua — o monitoramento estava sendo pago pelo usuário que ele existe para
 * proteger. Agora ele entra depois da pintura.
 *
 * A captura de erro de BOOT não foi perdida: os dois ouvintes nativos abaixo são
 * instalados na primeira linha que roda e GUARDAM o que acontecer até o SDK chegar;
 * quando ele chega, a fila é reenviada. Erro cedo demais para o ouvinte também
 * seria cedo demais para o Sentry síncrono. O que não pode acontecer é o erro
 * SUMIR — por isso a fila, e não simplesmente "carrega depois".
 *
 * A fila mora em `@sentry-captura` (src/services/sentryCaptura.ts), não aqui: o
 * ErrorBoundary da rota e o ChunkBoundary também precisam dela — um erro que a
 * fronteira SEGURA nunca chega a estes ouvintes, e antes sumia se viesse antes
 * do SDK.
 */
const aoErro = (e: ErrorEvent) => capturarExcecao(e.error ?? e.message, { origem: "error" });
const aoRejeitar = (e: PromiseRejectionEvent) => capturarExcecao(e.reason, { origem: "unhandledrejection" });

window.addEventListener("error", aoErro);
window.addEventListener("unhandledrejection", aoRejeitar);

async function iniciarSentry() {
	try {
		const Sentry = await import("@sentry/react");
		Sentry.init({
			dsn: "https://d7ae2f4d668a5b5ddfe25f612c6f4181@o4511745793327104.ingest.us.sentry.io/4511745839726592",
			environment: import.meta.env.PROD ? "production" : "development",
			// LGPD: nada de IP/dado pessoal do cliente.
			sendDefaultPii: false,
			beforeSend: (event) => limparEventoSentry(event as unknown as Record<string, unknown>) as unknown as typeof event,
			beforeSendTransaction: (event) =>
				limparEventoSentry(event as unknown as Record<string, unknown>) as unknown as typeof event,
			beforeBreadcrumb: (breadcrumb) =>
				limparBreadcrumbSentry(breadcrumb as unknown as Record<string, unknown>) as unknown as typeof breadcrumb | null,
			// Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
			tracesSampleRate: 0.1,
		});

		// A partir daqui quem escuta é o SDK — sair de cena evita relato em dobro.
		window.removeEventListener("error", aoErro);
		window.removeEventListener("unhandledrejection", aoRejeitar);

		// Despeja o que chegou antes do SDK (ouvintes acima + fronteiras de erro).
		conectarSentry(Sentry);

		// Web Vitals de campo (LCP/INP/CLS) como Sentry Metrics — fora da cota de
		// erros e fora do caminho da primeira tela. Ver src/olli/webVitals.ts.
		void ligarWebVitals((nome, valor, opcoes) => Sentry.metrics.distribution(nome, valor, opcoes));
	} catch {
		// Sentry indisponível (chunk bloqueado, rede caiu) NÃO pode derrubar o painel:
		// o dono perde o monitoramento, nunca a tela. Os ouvintes nativos ficam de pé.
	}
}

/** Espera a linha principal desocupar; `requestIdleCallback` não existe no Safari. */
function quandoOcioso(fn: () => void) {
	if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 4000 });
	else window.setTimeout(fn, 2000);
}

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
// `menuService` arrasta o axios (~94 KB antes de minificar) e só serve ao modo
// "backend", que NÃO é o do OLLI (o padrão é "frontend" e é o que roda em produção).
// Estático, ele entrava no bundle de todo mundo para servir a ninguém. Por import()
// o axios sai do caminho da primeira tela. Ver também o manualChunks do
// vite.config.ts: tirar daqui só resolve com o axios FORA do vendor-utils.
if (GLOBAL_CONFIG.routerMode === "backend") {
	const { default: menuService } = await import("./api/services/menuService");
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

// Depois da pintura, nunca antes: crash reporting não compete com a primeira tela.
quandoOcioso(iniciarSentry);
