# LANDING_3D_E_TELAS — telas reais no hero, veredito sobre 3D e vídeo

> Escopo: **só `web/`** (Astro 7.0.7 + Tailwind 4, servido na raiz `olliorcamentos.online` pelo worker `olli-site`).
> **Este documento não altera código.** Outra onda está editando `web/` nesta janela (troca de fonte).
> Complementa `docs/ENXAME/LANDING_MOTION.md` (mecanismo de movimento) e `docs/LANDING_BRIEF.md` (§3D/perf).
> Onde eu confirmo ou discordo de decisão anterior, digo qual e por quê.

---

## 0. Veredito em sete linhas

1. **As telas do hero NÃO são reais.** São redesenhadas à mão em HTML/SVG dentro de `HeroDevices.tsx` (~710 linhas). O dono está certo em querer as de verdade — hoje a landing mostra uma *ilustração* do produto, não o produto.
2. **Dá para capturar as telas de verdade, e a infraestrutura já existe no repo** — Playwright 1.61.0 em `devDependencies`, `scripts/qa-web.mjs` já dirige o app real no browser, `preview/iphone-lab.html` já enquadra o app num iPhone 393×852. Não é projeto novo: é estender dois scripts que já rodam.
3. **"TODAS as telas" são ~100** (40 mobile + 21 desktop + 39 do painel). Cem telas numa landing não é prova, é ruído. Proponho **9** — recorte em §2.1, com o argumento para dar ao dono.
4. **Risco de vazamento é assimétrico e isso mudou o desenho do pipeline:** o **app é local-first (SQLite no browser)** → captura sem login, banco vazio, dado fictício semeado por nós, **risco zero**. O **painel é online-first (Supabase + RLS)** → exige login numa conta real da produção. São dois pipelines, não um.
5. **3D com biblioteca: NÃO.** Confirmo a decisão que já está em `docs/LANDING_BRIEF.md:114`, agora com números medidos: runtime do Spline **1,9 MB (544 KB gzip)** e **17,9 s de CPU** numa cena simples; e o **CSP que nós mesmos geramos bloqueia o Spline de qualquer jeito** (`connect-src 'self'`). O que já existe (CSS 3D + Motion) entrega o efeito.
6. **Vídeo: sim, mas não no hero.** Screencast do app real, ~20 s, sem som, com legenda queimada, `preload="none"`, atrás de um clique, **abaixo da dobra**. Auto-hospedado no worker: egress é **grátis e ilimitado**, teto de **25 MiB por arquivo**.
7. **A frase truncada dele:** a coisa que mais destrava não é uma ferramenta paga — é **ffmpeg** (não está instalado) e **uma decisão dele sobre a conta de captura**. Lista completa em §5.

---

## 1. O que existe hoje (lido no código, com números)

### 1.1 As telas do hero são desenhadas, não capturadas

`web/src/components/HeroDevices.tsx` desenha em JSX/SVG: a moldura do celular (`PhoneFrame`, com botões laterais, trilho metálico, dynamic island e brilho de vidro), a tela do app (`PhoneScreen`), a moldura do browser e a tela do painel (`BrowserScreen`, com `MENU`, `MiniStat`, `DonutStatus`, `PainelRow`). Zero `<img>`. Zero screenshot.

O próprio arquivo documenta por que chegou nesse estado (`HeroDevices.tsx:80-85`):

> "Antes aqui havia um `/olli-painel.png` que era, na verdade, a demo do template Slash: menu em inglês (Workbench, Error Page…), botão 'Join Discord' e números falsos em dólar. Estávamos anunciando o produto com a tela de outro produto."

**Isso é contexto importante e a favor do dono, não contra.** A troca por código foi a correção certa *naquele momento* — trocou uma tela mentirosa por uma honesta. Mas resolveu o problema errado: o problema era a tela ser de outro produto, não ser uma imagem. Hoje a tela é nossa e é honesta, mas continua sendo um desenho. O passo seguinte natural é a tela real.

**Um detalhe que já está desalinhado com a verdade:** o menu desenhado (`MENU`, linha 125) lista `Início · Orçamentos · Clientes · Ordens de serviço · Agenda · Quadro · Equipe`. O painel real (`webapp/src/pages/olli/`) tem também `catálogo` (produtos/serviços), `diagnóstico`, `equipamentos`, `ferramentas`, `meu-negócio`. O desenho já está **subvendendo** o produto — e vai desatualizar de novo toda vez que o painel mudar. Screenshot real não tem esse defeito: ele envelhece de forma visível e verificável, o desenho envelhece em silêncio.

### 1.2 O que a tela desenhada custa hoje

Medido por mim no `dist/` deste worktree (gzip real, não estimativa):

| Arquivo | raw | gzip | brotli |
|---|---|---|---|
| `HeroDevices.<hash>.js` | 140,2 KB | **44,3 KB** | 39,6 KB |
| `client.<hash>.js` (react-dom) | 184,1 KB | **57,2 KB** | 49,7 KB |
| `react.<hash>.js` | 8,3 KB | 3,3 KB | 2,9 KB |
| `page.<hash>.js` (Sentry) | 144,4 KB | 48,0 KB | 42,3 KB |
| `Layout.<hash>.css` | 42,2 KB | 8,5 KB | 7,3 KB |
| `og-image.png` | 239,6 KB | — (não comprime) | — |

`index.astro:291` monta o hero com **`client:load`**. Ou seja: **~105 KB gzip de JS hidratam imediatamente** (react-dom + motion + o markup desenhado) para entregar uma animação de entrada de 1 s e um parallax de mouse. `LANDING_MOTION.md` §1.3 chegou ao mesmo número por outro caminho — confirmo a conta.

**O detalhe que ninguém explorou ainda:** o hero é `aria-hidden="true"` (`HeroDevices.tsx:54`). Ele é **puramente decorativo** e o parallax só existe onde há mouse. Um `client:load` num componente decorativo e desktop-only é o pior gatilho possível: paga o custo inteiro no celular do prestador, que nunca terá mouse. Astro tem `client:media="(pointer: fine)"`, que **não baixa nada** no celular. Isso é uma linha e vale ~105 KB gzip no mobile — independente de tudo que este documento propõe. **É a coisa mais barata da lista inteira.**

### 1.3 O que o CSP permite (isto decide §3 e §4)

Gerado no build por `web/scripts/gerar-headers.mjs` e conferido em `dist/_headers`:

```
default-src 'self'
img-src    'self' data:
connect-src 'self' https://cloudflareinsights.com https://o4511745793327104.ingest.us.sentry.io
font-src   'self' data:
frame-ancestors 'none'
```

Consequências duras, que valem para qualquer proposta:

- **Não há `media-src`** → cai no `default-src 'self'` → **vídeo tem que ser servido pela nossa origem.**
- **Não há `frame-src`** → cai no `default-src 'self'` → **embed de YouTube/Vimeo/Cloudflare Stream é BLOQUEADO.** (`frame-ancestors 'none'` é outra coisa — impede que nos coloquem em iframe; não é isto.)
- **`img-src 'self' data:`** → nada de CDN de imagem externo (Cloudinary etc.) sem mexer no CSP.
- **`connect-src 'self' + 2 hosts`** → **o Spline baixa o `.splinecode` da CDN dele e seria bloqueado aqui.** Ver §3.

Qualquer uma dessas coisas é *possível* mexendo no `gerar-headers.mjs` — mas cada host novo no CSP é superfície de ataque comprada com o quê? Um vídeo institucional não paga esse preço.

### 1.4 A infraestrutura de captura já existe (não proponha do zero)

| O que existe | Onde | O que já faz |
|---|---|---|
| Playwright 1.61.0 | `package.json` devDeps | instalado, versionado |
| Driver do app real | `scripts/qa-web.mjs` | sobe chromium, abre o app em `localhost:8082`, **passa pelo onboarding sozinho** (`reachHome` clica "Começar"/"Pular"), abre "Novo orçamento", tira `page.screenshot()` em 1280×720 e 390×844 |
| Moldura de celular | `preview/iphone-lab.html` | iframe do app real em **393×852**, com troca de aparelho e modo paisagem |
| Runner do lab | `scripts/iphone-lab.mjs` (`npm run preview:iphone`) | sobe o Expo web e serve o lab |
| Export web do app | `npm run export:web` | `expo export -p web` + `fix-cf-assets.mjs` (conserta o `.wasm` do expo-sqlite) |
| Otimizador de imagem | `web/node_modules/sharp@0.35.3` | já presente via Astro → `astro:assets` gera AVIF/WebP **sem dependência nova** |

**O pipeline de captura é ~70% um `qa-web.mjs` com outro roteiro.** Isso muda a estimativa de esforço de "projeto" para "tarde".

---

## 2. PARTE 1 — Telas reais

### 2.1 O recorte: 9 telas, não 100

Contagem real: **40** telas mobile (`src/screens/*.tsx`), **21** desktop (`src/screens/desktop/`), **39** arquivos de página no painel (`webapp/src/pages/olli/`). "Todas as telas" ≈ **100 imagens**.

**Por que "todas" não vende — o argumento para dar ao dono, na língua dele:**

> Cem telas é o catálogo da fábrica. Quem chega na sua landing não quer o catálogo, quer saber se resolve o problema dele em dois minutos. Mostrar tudo tem três efeitos, todos ruins: (a) ninguém olha nada, porque não sabe onde olhar; (b) quem olha encontra a tela mais feia do produto, e é dela que ele vai lembrar; (c) a "LixeiraScreen" e a "CodigosErroScreen" na mesma esteira do orçamento aprovado dizem que você não sabe qual é o seu melhor argumento. **Vitrine de joalheria não bota o estoque na janela.** Bota seis peças e o resto está lá dentro, para quem entrar.

E há um risco específico deste produto, já documentado por outra onda: `docs/ENXAME/CATALOGO_VISUAL.md` abre dizendo que as três superfícies **"parecem produtos de empresas diferentes"** (ícones MDI vs lucide, raio de botão 8/12 vs 6 vs 24 px, dark navy vs preto). Enquanto isso for verdade, **screenshot real amplifica a incoerência** que o desenho à mão escondia — porque o desenho usa um único vocabulário visual e as telas reais não. Isto **não** é motivo para não fazer; é motivo para (a) escolher telas de superfícies que já casam e (b) não misturar app e painel lado a lado na mesma faixa até a convergência de identidade acontecer.

**O recorte proposto — as 9 que vendem:**

| # | Tela | Superfície | Por que ela vende |
|---|---|---|---|
| 1 | `VisualizarOrcamentoScreen` — orçamento aprovado | app (celular) | **A tela-herói.** É o momento do dinheiro. É o que ele mostra pro amigo. |
| 2 | `NovoOrcamentoScreen` — passo de itens | app | Prova que é rápido de montar. Mata a objeção "vai me dar trabalho". |
| 3 | `DiagnosticoIAScreen` — defeito + peça | app | **O diferencial.** Nenhum concorrente de orçamento tem isto. |
| 4 | `OrdemServicoScreen` — checklist + assinatura | app | Prova que vai além do orçamento: é o serviço inteiro. |
| 5 | `FerramentasOficioScreen` / calculadora | app | Multi-ofício visível: fala com eletricista e pintor, não só HVAC. |
| 6 | `InicioDesktopScreen` ou painel `/olli/inicio` | desktop | "Também tenho computador." KPIs + donut + recentes. |
| 7 | Kanban / `/olli/list` | desktop | O trabalho da semana num lugar só. Vende gestão, não formulário. |
| 8 | PDF do orçamento com a marca dele | artefato | **White-label.** É o argumento de upgrade pro Pro (tira a marca OLLI). |
| 9 | Link público do orçamento (visão do cliente) | portal | Fecha o ciclo: mostra o que **o cliente dele** vê. Vende profissionalismo. |

**Onde cada uma entra:**

- **Hero (1 tela):** a #1, no celular. Uma só. O hero tem um trabalho: um argumento, um CTA.
- **Faixa "várias telas vindo" (as outras 8):** a esteira que ele pediu, abaixo da dobra. Recomendo o mecanismo em §2.5.
- **Seções de recurso:** reaproveitar as mesmas 9 recortadas em detalhe, sem capturar nada novo.

**O que fazer com as outras ~90:** uma página `/telas/` (ou `/tour/`), linkada do rodapé, com a galeria completa. Custo marginal quase zero (o pipeline já capturou), satisfaz o "quero mostrar todas" **sem** pagar o preço na página que converte. Ele ganha as duas coisas.

### 2.2 O pipeline de captura (repetível)

Dois pipelines, porque as duas superfícies têm arquiteturas de dados opostas (§2.3).

#### Pipeline A — app (telas 1–5). Local-first, sem login, risco zero.

`src/database/database.ts:1` usa `expo-sqlite` + `AsyncStorage`. Na web isso vira **wa-sqlite (WASM) no browser** — é por isso que `scripts/fix-cf-assets.mjs` existe (move o `.wasm` para fora de `node_modules/` senão a Cloudflare não o publica). **O SQLite é a fonte da verdade** (`database.ts:20`: "o SQLite é a fonte da verdade"), e o boot só semeia `codigos_erro` (`database.ts:494`). Traduzindo: **perfil de browser novo = banco vazio, sem login, sem rede.**

```
1. npm run export:web                 (ou expo start --web, como o qa-web.mjs já faz)
2. chromium.launch()
   newContext({
     viewport: { width: 393, height: 852 },   // mesmo do preview/iphone-lab.html
     deviceScaleFactor: 2,                    // 786×1704 físicos — nítido em tela retina
     locale: 'pt-BR',
     timezoneId: 'America/Sao_Paulo',
     colorScheme: 'light',
     reducedMotion: 'reduce'                  // congela animação → captura determinística
   })
3. reachHome(page)                    // JÁ EXISTE em qa-web.mjs — passa o onboarding
4. semear dado fictício                // ver §2.3
5. para cada tela do roteiro: navegar → waitForSelector(âncora estável) → screenshot
6. gate de privacidade                 // ver §2.3 — falha o build se passar dado suspeito
7. sharp → AVIF + WebP + PNG fallback  // ver §2.4
8. gravar em web/src/assets/telas/ + um telas.json com legenda/alt de cada uma
```

**O que torna isto repetível de verdade (e não "rodei uma vez e ficou bonito"):**

- `deviceScaleFactor: 2` fixo — 2× é o padrão para página de marketing; sem fixar, o resultado muda com a máquina de quem roda.
- `reducedMotion: 'reduce'` — sem isso, uma captura pega o card no meio do fade e a próxima não. É a causa nº 1 de screenshot "tremido" entre rodadas.
- `locale`/`timezoneId` cravados — senão datas e moeda mudam conforme a máquina.
- **Congelar o relógio** (`page.clock` do Playwright, ou mockar `Date`): sem isso, "Boa tarde" vira "Boa noite" e o "há 2 dias" anda sozinho. Toda captura tem que sair no mesmo instante fictício.
- **Esperar âncora, nunca `waitForTimeout`** — `waitForTimeout` é o que faz o pipeline "funcionar na minha máquina". (O `qa-web.mjs` atual usa bastante `waitForTimeout`; para QA tudo bem, para captura não serve.)
- Roteiro **declarativo** (um array de `{ id, rota, esperar, recortar }`), não código imperativo por tela — senão ninguém mantém.

#### Pipeline B — painel (telas 6–7). Online-first, exige login.

`webapp/src/olli/data.ts` é explícito: *"Camada de dados do OLLI (web) — online-first, direto no Supabase. O RLS do Postgres já limita cada consulta ao tenant do usuário logado"*. **Não existe modo offline.** Capturar o painel = logar numa conta real do Supabase de produção. É outro risco e outro procedimento (§2.3).

- `webapp` roda em Vite (`npm run dev`). Login via UI ou injetando a sessão do Supabase no `localStorage` antes do `goto` (mais rápido e menos frágil).
- Viewport **1440×900, `deviceScaleFactor: 2`** (2880×1800). 1280 é apertado demais: `CATALOGO_VISUAL.md` já registra que `KpiGrid` quebra 4→2+2 em 1024 px e que `TabelaDados` fica sem indicador de overflow — capturar largo evita fotografar um bug conhecido.

#### Telas 8–9 (PDF e link público)

O PDF já tem gerador próprio (`webapp/src/olli/pdf/`) — e o commit `1f38cd3` ("PDF real do orçamento — o MESMO gerador do app, impresso pelo navegador") diz que ele é reproduzível no browser. Renderizar → `page.screenshot()` da primeira página → mesma esteira. O link público é rota do worker `olli-diagnostico` (`/o/<token>`): capturar com um token de orçamento fictício, e **verificar que o token é descartado depois** (senão a landing publica um link vivo para um orçamento real).

### 2.3 Dado fictício — como garantir, e por que são dois problemas

**Este é o ponto onde um erro é irreversível:** screenshot publicado com nome, telefone ou endereço de cliente real não se "despublica" — já foi para o cache do Google, para o Wayback, para o print de alguém.

#### App: risco estruturalmente zero (aproveite isso)

Banco local vazio + sem login = **não existe dado real acessível ao browser de captura**. Não é uma política que alguém pode esquecer de seguir; é uma propriedade da arquitetura. Só é preciso garantir o **perfil limpo**: `chromium.launch()` já usa contexto efêmero, mas o roteiro deve rodar com `--user-data-dir` temporário e apagá-lo no fim, para nunca reaproveitar um perfil onde alguém logou.

**Semear os dados fictícios — três opções, em ordem de preferência:**

| Opção | Como | Esforço | Veredito |
|---|---|---|---|
| **A. Dirigir a UI** | Playwright preenche os formulários reais (novo cliente → novo orçamento → aprovar) | **M** | **Recomendada.** O dado nasce pelo caminho real → a screenshot **prova** que o fluxo funciona. Vira teste E2E de brinde. Mais lenta de escrever, mais barata de manter. |
| **B. Módulo de seed dev-only** | `src/database/seedDemo.ts`, importado só sob flag, chamando as ~124 funções exportadas de `database.ts` | **P–M** | Boa e rápida. Risco: um seed que só existe para a captura desvia do que o app realmente produz e ninguém percebe. |
| **C. Injetar SQL no WASM** | `page.evaluate` escrevendo direto no SQLite | **P** | **Não.** Contorna toda a validação do app. Uma screenshot de um estado que o produto não consegue produzir é exatamente a mentira que o `/olli-painel.png` era. |

**O elenco fictício** — inventado, verossímil e **assinalável**. Regra: todo nome próprio publicado tem que existir num único arquivo, `web/src/data/elenco-ficticio.ts`, e ser conferível por qualquer pessoa em 10 segundos.

- Prestador: **Igor Ramalho — Ramalho Climatização** (já é o nome usado no mockup atual; mantém coerência).
- Clientes: **Clínica Vida & Saúde**, **Ar Frio Refrigeração**, **Padaria Pão Quente** (os três já estão no `HeroDevices.tsx` hoje — são fictícios e já foram ao ar; reaproveitar mantém a continuidade visual).
- Telefones: **use a faixa reservada de teste** — celulares começando com `(11) 99999-xxxx` não são "livres". Prefira números que não podem tocar em ninguém e deixe explícito no arquivo que são fictícios.
- Endereços: rua fictícia + cidade real. Nunca um CEP que exista com número.
- CNPJ/CPF: **nunca** um número válido no dígito verificador. Use um que falhe a validação de propósito (e documente isso no arquivo, senão alguém "conserta").

#### Painel: o risco real, e o gate que o contém

A conta demo (`demo@grtech.com.br`, registrada em `docs/WEB_ESTADO_E_PLANO.md:22`) é um **tenant de verdade no Supabase de produção**. O RLS garante que a captura só enxergue as linhas desse tenant — isso é uma proteção forte e vale reconhecer. Mas ela protege contra *ver o tenant errado*, não contra *o tenant certo conter dado real*. No dia em que alguém usar a conta demo para um teste com um cliente de verdade, esse nome vai para a landing na próxima captura, em silêncio.

**Duas medidas, e as duas são baratas:**

1. **Tenant de captura dedicado e descartável** — não a conta de demonstração comercial (que é usada por humanos, para outra coisa). Uma conta cujo único propósito é ser fotografada, com o elenco de §2.3 e nada mais. Separar os propósitos é o que impede a contaminação.

2. **Gate automático de privacidade — falhar o build, não avisar.** Antes de salvar cada PNG, extrair o texto visível da página e conferir contra o elenco:

   ```
   const texto = await page.evaluate(() => document.body.innerText);
   // (a) proíbe padrão sensível: CPF/CNPJ formatado, telefone BR, e-mail, CEP
   // (b) exige allow-list: todo nome próprio visível tem que estar em elenco-ficticio.ts
   // qualquer violação -> process.exit(1), sem gravar a imagem
   ```

   Isto é a regra da casa aplicada a imagem: **gate, não conselho**. E cobre o caso que a revisão humana sempre perde — o nome que aparece num toast, num autocomplete ou num histórico fora do foco do olhar. Custo: **P**. É a peça mais importante deste documento inteiro.

   Cuidado conhecido: `innerText` não vê texto dentro de `<canvas>` nem em imagem embutida. Para o painel isso hoje não é problema (DOM puro), mas se um gráfico virar canvas, o gate cega. Documentar essa limitação junto do gate.

3. **Uma conferência humana, uma vez, na primeira leva.** O gate pega o previsível; olho humano pega o resto (o avatar com foto de alguém, o print de um documento). Uma vez, não toda vez.

### 2.4 Peso, formato e LCP

**A pergunta que decide o formato:** screenshot de UI é **texto miúdo e borda dura**, não fotografia. Isso inverte o conselho usual. AVIF é ~20–30% menor que WebP e 50–70% menor que PNG na mesma qualidade percebida, **mas seu filtro suaviza detalhe fino** — em texto pequeno e linha de 1 px ele "lava" a nitidez, que é justamente o que faz a screenshot parecer produto de verdade.

**Recomendação:**

- Servir **AVIF primeiro, WebP como fallback** — via `<picture>`. AVIF está em ~94–95% dos browsers em 2026 (Chrome 85+, Firefox 93+, Safari 16.4+/iOS 16+); o resto (iOS 15 e WebViews antigos) cai no WebP e ninguém vê tela quebrada.
- **Escolher a qualidade olhando a imagem, não a tabela.** Para screenshot de UI, AVIF com qualidade agressiva demais é falsa economia: 15 KB a menos não paga uma tela que parece desfocada. Comparar q50/q60/q70 a 100% de zoom e escolher o menor que ainda tem o "R$ 2.480" cravado.
- **`astro:assets`** faz tudo isso no build com `sharp@0.35.3`, **que já está instalado**. `<Image>`/`<Picture>` do Astro gera as variantes, o `srcset`, e crava `width`/`height` (que mata CLS). **Zero dependência nova.**

**Orçamento de peso** (a validar com a primeira leva — não medi porque esta onda não gera as capturas):

| Uso | Dimensão física | Alvo |
|---|---|---|
| Hero, celular, 2× | 786×1704 | **≤ 60 KB** AVIF |
| Faixa de telas, 2× | ~600×1300 | **≤ 40 KB** cada |
| Painel desktop, 2× | 2880×1800 | **≤ 120 KB** — e servir 1× (1440×900) para viewport pequena via `srcset` |
| **Total da página** | — | **≤ 400 KB de imagem** |

**Regras de LCP — a parte onde landing bonita costuma morrer:**

- **O LCP tem que continuar sendo o H1** (texto), não a screenshot. `LANDING_MOTION.md` §0.5 já fixou "nada acima da dobra entra de `opacity: 0`" — isto é o corolário: se a imagem do hero virar o maior elemento pintado, o LCP passa a depender do download dela, e a régua sai do nosso controle.
- Se a imagem do hero for grande o suficiente para disputar o LCP: `fetchpriority="high"` + `loading="eager"` **só nela**, e nunca `lazy` (lazy no elemento LCP é um erro clássico que *piora* a métrica).
- **Todas as outras: `loading="lazy"` + `decoding="async"`**, `width`/`height` sempre presentes.
- A faixa de telas está abaixo da dobra: `lazy` nela é obrigatório, e vale um `content-visibility: auto` no contêiner.
- **Comparar contra a linha de base antes de fechar.** A troca é: ~44 KB gzip de markup desenhado saem, ~200–400 KB de imagem entram. Imagem **não bloqueia a main thread** e JS bloqueia — então o INP tende a melhorar mesmo com mais bytes. Mas isso é hipótese até medir: rodar Lighthouse mobile antes e depois e anexar os dois números. Se o LCP piorar, o recorte diminui.

> **Nota:** com as telas virando imagem, o `HeroDevices.tsx` encolhe drasticamente — sobra a moldura e o parallax. Combinado com o `client:media="(pointer: fine)"` de §1.2, o hero pode deixar de custar ~105 KB gzip no celular. **A troca por telas reais é uma oportunidade de ficar mais leve, não mais pesado** — desde que se faça as duas coisas juntas.

### 2.5 "Embaixo tem que ter várias telas vindo"

O que ele descreveu é uma esteira de telas. Três formas, com o custo real:

| Forma | Custo | Veredito |
|---|---|---|
| Marquee CSS em loop infinito | 0 KB JS, mas **anima para sempre** | **Não.** Movimento contínuo fora do controle do usuário: queima bateria, compete com a leitura e é hostil em tela densa (regras 13/14). Também obriga duplicar o DOM. |
| **Scroll-driven horizontal** (`animation-timeline: view()`) | **0 KB JS** | **Recomendada.** As telas "vêm" enquanto ele rola e **param quando ele para** — literalmente o que ele pediu, e é o mecanismo que `LANDING_MOTION.md` já escolheu para a landing inteira. Coerência de graça. |
| Carrossel com JS | 5–15 KB | Só se precisar de controle explícito. Não precisa. |

**A base tem que ser um `overflow-x: auto` com `scroll-snap` de verdade** — uma lista rolável nativa. Assim: funciona com dedo, com teclado (Tab/setas), com leitor de tela, e **sem nenhum JS**. O scroll-driven entra por cima como enfeite. Em `prefers-reduced-motion`, o enfeite some e sobra a lista rolável — que continua 100% funcional. É o "caminho sem movimento" da regra 5, e é o mesmo componente, não uma segunda implementação.

⚠️ **Armadilha já registrada:** `web/src/styles/global.css:98-101` tem uma regra cega de `prefers-reduced-motion` (`animation-duration: 0.01ms !important` em `*`). Isso **atropela scroll-driven** — `LANDING_MOTION.md` §4.3 já levantou. Quem implementar a faixa tem que resolver isso primeiro, senão a esteira nasce quebrada para quem pediu menos movimento.

**Acessibilidade — o hero de hoje é `aria-hidden="true"` e isso está certo** para um desenho decorativo. Mas **telas reais são conteúdo**: cada uma precisa de `alt` descrevendo o que ela mostra ("Orçamento de R$ 2.480 aprovado, com três serviços e botão de enviar no WhatsApp") — não "screenshot do app". É o que dá ao leitor de tela, e ao Google, o argumento de venda que a imagem carrega.

---

## 3. PARTE 2 — 3D: vale ou não?

**Veredito: 3D com biblioteca (Three.js / R3F / Spline) — NÃO. 3D com CSS — já existe e é onde investir.**

Isto **confirma** a decisão que `docs/LANDING_BRIEF.md:114` já tomou. Não é decisão nova; é a mesma, agora com números que dá para conferir.

### 3.1 O que o 3D acrescenta que uma imagem boa não acrescenta

Sendo honesto e específico — e a resposta é pouco:

| O 3D "de verdade" dá | Uma imagem bem feita + CSS 3D dá | Diferença que o prestador percebe |
|---|---|---|
| Rotação livre do aparelho | Rotação fixa e parallax de mouse | Nenhuma. Ninguém gira o celular de uma landing. |
| Iluminação reagindo em tempo real | Gradiente de vidro (já existe) e um glare ligado ao mouse | Baixa. |
| Cena com vários objetos em profundidade | Camadas com `translateZ` | Nenhuma em 2 aparelhos. |
| Modelo do produto explorável | — | **Aqui o 3D ganharia.** Mas o produto da OLLI é software: não há objeto para explorar. **Isto é o argumento decisivo.** |

3D vende quando o produto **é uma coisa** — tênis, carro, máquina. O produto aqui é uma tela. A coisa mais convincente que se pode mostrar de uma tela é **a tela**, nítida e verdadeira. É por isso que a Parte 1 vale muito mais que a Parte 2 — e por que o instinto do dono ("quero as telas do app real") é melhor que a pergunta dele ("será que faz em 3D").

### 3.2 O custo real, medido

**Spline:**
- Runtime: **1,9 MB cru → 544 KB gzip.** Sozinho, **5× toda a JS da landing hoje** (~105 KB gzip).
- **17,9 s de CPU numa cena simples, no desktop.** No Android intermediário, pior.
- CLS 0,24 sem dimensão pré-definida (quase "ruim") — porque o canvas entra sem tamanho.
- Lighthouse **nem calcula LCP** direito: o conteúdo está num `<canvas>`, que é excluído da métrica. Ou seja: **o 3D pode "melhorar" o número escondendo o problema em vez de resolver.** Isso é exatamente a regra 11 ("não use animação para esconder lentidão real"), do avesso.
- **E não roda aqui de qualquer jeito:** o viewer busca o `.splinecode` na CDN da Spline; nosso `connect-src 'self'` **bloqueia**. Para usar, teria que abrir o CSP para um host de terceiro — pagando segurança por enfeite.

**Three.js:** o módulo completo fica em ~155 KB gzip, e a biblioteca **não faz tree-shaking bem** — o caminho para um bundle pequeno é import seletivo manual, não automático. Some react-three-fiber e drei se for por R3F. Chamar de "~150 KB gzip no melhor caso" é otimista.

**A conta em 4G.** A mediana móvel brasileira é alta (265,79 Mbps, Ookla/Ministério das Comunicações, maio/2026) — e essa mediana é inflada por 5G nas capitais. O prestador deste produto está no *rabo* da distribuição: garagem, subsolo, laje, rua. O alvo de projeto correto é o preset **"Slow 4G" do Lighthouse: 1,6 Mbps / 150 ms RTT** — que o próprio Google descreve como o quartil inferior do 4G.

A 1,6 Mbps (≈200 KB/s):

| | bytes | tempo só de download |
|---|---|---|
| Landing hoje (JS) | ~105 KB gzip | ~0,5 s |
| **+ Spline runtime** | +544 KB gzip | **+2,7 s** — antes de baixar a cena, antes de executar |
| + Three.js enxuto | +150 KB gzip | +0,75 s, mais o custo de CPU |
| **9 telas em AVIF** | ~400 KB | ~2 s — **mas lazy, fora da dobra, e sem bloquear a main thread** |

**A diferença que importa não é o byte, é o que ele faz depois de chegar.** 400 KB de imagem: o decodificador trabalha fora da main thread e o usuário rola a página. 544 KB de runtime 3D: parse + compile + execução na main thread, INP no chão, e o celular esquenta. Bateria e FPS num Android intermediário é onde a diferença fica cruel — e é justamente onde não temos telemetria para descobrir tarde.

### 3.3 Acessibilidade e `prefers-reduced-motion`

Cena 3D em `prefers-reduced-motion` tem que congelar. Mas **congelar uma cena 3D é servir 544 KB para mostrar uma imagem parada** — o usuário paga o custo inteiro e recebe menos do que receberia com um `<img>`. Não existe degradação graciosa aqui; existe desperdício. Uma imagem, ao contrário, **já é** o estado reduzido: nada a desligar.

Some: `<canvas>` é opaco para leitor de tela (precisa de descrição paralela), não dá zoom de texto, e é invisível para o Google. Uma screenshot com `alt` bom é acessível e indexável de graça.

### 3.4 Onde o 3D **é** bem-vindo: o que já está lá

`HeroDevices.tsx` já faz 3D — CSS 3D, sem biblioteca: `perspective: 1200px`, `transformStyle: preserve-3d`, `rotateX/rotateY` por `MotionValue` + spring, sem `setState` por frame. **Está bem feito** e anima só `transform`/`opacity` (regra 6). O caminho de evolução é aprofundar isto, não trocar de tecnologia:

1. **Profundidade real** — `translateZ` em 3–5 wrappers (não por elemento; teto de ~20 camadas compostas).
2. **Glare dinâmico** — o gradiente de vidro do phone hoje é estático (`HeroDevices.tsx:392-399`). Ligá-lo aos mesmos `px/py` via `useTransform`: **maior ganho de percepção 3D por custo perto de zero**, porque reaproveita MotionValues que já existem.
3. **Sombra reativa** — deslocar a `box-shadow` com a rotação. Cuidado: `box-shadow` animada **não é composta** — usar uma camada separada com `opacity`/`transform`, senão vira repaint por frame (regra 6).
4. **Espessura** — uma face lateral fina com `rotateY(90deg)` vende "objeto" mais que qualquer luz.
5. **Gate `matchMedia('(pointer: fine)')`** no parallax — e, melhor, o `client:media` de §1.2, que nem baixa o código no celular.

Custo: **P–M**, zero dependência nova, e o efeito é ~90% do que o Spline entregaria neste caso específico (dois retângulos planos flutuando).

### 3.5 Se ele insistir em 3D de verdade

Não é irracional querer — só precisa ser no lugar certo. Se for, a única forma defensável:

- **Nunca no hero.** Nunca acima da dobra. Nunca atrás de formulário ou tabela (regra 7).
- Numa seção própria, **abaixo da dobra**, carregada por `IntersectionObserver` **só depois de clique explícito** ("ver em 3D") — nunca automático.
- `IntersectionObserver` pausa o `requestAnimationFrame` ao sair da viewport e **libera o contexto WebGL** ao desmontar (regra 8). Contexto WebGL vazado é a causa clássica de "o site trava depois de um tempo".
- Nada de Spline enquanto o CSP for `connect-src 'self'` — e não recomendo abrir o CSP por isso.
- Só entra com **antes/depois medido** (LCP, INP, FPS, bundle) num Android intermediário real. Se qualquer um piorar, sai.
- **Cena 3D não substitui as telas reais.** É enfeite adicional, depois. A Parte 1 tem que estar no ar primeiro.

---

## 4. PARTE 3 — Vídeo

**Veredito: screencast do app real, ~20 s, sem som, legenda queimada, `preload="none"`, atrás de clique, abaixo da dobra, auto-hospedado.**

### 4.1 As opções, com o custo honesto

| Opção | Esforço | Peso | Veredito |
|---|---|---|---|
| **Screencast do app real** (tela + legenda) | **M** | 1–3 MB | **Recomendado.** É a prova. Mostra o produto funcionando de ponta a ponta — o que nem imagem nem 3D fazem. |
| Vídeo gerado por IA | P | idem | **Não.** Vídeo genérico de "empresário sorrindo" não prova nada e cheira a template. O ativo aqui é o produto real. |
| Animação/motion graphics | **G** | 1–5 MB | Caro e envelhece a cada mudança de UI. Só depois de haver clientes pagantes. |
| **Sequência de screenshots com transição CSS** | **P** | ~0 extra | **A alternativa esperta.** Reaproveita as capturas da Parte 1, dá ~70% da sensação de vídeo por ~5% do custo. **Faça esta primeiro** e veja se o vídeo ainda é necessário. |
| Playwright `recordVideo` | **P** | — | Grava a sessão em vídeo nativamente. **Ótimo para o rascunho**, insuficiente como peça final: não expõe controle de bitrate/fps e o tamanho cai para caber em 800×800 por padrão. Serve para descobrir o roteiro sem gastar tempo de gravação manual. |

### 4.2 Hospedagem — corrigindo uma premissa do briefing

O briefing supôs que "vídeo grande no worker é caro/lento". **A parte "caro" está errada, e vale saber:** em Workers static assets, requisições a assets estáticos são **gratuitas e ilimitadas**, e **não há cobrança de egress**. Teto: **25 MiB por arquivo** — folgadíssimo para 20 s de vídeo bem codificado.

A parte "lento" **continua verdadeira, e é a que decide o desenho**: arquivo único servido como asset estático **não tem bitrate adaptativo**. Em rede ruim, o usuário espera ou trava — não existe "cair para 480p". Por isso o desenho abaixo é todo construído para que **quem não clicar não pague nada**.

Cloudflare Stream resolveria o adaptativo (US$ 5/1.000 min armazenados + US$ 1/1.000 min entregues — barato). **Mas o player dele é iframe, e nosso CSP não tem `frame-src` → bloqueado.** Custaria abrir o CSP. Para um vídeo institucional de 20 s, não vale. Reavaliar se um dia houver biblioteca de vídeos.

### 4.3 Especificação

- **Duração: 15–25 s.** Um fluxo só: *chega o pedido → monta o orçamento → cliente aprova → vira OS*. Não um tour.
- **Sem áudio.** Grande parte assiste sem som, e som exige narração, revisão e regravação a cada mudança. Sem áudio, o arquivo encolhe e o problema de autoplay desaparece.
- **Legenda queimada no vídeo** (não faixa `.vtt`): sem som, a legenda **é** o roteiro; queimada, ela nunca falha em carregar e aparece igual em todo lugar. Se um dia houver narração, aí sim `<track kind="captions">` também — acessibilidade exige a faixa de texto quando há fala.
- **Codec:** H.264/MP4 como base (toca em tudo) + WebM/AV1 como `<source>` preferencial para quem suporta. AV1 corta bytes de forma significativa em screencast (áreas grandes e estáticas).
- **Sem autoplay.** Um **pôster** (uma das telas da Parte 1, que já teremos) + botão de play. Se um dia houver autoplay, tem que ser `muted` + `playsinline` + `loop` e **só** em `(min-width: …)` e fora de `prefers-reduced-motion` — vídeo em autoplay é movimento, e a regra 5 vale para ele.
- **`preload="none"`.** Sem isso, o browser começa a puxar o vídeo e ele **compete com o LCP**. Com `preload="none"` + pôster, quem não clicar paga **só o pôster** (~40 KB).
- **Fora da dobra.** No hero, o vídeo dominaria o LCP e transformaria a página numa aposta.
- **`width`/`height` no elemento** — CLS.

**Impacto em LCP, sendo direto:** feito assim (`preload="none"`, pôster leve, abaixo da dobra), o impacto no LCP é **zero** para quem não clica — que é a maioria. Feito errado (autoplay no hero), o vídeo vira o LCP e a landing fica lenta para todo mundo, inclusive para quem não queria vídeo nenhum.

### 4.4 O melhor retorno pelo esforço

**Ordem: (1) telas reais → (2) sequência de screenshots com transição → (3) vídeo, se ainda fizer falta.**

Passos 1 e 2 usam o mesmo pipeline e resolvem quase tudo. O vídeo só ganha quando precisa mostrar *velocidade* — "olha como isso é rápido" — que imagem parada não consegue. Se a esteira de telas já convencer, o vídeo pode esperar por dados de conversão em vez de ser apostado no escuro.

---

## 5. "Se eu conectar o [X] aqui pra você" — o que destravaria de verdade

A frase dele veio truncada. Em ordem de quanto realmente destrava:

### Destrava muito

1. **`ffmpeg` instalado na máquina** — **não está** (conferi). Sem ele: não dá para converter o `.webm` do Playwright em MP4/AV1, queimar legenda, cortar, nem gerar o pôster. É grátis, é um download, e é **o bloqueio nº 1 da Parte 3**. Se ele "conectar" uma coisa só, que seja esta.
2. **A decisão dele sobre a conta de captura** — não é ferramenta, é escolha: criar um tenant dedicado só para ser fotografado (§2.3) ou autorizar o uso do `demo@grtech.com.br`. **Bloqueia a captura do painel (telas 6–7) e não tem como decidir sem ele.** É a decisão mais barata e mais urgente da lista.
3. **A logo dele em vetor (SVG/PDF) + as cores da marca** — a tela 8 (PDF white-label) é um dos argumentos de upgrade mais fortes, e ela precisa de uma marca de verdade para não parecer maquete. Se ele já tem cliente com marca, uma logo fictícia bem feita resolve — mas precisa existir.
4. **Um ofício real na frente da câmera** — o roteiro do vídeo fica muito melhor se sair de um caso verdadeiro ("o Jorge, que faz PMOC em três clínicas") do que de um caso inventado. Não precisa de dado do cliente dele: precisa de **10 minutos de conversa**. É o insumo mais barato e mais valioso da lista inteira, e nenhuma ferramenta substitui.

### Ajuda

5. **Google Search Console / acesso ao Cloudflare Web Analytics** — a landing já tem o beacon liberado no CSP e o Sentry com `browserTracing` (Web Vitals de campo de graça, como `LANDING_MOTION.md` §7.3 apontou). Com acesso, dá para dizer se a mudança melhorou ou piorou **de verdade**, em vez de discutir Lighthouse de laboratório.
6. **Decisão de domínio** (`useolli.com.br` vs `olliorcamentos.online`) — está pendente na memória do projeto. Publicar telas, OG-image e vídeo num domínio que vai mudar é retrabalho garantido em SEO e em links compartilhados.
7. **Figma** (há MCP disponível, hoje **não autenticado**) — útil para molduras de aparelho e kit de marca. Bom-de-ter, não bloqueante: as molduras podem sair de CSS, como já saem hoje.

### Não precisa (para não gastar dinheiro à toa)

8. **Licença de Spline / assinatura de 3D** — §3 diz por quê.
9. **CDN ou host de vídeo pago** — egress do Workers é grátis; o Stream esbarra no CSP e não resolve um problema que temos.
10. **Banco de imagens** — o ativo aqui é o produto real. Foto de banco enfraquece.

> ⚠️ **Aviso operacional:** vários MCPs listados no ambiente (incluindo Cloudflare e Figma) **não estão autenticados** nesta sessão, e ela é não-interativa. Autorizar exige o `claude mcp` / `/mcp` numa sessão interativa (ou as configurações de conector no claude.ai). Enquanto isso não acontecer, essas capacidades ficam indisponíveis — não é falta de ferramenta, é falta de login.

---

## 6. O que NÃO fazer

1. **Não publicar screenshot capturado com login em conta de cliente real** — nem "só para testar". Publicado é irreversível.
2. **Não pôr as ~100 telas na home.** A galeria completa vive em `/telas/`.
3. **Não adotar Spline/Three.js/R3F** — §3. E não abrir o CSP para acomodá-los.
4. **Não pôr vídeo com autoplay no hero.** Vira o LCP e afunda a página no 4G.
5. **Não usar JPEG em screenshot de UI** — "ringing" em volta de cada letra. AVIF/WebP, com fallback.
6. **Não animar `box-shadow`, `filter`, `height`, `top` na esteira de telas** — só `transform` e `opacity` (regra 6).
7. **Não fazer marquee em loop infinito** — movimento contínuo sem controle do usuário (§2.5).
8. **Não capturar sem congelar o relógio e sem `reducedMotion: 'reduce'`** — screenshots não determinísticas fazem o diff do PR virar ruído e o pipeline morre em duas semanas.
9. **Não deixar as telas envelhecerem em silêncio** — sem recaptura, a landing volta a mostrar um produto que não existe mais. Ver §7.
10. **Não mexer em `web/` nesta janela** — outra onda está editando (troca de fonte).

---

## 7. Esforço, ordem e a régua

| # | Entrega | Esforço | Depende de | Ganho |
|---|---|---|---|---|
| 0 | `client:load` → `client:media="(pointer: fine)"` no hero | **P** (1 linha) | — | ~105 KB gzip a menos **no celular**, hoje |
| 1 | Elenco fictício (`elenco-ficticio.ts`) + gate de privacidade | **P** | — | Torna tudo o resto seguro. **Faça antes da primeira captura.** |
| 2 | Pipeline A (app, 5 telas) estendendo `qa-web.mjs` | **M** | 1 | As telas reais que ele pediu |
| 3 | Hero com a tela real + `astro:assets` | **P** | 2 | Cumpre o pedido principal |
| 4 | Faixa de telas (scroll-snap + scroll-driven) | **M** | 2, e a regra cega de reduced-motion (`global.css:98`) | "Várias telas vindo" |
| 5 | Pipeline B (painel, 2 telas) | **M** | **Decisão do dono** (§5.2) | "Também tem computador" |
| 6 | Telas 8–9 (PDF white-label, link do cliente) | **P–M** | 2 | Argumento de upgrade + prova social |
| 7 | Página `/telas/` com a galeria completa | **P** | 2, 5 | "Mostrar todas" sem custar a home |
| 8 | Aprofundar o CSS 3D (glare, translateZ, espessura) | **P–M** | 3 | "Elegante" sem biblioteca |
| 9 | Sequência de screenshots com transição | **P** | 4 | ~70% da sensação de vídeo |
| 10 | Vídeo screencast | **M** | **ffmpeg** (§5.1) | A prova em movimento |

**Manutenção — a parte que decide se isto sobrevive.** Screenshot é código que vence. Sem plano de recaptura, em três meses a landing mostra um produto que não existe mais — exatamente o defeito que o `/olli-painel.png` tinha. Duas medidas: (a) o script de captura roda no `preflight` e **falha se alguma tela do roteiro não puder ser alcançada** (assim, uma mudança de UI que quebra a captura aparece no PR, não na landing); (b) recaptura a cada mudança visual grande, o que é barato porque o pipeline é um comando.

**A régua, antes de fechar qualquer levá:** Lighthouse mobile **antes e depois**, com os quatro números lado a lado — **LCP, INP, CLS e KB transferidos**. Se LCP ou INP piorarem, o recorte diminui até voltarem. "Elegante, bonito, rápido e eficaz" tem uma ordem de prioridade implícita, e nesta landing **rápido é o que sustenta os outros três** — uma landing linda que demora 6 s no 4G da rua não converte prestador nenhum.

---

## Fontes

Código e configuração deste repositório (caminhos absolutos, worktree `app-complete-analysis-optimization-9a1912`):

- `web/src/components/HeroDevices.tsx` — telas desenhadas em JSX/SVG; histórico do `/olli-painel.png` nas linhas 80-85
- `web/src/pages/index.astro:291` — `<HeroDevices client:load />`
- `web/scripts/gerar-headers.mjs` e `web/dist/_headers` — CSP efetivo
- `web/astro.config.mjs` — Astro 7.0.7, Sentry, `trailingSlash`
- `src/database/database.ts` — app local-first (expo-sqlite/AsyncStorage)
- `webapp/src/olli/data.ts` — painel online-first (Supabase + RLS)
- `scripts/qa-web.mjs` — driver Playwright existente do app real
- `scripts/iphone-lab.mjs` + `preview/iphone-lab.html` — moldura 393×852
- `scripts/fix-cf-assets.mjs` — wasm do expo-sqlite na web
- `site/wrangler.jsonc` — worker `olli-site` serve `web/dist`
- `docs/ENXAME/LANDING_MOTION.md`, `docs/ENXAME/CATALOGO_VISUAL.md`, `docs/LANDING_BRIEF.md`, `docs/WEB_ESTADO_E_PLANO.md`

Fatos do mundo (pesquisados, não de memória):

- [How to Optimize Spline 3D Scenes for Speed and Core Web Vitals — Envato Tuts+](https://webdesign.tutsplus.com/how-to-optimize-spline-3d-scenes-for-speed-and-core-web-vitals--cms-108749a) — runtime.js 1,9 MB → 544 KB gzip; 17,9 s de CPU; CLS 0,24; canvas excluído do LCP
- [three.js forum — file size when importing via NPM](https://discourse.threejs.org/t/three-js-file-size-when-importing-via-npm-and-bundling-with-webpack/8904) e [reduce bundle size for three js — pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber/discussions/812) — ~155 KB gzip do módulo completo; tree-shaking ruim
- [Cloudflare Workers — Static Assets: Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) e [Increased static asset limits](https://developers.cloudflare.com/changelog/post/2025-09-02-increased-static-asset-limits/) — 25 MiB por arquivo; requisições a assets grátis e ilimitadas, sem egress
- [Cloudflare Stream — Pricing](https://developers.cloudflare.com/stream/pricing/) — US$ 5/1.000 min armazenados; US$ 1/1.000 min entregues
- [Lighthouse — throttling docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md) — "Slow 4G": 1,6 Mbps / 150 ms RTT, quartil inferior do 4G
- [Can I use — AVIF](https://caniuse.com/avif) e [AVIF Browser Support in 2026 — iLoveAVIF](https://iloveavif.com/guides/avif-browser-support) — ~94-95% de suporte; Chrome 85+, Firefox 93+, Safari 16.4+/iOS 16+
- [PNG vs WebP vs JPG: Which Format to Use When (2026)](https://www.xconvert.com/blog/png-vs-webp-vs-jpg) e [Best Image Format for Web 2026 — WebP vs AVIF vs JPG](https://www.thecssagency.com/blog/best-web-image-format) — AVIF suaviza texto fino; JPEG faz "ringing" em texto
- [Ministério das Comunicações — Brasil registra velocidades acima da média mundial (maio/2026)](https://www.gov.br/mcom/pt-br/noticias/2026/maio/brasil-registra-velocidades-de-download-acima-da-media-mundial-e-60-do-servico-e-fornecido-por-empresas-de-pequeno-e-medio-porte) — mediana móvel 265,79 Mbps (Ookla)
- [Astro — Template Directives Reference](https://docs.astro.build/en/reference/directives-reference/) — `client:media`, `client:visible` e `rootMargin`
- [Playwright — Videos](https://playwright.dev/docs/videos) — `recordVideo` (`dir`, `size`); vídeo salvo só ao fechar o contexto; tamanho padrão reduzido para caber em 800×800
