import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.QA_WEB_URL ?? 'http://localhost:8082';
const outDir = resolve('qa-artifacts');
mkdirSync(outDir, { recursive: true });

const RX = {
  start: /Come\u00e7ar|Comecar/i,
  skip: /Pular/i,
  quickActions: /A\u00e7\u00f5es r\u00e1pidas|Acoes rapidas/i,
  newBudget: /Or\u00e7ar|Orcar|Novo or\u00e7amento|Novo orcamento/i,
  clientStep: /Cliente|Dados do Cliente|Passo 1 de 4/i,
  authGate: /Entrar na sua conta|Ainda n\u00e3o tem conta|Ainda nao tem conta/i,
};

async function visible(locator, timeout = 800) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

async function clickIfVisible(locator, timeout = 800) {
  try {
    const first = locator.first();
    await first.waitFor({ state: 'visible', timeout });
    await first.click();
    return true;
  } catch {
    return false;
  }
}

async function navigationMetrics(page) {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    const nav = entry && 'domContentLoadedEventEnd' in entry ? entry : null;
    const resources = performance.getEntriesByType('resource');
    const bytes = resources.reduce((sum, resource) => sum + (Number(resource.transferSize) || 0), 0);
    return {
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
      responseEndMs: nav ? Math.round(nav.responseEnd) : null,
      resourceCount: resources.length,
      transferBytes: bytes,
    };
  }).catch(() => ({ domContentLoadedMs: null, loadEventMs: null, responseEndMs: null, resourceCount: null, transferBytes: null }));
}

async function reachHome(page) {
  const deadline = Date.now() + 120000;

  while (Date.now() < deadline) {
    if (await visible(page.getByText(RX.quickActions), 1000)) return;
    if (await visible(page.getByText(RX.authGate), 1000)) return 'auth_required';
    if (await clickIfVisible(page.getByText(RX.start), 1500)) {
      await page.waitForTimeout(800);
      continue;
    }
    if (await clickIfVisible(page.getByText(RX.skip), 1500)) {
      await page.waitForTimeout(1500);
      continue;
    }
    await page.waitForTimeout(500);
  }

  const bodyText = await page.locator('body').innerText().catch(() => '');
  throw new Error(`Home nao apareceu. Texto atual:\n${bodyText.slice(0, 1200)}`);
}

async function openNewBudget(page) {
  const byLabel = page.getByLabel(RX.newBudget);
  if (await clickIfVisible(byLabel, 2500)) return true;

  const byText = page.getByText(RX.newBudget);
  return clickIfVisible(byText, 2500);
}

async function runViewport(name, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const logs = [];

  page.on('console', (msg) => {
    if (['warning', 'warn', 'error'].includes(msg.type())) {
      logs.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    logs.push({ type: 'pageerror', text: error.message });
  });

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  const accessState = await reachHome(page);
  await page.waitForTimeout(1200);

  const bodyText = await page.locator('body').innerText();
  const metrics = await navigationMetrics(page);
  const performanceBudgetPassed = [metrics.domContentLoadedMs, metrics.loadEventMs]
    .filter((value) => typeof value === 'number')
    .every((value) => value <= 12000);
  const homeShot = resolve(outDir, `qa-${name}-home.png`);
  await page.screenshot({ path: homeShot, fullPage: false });

  if (accessState === 'auth_required') {
    await browser.close();
    return {
      name,
      viewport,
      homeShot,
      flowShot: '',
      authRequired: true,
      homeHasQuickActions: false,
      homeHasNewBudget: false,
      flowReachedClientStep: false,
      httpStatus: response?.status() ?? null,
      finalUrl: page.url(),
      navigation: metrics,
      performanceBudgetPassed,
      consoleIssues: logs,
    };
  }

  let flowText = '';
  let flowShot = '';
  const opened = await openNewBudget(page);

  if (opened) {
    await page.waitForTimeout(1200);
    flowText = await page.locator('body').innerText();
    flowShot = resolve(outDir, `qa-${name}-novo-orcamento.png`);
    await page.screenshot({ path: flowShot, fullPage: false });
  }

  await browser.close();
  return {
    name,
    viewport,
    homeShot,
    flowShot,
    authRequired: false,
    homeHasQuickActions: RX.quickActions.test(bodyText),
    homeHasNewBudget: RX.newBudget.test(bodyText) || opened,
    flowReachedClientStep: RX.clientStep.test(flowText),
    httpStatus: response?.status() ?? null,
    finalUrl: page.url(),
    navigation: metrics,
    performanceBudgetPassed,
    consoleIssues: logs,
  };
}

const results = [
  await runViewport('desktop', { width: 1280, height: 720 }),
  await runViewport('mobile', { width: 390, height: 844 }),
];

writeFileSync(resolve(outDir, 'qa-web-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), url, results }, null, 2));
console.log(JSON.stringify(results, null, 2));

if (results.some((result) => result.consoleIssues.length > 0 || !result.performanceBudgetPassed || (!result.authRequired && (!result.homeHasQuickActions || !result.homeHasNewBudget || !result.flowReachedClientStep)))) {
  process.exitCode = 1;
}
