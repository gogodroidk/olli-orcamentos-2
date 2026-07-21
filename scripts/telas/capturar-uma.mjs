/**
 * CAPTURA DE UMA TELA — a rotina que leva o app até uma tela, espera ela estar
 * realmente pronta, passa o portão de privacidade e devolve o PNG.
 *
 * Saiu de dentro do `capturar-telas.mjs` quando o `loja.mjs` (screenshots da
 * Google Play) passou a precisar exatamente do mesmo caminho. Cada `await` aqui
 * embaixo é uma imagem que já saiu errada alguma vez — copiar isso para um
 * segundo arquivo seria copiar as correções pela metade.
 */
import { esperarTexto, dispensarDicas, criarOrcamento, preencher } from './semear.mjs';
import { conferirPagina } from './gate-privacidade.mjs';
import { CLIENTES, ITENS_ORCAMENTO } from './elenco.mjs';

/**
 * @param {import('playwright').Page} page
 * @param {string} base URL do servidor local
 * @param {object} tela entrada do roteiro (rota, esperar, preparar, id)
 * @param {object} ctx  contexto devolvido pela semeadura
 * @returns {Promise<Buffer>} PNG da tela
 */
export async function capturarTela(page, base, tela, ctx) {
  const rota = typeof tela.rota === 'function' ? tela.rota(ctx) : tela.rota;

  if (rota === 'ESPECIAL:novo-orcamento-itens') {
    // Esta tela não existe em URL: ela é um PASSO de um formulário. A única
    // forma honesta de fotografá-la é refazer o caminho até ela.
    await criarOrcamento(page, base, {
      cliente: CLIENTES[0],
      itens: ITENS_ORCAMENTO,
      clienteJaExiste: true,
      pararEm: 'itens',
    });
  } else {
    const url = rota.startsWith('http') ? rota : `${base}${rota}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  await esperarTexto(page, tela.esperar, 60000);
  await dispensarDicas(page);
  // Algumas telas só contam a história inteira depois de um preenchimento — um
  // formulário em branco mostra que a ferramenta existe, não que ela trabalha.
  if (tela.preparar) await tela.preparar(page, { preencher });
  // Uma última espera por âncora: a fonte tem de estar aplicada, senão a
  // primeira tela sai em Arial e as outras em Rubik.
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 20000 }).catch(() => {});

  // Tira o foco de qualquer campo. Um campo focado é a única fonte de variação
  // entre duas rodadas: o cursor pisca e a borda do campo anima a cor por 150 ms
  // (`OlliInput`). Com isso solto, quatro dos 33 arquivos saíam com bytes
  // diferentes a cada execução e o diff do PR virava ruído.
  //
  // O `waitForTimeout` aqui é a única exceção do pipeline e é deliberada: não
  // estou esperando "carregar" (para isso existem as âncoras), estou esperando
  // uma animação de duração CONHECIDA terminar. 400 ms é folga sobre os 150 ms.
  if (await page.evaluate(() => {
    const foco = document.activeElement;
    if (foco instanceof HTMLElement && foco !== document.body) { foco.blur(); return true; }
    return false;
  })) {
    await page.waitForTimeout(400);
  }

  // Volta toda lista rolável ao topo. Sem isto, a tela do passo de itens saía
  // rolada no último item que a semeadura adicionou — três serviços somando
  // R$ 2.480 viravam um serviço de R$ 340 na foto.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  });

  await conferirPagina(page, tela.id);
  return page.screenshot({ type: 'png' });
}
