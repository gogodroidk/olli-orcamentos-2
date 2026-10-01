/**
 * PRIORIDADE DE FOLLOW-UP — qual proposta parada merece o próximo toque.
 *
 * O radar (`services/radarFollowUp.ts`) lista do mais parado para o menos parado,
 * e o botão de 1 toque do Hoje agia no primeiro da lista: na prática, no lead mais
 * frio (uma proposta de 97 dias, praticamente perdida), enquanto as de 3 a 14
 * dias, que são as que ainda fecham, ficavam para depois.
 *
 * Prioridade = valor da proposta × peso da recência:
 *   - até 14 dias parada: peso 1 (ainda quente);
 *   - de 15 a 30 dias: peso 0,5;
 *   - mais de 30 dias: peso 0,2 (fria, mas não some).
 * Empate: a de maior valor; depois a mais recente. Puro (sem banco, sem relógio).
 */

export interface ItemComPrioridade {
  orcamento: { valorTotal: number };
  diasParado: number;
}

/** Peso da recência para uma proposta parada há `diasParado` dias. */
export function pesoRecenciaFollowUp(diasParado: number): number {
  if (diasParado <= 14) return 1;
  if (diasParado <= 30) return 0.5;
  return 0.2;
}

/** valor × peso da recência. Valor ausente ou inválido conta como 0. */
export function prioridadeFollowUp(item: ItemComPrioridade): number {
  const valor = Number.isFinite(item.orcamento.valorTotal) ? Math.max(0, item.orcamento.valorTotal) : 0;
  return valor * pesoRecenciaFollowUp(item.diasParado);
}

/** O item de MAIOR prioridade da lista (não importa a ordem recebida), ou `null` se vazia. */
export function maisPrioritarioFollowUp<T extends ItemComPrioridade>(itens: readonly T[]): T | null {
  let melhor: T | null = null;
  let melhorP = Number.NEGATIVE_INFINITY;
  for (const item of itens) {
    const p = prioridadeFollowUp(item);
    if (
      melhor === null ||
      p > melhorP ||
      (p === melhorP && item.orcamento.valorTotal > melhor.orcamento.valorTotal) ||
      (p === melhorP && item.orcamento.valorTotal === melhor.orcamento.valorTotal && item.diasParado < melhor.diasParado)
    ) {
      melhor = item;
      melhorP = p;
    }
  }
  return melhor;
}
