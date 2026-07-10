import { Orcamento, Empresa, Depoimento, ItemOrcamento } from '../types';
import { formatCurrency, formatNumber } from './currency';
import { formatDate, formatDateBR } from './date';
import { imagemParaDataUri } from './imagemDataUri';
import { exportarHtmlComoPdf, safeFileName } from './exportarDocumento';
import { escapeHtml, safeHexColor } from './html';

// Reexportado para compatibilidade: o WhatsApp agora vive no helper de saída.
export { abrirWhatsApp } from './exportarDocumento';

/* ─── Contrato entre frentes ──────────────────────────────────────
 * A capa e a marca OLLI são controladas por dois eixos independentes:
 *
 *  1) COMO O DOCUMENTO COMEÇA (`o.capaEstilo` / `o.capaFotoUri`) — campos
 *     ADITIVOS no interface Orcamento (adicionados pela Frente B). Como esta
 *     frente (engine) roda contra o contrato ANTES de os campos existirem no
 *     tipo, leio-os por um acessor tipado (CapaCampos) em vez de alargar o
 *     tipo aqui. Quando a Frente B adicionar os campos ao Orcamento, este
 *     acessor continua válido (é um supertipo estrutural).
 *
 *  2) SE A MARCA OLLI APARECE (`opts.removerMarca`) — decidido pelo call site
 *     via entitlement (`temAcesso('remove_olli_brand')`, Frente C). Default
 *     `false` => rodapé DISCRETO da OLLI em todo documento. `true` (Pro/
 *     Empresa) => sem esse rodapé (dados legais/PIX/validade PERMANECEM).
 */
import { qrSvg } from './qrcode';

export type CapaEstilo = 'logo' | 'foto' | 'nenhuma';

interface CapaCampos {
  capaEstilo?: CapaEstilo;
  capaFotoUri?: string;
}

/** Opções de geração do PDF. Tudo opcional — chamadas antigas seguem válidas. */
export interface OpcoesPdf {
  /** true (Pro/Empresa) remove o rodapé da marca OLLI. Default false. */
  removerMarca?: boolean;
  /**
   * URL pública do orçamento (`https://link.../o/<token>`). Quando presente, o PDF
   * ganha os blocos de QR "Aprovar" e "Recusar". Ausente (offline, sem nuvem), o
   * documento cai no texto de instrução de sempre — nunca mostra um QR morto.
   */
  linkPublico?: string;
}

/** Estilo de capa efetivo (default 'logo'), validado contra valores conhecidos. */
function capaEstiloDe(o: Orcamento): CapaEstilo {
  const v = (o as CapaCampos).capaEstilo;
  return v === 'foto' || v === 'nenhuma' || v === 'logo' ? v : 'logo';
}

function capaFotoUriDe(o: Orcamento): string | undefined {
  return (o as CapaCampos).capaFotoUri;
}

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
  [empresa.logoUri, empresa.assinaturaUri, o.assinaturaPrestadorUri, o.assinaturaClienteUri, capaFotoUriDe(o)]
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
 * Decide se ESTE documento tem página de capa e de que tipo, cruzando o estilo
 * pedido (`capaEstilo`) com o que existe de fato (logo/foto). Fonte única da
 * verdade para (a) montar a capa e (b) decidir se o header repete a logo — é
 * isso que evita a "logo dividida em 2" (capa + header renderizando a logo).
 *
 *  - 'nenhuma'  => sem capa; o documento começa direto no header (com logo).
 *  - 'logo'     => capa com a logo (ou o nome, se não houver logo). O header
 *                  NÃO repete a logo — a logo já é a estrela da capa.
 *  - 'foto'     => capa com a foto escolhida (capaFotoUri) ou, faltando ela, a
 *                  1ª foto do serviço; sem nenhuma foto, cai para 'logo'.
 */
type PlanoCapa =
  | { tipo: 'nenhuma' }
  | { tipo: 'logo' }
  | { tipo: 'foto'; fotoSrc: string };

function planejarCapa(o: Orcamento, empresa: Empresa): PlanoCapa {
  const estilo = capaEstiloDe(o);
  if (estilo === 'nenhuma') return { tipo: 'nenhuma' };
  if (estilo === 'foto') {
    const escolhida = img(capaFotoUriDe(o));
    const primeiraFoto = (o.fotosServico ?? []).map(f => img(f)).filter(Boolean)[0] ?? '';
    const fotoSrc = escolhida || primeiraFoto;
    if (fotoSrc) return { tipo: 'foto', fotoSrc };
    // Sem foto disponível: não deixa a capa "vazia" — usa a logo/nome.
    return { tipo: 'logo' };
  }
  return { tipo: 'logo' };
}

/**
 * Página de capa (uma folha, `page-break-after: always`). Duas variantes:
 *  - logo: gradiente da marca + logo (object-fit:contain, uma vez, inteira) ou
 *    o nome da empresa quando não há logo.
 *  - foto: a foto ocupa a folha inteira; um overlay escuro na base garante o
 *    contraste do título/cliente por cima da imagem.
 * A logo, quando presente, aparece SÓ AQUI (o header não a repete) — nunca duas
 * vezes no mesmo documento.
 */
function renderCapa(o: Orcamento, empresa: Empresa, plano: PlanoCapa): string {
  if (plano.tipo === 'nenhuma') return '';

  const emitidoEm = o.dataEmissao ? formatDateBR(o.dataEmissao) : formatDate(o.criadoEm);
  const contatoEmpresa = [empresa.telefone, empresa.site].filter(Boolean).join('  ·  ');
  const logoSrc = img(empresa.logoUri);

  if (plano.tipo === 'foto') {
    return `
    <div class="cover cover-photo">
      <img src="${plano.fotoSrc}" class="cover-bg" />
      <div class="cover-scrim"></div>
      <div class="cover-inner cover-inner-photo">
        ${logoSrc
          ? `<img src="${logoSrc}" class="cover-logo cover-logo-onphoto" />`
          : `<div class="cover-brand-name">${escapeHtml(empresa.nome)}</div>`}
        <div class="cover-kicker">ORÇAMENTO</div>
        <div class="cover-num">Nº ${escapeHtml(o.numero)} · ${emitidoEm}</div>
        <div class="cover-cliente">${escapeHtml(o.clienteNome)}</div>
        ${contatoEmpresa ? `<div class="cover-footer">${escapeHtml(contatoEmpresa)}</div>` : ''}
      </div>
    </div>
  `;
  }

  // plano.tipo === 'logo'
  return `
    <div class="cover">
      <div class="cover-inner">
        <div class="cover-brand">
          ${logoSrc
            ? `<img src="${logoSrc}" class="cover-logo" />`
            : `<div class="cover-brand-name">${escapeHtml(empresa.nome)}</div>`}
        </div>
        <div class="cover-kicker">ORÇAMENTO</div>
        <div class="cover-num">Nº ${escapeHtml(o.numero)} · ${emitidoEm}</div>
        <div class="cover-cliente">${escapeHtml(o.clienteNome)}</div>
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

  /* PREMIUM COM CAPA — mantém o watermark fora da 1ª página de conteúdo (a capa
     já carrega a marca). A CAPA em si é genérica (qualquer modelo pode ter capa
     via o.capaEstilo), então o CSS da .cover vive fora do escopo do modelo. */
  .model-premium_capa .watermark { display: none; }

  /* ─── CAPA (logo ou foto) ─────────────────────────────────────
     Uma folha inteira, sempre seguida de quebra de página. */
  .cover {
    position: relative; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    min-height: 1050px; page-break-after: always;
    background: linear-gradient(160deg, ${accent}, #0A2547);
    padding: 60px 50px;
  }
  .cover-inner { position: relative; width: 100%; max-width: 560px; text-align: center; color: #fff; }
  .cover-brand { margin-bottom: 34px; display: flex; justify-content: center; }
  /* Logo da capa: object-fit:contain + max-width/max-height (sem dimensão fixa)
     para caber INTEIRA e sem distorção em qualquer proporção. */
  .cover-logo { max-width: 300px; max-height: 130px; width: auto; height: auto; object-fit: contain; }
  .cover-brand-name { font-family: 'Spectral', Georgia, serif; font-size: 40px; font-weight: 700; color: #fff; line-height: 1.15; }
  .cover-kicker { font-size: 13px; font-weight: 800; letter-spacing: 6px; color: rgba(255,255,255,0.82); margin-bottom: 10px; }
  .cover-num { font-size: 13px; color: rgba(255,255,255,0.72); margin-bottom: 30px; }
  .cover-cliente { font-family: 'Spectral', Georgia, serif; font-size: 30px; font-weight: 700; color: #fff; margin-bottom: 30px; line-height: 1.2; word-break: break-word; }
  .cover-footer { font-size: 12px; color: rgba(255,255,255,0.72); margin-top: 10px; }

  /* CAPA COM FOTO — a foto preenche a folha; scrim escuro na base dá contraste. */
  .cover-photo { padding: 0; background: #0A2547; }
  .cover-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .cover-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(6,12,24,0.28) 0%, rgba(6,12,24,0.20) 42%, rgba(6,12,24,0.86) 100%); }
  .cover-inner-photo { align-self: flex-end; max-width: 620px; padding: 0 56px 72px; text-align: left; }
  .cover-inner-photo .cover-brand-name { text-shadow: 0 2px 14px rgba(0,0,0,0.5); }
  .cover-inner-photo .cover-cliente { text-shadow: 0 2px 14px rgba(0,0,0,0.5); }
  .cover-logo-onphoto { max-width: 210px; max-height: 78px; margin-bottom: 22px; filter: drop-shadow(0 3px 10px rgba(0,0,0,0.45)); }
  `;
}

/**
 * Bloco de QR para uma ação do cliente.
 *
 * O SVG vai INLINE, não como `<img src="data:image/svg+xml...">`: o motor de
 * impressão do iOS (UIMarkupTextPrintFormatter) costuma ignorar data-URI de SVG,
 * enquanto o do Android (Chromium) as renderiza. Um QR que aparece num celular e
 * some no outro entrega ao cliente um retângulo branco.
 *
 * A URL vai TAMBÉM por extenso: numa folha impressa, num PDF aberto no desktop, ou
 * num leitor que não abre a câmera, o texto é a única saída.
 */
function renderQrAcao(url: string, rotulo: string, legenda: string, classe: string): string {
  return `
    <div class="qr-card ${classe}">
      <div class="qr-rotulo">${escapeHtml(rotulo)}</div>
      <div class="qr-img">${qrSvg(url)}</div>
      <div class="qr-legenda">${escapeHtml(legenda)}</div>
      <div class="qr-url">${escapeHtml(url)}</div>
    </div>
  `;
}

/**
 * "Como fechar este orçamento".
 *
 * BOTÃO DENTRO DO PDF NÃO EXISTE. Botões reais em PDF exigem AcroForm com
 * JavaScript, e praticamente todo visualizador o bloqueia (WhatsApp, Quick Look do
 * iOS, Gmail, leitor do Chrome): o cliente clicaria e nada aconteceria, sem
 * mensagem de erro. E este PDF é gerado no aparelho por `expo-print`, cujo motor
 * no iOS descarta até hiperlinks comuns — o link funcionaria no Android e morreria
 * no iPhone.
 *
 * O QR funciona em todo lugar, inclusive numa folha impressa. Ele leva à página
 * pública, que tem botões de verdade e grava a decisão de forma atômica.
 *
 * O QR NUNCA aprova sozinho: `?acao=` só PRÉ-SELECIONA na página. `GET` não pode
 * mudar estado — um pré-visualizador de link (WhatsApp, Slack) que buscasse a URL
 * aprovaria o orçamento sem o cliente tocar em nada.
 */
function renderApprovalGuide(o: Orcamento, linkPublico?: string): string {
  const podeAprovar = o.exibirAprovacao !== false;
  const podeRecusar = o.exibirRecusa !== false;
  if (!podeAprovar && !podeRecusar && !o.solicitarAssinaturaCliente) return '';

  // Com link publicado: QR de ação. Sem link (offline / sem nuvem): texto de sempre.
  const temQr = !!linkPublico && (podeAprovar || podeRecusar);
  if (temQr) {
    const base = linkPublico as string;
    const sep = base.includes('?') ? '&' : '?';
    const cards = [
      podeAprovar
        ? renderQrAcao(`${base}${sep}acao=aprovar`, 'Aprovar', 'Aponte a câmera do celular', 'qr-aprovar')
        : '',
      podeRecusar
        ? renderQrAcao(`${base}${sep}acao=recusar`, 'Recusar ou pedir ajuste', 'Aponte a câmera do celular', 'qr-recusar')
        : '',
    ].filter(Boolean).join('');

    const nota = o.solicitarAssinaturaCliente
      ? 'Se preferir, assine no campo abaixo e devolva este documento ao prestador.'
      : 'A confirmação ainda pede um toque na página — o QR só abre a opção escolhida.';

    return `
      <div class="approval-guide approval-guide-qr">
        <div class="approval-head">
          <div class="approval-kicker">Próximo passo</div>
          <div class="approval-title">Como fechar este orçamento</div>
          <div class="approval-copy">${escapeHtml(nota)}</div>
        </div>
        <div class="qr-acoes">${cards}</div>
      </div>
    `;
  }

  const passos: string[] = [];
  if (podeAprovar) {
    passos.push('Para aprovar, responda "aprovado" no WhatsApp ou confirme pelo link enviado.');
  }
  if (o.solicitarAssinaturaCliente) {
    passos.push('Se preferir, assine no campo abaixo e devolva este documento ao prestador.');
  }
  if (podeRecusar) {
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
  opts?: OpcoesPdf,
): string {
  // Cor de marca configurável: valida como hex antes de interpolar em <style>/SVG.
  const accent = safeHexColor(accentRaw ?? o.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT);
  const modelClass = `model-${o.modeloPdf ?? 'editorial'}`;
  const removerMarca = opts?.removerMarca === true;

  // A capa é decidida por o.capaEstilo/o.capaFotoUri (default 'logo'). O modelo
  // premium_capa continua começando com capa; nos demais, a capa só aparece se o
  // usuário pediu explicitamente (estilo != default) OU há uma foto de capa —
  // preservando o comportamento atual de quem nunca configurou capa.
  const capaConfigurada =
    (o as CapaCampos).capaEstilo !== undefined || (o as CapaCampos).capaFotoUri !== undefined;
  const planoCapa: PlanoCapa =
    o.modeloPdf === 'premium_capa' || capaConfigurada
      ? planejarCapa(o, empresa)
      : { tipo: 'nenhuma' };

  // Se a CAPA já mostra a logo, o header NÃO a repete (evita a "logo dividida
  // em 2": mesma logo na capa e no cabeçalho lida como duplicada/cortada).
  // A logo aparece na capa em AMBOS os tipos que a desenham: 'logo' (capa da
  // marca) e 'foto' (logo sobreposta na foto de capa). A capa-foto só existe
  // quando há foto (senão planejarCapa cai para 'logo'), então tipo==='foto'
  // sempre implica logo desenhada sobre a foto quando há logo.
  const capaMostraLogo =
    (planoCapa.tipo === 'logo' || planoCapa.tipo === 'foto') && !!img(empresa.logoUri);
  const mostrarLogoNoHeader = !!img(empresa.logoUri) && !capaMostraLogo;

  const itensHtml = renderItensTabela(o.itens);
  const condicoesHtml = renderCondicoes(o);
  const approvalGuideHtml = renderApprovalGuide(o, opts?.linkPublico);
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

  // Rodapé do prestador — contato + PIX (dado legal/comercial). Este bloco é
  // SEMPRE renderizado; removerMarca só afeta a linha da marca OLLI, nunca isto.
  const pixRodape = o.chavePix || empresa.chavePix || '';
  const rodapeContato = [contatoEmpresa || empresa.nome, pixRodape ? `PIX ${pixRodape}` : '']
    .filter(Boolean)
    .join('  ·  ');

  // Marca OLLI discreta (apenas quando removerMarca é falsy). Texto fixo/controlado.
  const brandOlliHtml = removerMarca
    ? ''
    : `<div class="brand-olli">Orçamento feito com OLLI · <a href="https://olliorcamentos.online">olliorcamentos.online</a></div>`;

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
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .header-left { min-width: 0; }
  /* Logo do cabeçalho: NUNCA largura+altura fixas (achata/distorce). max-width +
     max-height + object-fit:contain deixam a logo aparecer INTEIRA e na proporção
     certa em qualquer formato (horizontal, vertical, quadrada, muito larga). */
  .brand-logo { max-width: 200px; max-height: 64px; width: auto; height: auto; object-fit: contain; margin-bottom: 12px; display: block; }
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
  .party { flex: 1; min-width: 0; }
  .party-divider { width: 1px; background: #E7E9EE; flex-shrink: 0; }
  .eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 1.5px; color: #9AA3B2; text-transform: uppercase; }
  .party-name { font-size: 14.5px; font-weight: 700; color: #1A2230; margin-top: 9px; overflow-wrap: anywhere; }
  .party-info { font-size: 12.5px; color: #5A6575; line-height: 1.7; margin-top: 4px; overflow-wrap: anywhere; }

  /* ITEMS */
  .items { margin-top: 32px; }
  .items-head { display: flex; align-items: center; padding: 0 4px 11px; border-bottom: 2px solid #1A2230; }
  .col-desc-h { flex: 1; min-width: 0; }
  .col-qtd-h { width: 56px; flex-shrink: 0; text-align: center; }
  .col-unit-h { width: 112px; flex-shrink: 0; text-align: right; }
  .col-total-h { width: 118px; flex-shrink: 0; text-align: right; }
  .items-head span { font-size: 10.5px; font-weight: 800; letter-spacing: 1.2px; color: #6B7686; text-transform: uppercase; }

  .item-row { display: flex; align-items: flex-start; padding: 15px 4px; border-bottom: 1px solid #EDEFF2; page-break-inside: avoid; }
  .item-main { flex: 1; min-width: 0; display: flex; gap: 10px; align-items: flex-start; }
  /* min-width:0 no texto deixa nomes/descrições longos QUEBRAREM em vez de empurrar
     as colunas de valor para fora da folha (item com nome gigante sem espaços). */
  .item-text { min-width: 0; flex: 1; }
  .item-thumb { width: 42px; height: 42px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
  .item-name { font-size: 14px; font-weight: 600; color: #1A2230; overflow-wrap: anywhere; }
  .item-desc { font-size: 11.5px; color: #8A93A2; margin-top: 2px; overflow-wrap: anywhere; }
  .badge-peca { font-size: 10px; font-weight: 700; color: ${accent}; background: ${accentBadgeBg}; border-radius: 5px; padding: 1px 6px; letter-spacing: 0.3px; }
  /* Colunas de valor com largura mínima fixa (flex-shrink:0) — números grandes
     mantêm o alinhamento sem serem espremidos pela descrição. */
  .col-qtd { width: 56px; flex-shrink: 0; text-align: center; font-size: 13.5px; color: #5A6575; }
  .col-unit { width: 112px; flex-shrink: 0; text-align: right; font-size: 13.5px; color: #5A6575; }
  .col-total { width: 118px; flex-shrink: 0; text-align: right; font-size: 14px; font-weight: 700; color: #1A2230; }

  /* TOTALS */
  .totals { display: flex; justify-content: flex-end; margin-top: 24px; }
  .totals-inner { width: 320px; max-width: 100%; }
  .total-line { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-size: 13px; color: #5A6575; }
  .total-line span:last-child { text-align: right; overflow-wrap: anywhere; }
  .total-line.discount span:last-child { color: #C0392B; }
  .total-box { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 10px; padding: 14px 18px; border-radius: 12px; background: ${accentSoft}; border: 1px solid ${accentBorder}; }
  .total-box-label { font-size: 13px; font-weight: 700; color: #1A2230; letter-spacing: 0.3px; flex-shrink: 0; }
  .total-box-value { font-family: 'Spectral', Georgia, serif; font-size: 25px; font-weight: 700; color: ${accent}; text-align: right; overflow-wrap: anywhere; line-height: 1.05; }

  /* CONDITIONS */
  .conditions { display: flex; gap: 30px; margin-top: 34px; padding-top: 24px; border-top: 1px solid #E7E9EE; }
  .cond-col { flex: 1; }
  .cond-label { font-size: 10px; font-weight: 800; letter-spacing: 1.3px; color: #9AA3B2; text-transform: uppercase; }
  .cond-val { font-size: 12.5px; color: #3C4756; margin-top: 6px; line-height: 1.55; }
  .approval-guide { margin-top: 26px; border: 1px solid ${accentBorder}; background: ${accentChipBg}; border-radius: 14px; padding: 16px 18px; display: flex; gap: 22px; align-items: flex-start; page-break-inside: avoid; }
  /* Variante com QR: empilha o texto sobre os dois cartões de ação. */
  .approval-guide-qr { display: block; }
  .approval-head { margin-bottom: 14px; }
  .qr-acoes { display: flex; gap: 14px; align-items: stretch; }
  .qr-card { flex: 1; background: #FFFFFF; border: 1.5px solid ${accentBorder}; border-radius: 12px; padding: 12px 10px 10px; text-align: center; page-break-inside: avoid; }
  /* Cor só na borda e no rótulo: o QR PRECISA de módulos escuros sobre branco puro
     para a câmera ler. Fundo colorido atrás do código quebra a leitura. */
  .qr-aprovar { border-color: ${accent}; }
  .qr-recusar { border-color: #C6CEDA; }
  .qr-rotulo { font-size: 12px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; margin-bottom: 8px; color: #0A2540; }
  .qr-aprovar .qr-rotulo { color: ${accent}; }
  .qr-img { display: block; margin: 0 auto 8px; width: 128px; height: 128px; }
  .qr-img svg { width: 100%; height: 100%; display: block; }
  .qr-legenda { font-size: 9.5px; color: #5A6A7D; margin-bottom: 4px; }
  .qr-url { font-size: 7.5px; color: #8A97A6; word-break: break-all; line-height: 1.25; }
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
  .footer { border-top: 1px solid #EDEFF2; margin-top: 36px; padding-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .footer-contact { font-size: 11px; color: #8A93A2; overflow-wrap: anywhere; }
  /* Marca OLLI — discreta e não intrusiva. Removida (removerMarca) para Pro/Empresa;
     NUNCA leva dado legal/PIX/validade junto (esses ficam no .footer-contact). */
  .brand-olli { text-align: center; margin-top: 14px; font-size: 9.5px; letter-spacing: 0.3px; color: #C2C8D2; }
  .brand-olli a { color: #C2C8D2; text-decoration: none; }

  /* Variantes escolhidas no app — cada modelo com identidade estrutural própria. */
  ${cssModelos(accent)}

  @media print { .page { padding: 40px 46px; } }
</style>
</head>
<body>
${renderCapa(o, empresa, planoCapa)}
<div class="sheet ${modelClass}">
  <div class="spine">${o.modeloPdf === 'faixa_lateral' ? `<span class="spine-label">${escapeHtml(empresa.nome)} · Nº ${escapeHtml(o.numero)}</span>` : ''}</div>
  <div class="watermark">${monogramSvg(accent, 360, 0.05)}</div>

  <div class="page">

    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        ${mostrarLogoNoHeader ? `<img src="${img(empresa.logoUri)}" class="brand-logo" />` : ''}
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

    <!-- FOOTER — dados do prestador (contato/PIX/validade) SEMPRE presentes -->
    <div class="footer">
      <span class="footer-contact">${escapeHtml(rodapeContato)}</span>
      ${o.validadeOrcamento ? `<span class="footer-contact">Válido até ${formatDateBR(o.validadeOrcamento)}</span>` : ''}
    </div>
    ${brandOlliHtml}

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
  opts?: OpcoesPdf,
): Promise<string> {
  await populateImages(o, empresa);
  return gerarHtmlOrcamento(o, empresa, depoimentos, accent, opts);
}

/**
 * Link público do orçamento, se der. NUNCA lança: sem nuvem, sem login ou sem
 * internet o PDF sai com o texto de instrução em vez do QR — melhor um documento
 * sem QR do que um QR que não resolve.
 *
 * `import` dinâmico de propósito: `clienteLink` puxa supabase e o banco, e o
 * pdfGenerator é usado em contextos (preview, teste) onde isso não deve carregar.
 */
async function obterLinkPublico(o: Orcamento, empresa: Empresa | null): Promise<string | undefined> {
  try {
    const { gerarLinkOrcamento, linkConfigurado } = await import('../services/clienteLink');
    if (!linkConfigurado()) return undefined;
    return await gerarLinkOrcamento(o, empresa);
  } catch {
    return undefined;
  }
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
  opts?: OpcoesPdf,
): Promise<void> {
  const comLink: OpcoesPdf = { ...opts, linkPublico: opts?.linkPublico ?? (await obterLinkPublico(o, empresa)) };
  const html = await montarHtmlOrcamentoCompleto(o, empresa, depoimentos, accent, comLink);
  const fileName = `Orcamento-${safeFileName(o.clienteNome)}-${o.numero}`;
  await exportarHtmlComoPdf(html, fileName, {
    dialogTitle: `Orçamento ${o.numero} - ${o.clienteNome}`,
  });
}
