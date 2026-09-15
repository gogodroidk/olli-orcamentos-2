import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

console.log('\nPainel OLLI — paridade de headers Cloudflare/Vercel');

const raiz = new URL('../webapp/', import.meta.url);
const vercel = JSON.parse(readFileSync(new URL('vercel.json', raiz), 'utf8'));
const cloudflare = readFileSync(new URL('public/_headers', raiz), 'utf8');
const globais = vercel.headers?.find((item: { source?: string }) => item.source === '/(.*)');
const assets = vercel.headers?.find((item: { source?: string }) => item.source === '/assets/(.*)');
assert.ok(globais && Array.isArray(globais.headers), 'Vercel precisa aplicar headers globais');

const mapa = new Map<string, string>(globais.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
for (const chave of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-Frame-Options', 'Content-Security-Policy']) {
  assert.ok(mapa.has(chave), `header ausente no Vercel: ${chave}`);
}
assert.equal(mapa.get('X-Frame-Options'), 'DENY');
assert.match(mapa.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
assert.match(mapa.get('Content-Security-Policy') ?? '', /base-uri 'self'/);
assert.match(mapa.get('Content-Security-Policy') ?? '', /form-action 'self'/);

for (const [chave, valor] of mapa) {
  assert.ok(cloudflare.includes(`${chave}: ${valor}`), `${chave} precisa coincidir com public/_headers`);
}
assert.equal(assets?.headers?.[0]?.value, 'public, max-age=31536000, immutable');
assert.equal(vercel.rewrites?.[0]?.destination, '/', 'rewrite SPA foi preservado');

console.log('PASSOU: CSP, framing, MIME, referrer, permissões e cache são equivalentes nos dois destinos.');
