/**
 * LOJAS PARCEIRAS (Balcão OLLI, D-2711) — a lista das páginas `/loja/<codigo>/`.
 *
 * ESPELHA `LOJAS_PARCEIRAS` de `worker/src/lojasParceiras.js` (aba Lojas do /admin, PR #438): é a mesma lista fechada,
 * escrita nos dois lados porque a landing e o worker não compartilham módulo. Loja nova entra NOS DOIS no mesmo PR;
 * código que só existe aqui dá página sem linha no /admin, código que só existe lá dá cartaz com 404.
 *
 * Código: `lj-` + sigla da região (2 a 4 letras) + 2 dígitos. Nunca nome de pessoa nem nome do dono (D-2503).
 * O nome comercial só aparece AQUI, na página (a especificação diz: "vindo de um cadastro nosso"). Nenhuma loja real
 * entrou ainda: só a de teste, que a página declara como teste.
 */
export const FORMATO_CODIGO_LOJA = /^lj-[a-z]{2,4}-\d{2}$/;

export interface LojaParceira {
	codigo: string;
	/** Nome comercial, como a loja autorizou aparecer. */
	nome: string;
	/** Loja fictícia de QA: a página avisa que é teste e não diz que alguém "indica" a OLLI. */
	teste?: boolean;
	/** `false` = "Esta parceria terminou": a página segue no ar e o botão segue criando conta. */
	ativa: boolean;
}

export const LOJAS: readonly LojaParceira[] = [{ codigo: "lj-tst-00", nome: "Loja de teste (QA)", teste: true, ativa: true }];

const URL_CADASTRO = "https://app.olliorcamentos.online/auth/login";

/**
 * Cadastro do painel com a origem da loja, escrita no próprio href (funciona sem JavaScript e não depende do script de
 * campanha, que não roda em página noindex). É o par que a aba Lojas do /admin lê: `utm_source=loja`,
 * `utm_medium=balcao`, `utm_campaign=<codigo>`.
 */
export function urlCadastroDaLoja(codigo: string): string {
	const url = new URL(URL_CADASTRO);
	url.searchParams.set("modo", "cadastro");
	url.searchParams.set("utm_source", "loja");
	url.searchParams.set("utm_medium", "balcao");
	url.searchParams.set("utm_campaign", codigo);
	return url.toString();
}

for (const loja of LOJAS) {
	if (!FORMATO_CODIGO_LOJA.test(loja.codigo)) {
		throw new Error(`[lojas] código "${loja.codigo}" fora do formato lj-<região>-<2 dígitos>; corrija web/src/data/lojas.ts.`);
	}
}
