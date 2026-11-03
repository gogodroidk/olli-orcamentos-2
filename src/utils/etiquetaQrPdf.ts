import { qrSvg } from './qrcode.ts';
import { urlEtiqueta } from './qrEtiqueta.ts';
import { footerSeloOlliHtml } from './marcaOlli.ts';
import { corMarcaNoPapel } from './coresMarca.ts';

/**
 * etiquetaQrPdf.ts — gera a ETIQUETA física do QR para colar na máquina.
 *
 * O problema é do mundo real, não da tela: o técnico precisa de um adesivo com o
 * QR que, escaneado, abre a página do equipamento (/q/<token> no worker). Para o
 * cliente final essa página mostra a marca do prestador, a última manutenção, a
 * próxima recomendada e os botões "Chamar no WhatsApp" e "Pedir orçamento" — a
 * etiqueta VENDE. Para o técnico, o mesmo QR faz o check-in no app.
 *
 * Decisões que vêm da física da coisa:
 *  - ESCANEABILIDADE: o QR nunca sai menor que 24 mm, com a quiet zone que o qrSvg
 *    já embute — lê de celular a 10–20 cm. Alto contraste (escuro sobre branco).
 *  - TAMANHOS de adesivo: pequena (4,2 cm, 4 por linha), média (6 cm, 3 por linha)
 *    e grande (9 × 4,5 cm, 2 por linha — o formato que já existia). Folha A4 com
 *    linha de corte tracejada em volta de cada uma.
 *  - TOKEN VAZIO: o qrToken nasce vazio e só o backend o preenche (ver
 *    services/equipamentos.ts). Sem token não há etiqueta — quem chama filtra.
 *  - DURABILIDADE: código curto legível (fallback quando o QR não lê) e a dica de
 *    plastificar no rodapé.
 *  - MARCA: logo e contato do PRESTADOR (nunca dado do cliente final). O selo
 *    "Feito com OLLI" sai só no Grátis (`removerMarca` = Pro/Empresa), a mesma
 *    regra dos outros documentos (RECURSO_REMOVE_MARCA).
 *  - IMPRESSÃO: HTML puro, QR inline (SVG, sem rede). Sai pelo mesmo
 *    exportarHtmlComoPdf (web: imprimir; nativo: expo-print).
 *
 * Módulo PURO (sem React Native): testado em scripts/teste-qr-equipamento.ts.
 */

export interface EtiquetaEquip {
  /** Nome/identificação principal (código interno, marca+modelo…). */
  titulo: string;
  /** Linha secundária opcional (localização, patrimônio…). */
  subtitulo?: string;
  /** Token opaco do QR. VAZIO = ainda não sincronizou → não imprima. */
  qrToken: string;
}

export type TamanhoEtiqueta = 'pequena' | 'media' | 'grande';

interface MedidaEtiqueta {
  rotulo: string;
  /** Largura do adesivo (mm). */
  larguraMm: number;
  /** Lado do QR (mm). */
  qrMm: number;
  /** horizontal = QR à esquerda e texto à direita; vertical = QR em cima. */
  layout: 'horizontal' | 'vertical';
}

/** Os três adesivos. A largura cabe na área útil do A4 (190 mm) com 5 mm de vão. */
export const TAMANHOS_ETIQUETA: Record<TamanhoEtiqueta, MedidaEtiqueta> = {
  pequena: { rotulo: 'Adesivo pequeno (4,2 cm)', larguraMm: 42, qrMm: 26, layout: 'vertical' },
  media: { rotulo: 'Adesivo médio (6 cm)', larguraMm: 60, qrMm: 34, layout: 'vertical' },
  grande: { rotulo: 'Adesivo grande (9 × 4,5 cm)', larguraMm: 90, qrMm: 36, layout: 'horizontal' },
};

export const TAMANHO_ETIQUETA_PADRAO: TamanhoEtiqueta = 'grande';

export interface OpcoesEtiqueta {
  /** Nome da empresa (identidade do prestador). */
  empresa?: string;
  /** Logo do prestador como data URI de imagem (png/jpeg/webp). Outra coisa é ignorada. */
  logoDataUri?: string | null;
  /** Telefone/WhatsApp do prestador, já formatado para leitura humana. */
  contato?: string;
  /** Cor da marca (#RGB/#RRGGBB). Inválida → azul OLLI. */
  corMarca?: string;
  tamanho?: TamanhoEtiqueta;
  /** true (Pro/Empresa) tira o selo "Feito com OLLI" da folha. */
  removerMarca?: boolean;
}

/** Escapa texto para HTML (título/local podem ter &, <, aspas…). */
function esc(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string),
  );
}

/** Só aceita data URI de imagem raster (nada de SVG/HTML/URL remota no src). */
export function logoSegura(uri?: string | null): string | null {
  if (!uri) return null;
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : null;
}

/** Código curto legível para conferência humana (fallback do QR danificado). */
export function codigoCurto(qrToken: string): string {
  return qrToken.slice(-8).toUpperCase();
}

/** Uma etiqueta (QR + identificação + chamada). Assume qrToken preenchido. */
function etiquetaHtml(e: EtiquetaEquip, o: OpcoesEtiqueta): string {
  const medida = TAMANHOS_ETIQUETA[o.tamanho ?? TAMANHO_ETIQUETA_PADRAO];
  const svg = qrSvg(urlEtiqueta(e.qrToken));
  const logo = logoSegura(o.logoDataUri);
  const marca = logo
    ? `<img class="logo" src="${logo}" alt="" />`
    : o.empresa ? `<div class="empresa-nome">${esc(o.empresa)}</div>` : '';
  const pequena = medida.larguraMm < 50;
  const chamada = pequena
    ? 'Escaneie: manutenção e orçamento'
    : 'Escaneie para ver a última manutenção e pedir orçamento';
  return `<div class="label ${medida.layout}" style="width:${medida.larguraMm}mm">
    <div class="qr" style="width:${medida.qrMm}mm;height:${medida.qrMm}mm">${svg}</div>
    <div class="info">
      ${marca}
      <div class="titulo">${esc(e.titulo || 'Equipamento')}</div>
      ${e.subtitulo && !pequena ? `<div class="sub">${esc(e.subtitulo)}</div>` : ''}
      <div class="instr">${chamada}</div>
      ${o.contato ? `<div class="contato">${esc(o.contato)}</div>` : ''}
      <div class="cod">Cód. ${esc(codigoCurto(e.qrToken))}</div>
    </div>
  </div>`;
}

function css(cor: string): string {
  return `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0A2540; }
  .grid { display: flex; flex-wrap: wrap; gap: 5mm; align-content: flex-start; }
  .label {
    padding: 3.5mm; display: flex; gap: 3.5mm;
    border: 1px dashed #94a3b8; border-radius: 3mm; border-top: 1.2mm solid ${cor};
    break-inside: avoid; page-break-inside: avoid; background: #fff;
  }
  .label.horizontal { flex-direction: row; align-items: center; }
  .label.vertical { flex-direction: column; align-items: center; text-align: center; }
  .qr { flex: 0 0 auto; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .info { flex: 1 1 auto; min-width: 0; }
  .logo { max-height: 9mm; max-width: 100%; object-fit: contain; display: block; margin-bottom: 1.2mm; }
  .vertical .logo { margin: 0 auto 1.2mm; }
  .empresa-nome { font-size: 8pt; font-weight: 800; color: ${cor}; margin-bottom: 1mm; }
  .titulo { font-size: 10.5pt; font-weight: 700; line-height: 1.15; word-wrap: break-word; }
  .sub { font-size: 7.5pt; color: #475569; margin-top: 0.8mm; }
  .instr { font-size: 7pt; color: #334155; margin-top: 1.5mm; line-height: 1.3; font-weight: 600; }
  .contato { font-size: 8pt; font-weight: 800; color: ${cor}; margin-top: 1.2mm; }
  .cod { font-size: 7pt; font-family: 'Courier New', monospace; color: #64748b; margin-top: 1.2mm; letter-spacing: .5px; }
  .rodape { margin-top: 8mm; font-size: 8pt; color: #94a3b8; text-align: center; break-inside: avoid; }
  .selo { margin-top: 2mm; font-size: 7.5pt; color: #9AA3B2; text-align: center; }
  .selo svg { vertical-align: middle; }
`;
}

function paginaHtml(labels: string, tituloDoc: string, o: OpcoesEtiqueta): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(tituloDoc)}</title><style>${css(corMarcaNoPapel(o.corMarca))}</style></head><body>` +
    `<div class="grid">${labels}</div>` +
    `<div class="rodape">Recorte na linha tracejada. Dica: cubra a etiqueta com fita transparente ou plastifique para durar no equipamento.</div>` +
    (o.removerMarca ? '' : `<div class="selo">${footerSeloOlliHtml()}</div>`) +
    `</body></html>`;
}

/** Quantas etiquetas do tamanho cabem numa linha da folha (para a tela sugerir cópias). */
export function etiquetasPorLinha(tamanho: TamanhoEtiqueta): number {
  const util = 190; // A4 (210 mm) menos 10 mm de margem de cada lado
  const vao = 5;
  return Math.max(1, Math.floor((util + vao) / (TAMANHOS_ETIQUETA[tamanho].larguraMm + vao)));
}

/**
 * Etiqueta de UM equipamento. `copias` imprime a mesma etiqueta N vezes (spares —
 * o QR estraga na máquina). Token vazio → página sem etiqueta (o chamador deve
 * barrar antes).
 */
export function montarHtmlEtiqueta(
  e: EtiquetaEquip,
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): string {
  if (!e.qrToken) return paginaHtml('', 'Etiqueta', opcoes);
  const n = Math.max(1, Math.min(40, Math.floor(opcoes.copias ?? 1)));
  const labels = Array.from({ length: n }, () => etiquetaHtml(e, opcoes)).join('');
  return paginaHtml(labels, `Etiqueta ${e.titulo}`, opcoes);
}

/**
 * Folha de etiquetas em LOTE — `copias` de cada equipamento, em grade. Filtra os
 * que ainda não têm QR (não sincronizados) e devolve a contagem impressa para a
 * tela avisar quantos ficaram de fora.
 */
export function montarHtmlEtiquetasLote(
  equipamentos: EtiquetaEquip[],
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): { html: string; impressos: number; ignorados: number } {
  const validos = equipamentos.filter((e) => e.qrToken);
  const n = Math.max(1, Math.min(10, Math.floor(opcoes.copias ?? 1)));
  const labels = validos.map((e) => Array.from({ length: n }, () => etiquetaHtml(e, opcoes)).join('')).join('');
  return {
    html: paginaHtml(labels, `Etiquetas de equipamentos (${validos.length})`, opcoes),
    impressos: validos.length,
    ignorados: equipamentos.length - validos.length,
  };
}
