// Servidor estático com fallback de SPA (painel) para os testes E2E. Sem dependências.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.avif': 'image/avif', '.webmanifest': 'application/manifest+json',
};

async function existe(p) { try { return (await stat(p)).isFile() ? p : null; } catch { return null; } }

export function servir(raiz, { spa = false, porta = 0 } = {}) {
  const servidor = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
      if (rel.includes('..')) { res.writeHead(400).end(); return; }
      let alvo = await existe(join(raiz, rel));
      alvo ??= await existe(join(raiz, rel, 'index.html'));
      alvo ??= await existe(join(raiz, `${rel}.html`));
      if (!alvo && spa && !extname(rel)) alvo = await existe(join(raiz, 'index.html'));
      if (!alvo) {
        const nf = await existe(join(raiz, '404.html'));
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(nf ? await readFile(nf) : 'nao encontrado');
        return;
      }
      res.writeHead(200, { 'content-type': TIPOS[extname(alvo)] ?? 'application/octet-stream' });
      res.end(await readFile(alvo));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise((ok) => servidor.listen(porta, '127.0.0.1', () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}` })));
}
