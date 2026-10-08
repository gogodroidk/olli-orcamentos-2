/**
 * Textos da indicação "colega indica colega" — módulo PURO (sem react-native),
 * para o cartão do app e o teste usarem a mesma fonte.
 *
 * REGRA: a promessa de recompensa só aparece quando o worker diz que está ligada
 * (`creditos > 0`, vindo de INDICACAO_CREDITOS). Desligada, o cartão convida sem
 * prometer nada — texto de produto não pode afirmar o que o servidor não paga.
 */

export const TETO_INDICACOES = 5;

/** Pluraliza "N créditos de IA". */
export function rotuloCreditos(n: number): string {
  return n === 1 ? '1 crédito de IA' : `${n} créditos de IA`;
}

/** Linha de apoio do cartão. */
export function textoPromessa(creditos: number): string {
  if (!(creditos > 0)) {
    return 'Mande seu link para um colega que também faz orçamento. Ele testa o OLLI no próprio ritmo.';
  }
  return `Mande seu link: quando o colega fizer o 1º orçamento de verdade, vocês dois ganham ${rotuloCreditos(creditos)}. Vale até ${TETO_INDICACOES} colegas.`;
}

/** Mensagem pronta de WhatsApp — sai da conta do próprio prestador, 1 a 1. */
export function mensagemWhatsApp(link: string, creditos: number): string {
  const ganho = creditos > 0 ? ` Quando você fizer o 1º orçamento, nós dois ganhamos ${rotuloCreditos(creditos)}.` : '';
  return `Oi! Uso o OLLI para fazer orçamento rápido pelo celular. Se você também orça, dá uma olhada: ${link}${ganho}`;
}

/** Resumo curto para o rodapé do cartão; `null` (não sei) não vira "0 colegas". */
export function textoResumo(r: { cadastraram: number; recompensadas: number } | null): string | null {
  if (!r || !Number.isFinite(r.cadastraram) || r.cadastraram <= 0) return null;
  const c = r.cadastraram === 1 ? '1 colega entrou' : `${r.cadastraram} colegas entraram`;
  if (!(r.recompensadas > 0)) return c;
  return `${c} · ${r.recompensadas === 1 ? '1 já orçou' : `${r.recompensadas} já orçaram`}`;
}
