/**
 * Rasteriza os traços do dedo numa imagem PNG pequena, 100% offline e 100% JS.
 *
 * POR QUE ISTO EXISTE, E POR QUE ASSIM:
 *  - o destino é `Orcamento.assinaturaClienteUri`, que o PDF injeta num
 *    `<img src="...">` (pdfGenerator). Precisa ser RASTER: o motor de impressão
 *    do iOS ignora data-URI de SVG (o mesmo motivo que faz o QR do PDF ir
 *    inline em vez de `<img>` — ver `renderQrAcao`). Assinatura que aparece num
 *    aparelho e some no outro é pior que assinatura nenhuma;
 *  - o momento de uso é a casa do cliente, muitas vezes sem sinal: nada aqui
 *    toca a rede, nem módulo nativo de câmera/canvas. Entra ponto, sai PNG;
 *  - o PESO importa. A assinatura viaja dentro do blob JSON do orçamento (SQLite
 *    + sync + PDF). Por isso: tinta em CINZA+ALFA (2 canais, não 4 — metade dos
 *    bytes crus), recorte na caixa da tinta (não no tamanho da tela) e teto de
 *    resolução. `scripts/teste-assinatura-cliente.ts` mede o resultado real.
 *
 * Módulo PURO de propósito: nenhum import de react-native. É isso que permite o
 * teste rodar a rasterização de verdade no node (não só ler o fonte).
 */

/** Ponto na coordenada da ÁREA DE DESENHO (px de layout, não de saída). */
export interface PontoAssinatura {
  x: number;
  y: number;
}

/** Um traço = um "dedo encostado até levantar". */
export type TracoAssinatura = readonly PontoAssinatura[];

/**
 * Resultado de 3 estados, pela regra da casa: 'vazio' (ninguém desenhou) NÃO é
 * 'falha' (o encoder morreu), e nenhum dos dois pode ser confundido com sucesso.
 * Quem chama tem que abrir os três — é o que impede "assinado" sem imagem.
 */
export type ResultadoAssinatura =
  | { ok: true; dataUri: string; larguraPx: number; alturaPx: number; bytes: number }
  | { ok: false; motivo: 'vazio' | 'falha' };

/** Teto de resolução da imagem gravada. ~520x180 imprime nítido no bloco de
 *  assinatura do PDF (`.sign-img { height: 50px }`) com folga de 3x. */
export const LARGURA_MAX_PX = 520;
export const ALTURA_MAX_PX = 180;
/** Respiro em volta da tinta, para o traço não encostar na borda do PNG. */
export const MARGEM_PX = 6;
/** Espessura da "caneta" em pixels DE SAÍDA — constante, independente de quão
 *  grande ou pequeno o cliente assinou. É o que faz assinatura miúda e
 *  assinatura larga saírem com o mesmo peso de traço. */
export const ESPESSURA_PX = 2.4;
/** Teto de ampliação: uma assinatura minúscula pode crescer até 3x, não mais —
 *  além disso vira borrão gigante de um rabisco de 1cm. */
export const ESCALA_MAX = 3;

/* ─── fast-png (lazy + shim latin1) ───────────────────────────────
 * CÓPIA CONSCIENTE do carregador de `src/utils/extrairCoresLogo.ts`. As duas
 * regras que importam, e que `scripts/teste-assinatura-cliente.ts` prende nos
 * DOIS arquivos para não divergirem:
 *   1. o fast-png é carregado PREGUIÇOSAMENTE, nunca no topo do módulo. No topo
 *      ele derrubava o app inteiro no boot do Android (RangeError: Unknown
 *      encoding: latin1 — bug real capturado no APK v6);
 *   2. o shim de latin1 é instalado ANTES de carregar, nunca depois.
 * Latin1 é trivial: byte == charCode. O Hermes só implementa TextDecoder utf-8.
 *
 * A diferença para o original é a FORMA do carregamento: `await import()` em vez
 * de `require()`. Mesma preguiça, e é o que deixa este módulo rodar também no
 * node (`fast-png` é ESM puro, e `require` não existe em módulo ESM) — sem isso
 * o teste não conseguiria rasterizar de verdade, só ler o fonte. `await import`
 * dinâmico já é padrão da casa (ver `obterLinkPublico` em pdfGenerator.ts).
 */
type FastPng = typeof import('fast-png');
let fastPngCache: FastPng | null = null;

function instalarShimLatin1(): void {
  try {
    new TextDecoder('latin1');
    return; // ambiente já suporta (web/iOS JSC) — nada a fazer
  } catch {
    /* Hermes: instala o shim abaixo. */
  }
  const Original = globalThis.TextDecoder;
  const LATIN1 = /^(latin1|iso-8859-1|windows-1252)$/i;

  class TextDecoderComLatin1 {
    private latin1: boolean;
    private delegado: TextDecoder | null;
    readonly encoding: string;

    constructor(label = 'utf-8', options?: TextDecoderOptions) {
      this.latin1 = LATIN1.test(String(label));
      this.delegado = this.latin1 ? null : new Original(label, options);
      this.encoding = this.latin1 ? 'latin1' : (this.delegado as TextDecoder).encoding;
    }

    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!this.latin1) return (this.delegado as TextDecoder).decode(input as ArrayBuffer);
      if (input == null) return '';
      const bytes = input instanceof Uint8Array
        ? input
        : ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
      let out = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return out;
    }
  }

  (globalThis as { TextDecoder: unknown }).TextDecoder = TextDecoderComLatin1;
}

async function carregarFastPng(): Promise<FastPng | null> {
  if (fastPngCache) return fastPngCache;
  try {
    instalarShimLatin1();
    fastPngCache = (await import('fast-png')) as FastPng;
    return fastPngCache;
  } catch {
    return null; // sem encoder → motivo 'falha', jamais um "assinado" vazio
  }
}

/** Base64 sem dependência: `btoa` quando existe, senão RFC 4648 na mão (o RN
 *  não garante `btoa` global — mesmo motivo do decoder manual em
 *  `extrairCoresLogo.ts`). */
const CHARS_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesParaBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    // Em blocos: String.fromCharCode(...bytes) estoura o limite de argumentos.
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(bin);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const temB1 = i + 1 < bytes.length;
    const temB2 = i + 2 < bytes.length;
    const triple = (b0 << 16) | ((temB1 ? b1 : 0) << 8) | (temB2 ? b2 : 0);
    out += CHARS_B64[(triple >> 18) & 0x3f];
    out += CHARS_B64[(triple >> 12) & 0x3f];
    out += temB1 ? CHARS_B64[(triple >> 6) & 0x3f] : '=';
    out += temB2 ? CHARS_B64[triple & 0x3f] : '=';
  }
  return out;
}

interface Caixa {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Caixa da TINTA (não da tela). `null` = ninguém desenhou nada. */
function caixaDaTinta(tracos: readonly TracoAssinatura[]): Caixa | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let achou = false;
  for (const traco of tracos) {
    for (const p of traco) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      achou = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return achou ? { minX, minY, maxX, maxY } : null;
}

/**
 * Pinta um segmento com anti-aliasing por COBERTURA: a opacidade de cada pixel
 * vem da distância dele ao segmento, e fica o MAIOR valor já escrito ali
 * (`max`, não soma) — somar deixaria os cruzamentos do traço pretos e grossos.
 */
function pintarSegmento(
  alfa: Uint8Array,
  largura: number,
  altura: number,
  x0: number, y0: number, x1: number, y1: number,
  raio: number,
): void {
  const borda = raio + 1;
  const pxIni = Math.max(0, Math.floor(Math.min(x0, x1) - borda));
  const pxFim = Math.min(largura - 1, Math.ceil(Math.max(x0, x1) + borda));
  const pyIni = Math.max(0, Math.floor(Math.min(y0, y1) - borda));
  const pyFim = Math.min(altura - 1, Math.ceil(Math.max(y0, y1) + borda));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const comp2 = dx * dx + dy * dy;

  for (let py = pyIni; py <= pyFim; py++) {
    for (let px = pxIni; px <= pxFim; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      let t = comp2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / comp2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ax = x0 + t * dx;
      const ay = y0 + t * dy;
      const dist = Math.sqrt((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay));
      const cobertura = raio + 0.5 - dist;
      if (cobertura <= 0) continue;
      const v = cobertura >= 1 ? 255 : Math.round(cobertura * 255);
      const i = py * largura + px;
      if (v > alfa[i]) alfa[i] = v;
    }
  }
}

/** Bitmap de opacidade (1 byte por pixel) já recortado na caixa da tinta. */
export interface AlfaAssinatura {
  largura: number;
  altura: number;
  alfa: Uint8Array;
}

/**
 * Geometria pura: traços → bitmap de opacidade, recortado na tinta e reduzido
 * ao teto de resolução. Separado do encode de propósito — é a metade que não
 * depende de nenhuma biblioteca e pode ser conferida pixel a pixel no teste.
 * `null` = nenhum ponto válido (ninguém desenhou).
 */
export function desenharAlfa(tracos: readonly TracoAssinatura[]): AlfaAssinatura | null {
  const caixa = caixaDaTinta(tracos);
  if (!caixa) return null;

  const utilLargura = LARGURA_MAX_PX - MARGEM_PX * 2;
  const utilAltura = ALTURA_MAX_PX - MARGEM_PX * 2;
  const larguraTinta = caixa.maxX - caixa.minX;
  const alturaTinta = caixa.maxY - caixa.minY;
  const escala = Math.min(
    utilLargura / Math.max(larguraTinta, 1),
    utilAltura / Math.max(alturaTinta, 1),
    ESCALA_MAX,
  );

  const largura = Math.min(LARGURA_MAX_PX, Math.ceil(larguraTinta * escala) + MARGEM_PX * 2);
  const altura = Math.min(ALTURA_MAX_PX, Math.ceil(alturaTinta * escala) + MARGEM_PX * 2);
  if (largura <= 0 || altura <= 0) return null;

  const alfa = new Uint8Array(largura * altura);
  const raio = ESPESSURA_PX / 2;
  const emX = (x: number) => (x - caixa.minX) * escala + MARGEM_PX;
  const emY = (y: number) => (y - caixa.minY) * escala + MARGEM_PX;

  for (const traco of tracos) {
    const pts = traco.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      // Toque seco: um ponto só. Vira um pingo — não some do documento.
      pintarSegmento(alfa, largura, altura, emX(pts[0].x), emY(pts[0].y), emX(pts[0].x), emY(pts[0].y), raio);
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      pintarSegmento(
        alfa, largura, altura,
        emX(pts[i - 1].x), emY(pts[i - 1].y),
        emX(pts[i].x), emY(pts[i].y),
        raio,
      );
    }
  }
  return { largura, altura, alfa };
}

/**
 * Traços → PNG em data URI (`data:image/png;base64,...`), pronto para
 * `Orcamento.assinaturaClienteUri`.
 *
 * NUNCA lança: devolve `{ ok: false, motivo }`. Um throw aqui viraria, na tela,
 * a tentação de "salvar mesmo assim" — e assinatura que falhou não pode virar
 * documento assinado.
 */
export async function rasterizarAssinatura(
  tracos: readonly TracoAssinatura[],
): Promise<ResultadoAssinatura> {
  try {
    const bitmap = desenharAlfa(tracos);
    if (!bitmap) return { ok: false, motivo: 'vazio' };
    const { largura, altura, alfa } = bitmap;

    // 2 canais (cinza + alfa): tinta preta sobre fundo TRANSPARENTE, para a
    // assinatura pousar sobre a linha do PDF em vez de tapá-la com um retângulo.
    const dados = new Uint8Array(largura * altura * 2);
    for (let i = 0; i < alfa.length; i++) {
      dados[i * 2] = 0;           // cinza 0 = preto
      dados[i * 2 + 1] = alfa[i]; // opacidade
    }

    const fastPng = await carregarFastPng();
    if (!fastPng) return { ok: false, motivo: 'falha' };
    const png = fastPng.encode({ width: largura, height: altura, data: dados, channels: 2, depth: 8 });
    const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
    if (bytes.length === 0) return { ok: false, motivo: 'falha' };

    return {
      ok: true,
      dataUri: `data:image/png;base64,${bytesParaBase64(bytes)}`,
      larguraPx: largura,
      alturaPx: altura,
      bytes: bytes.length,
    };
  } catch {
    return { ok: false, motivo: 'falha' };
  }
}
