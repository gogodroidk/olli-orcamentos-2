/*
 * Generates PLACEHOLDER PWA icons into web/public/ with zero dependencies:
 * a solid #0A2540 square with white "OLLI" text. Produces:
 *   icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
 *
 * Maskable variant keeps the text within the inner ~80% safe zone so platform
 * masking never clips it. The PNG is hand-encoded (uncompressed/stored zlib
 * blocks + CRC32), which is enough for flat-colour placeholder art.
 *
 * Run: node scripts/generate-icons.mjs   (also wired as npm run icons)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');
mkdirSync(OUT, { recursive: true });

const BG = [0x0a, 0x25, 0x40]; // #0A2540
const FG = [0xff, 0xff, 0xff]; // white

// 5x7 bitmap glyphs for the letters we need: O, L, I.
const GLYPHS = {
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
};
const WORD = 'OLLI';

function buildPixels(size, safeFraction) {
  // RGBA buffer filled with the background colour.
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4 + 0] = BG[0];
    px[i * 4 + 1] = BG[1];
    px[i * 4 + 2] = BG[2];
    px[i * 4 + 3] = 0xff;
  }

  // Lay out WORD as 5x7 glyphs with 1-cell spacing, scaled to fit safe area.
  const cols = WORD.length * 5 + (WORD.length - 1); // glyph cols + gaps
  const rows = 7;
  const safe = size * safeFraction;
  const scale = Math.floor(Math.min(safe / cols, safe / rows));
  const textW = cols * scale;
  const textH = rows * scale;
  const startX = Math.floor((size - textW) / 2);
  const startY = Math.floor((size - textH) / 2);

  let cursor = startX;
  for (const ch of WORD) {
    const g = GLYPHS[ch];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < 5; c++) {
        if (g[r][c] !== '1') continue;
        // paint a scale x scale block
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = cursor + c * scale + dx;
            const y = startY + r * scale + dy;
            const idx = (y * size + x) * 4;
            px[idx + 0] = FG[0];
            px[idx + 1] = FG[1];
            px[idx + 2] = FG[2];
            px[idx + 3] = 0xff;
          }
        }
      }
    }
    cursor += 5 * scale + scale; // glyph width + 1-cell gap
  }
  return px;
}

// ── Minimal PNG encoder ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline prefixed with filter byte 0 (none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, size, safeFraction) {
  const png = encodePng(size, buildPixels(size, safeFraction));
  writeFileSync(join(OUT, name), png);
  console.log(`  wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}

console.log('Generating placeholder PWA icons:');
write('icon-192.png', 192, 0.7);
write('icon-512.png', 512, 0.7);
// Maskable: keep art inside the ~80% safe zone -> use a smaller text fraction.
write('icon-maskable-512.png', 512, 0.55);
write('apple-touch-icon.png', 180, 0.7);
console.log('Done.');
