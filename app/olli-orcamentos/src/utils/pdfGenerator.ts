import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Orcamento, Empresa, Depoimento, ItemOrcamento } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDateTime, formatDateBR } from './date';

/* ─── Cache de imagens em base64 ──────────────────────────────────
 * URIs locais (file://) NÃO renderizam no expo-print do Android.
 * Convertemos cada imagem para data URI base64 antes de montar o HTML.
 */
let IMG_CACHE: Record<string, string> = {};

function img(uri?: string): string {
  if (!uri) return '';
  return IMG_CACHE[uri] || (uri.startsWith('data:') ? uri : '');
}

async function toDataUri(uri?: string): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) return uri;
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

async function populateImages(o: Orcamento, empresa: Empresa): Promise<void> {
  IMG_CACHE = {};
  const uris = new Set<string>();
  [empresa.logoUri, empresa.assinaturaUri, o.assinaturaPrestadorUri, o.assinaturaClienteUri]
    .forEach(u => u && uris.add(u));
  o.itens.forEach(i => i.fotoUri && uris.add(i.fotoUri));
  (o.fotosServico ?? []).forEach(f => f && uris.add(f));
  await Promise.all([...uris].map(async u => {
    const d = await toDataUri(u);
    if (d) IMG_CACHE[u] = d;
  }));
}

/** Remove caracteres inválidos para nome de arquivo. */
function safeFileName(s: string): string {
  return s.normalize('NFD')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'cliente';
}

function renderStars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderFotos(o: Orcamento): string {
  const fotos = (o.fotosServico ?? []).map(f => img(f)).filter(Boolean);
  if (fotos.length === 0) return '';
  return `
    <div class="section-block">
      <div class="section-label">Registro fotográfico</div>
      <div class="fotos-grid">
        ${fotos.map(src => `<img src="${src}" class="foto-item" />`).join('')}
      </div>
    </div>
  `;
}

function renderItens(itens: ItemOrcamento[], tipo: 'servico' | 'produto'): string {
  const filtrados = itens.filter(i => i.tipo === tipo);
  if (filtrados.length === 0) return '';

  const titulo = tipo === 'servico' ? 'Serviços' : 'Produtos, peças e materiais';
  const rows = filtrados.map(item => `
    <tr class="item-row">
      <td class="item-name">
        ${img(item.fotoUri) ? `<img src="${img(item.fotoUri)}" class="item-thumb" />` : ''}
        <div>
          <strong>${item.nome}</strong>
          ${item.descricao ? `<br/><span class="item-desc">${item.descricao}</span>` : ''}
        </div>
      </td>
      <td class="text-right">
        <span class="label-small">Valor por ${item.unidade}</span><br/>
        <strong>${formatCurrency(item.preco)}</strong>
      </td>
      <td class="text-right">
        <span class="label-small">Quantidade</span><br/>
        <strong>${formatNumber(item.quantidade, 1)}</strong>
      </td>
      <td class="text-right">
        <span class="label-small">Valor</span><br/>
        <strong class="text-primary">${formatCurrency(item.subtotal)}</strong>
      </td>
    </tr>
  `).join('');

  const total = filtrados.reduce((s, i) => s + i.subtotal, 0);
  const totalLabel = tipo === 'servico' ? 'Valor total dos Serviços' : 'Valor total de Produtos, peças e materiais';

  return `
    <div class="section-block">
      <div class="section-header">${titulo}</div>
      <table class="items-table">
        <thead>
          <tr class="col-header">
            <th class="th-item">Item</th>
            <th class="th-num">Valor Unitario</th>
            <th class="th-num">Quantidade</th>
            <th class="th-num">Subtotal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total-bar">${totalLabel}: <strong>${formatCurrency(total)}</strong></div>
    </div>
  `;
}

function renderPagamento(o: Orcamento): string {
  if (!o.formasPagamento && !o.condicoesPagamento) return '';

  const formas: string[] = [];
  if (o.formasPagamento?.pix) formas.push('<div class="payment-method">PIX</div>');
  if (o.formasPagamento?.credito) formas.push('<div class="payment-method">Cartão de crédito</div>');
  if (o.formasPagamento?.debito) formas.push('<div class="payment-method">Cartão de débito</div>');
  if (o.formasPagamento?.dinheiro) formas.push('<div class="payment-method">Dinheiro</div>');

  const sinalStr = o.sinalPercentual
    ? `Sinal de ${formatCurrency(o.sinalValor ?? 0)} (${o.sinalPercentual}%) em ${o.sinalData ? formatDateBR(o.sinalData) : '—'}`
    : (o.condicoesPagamento ?? '');

  const restante = o.sinalValor ? `Valor restante ${formatCurrency(o.valorTotal - (o.sinalValor ?? 0))}` : '';

  return `
    <div class="section-block">
      <div class="payment-header">Pagamento</div>
      <table class="payment-table">
        <thead>
          <tr class="col-header">
            <th>Formas de pagamento</th>
            <th>Condições de pagamento</th>
            <th>Restante</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${formas.join('')}</td>
            <td>
              ${sinalStr ? `<strong>${sinalStr}</strong>` : ''}
              ${o.sinalValor ? '<br/>Valor restante na entrega do serviço' : ''}
            </td>
            <td>${restante}</td>
          </tr>
        </tbody>
      </table>
      ${o.chavePix ? `<div class="pix-box"><strong>Chave PIX:</strong> ${o.chavePix}</div>` : ''}
    </div>
  `;
}

export function gerarHtmlOrcamento(o: Orcamento, empresa: Empresa, depoimentos: Depoimento[]): string {
  const servicosHtml = renderItens(o.itens, 'servico');
  const produtosHtml = renderItens(o.itens, 'produto');
  const pagamentoHtml = renderPagamento(o);

  const hasServicos = o.itens.some(i => i.tipo === 'servico');
  const hasProdutos = o.itens.some(i => i.tipo === 'produto');

  const totaisHtml = (hasServicos && hasProdutos) ? `
    <div class="subtotais">
      <div class="subtotal-row">Total dos Serviços: <strong>${formatCurrency(o.subtotalServicos)}</strong></div>
      <div class="subtotal-row">Total de Peças e materiais: <strong>${formatCurrency(o.subtotalProdutos)}</strong></div>
      <div class="subtotal-row">Subtotal: <strong>${formatCurrency(o.subtotal)}</strong></div>
      ${o.desconto > 0 ? `<div class="subtotal-row discount">Descontos: <strong>- ${formatCurrency(o.desconto)}</strong></div>` : ''}
      <div class="total-bar">Valor total: <strong>${formatCurrency(o.valorTotal)}</strong></div>
    </div>
  ` : `
    <div class="subtotais">
      ${o.desconto > 0 ? `<div class="subtotal-row">Subtotal: <strong>${formatCurrency(o.subtotal)}</strong></div>` : ''}
      ${o.desconto > 0 ? `<div class="subtotal-row discount">Descontos: <strong>- ${formatCurrency(o.desconto)}</strong></div>` : ''}
      <div class="total-bar">Valor total: <strong>${formatCurrency(o.valorTotal)}</strong></div>
    </div>
  `;

  const depoimentosHtml = depoimentos.length > 0 ? `
    <div class="section-label">Depoimentos e avaliações</div>
    ${depoimentos.map(d => `
      <div class="depoimento">
        <strong>${d.nomeCliente}</strong><br/>
        <span class="stars" style="color:#F59E0B">${renderStars(d.estrelas)}</span>
        ${d.texto ? `<p class="depo-text">${d.texto}</p>` : ''}
      </div>
    `).join('')}
  ` : '';

  const aprovacaoHtml = `
    <div style="margin:24px 0 8px 0;">
      ${o.exibirRecusa ? `<div class="btn-recusar">Recusar — Toque aqui para recusar este orçamento.</div>` : ''}
      ${o.exibirAprovacao ? `<div class="btn-aprovar">Aprovar orçamento — Toque aqui para aprovar este orçamento.</div>` : ''}
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #212121; background: #fff; }
  .page { padding: 28px 32px; max-width: 800px; margin: 0 auto; }

  /* HEADER */
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #1565C0; }
  .empresa-info { flex: 1; }
  .empresa-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .empresa-logo { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
  .pro-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; }
  .fotos-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .foto-item { width: 31%; height: 130px; object-fit: cover; border-radius: 6px; border: 1px solid #e9ecef; }
  .empresa-nome { font-size: 20px; font-weight: 700; color: #1565C0; }
  .empresa-esp { font-size: 12px; color: #555; margin-bottom: 4px; }
  .empresa-details { font-size: 12px; color: #555; line-height: 1.6; }
  .orcamento-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px 16px; text-align: center; min-width: 200px; }
  .orcamento-box-label { font-size: 11px; color: #888; }
  .orcamento-box-num { font-size: 16px; font-weight: 700; color: #212121; }
  .social-icons { margin-top: 10px; display: flex; gap: 8px; }
  .social-icon { font-size: 11px; color: #1565C0; }
  .doc-date { font-size: 11px; color: #888; margin-top: 8px; }

  /* CLIENTE */
  .cliente-section { margin: 16px 0; }
  .section-label { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
  .cliente-nome { font-size: 15px; font-weight: 700; }
  .cliente-info { font-size: 13px; color: #444; }

  /* INFO BOXES */
  .info-boxes { display: flex; gap: 12px; margin: 12px 0; }
  .info-box { flex: 1; background: #f5f5f5; border-radius: 6px; padding: 10px 14px; text-align: center; }
  .info-box-label { font-size: 11px; color: #777; font-weight: 600; }
  .info-box-value { font-size: 13px; font-weight: 700; color: #212121; margin-top: 2px; }

  /* SECTION BLOCK */
  .section-block { margin: 16px 0; }
  .section-header { background: #1B4F72; color: #fff; padding: 10px 14px; font-size: 15px; font-weight: 700; border-radius: 6px 6px 0 0; }
  .payment-header { background: #2C3E50; color: #fff; padding: 10px 14px; font-size: 14px; font-weight: 700; border-radius: 6px 6px 0 0; }

  /* TABLES */
  .items-table, .payment-table { width: 100%; border-collapse: collapse; }
  .col-header { background: #2C3E50; color: #fff; }
  .col-header th { padding: 8px 12px; font-size: 12px; font-weight: 600; }
  .th-item { text-align: left; width: 50%; }
  .th-num { text-align: right; width: 16.6%; }
  .item-row { border-bottom: 1px solid #e0e0e0; }
  .item-row:last-child { border-bottom: none; }
  .item-name { padding: 12px; display: flex; gap: 10px; align-items: flex-start; }
  .item-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
  .item-desc { font-size: 11px; color: #666; }
  .text-right { text-align: right; padding: 12px; vertical-align: top; }
  .label-small { font-size: 10px; color: #888; }
  .text-primary { color: #1565C0; }

  /* TOTAL BAR */
  .total-bar { background: #1A252F; color: #fff; padding: 10px 16px; text-align: right; font-size: 14px; border-radius: 0 0 6px 6px; margin-top: 0; }
  .subtotais { margin: 8px 0; }
  .subtotal-row { text-align: right; padding: 4px 16px; font-size: 13px; color: #444; }
  .subtotal-row.discount { color: #E53E3E; }
  .subtotais .total-bar { border-radius: 6px; margin-top: 4px; }

  /* PAYMENT */
  .payment-table td { padding: 12px; vertical-align: top; border-bottom: 1px solid #eee; }
  .payment-method { font-size: 13px; padding: 2px 0; }
  .pix-box { background: #f0f8ff; border: 1px solid #bee3f8; border-radius: 6px; padding: 10px 14px; margin-top: 8px; font-size: 13px; color: #1565C0; }

  /* TEXT SECTIONS */
  .text-section { margin: 16px 0; }
  .text-section-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #212121; }
  .text-section-content { font-size: 13px; color: #444; line-height: 1.7; white-space: pre-wrap; }

  /* SIGNATURE */
  .signature-area { display: flex; justify-content: space-between; margin: 32px 0 16px 0; }
  .signature-block { text-align: center; min-width: 200px; }
  .signature-img { height: 60px; object-fit: contain; margin-bottom: 4px; }
  .signature-line { border-top: 1px solid #ccc; padding-top: 6px; font-size: 12px; color: #555; }
  .signature-name { font-weight: 700; font-size: 13px; }

  /* BOTÕES */
  .btn-aprovar { background: #27AE60; color: #fff; padding: 14px; text-align: center; font-size: 14px; font-weight: 700; border-radius: 6px; margin: 8px 0; }
  .btn-recusar { border: 2px solid #E74C3C; color: #E74C3C; padding: 12px; text-align: center; font-size: 14px; font-weight: 700; border-radius: 6px; margin: 8px 0; background: #fff; }

  /* ÁREA DO PROFISSIONAL */
  .pro-section { margin: 24px 0 8px 0; }
  .pro-title { font-size: 22px; font-weight: 700; color: #212121; margin-bottom: 4px; }
  .pro-subtitle { font-size: 13px; color: #666; margin-bottom: 12px; }
  .pro-card { background: #f8f9fa; border-radius: 8px; padding: 16px; display: flex; gap: 14px; align-items: flex-start; }
  .pro-card-name { font-size: 16px; font-weight: 700; color: #1565C0; }
  .pro-card-info { font-size: 12px; color: #555; line-height: 1.8; }

  /* DEPOIMENTOS */
  .depoimento { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
  .depo-text { font-size: 12px; color: #666; margin-top: 4px; }
  .stars { font-size: 16px; }

  /* FOOTER */
  .doc-footer { border-top: 1px solid #e0e0e0; padding-top: 10px; margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }

  .item-row, .foto-item, .signature-block, .depoimento { page-break-inside: avoid; }
  .section-block { page-break-inside: avoid; }

  @media print {
    .page { padding: 20px; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="doc-header">
    <div class="empresa-info">
      <div class="empresa-brand">
        ${img(empresa.logoUri) ? `<img src="${img(empresa.logoUri)}" class="empresa-logo" />` : ''}
        <div>
          <div class="empresa-nome">${empresa.nome}</div>
          <div class="empresa-esp">${empresa.especialidade}</div>
        </div>
      </div>
      <div class="empresa-details">
        ${empresa.cnpj ? `CNPJ: ${empresa.cnpj}<br/>` : ''}
        ${empresa.endereco ? `${empresa.endereco}${empresa.cidade ? ` — ${empresa.cidade}/${empresa.estado}` : ''}<br/>` : ''}
        ${empresa.telefone ? `Tel: ${empresa.telefone}` : ''}${empresa.site ? ` &nbsp;·&nbsp; ${empresa.site}` : ''}
      </div>
    </div>
    <div>
      <div class="orcamento-box">
        <div class="orcamento-box-label">ORÇAMENTO</div>
        <div class="orcamento-box-num">Nº ${o.numero}</div>
      </div>
      <div class="doc-date" style="text-align:right;margin-top:8px;">Emitido em ${formatDateTime(o.criadoEm)}</div>
    </div>
  </div>

  <!-- CLIENTE -->
  <div class="cliente-section">
    <div class="section-label">Cliente</div>
    <div class="cliente-nome">${o.clienteNome}</div>
    <div class="cliente-info">${o.clienteTelefone}</div>
    ${o.clienteCpfCnpj ? `<div class="cliente-info">CPF/CNPJ: ${o.clienteCpfCnpj}</div>` : ''}
    ${o.clienteEndereco ? `<div class="cliente-info">${o.clienteEndereco}</div>` : ''}
  </div>

  <!-- DATAS INFO BOXES -->
  ${(o.validadeOrcamento || o.dataVisitaTecnica || o.agendamentoServico) ? `
    <div class="info-boxes">
      ${o.validadeOrcamento ? `
        <div class="info-box">
          <div class="info-box-label">Orçamento válido até:</div>
          <div class="info-box-value">${formatDateBR(o.validadeOrcamento)}</div>
        </div>
      ` : ''}
      ${o.dataVisitaTecnica ? `
        <div class="info-box">
          <div class="info-box-label">Visita técnica em:</div>
          <div class="info-box-value">${o.dataVisitaTecnica}</div>
        </div>
      ` : ''}
      ${o.agendamentoServico ? `
        <div class="info-box">
          <div class="info-box-label">Agendamento do serviço:</div>
          <div class="info-box-value">${o.agendamentoServico}</div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  <!-- ITENS -->
  ${servicosHtml}
  ${produtosHtml}

  <!-- FOTOS DO SERVIÇO -->
  ${renderFotos(o)}

  <!-- TOTAIS -->
  ${totaisHtml}

  <!-- PAGAMENTO -->
  ${pagamentoHtml}

  <!-- CONDIÇÕES CONTRATUAIS -->
  ${o.condicoesContratuais ? `
    <div class="text-section">
      <div class="text-section-title">Condições contratuais</div>
      <div class="text-section-content">${o.condicoesContratuais}</div>
    </div>
  ` : ''}

  <!-- GARANTIA -->
  ${o.garantia ? `
    <div class="text-section">
      <div class="text-section-title">Garantia</div>
      <div class="text-section-content">${o.garantia}</div>
    </div>
  ` : ''}

  <!-- INFORMAÇÕES ADICIONAIS -->
  ${o.informacoesAdicionais ? `
    <div class="text-section">
      <div class="text-section-title">Informações adicionais</div>
      <div class="text-section-content">${o.informacoesAdicionais}</div>
    </div>
  ` : ''}

  <!-- ASSINATURA -->
  ${o.exibirAssinatura ? `
    <div class="signature-area">
      <div class="signature-block">
        ${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri) ? `<img src="${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri)}" class="signature-img" />` : '<div style="height:60px;"></div>'}
        <div class="signature-line">
          <div>Prestador de serviço</div>
          <div class="signature-name">${empresa.nomePrestador}</div>
          <div style="font-size:11px;color:#888;">${formatDateTime(o.criadoEm)}</div>
        </div>
      </div>
      ${o.solicitarAssinaturaCliente ? `
        <div class="signature-block">
          ${img(o.assinaturaClienteUri) ? `<img src="${img(o.assinaturaClienteUri)}" class="signature-img" />` : '<div style="height:60px;"></div>'}
          <div class="signature-line">
            <div>Cliente</div>
            <div class="signature-name">${o.clienteNome}</div>
            <div style="font-size:11px;color:#888;">${o.dataAssinaturaCliente ?? 'Data não informada'}</div>
          </div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  <!-- BOTÕES APROVAÇÃO -->
  ${aprovacaoHtml}

  <!-- ÁREA DO PROFISSIONAL -->
  <div class="pro-section">
    <div class="pro-title">Área do profissional</div>
    <div class="pro-subtitle">Saiba mais sobre seu prestador de serviços.</div>
    <div class="pro-card">
      ${img(empresa.logoUri) ? `<img src="${img(empresa.logoUri)}" class="pro-logo" />` : ''}
      <div>
        <div class="pro-card-name">${empresa.nome}</div>
        <div class="pro-card-info">
          ${empresa.slogan}<br/>
          ${empresa.cidade} – ${empresa.estado}<br/>
          ${empresa.telefone}<br/>
          ${empresa.site ? `${empresa.site}<br/>` : ''}
          ${empresa.email ? `${empresa.email}<br/>` : ''}
          ${empresa.cnpj ? `CNPJ: ${empresa.cnpj}<br/>` : ''}
          ${empresa.normas}
        </div>
      </div>
    </div>
  </div>

  <!-- DEPOIMENTOS -->
  ${depoimentosHtml ? `
    <div class="text-section">
      ${depoimentosHtml}
    </div>
  ` : ''}

  <!-- FOOTER -->
  <div class="doc-footer">
    <div>${empresa.nome} | CNPJ: ${empresa.cnpj} | ${empresa.endereco}</div>
    <div>${empresa.telefone} | Documento gerado em ${formatDateTime(o.criadoEm)}</div>
  </div>

</div>
</body>
</html>`;
}

export async function gerarPdfOrcamento(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[]
): Promise<string> {
  await populateImages(o, empresa);
  const html = gerarHtmlOrcamento(o, empresa, depoimentos);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function compartilharPdfOrcamento(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[]
): Promise<void> {
  const uri = await gerarPdfOrcamento(o, empresa, depoimentos);
  const fileName = `Orcamento-${safeFileName(o.clienteNome)}-${o.numero}.pdf`;
  const dest = FileSystem.documentDirectory + fileName;
  await FileSystem.copyAsync({ from: uri, to: dest });
  await Sharing.shareAsync(dest, {
    mimeType: 'application/pdf',
    dialogTitle: `Orçamento ${o.numero} - ${o.clienteNome}`,
  });
}

export async function abrirWhatsApp(telefone: string, mensagem: string): Promise<void> {
  const { Linking } = require('react-native');
  const numero = telefone.replace(/\D/g, '');
  const url = `whatsapp://send?phone=55${numero}&text=${encodeURIComponent(mensagem)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}
