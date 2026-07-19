/**
 * SCREENSHOTS DA GOOGLE PLAY — telas REAIS do app, no formato que a loja aceita.
 *
 *     node scripts/telas/loja.mjs                (usa o build já exportado)
 *     node scripts/telas/loja.mjs --exportar     (exporta a web antes de capturar)
 *
 * Saída: assets/loja/screenshots/NN-<id>.png — 1080x1920, PNG de 3 canais.
 *
 * ─── Por que este arquivo e não um pipeline novo ───────────────────────────
 *
 * Nada aqui captura nada por conta própria. Servidor, browser determinístico,
 * semeadura pela interface real, portão de privacidade e a rotina de capturar
 * uma tela são os MESMOS módulos que geram as imagens da landing. O que este
 * arquivo acrescenta é só o que a loja pede e a landing não: um recorte próprio
 * de telas, a legenda curta de vitrine e a moldura 1080x1920.
 *
 * A diferença que importa em relação ao roteiro antigo (assets/loja/SCREENSHOTS.md,
 * que pressupunha emulador + adb + APK): aqui não há aparelho, não há APK e não
 * há login. O app é exportado para a web SEM NUVEM, e é por isso que a captura
 * pode rodar sozinha — ver o cabeçalho de `capturar-telas.mjs`.
 *
 * ─── O preço dessa escolha, dito na cara ───────────────────────────────────
 *
 * Sem nuvem, toda tela que depende de saber o PAPEL do usuário não monta (Home
 * do celular, Meu Negócio) e toda tela que depende de worker não responde (voz,
 * PDF, link público). Elas NÃO entram aqui e NÃO foram substituídas por
 * ilustração: screenshot de loja tem de ser a tela que o usuário vai encontrar.
 * A lista do que ficou de fora, e por quê, está em docs/ENXAME/LOJA.md.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { servir } from './servidor.mjs';
import { CELULAR, abrirNavegador, novaPagina } from './navegador.mjs';
import { semearTudo } from './semear.mjs';
import { capturarTela } from './capturar-uma.mjs';
import { conferirBundleSemCredenciais } from './guarda-bundle.mjs';
import { abrirMoldura, conferirConformidade, laudoEmLinha, REGRAS } from './moldura-loja.mjs';
import { MAX_RODAPE_VAZIO, medirBuffer, ocupacaoEmLinha } from './medir-ocupacao.mjs';
import { TELAS_CELULAR } from './roteiro.mjs';

const DIST = resolve(process.env.TELAS_DIST ?? '.expo/telas-build');
const SAIDA = resolve('assets/loja/screenshots');

/**
 * Escala de captura 3x, não 2x. A captura entra na moldura REDUZIDA (852 px de
 * altura viram ~1517), então capturar em 2x significaria reduzir de 1704 para
 * 1517 — quase 1:1, sem sobra para o reamostrador trabalhar, e o texto miúdo do
 * app (que é o que prova que o produto é real) sai com serrilhado. Em 3x são
 * 2556 px reduzidos para 1517: sobra de amostragem de verdade.
 */
const ESCALA_CAPTURA = 3;

/**
 * O ROTEIRO DA LOJA. Ordem é decisão de vitrine, não de arquivo: a Play mostra
 * as 2~3 primeiras na busca e quase ninguém rola. Por isso as duas primeiras
 * contam o ciclo inteiro do dinheiro (monta o orçamento -> cliente aprova) e o
 * resto aprofunda.
 *
 * `de` reaproveita a receita de navegação já provada em `roteiro.mjs` (rota,
 * âncora, preparação). Só a legenda é própria: a da landing é uma frase de
 * parágrafo, e na miniatura da Play, com menos de 200 px de largura, frase
 * comprida vira borrão cinza.
 */
const ROTEIRO_LOJA = [
  { de: 'novo-orcamento-itens', legenda: ['Monte o orçamento', 'na frente do cliente'] },
  { de: 'orcamento-aprovado', legenda: ['Aprovado, com PDF', 'e envio no WhatsApp'] },
  { de: 'lista-orcamentos', legenda: ['Tudo que está em aberto', 'numa tela só'] },
  { de: 'ordem-servico', legenda: ['O "sim" do cliente', 'vira ordem de serviço'] },
  { de: 'agenda', legenda: ['A semana inteira', 'no lugar certo'] },
  {
    // Esta tela NÃO está no roteiro da landing e entra aqui de propósito: é a
    // única do conjunto que responde "e quando eu estiver no telhado sem sinal?".
    //
    // A rota é /diagnostico e não /codigos-erro: em `AppNavigator.tsx` a rota
    // `Diagnostico` é a `CodigosErroScreen` (a tela de códigos de erro), e o
    // linking mapeia `Diagnostico: 'diagnostico'`.
    id: 'codigos-erro',
    rota: '/diagnostico',
    // Âncora com o NÚMERO de propósito. O cabeçalho mostra "Códigos de erro"
    // (sem número) enquanto a contagem carrega, e o `getByText` do Playwright
    // casa por substring ignorando maiúsculas — anco'rar em "códigos de erro"
    // fotografaria a tela meio carregada. Com "698 códigos" a foto só sai
    // depois da contagem real, e se a base mudar a captura FALHA em vez de
    // publicar uma legenda que virou mentira (a legenda diz 698 também).
    esperar: '698 códigos',
    preparar: async (page, { preencher }) => {
      await preencher(page, 'Código, marca ou sintoma (ex: "E4", "LED piscando")', 'E4');
      // Espera o RESULTADO, não um tempo. "Ventilador interno" é a primeira
      // linha de forma determinística: `searchCodigosErro` ordena por
      // "código exato primeiro, depois marca ASC", e entre os 14 E4 exatos da
      // base a marca alfabeticamente menor é Agratto.
      await page.getByText('Ventilador interno', { exact: false }).first()
        .waitFor({ state: 'visible', timeout: 15000 });
    },
    legenda: ['698 códigos de erro', 'que abrem sem internet'],
  },
  {
    de: 'diagnostico-ia',
    legenda: ['Diagnóstico assistido', 'antes de abrir a máquina'],
    // EXCEÇÃO DECLARADA ao portão de vazio (ver `medir-ocupacao.mjs`). Esta
    // tela é um formulário: abaixo do botão "Pedir diagnóstico" fica o espaço
    // da RESPOSTA, e a resposta vem do worker de IA — que este build, offline
    // de propósito, não alcança. Medido: 44,5% de rodapé vazio.
    //
    // A tolerância é escrita aqui, com o motivo, em vez de o limite geral ser
    // afrouxado até caber: um limite que cabe em tudo não reprova nada. Se um
    // dia a captura passar a rodar com o worker de pé, esta linha sai e a tela
    // volta a ser cobrada como as outras.
    vazioTolerado: 50,
  },
  { de: 'clientes', legenda: ['Seus clientes', 'sempre à mão'] },
];

function resolverRoteiro() {
  const porId = new Map(TELAS_CELULAR.map((t) => [t.id, t]));
  return ROTEIRO_LOJA.map((entrada, i) => {
    const base = entrada.de ? porId.get(entrada.de) : entrada;
    if (!base) {
      // "Não sei qual é a receita" não pode virar "essa tela não existe": sem
      // esta parada, um id renomeado em roteiro.mjs sumiria com uma screenshot
      // em silêncio e a loja receberia sete no lugar de oito.
      console.error(`\nPAREI: "${entrada.de}" não existe em roteiro.mjs (TELAS_CELULAR).`);
      console.error('Ou o id mudou de nome, ou a tela saiu do roteiro. Corrija antes de gerar.\n');
      process.exit(1);
    }
    const id = entrada.id ?? base.id;
    return {
      ...base,
      id,
      legenda: entrada.legenda,
      vazioTolerado: entrada.vazioTolerado ?? MAX_RODAPE_VAZIO,
      arquivo: `${String(i + 1).padStart(2, '0')}-${id}.png`,
    };
  });
}

async function main() {
  if (process.argv.includes('--exportar')) {
    console.log('Exportando o app para a web, com a nuvem DESLIGADA…');
    const r = spawnSync(
      'npx',
      ['expo', 'export', '-p', 'web', '--output-dir', '.expo/telas-build'],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          EXPO_PUBLIC_SUPABASE_URL: 'offline',
          EXPO_PUBLIC_SUPABASE_ANON_KEY: '',
          EXPO_PUBLIC_DIAGNOSTICO_URL: '',
        },
      },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
  }

  try {
    statSync(join(DIST, 'index.html'));
  } catch {
    console.error(`\nNão achei ${join(DIST, 'index.html')}.`);
    console.error('Rode:  node scripts/telas/loja.mjs --exportar\n');
    process.exit(1);
  }

  // Mesma trava do pipeline da landing: um browser de captura com credencial de
  // produção na mão pode fotografar dado de cliente real.
  console.log('Conferindo o bundle…');
  conferirBundleSemCredenciais(DIST);

  const roteiro = resolverRoteiro();
  if (roteiro.length > REGRAS.maxCapturas) {
    console.error(`\nPAREI: ${roteiro.length} telas no roteiro, e a Play aceita no máximo ${REGRAS.maxCapturas} por tipo de aparelho.\n`);
    process.exit(1);
  }

  // NADA é apagado aqui. A versão anterior fazia `rmSync(SAIDA)` NESTE ponto —
  // antes de semear, antes de capturar — e a leva boa que estava commitada
  // sumia no instante em que a semeadura falhasse. Isso deixou de ser hipótese
  // quando a semeadura ganhou conferência estrita: ela agora falha de propósito
  // quando uma gravação se perde, e o preço não pode ser ficar sem screenshot
  // nenhuma para a loja. As imagens ficam em memória (8 × ~500 KB) e a pasta só
  // é trocada no fim, quando as oito existirem. Mesmo defeito que
  // `REVISAO_TELAS.md` §C2 aponta no pipeline da landing.
  const { url, fechar } = await servir(DIST);
  const browser = await abrirNavegador();
  const feitas = [];
  const falhas = [];

  try {
    const { page } = await novaPagina(browser, { viewport: CELULAR, escala: ESCALA_CAPTURA });
    page.on('pageerror', (e) => console.error('  [erro na página]', e.message.slice(0, 200)));

    console.log('\nSemeando dados fictícios pela interface real do app…');
    const ctx = await semearTudo(page, url, (o) => console.log(`  · ${o}`));

    const moldura = await abrirMoldura(browser);
    console.log(`\nCapturando ${roteiro.length} telas (${CELULAR.width}x${CELULAR.height} @${ESCALA_CAPTURA}x) e montando em 1080x1920:`);

    for (const tela of roteiro) {
      try {
        const png = await capturarTela(page, url, tela, ctx);
        // Mede o VAZIO na captura crua, antes da moldura: aqui a imagem inteira
        // é a tela do app e não há borda, legenda nem sombra para confundir a
        // conta. O laudo de formato (1080x1920, sem alpha) continua sendo feito
        // depois, sobre o arquivo gravado.
        const ocupacao = await medirBuffer(png);
        const final = await moldura.montar(png, tela.legenda);
        feitas.push({ ...tela, destino: join(SAIDA, tela.arquivo), png: final, ocupacao });
        console.log(`  ✓ ${tela.arquivo}`);
      } catch (e) {
        // Uma tela que não capturou é uma tela QUE FALTA, não uma tela que "não
        // tinha". Registra, segue para as outras (uma rodada tem de reportar
        // todos os problemas, não o primeiro) e o processo termina em erro.
        falhas.push({ id: tela.id, arquivo: tela.arquivo, motivo: e.message.split('\n')[0] });
        console.error(`  X ${tela.arquivo} — ${e.message.split('\n')[0]}`);
      }
    }

    await moldura.fechar();
    await page.context().close();
  } finally {
    await browser.close();
    await fechar();
  }

  // ── Só agora a pasta é trocada ───────────────────────────────────────────
  // Leva incompleta NÃO substitui leva boa. Se faltou tela, o que está em disco
  // (e commitado) continua sendo a última leva conforme, e o processo sai em
  // erro dizendo o que faltou.
  if (falhas.length) {
    console.error(`\n${falhas.length} tela(s) NÃO foram capturadas:`);
    for (const f of falhas) console.error(`  - ${f.arquivo}: ${f.motivo}`);
    console.error(`\nNADA foi apagado: a leva anterior continua em ${SAIDA}.`);
    console.error('Não suba a leva incompleta sem ler docs/ENXAME/LOJA.md.');
    process.exit(1);
  }

  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });
  for (const f of feitas) writeFileSync(f.destino, f.png);

  // ── Laudo de conformidade: tudo MEDIDO do arquivo em disco ───────────────
  console.log('\nConferindo cada arquivo contra as regras da Play:');
  let algumReprovado = false;
  const laudos = [];
  for (const f of feitas) {
    const bytes = statSync(f.destino).size;
    const c = await conferirConformidade(f.destino, bytes);
    laudos.push({ arquivo: f.arquivo, ...c });
    if (!c.ok) algumReprovado = true;
    console.log(laudoEmLinha(f.arquivo, c));
  }

  // ── Laudo de OCUPAÇÃO: quanto de cada tela é fundo chapado ───────────────
  //
  // Regra de formato e regra de conteúdo são coisas diferentes, e só a primeira
  // existia. `04-ordem-servico` passou em TODAS as regras da Play com 69,7% da
  // altura vazia — porque nenhuma regra da Play fala de vazio. Uma tela oca não
  // é recusada pela loja; é recusada pelo prestador que desliza a vitrine.
  console.log('\nConferindo quanto de cada tela é fundo vazio:');
  const ocas = [];
  for (const f of feitas) {
    const limite = f.vazioTolerado;
    const oca = f.ocupacao.rodapeVazioPct > limite;
    if (oca) ocas.push({ arquivo: f.arquivo, ...f.ocupacao, limite });
    console.log(
      ocupacaoEmLinha(f.arquivo, { ...f.ocupacao, oca }) +
        (limite !== MAX_RODAPE_VAZIO ? `  (tolerância declarada: ${limite}%)` : ''),
    );
  }

  const comDestaque = laudos.filter((l) => l.regras.resolucaoDeDestaque).length;
  const totalBytes = laudos.reduce((s, l) => s + l.bytes, 0);

  console.log(`\n${feitas.length} screenshot(s) em ${SAIDA}`);
  console.log(`Peso total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `Quantidade: ${feitas.length} (a Play exige de ${REGRAS.minCapturas} a ${REGRAS.maxCapturas} por tipo de aparelho).`,
  );
  console.log(
    comDestaque >= REGRAS.minParaDestaque
      ? `Destaque: ${comDestaque} capturas com >= ${REGRAS.ladoMinParaDestaque} px — elegível aos formatos de recomendação.`
      : `Destaque: só ${comDestaque} capturas com >= ${REGRAS.ladoMinParaDestaque} px; a Play pede ${REGRAS.minParaDestaque}.`,
  );

  writeFileSync(
    join(SAIDA, 'conformidade.json'),
    JSON.stringify(
      {
        geradoPor: 'node scripts/telas/loja.mjs',
        regrasEm: 'https://support.google.com/googleplay/android-developer/answer/9866151',
        dadosFicticios:
          'Todos os nomes, telefones, endereços e valores são inventados e vivem em scripts/telas/elenco.mjs. O build de captura roda sem nuvem e o banco é um SQLite local vazio: nenhum dado de cliente real passou por aqui.',
        capturas: laudos,
        // `oca` é recalculado contra a tolerância DESTA tela. O `oca` que
        // `medirBuffer` devolve usa o limite geral e sozinho seria uma
        // contradição no arquivo ("oca: true, tolerado: 50, vazio: 44").
        ocupacao: feitas.map((f) => ({
          arquivo: f.arquivo,
          ...f.ocupacao,
          rodapeVazioTolerado: f.vazioTolerado,
          oca: f.ocupacao.rodapeVazioPct > f.vazioTolerado,
        })),
        faltando: falhas,
      },
      null,
      2,
    ),
    'utf8',
  );

  // `falhas` já saiu em erro lá em cima, ANTES de trocar a pasta — chegar aqui
  // significa que as oito existem. `faltando` fica no laudo por completude.
  if (algumReprovado) {
    console.error('\nPelo menos um arquivo REPROVOU nas regras da Play (ver linhas com "X" acima). Não suba.');
    process.exit(1);
  }
  if (ocas.length) {
    console.error(`\n${ocas.length} tela(s) com rodapé vazio acima do tolerado:`);
    for (const o of ocas) {
      console.error(`  - ${o.arquivo}: ${o.rodapeVazioPct}% vazio (limite ${o.limite}%)`);
    }
    console.error(
      '\nIsto é falta de DADO, não de código: semeie mais conteúdo em scripts/telas/elenco.mjs',
    );
    console.error('e capture de novo. Tela oca vende "app sem nada dentro". Não suba.');
    process.exit(1);
  }
  if (feitas.length < REGRAS.minCapturas) {
    console.error(`\nSó ${feitas.length} screenshot(s): a Play não publica a listagem com menos de ${REGRAS.minCapturas}.`);
    process.exit(1);
  }
}

await main();
