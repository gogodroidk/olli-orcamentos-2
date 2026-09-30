/**
 * ORÇAMENTO DE BUNDLE DO PAINEL (webapp/) — o teto que não deixa o peso voltar.
 *
 *     node scripts/teste-orcamento-bundle-painel.ts                  (contrato estático)
 *     node scripts/teste-orcamento-bundle-painel.ts --dist webapp/dist  (mede o build)
 *
 * Por que existe: o painel já perdeu peso três vezes (Sentry depois da pintura,
 * `domMax` sob demanda, axios fora do boot) e nas três o comentário avisava "o build
 * passa, o peso volta em silêncio". Animação é o jeito mais fácil de engordar sem
 * ninguém ver — um `import { animate } from "motion"` no lugar errado puxa o motor
 * inteiro para a primeira tela. Este teste transforma o aviso em trava.
 *
 * 1) SEMPRE (cadeia `npm test` da raiz): os limites existem e são coerentes, o
 *    `motion` não está no `manualChunks` e ninguém importa `motion-features` de
 *    forma estática (as duas coisas que desfazem o LazyMotion sem quebrar o build).
 * 2) COM `--dist <pasta>` (job `painel` do CI, depois do build): lê o index.html,
 *    soma o gzip do JS CRÍTICO (entrada + modulepreload), do CSS crítico e de todo o
 *    JS emitido, e falha se qualquer um passar do teto em `webapp/orcamento-bundle.json`.
 *
 * Subir o teto é permitido — mas é uma decisão escrita no JSON, com o motivo, no
 * mesmo PR que engordou. Nunca um efeito colateral.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webapp = join(raiz, 'webapp');
let passou = 0;

function ok(condicao: unknown, mensagem: string): void {
  assert.ok(condicao, mensagem);
  passou += 1;
  console.log(`  ok   ${mensagem}`);
}

interface Orcamento {
  motivo: string;
  jsCriticoGzipKb: number;
  cssCriticoGzipKb: number;
  jsTotalGzipKb: number;
  metaJsCriticoGzipKb: number;
}

console.log('\nOrçamento de bundle do painel — o peso não volta em silêncio');

// ── 1) contrato estático ────────────────────────────────────────────────────
const orcamento = JSON.parse(readFileSync(join(webapp, 'orcamento-bundle.json'), 'utf8')) as Orcamento;
for (const campo of ['jsCriticoGzipKb', 'cssCriticoGzipKb', 'jsTotalGzipKb', 'metaJsCriticoGzipKb'] as const) {
  ok(Number.isFinite(orcamento[campo]) && orcamento[campo] > 0, `limite ${campo} é um número positivo`);
}
ok(typeof orcamento.motivo === 'string' && orcamento.motivo.length > 20, 'o teto traz o motivo escrito');
ok(
  orcamento.metaJsCriticoGzipKb <= orcamento.jsCriticoGzipKb,
  'a meta do plano (≤ 250 KB) não é maior que o teto atual — o teto só pode descer até ela',
);

const viteConfig = readFileSync(join(webapp, 'vite.config.ts'), 'utf8');
const blocoChunks = viteConfig.slice(viteConfig.indexOf('manualChunks:'), viteConfig.indexOf('},', viteConfig.indexOf('manualChunks:')));
ok(blocoChunks.length > 0 && !/["']motion["']/.test(blocoChunks), 'o pacote motion NÃO está no manualChunks');

function arquivosFonte(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}
const fontes = arquivosFonte(join(webapp, 'src'));
const importEstatico = fontes.filter((f) => /^\s*import[^;]*from\s+["'][^"']*motion-features["']/m.test(readFileSync(f, 'utf8')));
ok(importEstatico.length === 0, `ninguém importa motion-features de forma estática${importEstatico.length ? `: ${importEstatico.map((f) => relative(raiz, f)).join(', ')}` : ''}`);
// O motor de animação por JS (`animate`, `useAnimate`) fica fora das telas: o
// contador de dinheiro usa requestAnimationFrame + a curva do token, sem motor.
const motorJs = fontes.filter((f) => /import\s*\{[^}]*\b(animate|useAnimate|animateMini)\b[^}]*\}\s*from\s*["']motion/.test(readFileSync(f, 'utf8')));
ok(motorJs.length === 0, `nenhuma tela importa o motor animate() do motion${motorJs.length ? `: ${motorJs.map((f) => relative(raiz, f)).join(', ')}` : ''}`);

// ── 2) medição do build ─────────────────────────────────────────────────────
const idx = process.argv.indexOf('--dist');
if (idx !== -1) {
  const dist = resolve(process.cwd(), process.argv[idx + 1] ?? 'dist');
  ok(existsSync(join(dist, 'index.html')), `build encontrado em ${dist}`);
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const kb = (arquivo: string) => gzipSync(readFileSync(join(dist, arquivo.replace(/^\//, '')))).length / 1024;

  const scripts = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  const estilos = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  ok(scripts.length >= 1, 'o index.html tem a entrada module');

  const critico = [...new Set([...scripts, ...preloads])];
  const jsCritico = critico.reduce((s, a) => s + kb(a), 0);
  const cssCritico = estilos.reduce((s, a) => s + kb(a), 0);
  const assets = readdirSync(join(dist, 'assets'));
  const jsTotal = assets.filter((a) => a.endsWith('.js')).reduce((s, a) => s + kb(`assets/${a}`), 0);

  console.log('\n  arquivo crítico                               gzip');
  for (const a of critico) console.log(`  ${a.padEnd(44)} ${kb(a).toFixed(1).padStart(7)} KB`);
  console.log(`  ${'JS crítico'.padEnd(44)} ${jsCritico.toFixed(1).padStart(7)} KB  (teto ${orcamento.jsCriticoGzipKb}, meta ${orcamento.metaJsCriticoGzipKb})`);
  console.log(`  ${'CSS crítico'.padEnd(44)} ${cssCritico.toFixed(1).padStart(7)} KB  (teto ${orcamento.cssCriticoGzipKb})`);
  console.log(`  ${'JS total emitido'.padEnd(44)} ${jsTotal.toFixed(1).padStart(7)} KB  (teto ${orcamento.jsTotalGzipKb})\n`);

  ok(!critico.some((a) => /motion-features|vendor-sentry|vendor-charts/.test(a)), 'features do motion, Sentry e gráficos ficam FORA do caminho crítico');
  ok(jsCritico <= orcamento.jsCriticoGzipKb, `JS crítico ${jsCritico.toFixed(1)} KB ≤ ${orcamento.jsCriticoGzipKb} KB`);
  ok(cssCritico <= orcamento.cssCriticoGzipKb, `CSS crítico ${cssCritico.toFixed(1)} KB ≤ ${orcamento.cssCriticoGzipKb} KB`);
  ok(jsTotal <= orcamento.jsTotalGzipKb, `JS total ${jsTotal.toFixed(1)} KB ≤ ${orcamento.jsTotalGzipKb} KB`);
} else {
  console.log('  --   sem --dist: a medição roda no job "painel" do CI, depois do build');
}

console.log(`\n${passou} verificações passaram.\n`);
