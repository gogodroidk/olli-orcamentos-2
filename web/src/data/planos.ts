/**
 * PLANOS E PREÇOS — a FONTE ÚNICA de preço da landing.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * Até aqui o preço estava cravado à mão em SEIS lugares só dentro de `web/`:
 * `index.astro` (array `planos` + 2 respostas de FAQ + a barra de confiança),
 * `layouts/Layout.astro` (os `offers` do JSON-LD), `pages/llms.txt.ts`
 * (`PLANOS_LLM`), `pages/para/[oficio].astro` (2 respostas de FAQ) e o blog.
 * Os comentários dos próprios arquivos já admitiam a dívida — o llms.txt.ts diz,
 * textualmente, "Preço em três lugares é dívida conhecida".
 *
 * Este projeto já publicou preço errado 5 vezes por alguém escrever de memória.
 * A regra da casa (ver `data/oficios.ts`) é copy derivada da FONTE. Preço é a
 * copy mais cara de errar que existe: errar para menos é prejuízo por venda,
 * errar para mais é propaganda enganosa (CDC art. 37). Então o número mora AQUI,
 * uma vez, e todo o resto importa daqui.
 *
 * ═══ A UNIDADE É CENTAVO, DE PROPÓSITO ═══
 *
 * Os valores são inteiros em CENTAVOS porque é exatamente assim que a Stripe
 * guarda (`unit_amount`). Isso deixa a conferência ser um diff visual entre este
 * arquivo e o dashboard da Stripe, sem conversão mental no meio — e elimina a
 * classe inteira de bug de ponto flutuante em dinheiro (0.1 + 0.2 !== 0.3).
 *
 * ═══ CONFERIDO CONTRA A STRIPE LIVE EM 2026-07-19 ═══
 *
 * Os cinco Price IDs abaixo foram LIDOS da API da Stripe (somente leitura) e
 * batem com `worker/wrangler.jsonc`. O `priceId` fica ao lado do valor não por
 * enfeite: é o que permite a próxima pessoa reconferir em 30 segundos.
 *
 * ⚠ O 12× NÃO É DESCONTO. `price_1TqkxK…` = 46800 = 39,00 × 12 exatos. É o valor
 * CHEIO do ano parcelado no cartão (produto avulso, `mode=payment` no
 * `worker/src/stripe.js`), e sai R$ 93,60 MAIS CARO que o anual à vista. A
 * landing tem de dizer isso, não escondê-lo: quem descobre depois pede reembolso
 * e não volta. Só o Pro tem 12× — a Empresa não tem produto avulso na Stripe
 * (ver `suporta12x` em `src/screens/PlanosScreen.tsx`).
 */

/** Formata centavos como preço pt-BR. `R$ 39` inteiro, `R$ 374,40` com centavos. */
export function reais(centavos: number): string {
	const temCentavos = centavos % 100 !== 0;
	return `R$ ${(centavos / 100).toLocaleString("pt-BR", {
		minimumFractionDigits: temCentavos ? 2 : 0,
		maximumFractionDigits: 2,
	})}`;
}

export type PeriodoCobranca = "mensal" | "anual";

/** Um plano pago, com os dois períodos que a Stripe realmente cobra. */
interface PrecoPago {
	/** `unit_amount` do Price mensal na Stripe. */
	mensalCentavos: number;
	/** `unit_amount` do Price anual (assinatura que renova a cada 12 meses). */
	anualCentavos: number;
	/**
	 * `unit_amount` do produto AVULSO parcelável em 12× sem juros, ou `null`
	 * quando o plano não tem um (a Empresa não tem). Valor CHEIO, sem desconto.
	 */
	parceladoCentavos: number | null;
	/** Price IDs da Stripe live — para reconferir sem abrir o worker. */
	priceIds: { mensal: string; anual: string; parcelado?: string };
}

const PRECOS = {
	pro: {
		mensalCentavos: 3_900,
		anualCentavos: 37_440,
		parceladoCentavos: 46_800,
		priceIds: {
			mensal: "price_1TqUOA4zjAI9pGd77ZyOCYcQ",
			anual: "price_1TqUVb4zjAI9pGd7fGSU4b4v",
			parcelado: "price_1TqkxK4zjAI9pGd7OMdgMrIE",
		},
	},
	empresa: {
		mensalCentavos: 9_900,
		anualCentavos: 95_040,
		parceladoCentavos: null,
		priceIds: {
			mensal: "price_1TqUOB4zjAI9pGd7Lj4ETRM6",
			anual: "price_1TqkxJ4zjAI9pGd7WyiqYhrn",
		},
	},
} satisfies Record<string, PrecoPago>;

/**
 * GUARDA DE COERÊNCIA — roda no BUILD, não em runtime.
 *
 * O anual é vendido como "-20%". Se alguém mexer no mensal e esquecer o anual (ou
 * o contrário), a página passaria a estampar um selo de desconto que não confere
 * com o valor ao lado dele — e ninguém notaria, porque os dois números estariam
 * "certos" isoladamente. Aqui a incoerência QUEBRA O BUILD.
 *
 * Mesma lógica do `lastmodPorRota()` no astro.config.mjs: quando o dado não faz
 * sentido, é melhor não ter página do que ter página mentindo.
 */
const DESCONTO_ANUAL = 0.2;

for (const [nome, p] of Object.entries(PRECOS)) {
	const esperadoAnual = Math.round(p.mensalCentavos * 12 * (1 - DESCONTO_ANUAL));
	if (p.anualCentavos !== esperadoAnual) {
		throw new Error(
			`[planos] "${nome}": anual é ${p.anualCentavos} centavos, mas ${p.mensalCentavos} × 12 − 20% = ` +
				`${esperadoAnual}. Ou o selo de "-20%" está errado, ou o preço está. ` +
				`Confira na Stripe (${p.priceIds.anual}) ANTES de mudar este arquivo.`,
		);
	}
	if (p.parceladoCentavos !== null && p.parceladoCentavos !== p.mensalCentavos * 12) {
		throw new Error(
			`[planos] "${nome}": o parcelado é ${p.parceladoCentavos} centavos, mas 12 × mensal = ` +
				`${p.mensalCentavos * 12}. O 12× é o valor CHEIO do ano — se a Stripe mudou, ` +
				`o texto "sem juros" pode ter deixado de ser verdade.`,
		);
	}
}

/** Números já mastigados para a tela, derivados — nunca digitados. */
function derivar(p: PrecoPago) {
	const totalMensalNoAno = p.mensalCentavos * 12;
	return {
		...p,
		/** Preço mensal equivalente de quem paga anual (R$ 31,20 no Pro). */
		anualPorMesCentavos: Math.round(p.anualCentavos / 12),
		/** Quanto o anual economiza contra 12 meses no mensal (R$ 93,60 no Pro). */
		economiaAnualCentavos: totalMensalNoAno - p.anualCentavos,
		/** Só existe se houver produto avulso: a parcela de 1/12 do valor cheio. */
		parcelaCentavos: p.parceladoCentavos === null ? null : Math.round(p.parceladoCentavos / 12),
	};
}

export const PRECO_PRO = derivar(PRECOS.pro);
export const PRECO_EMPRESA = derivar(PRECOS.empresa);

/** O desconto anual em texto, derivado da constante (nunca "20%" digitado na tela). */
export const DESCONTO_ANUAL_ROTULO = `${Math.round(DESCONTO_ANUAL * 100)}%`;

/**
 * Preço de UM plano no período escolhido, pronto para renderizar.
 * `sufixo` já vem no plural certo para não montar string na tela.
 */
export function precoNoPeriodo(
	preco: ReturnType<typeof derivar>,
	periodo: PeriodoCobranca,
): { valor: string; sufixo: string; nota: string | null } {
	if (periodo === "anual") {
		return {
			valor: reais(preco.anualPorMesCentavos),
			sufixo: "/mês",
			nota: `${reais(preco.anualCentavos)} por ano — você economiza ${reais(preco.economiaAnualCentavos)}`,
		};
	}
	return { valor: reais(preco.mensalCentavos), sufixo: "/mês", nota: null };
}
