import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.QA_WEB_URL ?? process.env.QA_BASE_URL ?? 'http://localhost:8082';
const outDir = resolve('qa-artifacts');
mkdirSync(outDir, { recursive: true });

const RX = {
  landing: /Orçamento, agenda, cliente|Orcamento, agenda, cliente/i,
  desktopNotice: /computador.*dashboard web|Painel web para empresa/i,
  mobileNotice: /celular|App mobile|Instale/i,
  iphoneNotice: /iPhone|Adicionar à Tela de Início|Adicionar a Tela de Inicio/i,
  androidNotice: /Android|Baixar APK/i,
  help: /Central de ajuda|Mapa das telas/i,
  install: /Instalação inteligente|Instalacao inteligente/i,
  loginHeading: /Que bom te ver de novo/i,
  signupHeading: /Vamos criar a sua conta/i,
  authCallback: /Login nao concluido|Login não concluído|Concluindo login|retorno do Google/i,
  webDashboard: /OLLI Web|Dashboard da empresa/i,
  agendaCalendar: /Novo agendamento|Nenhum agendamento no periodo|Nenhum agendamento no período/i,
  personalizeBudget: /Personalizar orçamento/i,
  createAccount: /Criar conta grátis|Criar conta gratis/i,
  enter: /^Entrar$/i,
  offline: /Usar sem conta/i,
  required: /Cadastro obrigatório|Cadastro obrigatorio/i,
};

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

async function newPage(browser, viewport, userAgent) {
  const context = await browser.newContext({ viewport, ...(userAgent ? { userAgent } : {}) });
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

  return { page, context, logs };
}

async function gotoAndText(page, path = '') {
  await page.goto(new URL(path, url).toString(), { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page.locator('body').innerText();
}

async function runViewport(name, viewport, userAgent) {
  const browser = await chromium.launch({ headless: true });
  const { page, context, logs } = await newPage(browser, viewport, userAgent);

  const landingText = await gotoAndText(page);
  await page.getByText(RX.landing).first().waitFor({ state: 'visible', timeout: 120000 });
  const landingShot = resolve(outDir, `qa-${name}-landing.png`);
  await page.screenshot({ path: landingShot, fullPage: false });

  await clickIfVisible(page.getByText(RX.enter), 3000);
  await page.getByText(RX.loginHeading).first().waitFor({ state: 'visible', timeout: 15000 });
  const loginText = await page.locator('body').innerText();
  const loginShot = resolve(outDir, `qa-${name}-login.png`);
  await page.screenshot({ path: loginShot, fullPage: false });

  await gotoAndText(page);
  await clickIfVisible(page.getByText(RX.createAccount), 3000);
  await page.getByText(RX.signupHeading).first().waitFor({ state: 'visible', timeout: 15000 });
  const signupText = await page.locator('body').innerText();
  const signupShot = resolve(outDir, `qa-${name}-signup.png`);
  await page.screenshot({ path: signupShot, fullPage: false });

  const helpText = await gotoAndText(page, '/ajuda');
  const helpShot = resolve(outDir, `qa-${name}-ajuda.png`);
  await page.screenshot({ path: helpShot, fullPage: false });

  const installText = await gotoAndText(page, '/instalar');
  const installShot = resolve(outDir, `qa-${name}-instalar.png`);
  await page.screenshot({ path: installShot, fullPage: false });

  const callbackText = await gotoAndText(page, '/auth/callback?error_description=Teste%20controlado');
  const callbackShot = resolve(outDir, `qa-${name}-auth-callback.png`);
  await page.screenshot({ path: callbackShot, fullPage: false });

  const dashboardText = await gotoAndText(page, '/app');
  const dashboardShot = resolve(outDir, `qa-${name}-dashboard.png`);
  await page.screenshot({ path: dashboardShot, fullPage: false });

  const agendaText = await gotoAndText(page, '/app/agenda');
  const agendaCtaCount = await page.getByText('Novo agendamento', { exact: true }).count();
  const agendaShot = resolve(outDir, `qa-${name}-agenda.png`);
  await page.screenshot({ path: agendaShot, fullPage: false });

  const contaText = await gotoAndText(page, '/app/conta');
  const contaShot = resolve(outDir, `qa-${name}-conta.png`);
  await page.screenshot({ path: contaShot, fullPage: false });

  await context.close();
  await browser.close();

  const expectedDevice = name === 'desktop'
    ? RX.desktopNotice
    : name === 'iphone'
      ? RX.iphoneNotice
      : name === 'android'
        ? RX.androidNotice
        : RX.mobileNotice;

  return {
    name,
    viewport,
    landingShot,
    loginShot,
    signupShot,
    helpShot,
    installShot,
    callbackShot,
    dashboardShot,
    agendaShot,
    contaShot,
    landingOk: RX.landing.test(landingText),
    deviceNoticeOk: expectedDevice.test(landingText) || expectedDevice.test(installText),
    loginOk: RX.loginHeading.test(loginText) && RX.required.test(loginText) && !RX.offline.test(loginText),
    signupOk: RX.signupHeading.test(signupText) && RX.required.test(signupText) && !RX.offline.test(signupText),
    helpOk: RX.help.test(helpText),
    installOk: RX.install.test(installText),
    authCallbackOk: RX.authCallback.test(callbackText),
    webDashboardOk: name !== 'desktop' || RX.webDashboard.test(dashboardText),
    agendaCalendarOk: RX.agendaCalendar.test(agendaText) && agendaCtaCount === 1,
    contaPersonalizacaoOk: RX.personalizeBudget.test(contaText) && !/Fazer backup agora/i.test(contaText),
    consoleIssues: logs,
  };
}

const iphoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const androidUA = 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const results = [
  await runViewport('desktop', { width: 1280, height: 720 }),
  await runViewport('mobile', { width: 390, height: 844 }),
  await runViewport('iphone', { width: 390, height: 844 }, iphoneUA),
  await runViewport('android', { width: 412, height: 915 }, androidUA),
];

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.landingOk || !result.deviceNoticeOk || !result.loginOk || !result.signupOk || !result.helpOk || !result.installOk || !result.authCallbackOk || !result.webDashboardOk || !result.agendaCalendarOk || !result.contaPersonalizacaoOk)) {
  process.exitCode = 1;
}
