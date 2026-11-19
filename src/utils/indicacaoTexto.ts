/**
 * Textos da indicação "colega indica colega" — módulo PURO (sem react-native),
 * para o cartão do app e o teste usarem a mesma fonte.
 *
 * REGRA: a promessa de recompensa só aparece quando o worker diz que está ligada
 * (`meses > 0`, flag INDICACAO_RECOMPENSA_ATIVA). Desligada, o cartão convida sem
 * prometer nada — texto de produto não pode afirmar o que o servidor não paga.
 * Valor e teto NUNCA são digitados aqui: vêm do servidor (que lê limitesComerciais.ts).
 */
import { INDICACAO_TETO_PREMIADAS } from '../services/limitesComerciais.ts';

export const TETO_INDICACOES = INDICACAO_TETO_PREMIADAS;

/** "1 mês de Pro" / "N meses de Pro". */
export function rotuloMeses(n: number): string {
  return n === 1 ? '1 mês de Pro' : `${n} meses de Pro`;
}

/** Linha de apoio do cartão. */
export function textoPromessa(meses: number, teto: number = TETO_INDICACOES, indicadorPaga = false): string {
  if (!(meses > 0)) {
    return 'Mande seu link para um colega que também faz orçamento. Ele testa o OLLI no próprio ritmo.';
  }
  if (indicadorPaga) {
    return `Mande seu link: quando o colega se cadastrar e enviar o 1º orçamento de verdade, ele ganha ${rotuloMeses(meses)}. Como você já paga o Pro, o mês não se soma ao seu plano. Vale até ${teto} indicações premiadas por pessoa; cada colega só pode ser indicado uma vez. O mês de Pro não vale dinheiro e não pode ser transferido.`;
  }
  return `Mande seu link: quando o colega se cadastrar e enviar o 1º orçamento de verdade, vocês dois ganham ${rotuloMeses(meses)}. Vale até ${teto} indicações premiadas por pessoa; cada colega só pode ser indicado uma vez. O mês de Pro não vale dinheiro e não pode ser transferido.`;
}

/** Mensagem pronta de WhatsApp — sai da conta do próprio prestador, 1 a 1. */
export function mensagemWhatsApp(link: string, meses: number, indicadorPaga = false): string {
  const ganho = meses > 0 && indicadorPaga ? ` Quando você enviar o 1º orçamento, você ganha ${rotuloMeses(meses)}.` : meses > 0 ? ` Quando você enviar o 1º orçamento, nós dois ganhamos ${rotuloMeses(meses)}.` : '';
  return `Oi! Uso o OLLI para fazer orçamento rápido pelo celular. Se você também orça, dá uma olhada: ${link}${ganho}`;
}

/**
 * Resumo curto para o rodapé do cartão. Conta só colegas que JÁ ORÇARAM (recompensados):
 * cadastro sozinho é farmável. `null` (não sei) ou zero não viram "0 colegas".
 */
export function textoResumo(r: { recompensadas: number } | null): string | null {
  if (!r || !Number.isFinite(r.recompensadas) || r.recompensadas <= 0) return null;
  return r.recompensadas === 1 ? '1 colega já orçou' : `${r.recompensadas} colegas já orçaram`;
}
