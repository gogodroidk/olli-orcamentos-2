/**
 * BUSCA DE CEP (ViaCEP) — porta do `src/services/cep.ts` do app do celular.
 *
 * Duas regras, e as duas vêm de bugs conhecidos da casa:
 *
 * 1. FALHA DE REDE NÃO TRAVA O CADASTRO. O CEP é uma CONVENIÊNCIA (autofill); o
 *    cliente é cadastrado com ou sem ele. Nada aqui lança, nada aqui bloqueia o
 *    submit — no máximo o usuário digita o endereço à mão, como sempre pôde.
 *
 * 2. "NÃO ACHEI" ≠ "NÃO CONSEGUI PERGUNTAR". São 3 estados, não 2 — é o bug
 *    crônico do projeto (erro virando vazio) aplicado ao CEP: se a rede cai e a
 *    gente disser "CEP não encontrado", o usuário conclui que digitou errado e
 *    fica corrigindo um CEP que está certo. Por isso o retorno é discriminado.
 *
 * ⚠️ CSP: `viacep.com.br` precisa estar em `connect-src` (webapp/public/_headers).
 * Sem isso o navegador bloqueia o fetch em produção e cai sempre em `falhou` —
 * degradação honesta (o cadastro segue manual), mas o autofill nunca funciona.
 */

export interface EnderecoCep {
	logradouro: string;
	bairro: string;
	cidade: string;
	/** UF em 2 letras. */
	uf: string;
}

export type ResultadoCep =
	/** O CEP existe e veio endereço. */
	| { status: "ok"; endereco: EnderecoCep }
	/** O ViaCEP respondeu que este CEP não existe. Aqui, sim, o usuário errou o número. */
	| { status: "nao_encontrado" }
	/** Não deu para perguntar (offline, timeout, CSP, ViaCEP fora do ar). NÃO é culpa do usuário. */
	| { status: "falhou" };

/** Resposta crua do ViaCEP (só os campos que usamos). `erro: true` = CEP inexistente. */
interface RespostaViaCep {
	logradouro?: string;
	bairro?: string;
	localidade?: string;
	uf?: string;
	erro?: boolean | string;
}

/**
 * Consulta um CEP. Aceita com ou sem máscara — só os dígitos importam.
 * Nunca lança: todo caminho de falha vira `{ status: 'falhou' }`.
 */
export async function buscarCep(cepBruto: string): Promise<ResultadoCep> {
	const cep = (cepBruto ?? "").replace(/\D/g, "");
	if (cep.length !== 8) return { status: "falhou" };

	// Timeout defensivo: sem isto, um ViaCEP lento deixaria o campo "buscando…"
	// para sempre e o usuário achando que o formulário travou.
	const controlador = new AbortController();
	const timer = setTimeout(() => controlador.abort(), 5000);

	try {
		const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controlador.signal });
		if (!res.ok) return { status: "falhou" };

		const dados = (await res.json()) as RespostaViaCep | null;
		if (!dados) return { status: "falhou" };
		// O ViaCEP devolve `"erro": "true"` (string) em algumas respostas e `true` em
		// outras. Comparar com `=== true` deixaria o CEP inexistente passar como ok.
		if (dados.erro) return { status: "nao_encontrado" };

		return {
			status: "ok",
			endereco: {
				logradouro: dados.logradouro ?? "",
				bairro: dados.bairro ?? "",
				cidade: dados.localidade ?? "",
				uf: (dados.uf ?? "").toUpperCase().slice(0, 2),
			},
		};
	} catch {
		// offline / abortado / bloqueado pela CSP / JSON inválido → segue manual
		return { status: "falhou" };
	} finally {
		clearTimeout(timer);
	}
}
