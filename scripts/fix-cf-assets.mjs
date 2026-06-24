// Cloudflare Pages NÃO publica pastas chamadas `node_modules`. O expo-sqlite
// (web) emite o seu .wasm em `dist/assets/node_modules/expo-sqlite/.../wa-sqlite.wasm`,
// então esse arquivo some no deploy e o SQLite quebra na web (WASM vira index.html).
//
// Este script roda DEPOIS do `expo export -p web`: move `dist/assets/node_modules`
// para `dist/assets/nm` e reescreve as referências `assets/node_modules/` ->
// `assets/nm/` nos bundles, pra o wasm ser servido normalmente.
import { promises as fs } from 'node:fs';
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
