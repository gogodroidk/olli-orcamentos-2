/**
 * Contexto de browser DETERMINÍSTICO para a captura das telas.
 *
 * Cada ajuste aqui existe porque, sem ele, duas rodadas do mesmo script dariam
 * imagens diferentes — e um pipeline de screenshot que "só funciona na minha
 * máquina" morre na segunda semana:
 *
 *   deviceScaleFactor: 2   sem fixar, a nitidez muda com a máquina de quem roda
 *   locale/timezone        senão data e moeda mudam conforme o sistema
 *   reducedMotion          congela a animação de entrada: sem isto uma captura
 *                          pega o card no meio do fade e a seguinte não
 *   relógio congelado      "Boa tarde"/"há 2 dias"/"Nº 00126" precisam ser os
 *                          mesmos em toda rodada (ver AGORA em elenco.mjs)
 *   perfil efêmero         newContext() já é isolado; nunca reaproveitamos um
 *                          perfil onde alguém possa ter logado
 */
import { chromium } from 'playwright';
import { AGORA } from './elenco.mjs';

/** Viewport de CELULAR — o mesmo do preview/iphone-lab.html (iPhone 15/16). */
export const CELULAR = { width: 393, height: 852 };

export async function abrirNavegador() {
  return chromium.launch({ headless: true });
}

export async function novaPagina(browser, { viewport = CELULAR, escala = 2 } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: escala,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    hasTouch: viewport.width < 900,
    isMobile: viewport.width < 900,
  });

  // Relógio congelado ANTES de qualquer script da página rodar: o que a UI
  // imprime ("Sexta, 18 de julho", "há 2 dias", saudação por hora do dia) tem
  // de ser idêntico em toda rodada.
  //
  // ATENÇÃO — o relógio é ANCORADO, não PARADO, e a diferença custou uma tarde:
  //
  // O `Animated` do React Native mede o progresso da animação por `Date.now()`.
  // Com o relógio 100% congelado (`setFixedTime`), o tempo decorrido é sempre
  // zero: nenhuma animação termina e nenhum callback de fim dispara. Na prática
  // o app trava mostrando "Orçamento pronto!" para sempre — a celebração é
  // justamente quem navega para a tela do orçamento quando acaba. Nada de erro,
  // nada no console: só uma tela que parece certa e não anda.
  //
  // `install` + `resume` ancora a data no instante fictício e deixa o tempo
  // correr a partir dali. As datas que a UI imprime (dia, mês, saudação) ficam
  // determinísticas; o que varia entre rodadas é o segundo, que nenhuma tela
  // mostra.
  await context.clock.install({ time: new Date(AGORA) });
  await context.clock.resume();

  const page = await context.newPage();

  // Rede de segurança: este build é offline (sem Supabase, sem worker de IA),
  // mas se um dia alguém exportar com a nuvem ligada, esta trava impede que a
  // captura toque QUALQUER host externo — e falha alto em vez de fotografar
  // dado de produção em silêncio.
  await page.route('**/*', (rota) => {
    const url = rota.request().url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
      return rota.continue();
    }
    console.error(`\n  PORTÃO: a página tentou sair para ${url}. A captura só roda contra o build local.`);
    return rota.abort();
  });

  return { context, page };
}

/** Espera o app sair do splash: o SQLite abriu e a árvore de telas montou. */
export async function esperarAppDePe(page, timeout = 90000) {
  await page.waitForFunction(
    () => document.body.innerText.trim().length > 0,
    undefined,
    { timeout },
  );
  // A partir daqui as esperas são por âncora de conteúdo, nunca por relógio.
}
