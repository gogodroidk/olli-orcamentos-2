/**
 * Marketing da landing: origem da visita (UTM/fbclid/gclid) + Meta Pixel.
 *
 * Roda em toda página indexável (o `Layout.astro` carrega este arquivo). Faz três
 * coisas, todas silenciosas e à prova de falha — medição nunca pode quebrar a página:
 *   1. guarda a origem da visita (first-touch e last-touch, cookie do domínio pai
 *      + localStorage) — `lib/atribuicao.ts`;
 *   2. repassa essa origem aos links que levam ao painel (`app.olliorcamentos.online`),
 *      para o cadastro poder gravá-la — o painel lê a URL e o cookie;
 *   3. com consentimento (banner, `lib/consentimento.ts`): Meta Pixel (PageView e, no
 *      clique de qualquer CTA de cadastro, Lead) e Google tag (page_view + cookie do
 *      gclid). Sem consentimento, só o passo 1 e 2 — a origem é nossa e não sai daqui.
 *
 * Páginas utilitárias (`noindex`: 404, área administrativa, exclusão de conta) ficam
 * de fora — não são funil de aquisição.
 */
import {
	ambienteDoNavegador,
	anexarAtribuicaoAoLink,
	capturarAtribuicao,
	HOST_APP,
} from "../lib/atribuicao";
import { mostrarBannerConsentimento } from "../lib/consentimento";
import { iniciarGoogleTag } from "../lib/googleTag";
import { iniciarPixel, pageView, rastrear } from "../lib/metaPixel";

/** Pixel + Google tag. Cada um só carrega se houver consentimento ("sim"). */
function iniciarTerceiros(): void {
	if (iniciarPixel()) pageView();
	iniciarGoogleTag(true);
}

/** Link de "criar conta" no painel: `/auth/login?modo=cadastro` (com ou sem `&plano=…`). */
function ehCtaDeCadastro(link: HTMLAnchorElement): boolean {
	try {
		const url = new URL(link.href);
		return (
			url.hostname === HOST_APP &&
			url.pathname.startsWith("/auth/login") &&
			url.searchParams.get("modo") === "cadastro"
		);
	} catch {
		return false;
	}
}

function iniciar(): void {
	if (document.querySelector('meta[name="robots"][content*="noindex"]')) return;
	const ambiente = ambienteDoNavegador();
	if (!ambiente) return;

	const atribuicao = capturarAtribuicao(ambiente);

	for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
		const original = link.getAttribute("href") ?? "";
		const novo = anexarAtribuicaoAoLink(link.href, atribuicao);
		if (novo !== link.href && original) link.setAttribute("href", novo);
	}

	iniciarTerceiros();
	mostrarBannerConsentimento(iniciarTerceiros, "/legal/privacidade/");

	document.addEventListener(
		"click",
		(evento) => {
			const alvo = evento.target;
			if (!(alvo instanceof Element)) return;
			const link = alvo.closest("a[href]");
			if (link instanceof HTMLAnchorElement && ehCtaDeCadastro(link)) {
				rastrear("Lead", { content_category: "cadastro", content_name: window.location.pathname });
			}
		},
		{ capture: true },
	);
}

try {
	iniciar();
} catch {
	// Sem medição, a página segue igual.
}
