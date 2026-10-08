// E2E da LANDING (Astro estatico). Roda: node --test e2e/landing/landing.spec.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { servir } from '../support/servidor-estatico.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '.e2e-dist', 'landing-novo');
const FONTE_PLANOS = 'C:/OLLI_REL/web/src/data/planos.ts';
const T = { timeout: 120_000 };

let srv, base, browser, context;

// Precos lidos da FONTE (centavos), nunca de memoria.
function lerPrecos() {
  const src = readFileSync(FONTE_PLANOS, 'utf8');
  const pega = (plano, campo) => {
    const bloco = src.slice(src.indexOf(`${plano}: {`));
    const m = bloco.match(new RegExp(`${campo}:\\s*([0-9_]+)`));
    return Number(m[1].replaceAll('_', ''));
  };
  const reais = (c) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return {
    proMensal: reais(pega('pro', 'mensalCentavos')),
    proAnual: reais(pega('pro', 'anualCentavos')),
    empMensal: reais(pega('empresa', 'mensalCentavos')),
    empAnual: reais(pega('empresa', 'anualCentavos')),
  };
}

async function abrir(caminho) {
  const page = await context.newPage();
  const erros = [];
  const consoleErr = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location()?.url ?? '';
    if (loc.startsWith(base) || loc === '') consoleErr.push(m.text());
  });
  const resp = await page.goto(base + caminho, { waitUntil: 'load', timeout: 60_000 });
  return { page, resp, erros, consoleErr };
}

before(async () => {
  assert.ok(existsSync(join(RAIZ, 'index.html')), 'dist da landing ausente em ' + RAIZ);
  ({ servidor: srv, url: base } = await servir(RAIZ));
  browser = await chromium.launch({ headless: true, timeout: 60_000 });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  // Landing nao deve depender de rede externa: tudo que nao for local e abortado.
  await context.route((u) => !u.href.startsWith(base), (r) => r.abort());
}, { timeout: 90_000 });

after(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await new Promise((ok) => (srv ? srv.close(ok) : ok()));
}, { timeout: 60_000 });

test('home: sem pageerror/console.error, h1 e CTA para o painel', T, async () => {
  const { page, resp, erros, consoleErr } = await abrir('/');
  assert.equal(resp.status(), 200);
  assert.ok((await page.locator('h1').count()) >= 1, 'sem h1');
  assert.ok((await page.locator('h1').first().innerText()).trim().length > 3);
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const cta = hrefs.filter((h) => /\/auth\/login|\/entrar|app\.olliorcamentos\.online/.test(h));
  assert.ok(cta.length > 0, 'nenhum CTA aponta para o painel');
  assert.ok(await page.locator('a[href*="app.olliorcamentos.online"]').first().isVisible(), 'CTA para o painel nao visivel');
  assert.deepEqual(erros, [], 'pageerror: ' + erros.join(' | '));
  assert.deepEqual(consoleErr, [], 'console.error: ' + consoleErr.join(' | '));
  await page.close();
});

test('/planos: Gratis/Pro/Empresa, precos da fonte e Pix', T, async () => {
  const p = lerPrecos();
  const { page, resp, erros } = await abrir('/planos/');
  assert.equal(resp.status(), 200);
  const txt = await page.locator('body').innerText();
  const html = await page.content();
  for (const nome of ['Grátis', 'Pro', 'Empresa']) assert.ok(txt.includes(nome), `falta plano ${nome}`);
  for (const [k, v] of Object.entries(p)) assert.ok(html.includes(v), `preco ${k}=${v} (da fonte) nao aparece na pagina`);
  assert.match(txt, /Pix/i);
  assert.deepEqual(erros, []);
  await page.close();
});

for (const rota of ['/para/eletricista', '/para/climatizacao-e-refrigeracao', '/para/encanador', '/refrigeracao', '/eletricista']) {
  test(`${rota} carrega com h1`, T, async () => {
    const { page, resp, erros } = await abrir(rota);
    assert.equal(resp.status(), 200);
    assert.ok((await page.locator('h1').count()) >= 1, 'sem h1');
    assert.deepEqual(erros, []);
    await page.close();
  });
}

// /refrigeracao e /eletricista: paginas de anuncio (#142), cobertas na lista acima.

for (const rota of ['/legal/termos', '/legal/privacidade']) {
  test(`${rota} carrega`, T, async () => {
    const { page, resp, erros } = await abrir(rota);
    assert.equal(resp.status(), 200);
    assert.ok((await page.locator('h1').count()) >= 1, 'sem h1');
    assert.ok((await page.locator('body').innerText()).length > 500);
    assert.deepEqual(erros, []);
    await page.close();
  });
}

test('links internos da home e de /planos respondem 200', T, async () => {
  const falhas = [];
  for (const rota of ['/', '/planos/']) {
    const { page } = await abrir(rota);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    await page.close();
    for (const h of new Set(hrefs.filter((x) => !x.startsWith('//')))) {
      const r = await fetch(base + (h.split('#')[0] || '/'));
      if (r.status !== 200) falhas.push(`${rota} -> ${h} = ${r.status}`);
    }
  }
  assert.deepEqual(falhas, [], 'links quebrados:\n' + falhas.join('\n'));
});

test('mobile 390x844: home sem scroll horizontal', T, async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  await ctx.route((u) => !u.href.startsWith(base), (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
  await ctx.close();
  assert.ok(m.sw <= m.cw + 1 && m.bw <= m.cw + 1, `overflow horizontal: ${JSON.stringify(m)}`);
});

test('meta: title, description e canonical coerentes', T, async () => {
  for (const rota of ['/', '/planos/', '/para/eletricista']) {
    const { page } = await abrir(rota);
    const title = await page.title();
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    const canon = await page.locator('link[rel="canonical"]').getAttribute('href');
    await page.close();
    assert.ok(title.length > 10, `${rota}: title curto`);
    assert.ok(desc && desc.length > 40, `${rota}: description ausente/curta`);
    assert.ok(canon, `${rota}: sem canonical`);
    const u = new URL(canon);
    assert.equal(u.hostname, 'olliorcamentos.online', `${rota}: canonical com host inesperado ${canon}`);
    assert.equal(u.pathname.replace(/\/$/, ''), rota.replace(/\/$/, ''), `${rota}: canonical aponta para outro caminho ${canon}`);
  }
});
