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
 * próxima recomendada e os botões "Chamar no WhatsApp" e "Pedir orçamento".
 * Para o técnico, o mesmo QR faz o check-in no app.
 *
 * ETIQUETA IDEAL (a que se compra ou se manda à gráfica):
 *  99,1 × 38,1 mm, 14 por folha A4 (2 colunas × 7). É o corte da Avery L7163,
 *  vendido no Brasil como Pimaco A4363 e Colacril CA4363. A grade fecha na A4:
 *  margem 4,65 mm + 99,1 + vão 2,5 + 99,1 + 4,65 = 210; topo 15,15 + 7×38,1 +
 *  15,15 = 297. Em casa imprime em 100%, sem ajustar à página. Na gráfica o
 *  pedido é vinil branco fosco, permanente, laminação fosca, o mesmo corte.
 *  O QR fica em 28 mm (nunca abaixo de 24 mm; a quiet zone já vem no qrSvg).
 *
 * Os três tamanhos antigos (4,2 cm, 6 cm, 9 × 4,5 cm) continuam para quem não
 * tem a folha: linha tracejada e tesoura.
 *
 *  - TOKEN VAZIO: sem qrToken não há etiqueta.
 *  - MARCA: logo e contato do PRESTADOR. Nada de nome, telefone ou CPF do cliente.
 *  - SELO "Feito com OLLI": só no Grátis, fora do adesivo (na margem da folha).
 *  - IMPRESSÃO: HTML puro, QR inline (SVG, sem rede).
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

export type TamanhoEtiqueta = 'padrao' | 'pequena' | 'media' | 'grande';

interface MedidaEtiqueta {
  rotulo: string;
  /** Largura do adesivo (mm). */
  larguraMm: number;
  /** Altura fixa do adesivo (mm). Sem isso, a altura cresce com o texto (recorte). */
  alturaMm?: number;
  /** Lado do QR (mm), já com a quiet zone do SVG. */
  qrMm: number;
  /** horizontal = QR à esquerda e texto à direita; vertical = QR em cima. */
  layout: 'horizontal' | 'vertical';
}

/**
 * Folha adesiva padrão. Números da grade Avery L7163 / J8163, que somam a A4
 * sem sobra. Pimaco A4363 e Colacril CA4363 são vendidos nesse corte
 * (99 × 38,1 mm, 14 por folha). Não medimos uma folha física nesta mudança.
 */
export const FOLHA_ADESIVO_PADRAO = {
  modelo: 'Pimaco A4363',
  equivalentes: 'Colacril CA4363 ou Avery L7163',
  larguraMm: 99.1,
  alturaMm: 38.1,
  qrMm: 28,
  margemEsqMm: 4.65,
  margemTopoMm: 15.15,
  passoXMm: 101.6,
  passoYMm: 38.1,
  colunas: 2,
  linhas: 7,
  raioMm: 2,
  paginaLarguraMm: 210,
  paginaAlturaMm: 297,
} as const;

export const POR_FOLHA_PADRAO = FOLHA_ADESIVO_PADRAO.colunas * FOLHA_ADESIVO_PADRAO.linhas;

/** Frase única da tela, da ajuda e do PDF. */
export const TEXTO_ETIQUETA_IDEAL =
  'Etiqueta ideal: 99,1 × 38,1 mm. Em casa, folha A4 Pimaco A4363 ou Colacril CA4363 (14 adesivos). Imprima em 100%, sem ajustar à página e sem cabeçalho. Na gráfica: vinil branco fosco, adesivo permanente, laminação fosca, no mesmo tamanho.';

/** Os adesivos. `padrao` é a folha pronta; os outros três são para recortar. */
export const TAMANHOS_ETIQUETA: Record<TamanhoEtiqueta, MedidaEtiqueta> = {
  padrao: {
    rotulo: 'Ideal (99 × 38 mm)',
    larguraMm: FOLHA_ADESIVO_PADRAO.larguraMm,
    alturaMm: FOLHA_ADESIVO_PADRAO.alturaMm,
    qrMm: FOLHA_ADESIVO_PADRAO.qrMm,
    layout: 'horizontal',
  },
  pequena: { rotulo: 'Adesivo pequeno (4,2 cm)', larguraMm: 42, qrMm: 26, layout: 'vertical' },
  media: { rotulo: 'Adesivo médio (6 cm)', larguraMm: 60, qrMm: 34, layout: 'vertical' },
  grande: { rotulo: 'Adesivo grande (9 × 4,5 cm)', larguraMm: 90, qrMm: 36, layout: 'horizontal' },
};

export const TAMANHO_ETIQUETA_PADRAO: TamanhoEtiqueta = 'padrao';

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

/** Onde a etiqueta `indice` (0-based) cai na folha padrão. */
export function posicaoEtiquetaPadrao(indice: number): { pagina: number; esquerdaMm: number; topoMm: number } {
  const f = FOLHA_ADESIVO_PADRAO;
  const i = Math.max(0, Math.floor(indice));
  const naFolha = i % POR_FOLHA_PADRAO;
  const col = naFolha % f.colunas;
  const lin = Math.floor(naFolha / f.colunas);
  return {
    pagina: Math.floor(i / POR_FOLHA_PADRAO),
    esquerdaMm: arredondarMm(f.margemEsqMm + col * f.passoXMm),
    topoMm: arredondarMm(f.margemTopoMm + lin * f.passoYMm),
  };
}

function arredondarMm(n: number): number {
  return Math.round(n * 100) / 100;
}

function mm(n: number): string {
  return `${arredondarMm(n)}mm`;
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

function limitarCopias(copias: number | undefined, teto: number): number {
  return Math.max(1, Math.min(teto, Math.floor(copias ?? 1)));
}

function chamadaDe(medida: MedidaEtiqueta): string {
  const apertada = medida.larguraMm < 50 || (medida.alturaMm != null && medida.alturaMm < 45);
  return apertada
    ? 'Escaneie: manutenção e orçamento'
    : 'Escaneie para ver a última manutenção e pedir orçamento';
}

/** Uma etiqueta (QR + identificação + chamada). Assume qrToken preenchido. */
function miolo(e: EtiquetaEquip, o: OpcoesEtiqueta, classeExtra: string, estilo: string): string {
  const medida = TAMANHOS_ETIQUETA[o.tamanho ?? TAMANHO_ETIQUETA_PADRAO];
  const svg = qrSvg(urlEtiqueta(e.qrToken));
  const logo = logoSegura(o.logoDataUri);
  const marca = logo
    ? `<img class="logo" src="${logo}" alt="" />`
    : o.empresa ? `<div class="empresa-nome">${esc(o.empresa)}</div>` : '';
  const pequena = medida.larguraMm < 50;
  const classe = `label ${medida.layout}${classeExtra ? ` ${classeExtra}` : ''}`;
  return `<div class="${classe}" style="${estilo}">
    <div class="qr" style="width:${medida.qrMm}mm;height:${medida.qrMm}mm">${svg}</div>
    <div class="info">
      ${marca}
      <div class="titulo">${esc(e.titulo || 'Equipamento')}</div>
      ${e.subtitulo && !pequena ? `<div class="sub">${esc(e.subtitulo)}</div>` : ''}
      <div class="instr">${chamadaDe(medida)}</div>
      ${o.contato ? `<div class="contato">${esc(o.contato)}</div>` : ''}
      <div class="cod">Cód. ${esc(codigoCurto(e.qrToken))}</div>
    </div>
  </div>`;
}

function documento(corpo: string, tituloDoc: string, css: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(tituloDoc)}</title><style>${css}</style></head><body>${corpo}</body></html>`;
}

function cssRecorte(cor: string): string {
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

function cssFolha(cor: string): string {
  const f = FOLHA_ADESIVO_PADRAO;
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0A2540; }
  .folha {
    position: relative; width: ${f.paginaLarguraMm}mm; height: ${f.paginaAlturaMm}mm;
    overflow: hidden; break-after: page; page-break-after: always; background: #fff;
  }
  .folha:last-child { break-after: auto; page-break-after: auto; }
  .label {
    position: absolute; display: flex; align-items: center;
    padding: 2mm 2.2mm; gap: 2mm; overflow: hidden; background: #fff;
    border-radius: ${f.raioMm}mm; border-top: 1.1mm solid ${cor};
  }
  .label.horizontal { flex-direction: row; }
  .qr { flex: 0 0 auto; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .info { flex: 1 1 auto; min-width: 0; max-height: 30mm; overflow: hidden; }
  .logo { max-height: 5.5mm; max-width: 100%; object-fit: contain; display: block; margin-bottom: 0.6mm; }
  .empresa-nome { font-size: 7pt; font-weight: 800; color: ${cor}; line-height: 1.1; }
  .titulo { font-size: 9pt; font-weight: 700; line-height: 1.15; max-height: 2.4em; overflow: hidden; }
  .sub, .instr, .contato, .cod {
    font-size: 6.5pt; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sub { color: #475569; }
  .instr { color: #334155; font-weight: 600; }
  .contato { font-weight: 800; color: ${cor}; }
  .cod { font-family: 'Courier New', monospace; color: #64748b; letter-spacing: .4px; }
  .aviso-folha {
    position: absolute; left: 4mm; right: 4mm; top: 283mm;
    font-size: 6.5pt; line-height: 1.2; color: #94a3b8; text-align: center;
  }
  .selo-folha {
    position: absolute; left: 4mm; right: 4mm; top: 3mm;
    font-size: 7pt; color: #9AA3B2; text-align: center;
  }
  .selo-folha svg { vertical-align: middle; }
`;
}

function cssGrafica(cor: string): string {
  return `${cssFolha(cor)}
  .pagina-grafica {
    position: relative; width: 210mm; height: 297mm; overflow: hidden;
    break-after: page; page-break-after: always; background: #fff;
  }
  .pagina-grafica:last-child { break-after: auto; page-break-after: auto; }
  .corte { position: absolute; left: 0; top: 0; }
  .corte line { stroke: #0A2540; stroke-width: 0.25; }
  .ficha { position: absolute; left: 14mm; right: 14mm; top: 78mm; }
  .ficha p { margin: 0 0 2.2mm; font-size: 11pt; line-height: 1.35; color: #0A2540; }
  .ficha .ficha-titulo { font-size: 14pt; font-weight: 800; }
  .ficha .miudo { font-size: 9pt; color: #475569; }
`;
}

function seloHtml(o: OpcoesEtiqueta, classe: string): string {
  if (o.removerMarca) return '';
  return `<div class="${classe}">${footerSeloOlliHtml()}</div>`;
}

function paginaRecorte(labels: string, tituloDoc: string, o: OpcoesEtiqueta): string {
  const corpo = `<div class="grid">${labels}</div>` +
    `<div class="rodape">Recorte na linha tracejada. Dica: cubra a etiqueta com fita transparente ou plastifique para durar no equipamento.</div>` +
    seloHtml(o, 'selo');
  return documento(corpo, tituloDoc, cssRecorte(corMarcaNoPapel(o.corMarca)));
}

function montarFolhaCasa(itens: EtiquetaEquip[], o: OpcoesEtiqueta): string {
  const opcoes: OpcoesEtiqueta = { ...o, tamanho: 'padrao' };
  const paginas: string[][] = [];
  for (let i = 0; i < itens.length; i++) {
    const e = itens[i];
    if (!e) continue;
    const pos = posicaoEtiquetaPadrao(i);
    const estilo = `width:${mm(FOLHA_ADESIVO_PADRAO.larguraMm)};height:${mm(FOLHA_ADESIVO_PADRAO.alturaMm)};left:${mm(pos.esquerdaMm)};top:${mm(pos.topoMm)}`;
    const pagina = paginas[pos.pagina] ?? [];
    pagina.push(miolo(e, opcoes, 'padrao', estilo));
    paginas[pos.pagina] = pagina;
  }
  const aviso = `<div class="aviso-folha">Impressão em 100%, sem ajustar à página e sem cabeçalho. Folha A4 ${esc(FOLHA_ADESIVO_PADRAO.modelo)} ou ${esc(FOLHA_ADESIVO_PADRAO.equivalentes)}.</div>`;
  const folhas = paginas.map((labels) =>
    `<div class="folha">${labels.join('')}${aviso}${seloHtml(opcoes, 'selo-folha')}</div>`,
  ).join('');
  return documento(folhas, 'Etiquetas 99,1×38,1 mm — imprimir em 100%', cssFolha(corMarcaNoPapel(o.corMarca)));
}

function marcasDeCorte(x: number, y: number, w: number, h: number): string {
  const gap = 2;
  const len = 5;
  const cantos: Array<[number, number, number, number]> = [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ];
  const linhas = cantos.flatMap(([cx, cy, sx, sy]) => {
    const x1 = arredondarMm(cx + sx * gap);
    const y1 = arredondarMm(cy + sy * gap);
    return [
      `<line x1="${x1}" y1="${arredondarMm(cy)}" x2="${arredondarMm(x1 + sx * len)}" y2="${arredondarMm(cy)}" />`,
      `<line x1="${arredondarMm(cx)}" y1="${y1}" x2="${arredondarMm(cx)}" y2="${arredondarMm(y1 + sy * len)}" />`,
    ];
  });
  return `<svg class="corte" viewBox="0 0 210 297" width="210mm" height="297mm">${linhas.join('')}</svg>`;
}

function paginaGrafica(e: EtiquetaEquip, o: OpcoesEtiqueta): string {
  const f = FOLHA_ADESIVO_PADRAO;
  const x = arredondarMm((f.paginaLarguraMm - f.larguraMm) / 2);
  const y = 22;
  const estilo = `width:${mm(f.larguraMm)};height:${mm(f.alturaMm)};left:${mm(x)};top:${mm(y)}`;
  return `<div class="pagina-grafica">${marcasDeCorte(x, y, f.larguraMm, f.alturaMm)}` +
    miolo(e, o, 'padrao', estilo) +
    `<div class="ficha">` +
    `<p class="ficha-titulo">Arquivo para a gráfica — etiqueta de equipamento</p>` +
    `<p>Tamanho acabado: 99,1 × 38,1 mm. Cantos arredondados de 2 mm. QR de ${f.qrMm} mm.</p>` +
    `<p>Em casa, a mesma arte cabe na folha A4 de ${POR_FOLHA_PADRAO} etiquetas: ${esc(f.modelo)}, ${esc(f.equivalentes)}.</p>` +
    `<p>Pedido: vinil adesivo branco fosco, adesivo permanente, laminação fosca, corte 99,1 × 38,1 mm.</p>` +
    `<p>Imprimir em 100% (tamanho real). Não usar ajustar à página.</p>` +
    `<p>Não colocamos nome, telefone nem CPF do cliente. Entram o nome do equipamento, o local curto cadastrado e o contato da sua empresa.</p>` +
    `<p class="miudo">Equipamento: ${esc(e.titulo || 'Equipamento')}</p>` +
    seloHtml(o, 'selo') +
    `</div></div>`;
}

/** Quantas etiquetas do tamanho cabem numa linha (o atalho de cópias da tela). */
export function etiquetasPorLinha(tamanho: TamanhoEtiqueta): number {
  if (tamanho === 'padrao') return FOLHA_ADESIVO_PADRAO.colunas;
  const util = 190; // A4 (210 mm) menos 10 mm de margem de cada lado
  const vao = 5;
  return Math.max(1, Math.floor((util + vao) / (TAMANHOS_ETIQUETA[tamanho].larguraMm + vao)));
}

/**
 * Etiqueta de UM equipamento. No tamanho padrão, as cópias caem na grade da
 * folha A4. Nos outros, saem soltas com linha de corte. Token vazio → página
 * sem etiqueta.
 */
export function montarHtmlEtiqueta(
  e: EtiquetaEquip,
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): string {
  if (!e.qrToken) return paginaRecorte('', 'Etiqueta', opcoes);
  const tamanho = opcoes.tamanho ?? TAMANHO_ETIQUETA_PADRAO;
  const n = limitarCopias(opcoes.copias, 40);
  if (tamanho === 'padrao') {
    return montarFolhaCasa(Array.from({ length: n }, () => e), opcoes);
  }
  const medida = TAMANHOS_ETIQUETA[tamanho];
  const labels = Array.from({ length: n }, () =>
    miolo(e, opcoes, '', `width:${medida.larguraMm}mm`),
  ).join('');
  return paginaRecorte(labels, `Etiqueta ${e.titulo}`, opcoes);
}

/**
 * Folha de etiquetas em LOTE. No padrão, uma grade por folha (14 lugares).
 * Filtra os que ainda não têm QR e devolve a contagem para a tela avisar.
 */
export function montarHtmlEtiquetasLote(
  equipamentos: EtiquetaEquip[],
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): { html: string; impressos: number; ignorados: number } {
  const validos = equipamentos.filter((e) => e.qrToken);
  const tamanho = opcoes.tamanho ?? TAMANHO_ETIQUETA_PADRAO;
  const n = limitarCopias(opcoes.copias, 10);
  const lista = validos.flatMap((e) => Array.from({ length: n }, () => e));
  const html = tamanho === 'padrao'
    ? (lista.length ? montarFolhaCasa(lista, opcoes) : paginaRecorte('', 'Etiquetas', opcoes))
    : paginaRecorte(
      lista.map((e) => miolo(e, opcoes, '', `width:${TAMANHOS_ETIQUETA[tamanho].larguraMm}mm`)).join(''),
      `Etiquetas de equipamentos (${validos.length})`,
      opcoes,
    );
  return {
    html,
    impressos: validos.length,
    ignorados: equipamentos.length - validos.length,
  };
}

/**
 * Arquivo para a gráfica: uma etiqueta por página A4, no tamanho acabado, com
 * marcas de corte e o pedido (vinil fosco, laminação, 99,1 × 38,1 mm).
 * `copias` vale para cada equipamento (teto de 40 cópias de cada um).
 */
export function montarHtmlGrafica(
  equipamentos: EtiquetaEquip[],
  opcoes: OpcoesEtiqueta & { copias?: number } = {},
): { html: string; impressos: number; ignorados: number } {
  const validos = equipamentos.filter((e) => e.qrToken);
  const o: OpcoesEtiqueta = { ...opcoes, tamanho: 'padrao' };
  const n = limitarCopias(opcoes.copias, 40);
  const lista = validos.flatMap((e) => Array.from({ length: n }, () => e));
  const corpo = lista.length
    ? lista.map((e) => paginaGrafica(e, o)).join('')
    : '<p class="ficha">Nenhuma etiqueta com QR para imprimir. Sincronize o equipamento primeiro.</p>';
  return {
    html: documento(corpo, 'Etiqueta para a gráfica — 99,1 × 38,1 mm', cssGrafica(corMarcaNoPapel(o.corMarca))),
    impressos: validos.length,
    ignorados: equipamentos.length - validos.length,
  };
}
