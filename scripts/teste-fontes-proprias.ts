/**
 *     node scripts/teste-fontes-proprias.ts
 * Exit 0 = passou; 1 = falhou. LGPD: nenhuma página do worker carrega Google Fonts (o <link> entrega o IP do visitante ao Google);
 * as fontes saem de olliorcamentos.online/fonts, que tem de existir, ter licença e CORS aberto.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { FONTES_CSS, FONTES_ORIGEM } from '../worker/src/fontesProprias.js';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${nome}`);
  if (!cond) falhas++;
};

const SRC = 'worker/src';
const fontesGoogle = readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(readFileSync(`${SRC}/${f}`, 'utf8')));
ok(`worker/src sem Google Fonts${fontesGoogle.length ? ` (achou em ${fontesGoogle.join(', ')})` : ''}`, fontesGoogle.length === 0);

const arquivos = [...FONTES_CSS.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
ok('FONTES_CSS tem 3 @font-face', arquivos.length === 3);
for (const url of arquivos) {
  ok(`url própria: ${url}`, url.startsWith(`${FONTES_ORIGEM}/fonts/`));
  const arq = `web/public/fonts/${url.split('/').pop()}`;
  ok(`arquivo existe: ${arq}`, existsSync(arq));
}
ok('licença Plus Jakarta Sans', existsSync('web/public/fonts/LICENSE-plus-jakarta-sans.txt'));
ok('licença Spectral', existsSync('web/public/fonts/LICENSE-spectral.txt'));
const headers = readFileSync('web/public/_headers', 'utf8');
ok('_headers: /fonts/* com CORS aberto', /\/fonts\/\*[\s\S]*Access-Control-Allow-Origin:\s*\*/.test(headers));

const paginas = ['link', 'stripe', 'pmoc', 'equipe', 'confirmacaoVisita', 'adminPagina'];
for (const p of paginas) ok(`${p}.js usa FONTES_CSS`, readFileSync(`${SRC}/${p}.js`, 'utf8').includes('FONTES_CSS'));
for (const p of ['link', 'stripe', 'pmoc', 'equipe', 'confirmacaoVisita', 'admin']) {
  const csp = readFileSync(`${SRC}/${p}.js`, 'utf8').match(/font-src[^;'"`]*/g) ?? [];
  ok(`${p}.js CSP font-src não cita Google`, csp.every((c) => !/google|gstatic/.test(c)));
}

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log('\ntudo ok');
