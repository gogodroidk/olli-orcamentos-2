// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';

/**
 * LASTMOD DO BLOG — o sinal de frescor mais barato que existe, e o sitemap não
 * tinha NENHUM (`dist/sitemap-0.xml`: 10 <url>, zero <lastmod>).
 *
 * A data é lida do frontmatter do próprio post, não de `mtime` do arquivo:
 * `git clone` e `npm ci` reescrevem mtime, e o resultado seria um sitemap
 * jurando que todo post mudou a cada deploy — frescor falso é pior que nenhum.
 *
 * POR QUE REGEX E NÃO A COLEÇÃO: o `astro.config.mjs` é avaliado ANTES de
 * `astro:content` existir; não há como chamar `getCollection()` daqui. O formato
 * do frontmatter é nosso e está travado pelo schema em `src/content.config.ts`
 * (`publicadoEm` é obrigatório e `z.coerce.date()`), então o casamento é seguro —
 * e, se não for, a função ABAIXO QUEBRA O BUILD em vez de emitir um sitemap sem
 * lastmod em silêncio. "Não sei" não pode virar "não tem".
 */
const DIRETORIO_POSTS = fileURLToPath(new URL('./src/content/blog', import.meta.url));

function lastmodPorRota() {
  const mapa = new Map();
  for (const nome of readdirSync(DIRETORIO_POSTS)) {
    if (!nome.endsWith('.md')) continue;
    const texto = readFileSync(join(DIRETORIO_POSTS, nome), 'utf8');
    const publicado = texto.match(/^publicadoEm:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
    const atualizado = texto.match(/^atualizadoEm:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
    if (!publicado) {
      throw new Error(
        `[sitemap] "${nome}" não tem "publicadoEm: AAAA-MM-DD" no frontmatter — ` +
          `sem isso o post entraria no sitemap sem lastmod. Corrija o post.`,
      );
    }
    mapa.set(`/blog/${nome.replace(/\.md$/, '')}/`, atualizado ?? publicado);
  }
  return mapa;
}

const LASTMOD = lastmodPorRota();

/**
 * LASTMOD DAS PÁGINAS FIXAS — data da ÚLTIMA MUDANÇA DE CONTEÚDO (última edição do arquivo na main), não do build:
 * frescor falso é pior que nenhum. Ao editar uma dessas páginas, atualize a data aqui. /para/* compartilha o mesmo
 * molde (`pages/para/[oficio].astro`).
 */
const LASTMOD_PAGINAS = new Map([
  ['/', '2026-11-16'],
  ['/planos/', '2026-11-03'],
  ['/produto/', '2026-11-16'],
  ['/catalogo/', '2026-11-05'],
  ['/sobre/', '2026-11-03'],
  ['/como-funciona/', '2026-11-03'],
  ['/perguntas/', '2026-11-16'],
  ['/contato/', '2026-11-03'],
  ['/ajuda/', '2026-10-02'],
  ['/legal/privacidade/', '2026-09-29'],
  ['/legal/termos/', '2026-09-29'],
]);
const LASTMOD_PARA = '2026-10-01';

/**
 * VARIANTES DE ANÚNCIO: /eletricista/ e /refrigeracao/ são as páginas de destino dos anúncios (mesmo ofício de
 * /para/eletricista/ e /para/climatizacao-e-refrigeracao/). Elas continuam no ar (o anúncio aponta para lá) e têm
 * canonical para a página de SEO, então NÃO entram no sitemap — duas URLs do mesmo ofício disputavam a mesma busca.
 */
const VARIANTES_DE_ANUNCIO = ['/eletricista/', '/refrigeracao/'];
/** Aliases por palavra de /para/ (D-1013): página no ar, canonical na de SEO, fora do sitemap. Slugs de `ALIASES_PARA` em `src/data/oficios.ts`. */
const ALIASES_PARA_FORA = ['/para/ar-condicionado/', '/para/refrigeracao/', '/para/hidraulica/', '/para/marido-de-aluguel/', '/para/manutencao/'];

// Site de marketing da OLLI — separado do app (react-native-web). Aqui mora o
// design extraordinário: SSG p/ SEO + Lighthouse alto, ilhas React só onde há
// interação, Motion p/ 85% do movimento, 3D só no hero (lazy + fallback).
// https://astro.build/config
export default defineConfig({
  site: 'https://olliorcamentos.online',
  // ST-04: o canonical e o sitemap saem COM barra final (/ajuda/), mas os links
  // internos eram sem barra (/ajuda) — e o Worker de assets responde 307 → /ajuda/
  // em cada clique e em cada aresta que o Googlebot atravessa. `trailingSlash: 'always'`
  // torna a barra a forma canônica; combinado com os hrefs já corrigidos pra ter barra,
  // o 307 some. `build.format: 'directory'` (padrão) já gera /ajuda/index.html.
  trailingSlash: 'always',
  // A URL de privacidade documentada nas lojas (docs/LOJAS.md, docs/STORE_LISTING.md)
  // é /privacidade, mas a página real vive em /legal/privacidade/ — sem este redirect
  // 301, quem chega por ela (loja, e-mail antigo, link salvo) cai num 404. O destino já
  // sai com a barra final para respeitar o `trailingSlash: 'always'` acima e não
  // encadear um segundo redirect até a forma canônica.
  redirects: {
    '/privacidade': '/legal/privacidade/',
  },
  // O sentry() só carrega opções de BUILD (org/project/authToken p/ source map).
  // A DSN e o resto do runtime moram em sentry.client.config.js — passar dsn aqui
  // está deprecado no SDK 10 ("vai parar de funcionar numa versão futura").
  // authToken vem da env SENTRY_AUTH_TOKEN no build; sem ela, só não sobe o source
  // map — a captura de erro continua funcionando.
  integrations: [
    react(),
    sitemap({
      /**
       * A PAGINAÇÃO PROFUNDA NÃO ENTRA. `/blog/` e `/blog/2/` ficam (são hubs
       * reais, e são por onde o rastreador anda); da terceira em diante a página
       * existe só para o crawler caminhar — ela não ranqueia e só consome
       * orçamento de rastreio. O mesmo vale para a paginação das categorias.
       *
       * O que NÃO se faz aqui, e é o erro clássico de quem tenta "limpar
       * duplicata": apontar o canonical das páginas 2+ para /blog/. Isso faria o
       * Google descartá-las e, com elas, os posts que só são linkados de lá.
       * Sair do sitemap ≠ sair do índice: a página segue rastreável pelo link.
       */
      filter: (pagina) => {
        const caminho = new URL(pagina).pathname;
        // Rotas utilitárias e de redirecionamento têm noindex na página. Não
        // adianta pedir ao crawler para indexar e depois contradizer no HTML:
        // elas ficam fora do sitemap desde a origem.
        // /servicos/ é noindex enquanto PAGINA_PUBLICADA=false (data/servicos.ts).
        // Ao publicar de verdade, tire '/servicos/' desta lista no mesmo PR.
        if (['/admin/', '/404/', '/excluir-conta/', '/servicos/'].includes(caminho)) return false;
        if (VARIANTES_DE_ANUNCIO.includes(caminho)) return false;
        if (ALIASES_PARA_FORA.includes(caminho)) return false;
        if (!caminho.startsWith('/blog/')) return true;
        const numero = caminho.match(/\/(\d+)\/$/);
        return !numero || Number(numero[1]) <= 2;
      },
      serialize: (item) => {
        const caminho = new URL(item.url).pathname;
        const data = LASTMOD.get(caminho) ?? LASTMOD_PAGINAS.get(caminho) ?? (caminho.startsWith('/para/') ? LASTMOD_PARA : undefined);
        return data ? { ...item, lastmod: data } : item;
      },
    }),
    sentry({
      org: 'olli-p7',
      project: 'olli-landing',
      telemetry: false,
      // O que vai em TODA página é o carregador de ~1 KB, não o SDK (~48 KB gzip):
      // ele guarda o erro e só então importa o sentry.client.config.js. Ver o
      // cabeçalho de src/scripts/sentry-sob-demanda.ts.
      clientInitPath: './src/scripts/sentry-sob-demanda.ts',
      sourcemaps: {
        // ARMADILHA: ligar o Sentry faz o Vite emitir .map no dist. Sem token não
        // há upload, e o .map ia junto pro ar — expondo o código-fonte da landing
        // (a main não gerava nenhum .map; isso é efeito colateral do SDK).
        // Com token: gera, sobe pro Sentry e APAGA do dist. Sem token: nem gera.
        disable: !process.env.SENTRY_AUTH_TOKEN,
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  ],
  /**
   * SEM REALCE DE SINTAXE NO MARKDOWN.
   *
   * O padrão do Astro é o Shiki com o tema `github-dark`, e ele injeta
   * `style="background-color:#24292e;color:#e1e4e8"` INLINE em cada <pre> —
   * inline vence folha de estilo, então o bloco saía numa caixa preta no meio de
   * uma página clara, ignorando o `--color-paper` do sistema visual.
   *
   * E nenhum bloco `code` deste blog é código: são contas (hora técnica, diluição
   * de produto) e um modelo de orçamento em texto. Realçar sintaxe de "plaintext"
   * só produz uma <span> por linha — HTML a mais para não pintar nada.
   *
   * Se um dia entrar post com código de verdade, o caminho é
   * `shikiConfig: { theme: 'github-light' }`, não voltar ao padrão escuro.
   */
  markdown: {
    syntaxHighlight: false,
  },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
