# IDENTIDADE — APP vs SITE

> Queixa do dono: *"o aplicativo está muito diferente do site"*. Este documento mede a
> diferença em número, diz qual das três linguagens é a boa, e propõe a convergência em
> ordem de (impacto visual)/(risco) — dizendo também **o que não deve convergir**, porque
> um app usado com luva e sol na tela tem exigência que uma landing não tem.
>
> **Custo recorrente de tudo neste documento: R$ 0,00.** Nenhum item chama API, nenhum
> item depende de rede. Fontes são self-hosted (`expo-font` no app, `@fontsource` no
> painel e na landing), ícones seriam módulos JS locais, tokens são constantes. **Se a
> rede cair, nada aqui quebra** — é a única categoria de mudança do projeto que tem essa
> propriedade. O custo é hora de engenharia, e está estimado item a item (P/M/G).
>
> Leitura: 2026-07-18, worktree `app-complete-analysis-optimization-9a1912`.
> Fontes lidas: `src/theme/{cores,index,fonts,motion}.ts`, `src/components/*`,
> `webapp/src/theme/tokens/*`, `webapp/src/global.css`, `webapp/src/ui/{button,card}.tsx`,
> `web/src/styles/global.css`, `web/src/pages/index.astro`, `web/src/components/*`.

---

## 0. O que o CATÁLOGO_VISUAL já não diz mais a verdade

Conferi linha a linha a tabela cross do `CATALOGO_VISUAL.md`. **Três das cinco linhas
envelheceram** — importante, porque a recomendação daquele documento ("convergir tudo pra
linguagem do app") foi escrita quando a distância era maior do que é hoje.

| Linha do CATÁLOGO | Diz | Realidade hoje |
|---|---|---|
| **Dark mode** | "painel preto/zinza + sombra preta" | ❌ **Falso.** `webapp/src/theme/tokens/color.ts:140-144` já define `navyDarkSurfaces` = `#07111F` / `#102238` / `#16304D` — **os mesmos três hex** de `SUPERFICIES.escuro` em `src/theme/cores.ts:294-298`. E `darkShadowTokens` já documenta que a elevação vem do degrau de luminosidade, não da sombra. **App e painel casam no escuro.** |
| **Status** | "painel warning #FFAB00 / error #FF5630" | ❌ **Falso.** `paletteColors.warning.default = "#D98008"` e `error.default = "#E5484D"` — idênticos ao `STATUS_BASE` do app (`cores.ts:303`). Já convergiram. |
| **Painel mistura Solar + lucide** | aberto | ⚠️ **Quase fechado.** Restam **13 referências `solar:`** em 6 arquivos de chrome (`nav/horizontal/nav-item.tsx`, `nav/mini/nav-root-item.tsx`, `nav/mini/nav-sub-item.tsx`, `layouts/components/setting-button.tsx`, `pages/sys/login/components/ReturnButton.tsx`, `nav-data-frontend.tsx`) + 2 arquivos de `_mock`. O conteúdo é lucide em 59 arquivos. |
| **Footer/Header da landing** | "4 rodapés diferentes → extrair" | ✅ **Feito.** `web/src/components/Header.astro` e `Footer.astro` existem e o `index.astro` os consome. |
| **Fontes** | "as 3 casam" | ✅ **Confirmado.** Plus Jakarta Sans no corpo + Spectral só em valor R$ nas três. |
| **Raio de botão** | "landing 8/12 · painel 6 · app 24" | ✅ **Confirmado** (medido abaixo). Continua sendo a maior divergência de forma. |
| **Ícones: app MDI** | aberto | ✅ **Confirmado.** `MaterialCommunityIcons` em **92 arquivos**, ~952 ocorrências, **196 nomes distintos**. Zero lucide no app. |

**Consequência prática:** a convergência que falta é **app → site**, não "tudo → app". O
painel já andou na direção do app onde fazia sentido (navy, status). O que sobra é a cara
do app, e ela diverge do site nos eixos que o olho lê primeiro: forma, ícone e quantidade
de cor de marca na tela.

---

## 1. Onde exatamente divergem — eixo por eixo, com valor real

### 1.1 Cor

| Papel | App (`src/theme/cores.ts`) | Painel (`webapp/.../tokens/color.ts`) | Landing (`web/src/styles/global.css`) | Veredito |
|---|---|---|---|---|
| Marca primária | `#0B6FCE` | `#0B6FCE` | `#0b6fce` | ✅ **igual nas 3** |
| **Ciano de marca** | **`#34C6D9`** (`acentoBase`, cores.ts:359) | não tem acento; usa `info #00B8D9` | **`#3fd8ea`** (`--color-cyan`) | ❌ **três cianos.** E o **logo das duas pontas usa `#3FD8EA`** (`web/.../OlliLogo.astro` e `src/components/OlliLogo.tsx`). **O tema do app usa um ciano que o próprio logo do app não usa.** |
| Menta "aprovado" | não existe token (o logo tem `#2BE39A`) | não existe | `#2be39a` (`--color-mint`) | ❌ existe no logo do app, não no tema |
| Verde de ✓ legível | `success` → `#1FA971` ajustado | `success.default #1FA971` | `#0a7d4f` (`--color-check`) | ⚠️ landing usa um verde mais escuro por a11y sobre branco |
| Tinta (texto 1º) | `#0F1B2D` | `#1C252E` (gray-800) | `#0f1c2e` (`--color-ink`) | ❌ **três pretos** (app e landing quase colidem: 2 pontos de diferença em G e B) |
| Texto 2º | `rgba(15,27,45,0.64)` → ≈ `#5C6472` no branco | `#637381` (gray-600) | `#475569` (`--color-slate`) | ❌ três cinzas; o da landing é o mais escuro/contrastado |
| Texto 3º | `rgba(15,27,45,0.45)` → ≈ `#7F8794` | `#919EAB` (gray-500) | `#64748b` (`--color-muted`) | ❌ três |
| Hairline | `rgba(15,27,45,0.10)` → ≈ `#E7E8EA` (neutro morno) | `rgba(145,158,171,.20)` → ≈ `#E9ECEE` | `#e2e8f0` (`--color-line`) | ❌ o do site é mais **frio e mais forte**; o do app some antes no sol |
| Fundo da página (claro) | `#F5F7FA` | `#FFFFFF` | `#ffffff` (corpo) · `#f6f9fc` = `--color-paper` só em faixa | ⚠️ o `#F5F7FA` do app é praticamente o `paper` do site (1 ponto) — mas o site o usa como **exceção**, o app como **regra** |
| Card | `#FFFFFF` | `#FFFFFF` | `#ffffff` | ✅ |
| Escuro (3 degraus) | `#07111F`/`#102238`/`#16304D` | **os mesmos 3** | **não existe** (`color-scheme: light`, 0 classes `dark:`, 0 `prefers-color-scheme`) | ✅ app=painel · ❌ landing é light-only |
| Press/hover da marca | não tem token (press = escala + háptico) | `primary.dark #0A55A6` | `--color-brand-strong #0a55a6` | ⚠️ correto no toque; **faltando no app-desktop**, que tem mouse |

### 1.2 Tipografia

| | App | Painel | Landing |
|---|---|---|---|
| Família corpo | Plus Jakarta Sans | Plus Jakarta Sans | Plus Jakarta Sans Variable |
| Família display | Spectral (só R$) | Spectral (só R$) | Spectral (`--font-display`) |
| Maior título | `h1` = **28px / 800 / tracking 0** | — (usa escala shadcn) | `clamp(2.6rem, 6vw, 4.6rem)` = **41,6–73,6px / 800 / `tracking-tight` (−0.025em)** |
| Corpo | `body` = **14px / 400** | `default` = 16px | `text-lg` = **18px / 400 / `leading-relaxed`** |
| Rótulo de botão | **15px / peso 800** | **14px / peso 500** | **16px / peso 600** |
| Etiqueta de seção | `label` 11px / 800 / tracking **0** | — | `.eyebrow` 12px / 700 / tracking **0.12em** / uppercase / cor de marca |
| Números | **1 uso de `fontVariant`** no app inteiro | — | **19 usos de `.tnum`** (tabular) |
| Disciplina de escala | ❌ **959 declarações literais de `fontSize`, em 29 valores distintos**, incluindo **267 em meio-passo** (9.5/10.5/11.5/12.5/13.5/14.5/15.5). Só 36 arquivos tocam em `Typography` | escala shadcn (5 passos) | 6 passos + clamp fluido |

O item mais grave dessa tabela não é o tamanho — é a **última linha**. O app não tem escala
tipográfica na prática: tem 29 tamanhos, sete deles fracionários. Isso é o que faz uma tela
parecer "montada à mão" ao lado de uma página que tem seis passos.

### 1.3 Raio

| Superfície | App | Painel | Landing |
|---|---|---|---|
| Escala | `sm 12 · chip 14 · md 18 · lg 24 · xl 30 · xxl 36 · full 999` | `--radius: 0.5rem` → `sm 4 · md 6 · lg 8 · xl 12` | Tailwind v4 default → `md 6 · lg 8 · xl 12 · 2xl 16 · 3xl 24` ([docs](https://tailwindcss.com/docs/border-radius)) |
| Botão | **24px** (`BorderRadius.lg`, OlliButton:124) | **6px** (`rounded-md`, button.tsx:8) | **12px** hero / **8px** header |
| Card | **24px** (OlliCard:42) | **12px** (`rounded-xl`, card.tsx) | **16px** (`rounded-2xl`, 8 ocorrências no index) |
| Header | **30px** nos cantos de baixo (GradientHeader:60-61) | — | 0 (barra reta com hairline) |
| Cobertura por token | ✅ **599 usos de token vs 114 literais (84%)** — mexer no token realmente move a UI | — | — |

### 1.4 Sombra / elevação

| | App | Painel | Landing |
|---|---|---|---|
| Card em repouso | **`md` sempre ligada**: `0 8px 16px rgba(15,27,45,0.08)`, `elevation: 6` | `shadow-sm` | **nenhuma**; só `hover:shadow-lg shadow-brand/5` |
| Botão primário | **`glowBlue` sempre ligado** (sombra colorida da marca) | nenhuma | `shadow-lg shadow-brand/25` só no CTA do hero |
| No escuro | sombra desligada (`sombraCor: transparent`), elevação por superfície | idem (`darkShadowTokens` sutis) | não existe |

### 1.5 Espaçamento e densidade

| | App | Painel | Landing |
|---|---|---|---|
| Escala | `4·8·12·16·20·24·32·48` | `4·8·12·16·20·24·28·32·40·48·64·80·96·128` | Tailwind (0.25rem) |
| Padding de card | **16px** (`Spacing.base`, default do OlliCard) | **24px** (`py-6 px-6`) | **24px** (`p-6`) / 28px (`p-7`) |
| Respiro entre seções | máx. `xxxl` 48px, usado 18× | — | **`py-20`/`py-24` = 80/96px**, 14 seções |

### 1.6 Família de ícone

| | App | Painel | Landing |
|---|---|---|---|
| Família | **MaterialCommunityIcons** (`@expo/vector-icons ^15.0.2`) | **lucide-react** (59 arq.) + 13 `solar:` restantes | **lucide** (SVG copiado byte-a-byte, `Icone.astro`) |
| Estilo do traço | glifo de fonte, muitos **preenchidos**, grade 24 densa | **contorno 2px, cantos arredondados** | idem |
| Escala | 92 arquivos, ~952 ocorrências, **196 nomes distintos** | — | 30+ nomes |
| Peso no bundle | `MaterialCommunityIcons.ttf` = **1.307.660 bytes (1,28 MB)** no `node_modules` | — | inline, ~0,4 KB/ícone |

Este é, junto com a forma, o tell visual mais forte de "produto diferente": ícone de
contorno fino (lucide) ao lado de ícone de fonte preenchido (MDI) nunca lê como a mesma
família, por mais que a cor case.

### 1.7 Linguagem de botão

| | App | Painel | Landing |
|---|---|---|---|
| Altura | `sm 40 · md 50 · lg 58` | `sm 32 · default 36 · lg 40` | header ~40 · hero ~52 |
| Raio | 24 | 6 | 8 / 12 |
| Peso do rótulo | **800** | 500 | 600 |
| Feedback | escala 0.97 + háptico (`OlliPressable`) | `transition-colors` + hover | `hover:bg-brand-strong` + `hover:-translate-y-1` nos cards |
| Variantes | 7 (`primary/gradient/success/secondary/danger/outline/ghost`) | shadcn (6) | 2 (sólido e contorno) |

### 1.8 Movimento

| | App | Painel | Landing |
|---|---|---|---|
| Tokens | `Motion` (`160/260/420/900ms`, 3 easings, stagger 55) | `tw-animate-css` | `--ease-out-soft: cubic-bezier(.16,1,.3,1)` |
| Reduced-motion | ✅ `useReducedMotion` em **22 arquivos** | parcial | ✅ bloco `@media (prefers-reduced-motion: reduce)` global em `global.css:90` |
| Só transform/opacity | ✅ salvo **4 usos de `useNativeDriver: false`** (`CountUp.tsx`, `OlliInput.tsx`, `NovoOrcamentoScreen.tsx`) | — | ✅ (`-translate-y-1`, opacidade) |
| Canvas/WebGL contínuo | ❌ nenhum (`AuroraBackground` é `Animated.View`, e **desliga sozinho na web**) | ❌ nenhum | ❌ nenhum (blobs são `blur-3xl` estáticos) |

**As três já obedecem às regras de movimento P0.** Nada neste documento propõe animação
nova; a convergência é toda estática. Duas ressalvas honestas: (a) o press-scale do
`OlliPressable` **não** consulta `useReducedMotion` — é feedback de manipulação direta, o
que é defensável, mas é uma exceção não documentada; (b) os 4 `useNativeDriver: false`
rodam no thread JS e devem ser auditados separadamente (fora do escopo deste doc).

---

## 2. Qual das três linguagens é a mais madura?

**A landing.** E não é porque o dono gostou dela — é porque ela é a única das três que toma
uma decisão e sustenta:

1. **Uma escala, poucos passos.** 6 tamanhos de texto contra 29 do app. 5 raios contra 7+114
   literais. Isso é o que produz a sensação de "sistema", e é exatamente o que falta no app.
2. **Cor de marca é escassa.** No hero da landing o azul aparece em **três lugares**: o CTA,
   uma palavra em gradiente, e o eyebrow. O resto é preto sobre branco. Escassez é o que faz
   a marca **valer** quando aparece.
3. **Hierarquia por tamanho e peso, não por caixa colorida.** O H1 de 73px carrega a tela
   sozinho. O app resolve hierarquia enfileirando superfícies coloridas.
4. **Honestidade estrutural.** Os comentários em `index.astro` (linhas 82-90, 300-310) mostram
   copy sendo derivada da fonte e schema gerado do mesmo array que a tela renderiza. Isso é
   maturidade de sistema, não de pixel.

**Mas ela não sobrevive a uma tela de trabalho densa — e isso é um problema de design
diferente.** Sendo específico, a landing hoje:

- **É light-only.** Zero `dark:`, zero `prefers-color-scheme`. Um app de campo às 21h numa
  casa de máquinas não pode ser light-only.
- **Respira 80–96px entre seções.** Num celular de 640pt de altura útil, isso é uma seção e
  meia por tela. Uma lista de 12 orçamentos ficaria com 3 rolagens.
- **Tem alvos de 40px** no CTA de cabeçalho (`px-4 py-2.5`). Passa folgado no mínimo AA de
  24×24 CSS px do [WCAG 2.2 SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
  mas fica abaixo dos 44pt que se espera de um alvo primário no toque — e muito abaixo do
  que uma luva pede.
- **Usa hairline `#E2E8F0` como única estrutura.** Sob sol direto, com brilho de tela no
  máximo e reflexo, uma linha de 1px a ~7% de contraste desaparece. A landing pode se dar
  esse luxo porque é lida no escritório; o app não.

**Portanto o alvo não é "o app vira a landing".** É: **o app adota a *gramática* da landing
(escala curta, cor escassa, hierarquia por tipo) mantendo a *ergonomia* de campo (alvo
grande, contraste alto, densidade alta, dois modos).** É isso que "casar" quer dizer aqui.

---

## 3. Plano de convergência

Ordenado por **(impacto visual) / (risco)**. Esforço: **P** ≈ até meio dia · **M** ≈ 1–3 dias ·
**G** ≈ semana+. Custo por uso em todos: **R$ 0,00**. O que quebra sem rede em todos: **nada**.

### C1 — Escala de raio: uma linha do site, 599 lugares de uma vez · **impacto ALTO / risco BAIXO · P**

`src/theme/index.ts:147-156`. A cobertura por token é de **84%** — mexer aqui move a UI de
verdade, ao contrário da tipografia (ver C3).

| Token | Hoje | Proposto | Casa com |
|---|---|---|---|
| `sm` | 12 | **10** | entre `rounded-lg` (8) e `xl` (12) |
| `chip` | 14 | **12** | `rounded-xl` |
| `md` | 18 | **12** | `rounded-xl` — o raio de card do painel |
| `lg` | 24 | **16** | `rounded-2xl` — o raio de card da landing |
| `xl` | 30 | **20** | — (header; ver C6, que provavelmente o aposenta) |
| `xxl` | 36 | **24** | `rounded-3xl` |
| `full` | 999 | 999 | inalterado |

**O que muda pro prestador:** o app deixa de parecer "arredondado demais". Card e botão
passam a ter a mesma silhueta do site. Nenhuma função muda.
**Risco:** um commit, um arquivo, reversível. Conferir os ~15 chips squircle que o
CATÁLOGO já apontou com raio chutado (10–16 literal) — eles não seguem o token e vão
destoar até serem migrados.
**Não fazer:** não descer o botão a 8px. Num alvo de 50px de altura, 8px de raio lê como
caixa de formulário de desktop; 16px mantém a silhueta tocável.

### C2 — Ciano da marca: `#34C6D9` → `#3FD8EA` · **impacto ALTO / risco BAIXO · P**

`src/theme/cores.ts:359`. O logo do app **já usa `#3FD8EA`**; o tema usa outro ciano. Isso
significa que hoje o ícone do app e o gradiente do app são de cores diferentes.

Junto: adicionar o token que falta — **menta `#2BE39A`** para "aprovado / negócio fechado"
(existe no logo do app e no `--color-mint` da landing, não existe no tema).

**O que muda:** todo gradiente de marca, glow e preenchimento de acento passa a ser
literalmente a cor do logo. É a correção mais barata de identidade do documento.
**Risco:** `accentLight` e `tabActive` passam por `ajustarParaContraste`, então um ciano
mais claro é **automaticamente escurecido** onde vira texto/ícone — o efeito aparece onde
se quer (fundo, gradiente, glow) e não vaza pro texto. **Ainda assim, rodar a suíte de
contraste depois**: `parLegivel` e `corCategoriaEmChip` dependem desse valor.

### C3 — Matar os meio-passos de tipografia · **impacto ALTO / risco BAIXO-MÉDIO · M**

**Atenção à assimetria com C1:** aqui o token *não* resolve sozinho. São **959 `fontSize`
literais** contra 36 arquivos que consomem `Typography`. Mudar `Typography` e ir embora não
muda nada na tela. A ordem certa é:

1. **Eliminar os 267 meio-passos** (9.5/10.5/11.5/12.5/13.5/14.5/15.5) arredondando para o
   passo inteiro mais próximo — sozinho, isso já retira o ar de "montado à mão". Os
   fracionários concentram-se no desktop (`PainelOS`, `PainelNovaOS`, +7 arquivos), como o
   CATÁLOGO já apontou.
2. **Piso de 12px** para qualquer coisa que seja texto lido (hoje há 28 declarações em
   9.5–10.5). A braço estendido, sob sol, 10px não é texto: é decoração.
3. **`letterSpacing` negativo nos títulos** — `h1: -0.6` (≈ −0.021em em 28px), `h2: -0.45`,
   `h3: -0.35`. A landing usa `tracking-tight` e é **de graça**: 3 linhas em `index.ts:159-161`.
4. **`Typography.label` vira o eyebrow do site**: 12px / 800 / `letterSpacing: 1.4` /
   `textTransform: 'uppercase'` / cor `primaryLight`. Já há 29 `textTransform: 'uppercase'`
   espalhados — passam a ter um token.
5. **Números tabulares** em valor R$: `fontVariant: ['tabular-nums']` (suportado nas duas
   plataformas, [RN docs](https://reactnative.dev/docs/text-style-props)). Hoje há **1 uso no
   app inteiro** contra 19 `.tnum` na landing — por isso os R$ "dançam" ao rolar uma lista.
   **Verificar antes** se o TTF da Plus Jakarta empacotado expõe a feature `tnum`; se não
   expuser, a alternativa honesta é largura mínima fixa na coluna do valor, não fingir que
   funcionou.

**O que muda pro prestador:** listas de orçamento param de tremer; títulos ganham a mesma
tensão do site. **Risco:** mexer em ~270 sítios de fontSize é trabalho mecânico com risco de
regressão de layout em telas apertadas — fazer por arquivo, com screenshot antes/depois.

### C4 — Hairline e sombra: menos borrão, mais linha · **impacto MÉDIO / risco BAIXO · P**

- `outline`: `comAlfa(tinta, 0.10)` (≈`#E7E8EA`, morno) → alvo `#E2E8F0` no claro, ou seja
  uma hairline **mais fria e mais forte**. Isso converge com o site **e ajuda no sol** — raro
  ter as duas coisas na mesma mudança.
- `OlliCard`: tirar a sombra `md` do repouso, deixar `sm`, e mover o peso para a **borda**.
  A landing não tem sombra em repouso; o painel usa `shadow-sm`. Card com borda forte e
  sombra fraca lê melhor sob reflexo do que card com sombra forte e borda fraca.
- `OlliCard.padding`: default `Spacing.base` (16) → **`Spacing.lg` (20)**. Site e painel usam
  24; 20 é o meio-termo que não custa uma linha de lista por tela.

### C5 — Ícones: MDI → lucide · **impacto ALTO / risco MÉDIO · G**

O que eu **verifiquei** (não é estimativa de memória):

- `react-native-svg@15.15.4` **já está instalado** no app. A peer dependency do
  `lucide-react-native` é `react-native-svg` **12–15** ([lucide.dev](https://lucide.dev/guide/packages/lucide-react-native)) → **encaixa, sem módulo nativo novo, sem rebuild de dev client por causa disso.**
- Licença **ISC** (ícones derivados do Feather, MIT) — [lucide.dev/license](https://lucide.dev/license). **R$ 0.**
- **Armadilha real:** o Metro **não faz tree-shaking do barrel** do `lucide-react-native` —
  `import { Wrench } from 'lucide-react-native'` pode arrastar o set inteiro. A importação
  **tem que ser por módulo**: `import Wrench from 'lucide-react-native/icons/wrench'`
  ([Optimizations](https://lucide.dev/guide/react-native/advanced/optimizations)).
- Ganho de bundle: sai `MaterialCommunityIcons.ttf` = **1.307.660 bytes** (1,28 MB brutos;
  comprimido no APK, ganho líquido realista ~0,6–0,8 MB). Entram ~196 módulos JS de
  ~0,5–1 KB. **Saldo positivo.**
- **196 nomes distintos** a mapear. **Nem todos têm equivalente 1:1** — `air-conditioner`,
  `broom`, `account-hard-hat`, `gas-cylinder` não existem em lucide. A landing **já enfrentou
  isso** e documentou as substituições em `web/src/components/Icone.astro` (ex.: disjuntor →
  `power`, botijão → `cylinder`). **Reusar esse mapa**, não reinventar.

**Caminho de menor risco:** criar `src/components/Icone.tsx` com um mapa `nome MDI → componente
lucide` (196 entradas) e fazer codemod de `<MaterialCommunityIcons name="x"` para
`<Icone nome="x"`. As 952 chamadas ficam mecânicas, a semântica não muda, e dá pra rodar em
levas de 10 arquivos com o app compilando o tempo todo.

**O que quebra se a rede cair:** nada. Ícone vira código local — hoje já é (fonte
empacotada), continua sendo.

### C6 — O `GradientHeader` em 32 telas · **impacto MÁXIMO / risco MÉDIO-ALTO · M**

Ver §4. É o salto, e é o único item deste documento que exige o dono olhar antes de rolar.

### C7 — App-desktop ganha estado de hover · **impacto MÉDIO / risco BAIXO · P**

O app-desktop (RN-web) é operado com mouse e **não tem token de hover** — porque o tema foi
escrito para toque. Site e painel têm `brand-strong #0A55A6`. Adicionar `primaryHover` ao
`Cores` e aplicá-lo nos `Pressable` do desktop fecha um buraco que hoje faz o desktop parecer
"sem resposta" ao lado do painel.

### C8 — Fechar os 13 `solar:` do painel · **impacto BAIXO / risco NENHUM · P**

Item herdado do CATÁLOGO, quase pronto. Só o chrome de navegação e 2 mocks.

---

## 3.9 O que **NÃO** deve convergir (e por quê)

Esta seção vale tanto quanto a de cima. Convergir cegamente **piora** o produto.

| Não converger | Valor do site | O que aconteceria no app |
|---|---|---|
| **Alvo de toque** | CTA de header 40px (`px-4 py-2.5`) | Já temos `OlliButton size="sm"` com **`minHeight: 40`** — e isso já está **abaixo** dos 44pt esperados de um alvo primário. A convergência aqui é **na direção oposta**: subir `sm` de 40 → **44**. Copiar a compacidade do site do lado de dentro do app é a mudança mais fácil de fazer e a mais cara de descobrir, porque só aparece com luva. |
| **Respiro de seção** | `py-20`/`py-24` = 80–96px | Numa tela de 640pt, 96px de respiro entre blocos custa ~1,5 item de lista por rolagem. O prestador está com o cliente esperando. **Manter `Spacing` do app** (máx. 48). |
| **Corpo de 18px** | `text-lg` + `leading-relaxed` | Subir o corpo de 14 → 18 no app tira ~25% das linhas por tela. **Não subir o corpo — subir o piso** (nada abaixo de 12) e matar os meio-passos. São coisas diferentes. |
| **Peso 600 no botão** | rótulo `font-semibold` | Texto mais pesado sobrevive melhor a brilho e reflexo. Se for mexer, **800 → 700**, não 600. E medir no sol antes. |
| **Página branca pura** | `body: #ffffff` | O app usa `#F5F7FA` de fundo com card `#FFFFFF` — é isso que dá **afordância de card**. Página branca com card branco precisa de sombra ou borda forte pra existir, e sombra é o que estamos tirando em C4. **Manter o fundo cinza**; só alinhar `#F5F7FA` → `#F6F9FC` (o `--color-paper` exato do site). |
| **Sombra colorida** | `shadow-lg shadow-brand/25` | Já existe no app (`glowBlue`), já é desligada no escuro (correto). **Não espalhar**: custa fill-rate em Android barato e, sob sol, sombra colorida lê como borrão, não como elevação — o que o próprio `cores.ts:441` já documenta. |
| **Light-only** | `color-scheme: light` | Trabalho noturno, casa de máquinas, forro, porão. **O app mantém os dois modos.** A convergência que falta aqui é a **inversa**: a landing é que deveria ganhar escuro (o dono já pediu tema auto+toggle — ver memória `olli-landing-visao-e-ideias`). |
| **Hover como feedback principal** | `hover:-translate-y-1`, `hover:border-brand/40` | Não existe hover no dedo. O app já resolve com escala + háptico, que é o certo. Aplicar hover **só** no app-desktop (C7). |
| **Blobs `blur-3xl` atrás de tudo** | radiais no hero | Em CSS custa quase nada; em RN não há blur primitivo e o `AuroraBackground` já **se desliga sozinho na web** para não travar o login. **Manter a aurora restrita** a telas de marca (Entrar, Onboarding, vazios) — **nunca atrás de formulário ou lista**, que é a regra 7 do gate e continua valendo. |
| **Hairline como única estrutura** | `border-line` e nada mais | Sob sol, 1px a ~7% de contraste some. No app, a linha precisa ser **mais forte** (C4) e ainda assim acompanhada de degrau de superfície. |

---

## 4. O salto: se só uma coisa pudesse mudar

**O `GradientHeader`.**

`src/components/GradientHeader.tsx` é usado em **32 das 41 telas**. Ele pinta os primeiros
~120px de quase toda tela do app com: gradiente saturado da marca, **dois orbes de glow**
(`rgba(52,198,217,0.13)` e `rgba(11,111,206,0.16)`), cantos inferiores de **30px**, título
branco 22px peso 800, e um chip translúcido de voltar.

O site **nunca** faz isso. Ele abre branco, com uma barra fina `bg-white/80 backdrop-blur-lg`
e uma hairline embaixo, e o texto é preto.

### Por que é *este* o salto, e não os ícones

Por **proporção de área de cor de marca**. No app, o azul saturado ocupa ~15% de cada tela,
sempre, em toda tela. No site, o azul ocupa talvez 3% (o CTA, uma palavra em gradiente, o
eyebrow). O olho reconhece "mesma linguagem de design" pela **quantidade e disciplina da
cor** muito antes de reconhecer pelo desenho do ícone. Trocar 952 ícones e manter o banner
azul em 32 telas ainda deixaria dois produtos diferentes; fazer o inverso já casa.

E há um efeito colateral: o modo claro do app hoje **não parece claro**, porque a primeira
coisa que ele mostra é uma faixa azul-escura. Aposentar o banner é o que faz o modo claro
existir de verdade.

### A execução concreta

Adicionar `variant?: 'marca' | 'papel'` ao `GradientHeader`. A assinatura para os 32
chamadores não muda — só ganham uma prop opcional.

- **`marca`** (o comportamento de hoje) fica em **~6 telas**: Home, Entrar, Onboarding,
  Planos, Assinatura, Créditos. Ou seja: onde a tela **é sobre a marca ou sobre dinheiro
  entrando**. Exatamente a mesma escassez do site.
- **`papel`** (novo) nas **~26 restantes**: fundo `cores.surface`, borda inferior de 1px em
  `cores.outline` (a hairline reforçada de C4), **sem** orbes, **sem** raio nos cantos,
  título em `cores.onSurface` a 22px/800 com `letterSpacing: -0.45`, subtítulo em
  `cores.onSurfaceVariant`. A marca sobrevive na tela como cor do controle primário e do
  ícone ativo — nada mais.

**Cuidado de contraste que muda junto:** hoje o título usa `gradientes.sobreHeader` e o
subtítulo passa por `sobreSecundario()` contra as duas pontas do gradiente. Na variante
`papel` isso vira `onSurface`/`onSurfaceVariant`, que **já são auditados** contra as
superfícies nos dois modos — é uma simplificação, não um novo risco.

**Cuidado de toque:** o botão de voltar hoje é um chip translúcido de **44×44** com borda
(`GradientHeader.tsx:88-100`). Ao perder o fundo do gradiente, ele **não pode virar só um
chevron solto**: manter os 44×44 e a borda em `cores.outlineDark`, senão o alvo mais usado
do app fica invisível no sol.

**Ganho grátis:** saem 26 `LinearGradient` do primeiro paint.

### Por que fazer isso com o dono na sala

Este é o único item do documento que **muda a cara** do produto, não o acabamento. É
perfeitamente possível que ele goste do banner azul — foi ele que aprovou o handoff cockpit.
Então a recomendação honesta é:

> Implementar a variante `papel`, aplicá-la em **3 telas** (Orçamentos, Clientes, Agenda),
> e mostrar lado a lado com as outras 29. **Não virar 26 telas num commit.**

Se ele aprovar, o resto é mecânico (uma prop por tela). Se não aprovar, o custo foi um dia e
o app fica exatamente como está — e aí a segunda melhor aposta para "parecer o site" passa a
ser **C1 + C2 + C5** (raio, ciano do logo, ícones lucide), nessa ordem.

---

## 5. Sequência recomendada

| Onda | Itens | Esforço | Pode rodar sem decisão do dono? |
|---|---|---|---|
| **A** | C2 (ciano `#3FD8EA` + menta) · C4 (hairline/sombra/padding) · C8 (solar do painel) · alvo `sm` 40→44 | P | ✅ sim — são correções de identidade e de campo |
| **B** | C1 (escala de raio) · C3.3/C3.4/C3.5 (tracking, eyebrow, tabular) | P–M | ✅ sim, reversível em 1 commit |
| **C** | C3.1/C3.2 (matar 267 meio-passos, piso 12px) · C7 (hover no desktop) | M | ✅ sim, mas por arquivo com screenshot |
| **D** | **C6 — variante `papel` em 3 telas para o dono ver** | M | ⛔ **decisão dele** |
| **E** | C5 (196 ícones → lucide, via `Icone.tsx` + codemod) | G | ✅ sim, mas só depois de D (se o header mudar, o peso do ícone muda de leitura) |

---

## 6. Conferência contra as regras P0 de movimento

| Regra | Situação |
|---|---|
| Animar só `transform`/`opacity` | ✅ nada de novo é proposto. Pendência **pré-existente**: 4 `useNativeDriver: false` (`CountUp`, `OlliInput`, `NovoOrcamentoScreen`) |
| Respeitar `prefers-reduced-motion` | ✅ `useReducedMotion` em 22 arquivos; landing tem o bloco global. Exceção não documentada: press-scale do `OlliPressable` |
| Sem canvas/WebGL contínuo atrás de formulário/tabela | ✅ nenhuma das 3 superfícies tem; `AuroraBackground` é `Animated.View` e se desliga na web. **§3.9 proíbe explicitamente relaxar isso para "parecer o site"** |
| Área de toque mínima | ⚠️ **achado**: `OlliButton size="sm"` = `minHeight: 40`. Proposta em C-onda A: **44** |
| Não usar animação para esconder lentidão | ✅ nada proposto aqui é animação |
