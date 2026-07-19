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
  { de: 'diagnostico-ia', legenda: ['Diagnóstico assistido', 'antes de abrir a máquina'] },
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

  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });

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
        const final = await moldura.montar(png, tela.legenda);
        const destino = join(SAIDA, tela.arquivo);
        writeFileSync(destino, final);
        feitas.push({ ...tela, destino });
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
        faltando: falhas,
      },
      null,
      2,
    ),
    'utf8',
  );

  if (falhas.length) {
    console.error(`\n${falhas.length} tela(s) NÃO foram capturadas:`);
    for (const f of falhas) console.error(`  - ${f.arquivo}: ${f.motivo}`);
    console.error('\nNão suba a leva incompleta sem ler docs/ENXAME/LOJA.md.');
    process.exit(1);
  }
  if (algumReprovado) {
    console.error('\nPelo menos um arquivo REPROVOU nas regras da Play (ver linhas com "X" acima). Não suba.');
    process.exit(1);
  }
  if (feitas.length < REGRAS.minCapturas) {
    console.error(`\nSó ${feitas.length} screenshot(s): a Play não publica a listagem com menos de ${REGRAS.minCapturas}.`);
    process.exit(1);
  }
}

await main();
