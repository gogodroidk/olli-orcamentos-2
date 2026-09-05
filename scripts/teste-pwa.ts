import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const raiz = process.cwd();
const publico = path.join(raiz, 'public');
const validarDist = process.argv.includes('--dist');
let passou = 0;

async function texto(relativo: string): Promise<string> {
  return readFile(path.join(raiz, relativo), 'utf8');
}

async function dimensoesPng(relativo: string): Promise<{ largura: number; altura: number }> {
  const buffer = await readFile(path.join(raiz, relativo));
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
}

function ok(condicao: unknown, mensagem: string): void {
  assert.ok(condicao, mensagem);
  passou += 1;
  console.log(`  ok   ${mensagem}`);
}

console.log('\nPWA OLLI — instalação, atualização e cache seguro');

const manifest = JSON.parse(await readFile(path.join(publico, 'manifest.webmanifest'), 'utf8'));
ok(manifest.id === '/', 'manifesto tem identidade estável');
ok(manifest.name === 'OLLI Orçamentos' && manifest.short_name === 'OLLI', 'marca pública é somente OLLI');
ok(manifest.display === 'standalone', 'abre sem moldura do navegador quando instalado');
ok(manifest.scope === '/' && manifest.start_url.startsWith('/'), 'scope e início pertencem à aplicação');
ok(manifest.prefer_related_applications === false, 'instalação web não é desviada para outra loja');

const icones = new Map(manifest.icons.map((icone: { sizes: string; src: string }) => [icone.sizes, icone.src]));
ok(icones.has('192x192') && icones.has('512x512'), 'manifesto declara ícones 192 e 512');
const icon192 = await dimensoesPng(`public${icones.get('192x192')}`);
const icon512 = await dimensoesPng(`public${icones.get('512x512')}`);
ok(icon192.largura === 192 && icon192.altura === 192, 'arquivo do ícone 192 tem dimensões verdadeiras');
ok(icon512.largura === 512 && icon512.altura === 512, 'arquivo do ícone 512 tem dimensões verdadeiras');

const html = await texto('public/index.html');
ok(html.includes('rel="manifest" href="/manifest.webmanifest"'), 'HTML vincula o manifesto');
ok(html.includes('src="/pwa-register.js"'), 'registro do service worker é externo e versionável');
ok(html.includes('apple-mobile-web-app-capable'), 'iOS recebe metadados de instalação');
ok(html.includes('prefers-reduced-motion: reduce'), 'ação da PWA respeita movimento reduzido');
ok(html.includes(':focus-visible'), 'controles auxiliares mantêm foco visível');

const registro = await texto('public/pwa-register.js');
for (const sinal of ['beforeinstallprompt', 'appinstalled', 'updatefound', 'controllerchange', 'SKIP_WAITING']) {
  ok(registro.includes(sinal), `registro cobre ${sinal}`);
}
ok(registro.includes("updateViaCache: 'none'"), 'checagem do service worker não usa cópia HTTP antiga');
ok(registro.includes("window.isSecureContext"), 'registro exige contexto seguro');

const sw = await texto('public/sw.js');
ok(sw.includes('__OLLI_BUILD_ID__'), 'fonte do service worker exige versão injetada no export');
ok(sw.includes('__OLLI_PRECACHE__'), 'fonte do service worker exige lista de artefatos injetada no export');
ok(sw.includes('...GENERATED_SHELL'), 'shell inclui os artefatos gerados pelo Expo');
ok(sw.includes("url.origin !== self.location.origin"), 'service worker ignora origens externas');
ok(sw.includes("request.method !== 'GET'"), 'service worker nunca intercepta mutações');
ok(sw.includes("request.mode === 'navigate'"), 'navegação tem fallback offline explícito');
ok(sw.includes('STATIC_DESTINATIONS'), 'cache dinâmico é limitado a recursos estáticos');
ok(sw.includes("url.pathname.startsWith('/_expo/')") && sw.includes("url.pathname.startsWith('/assets/')"), 'allowlist cobre apenas bundles e assets locais');
ok(!sw.includes('Authorization') && !sw.includes('supabase'), 'cache não conhece autenticação nem backend');

const headers = await texto('public/_headers');
ok(headers.includes('/sw.js') && headers.includes('no-cache, no-store, must-revalidate'), 'service worker é sempre revalidado');
ok(headers.includes('application/manifest+json'), 'manifesto recebe tipo MIME explícito');

if (validarDist) {
  for (const arquivo of ['manifest.webmanifest', 'pwa-register.js', 'sw.js', 'offline.html', 'icon-192.png', 'icon-512.png']) {
    ok((await stat(path.join(raiz, 'dist', arquivo))).isFile(), `export contém ${arquivo}`);
  }
  const swExportado = await texto('dist/sw.js');
  ok(!swExportado.includes('__OLLI_BUILD_ID__'), 'export substitui o placeholder do build');
  ok(!swExportado.includes('__OLLI_PRECACHE__'), 'export substitui o placeholder dos artefatos');
  ok(swExportado.includes('/_expo/static/js/web/'), 'export pré-carrega os bundles do aplicativo');
  ok(swExportado.includes('/assets/nm/'), 'export pré-carrega os recursos locais do aplicativo');
  ok(/CACHE_NAME = `\$\{CACHE_PREFIX\}[a-f0-9]{16}`/.test(swExportado), 'export usa build id derivado do conteúdo');
}

console.log(`\nPASSOU: ${passou} verificações, 0 falhas\n`);
