/**
 * Navegador embutido do Instagram/Facebook (in-app browser).
 *
 * Por quê (T-010, 04/10/2026): ~96% de quem chega pelos anúncios abre a página
 * DENTRO do app do Instagram/Facebook. O Google recusa login OAuth em navegador
 * embutido (erro 403 `disallowed_useragent`), então o botão "Google" — o primeiro
 * da tela — é um beco sem saída ali. Nesse navegador o cadastro por e-mail vem
 * primeiro e o login social vira um convite para abrir o navegador do aparelho.
 */
export type NavegadorInApp = "instagram" | "facebook";

export function detectarNavegadorInApp(ua: string): NavegadorInApp | null {
	if (/Instagram/i.test(ua)) return "instagram";
	if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return "facebook";
	return null;
}

export function navegadorInAppAtual(): NavegadorInApp | null {
	if (typeof navigator === "undefined") return null;
	return detectarNavegadorInApp(navigator.userAgent || "");
}

/**
 * Link que abre a MESMA página no Chrome (Android, via intent). No iPhone não
 * existe jeito confiável de sair do navegador embutido por link: devolve null e a
 * tela ensina o caminho pelo menu (⋯ → Abrir no navegador).
 */
export function linkAbrirNoNavegador(urlAtual: string, ua: string): string | null {
	if (!/Android/i.test(ua)) return null;
	try {
		const u = new URL(urlAtual);
		if (u.protocol !== "https:") return null;
		const fallback = encodeURIComponent(u.toString());
		return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
	} catch {
		return null;
	}
}
