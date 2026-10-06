/**
 * GOOGLE TAG (Google Ads) — carregador e conversão de cadastro, compartilhados pela
 * landing e pelo painel.
 *
 * IDs públicos por natureza (vão no HTML de qualquer site com Google tag) e fixos aqui,
 * pelo mesmo motivo do Pixel: em env var, uma variável faltando desligaria a medição
 * em silêncio. Conta Google Ads 779-101-4121.
 *
 * DECISÕES (leia antes de mexer)
 *  - `gtag.js` é injetado por DOM, de dentro do nosso bundle: o CSP não precisa de
 *    `unsafe-inline`, só dos hosts do Google listados em web/scripts/gerar-headers.mjs e
 *    webapp/public/_headers + vercel.json.
 *  - Só carrega com consentimento explícito (`consentimento.ts`), igual ao Pixel.
 *  - O cookie de clique (`_gcl_aw`, vindo do `gclid`) é gravado no domínio de maior
 *    nível (`cookie_domain: auto`), então atravessa olliorcamentos.online →
 *    app.olliorcamentos.online sem linker.
 *  - URL com segredo de autenticação nunca é enviada (mesma regra do Pixel).
 *  - Conversão de cadastro com `transaction_id` = `cadastro-<id do usuário>`: o Google
 *    descarta a repetição, então disparar duas vezes (e-mail + onAuthStateChange) não
 *    conta dobrado.
 */

import { consentimentoAtual, hostDeProducao } from "./consentimento.ts";
import { urlTemSegredo } from "./metaPixel.ts";

/** Tag do Google Ads da conta 779-101-4121. */
export const GOOGLE_ADS_ID = "AW-18229645817";
/** `send_to` da ação de conversão "Cadastro" (categoria Inscrição). */
export const CONVERSAO_CADASTRO = "AW-18229645817/Oak4CIKbvo8dEPmjyfRD";

const URL_GTAG = "https://www.googletagmanager.com/gtag/js";

type Gtag = (...args: unknown[]) => void;
interface JanelaComGtag {
	dataLayer?: unknown[];
	gtag?: Gtag;
}

let iniciado = false;

/** IDs ainda não configurados = Google tag DESLIGADA (e o console diz isso). */
export function googleTagConfigurada(id = GOOGLE_ADS_ID, conversao = CONVERSAO_CADASTRO): boolean {
	return /^AW-\d{6,}$/.test(id) && new RegExp(`^${id}/[\\w-]{6,}$`).test(conversao);
}

function urlAtualTemSegredo(): boolean {
	return urlTemSegredo(window.location.search, window.location.hash);
}

/**
 * Carrega a Google tag (assíncrona). Idempotente. `enviarPageView = false` no painel:
 * lá só as telas de entrada são medidas, e o page_view é manual.
 */
export function iniciarGoogleTag(enviarPageView = true): boolean {
	if (typeof window === "undefined" || typeof document === "undefined") return false;
	// Só produção mede (ver `hostDeProducao`): dev e preview não geram conversão no Google Ads.
	if (!hostDeProducao(window.location.hostname)) return false;
	if (iniciado) return true;
	if (!googleTagConfigurada()) {
		console.info("[medição] Google tag desligada: ID do Google Ads não configurado.");
		return false;
	}
	if (consentimentoAtual() !== "sim" || urlAtualTemSegredo()) return false;
	try {
		const w = window as unknown as JanelaComGtag;
		w.dataLayer = w.dataLayer ?? [];
		// O contrato do gtag.js é empurrar o objeto `arguments` (não um array): função
		// clássica, não arrow.
		w.gtag = function gtag() {
			// biome-ignore lint/complexity/noArguments: contrato do gtag.js
			w.dataLayer?.push(arguments);
		};
		w.gtag("js", new Date());
		w.gtag("config", GOOGLE_ADS_ID, { send_page_view: enviarPageView });
		const script = document.createElement("script");
		script.async = true;
		script.src = `${URL_GTAG}?id=${encodeURIComponent(GOOGLE_ADS_ID)}`;
		document.head.appendChild(script);
		iniciado = true;
	} catch {
		return false;
	}
	return true;
}

function chamar(...args: unknown[]): void {
	if (!iniciado || urlAtualTemSegredo()) return;
	try {
		(window as unknown as JanelaComGtag).gtag?.(...args);
	} catch {
		// Medição nunca derruba a página.
	}
}

/** page_view manual (painel). */
export function googlePageView(): void {
	chamar("event", "page_view");
}

/** Conversão "Cadastro" no Google Ads. `userId` deduplica (transaction_id). */
export function googleConversaoCadastro(userId: string): void {
	chamar("event", "conversion", { send_to: CONVERSAO_CADASTRO, transaction_id: `cadastro-${userId}` });
}
