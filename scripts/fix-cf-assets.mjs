// Cloudflare Pages NÃO publica pastas chamadas `node_modules`. O expo-sqlite
// (web) emite o seu .wasm em `dist/assets/node_modules/expo-sqlite/.../wa-sqlite.wasm`,
// então esse arquivo some no deploy e o SQLite quebra na web (WASM vira index.html).
//
// Este script roda DEPOIS do `expo export -p web`: move `dist/assets/node_modules`
// para `dist/assets/nm` e reescreve as referências `assets/node_modules/` ->
// `assets/nm/` nos bundles, pra o wasm ser servido normalmente.
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dist = path.resolve('dist');
const assetsDir = path.join(dist, 'assets');
const fromDir = path.join(dist, 'assets', 'node_modules');
const toDir = path.join(dist, 'assets', 'nm');

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
function assertInsideAssets(p) {
  const rel = path.relative(assetsDir, p);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`fix-cf-assets: caminho fora de dist/assets: ${p}`);
  }
}
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(f));
    else out.push(f);
  }
  return out;
}
async function moveAssetsDir(from, to) {
  assertInsideAssets(from);
  assertInsideAssets(to);
  await fs.rm(to, { recursive: true, force: true });
  try {
    await fs.rename(from, to);
  } catch (e) {
    if (!['EPERM', 'EXDEV', 'EACCES'].includes(e?.code)) throw e;
    // Windows pode bloquear rename de arvores recem-geradas por alguns instantes.
    // Copy+rm e mais lento, mas deixa o export deterministico para deploy.
    await fs.cp(from, to, { recursive: true });
    await fs.rm(from, { recursive: true, force: true });
  }
}

if (!(await exists(dist))) {
  console.log('fix-cf-assets: dist não existe — rode o expo export antes.');
  process.exit(0);
}
if (await exists(fromDir)) {
  await moveAssetsDir(fromDir, toDir);
  const files = (await walk(dist)).filter(f => /\.(js|html|map|json)$/.test(f));
  let n = 0;
  for (const f of files) {
    const s = await fs.readFile(f, 'utf8');
    if (s.includes('assets/node_modules/')) {
      await fs.writeFile(f, s.split('assets/node_modules/').join('assets/nm/'));
      n++;
    }
  }
  console.log(`fix-cf-assets: assets/node_modules -> assets/nm; ${n} arquivo(s) ajustado(s).`);
} else {
  console.log('fix-cf-assets: nada a mover (sem assets/node_modules).');
}

// ─────────────────────────────────────────────────────────────────────────────
// `_redirects` — o mesmo build serve DOIS destinos com regras opostas.
//
//   Cloudflare Pages (olli-app -> app.olliorcamentos.online) EXIGE o `_redirects`
//   com `/* /index.html 200` para o fallback de SPA. Esse deploy é feito pela
//   PRÓPRIA Cloudflare a partir do Git (Git provider = Yes), usando `public/`.
//
//   Cloudflare Workers Assets (olli-site -> RAIZ olliorcamentos.online) RECUSA a
//   mesma regra: "Infinite loop detected in this rule" (code 100324). Lá o
//   fallback é configuração (`not_found_handling: single-page-application`, em
//   site/wrangler.jsonc), não arquivo.
//
// Como este `dist/` local só é usado para publicar a RAIZ, tiramos o arquivo
// daqui. `public/_redirects` continua versionado, e o Pages segue funcionando.
// `.assetsignore` seria mais elegante, mas o wrangler 4.105 não o honrou.
// ─────────────────────────────────────────────────────────────────────────────
const redirects = path.join(dist, '_redirects');
if (await exists(redirects)) {
  await fs.rm(redirects);
  console.log('fix-cf-assets: dist/_redirects removido (proibido no Workers Assets; ver comentario).');
}
const assetsIgnoreAntigo = path.join(dist, '.assetsignore');
if (await exists(assetsIgnoreAntigo)) await fs.rm(assetsIgnoreAntigo);

// O service worker precisa mudar a cada export, mesmo quando o seu código-fonte
// não mudou. O hash do HTML já incorpora os nomes content-addressed dos bundles;
// usá-lo como build id torna a atualização determinística e elimina caches da
// versão anterior sem timestamp ou estado externo.
const swPath = path.join(dist, 'sw.js');
const indexPath = path.join(dist, 'index.html');
if (await exists(swPath) && await exists(indexPath)) {
  const html = await fs.readFile(indexPath);
  const buildId = createHash('sha256').update(html).digest('hex').slice(0, 16);
  const sw = await fs.readFile(swPath, 'utf8');
  if (!sw.includes('__OLLI_BUILD_ID__')) {
    throw new Error('fix-cf-assets: placeholder __OLLI_BUILD_ID__ ausente em dist/sw.js');
  }
  if (!sw.includes('__OLLI_PRECACHE__')) {
    throw new Error('fix-cf-assets: placeholder __OLLI_PRECACHE__ ausente em dist/sw.js');
  }

  // O primeiro carregamento acontece antes de o service worker controlar a
  // página. Sem esta lista, o HTML abriria offline, mas o bundle do app não.
  // Incluímos somente artefatos locais gerados pelo Expo; API, autenticação e
  // respostas de negócio continuam expressamente fora do cache.
  const artefatos = (await walk(dist))
    .map((arquivo) => path.relative(dist, arquivo).split(path.sep).join('/'))
    .filter((relativo) => relativo.startsWith('_expo/') || relativo.startsWith('assets/'))
    .map((relativo) => `/${relativo}`)
    .sort();

  const swVersionado = sw
    .split('__OLLI_BUILD_ID__').join(buildId)
    .replace('__OLLI_PRECACHE__', JSON.stringify(artefatos));
  await fs.writeFile(swPath, swVersionado);
  console.log(`fix-cf-assets: service worker versionado com build ${buildId} e ${artefatos.length} artefatos locais.`);
}
