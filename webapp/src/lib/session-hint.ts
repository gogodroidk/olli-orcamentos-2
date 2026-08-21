/**
 * Indício de sessão compartilhado entre o painel e a landing.
 *
 * IMPORTANTE: este cookie NÃO autentica ninguém e nunca contém JWT, e-mail ou id.
 * Ele serve apenas para a landing saber que vale a pena mandar o navegador para
 * `/entrada`; lá o Supabase confirma a sessão de verdade. Um indício vencido ou
 * adulterado termina no login, sem abrir nenhuma rota protegida.
 */
const COOKIE = "olli_session_hint";
const SETE_DIAS = 7 * 24 * 60 * 60;

function atributosComuns(): string {
	if (typeof window === "undefined") return "";
	const host = window.location.hostname.toLowerCase();
	const dominio = host === "olliorcamentos.online" || host.endsWith(".olliorcamentos.online")
		? "; Domain=.olliorcamentos.online"
		: "";
	const seguro = window.location.protocol === "https:" ? "; Secure" : "";
	return `; Path=/; SameSite=Lax${seguro}${dominio}`;
}

export function marcarIndicioDeSessao(): void {
	if (typeof document === "undefined") return;
	document.cookie = `${COOKIE}=1; Max-Age=${SETE_DIAS}${atributosComuns()}`;
}

export function limparIndicioDeSessao(): void {
	if (typeof document === "undefined") return;
	document.cookie = `${COOKIE}=; Max-Age=0${atributosComuns()}`;
}
