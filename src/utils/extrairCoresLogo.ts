/**
 * Extração automática das cores dominantes de uma logo (requisito D).
 *
 * Pipeline 100% JS, sem módulo nativo extra: redimensiona a imagem para uma
 * miniatura (expo-image-manipulator, já usado no app), decodifica o PNG puro
 * em JS (fast-png) e quantiza os pixels em buckets de cor para achar até 3
 * tons dominantes, descartando branco/preto/cinza quase puros (que quase
 * nunca são "a cor da marca", e sim fundo/contorno).
 *
 * Contrato: NUNCA lança. Qualquer falha (imagem inválida, PNG exótico,
 * decoder indisponível) retorna [] silenciosamente — a UI trata a ausência
 * de sugestões escondendo a seção, sem popup de erro.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * fast-png é carregado PREGUIÇOSAMENTE (require dentro da função) e atrás de
 * um shim: no escopo de módulo ele cria `new TextDecoder('latin1')`, e o
 * Hermes (Android) só implementa TextDecoder utf-8 — um import de topo
 * derrubava o app INTEIRO no boot com "RangeError: Unknown encoding: latin1"
 * (bug real capturado no emulador no APK v6). Latin1 é trivial: byte == charCode.
 */
type FastPng = typeof import('fast-png');
let fastPngCache: FastPng | null = null;

function instalarShimLatin1(): void {
  try {
    // Ambiente já suporta latin1 (web/iOS JSC)? Nada a fazer.
    new TextDecoder('latin1');
    return;
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
      // Em blocos: String.fromCharCode(...bytes) estoura o limite de argumentos.
      for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return out;
    }
  }

  (globalThis as { TextDecoder: unknown }).TextDecoder = TextDecoderComLatin1;
}

function carregarFastPng(): FastPng | null {
  if (fastPngCache) return fastPngCache;
  try {
    instalarShimLatin1();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fastPngCache = require('fast-png') as FastPng;
    return fastPngCache;
  } catch {
    return null; // decoder indisponível → contrato do módulo: falha silenciosa
  }
}

const TAMANHO_AMOSTRA = 48;
const MAX_CORES = 3;
const DISTANCIA_MINIMA = 60;

/** Decoder base64 manual — fallback para ambientes onde `atob` global não existe. */
function base64ParaBytes(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Decoder manual (RFC 4648), usado só se `atob` não estiver disponível.
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const out: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const c1 = CHARS.indexOf(clean[i++]);
    const c2 = CHARS.indexOf(clean[i++]);
    const c3 = CHARS.indexOf(clean[i++]);
    const c4 = CHARS.indexOf(clean[i++]);
    const triple = ((c1 & 0x3f) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
    out.push((triple >> 16) & 0xff);
    if (c3 !== -1 && clean[i - 2] !== '=') out.push((triple >> 8) & 0xff);
    if (c4 !== -1 && clean[i - 1] !== '=') out.push(triple & 0xff);
  }
  return new Uint8Array(out);
}

function paraHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function distanciaRgb(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Extrai até 3 cores hex dominantes de uma logo. Retorna [] se a imagem for
 * predominantemente P&B/cinza, se a extração falhar, ou se não houver
 * bucket de cor relevante.
 */
export async function extrairCoresLogo(uri: string): Promise<string[]> {
  try {
    const resultado = await manipulateAsync(
      uri,
      [{ resize: { width: TAMANHO_AMOSTRA } }],
      { format: SaveFormat.PNG, base64: true }
    );

    if (!resultado.base64) return [];

    const bytes = base64ParaBytes(resultado.base64);
    const fastPng = carregarFastPng();
    if (!fastPng) return [];
    const png = fastPng.decode(bytes);

    const { width, height, data, channels, depth } = png;
    if (!width || !height || !data || !channels) return [];

    // PNG de 16 bits/canal traz valores 0-65535 — normaliza para 0-255 antes
    // de comparar com os limiares de branco/preto/cinza abaixo.
    const escala = depth === 16 ? 1 / 257 : 1;

    // Buckets de cor: chave = (r>>4)<<8 | (g>>4)<<4 | (b>>4) → 16x16x16 níveis.
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

    for (let i = 0; i < width * height; i++) {
      const base = i * channels;
      const r = data[base] * escala;
      const g = data[base + 1] * escala;
      const b = data[base + 2] * escala;
      const a = channels >= 4 ? data[base + 3] * escala : 255;

      if (a < 128) continue; // transparente, ignora

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const quaseBranco = r >= 242 && g >= 242 && b >= 242;
      const quasePreto = r <= 18 && g <= 18 && b <= 18;
      const cinza = max - min <= 16;
      if (quaseBranco || quasePreto || cinza) continue;

      const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const atual = buckets.get(chave);
      if (atual) {
        atual.count++;
        atual.r += r;
        atual.g += g;
        atual.b += b;
      } else {
        buckets.set(chave, { count: 1, r, g, b });
      }
    }

    if (buckets.size === 0) return [];

    const ordenados = Array.from(buckets.values())
      .map(bkt => ({
        count: bkt.count,
        rgb: [bkt.r / bkt.count, bkt.g / bkt.count, bkt.b / bkt.count] as [number, number, number],
      }))
      .sort((a, b) => b.count - a.count);

    const escolhidos: [number, number, number][] = [];
    for (const cand of ordenados) {
      if (escolhidos.length >= MAX_CORES) break;
      const distinta = escolhidos.every(c => distanciaRgb(c, cand.rgb) >= DISTANCIA_MINIMA);
      if (distinta) escolhidos.push(cand.rgb);
    }

    return escolhidos.map(([r, g, b]) => paraHex(r, g, b));
  } catch (e) {
    if (__DEV__) console.warn('[extrairCoresLogo] falhou, sem sugestões:', e);
    return [];
  }
}
