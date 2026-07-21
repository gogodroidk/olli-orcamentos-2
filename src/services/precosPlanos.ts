/**
 * PREÇOS DOS PLANOS — a FONTE ÚNICA de preço DO APP.
 *
 * ═══ POR QUE ESTE ARQUIVO EXISTE (e por que é uma CÓPIA, não um import) ═══
 *
 * A landing tem a mesma fonte em `web/src/data/planos.ts`. Este arquivo é o
 * gêmeo dela para o app — mesmo desenho, mesmos números, MESMA Stripe live. Não
 * importamos de `web/` de propósito: app e site são mundos de build separados
 * (Metro/Expo × Astro) e uma seta de import cruzando a fronteira quebraria os
 * dois bundlers. O preço de manter duas cópias é um `throw` na guarda abaixo se
 * elas divergirem — barato perto de vender um preço que a Stripe não cobra.
 *
 * Até aqui o preço estava cravado à mão dentro de `PlanosScreen.tsx` (`preco:
 * 'R$ 39'`, `precoMensal: 39`, `* 12 * 0.8`…) e repetido em ContaScreen e
 * ContaDesktopScreen. Este projeto já publicou preço errado 5 vezes por alguém
 * escrever de memória. A regra da casa é copy de preço DERIVADA da fonte: errar
 * para menos é prejuízo por venda, errar para mais é propaganda enganosa (CDC
 * art. 37). Então o número mora AQUI, uma vez, e a tela importa daqui.
 *
 * ═══ A UNIDADE É CENTAVO, DE PROPÓSITO ═══
 *
 * Inteiros em CENTAVOS porque é assim que a Stripe guarda (`unit_amount`): a
 * conferência vira um diff visual entre este arquivo e o dashboard, sem
 * conversão mental, e some a classe inteira de bug de float em dinheiro
 * (0.1 + 0.2 !== 0.3). Os `_` nos literais (`3_900`) são só legibilidade.
 *
 * ═══ CONFERIDO CONTRA A STRIPE LIVE EM 2026-07-19 ═══
 *
 * Os cinco Price IDs abaixo batem com `web/src/data/planos.ts` e
 * `worker/wrangler.jsonc`. O `priceId` fica ao lado do valor para a próxima
 * pessoa reconferir em 30 segundos.
 *
 * ⚠ O 12× NÃO É DESCONTO. `parceladoCentavos` do Pro = 46800 = 3900 × 12 exatos:
 * é o valor CHEIO do ano parcelado no cartão (produto avulso `mode=payment` no
 * worker), e sai R$ 93,60 MAIS CARO que o anual à vista. A tela tem de dizer
 * isso, não escondê-lo — quem descobre depois pede reembolso. Só o Pro tem 12×;
 * a Empresa não tem produto avulso na Stripe (`parceladoCentavos: null`).
 */

/** Formata centavos como preço pt-BR. `R$ 39` inteiro, `R$ 374,40` com centavos. */
export function reais(centavos: number): string {
  const temCentavos = centavos % 100 !== 0;
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: temCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Os dois períodos que a tela oferece como aba. O 12× não é período — é uma
 *  forma de pagamento do valor cheio (ver `PRECO_PRO.parcelaCentavos`). */
export type PeriodoCobranca = 'mensal' | 'anual';

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
      mensal: 'price_1TqUOA4zjAI9pGd77ZyOCYcQ',
      anual: 'price_1TqUVb4zjAI9pGd7fGSU4b4v',
      parcelado: 'price_1TqkxK4zjAI9pGd7OMdgMrIE',
    },
  },
  empresa: {
    mensalCentavos: 9_900,
    anualCentavos: 95_040,
    parceladoCentavos: null,
    priceIds: {
      mensal: 'price_1TqUOB4zjAI9pGd7Lj4ETRM6',
      anual: 'price_1TqkxJ4zjAI9pGd7WyiqYhrn',
    },
  },
} satisfies Record<string, PrecoPago>;

/**
 * GUARDA DE COERÊNCIA — roda no IMPORT do módulo, não a cada render.
 *
 * O anual é vendido como "-20%". Se alguém mexer no mensal e esquecer o anual (ou
 * o contrário), a tela estamparia um selo de desconto que não confere com o valor
 * ao lado — e ninguém notaria, porque cada número estaria "certo" isolado. Aqui a
 * incoerência QUEBRA NO IMPORT (falha alta e cedo), fiel ao P0 "erro nunca vira
 * vazio": melhor um crash barulhento do que um preço mentiroso silencioso.
 */
const DESCONTO_ANUAL = 0.2;

for (const [nome, p] of Object.entries(PRECOS)) {
  const esperadoAnual = Math.round(p.mensalCentavos * 12 * (1 - DESCONTO_ANUAL));
  if (p.anualCentavos !== esperadoAnual) {
    throw new Error(
      `[precosPlanos] "${nome}": anual é ${p.anualCentavos} centavos, mas ${p.mensalCentavos} × 12 − 20% = ` +
        `${esperadoAnual}. Ou o selo de "-20%" está errado, ou o preço está. ` +
        `Confira na Stripe (${p.priceIds.anual}) e em web/src/data/planos.ts ANTES de mudar.`,
    );
  }
  if (p.parceladoCentavos !== null && p.parceladoCentavos !== p.mensalCentavos * 12) {
    throw new Error(
      `[precosPlanos] "${nome}": o parcelado é ${p.parceladoCentavos} centavos, mas 12 × mensal = ` +
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
    /**
     * Quanto o 12× custa A MAIS que o anual à vista (positivo = mais caro). É a
     * verdade que a tela precisa dizer: no Pro dá R$ 93,60 a mais. `null` se o
     * plano não tem 12×.
     */
    sobrecusto12xVsAnualCentavos: p.parceladoCentavos === null ? null : p.parceladoCentavos - p.anualCentavos,
  };
}

export const PRECO_PRO = derivar(PRECOS.pro);
export const PRECO_EMPRESA = derivar(PRECOS.empresa);

/** O desconto anual em texto, derivado da constante (nunca "20%" digitado na tela). */
export const DESCONTO_ANUAL_ROTULO = `${Math.round(DESCONTO_ANUAL * 100)}%`;

/**
 * Preço de UM plano no período escolhido, pronto para renderizar.
 * `sufixo` já vem certo para não montar string na tela; `nota` traz o total anual
 * e a economia (ou `null` no mensal).
 */
export function precoNoPeriodo(
  preco: ReturnType<typeof derivar>,
  periodo: PeriodoCobranca,
): { valor: string; sufixo: string; nota: string | null } {
  if (periodo === 'anual') {
    return {
      valor: reais(preco.anualPorMesCentavos),
      sufixo: '/mês',
      nota: `${reais(preco.anualCentavos)} por ano — você economiza ${reais(preco.economiaAnualCentavos)}`,
    };
  }
  return { valor: reais(preco.mensalCentavos), sufixo: '/mês', nota: null };
}
