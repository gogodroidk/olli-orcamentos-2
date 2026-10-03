/**
 * CONSENTIMENTO DE MEDIÇÃO DE ANÚNCIOS (LGPD) — landing e telas de entrada do painel.
 *
 * O que depende de consentimento: o Meta Pixel, a Google tag (Google Ads) e o envio
 * server-side (Conversions API) do cadastro e da assinatura — tudo que compartilha
 * identificador do navegador com terceiros para anúncio.
 *
 * O que NÃO depende: a origem da visita (`olli_attr`, UTM/fbclid/gclid). Ela é nossa,
 * não sai para ninguém e só serve para saber de qual campanha veio o cadastro
 * (legítimo interesse, art. 7º, IX). Ver `atribuicao.ts`.
 *
 * Três estados, nunca dois: "sim" | "nao" | null (ainda não respondeu). Sem resposta,
 * nada de terceiro carrega — silêncio não é aceite.
 *
 * A decisão fica num cookie do domínio pai (`.olliorcamentos.online`): quem aceitou
 * na landing não vê o banner de novo no painel, e vice-versa.
 */

import { DOMINIO_COOKIE, lerCookie } from "./atribuicao.ts";

export const COOKIE_CONSENTIMENTO = "olli_consent";
const VALIDADE_SEGUNDOS = 180 * 24 * 60 * 60;
const ID_BANNER = "olli-consentimento";

export type Consentimento = "sim" | "nao" | null;

/** GPC / Do Not Track ligados = recusa já expressa pelo navegador. */
export function sinalDeRecusaDoNavegador(
	nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null } | undefined = typeof navigator === "undefined"
		? undefined
		: navigator,
): boolean {
	if (!nav) return false;
	if (nav.globalPrivacyControl === true) return true;
	return nav.doNotTrack === "1" || nav.doNotTrack === "yes";
}

/** Lê a decisão a partir da string de cookies. Valor desconhecido = não respondeu. */
export function lerConsentimentoDeCookies(cookies: string): Consentimento {
	const valor = lerCookie(cookies, COOKIE_CONSENTIMENTO);
	return valor === "sim" || valor === "nao" ? valor : null;
}

export function montarCookieConsentimento(valor: "sim" | "nao", host: string, protocolo: string): string {
	const nosso = host === "olliorcamentos.online" || host.endsWith(".olliorcamentos.online");
	const dominio = nosso ? `; Domain=${DOMINIO_COOKIE}` : "";
	const seguro = protocolo === "https:" ? "; Secure" : "";
	return `${COOKIE_CONSENTIMENTO}=${valor}; Max-Age=${VALIDADE_SEGUNDOS}; Path=/; SameSite=Lax${seguro}${dominio}`;
}

function cookiesDoNavegador(): string {
	try {
		return document.cookie ?? "";
	} catch {
		return "";
	}
}

/**
 * Decisão efetiva neste navegador. GPC/DNT vencem qualquer cookie: quem liga o sinal
 * depois de ter aceitado volta a "nao".
 */
export function consentimentoAtual(): Consentimento {
	if (typeof document === "undefined") return null;
	if (sinalDeRecusaDoNavegador()) return "nao";
	return lerConsentimentoDeCookies(cookiesDoNavegador());
}

export function gravarConsentimento(valor: "sim" | "nao"): void {
	try {
		document.cookie = montarCookieConsentimento(valor, window.location.hostname.toLowerCase(), window.location.protocol);
	} catch {
		// Cookie bloqueado: a decisão vale só para esta página; o banner volta na próxima.
	}
}

/**
 * Banner discreto no rodapé. Só aparece sem decisão e sem sinal de recusa do navegador.
 * `aoAceitar` roda no clique de "Aceitar" (carrega Pixel/Google tag na hora, sem recarregar).
 * Sem animação além de opacidade; botões nativos (teclado e leitor de tela de graça).
 */
export function mostrarBannerConsentimento(aoAceitar: () => void, linkPrivacidade: string): void {
	if (typeof document === "undefined" || consentimentoAtual() !== null) return;
	if (document.getElementById(ID_BANNER)) return;

	const banner = document.createElement("div");
	banner.id = ID_BANNER;
	banner.setAttribute("role", "region");
	banner.setAttribute("aria-label", "Cookies de medição de anúncios");
	banner.style.cssText = [
		"position:fixed",
		"left:16px",
		"right:16px",
		"bottom:16px",
		"z-index:2147483000",
		"max-width:560px",
		"margin:0 auto",
		"padding:14px 16px",
		"border-radius:14px",
		"background:#111827",
		"color:#f9fafb",
		"box-shadow:0 10px 30px rgba(0,0,0,.25)",
		"font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
		"display:flex",
		"flex-wrap:wrap",
		"gap:10px 12px",
		"align-items:center",
	].join(";");

	const texto = document.createElement("p");
	texto.style.cssText = "margin:0;flex:1 1 260px";
	texto.append("Usamos cookies do Meta e do Google para medir nossos anúncios. ");
	const link = document.createElement("a");
	link.href = linkPrivacidade;
	link.textContent = "Saiba mais";
	link.style.cssText = "color:#93c5fd;text-decoration:underline";
	texto.append(link);

	const acoes = document.createElement("div");
	acoes.style.cssText = "display:flex;gap:8px;flex:0 0 auto";
	const botao = (rotulo: string, primario: boolean) => {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = rotulo;
		b.style.cssText = [
			"min-height:40px",
			"padding:0 16px",
			"border-radius:10px",
			"font:600 14px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
			"cursor:pointer",
			primario ? "background:#f9fafb;color:#111827;border:0" : "background:transparent;color:#f9fafb;border:1px solid #4b5563",
		].join(";");
		return b;
	};
	const recusar = botao("Recusar", false);
	const aceitar = botao("Aceitar", true);
	acoes.append(recusar, aceitar);
	banner.append(texto, acoes);

	const fechar = () => banner.remove();
	recusar.addEventListener("click", () => {
		gravarConsentimento("nao");
		fechar();
	});
	aceitar.addEventListener("click", () => {
		gravarConsentimento("sim");
		fechar();
		try {
			aoAceitar();
		} catch {
			// Medição nunca derruba a página.
		}
	});

	document.body.appendChild(banner);
}
