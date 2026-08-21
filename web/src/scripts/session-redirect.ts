/**
 * A landing e o painel vivem em origins diferentes, então a landing não pode
 * (nem deve) ler o localStorage do Supabase. O painel grava apenas um indício
 * booleano no domínio pai; `/entrada` confirma a sessão real antes de abrir.
 */
const parametros = new URLSearchParams(window.location.search);
const querVerSite = parametros.get("site") === "1";
const temIndicio = document.cookie
	.split(";")
	.some((parte) => parte.trim() === "olli_session_hint=1");

if (!querVerSite && temIndicio) {
	window.location.replace("https://app.olliorcamentos.online/entrada?origem=site");
}
