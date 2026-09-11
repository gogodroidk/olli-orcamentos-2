import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { servir } from './telas/servidor.mjs';

const dist = resolve('dist');
const artefatos = resolve('qa-artifacts');
mkdirSync(artefatos, { recursive: true });
const servidor = await servir(dist);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'allow',
});
const page = await context.newPage();
const problemas = [];

page.on('console', (mensagem) => {
  if (mensagem.type() === 'error') problemas.push(`console: ${mensagem.text()}`);
});
page.on('pageerror', (erro) => problemas.push(`pageerror: ${erro.message}`));
page.on('requestfailed', (requisicao) => {
  problemas.push(`requestfailed: ${requisicao.url()} (${requisicao.failure()?.errorText ?? 'erro desconhecido'})`);
});

try {
  await page.goto(servidor.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  await page.waitForFunction(() => (document.body?.innerText ?? '').trim().length > 0, null, { timeout: 30_000 });

  const resultado = await page.evaluate(async () => {
    const registro = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        registro.active?.postMessage({ type: 'SKIP_WAITING' });
      });
    }

    const manifestoResposta = await fetch('/manifest.webmanifest');
    const manifesto = await manifestoResposta.json();
    return {
      controlado: Boolean(navigator.serviceWorker.controller),
      escopo: registro.scope,
      manifestoOk:
        manifestoResposta.ok &&
        manifesto.name === 'OLLI Orçamentos' &&
        manifesto.display === 'standalone' &&
        manifesto.icons?.some((icone) => icone.sizes === '192x192') &&
        manifesto.icons?.some((icone) => icone.sizes === '512x512'),
    };
  });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => {});
  problemas.length = 0;
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: resolve(artefatos, 'qa-pwa-offline.png'), fullPage: true });
  const offline = await page.evaluate(() => ({
    controlado: Boolean(navigator.serviceWorker.controller),
    temConteudo: (document.body?.innerText ?? '').trim().length > 0,
    titulo: document.title,
    html: document.documentElement.outerHTML.slice(0, 2_000),
  }));
  await context.setOffline(false);

  const verificacoes = {
    registroControlaPagina: resultado.controlado,
    escopoCorreto: resultado.escopo === `${servidor.url}/`,
    manifestoInstalavel: Boolean(resultado.manifestoOk),
    recargaOfflineControlada: offline.controlado,
    recargaOfflineTemInterface: offline.temConteudo,
    marcaPreservadaOffline: /OLLI/i.test(offline.titulo),
    semErrosDeExecucao: problemas.length === 0,
  };

  console.log(JSON.stringify({ url: servidor.url, verificacoes, problemas, offline }, null, 2));
  if (Object.values(verificacoes).some((ok) => !ok)) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await servidor.fechar();
}
