/**
 * Identidade do prestador que sai no papel e na conta.
 *
 * Puro de propósito: o PDF, o painel e os testes de Node importam daqui.
 * Nada de React Native, rede ou arquivo.
 *
 * O motor de impressão do celular (expo-print) ignora `max-height` e
 * `object-fit` em várias versões. Uma logo de 512 px nasce no tamanho real e
 * o `overflow: hidden` da folha corta ela. Por isso o HTML leva largura e
 * altura em px, já encaixadas na caixa, sem ampliar e sem distorcer.
 *
 * O link de avaliação vai para o WhatsApp do cliente. Só entra endereço https
 * do Google. Site próprio entra no documento só se for um http(s) público.
 */

export interface CaixaPx {
  largura: number;
  altura: number;
}

export interface RecortePx {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export type ModoRecorteLogo = 'inteira' | 'faixa' | 'quadrada';

export type ResultadoUrl =
  | { ok: true; url: string }
  | { ok: false; erro: string };

/** Caixas usadas no papel. A logo inteira tem de caber dentro delas. */
export const CAIXA_LOGO_CABECALHO: CaixaPx = { largura: 200, altura: 64 };
export const CAIXA_LOGO_CAPA: CaixaPx = { largura: 300, altura: 130 };
export const CAIXA_LOGO_CAPA_FOTO: CaixaPx = { largura: 210, altura: 78 };
export const CAIXA_LOGO_RECIBO: CaixaPx = { largura: 200, altura: 56 };
export const CAIXA_LOGO_DOCUMENTO: CaixaPx = { largura: 160, altura: 54 };

/**
 * Teto da foto de perfil em `user_metadata.avatar_url`.
 * O campo não é um bucket: um data URI grande faz o Auth recusar a gravação.
 * 256 px em JPEG cabe com folga e chega no outro aparelho.
 */
export const FOTO_PERFIL_MAX_DIMENSAO = 256;
export const FOTO_PERFIL_MAX_DATA_URI_CHARS = 48_000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function limitar(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Decodifica só o começo do base64. O restante da imagem não entra na memória. */
export function bytesDeBase64(b64: string, maxBytes: number): Uint8Array | null {
  const limpo = b64.replace(/\s+/g, '').replace(/=+$/, '');
  if (!limpo || maxBytes <= 0) return null;
  const out = new Uint8Array(maxBytes);
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < limpo.length && o < maxBytes; i++) {
    const v = B64.indexOf(limpo.charAt(i));
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
      o += 1;
    }
  }
  return out.subarray(0, o);
}

export function mimeDeBase64Imagem(b64: string): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const b = bytesDeBase64(b64, 16);
  if (!b || b.length < 3) return null;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (
    b.length >= 12
    && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'image/webp';
  return null;
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function caixaValida(largura: number, altura: number): boolean {
  return largura > 0 && altura > 0 && largura <= 16000 && altura <= 16000;
}

function dimsPng(bytes: Uint8Array): CaixaPx | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const largura = u32(bytes, 16);
  const altura = u32(bytes, 20);
  return caixaValida(largura, altura) ? { largura, altura } : null;
}

function dimsJpeg(bytes: Uint8Array): CaixaPx | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= bytes.length) return null;
    const len = (bytes[i] << 8) | bytes[i + 1];
    if (len < 2 || i + len > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (i + 6 >= bytes.length) return null;
      const altura = (bytes[i + 3] << 8) | bytes[i + 4];
      const largura = (bytes[i + 5] << 8) | bytes[i + 6];
      return caixaValida(largura, altura) ? { largura, altura } : null;
    }
    i += len;
  }
  return null;
}

function dimsWebp(bytes: Uint8Array): CaixaPx | null {
  if (bytes.length < 30) return null;
  const vp8x = bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58;
  if (!vp8x) return null;
  const largura = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
  const altura = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
  return caixaValida(largura, altura) ? { largura, altura } : null;
}

/** Lê largura e altura de um data URI PNG, JPEG ou WebP (VP8X). */
export function dimensoesImagemDataUri(dataUri: string): CaixaPx | null {
  const m = /^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUri.trim());
  if (!m) return null;
  const tipo = m[1].toLowerCase();
  const max = tipo === 'jpeg' || tipo === 'jpg' ? 65536 : 64;
  const bytes = bytesDeBase64(m[2], max);
  if (!bytes) return null;
  if (tipo === 'png') return dimsPng(bytes);
  if (tipo === 'webp') return dimsWebp(bytes);
  return dimsJpeg(bytes);
}

/**
 * Encaixa a imagem na caixa sem cortar, sem distorcer e sem ampliar.
 * Ampliar uma logo pequena só borra o PDF.
 */
export function encaixarImagem(largura: number, altura: number, caixa: CaixaPx): CaixaPx {
  if (!caixaValida(largura, altura) || !caixaValida(caixa.largura, caixa.altura)) {
    return {
      largura: Math.max(1, Math.round(caixa.largura) || 1),
      altura: Math.max(1, Math.round(caixa.altura) || 1),
    };
  }
  const escala = Math.min(caixa.largura / largura, caixa.altura / altura, 1);
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/**
 * `<img>` da logo com px explícitos. `srcEscapado` já passou por escapeHtml.
 * SVG, HTML e atributo quebrado não entram: a logo some, o documento segue.
 */
export function tagImgLogo(srcEscapado: string, classe: string, caixa: CaixaPx): string {
  const src = srcEscapado.trim();
  if (!src || /["'<>&\s]/.test(src)) return '';
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(src)) return '';
  if (!/^[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*$/.test(classe)) return '';
  const caixaSegura = {
    largura: Math.max(1, Math.round(caixa.largura)),
    altura: Math.max(1, Math.round(caixa.altura)),
  };
  const dims = dimensoesImagemDataUri(src);
  const tamanho = dims ? encaixarImagem(dims.largura, dims.altura, caixaSegura) : null;
  if (!tamanho) {
    return `<img src="${src}" class="${classe}" style="max-width:${caixaSegura.largura}px;max-height:${caixaSegura.altura}px;width:auto;height:auto;object-fit:contain;display:block;" />`;
  }
  return `<img src="${src}" class="${classe}" width="${tamanho.largura}" height="${tamanho.altura}" style="width:${tamanho.largura}px;height:${tamanho.altura}px;object-fit:contain;display:block;" />`;
}

export function aspectoDoModo(modo: ModoRecorteLogo, imgLargura: number, imgAltura: number): number {
  if (modo === 'quadrada') return 1;
  if (modo === 'faixa') return 5 / 2;
  return Math.max(1, imgLargura) / Math.max(1, imgAltura);
}

/**
 * Retângulo em pixels da imagem original.
 * zoom 1 = o maior recorte da proporção, centralizado.
 * pan -1..1 empurra o recorte até a borda, sem sair da imagem.
 */
export function recorteNaImagem(
  imgLargura: number,
  imgAltura: number,
  aspecto: number,
  zoom: number,
  panX: number,
  panY: number,
): RecortePx {
  const imgW = Math.max(1, Math.round(imgLargura));
  const imgH = Math.max(1, Math.round(imgAltura));
  const aspectoSeguro = aspecto > 0 && Number.isFinite(aspecto) ? aspecto : imgW / imgH;
  const zoomSeguro = limitar(zoom, 1, 4);
  let baseW = imgW;
  let baseH = imgW / aspectoSeguro;
  if (baseH > imgH) {
    baseH = imgH;
    baseW = imgH * aspectoSeguro;
  }
  const largura = Math.max(1, baseW / zoomSeguro);
  const altura = Math.max(1, baseH / zoomSeguro);
  const folgaX = Math.max(0, imgW - largura);
  const folgaY = Math.max(0, imgH - altura);
  let x = Math.round(folgaX * (limitar(panX, -1, 1) + 1) / 2);
  let y = Math.round(folgaY * (limitar(panY, -1, 1) + 1) / 2);
  let rw = Math.round(largura);
  let rh = Math.round(altura);
  if (x + rw > imgW) rw = imgW - x;
  if (y + rh > imgH) rh = imgH - y;
  return { x, y, largura: Math.max(1, rw), altura: Math.max(1, rh) };
}

function lerUrl(texto: string): URL | null {
  try {
    const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(texto);
    return new URL(comProtocolo ? texto : `https://${texto}`);
  } catch {
    return null;
  }
}

function hostGoogle(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'g.page' || h === 'maps.app.goo.gl' || h === 'goo.gl') return true;
  if (h === 'google.com' || h.endsWith('.google.com')) return true;
  if (h === 'google.com.br' || h.endsWith('.google.com.br')) return true;
  return false;
}

/**
 * Link que pode ir na mensagem de WhatsApp do cliente.
 * Vazio é válido (o botão de pedir avaliação some).
 */
export function normalizarLinkAvaliacaoGoogle(bruto: string): ResultadoUrl {
  const texto = bruto.trim();
  if (!texto) return { ok: true, url: '' };
  if (texto.length > 500) {
    return { ok: false, erro: 'O link de avaliação está longo demais. Cole só o endereço do Google.' };
  }
  if (/[\s<>"']/.test(texto)) {
    return { ok: false, erro: 'O link de avaliação tem caracteres que não entram num endereço.' };
  }
  const url = lerUrl(texto);
  if (!url || url.username || url.password) {
    return { ok: false, erro: 'Não consegui ler esse link. Cole o endereço de escrever avaliação do Google.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, erro: 'Use o link https do Google, não outro tipo de endereço.' };
  }
  url.protocol = 'https:';
  url.hash = '';
  if (!hostGoogle(url.hostname)) {
    return { ok: false, erro: 'Esse link não é do Google. Cole o link de escrever avaliação (g.page ou Google Maps).' };
  }
  const caminho = `${url.pathname}${url.search}`;
  if (caminho === '/' || caminho === '') {
    return { ok: false, erro: 'Cole o link da sua ficha no Google, não a página inicial.' };
  }
  return { ok: true, url: url.toString() };
}

/** Endereço pronto para o cliente, ou vazio se o cadastro não for um link do Google. */
export function linkAvaliacaoUsavel(bruto: string | undefined | null): string {
  const r = normalizarLinkAvaliacaoGoogle(bruto ?? '');
  return r.ok ? r.url : '';
}

const HOST_SITE_BLOQUEADO = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/** Site do prestador. Sem protocolo, assume https. http:// digitado é mantido. */
export function normalizarSiteProprio(bruto: string): ResultadoUrl {
  const texto = bruto.trim();
  if (!texto) return { ok: true, url: '' };
  if (texto.length > 300) return { ok: false, erro: 'O site está longo demais.' };
  if (/[\s<>"']/.test(texto)) {
    return { ok: false, erro: 'O site tem caracteres que não entram num endereço.' };
  }
  const tinhaProtocolo = /^https?:\/\//i.test(texto);
  const url = lerUrl(texto);
  if (!url || url.username || url.password) {
    return { ok: false, erro: 'Não consegui ler esse site. Use um endereço como www.suaempresa.com.br.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, erro: 'O site precisa ser um endereço http ou https.' };
  }
  if (!tinhaProtocolo) url.protocol = 'https:';
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || HOST_SITE_BLOQUEADO.has(host) || host.endsWith('.local')) {
    return { ok: false, erro: 'Informe o site público da sua empresa, com o endereço completo.' };
  }
  url.hash = '';
  return { ok: true, url: url.toString() };
}

/** URL que pode ser impressa. Endereço inválido não sai no documento. */
export function siteParaDocumento(bruto: string | undefined | null): string {
  const r = normalizarSiteProprio(bruto ?? '');
  return r.ok ? r.url : '';
}

/** O que a conta aceita guardar como foto. Caminho local não viaja para outro aparelho. */
export function fotoPerfilAceita(uri: string): { ok: true } | { ok: false; erro: string } {
  const t = uri.trim();
  if (!t) return { ok: false, erro: 'Escolha uma foto.' };
  if (/^(file|content|blob|ph|assets-library):/i.test(t)) {
    return { ok: false, erro: 'Essa foto só existe neste aparelho. Escolha de novo para enviá-la à sua conta.' };
  }
  if (/^data:image\/(png|jpe?g);base64,/i.test(t)) {
    if (/["'<>&\s]/.test(t) || t.length > FOTO_PERFIL_MAX_DATA_URI_CHARS) {
      return { ok: false, erro: 'A foto ficou pesada demais. Tente outra.' };
    }
    return { ok: true };
  }
  if (/^https:\/\//i.test(t) && t.length <= 2000 && !/\s/.test(t)) {
    try {
      const u = new URL(t);
      if (u.username || u.password) return { ok: false, erro: 'Link de foto inválido.' };
      return { ok: true };
    } catch {
      return { ok: false, erro: 'Link de foto inválido.' };
    }
  }
  return { ok: false, erro: 'Escolha uma foto do aparelho. Endereço que não seja https não entra.' };
}

/** Foto que o navegador consegue mostrar. file:// do celular não entra. */
export function fotoPerfilExibivel(uri: string | undefined | null): string | null {
  const t = (uri ?? '').trim();
  const aceite = fotoPerfilAceita(t);
  if (!aceite.ok) return null;
  if (/^data:image\/(png|jpe?g);base64,/i.test(t) || /^https:\/\//i.test(t)) return t;
  return null;
}
