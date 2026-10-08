import { fileURLToPath } from 'node:url';
// Uso: node e2e/support/inspecionar.mjs /auth/login   — imprime campos/botões visíveis da rota (depuração dos seletores).
import { chromium } from 'playwright';
import { servir } from './servidor-estatico.mjs';
import { criarBackend } from './backend-mock.mjs';

const rota = process.argv[2] ?? '/auth/login';
const { servidor, url } = await servir(fileURLToPath(new URL('../../.e2e-dist/painel', import.meta.url)), { spa: true });
const b = criarBackend();
console.log('launch'); const browser = await chromium.launch(); console.log('launched');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
await b.instalar(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE.ERROR', m.text().slice(0, 200)));
console.log('goto', url + rota); if (process.env.SIGNUP) { const { cadastrar } = await import('./fluxo.mjs'); await cadastrar(page, url); await page.waitForTimeout(4000); console.log('pos-cadastro', page.url()); }
await page.goto(url + rota, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(2500);
console.log('URL', page.url());
console.log(await page.evaluate(() => [...document.querySelectorAll('input,button,a,select,textarea,[role=tab]')]
  .filter((e) => e.offsetParent !== null)
  .map((e) => `${e.tagName.toLowerCase()}[${e.type ?? ''}] name=${e.name ?? ''} ph=${e.placeholder ?? ''} aria=${e.getAttribute('aria-label') ?? ''} txt=${(e.innerText ?? '').trim().slice(0, 50)}`).join('\n')));
console.log('NAO MOCKADOS', b.naoMockados);
await browser.close();
servidor.close();
