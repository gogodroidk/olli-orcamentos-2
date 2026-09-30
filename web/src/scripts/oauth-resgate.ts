/**
 * Rede de segurança do login social: quando o `redirectTo` pedido pelo painel não
 * está na allowlist do Supabase, o GoTrue entrega o `?code=` (ou o `?error=`) no
 * Site URL — esta landing. Entre 16 e 25/09/2026 isso deixou 13 contas criadas e
 * sem sessão: o code morria aqui, sem nenhuma mensagem. Agora a landing repassa
 * SÓ os parâmetros do OAuth para a tela de login do painel, que troca o code (o
 * code_verifier do PKCE está no localStorage do painel) ou mostra o erro em pt-BR.
 *
 * Destino fixo (sem open redirect) e só parâmetros conhecidos. Função pura — o
 * teste roda em node (scripts/teste-oauth-retorno.ts).
 */
export const DESTINO_RETORNO_OAUTH = "https://app.olliorcamentos.online/auth/login";

const CODIGO_OAUTH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARAMETROS_ERRO = ["error", "error_code", "error_description"] as const;

export function destinoResgateOAuth(search: string, hash: string): string | null {
	const query = new URLSearchParams(search);
	const fragmento = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
	const repassar = new URLSearchParams();

	// O code do GoTrue é um UUID; qualquer outro `?code=` (campanha, etc.) fica.
	const codigo = query.get("code");
	if (codigo && CODIGO_OAUTH.test(codigo)) repassar.set("code", codigo);

	for (const chave of PARAMETROS_ERRO) {
		const valor = (query.get(chave) ?? fragmento.get(chave) ?? "").slice(0, 300);
		if (valor) repassar.set(chave, valor);
	}
	if (!repassar.has("code") && !repassar.has("error") && !repassar.has("error_code")) return null;
	return `${DESTINO_RETORNO_OAUTH}?${repassar.toString()}`;
}
