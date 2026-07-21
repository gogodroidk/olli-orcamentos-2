# LANDING — BLOG, SEO E TAXONOMIA

> **Escopo:** só a landing (`web/`, Astro 7.0.7 + Tailwind 4, servida na raiz `olliorcamentos.online`
> pelo worker de assets `site/`). **Nenhuma linha de código foi editada nesta onda** — outra onda está
> mexendo em `web/package.json` e `web/src/styles/global.css` (troca de fonte) neste momento.
> Este documento é plano + medição.
>
> **Medição:** tudo abaixo foi medido nesta sessão, em `a058797` (2026-07-18 09:13), com o `web/dist/`
> gerado às **09:00 de 18/07**. Comandos rodados às 09:15–09:21. Nenhum número foi copiado de outro doc.
>
> **Relação com `docs/LANDING_BRIEF.md`:** aquele brief JÁ tem um plano de blog (FASE 7 + 12 pautas seed
> + arquitetura de URL). Este documento **não recomeça** — ele (a) mede o que de fato foi construído
> desde então, (b) **discorda em dois pontos** (a decisão de audiência e a existência de `/blog/oficio/`)
> e diz por quê, (c) desce ao nível de implementação que faltava.

---

## 0. O QUE JÁ EXISTE (leia antes de propor qualquer coisa)

Lido inteiro: `web/src/` (6 rotas), `web/astro.config.mjs`, `web/public/robots.txt`,
`web/scripts/gerar-headers.mjs`, `site/wrangler.jsonc`, `web/dist/` construído.

| Já feito | Onde |
|---|---|
| SSG + `trailingSlash: 'always'` + redirect 301 `/privacidade` | `web/astro.config.mjs:19,25-27` |
| Sitemap automático (`@astrojs/sitemap`) — 10 URLs no ar | `web/astro.config.mjs:34`, `web/dist/sitemap-0.xml` |
| `robots.txt` com `Allow: /` + Sitemap | `web/public/robots.txt` |
| Canonical por página, OG completo (image/width/height/alt), Twitter card | `web/src/layouts/Layout.astro:104-122` |
| JSON-LD global: `Organization` (com `@id`) + `WebSite` + `SoftwareApplication` com 3 `Offer` | `web/src/layouts/Layout.astro:44-92` |
| `FAQPage` na home (9 perguntas) **serializado do mesmo array que a tela renderiza** | `web/src/pages/index.astro:165-223` |
| `FAQPage` + `BreadcrumbList` nas 6 páginas de ofício, **gerados da fonte** (`verticais.ts`, `calculosOficio.ts`) | `web/src/pages/para/[oficio].astro:98-157` |
| 6 páginas `/para/[oficio]/` com slug = profissão, não categoria | `web/src/data/oficios.ts:125-133` |
| `/llms.txt` como endpoint derivado da fonte (inclui seção "o que a OLLI NÃO faz") | `web/src/pages/llms.txt.ts` |
| `noindex` na 404, `not_found_handling: "404-page"` no worker | `Layout.astro:106`, `site/wrangler.jsonc` |
| CSP forte gerado no build por hash de script inline | `web/scripts/gerar-headers.mjs` |

**Isto é SEO de gente que sabe o que faz.** Nada abaixo repete esses itens. Em particular: não proponho
JSON-LD "novo", não proponho sitemap, não proponho FAQ, não proponho páginas por ofício.

---

## 1. DIAGNÓSTICO DE SEO ATUAL — MEDIDO

### 1.1 Os buracos, com endereço

| # | Achado | Arquivo/linha | Gravidade | Esforço |
|---|---|---|---|---|
| **A1** | **A home não passa `titulo` nem `descricao`** — cai no default do Layout, cujo título é `"OLLI — do orçamento ao recibo, sem planilha"` (46 chars, **zero keyword**). O `LANDING_BRIEF` já tinha prescrito `"App de Orçamento e Ordem de Serviço para Prestador \| OLLI"` e isso nunca foi aplicado. É o único título do site sem palavra que alguém digita. | `index.astro:226` (`<Layout schemas={[schemaFaq]}>` sem props) vs `Layout.astro:21-22` | **Alta** | P |
| **A2** | **`og:type` é `"website"` fixo.** Post de blog precisa de `article` + `article:published_time`. Hoje o Layout não tem prop para isso. Bloqueia o blog. | `Layout.astro:108` | Alta (p/ blog) | P |
| **A3** | **Sitemap sem `lastmod`.** Aceitável para 10 páginas estáticas; para blog é o sinal de frescor mais barato que existe. | `web/dist/sitemap-0.xml` (medido: 10 `<url>`, nenhum `<lastmod>`) | Média | P |
| **A4** | **O rodapé não linka as páginas de ofício.** O `LANDING_BRIEF` pede "footer com links internos /para". Medido: `grep -rn "/para/" src/components/ src/layouts/` retorna **1 ocorrência, e é um comentário**. Resultado: `/ajuda/`, `/legal/*` e a 404 são becos sem saída — não passam autoridade nenhuma pras 6 páginas que convertem. | `Footer.astro:34-39` | **Alta** | P |
| **A5** | **`/ajuda/` é uma página só com N artigos dentro** (40.913 bytes de HTML, 1 `<h1>`, 1 `<h2>`, 1 `<h3>` no template). Cada artigo de ajuda é uma resposta a uma busca real ("como enviar orçamento pro cliente aprovar") e hoje todos disputam **um único** title/description. | `ajuda/index.astro`, fonte em `src/content/ajuda/index.ts` | Média | M |
| **A6** | **`Organization.logo` aponta pro banner OG de 1200×630** (`/og-image.png`, **239.577 bytes**). É o banner social, não o logo. E 239 KB é peso de banner, não de logo. | `Layout.astro:53` + `web/dist/og-image.png` | Baixa | P |
| **A7** | **`robots.txt` não documenta os bots de IA.** Hoje `Allow: /` já libera todos — funcionalmente está certo. O item do brief ("documentar GPTBot/OAI-SearchBot/ClaudeBot/PerplexityBot/Google-Extended") é de legibilidade, não de efeito. **Não priorizar.** | `web/public/robots.txt` | Baixa | P |
| **A8** | **`/privacidade/` é redirect de meta-refresh, não 301.** O Astro em SSG emite um HTML de 371 bytes com refresh; o Google trata como redirect fraco. O worker de assets suporta `_redirects` (redirect real, aplicado **antes** dos headers). | `web/dist/privacidade/index.html` (371 bytes) | Baixa | P |

### 1.2 O que está certo e eu não vou mexer

- **Hierarquia de heading:** medido arquivo a arquivo — `index` h1=1/h2=8/h3=5; `[oficio]` h1=1/h2=5/h3=4; `ajuda` 1/1/1; `legal/*` 1/1/0; `404` 1/0/0. **Nenhuma página com 2 h1, nenhum h3 órfão.**
- **Imagem sem alt:** `grep -rn "<img" web/src/` → **0 ocorrências**. O site inteiro é SVG inline + CSS. Não existe o problema clássico.
- **Title/description por página:** 5 das 6 rotas passam `titulo=` explicitamente. A exceção é a home (A1).
- **Canonical:** correto e absoluto em todas (`Layout.astro:25-28`), coerente com `trailingSlash: 'always'`.
- **hreflang:** não se aplica — site monolíngue pt-BR, `<html lang="pt-BR">` correto.

### 1.3 Velocidade — o número que decide o blog

Medido em `web/dist/` (raw / gzip -9):

| Asset | Raw | Gzip | Onde carrega |
|---|---|---|---|
| `page.B0n579Hh.js` — **é o SDK do Sentry 10.66.0** | 144.371 B | **47.964 B** | **TODA página**, inclusive `/para/eletricista/`, que não tem nenhuma ilha React |
| `client.Bv3O21T9.js` — React | 184.122 B | 57.081 B | só a home (ilha `HeroDevices client:load`) |
| `HeroDevices.JkgGbcMN.js` | 140.205 B | 44.149 B | só a home |
| `Layout.DAb0-4il.css` | 47.097 B | 10.512 B | todas |
| `index.html` | 68.306 B | 16.301 B | home |
| `/para/eletricista/index.html` | 21.407 B | 5.859 B | ofício |
| 23 arquivos de fonte woff/woff2 | 319.104 B no dist | — | sob demanda |

**Três leituras que importam pro blog:**

1. **A home carrega ~149 KB gzip de JS** (Sentry + React + HeroDevices) numa página de marketing.
   Isso é o custo do hero 3D e é uma decisão já tomada. **O blog não pode herdar isso.**
2. **Toda página paga 48 KB gzip de Sentry**, mesmo sem ilha. Um post de blog em Markdown puro,
   que deveria custar ~8 KB de HTML e **zero** JS, vai nascer pesando 48 KB de JS de monitoramento.
   Em 4G no meio da rua isso é ~0,4–0,8 s só de download, mais parse/execução no Android intermediário.
   *Ação:* `sentry.client.config.js` usa `tracesSampleRate: 0.1` e **não usa Replay**. As opções
   `bundleSizeOptimizations: { excludeReplayShadowDom, excludeReplayIframe, excludeReplayWorker,
   excludeDebugStatements }` são grátis nesse cenário (`excludeDebugStatements` sozinho ≈ 5 KB gzip,
   segundo a doc do Sentry). **Não** ligar `excludePerformanceMonitoring` — mataria o `tracesSampleRate`.
   Esforço **P**, benefício medível antes/depois com o mesmo comando desta seção.
3. **`Spectral` está declarada e não é usada.** `--font-display: "Spectral"` existe em
   `global.css:36`, e `grep -rn "font-display\|Spectral\|font-serif" web/src/` fora do CSS retorna
   **nada**. O `@fontsource/spectral` traz 16 arquivos, incluindo **cirílico e vietnamita**, num site
   pt-BR. Navegador não baixa subset não usado — o custo em runtime é pequeno — mas são
   `@font-face` mortos dentro dos 47 KB de CSS que **toda** página carrega.
   **NÃO MEXER AGORA:** outra onda está editando `global.css` e `package.json` exatamente por causa de
   fonte. Registrado aqui pra quem fizer o merge.

### 1.4 A armadilha do `_headers` (isto vai quebrar o blog se ninguém avisar)

`web/dist/_headers`, gerado no build: a linha do `Content-Security-Policy` tem **1.338 caracteres** e
**18 hashes sha256** — um por script inline distinto do site.

O Cloudflare Workers static assets impõe **2.000 caracteres por linha** no `_headers`
([docs](https://developers.cloudflare.com/workers/static-assets/headers/)). Cada hash novo custa ~52 chars.

> **Sobram ~12 scripts inline antes de a linha estourar o limite** — e quando estourar, o efeito não é
> um erro de build: é o CSP inteiro parando de ser aplicado, em silêncio.

Consequência direta para o blog: **cada post NÃO pode trazer script inline próprio** (widget de compartilhar,
toggle, "copiar código", contador de leitura). 30 posts × 1 inline cada = CSP quebrado.
Isso não é preferência de estilo; é um limite medido.

Outras restrições do CSP atual que amarram o conteúdo (`gerar-headers.mjs:63-74`):
`img-src 'self' data:` → **imagem de capa tem que ser self-hosted** (nada de Unsplash/CDN externo, nada
de `<iframe>` de YouTube — `default-src 'self'` também bloqueia frame). `font-src 'self' data:`.

---

## 2. ESTRATÉGIA DE CONTEÚDO — QUAL AUDIÊNCIA O BLOG SERVE

### 2.1 A honestidade sobre "volume de busca"

Não tenho Keyword Planner, Ahrefs nem Semrush aqui. **Não vou inventar MSV** — o próprio
`LANDING_BRIEF` fecha dizendo "nenhum MSV foi inventado", e essa regra continua valendo.
O que eu tenho, e usei, é **composição de SERP observada hoje (18/07/2026)**: quem ocupa a página 1
revela quanta demanda existe e quem é o adversário. É evidência mais fraca que volume, e mais forte que palpite.

### 2.2 As duas audiências têm intenções OPOSTAS

| | **Dono de casa / síndico / empresa** | **Prestador de serviço** |
|---|---|---|
| Busca | "quanto custa limpeza de ar condicionado", "dedetização preço", "eletricista perto de mim" | "modelo de ordem de serviço", "planilha ordem de serviço", "como fazer PMOC", "quanto cobrar por m² de pintura" |
| Quer | **contratar um técnico** | **uma ferramenta / uma resposta operacional** |
| Vale pra OLLI | **R$ 0** — a OLLI não é marketplace, não tem lead-gen, não conecta cliente a prestador | **É o comprador.** Fim. |
| Quem já domina a SERP | Triider (marketplace), Portal Leo Dias, Revista Oeste, blogs de empresas locais de higienização | Produttivo, Auvo, Contabilizei, Cobli, sites de planilha (Excel Solução, Guia do Excel) |

Verificado hoje: a SERP de *"quanto custa limpeza de ar condicionado"* traz **marketplace + portais de
notícia de grande porte**; a de *"modelo de orçamento de prestação de serviços"* traz **blogs de SaaS B2B**.
São dois jogos diferentes, com dois adversários diferentes.

### 2.3 DECISÃO: o blog serve **APENAS o prestador**. Uma audiência, um blog.

Não "duas seções", não "dois hubs". Motivos:

1. **Tráfego de dono de casa não converte em SaaS.** Ele chega, lê o preço, e vai embora procurar um
   técnico que a OLLI não tem pra oferecer. Custo de aquisição real: negativo (consome crawl budget,
   piora taxa de conversão do site, e ainda derruba a média de engajamento nas páginas de dinheiro).
2. **O adversário é impossível hoje.** Brigar por "quanto custa X" contra Triider e portais de notícia
   com um site de 10 URLs e zero backlink é queimar 6 meses de escrita.
3. **Dois públicos no mesmo domínio confundem a entidade.** O Google (e as IAs) estão aprendendo agora
   o que é "OLLI". Metade do conteúdo dizendo "somos ferramenta pra técnico" e metade dizendo "veja
   quanto custa contratar um técnico" atrasa exatamente o reconhecimento que a marca ainda não tem.

**A exceção inteligente — e é ela que resolve o pedido do dono:** a família *"quanto cobrar"* é
**dual-intent**. Escrita do lado do PRESTADOR ("quanto **cobrar** por limpeza de ar-condicionado, por
BTU, com o custo por trás") ela (a) fala com o comprador, (b) pega parte da cauda de "quanto custa"
por sobreposição semântica, (c) ataca um ângulo que nenhum portal de notícia consegue escrever, porque
exige saber o custo do serviço por dentro — hipoclorito, tempo de máquina, deslocamento, imposto.
**A OLLI tem isso; a Revista Oeste não.**

### 2.4 Sobre "notícias atualizadas" — a parte que precisa ser dita ao dono

O pedido foi textual: *"notícias atualizadas"*. Resposta honesta, com fonte:

- **Google News não aceita mais inscrição.** Desde 25/04/2024 o Publisher Center não recebe submissão;
  o conteúdo é descoberto e classificado **algoritmicamente**, por relevância, proeminência,
  **autoridade** e frescor. Um blog novo, de uma marca com 0 pagante e 0 cobertura de imprensa, não
  entra em superfície de notícia por esforço de escrita.
- **Notícia exige cadência para sempre.** Um blog de notícia com 3 meses de silêncio é *pior* que
  nenhum blog: cada post carrega data visível, e uma home de blog cuja última matéria é de março
  comunica "empresa parada" para o visitante — o mesmo visitante que precisa confiar dinheiro nela.
- **Conteúdo perene não apodrece na mesma velocidade.** "Como fazer PMOC" vale em 2027; "Fabricante X
  lançou o modelo Y" vale 11 dias.

**Contraproposta (entrega o desejo do dono sem a dívida de cadência):**

1. **Categoria `regras`** — a única "notícia" que o prestador realmente precisa é mudança de norma e
   obrigação (PMOC/Lei 13.589, NR-10, ANVISA, MEI/DAS, exigência de NF). São poucos eventos por ano,
   e cada um **atualiza um post existente** (campo `atualizadoEm` + `revisarEm` no schema) em vez de
   criar um post novo que envelhece. Custo: ~4–6 revisões/ano.
2. **Ciclo anual das tabelas de preço** — os posts "quanto cobrar … em 2026" são atualizados em janeiro,
   **na mesma URL** (sem ano no slug — ver §3.3). Um dia de trabalho por ano refresca a categoria inteira.
3. **`/novidades/` do PRODUTO, fora do blog** — changelog curto ("o que entrou na OLLI este mês").
   Custo real: 20 min/mês. É o que satisfaz o instinto de "site vivo" sem prometer redação.

**Se, mesmo assim, a decisão for fazer notícia:** o gate mínimo é **1 post/semana durante 6 meses,
com dono definido**. Sem esse compromisso escrito, não construir a categoria — categoria abandonada é
prejuízo, não neutro.

---

## 3. TAXONOMIA E MODELO DE URL

### 3.1 Regra estrutural: **um eixo na URL, o resto é faceta**

O erro clássico é `/blog/[categoria]/[slug]/`. Ele parece organizado e cobra caro: no dia em que um post
muda de categoria (e vai mudar), a URL muda, e você paga 301 + perda de sinal. O Produttivo — o maior
blog do nicho em pt-BR, com **41 páginas de paginação** — usa exatamente o modelo plano:
`/blog/[slug]/` para post e `/blog/category/[cat]/` para categoria. Não é coincidência.

```
/blog/                                  índice (paginado)
/blog/2/                                paginação
/blog/[slug]/                           POST — slug plano, sem categoria, sem data, sem ano
/blog/categoria/[categoria]/            faceta 1: a categoria (6 fixas)
/blog/categoria/[categoria]/2/          paginação da categoria
/blog/rss.xml                           feed
```

**Não existe `/blog/oficio/[oficio]/`** — e aqui eu discordo do `LANDING_BRIEF`, que previa
`blog/oficio/[oficio]`. Motivo: `/para/[oficio]/` **já existe**, já tem `FAQPage`, `BreadcrumbList`,
as calculadoras reais e o CTA. Criar uma segunda página por ofício listando posts é fabricar um
concorrente interno magro para a página que converte. **O ofício vira um campo do post, e os posts
daquele ofício aparecem numa seção dentro de `/para/[oficio]/`.** Um só destino por ofício, mais forte
a cada post publicado — e o link interno nasce de graça, nos dois sentidos.

### 3.2 As 6 categorias — recortadas por TRABALHO, não por assunto

Categoria por assunto ("ar-condicionado", "elétrica") duplica o eixo de ofício e racha o blog em
categorias magras. Por trabalho, aguenta 100 posts:

| slug | Nome | O que entra | Teto saudável |
|---|---|---|---|
| `documentos` | Documentos e modelos | orçamento, OS, recibo, contrato, laudo, aprovação, assinatura | ~20 |
| `precificacao` | Preço e precificação | quanto cobrar, tabela por serviço, hora técnica, margem, reajuste | ~20 |
| `gestao` | Gestão do serviço | cobrança, follow-up, agenda, cliente sumido, primeiro funcionário | ~20 |
| `ferramentas` | Ferramentas e apps | listicles, comparativos, planilha × app, o que cada app resolve | ~15 |
| `tecnico` | Guias técnicos | código de erro, BTU, carga de gás, disjuntor, tinta, diagnóstico | ~25 |
| `regras` | Normas e obrigações | PMOC/Lei 13.589, NR-10, ANVISA, MEI/NF, LGPD | ~15 |

**Regra de sobrevivência (é gate, não estilo):** *nenhuma categoria vai ao ar com menos de 4 posts.*
Enquanto tiver 1–3, a categoria não gera rota nem entra em menu nenhum. Categoria com 1 post é página
magra — dano de indexação, não organização.

### 3.3 Campos do post: o que é obrigatório e por quê

| campo | tipo | por quê |
|---|---|---|
| `titulo` | string ≤ 60 chars | vira `<title>` + `og:title` |
| `descricao` | string 120–158 chars | vira `<meta description>`; **obrigatório**, sem fallback silencioso |
| `categoria` | enum das 6 | 1 só por post — post em 2 categorias é post mal recortado |
| `oficio` | enum de `VerticalId` \| `'todos'` | **validado contra `VERTICAIS`** (ver §4.2): typo quebra o build, igual `SLUG_POR_OFICIO` |
| `publicadoEm` | date | `datePublished` do schema |
| `atualizadoEm` | date opcional | `dateModified` + `lastmod` do sitemap. **É o campo mais barato de frescor que existe** |
| `revisarEm` | date opcional | só p/ `regras` e `precificacao`; não vai pro HTML, serve de alarme editorial |
| `capa` + `capaAlt` | `image()` + string | alt obrigatório no schema = impossível publicar imagem sem alt |
| `destaque` | boolean | ordena o índice sem inventar "trending" |
| `rascunho` | boolean (default `false`) | post com `true` não gera rota nem entra em sitemap/RSS |

**Sem `autor` por enquanto** — hoje só existe uma pessoa escrevendo. Inventar 3 autores fictícios pra
parecer redação é exatamente a categoria de mentira que esta casa já recusou 5 vezes (ver o cabeçalho de
`web/src/data/oficios.ts`). Quando houver segunda pessoa real, entra `autor` + `Person` no schema.

**Sem data e sem ano no slug.** `/blog/quanto-cobrar-limpeza-ar-condicionado/` — não
`.../2026/...` nem `.../quanto-cobrar-limpeza-2026/`. O ano vive no `<title>` e no corpo (onde ajuda
citação por IA) e é atualizado em janeiro **sem trocar a URL**.

---

## 4. COMO CONSTRUIR EM ASTRO (nível de implementação)

Stack detectada, sem inventar dependência: **Astro 7.0.7**, `@astrojs/react` 6, `@astrojs/sitemap` 3.7,
Tailwind 4 via plugin do Vite, `motion` 12, `@sentry/astro` 10.66. Não há `@astrojs/mdx`, não há
`@astrojs/rss`, não há `src/content.config.ts` em `web/` (o `web/.astro/content.d.ts` é só tipagem
gerada, e `web/src/content/` **não existe** — as coleções de ajuda/legal são módulos TS na raiz do app).

**Dependência nova necessária: exatamente uma** → `@astrojs/rss`. Nada mais.
**Não instalar `@astrojs/mdx`** (ver §6).

### 4.1 Arquivos a criar

```
web/src/content.config.ts                    ← config das coleções (Astro 5+; nome exato)
web/src/content/blog/*.md                    ← os posts (Markdown puro)
web/src/content/blog/_capas/*.webp|jpg       ← capas, coladas ao conteúdo (o `_` mantém fora de rota)
web/src/pages/blog/index.astro               ← índice paginado
web/src/pages/blog/[...page].astro           ← /blog/2/, /blog/3/  (ou paginate no index)
web/src/pages/blog/[slug].astro              ← o post
web/src/pages/blog/categoria/[categoria]/[...page].astro
web/src/pages/blog/rss.xml.ts                ← feed (mesmo padrão do llms.txt.ts, que já funciona)
web/src/layouts/PostLayout.astro             ← ou props novas no Layout.astro (ver §4.5)
web/src/components/CardPost.astro
```

### 4.2 `content.config.ts` — schema que não deixa publicar errado

```ts
// web/src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { VERTICAIS } from '../../src/services/verticais';   // MESMA fonte da landing

// Os ids reais das verticais + 'todos'. Igual ao truque do Record exaustivo de
// SLUG_POR_OFICIO: ofício que não existe no app não compila.
const OFICIOS = [...VERTICAIS.map((v) => v.id), 'todos'] as const;

const CATEGORIAS = ['documentos', 'precificacao', 'gestao', 'ferramentas', 'tecnico', 'regras'] as const;

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: ({ image }) => z.object({
    titulo: z.string().max(60),
    descricao: z.string().min(120).max(158),   // trava dura: não passa description ruim
    categoria: z.enum(CATEGORIAS),
    oficio: z.enum(OFICIOS as unknown as [string, ...string[]]),
    publicadoEm: z.coerce.date(),
    atualizadoEm: z.coerce.date().optional(),
    revisarEm: z.coerce.date().optional(),
    capa: image(),
    capaAlt: z.string().min(10),               // alt vazio não passa no build
    destaque: z.boolean().default(false),
    rascunho: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

Notas de versão (confirmadas na doc atual): o arquivo é **`src/content.config.ts`**; o loader é
`glob({ base, pattern })`; a renderização é a função **`render(entry)`** importada de `astro:content`
(não mais `entry.render()`); a entrada expõe `id` e `data`.

**Astro 7.1** (16/07/2026) trouxe `deferRender: true` no loader, que adia a renderização do Markdown e
baixa o pico de memória do sync, e a flag experimental `collectionStorage: "chunked"`. **Nenhum dos dois
é necessário agora** — são para coleções grandes (o corte citado é 10 MB). Com 30 posts, ignorar.
Anotado aqui só pra ninguém "descobrir" e ligar sem motivo.

### 4.3 Rotas: índice, paginação e categoria

```astro
---
// web/src/pages/blog/[...page].astro   (cobre /blog/ e /blog/2/)
import { getCollection } from 'astro:content';
import type { GetStaticPaths } from 'astro';

export const getStaticPaths = (async ({ paginate }) => {
  const posts = (await getCollection('blog', ({ data }) => !data.rascunho))
    .sort((a, b) => b.data.publicadoEm.valueOf() - a.data.publicadoEm.valueOf());
  return paginate(posts, { pageSize: 12 });
}) satisfies GetStaticPaths;

const { page } = Astro.props;
---
```

- O filtro `!data.rascunho` tem que estar em **todos** os `getCollection` (índice, categoria, RSS, e a
  seção dentro de `/para/[oficio]/`). Rascunho que vaza é o "erro vira vazio" na versão editorial.
- `page.url.prev` / `page.url.next` já saem prontos do `paginate()` — usar `<link rel="prev|next">`
  **não** é mais sinal pro Google, mas o `<nav>` visível com âncora real é o que faz o crawler andar.
- Categoria: mesmo arquivo, dentro de `pages/blog/categoria/[categoria]/[...page].astro`, com
  `getStaticPaths` gerando **só as categorias com ≥ 4 posts** (a regra do §3.2 vira código, não disciplina):

```ts
const porCategoria = Object.groupBy(posts, (p) => p.data.categoria);
return Object.entries(porCategoria)
  .filter(([, lista]) => (lista?.length ?? 0) >= 4)
  .flatMap(([categoria, lista]) => paginate(lista!, { params: { categoria }, pageSize: 12 }));
```

### 4.4 A ponte com `/para/[oficio]/` (o link interno que nasce de graça)

Dentro de `web/src/pages/para/[oficio].astro`, depois da FAQ e antes de "outros ofícios":

```ts
const postsDoOficio = (await getCollection('blog', ({ data }) =>
  !data.rascunho && (data.oficio === id || data.oficio === 'todos')
)).sort(/* recentes primeiro */).slice(0, 4);
```

Efeito: cada post novo fortalece a página de dinheiro do seu ofício, e cada página de ofício vira porta
de entrada pro blog. Os dois sentidos, sem nenhuma página nova. **Se `postsDoOficio.length === 0`, a
seção inteira não renderiza** — mesmo padrão que a página já usa em `{calculos.length > 0 && (...)}`.

### 4.5 O post: layout, schema e `og:type`

`Layout.astro` hoje força `og:type="website"` (`:108`) e não tem como um post declarar
`article:published_time`. Duas saídas — prefira a primeira:

1. **Adicionar props opcionais ao `Layout.astro`** (`tipoOg?: 'website' | 'article'`,
   `publicadoEm?`, `atualizadoEm?`, `imagem?`). Mantém **um** cabeçalho pro site inteiro, que é
   exatamente o motivo de o `Header`/`Footer` terem sido unificados. Esforço **P**.
2. Criar um `PostLayout.astro` que embrulha o `Layout` — só se (1) virar cirurgia grande.

**JSON-LD do post** — mesmo princípio já adotado na casa (serializar do MESMO dado que a tela mostra,
`index.astro:208-223`), passado via a prop `schemas` que o Layout já aceita:

```ts
const schemaPost = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.data.titulo,                 // ≤ 110 chars
  description: post.data.descricao,
  datePublished: post.data.publicadoEm.toISOString(),
  dateModified: (post.data.atualizadoEm ?? post.data.publicadoEm).toISOString(),
  inLanguage: 'pt-BR',
  image: new URL(capaOtimizada.src, Astro.site).href,
  mainEntityOfPage: { '@type': 'WebPage', '@id': Astro.url.href },
  publisher: { '@id': `${ORIGEM}#organizacao` },   // reusa o nó que Layout.astro já declara
  isPartOf: { '@id': `${ORIGEM}#organizacao` },
};

const schemaBreadcrumb = {          // idêntico ao de [oficio].astro:98-105, 3 níveis
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'OLLI',      item: ORIGEM },
    { '@type': 'ListItem', position: 2, name: 'Blog',      item: `${ORIGEM}/blog/` },
    { '@type': 'ListItem', position: 3, name: post.data.titulo, item: Astro.url.href },
  ],
};
```

`publisher: { '@id': ... }` **reaproveita** o nó `Organization` que o Layout já emite em toda página
(`Layout.astro:50`). Redeclarar a organização inteira dentro do post cria dois nós concorrentes.

**Não usar `NewsArticle`.** É `BlogPosting`. E **nunca** `aggregateRating`/`Review` inventado — a mesma
regra que fez o `SoftwareApplication` sair sem rating (`Layout.astro:35-37`).

Onde a pauta tiver um bloco de perguntas de verdade na tela, **repetir o padrão do
`[oficio].astro:149-157`**: serializar o `FAQPage` do mesmo array. Só onde existir o bloco visível.

### 4.6 Imagem de capa — o item que mais estraga LCP

Alvo do público: Android intermediário, 4G na rua. Regras:

- Capa em `src/content/blog/_capas/` (dentro de `src/`, **não** em `public/`): assim o Astro otimiza.
  `public/og-image.png` está lá justamente por precisar de URL fixa — e pesa **239 KB**, que é o que
  acontece quando a imagem escapa do pipeline.
- No post, usar `<Picture>` de `astro:assets` com `formats={['avif','webp']}` e `widths` explícitas.
  `alt` é obrigatório pelos componentes do Astro — e `capaAlt` já é obrigatório no schema (§4.2), então
  são duas travas.
- **Orçamento de peso: ≤ 90 KB para a capa em AVIF na maior largura servida.** Acima disso, corta.
- **A capa não pode ser o LCP acima da dobra no post.** O LCP deve ser o `<h1>`, que é texto e chega no
  primeiro byte. Capa entra abaixo do título com `loading="lazy"` — exceto se o design a colocar no topo,
  e aí ela vira `loading="eager"` e o orçamento cai pra 60 KB.
- **Capa no índice: `loading="lazy"` obrigatório nos 12 cards.** 12 capas eager = a listagem morre no 4G.
- **OG por post:** enquanto não existir gerador de OG, **reusar `/og-image.png`**. Uma imagem de 239 KB
  compartilhada é infinitamente melhor que 30 imagens improvisadas — e ninguém precisa dela pra ranquear.
  Gerador de OG por post é **G** e fica pra depois de existirem leitores.

### 4.7 RSS

```ts
// web/src/pages/blog/rss.xml.ts   — mesmo formato de endpoint que o llms.txt.ts já usa
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog', ({ data }) => !data.rascunho))
    .sort((a, b) => b.data.publicadoEm.valueOf() - a.data.publicadoEm.valueOf());
  return rss({
    title: 'Blog da OLLI — o ofício por dentro',
    description: 'Documentos, preço, norma e ferramenta para quem atende em campo no Brasil.',
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.titulo,
      description: p.data.descricao,
      pubDate: p.data.publicadoEm,
      link: `/blog/${p.id}/`,          // COM barra final — trailingSlash: 'always'
    })),
  });
}
```

- **`content:` completo no item: não.** Exigiria `sanitize-html` + `markdown-it` (2 dependências) para
  entregar o post inteiro num leitor. Com 0 leitores, é dependência sem retorno. `description` basta.
- **Autodiscovery** no `<head>` do `Layout.astro`:
  `<link rel="alternate" type="application/rss+xml" title="Blog da OLLI" href={new URL('blog/rss.xml', Astro.site)} />`
- **`trailingSlash: 'always'` e o RSS:** endpoint com extensão no nome de arquivo vira arquivo com
  extensão — evidência no próprio repo: `src/pages/llms.txt.ts` gerou **`dist/llms.txt`** (3.492 bytes),
  sem barra e sem pasta. `rss.xml.ts` → `dist/blog/rss.xml`. Não precisa de configuração especial.

### 4.8 Sitemap

`@astrojs/sitemap` **já crawleia rotas geradas por `getStaticPaths`, inclusive `[...slug]`** — os posts
entram sozinhos, sem cadastrar nada. Duas melhorias valem o trabalho (esforço **P**):

```js
// web/astro.config.mjs — dentro de sitemap({ ... })
sitemap({
  filter: (page) => !page.includes('/blog/categoria/'),   // decidir: ver nota abaixo
  serialize: (item) => {
    // lastmod por post: o dado existe (atualizadoEm ?? publicadoEm) e é o sinal
    // de frescor mais barato do arsenal. Hoje o sitemap não tem NENHUM lastmod.
    return item;
  },
})
```

Nota sobre o `filter`: páginas de categoria **devem** ficar no sitemap (são hubs reais e recebem link).
Quem **não** deve entrar é a paginação profunda (`/blog/3/`, `/blog/4/`…) — ela existe pro crawler
andar, não pra ranquear. Manter `/blog/` e `/blog/2/`, cortar do 3 em diante é um bom meio-termo.
Verificar depois do primeiro build se `/blog/rss.xml` vazou pro sitemap (hoje `/llms.txt` **não** vazou
— confirmado: `sitemap-0.xml` tem exatamente 10 `<url>`, e nenhuma é o llms.txt).

### 4.9 Conversa com o worker de assets (`site/`)

O worker serve `../web/dist` como assets estáticos. Ou seja: **rota nova = arquivo novo no dist**.
Nada a configurar no `wrangler.jsonc` para o blog existir. O que **precisa** de atenção:

1. **`_headers` (§1.4):** o gerador roda no `npm run build` e re-hasheia os inline. Blog sem script
   inline = zero hash novo = zero risco. Blog com widget inline por post = CSP estourado em silêncio.
2. **Cache:** hoje só `/_astro/*` é `immutable`. HTML do blog fica no default. Se quiser afinar,
   use **uma** regra com wildcard (`/blog/*`), nunca uma por post — o `_headers` tem **limite de 100
   regras**.
3. **`not_found_handling: "404-page"`** já está certo: `/blog/post-que-nao-existe/` devolve 404 real,
   não a home com 200. Isso importa muito mais num site com 40 URLs do que com 10.
4. **Deploy:** `cd web && npm run build` → `cd site && npx wrangler deploy` (com
   `env -u CLOUDFLARE_API_TOKEN`, conforme a regra P0 do projeto).
5. Se for corrigir o **A8** (meta-refresh → 301 real), o caminho é um `web/public/_redirects`
   — mas atenção: `_redirects` é aplicado **antes** do `_headers`, e o `_headers` é **gerado** no
   dist pelo script. Colocar `_redirects` em `public/` (copiado como está) não conflita com o
   `_headers` gerado. Esforço **P**.

---

## 5. AS PAUTAS — 34 títulos

Legenda de público: **P** = prestador (o comprador). Nenhuma pauta é escrita para dono de casa (§2.3).
"Intenção": I = informacional, T = transacional/comercial, N = navegacional.

### `documentos` — 7

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 1 | Modelo de orçamento de prestação de serviço: os 9 campos que evitam briga com o cliente | I→T | P | Ponte mais curta que existe pro produto. SERP hoje é de SaaS (Produttivo, Auvo, Contabilizei, Cobli), não de portal — adversário do mesmo porte |
| 2 | Recibo de prestação de serviço: o que torna o recibo válido (e o que anula) | I | P | Recibo é feature nativa; post ancora `/blog/` na dor final do ciclo (receber) |
| 3 | Modelo de ordem de serviço: o que muda entre elétrica, hidráulica e climatização | I→T | P | Os 10 resultados atuais são genéricos ("7 exemplos em Excel"). Recorte por ofício é a única diferenciação disponível — e a OLLI tem checklist por ofício pra provar |
| 4 | Planilha de ordem de serviço: até onde ela serve, e o dia em que ela te custa dinheiro | I | P | A SERP de "planilha ordem de serviço" é dominada por sites de planilha (Excel Solução, Guia do Excel, Smart Planilhas). Ângulo honesto ("a planilha serve até aqui") entra por um flanco que nenhum deles pode escrever |
| 5 | Aprovação de orçamento por WhatsApp vale como aceite? Como registrar direito | I | P | Dor real e não escrita por ninguém; casa 1:1 com o link de aprovação do produto |
| 6 | Contrato de manutenção mensal: modelo enxuto e as 5 cláusulas que salvam o prestador | I→T | P | Receita recorrente é o que faz o prestador virar assinante |
| 7 | Assinatura do cliente na OS: foto, print ou assinatura na tela — o que sustenta | I | P | Feature "assinatura na tela" existe e é rara no plano grátis do mercado |

### `precificacao` — 6

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 8 | Quanto cobrar por limpeza de ar-condicionado em 2026: por BTU, com o custo por trás | I→T | P | **É a exceção dual-intent do §2.3.** A SERP de "quanto **custa**" é de marketplace/portal (Triider, Portal Leo Dias, Revista Oeste); "quanto **cobrar**" é território do prestador e ninguém escreve o custo por dentro. Casa com a calculadora de BTU |
| 9 | Quanto cobrar por m² de pintura: tinta, demão, mão de obra e a margem que sobra | I→T | P | Casa com a calculadora de tinta (existe em `calculosOficio`) |
| 10 | Quanto cobrar por serviço elétrico: ponto, quadro e hora técnica | I→T | P | Ofício com 3 calculadoras reais no produto |
| 11 | Quanto cobrar por desentupimento e conserto de vazamento (com taxa de emergência) | I→T | P | Hidráulica: 4 calculadoras reais |
| 12 | Quanto cobrar por dedetização: por m², por praga e o custo do produto | I→T | P | SERP fraca; e a OLLI tem o Certificado ANVISA pronto — prova de profundidade |
| 13 | Como calcular sua hora técnica de verdade: deslocamento, imposto, ferramenta e tempo morto | I | P | **Post-pilar da categoria.** É a conta que o prestador nunca fez, e é a que justifica pagar R$ 39/mês. Nenhum concorrente pt-BR faz isso bem |

### `gestao` — 5

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 14 | 15 mensagens de cobrança pelo WhatsApp que não queimam o cliente (pra copiar) | I | P | Formato "copiar e colar" gera salvamento e link; fecha no radar de cobrança |
| 15 | Cliente sumiu depois do orçamento: o follow-up de 3 toques que fecha | I | P | Dor #1 de quem tem taxa de aprovação baixa; leva direto ao "radar de quem sumiu" |
| 16 | Quantos dos seus orçamentos viram serviço? Como medir (e o que é bom) | I | P | Ensina a métrica que só se mede dentro de um sistema — e o sistema é o produto |
| 17 | Agenda de campo: como montar a rota do dia e não perder metade no trânsito | I | P | Agenda existe; e o ETA/Routes API já está pago no Google Cloud |
| 18 | Primeiro funcionário: o que muda no processo (papel, permissão e prova do serviço) | I→T | P | Único caminho honesto de upsell pro plano Empresa (R$ 99), cuja feature real é papéis e permissões |

### `ferramentas` — 6 *(o "aplicativos e plataformas" do pedido)*

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 19 | Os 9 apps que todo técnico de refrigeração deveria ter no celular em 2026 | I | P | Listicle honesto onde a OLLI é **um** item entre ferramentas que ela não disputa (Ref Tools/Danfoss, apps de fabricante, Facilita Técnico). O nicho já tem esse formato (Auvo, ABRAVA/Revista do Frio) — e é o formato que as IAs citam |
| 20 | Aplicativo de orçamento para prestador: 7 opções comparadas, com preço na mesa | T | P | **A alavanca de GEO.** Comparativo com preço explícito é conteúdo que só quem publica preço pode escrever — e verifiquei hoje que Auvo e Field Control não publicam ("fale com um consultor"). A OLLI publica R$ 0/39/99 |
| 21 | Sistema de ordem de serviço: as 6 perguntas a fazer antes de assinar qualquer um | T | P | Mesmo flanco do #20, do lado de quem está comprando |
| 22 | Caderno, planilha ou app: o ponto exato em que a planilha começa a custar caro | I | P | Captura quem busca planilha (demanda comprovada) e move pro produto sem desqualificar o leitor |
| 23 | "Grátis" de verdade x teste de 7 dias: como saber antes de cadastrar o cartão | I | P | Posicionamento central da OLLI (Grátis sem prazo, sem cartão) virado em conteúdo |
| 24 | Apps para eletricista: cálculo, norma e orçamento — o que cada um resolve | I | P | Termo com demanda comprovada ("app para eletricista" tem concorrentes pagando por ele: InteraUp, Orderry, apps de Play Store) |

### `tecnico` — 5 *(o "coisas de ar-condicionado" do pedido)*

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 25 | Código de erro do ar-condicionado: como ler antes de subir na escada (Fujitsu, Daikin, LG, Midea) | I | P | **698 códigos de erro é o ativo mais defensável do produto.** Nenhum concorrente de gestão tem isso; quem tem são os apps de fabricante, que não fazem orçamento |
| 26 | Ar pingando, não gela ou desarmando: 12 sintomas e o provável componente | I | P | É literalmente a IA de diagnóstico do produto, escrita em prosa. Conteúdo e feature são a mesma coisa |
| 27 | Cálculo de BTU: a conta certa e por que o cliente sempre pede menos do que precisa | I | P | Calculadora real no app; e o post treina o prestador a vender o equipamento certo |
| 28 | Carga de gás: como calcular e os erros que estouram o compressor | I | P | Calculadora real; conteúdo técnico que prova que o software é feito por gente do ramo |
| 29 | Disjuntor e cabo sem errar: NBR 5410 na prática, com exemplos | I | P | As calculadoras de elétrica já carregam a norma no campo `base` — o conteúdo sai da fonte |

### `regras` — 5 *(o substituto maduro de "notícias" — ver §2.4)*

| # | Título | Intenção | Púb. | Por que a OLLI ganha |
|---|---|---|---|---|
| 30 | PMOC: quem é obrigado, o que o documento precisa ter e qual é a multa (Lei 13.589) | I | P | **Post-pilar de autoridade.** SERP disputada (Produttivo, ABRAVA, WebArCondicionado), mas é o único tema onde a OLLI tem módulo pronto — inventário, etiqueta QR, ordens na periodicidade |
| 31 | PMOC passo a passo: montando o plano de um prédio de 20 splits, do zero | I→T | P | Guia de execução (não de definição) é onde o pilar #30 é fraco no mercado |
| 32 | Certificado de dedetização: o que a ANVISA exige e o que o cliente realmente pede | I | P | Certificado ANVISA é ferramenta `disponivel: true` no produto |
| 33 | NR-10 pro eletricista autônomo: o que muda no seu serviço na prática | I | P | Alta busca por norma; **cuidado:** o checklist NR-10 está `disponivel: false` no app — o post NÃO pode prometer a ferramenta |
| 34 | MEI prestador de serviço: recibo, nota fiscal e quando o cliente exige NF | I | P | A OLLI **não** emite NF (está no `llms.txt`). O post trata disso com honestidade e ganha confiança — em vez de o prestador descobrir depois |

**Ordem de publicação sugerida (os 8 primeiros, se só der pra fazer 8):**
#13 (hora técnica), #30 (PMOC pilar), #20 (comparativo com preço), #1 (modelo de orçamento),
#25 (códigos de erro), #8 (quanto cobrar limpeza), #4 (planilha × app), #14 (mensagens de cobrança).
Cobre as 6 categorias, ativa a ponte de 3 ofícios e coloca no ar os dois formatos que as IAs citam
(listicle comparativo + pilar normativo).

---

## 6. O QUE **NÃO** FAZER

1. **Não gerar 30 posts de IA numa tacada.** A política de spam do Google define *scaled content abuse*
   como "muitas páginas geradas com o propósito primário de manipular ranking e não de ajudar usuários",
   e cita nominalmente o uso de IA generativa para isso. O critério é **propósito e valor**, não método.
   Um lote de 30 textos genéricos publicados no mesmo dia por um domínio sem histórico é exatamente o
   padrão. **Ritmo saudável: 2–4 posts/semana nas primeiras 4 semanas, depois 2–4/mês.**
2. **Não fazer blog de notícia sem dono e sem cadência escrita** (§2.4). Google News não aceita mais
   inscrição desde abril/2024 — não há atalho, e blog de notícia parado envelhece na cara do visitante.
3. **Não criar `/blog/[categoria]/[slug]/`.** Recategorizar depois = 301 em massa. Slug plano (§3.1).
4. **Não publicar categoria com menos de 4 posts.** Página magra. A regra tem que virar `filter` no
   `getStaticPaths`, não boa intenção.
5. **Não colocar ano nem data no slug.** Mata a atualização anual das tabelas de preço, que é o
   mecanismo de frescor mais barato que este blog vai ter.
6. **Não deixar a paginação virar infinita.** Sem `pageSize` e sem corte no sitemap, `/blog/17/` nasce,
   é rastreada e não ranqueia nada. Paginação existe pro crawler andar (§4.8).
7. **Não canonicalizar categoria/paginação pra `/blog/`.** É o erro clássico de "resolver duplicata":
   canonical apontando pro índice faz o Google descartar as páginas 2+ e, com elas, os posts que só são
   linkados de lá. Cada página paginada é canônica de si mesma.
8. **Não instalar `@astrojs/mdx`** enquanto os posts forem prosa. MDX traz componentes (e a tentação de
   script inline por post), e o CSP do site tem **1.338 de 2.000 caracteres** já usados — ~12 hashes de
   folga (§1.4). Markdown resolve 100% das 34 pautas.
9. **Não colocar ilha React no post.** A home já paga 149 KB gzip de JS pelo hero. O post tem que ser
   HTML + CSS. Se algum dia precisar de interação, `client:visible` — nunca `client:load`.
10. **Não usar imagem externa** (Unsplash, CDN, hotlink) nem `<iframe>` de YouTube: `img-src 'self' data:`
    e `default-src 'self'` bloqueiam, e o bloqueio é silencioso na página do leitor.
11. **Não inventar autor, redação, "equipe editorial" nem `aggregateRating`.** Mesma regra que já manteve
    o `SoftwareApplication` sem rating (`Layout.astro:35-37`).
12. **Não prometer no post o que o app não faz.** Já existe a lista do que a OLLI **não** faz em
    `llms.txt.ts:87-94` — ela é a fonte para revisar cada post antes de publicar. Casos concretos nas
    pautas: NR-10 (#33, ferramenta `disponivel: false`) e nota fiscal (#34, não emite).
13. **Não escrever para dono de casa** (§2.3), por mais tentador que seja o volume.
14. **Não medir "sucesso" em 30 dias.** O próprio `LANDING_BRIEF` já registra: orgânico de cauda longa
    3–6 meses, cabeça 6–12. O que dá pra medir em 30 dias é **publicação** (posts no ar) e
    **indexação** (URLs no Search Console), não tráfego.

---

## 7. ESFORÇO, CUSTO E ORDEM

| Bloco | O que é | Esforço | Custo real |
|---|---|---|---|
| **0. Correções de SEO que independem do blog** | A1 (title da home), A4 (rodapé → `/para/*`), A3 (`lastmod`), A2 (props de `og:type`) | **P** (~2–3 h somadas) | R$ 0. **Maior ROI do documento** — A1 e A4 sozinhos valem mais que os 5 primeiros posts |
| **1. Infra do blog** | `content.config.ts`, 4 rotas, `CardPost`, RSS, ajustes no Layout e no sitemap | **M** (~1 dia) | + 1 dependência (`@astrojs/rss`) |
| **2. Ponte `/para/[oficio]/` ↔ blog** | §4.4 | **P** (~1 h) | R$ 0 |
| **3. Dieta de JS** | `bundleSizeOptimizations` do Sentry, medido antes/depois | **P** (~30 min) | R$ 0; alvo: sair dos 48 KB gzip |
| **4. Os 8 primeiros posts** | escrita real, com dado do produto | **G** (~1 dia/post bem feito) | é aqui que mora 90% do custo, e não tem atalho honesto |
| **5. Gerador de OG por post** | imagem social automática | **G** | **adiar** até existir leitor |
| **6. `/ajuda/` artigo por URL (A5)** | quebrar a página única | **M** | adiar; blog vem antes |

**Ordem:** 0 → 3 → 1 → 2 → 4. O bloco 0 entrega resultado antes de o primeiro post existir; o 3 é
meia hora que todo post futuro agradece; e o 4 nunca "termina" — por isso os blocos técnicos vêm antes.

**Medição antes/depois (mesmos comandos desta sessão, pra comparação honesta):**
`for f in dist/_astro/*.js dist/index.html; do echo "$f $(stat -c%s $f) $(gzip -9 -c $f | wc -c)"; done`
e `awk '/Content-Security-Policy/ {print length($0)}' dist/_headers` (hoje: **1338**).

---

## 8. FONTES

Documentação técnica:
[Astro — Content Collections](https://docs.astro.build/en/guides/content-collections/) ·
[Astro 7.1 (deferRender, CSP, collectionStorage)](https://astro.build/blog/astro-710/) ·
[Astro — RSS](https://docs.astro.build/en/guides/rss/) ·
[@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) ·
[Astro — Images](https://docs.astro.build/en/guides/images/) ·
[Cloudflare Workers static assets — `_headers`](https://developers.cloudflare.com/workers/static-assets/headers/) ·
[Sentry — Tree Shaking / bundleSizeOptimizations](https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/)

Políticas e mercado:
[Google Search — políticas de spam (scaled content abuse)](https://developers.google.com/search/docs/essentials/spam-policies) ·
[Google News — Publisher Center (sem submissão desde 25/04/2024)](https://support.google.com/news/publisher-center/answer/9607025)

Composição de SERP e concorrentes, observada em 18/07/2026:
[Produttivo — blog (13 categorias, 41 páginas, `/blog/[slug]/` + `/blog/category/`)](https://www.produttivo.com.br/blog/) ·
[Produttivo — modelo de orçamento](https://www.produttivo.com.br/blog/modelo-orcamento-prestacao-de-servico/) ·
[Produttivo — PMOC](https://www.produttivo.com.br/blog/pmoc-o-que-e-como-e-feito-beneficios/) ·
[Auvo — blog: 5 aplicativos para refrigeristas](https://www.blog.auvo.com/aplicativos-climatizacao) ·
[Auvo — sistema de ordem de serviço](https://www.blog.auvo.com/post/sistema-ordem-servico) ·
[Field Control](https://fieldcontrol.com.br/) ·
[InteraUp — app para eletricista](https://interaup.com.br/app-para-eletricista/) ·
[ABRAVA/Revista do Frio — 9 apps no HVAC-R](https://abrava.com.br/9-apps-que-fazem-a-diferenca-no-hvac-r/) ·
[Danfoss Ref Tools](https://www.danfoss.com/en-us/service-and-support/downloads/dcs/ref-tools/) ·
[Triider — preços de limpeza de ar-condicionado (SERP de dono de casa)](https://www.triider.com.br/servicos-de-ar-condicionado/limpeza-de-ar-condicionado/preco) ·
[Excel Solução — planilha de OS (SERP de "planilha")](https://excelsolucao.com.br/planilha-excel-download-gratis/planilha-controle-de-ordem-de-servico-os/) ·
[Mobills — apps de controle financeiro](https://www.mobills.com.br/blog/aplicativos/apps-de-controle-financeiro/) *(confirma a armadilha do `LANDING_BRIEF`: "app de orçamento" seco cai em finanças pessoais)* ·
[ABRAVA — PMOC perguntas e respostas](https://abrava.com.br/a-abrava/pmoc-perguntas-e-respostas/)

Docs internos consultados: `docs/LANDING_BRIEF.md` (§Plano SEO, §Plano GEO, §Blog — pautas seed, §Ordem
de construção), `docs/ENXAME/MISSAO.md`.
