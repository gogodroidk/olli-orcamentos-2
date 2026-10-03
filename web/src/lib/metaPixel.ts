/**
 * META PIXEL — carregador e eventos, compartilhados pela landing e pelo painel.
 *
 * O ID do Pixel é público por natureza (vai no HTML de qualquer site que usa Pixel)
 * e fica fixo aqui, pelo mesmo motivo da DSN do Sentry: em env var, uma variável
 * faltando desligaria a medição em silêncio.
 *
 * DECISÕES (leia antes de mexer)
 *  - O script `fbevents.js` é injetado por DOM, de dentro do nosso bundle. Não existe
 *    `<script>` inline do Pixel, então o CSP não precisa de hash nem de
 *    `unsafe-inline` — só de `https://connect.facebook.net` no `script-src` e de
 *    `https://www.facebook.com` no `img-src`/`connect-src` (web/scripts/gerar-headers.mjs
 *    e webapp/public/_headers + vercel.json).
 *  - `autoConfig` desligado: sem isso o Pixel raspa botões e metadados da página por
 *    conta própria. Só sai o que este arquivo manda.
 *  - `disablePushState`: sem isso o Pixel dispara PageView a cada troca de rota da SPA
 *    do painel, mandando ao Meta URLs internas da área logada. PageView é manual.
 *  - Só carrega com consentimento explícito ("Aceitar" no banner, `consentimento.ts`).
 *    `Do Not Track` / `Global Privacy Control` ligados = recusa, o Pixel NÃO carrega.
 *  - URL com segredo de autenticação (?code=, #access_token…) nunca é enviada: o evento
 *    é descartado em vez de vazar o token para terceiros.
 */

import { consentimentoAtual } from "./consentimento.ts";

export const META_PIXEL_ID = "4793168394059665";
const URL_FBEVENTS = "https://connect.facebook.net/en_US/fbevents.js";

/** Eventos padrão do Meta que a OLLI usa. */
export type EventoPadrao = "PageView" | "Lead" | "CompleteRegistration" | "Subscribe" | "Purchase";

type Fbq = {
	(...args: unknown[]): void;
	callMethod?: (...args: unknown[]) => void;
	queue: unknown[][];
	push: unknown;
	loaded: boolean;
	version: string;
	disablePushState?: boolean;
};
interface JanelaComPixel {
	fbq?: Fbq;
	_fbq?: Fbq;
}

let iniciado = false;

/** Sinal de privacidade do navegador (GPC/DNT) = o visitante recusou rastreamento. */
export function rastreamentoPermitido(
	nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null } | undefined = typeof navigator === "undefined"
		? undefined
		: navigator,
): boolean {
	if (!nav) return true;
	if (nav.globalPrivacyControl === true) return false;
	return nav.doNotTrack !== "1" && nav.doNotTrack !== "yes";
}

const PARAMETRO_SENSIVEL = /(^|[?&#])(code|access_token|refresh_token|provider_token|token_hash|token|error_description)=/i;

/** A URL atual carrega credencial de login (retorno de OAuth, link mágico, recuperação de senha)? */
export function urlTemSegredo(search: string, hash: string): boolean {
	return PARAMETRO_SENSIVEL.test(`${search}${hash}`);
}

function urlAtualTemSegredo(): boolean {
	return urlTemSegredo(window.location.search, window.location.hash);
}

function instalarFbq(w: JanelaComPixel): Fbq {
	if (w.fbq) return w.fbq;
	const fbq = ((...args: unknown[]) => {
		if (fbq.callMethod) fbq.callMethod(...args);
		else fbq.queue.push(args);
	}) as Fbq;
	fbq.push = fbq;
	fbq.loaded = true;
	fbq.version = "2.0";
	fbq.queue = [];
	w.fbq = fbq;
	if (!w._fbq) w._fbq = fbq;
	const script = document.createElement("script");
	script.async = true;
	script.src = URL_FBEVENTS;
	document.head.appendChild(script);
	return fbq;
}

/**
 * Carrega o Pixel (assíncrono) e o inicializa. Idempotente. Devolve `false` quando o
 * Pixel NÃO está ativo (SSR, sem consentimento, DNT/GPC, falha) — quem chama não precisa tratar, os
 * métodos abaixo viram no-op.
 */
export function iniciarPixel(): boolean {
	if (typeof window === "undefined" || typeof document === "undefined") return false;
	if (iniciado) return true;
	if (!rastreamentoPermitido() || consentimentoAtual() !== "sim") return false;
	try {
		const w = window as unknown as JanelaComPixel;
		const fbq = instalarFbq(w);
		fbq.disablePushState = true;
		fbq("set", "autoConfig", false, META_PIXEL_ID);
		fbq("init", META_PIXEL_ID);
		iniciado = true;
	} catch {
		// Medição nunca derruba a página.
		return false;
	}
	return true;
}

function chamar(...args: unknown[]): void {
	if (!iniciado || urlAtualTemSegredo()) return;
	try {
		(window as unknown as JanelaComPixel).fbq?.(...args);
	} catch {
		// idem
	}
}

export function pageView(): void {
	chamar("track", "PageView");
}

/**
 * Evento padrão. `eventId` é o que deduplica navegador × servidor quando a CAPI entrar
 * (o servidor manda o MESMO id) — gere um por ação com `novoEventId()`.
 */
export function rastrear(evento: EventoPadrao, parametros: Record<string, unknown> = {}, eventId?: string): void {
	if (eventId) chamar("track", evento, parametros, { eventID: eventId });
	else chamar("track", evento, parametros);
}

export function novoEventId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
