import { qrSvg } from './qrcode';
import { urlEtiqueta } from '../services/equipamentos';

/**
 * etiquetaQrPdf.ts — gera a ETIQUETA física do QR para colar na máquina.
 *
 * O problema é do mundo real, não da tela: o técnico precisa de um adesivo com o
 * QR que, escaneado, abre o histórico do equipamento (a página /q/<token> que o
 * worker serve). Antes o app só mostrava o LINK — dava pra copiar, não pra colar.
 *
 * Decisões que vêm da física da coisa:
 *  - ESCANEABILIDADE: o QR sai a ~34 mm com a quiet zone que o qrSvg já embute —
 *    lê de celular a 10–20 cm. Alto contraste (escuro sobre branco), sempre.
 *  - TOKEN VAZIO: o qrToken nasce vazio e só o backend o preenche (ver
 *    services/equipamentos.ts). Sem token não há etiqueta — quem chama filtra.
 *  - DURABILIDADE: etiqueta em máquina suja/arranha. Por isso vai um código curto
 *    legível (fallback quando o QR não lê) e a dica de plastificar no rodapé.
 *  - IMPRESSÃO: HTML puro, QR inline (SVG, sem rede), A4 com grade de 2 colunas.
 *    Sai pelo mesmo exportarHtmlComoPdf (web: imprimir; nativo: expo-print).
 */

export interface EtiquetaEquip {
  /** Nome/identificação principal (código interno, marca+modelo…). */
  titulo: string;
  /** Linha secundária opcional (localização, patrimônio…). */
  subtitulo?: string;
  /** Token opaco do QR. VAZIO = ainda não sincronizou → não imprima. */
  qrToken: string;
}

export interface OpcoesEtiqueta {
  /** Nome da empresa no rodapé de cada etiqueta (identidade). */
  empresa?: string;
}

/** Escapa texto para HTML (título/local podem ter &, <, aspas…). */
function esc(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string),
  );
}

/** Código curto legível para conferência humana (fallback do QR danificado). */
function codigoCurto(qrToken: string): string {
  return qrToken.slice(-8).toUpperCase();
}

/** Uma etiqueta (QR + identificação). Assume qrToken preenchido. */
function etiquetaHtml(e: EtiquetaEquip, empresa?: string): string {
  const svg = qrSvg(urlEtiqueta(e.qrToken));
  return `<div class="label">
    <div class="qr">${svg}</div>
    <div class="info">
      <div class="titulo">${esc(e.titulo || 'Equipamento')}</div>
      ${e.subtitulo ? `<div class="sub">${esc(e.subtitulo)}</div>` : ''}
      <div class="instr">Aponte a câmera do celular para ver o histórico deste equipamento.</div>
      <div class="cod">Cód. ${esc(codigoCurto(e.qrToken))}</div>
      ${empresa ? `<div class="empresa">${esc(empresa)}</div>` : ''}
    </div>
  </div>`;
}

const CSS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0A2540; }
  .grid { display: flex; flex-wrap: wrap; gap: 6mm; align-content: flex-start; }
  .label {
    width: 86mm; padding: 5mm; display: flex; align-items: center; gap: 5mm;
    border: 1px dashed #94a3b8; border-radius: 3mm;
    break-inside: avoid; page-break-inside: avoid;
  }
  .qr { width: 34mm; height: 34mm; flex: 0 0 auto; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .info { flex: 1 1 auto; min-width: 0; }
  .titulo { font-size: 12pt; font-weight: 700; line-height: 1.15; word-wrap: break-word; }
  .sub { font-size: 8.5pt; color: #475569; margin-top: 1mm; }
  .instr { font-size: 7.5pt; color: #334155; margin-top: 2.5mm; line-height: 1.3; }
  .cod { font-size: 8pt; font-family: 'Courier New', monospace; color: #64748b; margin-top: 2.5mm; letter-spacing: .5px; }
  .empresa { font-size: 7.5pt; color: #0A2540; font-weight: 600; margin-top: 2mm; }
  .rodape { margin-top: 8mm; font-size: 8pt; color: #94a3b8; text-align: center; break-inside: avoid; }
`;

function paginaHtml(labels: string, tituloDoc: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(tituloDoc)}</title><style>${CSS}</style></head><body>` +
    `<div class="grid">${labels}</div>` +
    `<div class="rodape">Dica: cubra a etiqueta com fita transparente ou plastifique para durar no equipamento.</div>` +
    `</body></html>`;
}

/**
 * Etiqueta de UM equipamento. `copias` imprime a mesma etiqueta N vezes (spares —
 * o QR estraga na máquina). Ignora se o token estiver vazio (retorna página vazia,
 * mas o chamador deve barrar antes).
 */
export function montarHtmlEtiqueta(
  e: EtiquetaEquip,
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): string {
  if (!e.qrToken) return paginaHtml('', 'Etiqueta');
  const n = Math.max(1, Math.min(24, Math.floor(opcoes.copias ?? 1)));
  const labels = Array.from({ length: n }, () => etiquetaHtml(e, opcoes.empresa)).join('');
  return paginaHtml(labels, `Etiqueta ${e.titulo}`);
}

/**
 * Folha de etiquetas em LOTE — uma etiqueta por equipamento, em grade. Filtra os
 * que ainda não têm QR (não sincronizados) e devolve a contagem impressa para a
 * tela avisar quantos ficaram de fora.
 */
export function montarHtmlEtiquetasLote(
  equipamentos: EtiquetaEquip[],
  opcoes: OpcoesEtiqueta = {},
): { html: string; impressos: number; ignorados: number } {
  const validos = equipamentos.filter((e) => e.qrToken);
  const labels = validos.map((e) => etiquetaHtml(e, opcoes.empresa)).join('');
  return {
    html: paginaHtml(labels, `Etiquetas de equipamentos (${validos.length})`),
    impressos: validos.length,
    ignorados: equipamentos.length - validos.length,
  };
}
