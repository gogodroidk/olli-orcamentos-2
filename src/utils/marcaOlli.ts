/**
 * marcaOlli.ts — a identidade OLLI impressa nos documentos, em módulo PURO.
 *
 * Estas três peças nasceram dentro de `pdfGenerator.ts` e são usadas por toda a
 * família de PDFs (orçamento, recibo, certificado ANVISA, contrato e termos).
 * O problema de morarem lá é que `pdfGenerator` importa `exportarDocumento`,
 * que importa `react-native`: qualquer documento que quisesse só o selo puxava
 * junto a plataforma inteira — e, com ela, a impossibilidade de EXECUTAR o
 * gerador num teste de linha de comando.
 *
 * Aqui não há import nenhum. `pdfGenerator` reexporta os três nomes, então todo
 * call site antigo (`from './pdfGenerator'`) continua válido.
 */

/** Cor de marca padrão dos documentos (azul OLLI). */
export const DEFAULT_ACCENT = '#0B6FCE';

/**
 * Monograma OLLI (marca d'água / selo) na cor pedida.
 * Símbolo oficial (rebrand v3) em versão mono — balão-documento + check.
 */
export function monogramSvg(color: string, size: number, opacity: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" style="opacity:${opacity};">
    <path d="M22 49 L12 59.5 L30 50 Z" fill="${color}"/>
    <rect x="9" y="8" width="46" height="44" rx="14.5" fill="${color}"/>
    <path d="M18 32 l8 9 l20 -19" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/**
 * Rodapé "selo OLLI" (monograma cinza + texto). Um único desenho para toda a
 * família de documentos, em vez de cada um reinventar o próprio rodapé.
 */
export function footerSeloOlliHtml(): string {
  return `${monogramSvg('#C7CDD6', 14, 1)} Gerado com OLLI Orçamentos`;
}
