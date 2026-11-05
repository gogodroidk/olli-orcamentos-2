/**
 * Prévia estática do painel admin, só com dados fictícios.
 *     node worker/scripts/previa-admin-funcionalidades.js
 * Abre http://127.0.0.1:9815/ — não fala com o banco.
 */
import http from 'node:http';
import { adminHtml } from '../src/adminPagina.js';

const html = adminHtml(
  { SUPABASE_URL: 'https://exemplo.invalid', SUPABASE_ANON_KEY: 'anon-ficticia' },
  'ab'.repeat(16),
  { previa: true, trocaMesesMax: 3, creditosAjusteMax: 5000 },
);

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
});

server.listen(9815, '127.0.0.1', () => {
  console.log('previa http://127.0.0.1:9815/');
});
