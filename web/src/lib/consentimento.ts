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

/**
 * TEXTO DO BANNER E SUA VERSÃO (parecer LEGAL de 07/10/2026, ajuste 1 e 3). O consentimento LGPD tem de ser informado e
 * para finalidade determinada (art. 5º XII, 8º §4º, 9º): o banner antigo falava só em "cookies", mas a Conversions API
 * também manda do servidor o e-mail e o ID da conta em hash, no cadastro e na assinatura. A frase nova diz isso.
 * QUALQUER mudança no texto sobe `VERSAO_TEXTO_BANNER` — a prova do aceite (art. 8º §2º) guarda a versão que a pessoa viu.
 */
export const VERSAO_TEXTO_BANNER = 2;
export const TEXTO_BANNER =
	"Usamos cookies do Meta e do Google para medir nossos anúncios. Se você criar conta ou assinar, avisamos o Meta com o seu e-mail em código (hash). ";

/** Marcador `medicao_anuncios` gravado na conta (user_metadata). */
export interface MedicaoAnunciosMeta {
	versao: number;
	/** "sim" | "nao" | "sem_resposta" — o servidor só manda CAPI com "sim". */
	consentimento: "sim" | "nao" | "sem_resposta";
	/** Prova do aceite/recusa (ISO 8601) e a versão do texto do banner que a pessoa viu. */
	consentimento_em?: string;
	versao_texto?: number;
	/** User agent do navegador: exigido pela Conversions API. Só existe com "sim". */
	ua?: string;
}

/** Estado da medição de anúncios de uma conta. "indisponivel" = não consegui ler (≠ desligada). */
export type EstadoMedicao = "ligada" | "desligada" | "sem_resposta" | "indisponivel";

/**
 * Lê `medicao_anuncios` do user_metadata em 3 estados. `meta === undefined` = a leitura falhou (erro nunca vira
 * "desligada"); objeto sem `medicao_anuncios` = conta anterior à medição ou do app = "sem_resposta".
 */
export function interpretarMedicao(meta: Record<string, unknown> | null | undefined): {
	estado: EstadoMedicao;
	consentimentoEm?: string;
	versaoTexto?: number;
} {
	if (meta === undefined || meta === null) return { estado: "indisponivel" };
	const m = meta.medicao_anuncios;
	if (!m || typeof m !== "object") return { estado: "sem_resposta" };
	const o = m as Record<string, unknown>;
	const base = {
		consentimentoEm: typeof o.consentimento_em === "string" ? o.consentimento_em : undefined,
		versaoTexto: typeof o.versao_texto === "number" ? o.versao_texto : undefined,
	};
	if (o.consentimento === "sim") return { estado: "ligada", ...base };
	if (o.consentimento === "nao") return { estado: "desligada", ...base };
	return { estado: "sem_resposta", ...base };
}

/**
 * Novo `medicao_anuncios` para quando a pessoa liga/desliga (ou aceita/recusa): preserva o que já existe, carimba
 * `consentimento_em` e `versao_texto` e SÓ mantém o user agent com "sim". O banco já exige `consentimento = 'sim'`
 * no momento do envio, então gravar "nao" faz o evento pendente (ex.: a assinatura semanas depois) parar de sair.
 */
export function montarMedicaoAtualizada(
	atual: Record<string, unknown> | null | undefined,
	valor: "sim" | "nao",
	agora: Date,
	userAgent?: string,
): MedicaoAnunciosMeta {
	const base = atual && typeof atual === "object" ? { ...atual } : {};
	const versao = typeof base.versao === "number" ? base.versao : 1;
	const novo: MedicaoAnunciosMeta = {
		...(base as Partial<MedicaoAnunciosMeta>),
		versao,
		consentimento: valor,
		consentimento_em: agora.toISOString(),
		versao_texto: VERSAO_TEXTO_BANNER,
	};
	if (valor === "sim" && userAgent) novo.ua = userAgent.slice(0, 400);
	else delete novo.ua;
	return novo;
}

/**
 * Só `olliorcamentos.online` e subdomínios medem anúncio (Pixel, Google tag, CAPI). Qualquer
 * outro host — `127.0.0.1`/`localhost` do desenvolvimento, `*.pages.dev` de preview, o `.workers.dev`
 * — é ambiente de teste e não pode gerar evento no Pixel nem conversão no Google Ads reais.
 */
export function hostDeProducao(host: string): boolean {
	const h = String(host ?? "").toLowerCase();
	return h === "olliorcamentos.online" || h.endsWith(".olliorcamentos.online");
}

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
	texto.append(TEXTO_BANNER);
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
	document.body.appendChild(banner);

	// No celular o cartão cobria "Criar conta": o toque caía no aviso. A reserva
	// deixa a página rolar, e --olli-consent encolhe a tela de entrada para o
	// formulário caber acima do cartão sem rolar sozinho (isto roda antes do React).
	// O scroll-padding impede que o foco por teclado pare debaixo dele (WCAG 2.4.11).
	const paddingAnterior = document.body.style.paddingBottom;
	const scrollAnterior = document.documentElement.style.scrollPaddingBottom;
	const consentAnterior = document.documentElement.style.getPropertyValue("--olli-consent");
	const reservar = () => {
		const altura = banner.offsetHeight + 24;
		document.body.style.paddingBottom = `${altura}px`;
		document.documentElement.style.scrollPaddingBottom = `${altura}px`;
		document.documentElement.style.setProperty("--olli-consent", `${altura}px`);
	};
	reservar();
	window.addEventListener("resize", reservar);

	const fechar = () => {
		window.removeEventListener("resize", reservar);
		document.body.style.paddingBottom = paddingAnterior;
		document.documentElement.style.scrollPaddingBottom = scrollAnterior;
		if (consentAnterior) document.documentElement.style.setProperty("--olli-consent", consentAnterior);
		else document.documentElement.style.removeProperty("--olli-consent");
		banner.remove();
	};
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
}
