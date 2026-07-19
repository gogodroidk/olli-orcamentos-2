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
import { semearTudo } from './semear.mjs';
import { capturarTela } from './capturar-uma.mjs';
import { TELAS_CELULAR, TELAS_DESKTOP } from './roteiro.mjs';

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
 * Codifica uma tela em AVIF (principal) e WebP (reserva), em 2× e 1×, e devolve
 * os BYTES — não grava nada.
 *
 * Gravar só no fim é o que impede a esteira da landing de sumir no meio de uma
 * rodada que falhou; o porquê está em `main`.
 *
 * O `<picture>` da landing serve AVIF para ~95% dos browsers e WebP para o
 * resto — ninguém vê imagem quebrada, e nenhum formato pesa por todos.
 */
async function renderizarImagens(png, id, largura2x, altura2x) {
  const larguras = [
    { sufixo: '@2x', w: largura2x, h: altura2x },
    { sufixo: '', w: Math.round(largura2x / 2), h: Math.round(altura2x / 2) },
  ];
  const arquivos = [];
  for (const { sufixo, w, h } of larguras) {
    const base = sharp(png).resize(w, h, { fit: 'fill' });
    const avif = `${id}${sufixo}.avif`;
    const webp = `${id}${sufixo}.webp`;
    arquivos.push(
      {
        arquivo: avif,
        largura: w,
        altura: h,
        bytes: await base.clone().avif({ quality: QUALIDADE_AVIF, effort: 6 }).toBuffer(),
      },
      {
        arquivo: webp,
        largura: w,
        altura: h,
        bytes: await base.clone().webp({ quality: QUALIDADE_WEBP }).toBuffer(),
      },
    );
  }
  return arquivos;
}

async function main() {
  try {
    statSync(join(DIST, 'index.html'));
  } catch {
    console.error(`\nNão achei ${join(DIST, 'index.html')}.`);
    console.error('Rode primeiro:  node scripts/telas/gerar.mjs\n');
    process.exit(1);
  }

  // ── NADA é apagado aqui ──────────────────────────────────────────────────
  //
  // A versão anterior fazia `rmSync(SAIDA)` NESTE ponto, antes de semear e antes
  // de capturar, e o `telas.json` só era escrito depois do loop inteiro. Uma
  // captura que estourasse na 5ª de 8 deixava a pasta pela metade e SEM
  // manifesto — e aí `carregarTelas()` encontrava ENOENT, devolvia
  // `{ estado: "ausente" }` (que é o caminho legítimo de "ainda não geraram") e
  // a esteira sumia da landing sem erro nenhum: o build passava, o deploy
  // passava, a seção não existia mais.
  //
  // É exatamente o defeito que `web/src/lib/telas.ts` gasta quarenta linhas
  // jurando impedir — a porta foi trancada para MANIFESTO QUEBRADO e ficou
  // aberta para MANIFESTO APAGADO. As imagens agora ficam em memória (32
  // arquivos, menos de 1 MB somados) e a pasta só é trocada no fim, quando as
  // oito existirem. Mesmo tratamento que `loja.mjs` já dava à pasta da Play.
  const { url, fechar } = await servir(DIST);
  const browser = await abrirNavegador();
  const manifesto = [];
  const falhas = [];

  try {
    // ── Celular ──────────────────────────────────────────────────────────
    const { page } = await novaPagina(browser, { viewport: CELULAR, escala: 2 });
    page.on('pageerror', (e) => console.error('  [erro na página]', e.message.slice(0, 200)));

    console.log('Semeando dados fictícios pela interface real do app…');
    const ctx = await semearTudo(page, url, (o) => console.log(`  · ${o}`));

    console.log('\nCapturando telas de celular (393×852 @2x):');
    for (const tela of TELAS_CELULAR) {
      try {
        const png = await capturarTela(page, url, tela, ctx);
        const arquivos = await renderizarImagens(png, tela.id, CELULAR.width * 2, CELULAR.height * 2);
        manifesto.push({ ...descrever(tela, 'celular'), arquivos });
        console.log(`  ✓ ${tela.id}`);
      } catch (e) {
        // Uma tela que não capturou é uma tela QUE FALTA, não uma tela que "não
        // tinha". Registra, segue para as outras (uma rodada tem de reportar
        // todos os problemas, não o primeiro) e a rodada termina em erro.
        falhas.push({ id: tela.id, motivo: e.message.split('\n')[0] });
        console.error(`  X ${tela.id} — ${e.message.split('\n')[0]}`);
      }
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
      try {
        const png = await capturarTela(page, url, tela, ctx);
        const arquivos = await renderizarImagens(png, tela.id, DESKTOP.width * 2, DESKTOP.height * 2);
        manifesto.push({ ...descrever(tela, 'computador'), arquivos });
        console.log(`  ✓ ${tela.id}`);
      } catch (e) {
        falhas.push({ id: tela.id, motivo: e.message.split('\n')[0] });
        console.error(`  X ${tela.id} — ${e.message.split('\n')[0]}`);
      }
    }
    await page.context().close();
  } finally {
    await browser.close();
    await fechar();
  }

  // ── Só agora a pasta é trocada ───────────────────────────────────────────
  // Leva incompleta NÃO substitui leva boa. Se faltou tela, o que está em disco
  // (e commitado) continua sendo a última leva completa, a landing continua com
  // a esteira que já tinha, e o processo sai em erro dizendo o que faltou.
  const esperadas = TELAS_CELULAR.length + TELAS_DESKTOP.length;
  if (falhas.length || manifesto.length !== esperadas) {
    console.error(`\n${falhas.length} tela(s) NÃO foram capturadas:`);
    for (const f of falhas) console.error(`  - ${f.id}: ${f.motivo}`);
    console.error(`\nNADA foi apagado: a leva anterior continua em ${SAIDA}.`);
    console.error('A esteira da landing NÃO pode ir ao ar pela metade — some sem erro nenhum.');
    process.exit(1);
  }

  rmSync(SAIDA, { recursive: true, force: true });
  mkdirSync(SAIDA, { recursive: true });
  for (const tela of manifesto) {
    for (const a of tela.arquivos) writeFileSync(join(SAIDA, a.arquivo), a.bytes);
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
        // `bytes` sai fora: ele existe só para adiar a gravação até o fim da
        // rodada. Deixá-lo passar despejaria as imagens inteiras, em base64,
        // dentro do manifesto que a landing baixa.
        telas: manifesto.map((t) => ({
          ...t,
          arquivos: t.arquivos.map(({ bytes, ...resto }) => resto),
        })),
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
