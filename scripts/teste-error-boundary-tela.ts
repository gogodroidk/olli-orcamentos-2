/**
 * CQ-APP-13-B — prova que erro de render numa tela NÃO fecha o app: aparece a
 * tela amigável, as abas seguem de pé e "Tentar de novo" remonta a tela.
 * Roda o ErrorBoundary real (react-native-web + Chromium headless do Playwright).
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const raiz = new URL('..', import.meta.url).pathname;
const nav = readFileSync(join(raiz, 'src/navigation/AppNavigator.tsx'), 'utf8');
assert.match(nav, /<Tab\.Navigator\s+screenLayout=\{limiteDeTela\}/, 'abas sem boundary por tela');
assert.match(nav, /<Stack\.Navigator\s+screenLayout=\{limiteDeTela\}/, 'stack sem boundary por tela');

const vazio = 'export const capturarExcecao=()=>{};export const enviarFeedback=async()=>{};export const navigationRef={isReady:()=>false};export function OlliMascot(){return null};export const MaterialCommunityIcons=()=>null;export const Ionicons=()=>null;export default {};export const impactAsync=async()=>{};export const ImpactFeedbackStyle={}';
const dir = mkdtempSync(join(tmpdir(), 'eb-'));
await build({
  entryPoints: [join(raiz, 'scripts/fixtures/error-boundary-harness.tsx')],
  bundle: true, outfile: join(dir, 'app.js'), format: 'iife', jsx: 'automatic', logLevel: 'error',
  define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"', 'process.env': '{}', global: 'window' },
  banner: { js: 'var process={env:{}};' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js'],
  loader: { '.png': 'dataurl', '.ttf': 'dataurl', '.js': 'jsx' },
  alias: { 'react-native': 'react-native-web' },
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /services\/(feedback|sentryCaptura)$|navigation\/navigationRef$|components\/OlliMascot$|^@expo\/vector-icons|^expo-haptics$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: vazio, loader: 'js' }));
  } }],
});
writeFileSync(join(dir, 'index.html'), '<div id="root"></div><script src="app.js"></script>');

// Usa o Chromium headless que o Playwright tem baixado (qualquer revisão); se
// faltar, cai no padrão do Playwright. Nunca toca no Chrome do usuário.
function chromiumLocal(): string | undefined {
  const base = join(homedir(), '.cache/ms-playwright');
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse()) {
    const exe = join(base, d, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || chromiumLocal() });
try {
  for (const tela of ['Inicio', 'Orcamentos', 'NovoOrcamento', 'Agenda', 'Entrar']) {
    const page = await browser.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    if (process.env.DEBUG_EB) page.on('console', (m) => console.log('[console]', m.text().slice(0, 300)));
    await page.goto(`file://${dir}/index.html?tela=${tela}`);
    await page.getByText('Algo deu errado').waitFor({ timeout: 5000 }).catch((e) => {
      throw new Error(`${tela}: fallback não apareceu (${e}); erros da página: ${erros.join(' | ').slice(0, 800)}`);
    });
    assert.ok(await page.getByText('abas continuam').isVisible(), `${tela}: app inteiro caiu`);
    await page.evaluate(() => { (window as any).quebrar = false; });
    await page.getByLabel('Tentar abrir esta tela de novo').click();
    await page.getByText(`tela ${tela} ok`).waitFor({ timeout: 5000 });
    assert.deepEqual(erros, [], `${tela}: erro escapou do boundary`);
    console.log(`  ✓ ${tela}: tela amigável, abas de pé, "Tentar de novo" remonta`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('PASSOU: ErrorBoundary por tela segura erro de render sem fechar o app.');
