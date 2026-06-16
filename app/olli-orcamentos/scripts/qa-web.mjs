import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.QA_WEB_URL ?? 'http://127.0.0.1:8082';
const outDir = resolve('qa-artifacts');
mkdirSync(outDir, { recursive: true });

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

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  await page.getByText('Ações rápidas').waitFor({ timeout: 120000 });

  const bodyText = await page.locator('body').innerText();
  const homeShot = resolve(outDir, `qa-${name}-home.png`);
  await page.screenshot({ path: homeShot, fullPage: false });

  const newBudget = page.getByText('Novo Orçamento');
  const newBudgetCount = await newBudget.count();
  let flowText = '';
  let flowShot = '';

  if (newBudgetCount > 0) {
    await newBudget.nth(0).click();
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
    homeHasQuickActions: bodyText.includes('Ações rápidas'),
    homeHasNewBudget: bodyText.includes('Novo Orçamento'),
    flowReachedClientStep: flowText.includes('Cliente') || flowText.includes('Dados do Cliente'),
    consoleIssues: logs,
  };
}

const results = [
  await runViewport('desktop', { width: 1280, height: 720 }),
  await runViewport('mobile', { width: 390, height: 844 }),
];

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.homeHasQuickActions || !result.homeHasNewBudget || !result.flowReachedClientStep)) {
  process.exitCode = 1;
}
