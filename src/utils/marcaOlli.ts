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
 * CONVITE AO PRESTADOR (estratégia #2, CPO/CMO 26/10): quem recebe o orçamento e
 * TAMBÉM vende serviço. Pergunta que o cliente comum ignora sem custo; vai abaixo do
 * selo, nas MESMAS condições dele (some com `remove_olli_brand`) e nunca no recibo.
 * "grátis e sem cartão" é promessa de plano: `scripts/teste-cta-prestador.ts` trava a
 * frase contra `planosBase.ts` (se o Grátis passar a pedir cartão, o teste quebra).
 */
/**
 * LIGA/DESLIGA do convite (parecer do Dr. Paulo, 26/10): mudar o que o Grátis entrega exige
 * aviso no app + e-mail às contas Grátis com 7+ dias de antecedência (Termos §13; CDC 51 XIII).
 * `null` = DESLIGADO: página, PDF, nota do Grátis e Termos ficam como antes. Data ISO
 * `AAAA-MM-DD` = dia em que entrou no ar (vira o "atualizado em" dos Termos). Ligar = trocar
 * esta constante num PR próprio, na janela de deploy, 7+ dias depois do aviso.
 */
export const CTA_PRESTADOR_NO_AR_EM: string | null = null;

export const TEXTO_CTA_PRESTADOR = 'Você também faz orçamento para seus clientes? Crie o seu, grátis e sem cartão.';
export const TEXTO_LINK_CTA_PRESTADOR = 'Criar o meu orçamento grátis';
/** No PDF não há clique garantido (impresso, visualizador): o endereço vai escrito. */
export const TEXTO_CTA_PRESTADOR_PDF = 'Você também faz orçamento? Crie o seu grátis: olliorcamentos.online';

/** Mesma UTM do selo + `utm_content=cta_prestador`, para medir o convite separado do selo. */
export function urlCtaPrestador(origem: OrigemSeloOlli): string {
  return `${urlSeloOlli(origem)}&utm_content=cta_prestador`;
}

/** Linha do convite na página pública: texto secundário de 13 px, link sublinhado, sem botão. */
export function ctaPrestadorHtml(origem: OrigemSeloOlli, ligado = CTA_PRESTADOR_NO_AR_EM !== null): string {
  if (!ligado) return '';
  return (
    '<p style="margin:10px auto 0;max-width:420px;font-size:13px;line-height:1.45;color:#6B7686;">' +
    `${TEXTO_CTA_PRESTADOR} <a href="${urlCtaPrestador(origem)}" target="_blank" rel="noopener" ` +
    `style="color:#4A5566;text-decoration:underline;">${TEXTO_LINK_CTA_PRESTADOR}</a></p>`
  );
}

/** Linha de texto do convite no PDF (só no Grátis; quem decide é o call site). */
export function ctaPrestadorPdfHtml(ligado = CTA_PRESTADOR_NO_AR_EM !== null): string {
  if (!ligado) return '';
  return `<div style="margin-top:6px;font-size:9.5px;color:#6B7686;">${TEXTO_CTA_PRESTADOR_PDF}</div>`;
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
