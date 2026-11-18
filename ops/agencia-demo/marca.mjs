// Cores e logo públicos de um HTML. Não busca a rede sozinho: quem chama decide a origem.
import fs from 'node:fs';
import path from 'node:path';

function tags(html, nome) {
  return String(html || '').match(new RegExp(`<${nome}\\b[^>]*>`, 'gi')) || [];
}

function attr(tag, nome) {
  const m = new RegExp(`${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : '';
}

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n) || h.length !== 6) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function normalizarHex(cor) {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(String(cor || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function saturacao(hex) {
  const c = rgb(hex);
  if (!c) return -1;
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  if (max < 28 || min > 236 || max === min) return -1;
  return (max - min) / 255;
}

export function corTexto(hex) {
  const c = rgb(hex) || { r: 11, g: 111, b: 206 };
  const y = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return y > 0.62 ? '#102238' : '#FFFFFF';
}

export function escolherCor(lista) {
  let melhor = null;
  let nota = -1;
  for (const bruta of lista) {
    const hex = normalizarHex(bruta);
    if (!hex) continue;
    const s = saturacao(hex);
    if (s > nota) { nota = s; melhor = hex; }
  }
  return nota >= 0 ? melhor : null;
}

function acharLogo(html) {
  const imgs = tags(html, 'img').filter((t) => /logo/i.test(`${attr(t, 'class')} ${attr(t, 'id')} ${attr(t, 'alt')}`));
  if (imgs[0]) return attr(imgs[0], 'src');
  const links = tags(html, 'link');
  const icone = links.find((t) => /apple-touch-icon/i.test(attr(t, 'rel')))
    || links.find((t) => /(^|\s)icon(\s|$)/i.test(attr(t, 'rel')));
  if (icone) return attr(icone, 'href');
  const og = tags(html, 'meta').find((t) => attr(t, 'property') === 'og:image' || attr(t, 'name') === 'og:image');
  return og ? attr(og, 'content') : '';
}

export function corUsavel(hex) {
  const n = normalizarHex(hex);
  return n && saturacao(n) >= 0 ? n : null;
}

export function extrairMarca(html) {
  const src = String(html || '');
  const theme = tags(src, 'meta').map((t) => (attr(t, 'name') === 'theme-color' ? attr(t, 'content') : '')).find(Boolean);
  const cores = [];
  for (const m of src.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) || []) cores.push(m);
  const cor = corUsavel(theme) || escolherCor(cores) || '#0B6FCE';
  const titulo = (src.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  return { cor, corTexto: corTexto(cor), logo: acharLogo(src), titulo: titulo.trim().slice(0, 80) };
}

export function resolverLogo(href, baseDir) {
  if (!href) return null;
  if (/^https?:/i.test(href) || href.startsWith('//') || href.startsWith('data:')) return null;
  if (!baseDir) return null;
  const limpo = href.split('?')[0].split('#')[0];
  if (!limpo || limpo.includes('\0')) return null;
  const base = path.resolve(baseDir);
  const abs = path.resolve(base, limpo);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) return null;
  return abs;
}

export function gravarLogo(href, baseDir, destino) {
  const abs = resolverLogo(href, baseDir);
  if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const ext = path.extname(abs).toLowerCase();
  if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return null;
  const nome = `logo${ext}`;
  fs.copyFileSync(abs, path.join(destino, nome));
  return nome;
}
