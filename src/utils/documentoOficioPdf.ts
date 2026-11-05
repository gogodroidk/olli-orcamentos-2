import { escapeHtml } from './html';
import { DEFAULT_ACCENT } from './pdfGenerator';
import { corMarcaNoPapel } from './coresMarca';

/**
 * documentoOficioPdf.ts — o "papel" comum dos documentos de ofício (comprovante de
 * controle de pragas e certificado de caixa d'água): cor da marca com contraste, CSS e
 * a linha "rótulo: valor". Cada documento continua dono do próprio cabeçalho, corpo e
 * assinatura (utils/certificadoAnvisaPdf.ts e utils/certificadoCaixaDaguaPdf.ts).
 * Documento é papel: sempre claro, independente do tema do app.
 */

/** A cor da marca da empresa, escurecida até ter contraste 4,5:1 no branco. */
export function corDoDocumento(corMarca: string | undefined): string {
  return corMarcaNoPapel(corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT);
}

/** Linha "rótulo: valor" — omite se o valor estiver vazio. */
export function linhaInfo(rotulo: string, valor?: string | null): string {
  const v = (valor ?? '').trim();
  if (!v) return '';
  return `<div class="info-row"><span class="info-label">${escapeHtml(rotulo)}</span><span class="info-value">${escapeHtml(v)}</span></div>`;
}

/** CSS compartilhado pelos documentos de ofício. */
export function cssDocumentoOficio(cor: string): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1B2430; background: #fff; padding: 32px 30px; line-height: 1.5; }
  .topo { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${cor}; padding-bottom: 16px; margin-bottom: 20px; }
  .marca { display: flex; align-items: center; gap: 12px; }
  .marca img { max-height: 54px; max-width: 150px; object-fit: contain; }
  .marca-nome { font-size: 18px; font-weight: 800; color: #0A2540; }
  .marca-esp { font-size: 12px; color: #6B7484; }
  .doc-tit { text-align: right; max-width: 300px; }
  .doc-tit .t { font-size: 13.5px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 0.4px; line-height: 1.3; }
  .doc-tit .n { font-size: 12px; color: #6B7484; margin-top: 4px; }
  h2 { font-size: 11px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; }
  .bloco { border: 1px solid #E7E9EE; border-radius: 10px; padding: 12px 14px; }
  .info-row { display: flex; gap: 8px; font-size: 12.5px; padding: 2px 0; }
  .info-label { color: #6B7484; min-width: 170px; }
  .info-value { color: #1B2430; font-weight: 600; flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px; }
  th { background: ${cor}14; color: #0A2540; text-align: left; padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 10px; border-bottom: 1px solid #EEF0F3; color: #2C3542; }
  .destaque { margin-top: 16px; border: 1px dashed ${cor}; border-radius: 10px; padding: 12px 14px; background: ${cor}0F; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .destaque .lbl { font-size: 11px; font-weight: 800; color: ${cor}; text-transform: uppercase; letter-spacing: 1px; }
  .destaque .val { font-size: 15px; font-weight: 800; color: #0A2540; }
  .texto { margin-top: 14px; font-size: 12.5px; color: #2C3542; }
  .obs { margin-top: 14px; font-size: 12px; color: #3C4756; }
  .assinatura { margin-top: 36px; text-align: center; }
  .assinatura img { max-height: 60px; margin-bottom: 4px; }
  .assinatura .linha-ass { border-top: 1px solid #1B2430; width: 260px; margin: 0 auto; padding-top: 6px; font-size: 12px; }
  .assinatura .rt { font-size: 11px; color: #6B7484; }
  .base-legal { margin-top: 20px; font-size: 10px; color: #9AA3B2; text-align: center; line-height: 1.5; }
`;
}
