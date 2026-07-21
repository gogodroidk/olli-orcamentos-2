/**
 * MOLDURA DA LOJA — transforma uma captura crua do app na screenshot 1080x1920
 * que a Google Play aceita, e CONFERE o resultado medindo o arquivo gravado.
 *
 * Fonte única do formato: tanto `scripts/telas/loja.mjs` (captura pela web)
 * quanto `assets/loja/montar-screenshots.js` (capturas cruas do emulador via
 * adb) passam por aqui. Duas implementações do "formato que a Play aceita" é
 * como se sobe um arquivo conforme e outro reprovado na mesma leva.
 *
 * ─── Por que 1080x1920, e não o print cru ──────────────────────────────────
 *
 * Regras oficiais (support.google.com/googleplay/android-developer/answer/9866151):
 *   · JPEG ou PNG 24-bit SEM alpha
 *   · cada lado entre 320 px e 3840 px
 *   · o maior lado não pode passar do DOBRO do menor
 *   · proporção entre 16:9 e 9:16
 *   · 2 no mínimo, 8 no máximo por tipo de aparelho
 *   · >= 4 capturas com >= 1080 px para concorrer aos formatos de destaque
 *
 * Nenhum print de celular moderno passa nessas regras inteiro. O viewport da
 * captura é 393x852 (proporção 0,4613) e o emulador `olli_phone` é 1080x2400
 * (0,4500) — os dois são MAIS ALTOS que 9:16 (0,5625) e os dois estouram a regra
 * do dobro. 1080x1920 resolve as duas de uma vez: é 9:16 exato e 1920 <= 2160.
 *
 * A saída NÃO é um corte da captura — cortar comeria a barra de status ou a
 * navegação e o print deixaria de ser o app real. A captura inteira é REDUZIDA e
 * montada sobre o fundo de marca, com a legenda em cima.
 *
 * ─── Por que o Chromium desenha a moldura, e não o sharp ───────────────────
 *
 * A versão anterior desenhava a legenda com `<text>` num SVG entregue ao sharp.
 * Medido nesta máquina: renderizando o mesmo SVG com font-family "Rubik",
 * "Segoe UI" e um nome inexistente, os três PNGs saíram com o MESMO md5 — o
 * renderizador de SVG do sharp ignora `font-family` por completo e cai sempre na
 * fonte padrão. Ou seja, a legenda saía numa fonte que ninguém escolheu e que
 * muda conforme a máquina de quem roda.
 *
 * O Chromium do próprio pipeline não tem esse problema: ele carrega a Rubik (a
 * fonte real do app, de `@expo-google-fonts/rubik`) e desenha a moldura com o
 * CSS que a gente escreveu. A fonte vai EMBUTIDA como data: URI em vez de ser
 * baixada do servidor local — a página da moldura é um `about:blank` via
 * `setContent`, cuja origem é opaca, e fonte é um recurso que exige CORS: pela
 * rede ela seria bloqueada e cairia silenciosamente no fallback.
 *
 * Ao sharp fica o que ele faz melhor e o Chromium não garante: achatar o alpha e
 * gravar um PNG de 3 canais. Print do Playwright vem com canal alpha, e "24-bit
 * PNG, no alpha" é exatamente o que a Play recusa.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
// sharp já vem instalado com o Astro (web/node_modules) — zero dependência nova.
const sharp = require('../../web/node_modules/sharp');

export const LARGURA = 1080;
export const ALTURA = 1920;

/** Limites oficiais da Play, num lugar só para o conferidor não repetir número. */
export const REGRAS = {
  ladoMin: 320,
  ladoMax: 3840,
  bytesMax: 8 * 1024 * 1024,
  minCapturas: 2,
  maxCapturas: 8,
  minParaDestaque: 4,
  ladoMinParaDestaque: 1080,
};

const MARCA = {
  navy: '#0A2547',
  ciano: '#3FD8EA',
  azul: '#0B6FCE',
};

/**
 * A Rubik real do app, lida do pacote que o próprio app usa. Base64 de propósito
 * (ver cabeçalho): fonte por rede em página de origem opaca é bloqueada por CORS
 * e o fallback é silencioso — a legenda sairia em Arial sem ninguém perceber.
 */
function fonteEmbutida(peso, arquivo) {
  const ttf = readFileSync(resolve(`node_modules/@expo-google-fonts/rubik/${arquivo}`));
  return `@font-face{font-family:'Rubik';font-style:normal;font-weight:${peso};src:url(data:font/ttf;base64,${ttf.toString('base64')}) format('truetype');}`;
}

function html(linhas, dataUriDaCaptura, fontes) {
  const [l1 = '', l2 = ''] = linhas;
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
${fontes}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${LARGURA}px;height:${ALTURA}px;overflow:hidden}
body{
  display:flex;flex-direction:column;align-items:center;
  font-family:'Rubik',sans-serif;
  background:
    radial-gradient(85% 55% at 50% 4%, rgba(11,111,206,.45) 0%, rgba(11,111,206,0) 70%),
    linear-gradient(160deg, #0C2C54 0%, #071A32 100%);
}
.legenda{padding:96px 80px 0;text-align:center;flex:none}
.l{font-weight:700;font-size:64px;line-height:78px;letter-spacing:-.5px}
.l1{color:#FFFFFF}
.l2{color:${MARCA.ciano}}
.fio{width:120px;height:7px;border-radius:4px;margin:28px auto 0;
     background:linear-gradient(90deg, ${MARCA.ciano}, ${MARCA.azul})}
.palco{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
       padding:44px 0 72px}
/* Cantos arredondados só na captura: colada quadrada ela parece recorte torto.
   NADA de moldura de aparelho — desenhar um iPhone à volta de um app Android é
   o erro clássico de listagem, e a Play trata como propaganda enganosa. */
img{height:100%;width:auto;display:block;border-radius:40px;
    border:1px solid rgba(255,255,255,.10);
    box-shadow:0 40px 90px rgba(0,0,0,.45)}
</style></head><body>
<div class="legenda">
  <div class="l l1">${esc(l1)}</div>
  <div class="l l2">${esc(l2)}</div>
  <div class="fio"></div>
</div>
<div class="palco"><img src="${dataUriDaCaptura}" alt=""></div>
</body></html>`;
}

/**
 * Abre uma página de montagem reutilizável. Uma só para todas as screenshots: o
 * custo de abrir contexto de browser é alto e o conteúdo é trocado por
 * `setContent` a cada imagem.
 *
 * @param {import('playwright').Browser} browser
 */
export async function abrirMoldura(browser) {
  const fontes = [
    fonteEmbutida(500, '500Medium/Rubik_500Medium.ttf'),
    fonteEmbutida(700, '700Bold/Rubik_700Bold.ttf'),
  ].join('\n');

  const context = await browser.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: 1, // 1080x1920 tem de sair EXATO, não 2x disso
    locale: 'pt-BR',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  // Mesmo portão do navegador de captura: a moldura não tem por que tocar a
  // rede (fonte embutida, imagem em data:), então qualquer saída é bug ou
  // vazamento — e falha alto em vez de acontecer em silêncio.
  await page.route('**/*', (rota) => {
    const url = rota.request().url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') {
      return rota.continue();
    }
    console.error(`\n  PORTÃO: a moldura tentou sair para ${url}.`);
    return rota.abort();
  });

  return {
    /**
     * @param {Buffer} pngDaCaptura print cru da tela do app
     * @param {string[]} linhas  legenda, no máximo 2 linhas
     * @returns {Promise<Buffer>} PNG 1080x1920 de 3 canais, sem alpha
     */
    async montar(pngDaCaptura, linhas) {
      const dataUri = `data:image/png;base64,${pngDaCaptura.toString('base64')}`;
      await page.setContent(html(linhas, dataUri, fontes), { waitUntil: 'load' });

      // A fonte tem de estar APLICADA antes do print. Sem esta espera a primeira
      // screenshot sai em sans-serif do sistema e as outras em Rubik — e o
      // defeito só aparece quando alguém compara as oito lado a lado.
      await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 20000 });
      await page.waitForFunction(
        () => {
          const img = document.querySelector('img');
          return !!img && img.complete && img.naturalWidth > 0;
        },
        undefined,
        { timeout: 20000 },
      );

      // A legenda tem DUAS linhas por construção. Se o texto não couber na
      // largura, o navegador quebra numa terceira linha, o palco encolhe e a
      // captura sai menor que as outras — diferença que só aparece quando
      // alguém põe as oito lado a lado, ou seja, tarde demais. Melhor falhar.
      const estouro = await page.evaluate(() =>
        [...document.querySelectorAll('.l')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getClientRects().length > 1)
          .map((el) => el.textContent),
      );
      if (estouro.length) {
        throw new Error(
          `legenda não cabe em uma linha: ${estouro.map((t) => `"${t}"`).join(', ')} — encurte o texto`,
        );
      }

      const png = await page.screenshot({ type: 'png' });

      // `flatten` numa passada própria: o sharp aplica as operações na ordem
      // interna dele, não na ordem em que a gente encadeia, e qualquer composite
      // posterior reintroduziria o canal alpha DEPOIS do flatten — que é
      // exatamente o que a Play recusa.
      return sharp(png).flatten({ background: MARCA.navy }).png({ compressionLevel: 9 }).toBuffer();
    },
    async fechar() {
      await context.close();
    },
  };
}

/**
 * MEDE o arquivo gravado e diz se ele passa em cada regra da Play, uma a uma.
 *
 * Devolve o laudo em vez de só um booleano de propósito: quando um upload é
 * recusado, "reprovou" não ajuda ninguém — o que resolve é saber QUAL regra e
 * com que número. Nada aqui é assumido a partir do que o script pediu; tudo é
 * lido de volta do arquivo em disco.
 */
export async function conferirConformidade(caminho, bytes) {
  const m = await sharp(caminho).metadata();
  const maior = Math.max(m.width, m.height);
  const menor = Math.min(m.width, m.height);
  const proporcao = m.width / m.height;

  const regras = {
    formato: m.format === 'png' || m.format === 'jpeg',
    semAlpha: !m.hasAlpha && m.channels === 3,
    ladoMinimo: menor >= REGRAS.ladoMin,
    ladoMaximo: maior <= REGRAS.ladoMax,
    // "O maior lado não pode ser mais que o dobro do menor."
    regraDoDobro: maior <= 2 * menor,
    // Entre 16:9 (1,7778) e 9:16 (0,5625), com folga de arredondamento.
    proporcao: proporcao >= 9 / 16 - 1e-6 && proporcao <= 16 / 9 + 1e-6,
    peso: bytes <= REGRAS.bytesMax,
    // Não é regra de aceitação: é o piso para concorrer aos formatos de destaque.
    resolucaoDeDestaque: maior >= REGRAS.ladoMinParaDestaque,
  };

  return {
    largura: m.width,
    altura: m.height,
    canais: m.channels,
    temAlpha: !!m.hasAlpha,
    formato: m.format,
    bytes,
    proporcao,
    regras,
    ok: Object.values(regras).every(Boolean),
  };
}

/** Formata o laudo numa linha só, com os números medidos. */
export function laudoEmLinha(nome, c) {
  const reprovadas = Object.entries(c.regras)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const kb = (c.bytes / 1024).toFixed(0);
  return (
    `  ${c.ok ? 'OK ' : 'X  '} ${nome.padEnd(30)} ${c.largura}x${c.altura}  ` +
    `${c.canais} canais  alpha=${c.temAlpha}  ${String(kb).padStart(4)} KB  ` +
    `proporção ${c.proporcao.toFixed(4)}` +
    (reprovadas.length ? `  <- REPROVOU: ${reprovadas.join(', ')}` : '')
  );
}
