import { Recibo, Empresa, ModeloReciboId } from '../types';
import { formatCurrency } from './currency';
import { formatDateTime } from './date';
import { imagemParaDataUri } from './imagemDataUri';
import { escapeHtml, safeHexColor } from './html';
import { footerSeloOlliHtml, DEFAULT_ACCENT } from './pdfGenerator';
import { ajustarParaContraste } from '../theme/cores';

/** Normaliza para #RRGGBB — `safeHexColor` aceita 3 dígitos, e `${cor}0F` (o tint
 *  do PIX) só é CSS válido com 6 dígitos (#RRGGBBAA). Sem isso o fundo do PIX some. */
function hex6(cor: string): string {
  return /^#[0-9a-fA-F]{3}$/.test(cor)
    ? '#' + cor.slice(1).split('').map(c => c + c).join('')
    : cor;
}

/** Só os ids conhecidos podem virar classe no body — um `modeloReciboPadrao`
 *  adulterado (escrito direto na API, fora da UI) não pode injetar atributos no
 *  <body> via `recibo-${modelo}`. Ver revisão adversarial (xss_pdf). */
function modeloSeguro(m?: ModeloReciboId): ModeloReciboId {
  return m === 'compacto' || m === 'faixa' ? m : 'classico';
}

/**
 * HTML do recibo (documento entregue ao cliente). Extraído da tela para poder ser
 * PRÉ-VISUALIZADO em "Modelos de documento" e reusado, e agora:
 *  - segue a COR DE MARCA (antes era `#0B6FCE` cravado — não seguia a marca);
 *  - tem 3 modelos (classico/compacto/faixa) via classe no body, como o orçamento.
 *
 * O documento é SEMPRE claro (é papel; não segue o tema do app — mesma regra do
 * pdfGenerator). O `valor-box` usa gradiente da marca até o navy `#0A2547`, o
 * mesmo truque do modelo "bold" do orçamento: a ponta escura garante que o texto
 * branco fica legível mesmo com uma marca clara.
 */
export async function montarHtmlRecibo(
  r: Recibo,
  empresa: Empresa,
  opts?: { modelo?: ModeloReciboId; corMarca?: string },
): Promise<string> {
  const modelo = modeloSeguro(opts?.modelo);
  // Escurece a marca até TEXTO BRANCO passar 4.5:1 sobre ela. Isso resolve os dois
  // usos de uma vez: (a) a cor como texto sobre o papel branco fica legível, e
  // (b) o branco sobre a ponta CLARA do gradiente do valor-box/faixa também — antes
  // uma marca clara (ex. Ciano) deixava o "Valor recebido" ilegível (~1.8:1).
  const cor = ajustarParaContraste(hex6(safeHexColor(opts?.corMarca ?? empresa.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT)), '#FFFFFF', 4.5);

  // Converte as imagens em data URI ANTES de montar o HTML. Em qualquer falha a
  // conversão devolve null e a imagem é omitida — nunca quebra o documento.
  const [logoData, assinaturaData] = await Promise.all([
    imagemParaDataUri(empresa.logoUri),
    imagemParaDataUri(r.assinaturaPrestadorUri ?? empresa.assinaturaUri),
  ]);

  // Campos de string livre do usuário escapados (XSS / quebra de layout).
  const empresaNome = escapeHtml(empresa.nome);
  const empresaEspecialidade = escapeHtml(empresa.especialidade);
  const empresaCnpj = escapeHtml(empresa.cnpj);
  const empresaTelefone = escapeHtml(empresa.telefone);
  const empresaPrestador = escapeHtml(empresa.nomePrestador);
  const empresaPix = escapeHtml(empresa.chavePix);
  const clienteNomeHtml = escapeHtml(r.clienteNome);
  const clienteTelefoneHtml = escapeHtml(r.clienteTelefone);
  const dataRecebimentoHtml = escapeHtml(r.dataRecebimento);
  const formaPagamentoHtml = escapeHtml(r.formaPagamento);
  const orcamentoNumeroHtml = escapeHtml(r.orcamentoNumero);
  const numeroHtml = escapeHtml(r.numero);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #212121; margin: 0; }
  .page { padding: 32px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${cor}; padding-bottom: 16px; margin-bottom: 20px; }
  .brand-logo { max-height: 56px; max-width: 200px; margin-bottom: 8px; display: block; }
  .empresa-nome { font-size: 20px; font-weight: 700; color: ${cor}; }
  .empresa-info { font-size: 12px; color: #555; line-height: 1.6; }
  .recibo-title { font-size: 28px; font-weight: 800; text-align: center; color: ${cor}; margin: 24px 0 16px; letter-spacing: 4px; }
  .recibo-num { text-align: center; font-size: 14px; color: #555; margin-bottom: 24px; }
  .info-box { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #777; font-size: 12px; }
  .info-value { font-weight: 600; font-size: 13px; }
  .valor-box { background: linear-gradient(135deg, ${cor}, #0A2547); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
  .valor-label { font-size: 12px; opacity: 0.85; }
  .valor-num { font-size: 32px; font-weight: 800; margin-top: 4px; }
  .pix-box { border: 1px dashed ${cor}; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; background: ${cor}0F; }
  .pix-label { color: ${cor}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .pix-key { font-size: 14px; font-weight: 600; margin-top: 4px; word-break: break-all; }
  .assinatura-row { display: flex; justify-content: space-between; margin-top: 48px; }
  .assinatura-block { text-align: center; min-width: 200px; }
  .sign-img { max-height: 56px; max-width: 200px; display: block; margin: 0 auto -6px; }
  .assinatura-line { border-top: 1px solid #ccc; padding-top: 8px; font-size: 12px; color: #555; margin-top: 40px; }
  .footer { border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 24px; font-size: 11px; color: #888; text-align: center; }
  .footer-seal { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10.5px; color: #B0B7C2; font-weight: 600; margin-top: 8px; }

  /* COMPACTO — folha menor, espaçamentos reduzidos */
  .recibo-compacto .page { padding: 24px; }
  .recibo-compacto .recibo-title { font-size: 22px; letter-spacing: 3px; margin: 16px 0 10px; }
  .recibo-compacto .recibo-num { margin-bottom: 16px; }
  .recibo-compacto .info-box { padding: 12px; margin-bottom: 12px; }
  .recibo-compacto .valor-box { padding: 14px; margin: 14px 0; }
  .recibo-compacto .valor-num { font-size: 26px; }
  .recibo-compacto .assinatura-row { margin-top: 32px; }

  /* FAIXA — banner de marca no topo, ocupando a largura da folha */
  .recibo-faixa .header { background: linear-gradient(135deg, ${cor}, #0A2547); border: none; border-radius: 0; margin: -32px -32px 22px; padding: 26px 32px; }
  .recibo-faixa .header .empresa-nome { color: #fff; }
  .recibo-faixa .header .empresa-info { color: rgba(255,255,255,0.85); }
</style>
</head>
<body class="recibo-${modelo}">
<div class="page">
  <div class="header">
    <div>
      ${logoData ? `<img src="${escapeHtml(logoData)}" class="brand-logo" />` : ''}
      <div class="empresa-nome">${empresaNome}</div>
      <div class="empresa-info">${empresaEspecialidade}<br/>CNPJ: ${empresaCnpj}<br/>${empresaTelefone}</div>
    </div>
    <div class="empresa-info" style="text-align:right">Documento gerado em<br/>${formatDateTime(r.criadoEm)}</div>
  </div>

  <div class="recibo-title">RECIBO</div>
  <div class="recibo-num">Nº ${numeroHtml}</div>

  <div class="info-box">
    <div class="info-row"><span class="info-label">Cliente</span><span class="info-value">${clienteNomeHtml}</span></div>
    <div class="info-row"><span class="info-label">Telefone</span><span class="info-value">${clienteTelefoneHtml}</span></div>
    <div class="info-row"><span class="info-label">Data do recebimento</span><span class="info-value">${dataRecebimentoHtml}</span></div>
    <div class="info-row"><span class="info-label">Forma de pagamento</span><span class="info-value">${formaPagamentoHtml}</span></div>
    ${r.orcamentoNumero ? `<div class="info-row"><span class="info-label">Referente ao orçamento</span><span class="info-value">Nº ${orcamentoNumeroHtml}</span></div>` : ''}
  </div>

  <div class="valor-box">
    <div class="valor-label">Valor recebido</div>
    <div class="valor-num">${formatCurrency(r.valorRecebido)}</div>
  </div>

  ${empresa.chavePix ? `<div class="pix-box">
    <div class="pix-label">PIX</div>
    <div class="pix-key">${empresaPix}</div>
  </div>` : ''}

  <p style="font-size:13px;color:#444;text-align:center;">
    Recebi de <strong>${clienteNomeHtml}</strong> a importância de <strong>${formatCurrency(r.valorRecebido)}</strong>
    referente aos serviços prestados pela <strong>${empresaNome}</strong>.
    Emitido em ${dataRecebimentoHtml}.
  </p>

  <div class="assinatura-row">
    <div class="assinatura-block">
      ${assinaturaData ? `<img src="${escapeHtml(assinaturaData)}" class="sign-img" />` : ''}
      <div class="assinatura-line">
        <strong>${empresaPrestador}</strong><br/>
        ${empresaNome}<br/>
        CNPJ: ${empresaCnpj}
      </div>
    </div>
    <div class="assinatura-block">
      <div class="assinatura-line">
        <strong>${clienteNomeHtml}</strong><br/>
        Cliente
      </div>
    </div>
  </div>

  <div class="footer">${empresaNome} · CNPJ: ${empresaCnpj} · ${empresaTelefone}</div>
  <div class="footer-seal">${footerSeloOlliHtml()}</div>
</div>
</body>
</html>`;
}
