/**
 * MEDE QUANTO DA TELA ESTÁ VAZIO — o conferidor que faltava.
 *
 *     node scripts/telas/medir-ocupacao.mjs                  (as 8 da Play)
 *     node scripts/telas/medir-ocupacao.mjs uma-captura.png  (uma captura crua)
 *
 * ─── Por que este arquivo existe ───────────────────────────────────────────
 *
 * `moldura-loja.mjs` já confere o FORMATO (1080x1920, 24-bit, sem alpha) e as
 * oito screenshots passam nele desde sempre. O que ninguém media era o
 * CONTEÚDO: `04-ordem-servico` saiu com dois terços de fundo chapado e passou
 * em todas as regras da Play — porque nenhuma regra da Play fala de vazio.
 *
 * `elenco.mjs:90-95` já escrevia a regra, em português, para os orçamentos:
 *
 *   "uma lista de um item não mostra que o produto organiza trabalho, mostra
 *    que ele está vazio."
 *
 * Regra escrita e não medida é regra que se esquece na tela seguinte — foi
 * exatamente o que aconteceu com as ordens de serviço. Aqui ela vira número.
 *
 * ─── O que é medido, e onde ────────────────────────────────────────────────
 *
 * A medição roda sobre a CAPTURA CRUA do app (o print do viewport, antes da
 * moldura). É o único recorte em que não há nada a adivinhar: a imagem inteira
 * é a tela do app.
 *
 * Uma tentativa anterior media a screenshot já emoldurada, procurando as bordas
 * do print dentro dos 1080x1920. Não sobreviveu ao teste: o `radial-gradient`
 * da moldura deixa o centro mais claro que as laterais, a `box-shadow` produz
 * aresta, a legenda em Rubik 64px encosta nas mesmas colunas das bordas do
 * print, e — o que matou de vez — o cabeçalho azul-escuro do app tem
 * praticamente a MESMA cor do fundo da moldura, então a lateral do print
 * simplesmente não existe como aresta ao longo de todo o cabeçalho. Três
 * heurísticas depois, a altura detectada ainda variava de 1221 a 1445 px para
 * um retângulo que é sempre o mesmo. Medir antes da moldura elimina o problema
 * em vez de calibrá-lo.
 *
 * Para conferir um arquivo JÁ emoldurado existe `--recorte x,y,l,a`, que
 * recorta o print de volta com o retângulo exato da moldura.
 *
 * ─── Como o vazio é medido ─────────────────────────────────────────────────
 *
 * Uma linha é "vazia" quando quase todos os seus pixels são iguais à cor
 * DOMINANTE dela — que é o que acontece num fundo chapado de app. Onde há
 * cartão, texto, ícone ou separador, a linha tem pixels destoando da dominante.
 *
 * O número que importa é o do RODAPÉ: quanto sobra depois da última linha com
 * conteúdo. Vazio no meio da tela é respiro de layout; vazio contínuo até o fim
 * é o app parecendo que não tem nada dentro. É a diferença entre uma tela
 * arejada e uma tela oca.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
// Mesmo sharp que a moldura usa (vem do Astro em web/node_modules) — zero
// dependência nova só para medir.
const sharp = require('../../web/node_modules/sharp');

const PADRAO = resolve('assets/loja/screenshots');

/**
 * Retângulo do print dentro da screenshot 1080x1920 que `moldura-loja.mjs`
 * monta. Não é chute: medido nos oito arquivos gravados, idêntico nos oito
 * (x 191..888 em toda linha; base em 1846 com a borda de 1px em 1847). O topo
 * sai do layout — legenda de 287 px + 44 px de `padding` do palco — e foi
 * conferido na coluna central dos oito.
 *
 * Serve só para reconferir arquivo antigo pela linha de comando. O pipeline
 * mede antes de emoldurar e não passa por aqui.
 */
export const RECORTE_DA_MOLDURA = { x: 191, y: 331, largura: 698, altura: 1517 };

/** Distância de canal para dizer "esta cor é outra cor". */
const TOLERANCIA = 14;
/** Margem lateral ignorada numa captura crua: só ruído de borda do viewport. */
const MARGEM_CRUA = 6;
/**
 * Margem lateral ao medir de volta a screenshot emoldurada. A moldura desenha o
 * print com `border-radius: 40px`, então nos ~40 px de cada canto sobra fundo
 * navy dentro do recorte — e navy sobre cinza-claro conta como "conteúdo" em
 * TODAS as linhas de canto. Com margem de 6 px as oito telas mediam "última
 * linha 1517/1517", inclusive a que está visivelmente oca. 44 px pula a curva.
 */
const MARGEM_EMOLDURADA = 44;
/** Abaixo disto a linha é fundo chapado (ruído de compressão, anti-aliasing). */
const MIN_PIXELS_DE_CONTEUDO = 24;

/** Acima deste percentual de rodapé vazio a tela é reprovada. */
export const MAX_RODAPE_VAZIO = 20;

function difere(px, i, j) {
  return (
    Math.abs(px[i] - px[j]) > TOLERANCIA ||
    Math.abs(px[i + 1] - px[j + 1]) > TOLERANCIA ||
    Math.abs(px[i + 2] - px[j + 2]) > TOLERANCIA
  );
}

/** Cor dominante da linha, em passo de `TOLERANCIA` (histograma grosso). */
function dominanteDaLinha(px, base, x0, x1, canais) {
  const balde = new Map();
  for (let x = x0; x <= x1; x++) {
    const i = base + x * canais;
    const chave =
      ((px[i] / TOLERANCIA) | 0) * 65536 +
      ((px[i + 1] / TOLERANCIA) | 0) * 256 +
      ((px[i + 2] / TOLERANCIA) | 0);
    const atual = balde.get(chave);
    if (atual) atual.n++;
    else balde.set(chave, { n: 1, i });
  }
  let melhor = null;
  for (const v of balde.values()) if (!melhor || v.n > melhor.n) melhor = v;
  return melhor.i;
}

/**
 * Mede a ocupação de uma captura CRUA (a imagem inteira é a tela do app).
 *
 * @param {Buffer|string} png captura do Playwright, sem moldura
 * @param {{x:number,y:number,largura:number,altura:number}} [recorte]
 * @returns {Promise<{altura:number,ultimaLinhaComConteudo:number,linhasComConteudo:number,ocupacao:number,rodapeVazioPct:number,oca:boolean}>}
 */
export async function medirBuffer(png, recorte) {
  let img = sharp(png);
  if (recorte) {
    img = img.extract({
      left: recorte.x,
      top: recorte.y,
      width: recorte.largura,
      height: recorte.altura,
    });
  }
  const { data: px, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: largura, height: altura, channels: canais } = info;

  const margem = recorte ? MARGEM_EMOLDURADA : MARGEM_CRUA;
  const x0 = margem;
  const x1 = largura - 1 - margem;

  let ultimaComConteudo = -1;
  let linhasComConteudo = 0;
  for (let y = 0; y < altura; y++) {
    const base = y * largura * canais;
    const dom = dominanteDaLinha(px, base, x0, x1, canais);
    let destoando = 0;
    for (let x = x0; x <= x1; x++) {
      if (difere(px, base + x * canais, dom)) destoando++;
    }
    if (destoando > MIN_PIXELS_DE_CONTEUDO) {
      linhasComConteudo++;
      ultimaComConteudo = y;
    }
  }

  const rodapeVazio = altura - (ultimaComConteudo + 1);
  const rodapeVazioPct = +((rodapeVazio / altura) * 100).toFixed(1);
  return {
    largura,
    altura,
    ultimaLinhaComConteudo: ultimaComConteudo + 1,
    linhasComConteudo,
    ocupacao: +((linhasComConteudo / altura) * 100).toFixed(1),
    rodapeVazioPct,
    oca: rodapeVazioPct > MAX_RODAPE_VAZIO,
  };
}

/** Uma linha de relatório, com os números medidos. */
export function ocupacaoEmLinha(nome, m) {
  return (
    `  ${m.oca ? 'X  ' : 'OK '} ${String(nome).padEnd(30)} ` +
    `última linha ${String(m.ultimaLinhaComConteudo).padStart(4)}/${m.altura}  ` +
    `ocupação ${String(m.ocupacao).padStart(5)}%  ` +
    `rodapé vazio ${String(m.rodapeVazioPct).padStart(5)}%` +
    (m.oca ? '  <- TELA OCA' : '')
  );
}

async function main() {
  const args = process.argv.slice(2);
  const iRecorte = args.indexOf('--recorte');
  let recorte;
  if (iRecorte >= 0) {
    const [x, y, largura, altura] = args[iRecorte + 1].split(',').map(Number);
    recorte = { x, y, largura, altura };
    args.splice(iRecorte, 2);
  }

  const emoldurados = args.length === 0;
  const alvos = args.length
    ? args.map((a) => resolve(a))
    : readdirSync(PADRAO)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => join(PADRAO, f));

  // Sem argumento, o alvo é a pasta da Play — que guarda arquivos JÁ
  // emoldurados. Recorta de volta antes de medir, senão a moldura (legenda,
  // fundo, sombra) entraria na conta como "conteúdo".
  if (emoldurados && !recorte) recorte = RECORTE_DA_MOLDURA;

  // As tolerâncias declaradas vivem no roteiro de `loja.mjs` e chegam aqui pelo
  // laudo que ele grava. Sem isto, este comando reprovaria para sempre a tela de
  // diagnóstico — que tem exceção escrita e justificada — e um portão que grita
  // errado toda vez é um portão que ninguém lê.
  const tolerancias = new Map();
  try {
    const laudo = JSON.parse(readFileSync(join(PADRAO, 'conformidade.json'), 'utf8'));
    for (const o of laudo.ocupacao ?? []) tolerancias.set(o.arquivo, o.rodapeVazioTolerado);
  } catch {
    // Sem laudo (pasta de captura crua, ou antes da primeira rodada): todo
    // mundo responde pelo limite geral. Não inventa tolerância.
  }

  let reprovou = false;
  for (const alvo of alvos) {
    statSync(alvo);
    const nome = alvo.split(/[\\/]/).pop();
    const limite = tolerancias.get(nome) ?? MAX_RODAPE_VAZIO;
    const m = await medirBuffer(alvo, recorte);
    const oca = m.rodapeVazioPct > limite;
    if (oca) reprovou = true;
    console.log(
      ocupacaoEmLinha(nome, { ...m, oca }) +
        (limite !== MAX_RODAPE_VAZIO ? `  (tolerância declarada: ${limite}%)` : ''),
    );
  }
  console.log(
    `\nRegra: rodapé vazio acima de ${MAX_RODAPE_VAZIO}% é tela que vende "app sem nada dentro".`,
  );
  if (reprovou) process.exitCode = 1;
}

// Só roda o relatório quando chamado direto; importado, exporta as funções.
if (process.argv[1] && process.argv[1].endsWith('medir-ocupacao.mjs')) {
  await main();
}
