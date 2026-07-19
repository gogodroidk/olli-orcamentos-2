/**
 * CAPTURA DAS TELAS REAIS DO APLICATIVO — para a landing.
 *
 * ┌─ COMO RODAR ────────────────────────────────────────────────────────────┐
 * │  node scripts/telas/gerar.mjs               build + captura             │
 * │  node scripts/telas/gerar.mjs --so-captura  reaproveita o build         │
 * │                                                                         │
 * │  Este arquivo é a segunda metade: ele PRESSUPÕE o export já feito com a │
 * │  nuvem desligada. Rodar direto sem o `gerar.mjs` pula a conferência de  │
 * │  que as credenciais de produção ficaram fora do bundle — não faça isso. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE FAZ, em uma frase: sobe o app de verdade num browser, cria dados
 * fictícios pelos formulários de verdade, fotografa as telas escolhidas e grava
 * AVIF + WebP em `web/public/telas/` com um manifesto para a landing consumir.
 *
 * ─── A porta legítima: o app sem nuvem ─────────────────────────────────────
 *
 * Quase tudo interessante no app está atrás de login, e um agente não digita
 * senha. A saída não é contornar o login — é o modo que o próprio app já tem:
 * `App.tsx` decide a rota inicial e, quando NÃO há Supabase configurado
 * (`!supabase`), manda direto para as abas, porque nesse build login não existe.
 * `gerar.mjs` exporta a web com `EXPO_PUBLIC_SUPABASE_URL=offline`, e três
 * coisas boas acontecem de uma vez:
 *   1. não há login a fazer;
 *   2. o bundle nem CARREGA as credenciais de produção — conferimos que a URL
 *      real do Supabase não está no JS gerado;
 *   3. o banco é um SQLite local vazio, então não existe dado de cliente real
 *      ao alcance do browser. O risco não é "mitigado", é ausente.
 *
 * ─── O que este pipeline NÃO consegue, e por quê ───────────────────────────
 * • A Home do CELULAR não entra. Ela só monta depois que o app sabe o PAPEL do
 *   usuário, e o papel vem de uma consulta ao Supabase. Sem nuvem, esse "não
 *   sei" nunca vira "sei", e a Home fica em branco para sempre (é um defeito
 *   real do app, não do script — está reportado). A tela equivalente entra pelo
 *   lado do computador, que não tem essa trava.
 * • O link público do cliente e o PDF exigem, respectivamente, o worker e uma
 *   impressão do navegador; ficam para uma segunda leva.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { servir } from './servidor.mjs';
import { CELULAR, abrirNavegador, novaPagina } from './navegador.mjs';
import { semearTudo, esperarTexto, dispensarDicas, criarOrcamento, preencher } from './semear.mjs';
import { conferirPagina } from './gate-privacidade.mjs';
import { TELAS_CELULAR, TELAS_DESKTOP } from './roteiro.mjs';
import { CLIENTES, ITENS_ORCAMENTO } from './elenco.mjs';

const require = createRequire(import.meta.url);
// sharp já vem instalado com o Astro (web/node_modules) — zero dependência nova.
const sharp = require('../../web/node_modules/sharp');

const DIST = resolve(process.env.TELAS_DIST ?? '.expo/telas-build');
const SAIDA = resolve('web/public/telas');
const DESKTOP = { width: 1440, height: 900 };

/**
 * Qualidade escolhida OLHANDO a imagem, não a tabela. Screenshot de interface é
 * texto miúdo e borda de 1 px, não fotografia: o filtro do AVIF suaviza detalhe
 * fino e é justamente a nitidez do "R$ 2.480" que faz a tela parecer produto de
 * verdade. Economizar 15 KB numa imagem que parece desfocada é falsa economia.
 */
const QUALIDADE_AVIF = 62;
const QUALIDADE_WEBP = 82;

function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

/**
 * Grava uma tela em AVIF (principal) e WebP (reserva), em 2× e 1×.
 * O `<picture>` da landing serve AVIF para ~95% dos browsers e WebP para o
 * resto — ninguém vê imagem quebrada, e nenhum formato pesa por todos.
 */
async function gravarImagens(png, id, largura2x, altura2x) {
  const larguras = [
    { sufixo: '@2x', w: largura2x, h: altura2x },
    { sufixo: '', w: Math.round(largura2x / 2), h: Math.round(altura2x / 2) },
  ];
  const arquivos = [];
  for (const { sufixo, w, h } of larguras) {
    const base = sharp(png).resize(w, h, { fit: 'fill' });
    const avif = `${id}${sufixo}.avif`;
    const webp = `${id}${sufixo}.webp`;
    await base.clone().avif({ quality: QUALIDADE_AVIF, effort: 6 }).toFile(join(SAIDA, avif));
    await base.clone().webp({ quality: QUALIDADE_WEBP }).toFile(join(SAIDA, webp));
    arquivos.push({ arquivo: avif, largura: w, altura: h }, { arquivo: webp, largura: w, altura: h });
  }
  return arquivos;
}

async function capturarTela(page, base, tela, ctx) {
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

async function main() {
  try {
    statSync(join(DIST, 'index.html'));
  } catch {
    console.error(`\nNão achei ${join(DIST, 'index.html')}.`);
    console.error('Rode primeiro:  node scripts/telas/gerar.mjs\n');
    process.exit(1);
  }

  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });

  const { url, fechar } = await servir(DIST);
  const browser = await abrirNavegador();
  const manifesto = [];

  try {
    // ── Celular ──────────────────────────────────────────────────────────
    const { page } = await novaPagina(browser, { viewport: CELULAR, escala: 2 });
    page.on('pageerror', (e) => console.error('  [erro na página]', e.message.slice(0, 200)));

    console.log('Semeando dados fictícios pela interface real do app…');
    const ctx = await semearTudo(page, url, (o) => console.log(`  · ${o}`));

    console.log('\nCapturando telas de celular (393×852 @2x):');
    for (const tela of TELAS_CELULAR) {
      const png = await capturarTela(page, url, tela, ctx);
      const arquivos = await gravarImagens(png, tela.id, CELULAR.width * 2, CELULAR.height * 2);
      manifesto.push({ ...descrever(tela, 'celular'), arquivos });
      console.log(`  ✓ ${tela.id}`);
    }
    // ── Computador, no MESMO contexto ────────────────────────────────────
    // O banco do app na web mora no armazenamento do contexto do browser, então
    // alargar a janela e recarregar dá o layout de computador com os MESMOS
    // dados já semeados — sem semear tudo duas vezes.
    //
    // O recarregar é obrigatório, não opcional: `App.tsx` resolve "isto é
    // desktop?" UMA vez, no boot, para montar o mapa de URLs. Redimensionar
    // sozinho troca o layout mas deixa o mapa antigo; só o F5 realinha os dois.
    console.log('\nAlargando a janela para 1440×900 e recarregando…');
    await page.setViewportSize(DESKTOP);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    console.log('Capturando telas de computador (1440×900 @2x):');
    for (const tela of TELAS_DESKTOP) {
      const png = await capturarTela(page, url, tela, ctx);
      const arquivos = await gravarImagens(png, tela.id, DESKTOP.width * 2, DESKTOP.height * 2);
      manifesto.push({ ...descrever(tela, 'computador'), arquivos });
      console.log(`  ✓ ${tela.id}`);
    }
    await page.context().close();
  } finally {
    await browser.close();
    await fechar();
  }

  writeFileSync(
    join(SAIDA, 'telas.json'),
    JSON.stringify(
      {
        // Contrato com quem monta a landing:
        //  · `base` + `arquivo` dá a URL pública da imagem;
        //  · o AVIF é o `<source>` principal e o WebP é o fallback;
        //  · `@2x` e `1x` existem para o `srcset` — o `1x` é o que o celular do
        //    prestador baixa, e é ele que decide se a página é rápida;
        //  · `alt` é conteúdo, não enfeite: estas telas são o argumento de
        //    venda, então leitor de tela e Google precisam recebê-lo também.
        base: '/telas/',
        geradoPor: 'node scripts/telas/gerar.mjs',
        dadosFicticios:
          'Todos os nomes, telefones, endereços e valores são inventados e vivem em scripts/telas/elenco.mjs. Nenhum dado de cliente real passou por aqui: o build de captura roda sem nuvem e o banco é um SQLite local vazio.',
        telas: manifesto,
      },
      null,
      2,
    ),
    'utf8',
  );

  const total = readdirSync(SAIDA).reduce((s, f) => s + statSync(join(SAIDA, f)).size, 0);
  const avif = readdirSync(SAIDA).filter((f) => f.endsWith('.avif'));
  const somaAvif = avif.reduce((s, f) => s + statSync(join(SAIDA, f)).size, 0);
  console.log(`\n${manifesto.length} telas em ${SAIDA}`);
  console.log(`Peso: ${kb(total)} KB no total · ${kb(somaAvif)} KB só de AVIF (${avif.length} arquivos)`);
}

function descrever(tela, superficie) {
  return {
    id: tela.id,
    titulo: tela.titulo,
    legenda: tela.legenda,
    alt: tela.alt,
    superficie,
    destaque: !!tela.destaque,
  };
}

await main();
