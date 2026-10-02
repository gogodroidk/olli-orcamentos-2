/**
 * marcaOlli.ts — a identidade OLLI impressa nos documentos, em módulo PURO.
 *
 * Estas peças nasceram dentro de `pdfGenerator.ts` e são usadas por toda a
 * família de PDFs (orçamento, recibo, certificado ANVISA, contrato e termos) e,
 * desde 01/10/2026, também pela página pública do orçamento (`worker/src/link.js`).
 * O problema de morarem lá é que `pdfGenerator` importa `exportarDocumento`,
 * que importa `react-native`: qualquer documento que quisesse só o selo puxava
 * junto a plataforma inteira — e, com ela, a impossibilidade de EXECUTAR o
 * gerador num teste de linha de comando (ou de importá-lo no worker).
 *
 * Aqui não há import nenhum. `pdfGenerator` reexporta os nomes antigos, então
 * todo call site antigo (`from './pdfGenerator'`) continua válido.
 *
 * ═══ O SELO "FEITO COM OLLI" (Grátis ilimitado, 01/10/2026) ═══
 * O Grátis não tem mais cota de orçamentos: o que ele "paga" é este selo discreto
 * no PDF, no recibo e no link /o/<token>. Cada orçamento enviado vira um convite
 * para o cliente final conhecer o OLLI — por isso o selo é um LINK para a landing,
 * com UTM que diz de qual documento veio. Pro e Empresa não levam selo
 * (entitlement `remove_olli_brand`); quem decide é o call site, nunca este módulo.
 */

/** Cor de marca padrão dos documentos (azul OLLI). */
export const DEFAULT_ACCENT = '#0B6FCE';

/** O texto do selo. Fonte única: app, painel, landing e worker leem daqui. */
export const TEXTO_SELO_OLLI = 'Feito com OLLI';

/** A landing pública (raiz do domínio — worker `olli-site`). */
export const URL_LANDING_OLLI = 'https://olliorcamentos.online';

/** De onde o clique no selo veio — vira o `utm_source` (lido no analytics da landing). */
export type OrigemSeloOlli =
  | 'pdf_orcamento'
  | 'recibo'
  | 'link_orcamento'
  | 'documento';

/**
 * URL do selo com UTM. `utm_medium=selo` separa este canal de qualquer outro
 * rodapé, e `utm_campaign=feito_com_olli` é a mesma campanha nas três origens
 * para o funil somar o canal inteiro.
 */
export function urlSeloOlli(origem: OrigemSeloOlli): string {
  return `${URL_LANDING_OLLI}/?utm_source=${origem}&utm_medium=selo&utm_campaign=feito_com_olli`;
}

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
 * O selo "Feito com OLLI" — monograma cinza + texto, clicável, com estilo INLINE
 * (vale igual no PDF do expo-print, na impressão do painel e na página pública,
 * sem depender do CSS de cada documento). Discreto de propósito: cinza claro,
 * 10 px, nada que dispute atenção com a marca do prestador.
 */
export function seloOlliHtml(origem: OrigemSeloOlli): string {
  return (
    `<a href="${urlSeloOlli(origem)}" target="_blank" rel="noopener" ` +
    'style="display:inline-flex;align-items:center;gap:5px;color:#9AA3B2;text-decoration:none;' +
    'font-size:10px;font-weight:600;letter-spacing:.2px;line-height:1;">' +
    `${monogramSvg('#B8C0CC', 13, 1)}<span>Feito com <span style="color:#6B7686;font-weight:800;">OLLI</span></span></a>`
  );
}

/**
 * Rodapé "selo OLLI" da família de documentos (recibo, certificados, contrato,
 * termos). Um único desenho para todos, em vez de cada um reinventar o próprio.
 * `origem` só muda o UTM.
 */
export function footerSeloOlliHtml(origem: OrigemSeloOlli = 'documento'): string {
  return seloOlliHtml(origem);
}
