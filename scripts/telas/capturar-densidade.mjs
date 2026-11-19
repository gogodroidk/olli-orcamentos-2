/**
 * CAPTURA DAS TELAS DE CELULAR EM QUALQUER DENSIDADE (2x, 3x…) — para o kit e
 * para celulares de tela densa (o Galaxy S20 tem DPR 4; iPhone Pro, DPR 3).
 *
 *     node scripts/telas/gerar.mjs --so-captura   (NÃO: esse grava a landing)
 *     node scripts/telas/capturar-densidade.mjs <pasta-saida> [escala=3] [id …]
 *
 * Mesmo caminho do `capturar-telas.mjs` — export sem nuvem (rode antes o
 * `gerar.mjs` ou o `expo export` dele), semeadura fictícia pelo formulário real,
 * portão de privacidade em cada tela —, só que:
 *   • a escala vem do argumento (393 × 3 = 1179 px de largura);
 *   • grava PNG cru, sem AVIF/WebP e sem tocar em `web/public/telas/`: quem
 *     consome decide o formato, e a esteira da landing não muda;
 *   • escreve `manifesto.json` com o tamanho de cada PNG e a escala usada.
 *
 * TELAS_CHROMIUM: caminho de um Chromium já baixado, quando a versão do
 * Playwright do repo não bate com a do cache (não instala nada).
 *
 * Memória: o navegador abre UMA página só e fecha no fim, mesmo se falhar.
 *
 * FONTE: o texto sai na fonte do sistema da máquina que captura (no Linux,
 * Roboto — a mesma que o Android mostra; no Windows, Segoe UI). O patch de
 * Rubik do app não alcança o <Text> nem no RN-web nem no aparelho. Para as
 * densidades casarem, gere 2x e 3x na MESMA máquina.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { servir } from './servidor.mjs';
import { CELULAR, abrirNavegador, novaPagina } from './navegador.mjs';
import { semearTudo } from './semear.mjs';
import { capturarTela } from './capturar-uma.mjs';
import { TELAS_CELULAR } from './roteiro.mjs';

const DIST = resolve(process.env.TELAS_DIST ?? '.expo/telas-build');
const [saidaArg, escalaArg, ...ids] = process.argv.slice(2);
if (!saidaArg) {
  console.error('uso: node scripts/telas/capturar-densidade.mjs <pasta-saida> [escala=3] [id …]');
  process.exit(1);
}
const SAIDA = resolve(saidaArg);
const ESCALA = Number(escalaArg ?? 3);
if (!Number.isFinite(ESCALA) || ESCALA < 1 || ESCALA > 4) {
  console.error(`escala inválida: ${escalaArg} (use 1 a 4)`);
  process.exit(1);
}
const telas = ids.length ? TELAS_CELULAR.filter((t) => ids.includes(t.id)) : TELAS_CELULAR;
if (ids.length && telas.length !== ids.length) {
  console.error(`tela desconhecida em: ${ids.join(', ')}`);
  process.exit(1);
}
mkdirSync(SAIDA, { recursive: true });

const { url, fechar } = await servir(DIST);
const browser = process.env.TELAS_CHROMIUM
  ? await chromium.launch({ headless: true, executablePath: process.env.TELAS_CHROMIUM })
  : await abrirNavegador();
const manifesto = { escala: ESCALA, viewport: CELULAR, telas: [], falhas: [] };
try {
  const { context, page } = await novaPagina(browser, { viewport: CELULAR, escala: ESCALA });
  page.on('pageerror', (e) => console.error('  [erro na página]', e.message.slice(0, 200)));
  console.log('Semeando dados fictícios pela interface real do app…');
  let ctx;
  try {
    // TELAS_SEMEAR=minimo: só negócio, cliente e orçamento-herói — para recapturar
    // uma tela que só precisa do cliente cadastrado, sem depender da agenda/OS.
    ctx = await semearTudo(page, url, (o) => console.log(`  · ${o}`), { minimo: process.env.TELAS_SEMEAR === 'minimo' });
  } catch (e) {
    // Sem isto a falha de semeadura é só "Timeout": a foto da tela onde parou
    // é o que diz se o app mudou o fluxo ou se foi lentidão.
    await page.screenshot({ path: join(SAIDA, '_falha-semeadura.png') }).catch(() => {});
    throw e;
  }
  console.log(`\nCapturando ${telas.length} telas de celular (${CELULAR.width}×${CELULAR.height} @${ESCALA}x):`);
  for (const tela of telas) {
    try {
      const png = await capturarTela(page, url, tela, ctx);
      const arquivo = `${tela.id}@${ESCALA}x.png`;
      writeFileSync(join(SAIDA, arquivo), png);
      manifesto.telas.push({ id: tela.id, arquivo, largura: CELULAR.width * ESCALA, altura: CELULAR.height * ESCALA, bytes: png.length });
      console.log(`  ✓ ${arquivo}`);
    } catch (e) {
      manifesto.falhas.push({ id: tela.id, erro: String(e?.message ?? e).slice(0, 300) });
      console.error(`  ✗ ${tela.id}: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
  await context.close();
} finally {
  await browser.close();
  await fechar();
  writeFileSync(join(SAIDA, 'manifesto.json'), `${JSON.stringify(manifesto, null, 2)}\n`);
}
if (manifesto.falhas.length) process.exit(2);
