/**
 * Servidor estático mínimo para o export web do app (dist-telas/).
 *
 * Existe por dois motivos que um `npx serve` qualquer não cobre:
 *   1. O expo-sqlite na web roda em wa-sqlite (WASM) com OPFS num Worker; o
 *      próprio `dist/_headers` do export exige `Cross-Origin-Opener-Policy` e
 *      `Cross-Origin-Embedder-Policy`. Sem esses dois cabeçalhos o banco local
 *      não abre e o app trava no splash.
 *   2. O app é uma SPA com URLs reais (/orcamentos, /agenda, …): qualquer
 *      caminho que não seja um arquivo tem de cair no index.html.
 *
 * Sem dependência nova: node:http + node:fs.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function arquivo(raiz, urlPath) {
  // normalize + prefixo obrigatório: nenhuma URL com ../ sai da raiz servida.
  const semQuery = urlPath.split('?')[0].split('#')[0];
  const decodificado = decodeURIComponent(semQuery);
  const alvo = normalize(join(raiz, decodificado));
  if (alvo !== raiz && !alvo.startsWith(raiz + sep)) return null;
  try {
    const st = statSync(alvo);
    if (st.isFile()) return alvo;
    if (st.isDirectory()) {
      const indice = join(alvo, 'index.html');
      return statSync(indice).isFile() ? indice : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function servir(dir, porta = 0) {
  const raiz = resolve(dir);
  const server = createServer((req, res) => {
    const alvo = arquivo(raiz, req.url ?? '/') ?? join(raiz, 'index.html');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', TIPOS[extname(alvo).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(alvo)
      .on('error', () => {
        res.statusCode = 404;
        res.end('nao encontrado');
      })
      .pipe(res);
  });

  return new Promise((ok, falhou) => {
    server.on('error', falhou);
    server.listen(porta, '127.0.0.1', () => {
      const { port } = server.address();
      ok({ url: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => server.close(r)) });
    });
  });
}
