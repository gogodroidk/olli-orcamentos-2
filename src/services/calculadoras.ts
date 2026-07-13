/**
 * calculadoras.ts — as calculadoras EMBUTIDAS no item do orçamento (F1 da
 * estratégia, diferencial #3). Funções puras, sem estado nem I/O: a conta acontece
 * DENTRO do item (o pintor não sai pro site da Suvinil; o marceneiro não abre a
 * planilha) e o resultado já vira quantidade/preço.
 */

export interface ResultadoTinta {
  /** Área total pintada (m²) = área × demãos. */
  areaTotalM2: number;
  /** Litros de tinta necessários (arredondado p/ 0,1 L). */
  litros: number;
  /** Sugestão de embalagem: latas de 18 L. */
  latas18: number;
  /** + galões de 3,6 L para completar. */
  galoes36: number;
}

/**
 * Tinta: dada a área (m²), o nº de demãos e o rendimento (m²/L por demão), devolve
 * os litros e uma sugestão de embalagem. Rendimento típico de acrílica ~10 m²/L por
 * demão (varia por marca/superfície) — o usuário ajusta. Nunca lança; entrada
 * inválida vira 0.
 */
export function calcularTinta(areaM2: number, demaos = 2, rendimentoM2PorLitro = 10): ResultadoTinta {
  const area = Math.max(0, Number(areaM2) || 0);
  const d = Math.max(1, Math.round(Number(demaos) || 1));
  const rend = Math.max(0.1, Number(rendimentoM2PorLitro) || 10);
  const areaTotalM2 = Math.round(area * d * 100) / 100;
  const litros = Math.ceil((areaTotalM2 / rend) * 10) / 10;
  const latas18 = Math.floor(litros / 18);
  const resto = litros - latas18 * 18;
  const galoes36 = resto > 0 ? Math.ceil(resto / 3.6) : 0;
  return { areaTotalM2, litros, latas18, galoes36 };
}

/** Frase pronta para a descrição do item (ex.: "36 m² · 2 demãos → 7,2 L (1 galão)"). */
export function resumoTinta(r: ResultadoTinta): string {
  const emb: string[] = [];
  if (r.latas18) emb.push(`${r.latas18} lata${r.latas18 > 1 ? 's' : ''} de 18 L`);
  if (r.galoes36) emb.push(`${r.galoes36} galão${r.galoes36 > 1 ? 'es' : ''} de 3,6 L`);
  const litrosTxt = r.litros.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  return `${litrosTxt} L${emb.length ? ` (${emb.join(' + ')})` : ''}`;
}

/**
 * Marcenaria/serralheria: preço por metro linear. Devolve o total (2 casas).
 * Nunca lança.
 */
export function calcularMetroLinear(metros: number, precoPorMetro: number): number {
  const m = Math.max(0, Number(metros) || 0);
  const p = Math.max(0, Number(precoPorMetro) || 0);
  return Math.round(m * p * 100) / 100;
}
