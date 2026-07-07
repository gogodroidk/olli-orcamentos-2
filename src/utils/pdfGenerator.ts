import { Orcamento, Empresa, Depoimento, ItemOrcamento } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDate, formatDateBR } from './date';
import { imagemParaDataUri } from './imagemDataUri';
import { exportarHtmlComoPdf, safeFileName } from './exportarDocumento';
import { escapeHtml, safeHexColor } from './html';

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
  // Clampa entre 0 e 5: '★'.repeat(n) lança RangeError para n<0 ou n>5.
  const k = Math.max(0, Math.min(5, Math.round(n || 0)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

/**
 * Monograma OLLI (marca d'água / selo) na cor do accent.
 * Exportado para reuso em outros documentos gerados pelo app (ex.: recibo),
 * garantindo a mesma identidade visual do orçamento em toda a família de PDFs.
 */
export function monogramSvg(color: string, size: number, opacity: number): string {
  // Símbolo oficial OLLI (rebrand v3) em versão mono — balão-documento + check.
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" style="opacity:${opacity};">
    <path d="M22 49 L12 59.5 L30 50 Z" fill="${color}"/>
    <rect x="9" y="8" width="46" height="44" rx="14.5" fill="${color}"/>
    <path d="M18 32 l8 9 l20 -19" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/**
 * Rodapé "selo OLLI" (monograma cinza + texto), no mesmo padrão usado no
 * rodapé do orçamento. Exportado para que outros documentos (ex.: recibo)
 * repliquem a mesma assinatura visual em vez de reinventar o próprio rodapé.
 */
export function footerSeloOlliHtml(): string {
  return `${monogramSvg('#C7CDD6', 14, 1)} Gerado com OLLI Orçamentos`;
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
          <div class="item-name">${escapeHtml(item.nome)}${badge}</div>
          ${item.descricao ? `<div class="item-desc">${escapeHtml(item.descricao)}</div>` : ''}
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

/**
 * Texto das condições de pagamento a partir dos dados do orçamento.
 * Retorna HTML já seguro: o texto livre do usuário (condicoesPagamento) é
 * escapado aqui; o `<br/>` do ramo do sinal é marcação fixa controlada.
 */
function pagamentoTexto(o: Orcamento): string {
  if (o.condicoesPagamento) return escapeHtml(o.condicoesPagamento);
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
  // `pagamento` já vem como HTML seguro de pagamentoTexto (texto livre escapado lá).
  const pagamento = pagamentoTexto(o);
  const garantia = o.garantia ?? '';
  // Prazo é só data de agendamento/execução — informacoesAdicionais (observações)
  // ganha bloco próprio em renderObservacoes() e não deve ser "engolido" aqui
  // quando o orçamento também tiver uma data de agendamento preenchida.
  const prazo = o.agendamentoServico || o.dataPrestacaoServico || '';

  const cols: string[] = [];
  if (pagamento) cols.push(`<div class="cond-col"><div class="cond-label">Pagamento</div><div class="cond-val">${pagamento}</div></div>`);
  if (garantia) cols.push(`<div class="cond-col"><div class="cond-label">Garantia</div><div class="cond-val">${escapeHtml(garantia)}</div></div>`);
  if (prazo) cols.push(`<div class="cond-col"><div class="cond-label">Prazo</div><div class="cond-val">${escapeHtml(prazo)}</div></div>`);
  if (cols.length === 0) return '';
  return `<div class="conditions">${cols.join('')}</div>`;
}

/** Bloco "Observações" (informacoesAdicionais) — sempre exibido quando preenchido. */
function renderObservacoes(o: Orcamento): string {
  if (!o.informacoesAdicionais) return '';
  return `
    <div class="text-block">
      <div class="eyebrow">Observações</div>
      <div class="body">${escapeHtml(o.informacoesAdicionais)}</div>
    </div>
  `;
}

/**
 * Página de capa do modelo "premium_capa": fundo em gradiente da cor de marca,
 * logo/nome grande centralizado, identificação do orçamento e (se houver) a
 * primeira foto do serviço em destaque. `page-break-after: always` garante que
 * a página 2 (layout editorial padrão) comece numa folha nova tanto no
 * expo-print (Android/iOS) quanto na impressão web.
 */
function renderCapa(o: Orcamento, empresa: Empresa, accent: string): string {
  const emitidoEm = o.dataEmissao ? formatDateBR(o.dataEmissao) : formatDate(o.criadoEm);
  const contatoEmpresa = [empresa.telefone, empresa.site].filter(Boolean).join('  ·  ');
  const primeiraFoto = (o.fotosServico ?? []).map(f => img(f)).filter(Boolean)[0] ?? '';

  return `
    <div class="cover">
      <div class="cover-inner">
        <div class="cover-brand">
          ${img(empresa.logoUri)
            ? `<img src="${img(empresa.logoUri)}" class="cover-logo" />`
            : `<div class="cover-brand-name">${escapeHtml(empresa.nome)}</div>`}
        </div>
        <div class="cover-kicker">ORÇAMENTO</div>
        <div class="cover-num">Nº ${escapeHtml(o.numero)} · ${emitidoEm}</div>
        <div class="cover-cliente">${escapeHtml(o.clienteNome)}</div>
        ${primeiraFoto ? `<div class="cover-foto-wrap"><img src="${primeiraFoto}" class="cover-foto" /></div>` : ''}
        ${contatoEmpresa ? `<div class="cover-footer">${escapeHtml(contatoEmpresa)}</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * CSS das 6 variantes de modelo (mais o "editorial" default, sem classe extra).
 * Extraído em função pura para manter gerarHtmlOrcamento legível: cada modelo
 * altera estrutura de verdade (não só cor), conforme a planta v3.
 */
function cssModelos(accent: string): string {
  return `
  /* MINIMALISTA — some com watermark/spine/depoimentos, fotos viram thumb na tabela */
  .model-minimalista .spine, .model-minimalista .watermark { display: none; }
  .model-minimalista .page { padding: 52px; }
  .model-minimalista .doc-title { color: #1A2230; }
  .model-minimalista .total-box { background: #fff; }
  .model-minimalista .depoimento { display: none; }
  .model-minimalista .foto-item { width: 60px; height: 60px; }
  .model-minimalista .item-thumb { width: 32px; height: 32px; }

  /* BOLD — cabeçalho full-bleed + faixa de total invertida + pill maior */
  .model-bold .page { padding-top: 0; }
  .model-bold .header { margin: 0 -50px 26px -56px; padding: 44px 50px 34px 56px; background: linear-gradient(135deg, ${accent}, #0A2547); color: #fff; }
  .model-bold .brand-name, .model-bold .doc-title, .model-bold .doc-num { color: #fff; }
  .model-bold .brand-tagline, .model-bold .doc-date { color: rgba(255,255,255,0.75); }
  .model-bold .pill { color: #fff; border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.14); font-size: 12.5px; padding: 6px 14px; }
  .model-bold .rule { display: none; }
  .model-bold .total-box { background: ${accent}; border-color: ${accent}; flex-direction: row-reverse; }
  .model-bold .total-box-label, .model-bold .total-box-value { color: #fff; }

  /* CLASSICO — serifado no corpo todo, bordas duplas, accent contido */
  .model-classico .spine, .model-classico .watermark { display: none; }
  .model-classico .sheet { border: 3px double #16202E; }
  .model-classico .header { flex-direction: column; align-items: center; text-align: center; gap: 18px; }
  .model-classico .header-right { text-align: center; }
  .model-classico .doc-title { color: #16202E; }
  .model-classico .pill { border-color: #16202E; background: transparent; color: #16202E; }
  .model-classico .item-name, .model-classico .item-desc, .model-classico .party-info,
  .model-classico .cond-val, .model-classico .text-block .body, .model-classico .depo-text { font-family: 'Spectral', Georgia, serif; }
  .model-classico .total-box { background: #fff; border: 2px solid #16202E; }
  .model-classico .total-box-value { color: #16202E; }

  /* FAIXA LATERAL — faixa de 42px com nome/número em texto vertical */
  .model-faixa_lateral .spine { width: 42px; background: linear-gradient(180deg, ${accent}, #0A2547); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 28px; }
  .model-faixa_lateral .spine-label { writing-mode: vertical-rl; transform: rotate(180deg); color: #fff; font-size: 12px; font-weight: 800; letter-spacing: 2px; white-space: nowrap; }
  .model-faixa_lateral .page { padding-left: 84px; }
  .model-faixa_lateral .watermark { right: -150px; }

  /* RECIBO COMPACTO — folha menor, espaçamentos reduzidos */
  .model-recibo_compacto .page { padding: 32px 38px; }
  .model-recibo_compacto .doc-title { font-size: 30px; }
  .model-recibo_compacto .parties, .model-recibo_compacto .conditions { gap: 20px; }
  .model-recibo_compacto .items { margin-top: 22px; }
  .model-recibo_compacto .footer { margin-top: 24px; }

  /* PREMIUM COM CAPA — página de capa antes do conteúdo (editorial normal, sem watermark) */
  .model-premium_capa .watermark { display: none; }
  .cover {
    display: flex; align-items: center; justify-content: center;
    min-height: 1050px; page-break-after: always;
    background: linear-gradient(160deg, ${accent}, #0A2547);
    padding: 60px 50px;
  }
  .cover-inner { width: 100%; max-width: 560px; text-align: center; color: #fff; }
  .cover-brand { margin-bottom: 34px; }
  .cover-logo { max-width: 260px; max-height: 110px; object-fit: contain; }
  .cover-brand-name { font-family: 'Spectral', Georgia, serif; font-size: 40px; font-weight: 700; color: #fff; }
  .cover-kicker { font-size: 13px; font-weight: 800; letter-spacing: 6px; color: rgba(255,255,255,0.8); margin-bottom: 10px; }
  .cover-num { font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 30px; }
  .cover-cliente { font-family: 'Spectral', Georgia, serif; font-size: 30px; font-weight: 700; color: #fff; margin-bottom: 30px; }
  .cover-foto-wrap { display: flex; justify-content: center; margin-bottom: 30px; }
  .cover-foto { width: 320px; height: 220px; object-fit: cover; border-radius: 10px; border: 6px solid rgba(255,255,255,0.92); box-shadow: 0 18px 40px rgba(0,0,0,0.35); }
  .cover-footer { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 10px; }
  `;
}

function renderApprovalGuide(o: Orcamento): string {
  if (o.exibirAprovacao === false && o.exibirRecusa === false && !o.solicitarAssinaturaCliente) {
    return '';
  }

  const passos: string[] = [];
  if (o.exibirAprovacao !== false) {
    passos.push('Para aprovar, responda "aprovado" no WhatsApp ou confirme pelo link enviado.');
  }
  if (o.solicitarAssinaturaCliente) {
    passos.push('Se preferir, assine no campo abaixo e devolva este documento ao prestador.');
  }
  if (o.exibirRecusa !== false) {
    passos.push('Se quiser ajustar algum item, responda com a dúvida ou motivo da recusa.');
  }
  if (passos.length === 0) return '';

  return `
    <div class="approval-guide">
      <div>
        <div class="approval-kicker">Próximo passo</div>
        <div class="approval-title">Como fechar este orçamento</div>
      </div>
      <div class="approval-copy">${passos.map(escapeHtml).join('<br/>')}</div>
    </div>
  `;
}

export function gerarHtmlOrcamento(
  o: Orcamento,
  empresa: Empresa,
  depoimentos: Depoimento[],
  accentRaw?: string,
): string {
  // Cor de marca configurável: valida como hex antes de interpolar em <style>/SVG.
  const accent = safeHexColor(accentRaw ?? o.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT);
  const modelClass = `model-${o.modeloPdf ?? 'editorial'}`;

  const itensHtml = renderItensTabela(o.itens);
  const condicoesHtml = renderCondicoes(o);
  const approvalGuideHtml = renderApprovalGuide(o);
  const observacoesHtml = renderObservacoes(o);

  // Tons claros do accent pré-calculados (color-mix nem sempre roda no expo-print).
  const accentSoft = mixWhite(accent, 0.09);   // fundo do TOTAL / pílula
  const accentBorder = mixWhite(accent, 0.30);  // borda
  const accentChipBg = mixWhite(accent, 0.07);
  const accentBadgeBg = mixWhite(accent, 0.10); // fundo do badge "PEÇA"

  const emitidoEm = o.dataEmissao ? formatDateBR(o.dataEmissao) : formatDate(o.criadoEm);
  const tagline = empresa.especialidade || empresa.slogan || '';

  // Valor monetário real do desconto (independe de descontoTipo valor/percentual).
  const descontoValor = o.subtotal - o.valorTotal;

  const enderecoEmpresa = [
    empresa.endereco,
    [empresa.cidade, empresa.estado].filter(Boolean).join('/'),
  ].filter(Boolean).join(' · ');
  const contatoEmpresa = [empresa.telefone, empresa.email].filter(Boolean).join(' · ');

  // Escapa CADA parte antes de juntar com o <br/> (marcação fixa controlada).
  const clienteLinhas = [
    o.clienteEndereco,
    o.clienteCpfCnpj ? `CPF/CNPJ ${o.clienteCpfCnpj}` : '',
    o.clienteTelefone,
  ].filter(Boolean).map(escapeHtml).join('<br/>');

  const depoimentosHtml = depoimentos.length > 0 ? `
    <div class="block">
      <div class="eyebrow">Depoimentos</div>
      ${depoimentos.map(d => `
        <div class="depoimento">
          <div class="depo-head"><strong>${escapeHtml(d.nomeCliente)}</strong> <span class="stars">${renderStars(d.estrelas)}</span></div>
          ${d.texto ? `<p class="depo-text">${escapeHtml(d.texto)}</p>` : ''}
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
  .approval-guide { margin-top: 26px; border: 1px solid ${accentBorder}; background: ${accentChipBg}; border-radius: 14px; padding: 16px 18px; display: flex; gap: 22px; align-items: flex-start; page-break-inside: avoid; }
  .approval-kicker { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: ${accent}; text-transform: uppercase; white-space: nowrap; }
  .approval-title { font-family: 'Spectral', Georgia, serif; font-size: 18px; font-weight: 700; color: #16202E; margin-top: 2px; white-space: nowrap; }
  .approval-copy { flex: 1; font-size: 12.5px; color: #3C4756; line-height: 1.65; }

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

  /* Variantes escolhidas no app — cada modelo com identidade estrutural própria. */
  ${cssModelos(accent)}

  @media print { .page { padding: 40px 46px; } }
</style>
</head>
<body>
${o.modeloPdf === 'premium_capa' ? renderCapa(o, empresa, accent) : ''}
<div class="sheet ${modelClass}">
  <div class="spine">${o.modeloPdf === 'faixa_lateral' ? `<span class="spine-label">${escapeHtml(empresa.nome)} · Nº ${escapeHtml(o.numero)}</span>` : ''}</div>
  <div class="watermark">${monogramSvg(accent, 360, 0.05)}</div>

  <div class="page">

    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        ${img(empresa.logoUri) ? `<img src="${img(empresa.logoUri)}" class="brand-logo" />` : ''}
        <div class="brand-name">${escapeHtml(empresa.nome)}</div>
        ${tagline ? `<div class="brand-tagline">${escapeHtml(tagline)}</div>` : ''}
      </div>
      <div class="header-right">
        <div class="doc-title">Orçamento</div>
        <div class="doc-num">Nº ${escapeHtml(o.numero)}</div>
        <div class="doc-date">Emitido em ${emitidoEm}</div>
        ${o.validadeOrcamento ? `<div class="pill">Válido até ${formatDateBR(o.validadeOrcamento)}</div>` : `<div class="pill">Válido por 15 dias</div>`}
      </div>
    </div>

    <div class="rule"></div>

    <!-- PARTIES -->
    <div class="parties">
      <div class="party">
        <div class="eyebrow">Prestador</div>
        <div class="party-name">${escapeHtml(empresa.nome)}</div>
        <div class="party-info">
          ${empresa.cnpj ? `CNPJ ${escapeHtml(empresa.cnpj)}<br/>` : ''}
          ${enderecoEmpresa ? `${escapeHtml(enderecoEmpresa)}<br/>` : ''}
          ${escapeHtml(contatoEmpresa)}
        </div>
      </div>
      <div class="party-divider"></div>
      <div class="party">
        <div class="eyebrow">Cliente</div>
        <div class="party-name">${escapeHtml(o.clienteNome)}</div>
        <div class="party-info">${clienteLinhas}</div>
      </div>
    </div>

    <!-- ITENS -->
    ${itensHtml}

    <!-- TOTAIS -->
    <div class="totals">
      <div class="totals-inner">
        <div class="total-line"><span>Subtotal</span><span>${formatCurrency(o.subtotal)}</span></div>
        <div class="total-line discount"><span>Desconto</span><span>${descontoValor > 0 ? `- ${formatCurrency(descontoValor)}` : '—'}</span></div>
        <div class="total-box">
          <span class="total-box-label">TOTAL</span>
          <span class="total-box-value">${formatCurrency(o.valorTotal)}</span>
        </div>
      </div>
    </div>

    <!-- CONDIÇÕES -->
    ${condicoesHtml}
    ${approvalGuideHtml}

    <!-- CONDIÇÕES CONTRATUAIS (texto livre, opcional) -->
    ${o.condicoesContratuais ? `
      <div class="text-block">
        <div class="eyebrow">Condições contratuais</div>
        <div class="body">${escapeHtml(o.condicoesContratuais)}</div>
      </div>
    ` : ''}

    <!-- OBSERVAÇÕES (texto livre, opcional — inclui observações padrão da empresa) -->
    ${observacoesHtml}

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
          <div class="sign-caption sign-name">${escapeHtml(o.clienteNome)}</div>
        </div>
        <div class="sign-col">
          ${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri) ? `<img src="${img(o.assinaturaPrestadorUri) || img(empresa.assinaturaUri)}" class="sign-img" />` : ''}
          <div class="sign-line"></div>
          <div class="sign-caption">${escapeHtml(empresa.nome)}</div>
          <div class="sign-caption sign-name">${escapeHtml(empresa.nomePrestador || '')}</div>
        </div>
      </div>
    ` : ''}

    <!-- FOOTER -->
    <div class="footer">
      <span class="footer-contact">${escapeHtml(contatoEmpresa || empresa.nome)}</span>
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
  accent?: string,
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
  accent?: string,
): Promise<void> {
  const html = await montarHtmlOrcamentoCompleto(o, empresa, depoimentos, accent);
  const fileName = `Orcamento-${safeFileName(o.clienteNome)}-${o.numero}`;
  await exportarHtmlComoPdf(html, fileName, {
    dialogTitle: `Orçamento ${o.numero} - ${o.clienteNome}`,
  });
}
