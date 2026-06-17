import { Orcamento, Empresa, Depoimento, ItemOrcamento } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDate, formatDateBR } from './date';
import { imagemParaDataUri } from './imagemDataUri';
import { exportarHtmlComoPdf, safeFileName } from './exportarDocumento';

// Reexportado para compatibilidade: o WhatsApp agora vive no helper de saída.
export { abrirWhatsApp } from './exportarDocumento';

/* ─── Cache de imagens em data URI ────────────────────────────────
 * URIs locais (file://) NÃO renderizam no expo-print do Android e, na web,
 * `blob:`/`http` não embutem direto no PDF. Convertemos cada imagem para
 * data URI (base64) ANTES de montar o HTML, de forma multiplataforma
 * (ver utils/imagemDataUri). A geração do HTML em si continua pura.
 */
let IMG_CACHE: Record<string, string> = {};

function img(uri?: string): string {
  if (!uri) return '';
  return IMG_CACHE[uri] || (uri.startsWith('data:') ? uri : '');
}

async function populateImages(o: Orcamento, empresa: Empresa): Promise<void> {
  IMG_CACHE = {};
  const uris = new Set<string>();
  [empresa.logoUri, empresa.assinaturaUri, o.assinaturaPrestadorUri, o.assinaturaClienteUri]
    .forEach(u => u && uris.add(u));
  o.itens.forEach(i => i.fotoUri && uris.add(i.fotoUri));
  (o.fotosServico ?? []).forEach(f => f && uris.add(f));
  await Promise.all([...uris].map(async u => {
    // Se a conversão falhar (retorna null), seguimos sem a imagem — o PDF não quebra.
    const d = await imagemParaDataUri(u);
    if (d) IMG_CACHE[u] = d;
  }));
}

/* ─── Cor da marca (accent) ───────────────────────────────────────
 * Cor de marca configurável (default #0B6FCE). Como o expo-print no
 * Android nem sempre suporta color-mix(), pré-calculamos os tons claros
 * (mistura do accent com branco) direto em JS para o visual ser fiel.
 */
export const DEFAULT_ACCENT = '#0B6FCE';

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = (hex || DEFAULT_ACCENT).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(v => Number.isNaN(v))) return { r: 11, g: 111, b: 206 };
  return { r, g, b };
}

/** Mistura o accent com branco. pct = quanto do accent (0..1). */
function mixWhite(hex: string, pct: number): string {
  const { r, g, b } = parseHex(hex);
  const m = (c: number) => clampByte(c * pct + 255 * (1 - pct));
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(m(r))}${to2(m(g))}${to2(m(b))}`;
}

function renderStars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** Monograma OLLI (marca d'água / selo) na cor do accent. */
function monogramSvg(accent: string, size: number, opacity: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" fill="none" style="opacity:${opacity};">
    <circle cx="48" cy="48" r="22" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round" stroke-dasharray="112 32" transform="rotate(-58 48 48)"/>
    <circle cx="65" cy="33" r="4.5" fill="${accent}"/>
  </svg>`;
}

function renderFotos(o: Orcamento): string {
  const fotos = (o.fotosServico ?? []).map(f => img(f)).filter(Boolean);
  if (fotos.length === 0) return '';
  return `
    <div class="block">
      <div class="eyebrow">Registro fotográfico</div>
      <div class="fotos-grid">
        ${fotos.map(src => `<img src="${src}" class="foto-item" />`).join('')}
      </div>
    </div>
  `;
}

/** Uma única tabela de itens (Descrição · Qtd · Unitário · Total). */
function renderItensTabela(itens: ItemOrcamento[]): string {
  if (itens.length === 0) return '';

  const rows = itens.map(item => {
    const badge = item.tipo === 'produto'
      ? ` <span class="badge-peca">PEÇA</span>`
      : '';
    return `
    <div class="item-row">
      <div class="item-main">
        ${img(item.fotoUri) ? `<img src="${img(item.fotoUri)}" class="item-thumb" />` : ''}
        <div class="item-text">
          <div class="item-name">${item.nome}${badge}</div>
          ${item.descricao ? `<div class="item-desc">${item.descricao}</div>` : ''}
        </div>
      </div>
      <div class="col-qtd">${formatNumber(item.quantidade, item.quantidade % 1 === 0 ? 0 : 1)}</div>
      <div class="col-unit">${formatCurrency(item.preco)}</div>
      <div class="col-total">${formatCurrency(item.subtotal)}</div>
    </div>`;
  }).join('');

  return `
    <div class="items">
      <div class="items-head">
        <span class="col-desc-h">Descrição</span>
        <span class="col-qtd-h">Qtd</span>
        <span class="col-unit-h">Unitário</span>
        <span class="col-total-h">Total</span>
      </div>
      ${rows}
    </div>
  `;
}

/** Texto das condições de pagamento a partir dos dados do orçamento. */
function pagamentoTexto(o: Orcamento): string {
  if (o.condicoesPagamento) return o.condicoesPagamento;
  const formas: string[] = [];
  if (o.formasPagamento?.pix) formas.push('Pix');
  if (o.formasPagamento?.credito) formas.push('Crédito');
  if (o.formasPagamento?.debito) formas.push('Débito');
  if (o.formasPagamento?.dinheiro) formas.push('Dinheiro');
  if (o.sinalPercentual) {
    return `Sinal de ${o.sinalPercentual}% na aprovação<br/>Restante na conclusão · ${formas.join(', ') || 'a combinar'}`;
  }
  return formas.length ? formas.join(' · ') : 'A combinar';
}

/** 3 colunas de condições: Pagamento · Garantia · Prazo (omite vazias). */
function renderCondicoes(o: Orcamento): string {
  const pagamento = pagamentoTexto(o);
  const garantia = o.garantia ?? '';
  const prazo = o.agendamentoServico || o.dataPrestacaoServico || o.informacoesAdicionais || '';

  const cols: string[] = [];
  if (pagamento) cols.push(`<div class="cond-col"><div class="cond-label">Pagamento</div><div class="cond-val">${pagamento}</div></div>`);
  if (garantia) cols.push(`<div class="cond-col"><div class="cond-label">Garantia</div><div class="cond-val">${garantia}</div></div>`);
  if (prazo) cols.push(`<div class="cond-col"><div class="cond-label">Prazo</div><div class="cond-val">${prazo}</div></div>`);
  if (cols.length === 0) return '';
  return `<div class="conditions">${cols.join('')}</div>`;
}

export function gerarHtmlOrcamento(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[],
  accent: string = DEFAULT_ACCENT,
): string {
  const itensHtml = renderItensTabela(o.itens);
  const condicoesHtml = renderCondicoes(o);

  // Tons claros do accent pré-calculados (color-mix nem sempre roda no expo-print).
  const accentSoft = mixWhite(accent, 0.09);   // fundo do TOTAL / pílula
  const accentBorder = mixWhite(accent, 0.30);  // borda
  const accentChipBg = mixWhite(accent, 0.07);
  const accentBadgeBg = mixWhite(accent, 0.10); // fundo do badge "PEÇA"

  const emitidoEm = o.dataEmissao ? formatDateBR(o.dataEmissao) : formatDate(o.criadoEm);
  const tagline = empresa.especialidade || empresa.slogan || '';

  const enderecoEmpresa = [
    empresa.endereco,
    [empresa.cidade, empresa.estado].filter(Boolean).join('/'),
  ].filter(Boolean).join(' · ');
  const contatoEmpresa = [empresa.telefone, empresa.email].filter(Boolean).join(' · ');

  const clienteLinhas = [
    o.clienteEndereco,
    o.clienteCpfCnpj ? `CPF/CNPJ ${o.clienteCpfCnpj}` : '',
    o.clienteTelefone,
  ].filter(Boolean).join('<br/>');

  const depoimentosHtml = depoimentos.length > 0 ? `
    <div class="block">
      <div class="eyebrow">Depoimentos</div>
      ${depoimentos.map(d => `
        <div class="depoimento">
          <div class="depo-head"><strong>${d.nomeCliente}</strong> <span class="stars">${renderStars(d.estrelas)}</span></div>
          ${d.texto ? `<p class="depo-text">${d.texto}</p>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Plus Jakarta Sans', -apple-system, system-ui, Arial, sans-serif; font-size: 13px; color: #1A2230; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .sheet { position: relative; max-width: 794px; margin: 0 auto; background: #fff; overflow: hidden; }
  .spine { position: absolute; top: 0; left: 0; bottom: 0; width: 7px; background: ${accent}; }
  .watermark { position: absolute; top: 300px; right: -110px; pointer-events: none; }
  .page { padding: 44px 50px 40px 56px; position: relative; }

  /* HEADER */
  .header { display: flex; justify-content: space-between; align-items: flex-start; }
  .brand-logo { width: 180px; max-height: 66px; object-fit: contain; margin-bottom: 12px; display: block; }
  .brand-name { font-family: 'Spectral', Georgia, serif; font-size: 22px; font-weight: 600; letter-spacing: -0.2px; color: #16202E; }
  .brand-tagline { font-size: 12px; color: #6B7686; margin-top: 2px; letter-spacing: 0.2px; }
  .header-right { text-align: right; }
  .doc-title { font-family: 'Spectral', Georgia, serif; font-size: 36px; font-weight: 600; color: ${accent}; letter-spacing: -0.5px; line-height: 1; }
  .doc-num { font-size: 13px; font-weight: 700; color: #1A2230; margin-top: 10px; letter-spacing: 0.5px; }
  .doc-date { font-size: 12px; color: #6B7686; margin-top: 3px; }
  .pill { display: inline-block; margin-top: 9px; font-size: 11px; font-weight: 700; color: ${accent}; border: 1px solid ${accentBorder}; background: ${accentChipBg}; border-radius: 999px; padding: 4px 11px; letter-spacing: 0.3px; }

  .rule { height: 1px; background: #E7E9EE; margin: 26px 0; }

  /* PARTIES */
  .parties { display: flex; gap: 40px; }
  .party { flex: 1; }
  .party-divider { width: 1px; background: #E7E9EE; }
  .eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 1.5px; color: #9AA3B2; text-transform: uppercase; }
  .party-name { font-size: 14.5px; font-weight: 700; color: #1A2230; margin-top: 9px; }
  .party-info { font-size: 12.5px; color: #5A6575; line-height: 1.7; margin-top: 4px; }

  /* ITEMS */
  .items { margin-top: 32px; }
  .items-head { display: flex; align-items: center; padding: 0 4px 11px; border-bottom: 2px solid #1A2230; }
  .col-desc-h { flex: 1; }
  .col-qtd-h { width: 56px; text-align: center; }
  .col-unit-h { width: 110px; text-align: right; }
  .col-total-h { width: 110px; text-align: right; }
  .items-head span { font-size: 10.5px; font-weight: 800; letter-spacing: 1.2px; color: #6B7686; text-transform: uppercase; }

  .item-row { display: flex; align-items: flex-start; padding: 15px 4px; border-bottom: 1px solid #EDEFF2; page-break-inside: avoid; }
  .item-main { flex: 1; display: flex; gap: 10px; align-items: flex-start; }
  .item-thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .item-name { font-size: 14px; font-weight: 600; color: #1A2230; }
  .item-desc { font-size: 11.5px; color: #8A93A2; margin-top: 2px; }
  .badge-peca { font-size: 10px; font-weight: 700; color: ${accent}; background: ${accentBadgeBg}; border-radius: 5px; padding: 1px 6px; letter-spacing: 0.3px; }
  .col-qtd { width: 56px; text-align: center; font-size: 13.5px; color: #5A6575; }
  .col-unit { width: 110px; text-align: right; font-size: 13.5px; color: #5A6575; }
  .col-total { width: 110px; text-align: right; font-size: 14px; font-weight: 700; color: #1A2230; }

  /* TOTALS */
  .totals { display: flex; justify-content: flex-end; margin-top: 24px; }
  .totals-inner { width: 300px; }
  .total-line { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #5A6575; }
  .total-line.discount span:last-child { color: #C0392B; }
  .total-box { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding: 14px 18px; border-radius: 12px; background: ${accentSoft}; border: 1px solid ${accentBorder}; }
  .total-box-label { font-size: 13px; font-weight: 700; color: #1A2230; letter-spacing: 0.3px; }
  .total-box-value { font-family: 'Spectral', Georgia, serif; font-size: 26px; font-weight: 700; color: ${accent}; }

  /* CONDITIONS */
  .conditions { display: flex; gap: 30px; margin-top: 34px; padding-top: 24px; border-top: 1px solid #E7E9EE; }
  .cond-col { flex: 1; }
  .cond-label { font-size: 10px; font-weight: 800; letter-spacing: 1.3px; color: #9AA3B2; text-transform: uppercase; }
  .cond-val { font-size: 12.5px; color: #3C4756; margin-top: 6px; line-height: 1.55; }

  /* GENERIC BLOCK / TEXT SECTIONS */
  .block { margin-top: 28px; }
  .text-block { margin-top: 22px; }
  .text-block .body { font-size: 12.5px; color: #3C4756; line-height: 1.7; white-space: pre-wrap; margin-top: 6px; }

  /* FOTOS */
  .fotos-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .foto-item { width: 31.5%; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #EDEFF2; page-break-inside: avoid; }

  /* SIGNATURE */
  .signatures { display: flex; gap: 40px; margin-top: 48px; align-items: flex-end; }
  .sign-col { flex: 1; text-align: center; }
  .sign-img { height: 50px; object-fit: contain; display: block; margin: 0 auto 4px; }
  .sign-line { height: 1px; background: #B7BEC9; }
  .sign-caption { font-size: 11.5px; color: #6B7686; margin-top: 8px; }
  .sign-name { font-weight: 700; color: #1A2230; }

  /* DEPOIMENTOS */
  .depoimento { margin-top: 10px; padding-bottom: 8px; border-bottom: 1px solid #EDEFF2; }
  .depo-head { font-size: 13px; color: #1A2230; }
  .stars { color: #F2A516; font-size: 13px; }
  .depo-text { font-size: 12px; color: #5A6575; margin-top: 4px; line-height: 1.6; }

  /* FOOTER */
  .footer { border-top: 1px solid #EDEFF2; margin-top: 36px; padding-top: 16px; display: flex; align-items: center; justify-content: space-between; }
  .footer-contact { font-size: 11px; color: #8A93A2; }
  .footer-seal { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: #B0B7C2; font-weight: 600; }

  @media print { .page { padding: 40px 46px; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="spine"></div>
  <div class="watermark">${monogramSvg(accent, 360, 0.05)}</div>

  <div class="page">

    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        ${img(empresa.logoUri) ? `<img src="${img(empresa.logoUri)}" class="brand-logo" />` : ''}
        <div class="brand-name">${empresa.nome}</div>
        ${tagline ? `<div class="brand-tagline">${tagline}</div>` : ''}
      </div>
      <div class="header-right">
        <div class="doc-title">Orçamento</div>
        <div class="doc-num">Nº ${o.numero}</div>
        <div class="doc-date">Emitido em ${emitidoEm}</div>
        ${o.validadeOrcamento ? `<div class="pill">Válido até ${formatDateBR(o.validadeOrcamento)}</div>` : `<div class="pill">Válido por 15 dias</div>`}
      </div>
    </div>

    <div class="rule"></div>

    <!-- PARTIES -->
    <div class="parties">
      <div class="party">
        <div class="eyebrow">Prestador</div>
        <div class="party-name">${empresa.nome}</div>
        <div class="party-info">
          ${empresa.cnpj ? `CNPJ ${empresa.cnpj}<br/>` : ''}
          ${enderecoEmpresa ? `${enderecoEmpresa}<br/>` : ''}
          ${contatoEmpresa}
        </div>
      </div>
      <div class="party-divider"></div>
      <div class="party">
        <div class="eyebrow">Cliente</div>
        <div class="party-name">${o.clienteNome}</div>
        <div class="party-info">${clienteLinhas}</div>
      </div>
    </div>

    <!-- ITENS -->
    ${itensHtml}

    <!-- TOTAIS -->
    <div class="totals">
      <div class="totals-inner">
        <div class="total-line"><span>Subtotal</span><span>${formatCurrency(o.subtotal)}</span></div>
        <div class="total-line discount"><span>Desconto</span><span>${o.desconto > 0 ? `- ${formatCurrency(o.desconto)}` : '—'}</span></div>
        <div class="total-box">
          <span class="total-box-label">TOTAL</span>
          <span class="total-box-value">${formatCurrency(o.valorTotal)}</span>
        </div>
      </div>
    </div>

    <!-- CONDIÇÕES -->
    ${condicoesHtml}

    <!-- CONDIÇÕES CONTRATUAIS / INFORMAÇÕES (texto livre, opcional) -->
    ${o.condicoesContratuais ? `
      <div class="text-block">
        <div class="eyebrow">Condições contratuais</div>
        <div class="body">${o.condicoesContratuais}</div>
      </div>
    ` : ''}

    <!-- FOTOS DO SERVIÇO -->
    ${renderFotos(o)}

    <!-- DEPOIMENTOS -->
    ${depoimentosHtml}

    <!-- ASSINATURAS -->
    ${o.exibirAssinatura ? `
      <div class="signatures">
        <div class="sign-col">
          ${o.solicitarAssinaturaCliente && img(o.assinaturaClienteUri) ? `<img src="${img(o.assinaturaClienteUri)}" class="sign-img" />` : ''}
          <div class="sign-line"></div>
          <div class="sign-caption">Aprovação do cliente · data</div>
          <div class="sign-caption sign-name">${o.clienteNome}</div>
        </div>
        <div class="sign-col">
          ${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri) ? `<img src="${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri)}" class="sign-img" />` : ''}
          <div class="sign-line"></div>
          <div class="sign-caption">${empresa.nome}</div>
          <div class="sign-caption sign-name">${empresa.nomePrestador || ''}</div>
        </div>
      </div>
    ` : ''}

    <!-- FOOTER -->
    <div class="footer">
      <span class="footer-contact">${contatoEmpresa || empresa.nome}</span>
      <span class="footer-seal">
        ${monogramSvg('#C7CDD6', 14, 1)}
        gerado com OLLI
      </span>
    </div>

  </div>
</div>
</body>
</html>`;
}

/**
 * Monta o HTML do orçamento já com as imagens convertidas para data URI.
 * Continua "puro" no sentido de retornar a string final do documento;
 * a entrega (imprimir/compartilhar) é responsabilidade do helper de saída.
 */
export async function montarHtmlOrcamentoCompleto(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[],
  accent: string = DEFAULT_ACCENT,
): Promise<string> {
  await populateImages(o, empresa);
  return gerarHtmlOrcamento(o, empresa, depoimentos, accent);
}

/**
 * Gera e entrega o PDF do orçamento (web: imprime/salva como PDF; nativo:
 * expo-print + compartilhamento). Toda a parte nativo-only fica isolada no
 * helper exportarHtmlComoPdf, então nada disso é avaliado na web.
 */
export async function compartilharPdfOrcamento(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[],
  accent: string = DEFAULT_ACCENT,
): Promise<void> {
  const html = await montarHtmlOrcamentoCompleto(o, empresa, depoimentos, accent);
  const fileName = `Orcamento-${safeFileName(o.clienteNome)}-${o.numero}`;
  await exportarHtmlComoPdf(html, fileName, {
    dialogTitle: `Orçamento ${o.numero} - ${o.clienteNome}`,
  });
}
