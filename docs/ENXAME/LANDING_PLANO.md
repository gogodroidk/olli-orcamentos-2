# LANDING — PLANO DE EXECUÇÃO ÚNICO

> **Para quem implementa:** este documento basta. Ele sintetiza `LANDING_BLOG_SEO.md`,
> `LANDING_MOTION.md`, `LANDING_3D_E_TELAS.md` e `LANDING_CONFIANCA.md`, decide onde eles se
> contradizem (§3) e ordena tudo em 6 levas. Você não precisa ler os quatro — mas quando este
> documento disser "detalhe em X §Y", o detalhe está lá e vale abrir.
>
> **Escopo:** só `web/` (Astro 7.0.7 + Tailwind 4, servido na raiz `olliorcamentos.online` pelo
> worker `olli-site`).
>
> Leitura do código: 18/07/2026, worktree `app-complete-analysis-optimization-9a1912`,
> `dist/` construído às 09:46 de 18/07 (**pós-troca de fonte** — ver §0.2).

---

## 0. Antes de tocar em qualquer arquivo

### 0.1 Três avisos que economizam uma hora de confusão

1. **Os números de linha dos quatro documentos estão defasados em `index.astro`.** A onda da fonte
   adicionou 4 linhas ao arquivo. Some **+4** a toda referência: `HeroDevices client:load` está em
   `:295` (não `:291`), o card de plano com `lg:-translate-y-3` em `:473` (não `:469`), a barra de
   82% em `:427`, o container do FAQ em `:505`. Confirmado por grep hoje.

2. **O `Layout.css` já emagreceu.** Os docs citam **10.512 B gzip**; o `dist/` atual tem **8.469 B**.
   A troca Plus Jakarta+Spectral → Rubik já entregou ~2 KB. Use 8.469 como linha de base, não 10.512.

3. **A onda da fonte já fechou** (`web/package.json`, `web/src/styles/global.css`,
   `web/src/pages/index.astro` estão modificados no working tree, não commitados). **Não reintroduza
   `--font-display`/Spectral em lugar nenhum** — ela foi removida por não ser usada.

### 0.2 Linha de base medida hoje (é contra estes números que tudo será comparado)

```
dist/index.html                  raw  68.307   gzip  16.304
dist/_astro/Layout.<h>.css       raw  42.153   gzip   8.469
dist/_astro/page.<h>.js          raw 144.371   gzip  47.964   ← Sentry SDK, em TODA página
dist/_astro/client.<h>.js        raw 184.122   gzip  57.081   ← react-dom, só na home
dist/_astro/HeroDevices.<h>.js   raw 140.205   gzip  44.149   ← só na home
dist/_astro/react.<h>.js         raw   8.348   gzip   3.258
dist/para/eletricista/index.html raw  21.407   gzip   5.861
CSP no dist/_headers                             1.338 de 2.000 caracteres
fontes woff2 no dist                6 arquivos, 124.064 B (só latin 35.348 é baixado)
```

**Peso de uma primeira visita à home, hoje, no celular:** 16,3 (HTML) + 8,5 (CSS) + 152,5 (JS) +
~35 (fonte latin) ≈ **212 KB** comprimidos. Desse total, **104,5 KB de JS (react-dom + motion +
HeroDevices) existem para entregar um parallax de mouse — num aparelho que não tem mouse.**

### 0.3 Dois achados novos, que não estão em nenhum dos quatro documentos

**(a) A fonte não é pré-carregada, e o LCP é texto.** `dist/index.html` não tem nenhum
`<link rel="preload">`; os seis `@font-face` do Rubik usam `font-display: swap`. Consequência: o H1
— que é o elemento de LCP — pinta primeiro na fonte do sistema e depois troca. Em 4G da rua isso é
FOUT visível e pode mover o candidato a LCP. Pré-carregar **só o subset latin** (35.348 B) é
esforço **P** e é a única alavanca de LCP deste plano inteiro que não depende de imagem nenhuma.

Mecanismo (verificar que o caminho existe antes de escrever):
```astro
---
import rubikLatin from "@fontsource-variable/rubik/files/rubik-latin-wght-normal.woff2?url";
---
<link rel="preload" as="font" type="font/woff2" href={rubikLatin} crossorigin />
```
**Só o latin.** Pré-carregar latin-ext também (+19,4 KB) é gastar banda para acento que o corpo do
texto quase não usa. Medir os dois no Lighthouse antes de fixar.

**(b) O Rubik trouxe de volta o problema que o Spectral tinha.** O `dist` traz 6 subsets:
arabic, cyrillic, cyrillic-ext, hebrew, latin, latin-ext — **124 KB de woff2 num site pt-BR**. O
`unicode-range` impede o download dos quatro inúteis (custo em runtime ≈ 0), mas são quatro
`@font-face` mortos dentro do CSS que **toda** página carrega. É exatamente a crítica que
`LANDING_BLOG_SEO.md §1.3` fez ao Spectral, e ela voltou com outro nome. Restringir a
`latin` + `latin-ext` no import é **P**.

### 0.4 A regra de ouro deste plano

> **Bytes de JS não podem subir. Bytes de imagem podem, se forem `lazy` e abaixo da dobra.**

São orçamentos diferentes porque o custo é diferente: JS bloqueia a main thread (parse, compile,
execução, INP); imagem decodifica fora dela e o usuário continua rolando. É por isso que trocar
44 KB gzip de markup desenhado por 300 KB de AVIF pode deixar a página **mais rápida**. §4 fecha os
números.

---

## 1. A ORDEM DE EXECUÇÃO

**Critério:** primeiro o que está **errado** (mostra a coisa errada, mente, ou desperdiça), depois
o que **adiciona** (telas reais, blog), por último o que **enfeita** (3D, vídeo, galeria).

**Concordo com esse critério e proponho um refinamento dentro dele:** entre dois itens igualmente
"errados", vem primeiro o que **um visitante vê sem rolar a página**. O favicon cinza do template
do Astro e o aviso "não deveria estar publicado" na página de Privacidade são vistos no primeiro
segundo por quem está decidindo se confia. A animação com gatilho errado é vista por quem já
decidiu ficar. Confiança antes de movimento.

| Leva | O quê | Esforço | Depende do dono? |
|---|---|---|---|
| **1** | Consertar o que está errado e o desperdício óbvio | **M** (~6 h) | Não |
| **2** | O gatilho da animação (scroll-driven) | **M** (~1 dia) | Não |
| **3** | Identidade jurídica + escala de raio | **M** (~5 h) | **Sim** (dados + 1 decisão) |
| **4** | Telas reais no hero e na esteira | **G** (~3 dias) | **Sim** (conta de captura) |
| **5** | Blog e a infra de conteúdo | **M** infra + **G** escrita | **Sim** (compromisso de cadência) |
| **6** | Enfeite: profundidade CSS, `/telas/`, vídeo | **M** | **Sim** (ffmpeg) |

**Por que o blog é a leva 5 e não a 2**, embora seja o item mais "estratégico" da lista: o negócio
tem **zero pagantes** e a landing já recebe tráfego. Converter quem já chega custa horas e paga
esta semana; trazer quem ainda não chega custa 34 dias de escrita e paga em 3–6 meses
(`LANDING_BLOG_SEO.md §6.14`). Com caixa como gargalo, a ordem é conversão antes de aquisição. **A
exceção é o bloco 0 de SEO daquele documento** (título da home, links do rodapé) — são 3 horas que
valem mais que os cinco primeiros posts, e por isso subiram para a leva 1.

**Por que 3D é a leva 6 e quase todo ele é "não fazer":** os quatro documentos convergem sem
divergência — `LANDING_MOTION.md §3.3` recusa GSAP por peso, `LANDING_3D_E_TELAS.md §3.2` recusa
Spline (544 KB gzip, 17,9 s de CPU) e Three.js (~155 KB gzip), e o CSP que nós mesmos geramos
(`connect-src 'self'`) **bloqueia o Spline de qualquer forma**. O argumento que fecha a questão:
3D vende quando o produto **é uma coisa**. O produto da OLLI é uma tela — e a coisa mais convincente
que se mostra de uma tela é a tela. O instinto do dono ("quero as telas do app real") vale mais que
a pergunta dele ("será que faz em 3D").

---

## 2. AS LEVAS, UMA A UMA

Em cada leva: **arquivos tocados · risco de colisão · como verificar (comando, número)**.

---

### LEVA 1 — Consertar o que está errado (M, ~6 h, zero dependência do dono)

Sete itens. Nenhum é opinião: todos são "a página mostra uma coisa que não é verdade" ou "a página
gasta byte à toa".

#### 1.1 O favicon não é a marca da OLLI — é a do template do Astro

**Confirmei nos bytes hoje:** `od -A d -t x1 -N 4 web/public/favicon.ico` devolve `89 50 4e 47`.
É um **PNG renomeado**, 32×32, paleta indexada em escala de cinza, forma de "A", **zero pixel azul**.
O dono não está reclamando de resolução: ele está vendo **outra marca**, esticada 8× na barra de
tarefas (o maior raster do site inteiro é 32 px; o Windows quer até 256).

Gerar **cinco arquivos**, todos a partir do vetor (`favicon.svg`), **nunca** de `assets/icon.png`
(a margem de ícone de app produz marca minúscula flutuando num quadrado):

| Arquivo | Tamanho | Variante | Para quê |
|---|---|---|---|
| `favicon.ico` | ICO **de verdade**, 16+32+**48** | simplificada | aba, crawlers, `/favicon.ico` direto |
| `favicon.svg` | vetor | simplificada | aba em alto DPI |
| `apple-touch-icon.png` | 180×180 | completa, fundo sólido | atalho iOS; o Chrome desktop também usa |
| `icone-192.png` | 192×192 | completa | atalho |
| `icone-512.png` | 512×512 | completa | atalho **e** `logo` do JSON-LD (item 1.6) |

**Variante simplificada (16–32 px):** tirar rabinha do balão, faixa de brilho e **os dois olhos**;
manter e **engrossar o check** (traço 6 → 8–9, `stroke-linecap: round`); **cor sólida `#0B6FCE`**, sem
gradiente (gradiente a 45° sobre 16 px vira barro). Detalhe em `LANDING_CONFIANCA.md §2.6`.

**Não gerar manifest.** A landing não pode virar PWA (memória `olli-web-rebuild-decisao`) e não
precisa: raster grande declarado como `rel="icon"` resolve o atalho **sem** tocar em nenhum critério
de instalabilidade. Plano B documentado em `LANDING_CONFIANCA.md §2.3` — **não** aplicar junto "por
garantia".

Trocar as tags de `Layout.astro:85-86`; usar `sizes="32x32"` no `.ico` (hoje é `sizes="any"`, que é
uma declaração **falsa** — o arquivo é um PNG de 32 px).

#### 1.2 A página de Privacidade diz, em produção, que não deveria estar publicada

`web/src/pages/legal/privacidade.astro:23` renderiza `doc.aviso`, e o texto de
`src/content/legal/privacidade.ts:52` é: *"Este é um MODELO … deve ser revisado e adaptado por
um(a) advogado(a) **antes de ser publicado**"*. A seção 1 do mesmo documento, também visível,
instrui *"Antes de publicar, complete aqui a razão social, o CNPJ, o endereço"*.

Quem clica em "Privacidade" é **exatamente** a pessoa que está decidindo se confia. Nenhum CNPJ no
rodapé compensa ler que a empresa publicou um rascunho.

**Correção:** mover o aviso para o JSDoc do arquivo (nota interna, onde ele é correto e honesto) e
trocar o campo `aviso` renderizado por algo verdadeiro: *"Documento vigente desde {data}. Dúvidas
sobre os seus dados: {email} ou WhatsApp {numero}."*

⚠️ **Blast radius:** `src/content/legal/*` é compartilhado com a `LegalScreen` do app Expo. Mexer ali
muda o app também. É desejável, mas não é só a landing.

⚠️ **Não é fingir revisão jurídica.** A revisão continua necessária e vai para §5. Tirar o aviso da
tela e agendar a revisão são coisas independentes.

#### 1.3 A home é a única página do site sem título com palavra-chave

`index.astro:230` chama `<Layout schemas={[schemaFaq]}>` **sem passar `titulo` nem `descricao`** →
cai no default `"OLLI — do orçamento ao recibo, sem planilha"`: 46 caracteres, **zero palavra que
alguém digita**. As outras 5 rotas passam `titulo=` explicitamente.

Aplicar o que o `LANDING_BRIEF` já tinha prescrito e nunca foi aplicado:
`"App de Orçamento e Ordem de Serviço para Prestador | OLLI"`.

#### 1.4 e 1.5 O rodapé: dois furos, uma correção

- **7 páginas sem link legal.** A variante `minimal` do `Footer.astro:47-55` tem só "← Voltar" e
  copyright. Quem a usa: as **6 páginas `/para/[oficio]/`** e a **404** — ou seja, justamente as
  páginas de conversão, para onde o SEO por ofício manda tráfego frio. Ganham uma segunda linha:
  `Razão Social · CNPJ · Privacidade · Termos`, em `text-xs`.
- **O rodapé não linka `/para/*`.** `grep -rn "/para/" web/src/components/ web/src/layouts/` devolve
  **1 ocorrência, e é comentário**. `/ajuda/`, `/legal/*` e a 404 são becos sem saída: não passam
  autoridade nenhuma para as 6 páginas que convertem. Adicionar os 6 links no rodapé `completo`.

#### 1.6 `Organization.logo` aponta para o banner do Open Graph

`Layout.astro:52` aponta `logo: /og-image.png` — que é o banner **1200×630** de 239.577 bytes. O
Google exige logo rastreável, quadrado, ≥112×112; um banner 1,9:1 é recortado ou descartado.
Apontar para o `/icone-512.png` que o item 1.1 acabou de gerar. **Custo: zero** (o arquivo já existe
por causa de 1.1).

#### 1.7 `client:load` num componente decorativo e desktop-only

`index.astro:295` monta `<HeroDevices client:load />`. O componente é `aria-hidden="true"`
(`HeroDevices.tsx:54`) — **puramente decorativo** — e a única coisa nele que exige JS é o parallax
de **mouse**. No celular do prestador, esse JS não tem função nenhuma.

```astro
<HeroDevices client:media="(hover: hover) and (pointer: fine)" />
```

O Astro renderiza o HTML da ilha no build de qualquer jeito (é SSG), então o hero **aparece igual
para todo mundo** — só não baixa nem executa o JS onde ele não faria nada.

**Ganho: −104,5 KB gzip no celular** (react-dom 57,1 + HeroDevices 44,1 + react 3,3). É a linha
mais barata deste plano inteiro e os três documentos que a mencionam concordam.

#### 1.8 Fonte: preload do latin + cortar os 4 subsets mortos

§0.3. Esforço **P**, ganho direto no LCP (que é texto).

#### Arquivos tocados na leva 1

```
web/public/favicon.ico  (regerar)     web/public/favicon.svg  (regerar)
web/public/apple-touch-icon.png (novo)  web/public/icone-192.png (novo)
web/public/icone-512.png (novo)
web/src/layouts/Layout.astro          (tags de ícone, logo do JSON-LD)
web/src/pages/index.astro             (titulo/descricao no Layout; client:media)
web/src/components/Footer.astro       (links /para/*; linha legal na variante minimal)
web/src/styles/global.css             (subsets do Rubik)
src/content/legal/privacidade.ts      (campo aviso)  ⚠️ compartilhado com o app
src/content/legal/termos.ts           (campo aviso)  ⚠️ compartilhado com o app
```

**Risco de colisão: BAIXO**, com uma exceção. `index.astro` foi tocado pela onda da fonte
(commit pendente) — rebase antes. `src/content/legal/*` é do app Expo; se outra onda estiver em
`src/`, coordene. `Footer.astro` e `Layout.astro` estão livres.

#### Como verificar a leva 1

```bash
cd web && npm run build

# 1.1 — o .ico é um ICO de verdade (assinatura 00 00 01 00, não 89 50 4e 47)
od -A d -t x1 -N 4 dist/favicon.ico
ls -la dist/apple-touch-icon.png dist/icone-192.png dist/icone-512.png

# 1.2 — a palavra "MODELO" sumiu das duas páginas legais
grep -c "MODELO" dist/legal/privacidade/index.html dist/legal/termos/index.html   # esperado: 0 0

# 1.3 — o título da home tem palavra-chave
grep -o "<title>[^<]*" dist/index.html            # deve conter "Orçamento" e "Ordem de Serviço"

# 1.4 — as 6 páginas de ofício e a 404 linkam legal
grep -c "legal/privacidade" dist/para/eletricista/index.html dist/404.html   # ≥1 cada

# 1.5 — o rodapé linka os 6 ofícios
grep -o '/para/[a-z-]*/' dist/ajuda/index.html | sort -u | wc -l              # esperado: 6

# 1.6 — o logo do schema é o ícone, não o banner
grep -o '"logo":"[^"]*"' dist/index.html                                       # icone-512.png

# 1.7 — a ilha não hidrata mais no load
grep -c 'client="load"' dist/index.html                                        # esperado: 0

# 1.8 — subsets mortos fora
grep -c "@font-face" dist/_astro/*.css   # e conferir que arabic/hebrew/cyrillic sumiram
```

**Número que fecha a leva:** DevTools → emulação de celular → Network → filtro JS na home.
**Hoje: ~152 KB gzip. Alvo depois de 1.7: ≤ 48 KB gzip** (só o Sentry). Se não caiu, o `client:media`
não pegou.

---

### LEVA 2 — O gatilho da animação (M, ~1 dia, zero dependência do dono)

**O diagnóstico que muda tudo, e ele está certo:** a queixa do dono **não é de duração, é de
gatilho**. A animação de hoje (`HeroDevices.tsx:86-115`) dura 950–1000 ms e termina ~1,2 s depois do
load. Ele nunca a vê. Deixá-la mais lenta no mesmo gatilho não resolve nada — ele só espera mais por
algo que continua não vendo. Trocar o gatilho resolve tudo.

**Mecanismo: CSS scroll-driven nativo** (`animation-timeline: view()`), **0 KB de JS**, roda fora da
main thread. GSAP está fora: é grátis desde 30/04/2025 (licença deixou de ser objeção), mas são
~40 KB gzip na main thread para fazer o que o browser faz de graça.

**Suporte, contado no público real e não no global:** Chrome/Edge 115+ (jul/2023), Safari 26+
(set/2025). **Firefox continua atrás da flag `layout.css.scroll-driven-animations.enabled` no
stable — verifiquei hoje: na 152 (jun/2026) ainda está lá.** Com o mix mobile brasileiro (Chrome
80,98% · Safari 13,5% × 79% em iOS 26 · Samsung 3,94% · Firefox 0,43%), a estimativa é **~95% anima,
~3,3% cai no fallback** — e o fallback é "não anima", nunca "quebra".

#### 2.1 A regra estrutural que impede o bug clássico

> **O estado base do CSS é o estado FINAL, visível.** A opacidade/deslocamento inicial existe **só
> dentro do `@keyframes`**, e o `@keyframes` só é aplicado dentro de dois guardas.

```css
.olli-revela { /* nada. sem opacity, sem transform. */ }

@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .olli-revela {
      animation: olli-revela linear both;
      animation-timeline: view();
      animation-range: entry 0% cover var(--olli-alcance-2);
    }
  }
}
@keyframes olli-revela {
  from { opacity: 0; transform: translateY(var(--olli-sobe-md)); }
  60%  { opacity: 1; }                          /* opacidade fecha antes do movimento */
  to   { opacity: 1; transform: none; }
}
```

**⚠️ Esta estrutura também resolve, de graça, a armadilha do `global.css:90-101`.** A regra cega de
`prefers-reduced-motion` (`animation-duration: 0.01ms !important` em `*`) **atropelaria** scroll-driven:
sob timeline de scroll a duração precisa ser `auto`; um valor de tempo com `!important` deixaria o
card no estado `from` (invisível) por quase todo o range e faria ele estalar no fim — o bug de
conteúdo invisível entrando pela porta que existe para protegê-lo. Dois dos quatro documentos
pedem para "resolver a regra cega". **Decido: não mexer nela.** Declarando tudo dentro de
`@media (prefers-reduced-motion: no-preference)`, não existe animação para a regra atropelar, e ela
continua útil para hover e transições. É correção por disciplina, não por edição — mais barata e
sem regressão em outro lugar.

#### 2.2 Tokens (no `@theme` do `global.css` — Tailwind 4 é CSS-first, nada de arquivo novo)

Hoje existe **um** token de motion no projeto (`--ease-out-soft`) e ele **não é usado** pelo
`HeroDevices`, que crava a mesma curva em dois lugares. Todo o resto (0.95, 1, 0.18, 48, 72, 20,
−22, 120, 18) é número mágico.

```css
/* duração — só para o que continua sendo por tempo (hover, foco, <details>) */
--olli-dur-1: 160ms;   --olli-dur-2: 260ms;   --olli-dur-3: 420ms;   /* teto */

/* ALCANCE — é ESTE token que significa "mais lento" em scroll-driven */
--olli-alcance-1: 25%;   /* ~260 px de rolagem num celular 390×844 */
--olli-alcance-2: 35%;   /* ~365 px — padrão */
--olli-alcance-3: 50%;   /* ~520 px — só peça grande */

/* distância — teto de 28px, firme */
--olli-sobe-sm: 8px;   --olli-sobe-md: 16px;   --olli-sobe-lg: 28px;

/* easing */
--olli-ease-scroll: linear;   /* TODO scroll-driven */
```

**Duas decisões contraintuitivas que precisam sobreviver à revisão:**

- **`linear` em todo scroll-driven.** A curva atual (`cubic-bezier(0.16,1,0.3,1)`) entrega ~97% do
  progresso nos primeiros 50% — ótimo para entrada, **péssimo para scroll**: o visitante rola 30% do
  alcance, a animação já acabou, e os outros 70% de rolagem não produzem nada. Ele percebe isso como
  "quebrado", não como "suave". A sensação de ease vem da opacidade fechar em 60% do range.
- **Distância cai de 48/72 px para no máximo 28 px.** 48 e 72 são números de animação de *entrada*,
  onde o elemento vem de fora. Em scroll-driven o elemento já está entrando por conta da rolagem;
  somar 72 px próprios faz ele parecer atrasado em relação ao dedo, como se a página travasse.

**O que dizer ao dono:** com scroll-driven, a duração em segundos deixa de ser decisão nossa — vira
do polegar dele. Um flick rápido termina em ~300 ms; rolar devagar mostra devagar. É a diferença
entre um vídeo e um manípulo. O que continuamos controlando é a **distância**, e o teto é firme: a
revelação tem que terminar **antes** de o elemento chegar a ~55% da altura da tela, senão entregamos
texto meio transparente para quem já está tentando lê-lo.

#### 2.3 O hero — e a decisão de arquitetura que faz a leva 4 ficar barata

A entrada de `HeroDevices.tsx:86-115` sai. No lugar, os dispositivos ficam ligados à rolagem, com
`animation-range: cover` (não `entry`: no desktop os dispositivos já estão inteiramente visíveis no
scroll 0, então `entry` já terminou e a animação nasceria parada em 100%).

> **⚠️ A animação vai no wrapper `<div>` do lado do Astro, NUNCA dentro do `HeroDevices.tsx`.**

Este é o ponto de sutura entre a leva 2 e a leva 4, e ele não está em nenhum dos quatro documentos.
Na leva 4 o conteúdo da moldura vira uma imagem real; se o movimento estiver dentro do componente
React, essa troca reabre a leva 2 inteira. No wrapper estático, o movimento sobrevive à troca do
conteúdo e as duas levas ficam independentes. Também é o que mantém o movimento funcionando no
celular, onde (depois da leva 1) **não há React nenhum hidratado**.

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .hero-phone   { animation: hero-phone linear both;
                    animation-timeline: view(); animation-range: cover; }
  }
}
@keyframes hero-phone {
  from { transform: translateY(18px)  rotateY(4deg); }
  to   { transform: translateY(-18px) rotateY(12deg); }
}
```

**Nada de `opacity` acima da dobra.** Os dispositivos estão sempre visíveis; o que muda é a pose
relativa — o telefone desliza e gira em relação ao browser conforme se desce. O H1 continua sendo o
LCP e é intocado; texto, CTA e chips do hero também. Se o botão "Criar meu primeiro orçamento"
chegar 300 ms depois porque está fazendo fade, a animação custou dinheiro literal.

**Fallback do hero:** sem suporte, os dispositivos param na pose do meio do range — que é, por
construção, a composição que já está no ar hoje. Regra de desenho: **a pose de 0% tem que ser uma
composição que você assinaria como o hero definitivo.**

#### 2.4 O resto da página: 7 de 12 seções não se mexem

Deliberado. Se tudo anima, nada tem destaque, e uma página de venda em que cada bloco treme é
cansativa de ler.

| Anima | Como |
|---|---|
| Hero — dispositivos | §2.3 |
| Feito pro seu ofício (6 cards) | `.olli-revela`, alcance-2, sobe-md |
| Como funciona (3 passos) | revelação + **linha que se desenha** (`scaleX`, `transform-origin` na ponta) |
| Destaque IA — barra de 82% | `width:82%` → **`scaleX(0.82)`** (ver abaixo) |
| Planos | revelação **no wrapper**, nunca no card (ver armadilha abaixo) |
| CTA final | revelação sóbria |

**Não animam:** header, texto/CTA do hero, barra de confiança, os **8 cards de Recursos**, seção de
origem, FAQ, rodapé.

**Três armadilhas concretas, todas verificadas no código:**

1. **Barra de 82%** (`index.astro:427`): hoje é `style="width:82%"`. **Não animar `width`** — reflow
   por frame (regra 6). Vira filho `w-full` com `transform: scaleX(0.82)` e `transform-origin: left`.
   O trilho já tem `overflow-hidden rounded-full`, então o filho pode ser retangular e ainda aparecer
   com pontas arredondadas. Estado base fora dos guardas garante os 82% corretos sem suporte.
2. **Card de plano em destaque** (`index.astro:473`): tem `lg:-translate-y-3` **estático**. Animar
   `transform` nesse elemento sobrescreve o Tailwind e o card **cai** para a linha dos outros ao
   terminar — some o destaque do Pro, que é o que a página tenta vender. **Animar um wrapper.** Regra
   geral: `grep -n "translate\|rotate\|scale" index.astro` antes de aplicar `.olli-revela` em
   qualquer lugar.
3. **Barra de confiança (`R$ 0 · 6 ofícios · 21 calculadoras · 698 códigos`): sem count-up.** O
   número muda enquanto a pessoa lê, e o número **é** a prova. `698` tem que ser `698` no primeiro
   frame.

**E uma armadilha de infraestrutura:** `global.css:57` tem `body { overflow-x: hidden }`. Quando um
eixo é `visible` e o outro não, o `visible` computa para `auto` e o elemento pode virar container de
scroll. No `<body>` o overflow normalmente propaga para a viewport e provavelmente está tudo bem —
mas "provavelmente" não é plano: se `view()` resolver contra o scroller errado, nada anima, e o
sintoma é **indistinguível** de "browser sem suporte". **Testar isso antes de escrever o resto da
leva.** Se romper, `overflow-x: clip` resolve (`clip` não cria container de scroll).

#### Arquivos tocados na leva 2

```
web/src/styles/global.css        (tokens no @theme, .olli-revela, keyframes)
web/src/pages/index.astro        (classes + wrappers; barra 82% vira scaleX)
web/src/components/HeroDevices.tsx (remover initial/animate; manter só o parallax de mouse)
```

**Risco de colisão: MÉDIO.** `global.css` e `index.astro` são os dois arquivos mais disputados do
repositório — a onda da fonte acabou de mexer nos dois. Faça a leva 2 inteira num único commit e
rebase antes. Nunca rode a leva 2 em paralelo com a leva 3 (raio), que toca as mesmas ~85 linhas de
`index.astro`.

#### Como verificar a leva 2

```bash
# (a) nenhuma animação toca propriedade de layout — gate de PR, tem que voltar VAZIO
grep -A8 "@keyframes" web/src/styles/global.css | grep -E "(width|height|top|left|margin|padding):"

# (b) o JS não subiu — comparar com a linha de base da leva 1
cd web && npm run build
for f in dist/_astro/*.js; do echo "$f $(gzip -9 -c "$f" | wc -c)"; done

# (c) o CSS cresceu pouco
gzip -9 -c dist/_astro/*.css | wc -c        # alvo: ≤ 10.000 (base pós-leva-1 ~8.500)
```

**Métricas, e o critério de reversão definido antes de codar:**

| Verificação | Como | Número |
|---|---|---|
| CLS não mexeu | Lighthouse mobile, 3 execuções, mediana | **≤ 0,1**. `transform`/`opacity` não contam para CLS — **se o CLS subiu, alguém animou layout** |
| INP não mexeu | idem | **≤ 200 ms**. Scroll-driven não roda na main thread — se mexeu, algo virou JS |
| FPS na rolagem | DevTools Performance, **CPU 4× + Slow 4G**, rolar topo→rodapé em ~8 s | **≥ 55 fps**, frames caídos < 5% |
| Reduced-motion | SO com "reduzir movimento" ligado, rolar a página inteira | **nenhum pixel se move e nada fica escondido** |
| Fallback | Firefox stable (sem a flag) | página **completa e legível**, tudo visível |
| Teclado | `Tab` do topo ao rodapé, sem mouse | nenhum destino de foco invisível |

**Reversão:** se o LCP p75 mobile subir mais de **100 ms** no Sentry (`browserTracing` já está ligado
— temos Web Vitals de campo de graça), ou o INP p75 sair de "bom", o motion volta atrás. Sem
discussão de gosto.

---

### LEVA 3 — Identidade jurídica e escala de raio (M, ~5 h, **depende do dono**)

Duas coisas diferentes na mesma leva porque as duas são "a promessa não parece com a entrega" e as
duas tocam os mesmos arquivos.

#### 3.1 CNPJ: o instinto do dono está certo, e é obrigação legal

O **Decreto nº 7.962/2013, art. 2º** obriga site que oferta contrato de consumo a exibir **em local
de destaque e de fácil visualização**: (I) nome empresarial e CNPJ; (II) endereço físico e
eletrônico. A landing vende assinatura de R$ 39 e R$ 99/mês com CTA em toda página. Hoje o rodapé
traz só `© 2026 OLLI Orçamentos`. **Está descumprido.**

E é uma vantagem competitiva de graça: conferido em 18/07 — **Field Control não mostra CNPJ, Auvo
não mostra CNPJ**; os dois compensam com número que a OLLI não tem ("+5.000 clientes", "+8.000
empresas"). A **Bling** mostra. Os concorrentes diretos jogam o jogo do número de clientes, que a
OLLI perde por definição hoje. **CNPJ visível é o jogo que a OLLI pode ganhar sem gastar nada.**

**Fonte única — `web/src/data/empresa.ts`.** Dado jurídico duplicado em quatro lugares diverge na
primeira atualização (a casa já tem a regra: `olli-copy-derivada-da-fonte`). Rodapé, JSON-LD,
`llms.txt` e os documentos legais leem daqui.

> **Gate obrigatório:** se `razaoSocial`, `cnpj` ou `endereco` ainda estiverem com o marcador
> `PREENCHER`, **o bloco institucional não é renderizado**. Nada falso vai ao ar. Isto é código
> (`{EMPRESA.cnpj !== 'PREENCHER' && (...)}`), não disciplina.

Acessibilidade, medida nos tokens reais: o rodapé usa `text-muted` (`#64748b`) sobre `bg-paper`
(`#f6f9fc`) = **≈4,5:1** — passa AA raspando. Dado jurídico não pode ficar no fio: use **`text-slate`
(`#475569`) ≈ 7,2:1**. E o CNPJ tem que ser **texto selecionável**, nunca imagem — gente copia e
cola para conferir na Receita.

**JSON-LD:** acrescentar `legalName`, `taxID`, `address`, `email`, `contactPoint`, `foundingDate`
(só se real) e `sameAs` (só perfis que existem) ao `schemaOrganizacao`. **Manter `aggregateRating`
fora** — já está barrado no código com comentário em `Layout.astro:38-42`, e continua barrado.
**Não usar `LocalBusiness`**: descreve negócio com ponto físico onde o cliente comparece e puxa
expectativa de horário e avaliação local. A OLLI é SaaS nacional; seria schema mentindo sobre o
conteúdo — a mesma classe de erro que esta base já recusou duas vezes.

#### 3.2 Raio: a landing é mais dura que o produto que ela vende

Inventário medido (85 ocorrências de `rounded-*` em `web/src`):

| | Botão | Cartão | Bloco |
|---|---|---|---|
| **App (o produto)** | **24 px** | 18 px | 24–30 px |
| **Landing (a promessa)** | **12 px** | 16 px | 24 px |
| **Painel** | 8 px | 8–12 px | — |

"Quero tudo redondinho" **não é capricho — é coerência.** Escala semântica de 6 degraus no `@theme`
(no Tailwind 4, `--radius-cartao: 20px` gera `rounded-cartao` sozinho):

```css
--radius-fio: 4px;  --radius-campo: 12px;  --radius-acao: 16px;
--radius-cartao: 20px;  --radius-caixa: 28px;  --radius-bloco: 36px;
```

**Teto: 36 px, e só em superfície com ≥ 320 px no lado menor.** O que faz parecer brinquedo é a
**razão** raio/lado-menor, não o raio: acima de ~20% lê como adesivo. Nunca use `bloco` num cartão.

**Cuidado de composição que só aparece agora:** a onda da fonte trocou para **Rubik**, que já tem
cantos de haste arredondados. Fonte redonda + raio alto **somam**. Por isso a escala é
deliberadamente contida — subir os dois no talo ao mesmo tempo é o caminho mais curto para o
"infantil" que o dono não quer.

**A pílula no CTA principal é decisão do dono** (§5, item 8). A favor: é o formato mais redondo
possível e **casa com o app**, onde o botão já é pílula — continuidade de forma é o que faz parecer
um sistema só. Contra: é o clichê de SaaS e pode ler como "app de consumidor" para um profissional
que quer parecer sério. **Mitigação, se ele disser sim:** pílula **só nos CTAs de decisão** (hero,
CTA de bloco, CTA final) — dois por tela, não doze. Botão de plano, de cabeçalho e dentro de cartão
continuam retangulares. Se ele disser não, `--radius-acao: 16px` no CTA ainda é +33% de
arredondamento e zero risco. Trocar depois custa **uma linha** — é a vantagem do token semântico.

**Raio aninhado — o detalhe que faz parecer caro:** `raio_interno = raio_externo − padding`. Onde
importa hoje: o **container do FAQ** (`index.astro:505`) tem `rounded-2xl` com `divide-y` e
`<details>` **sem padding lateral** — o primeiro e o último item encostam na borda arredondada. Com
`caixa` = 28 o fundo do `<summary>` no `:hover` vaza pelo canto. **Já é bug latente hoje** com 16 px;
a 28 px fica visível. Mesmo tratamento no wrapper de tabela de `privacidade.astro:57`.

**Não tocar nos raios do `HeroDevices.tsx`** (42/40/34 px) — são cantos de aparelho físico; mexer
quebra a ilusão. **Não estender a escala ao painel nesta onda** (`webapp` está sendo editado por
outra onda; é uma linha, mas é decisão separada com QA separado).

#### Arquivos tocados na leva 3

```
web/src/data/empresa.ts          (novo)
web/src/components/Footer.astro  (bloco institucional nas 2 variantes)
web/src/layouts/Layout.astro     (JSON-LD)
web/src/pages/llms.txt.ts        (razão social + CNPJ)
src/content/legal/privacidade.ts (seção 1 recebe o dado real)  ⚠️ compartilhado com o app
web/src/styles/global.css        (tokens de raio)
web/src/pages/index.astro + para/[oficio].astro + ajuda + legal/* + 404  (~85 substituições)
```

**Risco de colisão: ALTO.** As ~85 substituições de raio produzem um diff que conflita com
**qualquer** coisa em `index.astro`. Faça a leva 3 **depois** da leva 2, nunca em paralelo, e num
commit separado do commit do CNPJ (para poder reverter o raio sem reverter a identidade jurídica).

#### Como verificar a leva 3

```bash
# raio: ninguém criou classe arbitrária em vez de usar token
grep -rn "rounded-\[" web/src/ | grep -v HeroDevices.tsx      # esperado: vazio

# raio: custo de bytes é zero (mesmas utilitárias, outro valor)
gzip -9 -c dist/_astro/*.css | wc -c    # delta vs. leva 2: ≤ +500 B. Mais que isso = classe arbitrária

# CNPJ: o dado saiu no HTML e no schema
grep -o '"taxID":"[^"]*"' dist/index.html
grep -c "CNPJ" dist/para/eletricista/index.html dist/404.html dist/index.html   # ≥1 cada

# gate: sem dado do dono, o bloco NÃO renderiza
grep -c "PREENCHER" dist/index.html     # esperado: 0 em qualquer cenário
```

**Métricas:**
- **Rich Results Test** do Google na home: `Organization` válido, zero erro.
- **Contraste** da linha institucional: `#475569` sobre `#f6f9fc` ≥ **7:1** (medir, não confiar).
- **Teste do cético, 5 pessoas, 30 segundos:** dê a home a 5 prestadores e peça *"descubra quem é a
  empresa dona disto"*. Hoje a resposta é "não dá". **Meta: 5/5 acham em menos de 30 s.**
- **Regressão zero de performance:** o bloco é texto e `border-radius` resolve no paint uma vez. Se
  LCP ou INP mexerem, algo além de texto entrou junto.

---

### LEVA 4 — Telas reais (G, ~3 dias, **depende do dono**)

**O dono está certo e o motivo é mais forte do que ele formulou.** As telas do hero são
**desenhadas à mão** em JSX/SVG dentro de `HeroDevices.tsx` (~710 linhas, zero `<img>`). O próprio
arquivo explica por quê (`:80-85`): antes havia um `/olli-painel.png` que era a demo do template
Slash, com menu em inglês e números em dólar — "estávamos anunciando o produto com a tela de outro
produto". A troca por código foi a correção certa naquele momento, mas resolveu o problema errado:
o problema era a tela ser **de outro produto**, não ser uma **imagem**.

E o desenho **já está subvendendo**: o menu desenhado lista 7 itens; o painel real tem também
catálogo, diagnóstico, equipamentos, ferramentas e meu-negócio. Screenshot real envelhece de forma
visível e verificável; desenho envelhece em silêncio.

#### 4.1 Nove telas, não cem

Contagem real: 40 telas mobile + 21 desktop + 39 páginas do painel ≈ **100**. O recorte é 9 (lista
completa em `LANDING_3D_E_TELAS.md §2.1`): orçamento aprovado (a tela-herói, no hero), novo
orçamento, diagnóstico IA, ordem de serviço com assinatura, calculadora de ofício, início desktop,
Kanban, PDF white-label, link público do cliente.

**O argumento para dar ao dono, na língua dele:** cem telas é o catálogo da fábrica. Quem chega na
landing quer saber se resolve o problema dele em dois minutos. Mostrar tudo tem três efeitos, todos
ruins: ninguém olha nada porque não sabe onde olhar; quem olha encontra a tela mais feia do produto
e é dela que vai lembrar; e a Lixeira na mesma esteira do orçamento aprovado diz que você não sabe
qual é o seu melhor argumento. **Vitrine de joalheria não bota o estoque na janela** — bota seis
peças, e o resto está lá dentro para quem entrar. As outras ~90 vão para `/telas/` (leva 6), linkada
do rodapé, com custo marginal quase zero porque o pipeline já as capturou.

#### 4.2 Dois pipelines, porque o risco é assimétrico

**A infraestrutura já existe — não construa do zero.** Playwright 1.61.0 em devDeps;
`scripts/qa-web.mjs` já sobe o chromium, abre o app real e **passa pelo onboarding sozinho**
(`reachHome`); `preview/iphone-lab.html` já enquadra o app em 393×852; `sharp@0.35.3` já vem com o
Astro. **O pipeline é ~70% um `qa-web.mjs` com outro roteiro** — isso muda a estimativa de "projeto"
para "tarde".

- **Pipeline A — app (telas 1–5): risco estruturalmente zero.** O app é **local-first** (expo-sqlite
  → wa-sqlite/WASM no browser). Perfil novo = **banco vazio, sem login, sem rede**. Não é política
  que alguém pode esquecer de seguir; é propriedade da arquitetura. Semear dado fictício
  **dirigindo a UI** (Playwright preenche os formulários reais) — assim a screenshot **prova** que o
  fluxo funciona e vira teste E2E de brinde. **Não** injetar SQL direto no WASM: contorna a
  validação e produz screenshot de um estado que o produto não consegue gerar — exatamente a mentira
  que o `/olli-painel.png` era.
- **Pipeline B — painel (telas 6–7): exige login em conta real.** O painel é **online-first**
  (Supabase + RLS), sem modo offline. **Depende de decisão do dono** (§5, item 7).

**Determinismo, senão o pipeline morre em duas semanas:** `deviceScaleFactor: 2` fixo,
`reducedMotion: 'reduce'` (senão uma captura pega o card no meio do fade e a próxima não),
`locale: 'pt-BR'` + `timezoneId: 'America/Sao_Paulo'` cravados, **relógio congelado** (`page.clock`)
— senão "Boa tarde" vira "Boa noite" e "há 2 dias" anda sozinho — e **esperar âncora, nunca
`waitForTimeout`**.

#### 4.3 O gate de privacidade — a peça mais importante desta leva

**Screenshot publicado com nome, telefone ou endereço de cliente real não se despublica.** Já foi
para o cache do Google, para o Wayback, para o print de alguém.

```js
const texto = await page.evaluate(() => document.body.innerText);
// (a) proíbe padrão sensível: CPF/CNPJ formatado, telefone BR, e-mail, CEP
// (b) exige allow-list: todo nome próprio visível tem que estar em elenco-ficticio.ts
// qualquer violação -> process.exit(1), SEM gravar a imagem
```

**Falhar o build, não avisar.** É a regra da casa aplicada a imagem: gate, não conselho. Cobre o
caso que a revisão humana sempre perde — o nome num toast, num autocomplete, num histórico fora do
foco do olhar. Limitação conhecida a documentar junto: `innerText` não vê texto dentro de `<canvas>`.

**Elenco fictício** em `web/src/data/elenco-ficticio.ts`: reaproveitar os nomes que já estão no
`HeroDevices.tsx` hoje (Clínica Vida & Saúde, Ar Frio Refrigeração, Padaria Pão Quente) para manter
continuidade visual. CNPJ/CPF **nunca** válido no dígito verificador — e documentar isso no arquivo,
senão alguém "conserta".

#### 4.4 Peso, formato e a regra que protege o LCP

Screenshot de UI é **texto miúdo e borda dura**, não fotografia — isso inverte o conselho usual.
AVIF é 20–30% menor que WebP, mas seu filtro **suaviza detalhe fino**: em texto pequeno ele "lava" a
nitidez, que é justamente o que faz a screenshot parecer produto de verdade. Servir **AVIF com WebP
de fallback** via `<picture>` (AVIF ~94–95% dos browsers), e **escolher a qualidade olhando a imagem
a 100% de zoom**, não a tabela: o menor q que ainda tem o "R$ 2.480" cravado. `astro:assets` faz
tudo no build com o `sharp` que já está instalado — **zero dependência nova**.

| Uso | Alvo |
|---|---|
| Hero, celular 2× (786×1704) | **≤ 60 KB** AVIF, `fetchpriority="high"`, `loading="eager"` |
| Esteira, 2× (~600×1300) | **≤ 40 KB** cada, `loading="lazy"` |
| Painel desktop 2× (2880×1800) | **≤ 120 KB**, com 1× no `srcset` |
| **Total de imagem na página** | **≤ 400 KB** |

**O LCP tem que continuar sendo o H1.** `width`/`height` sempre presentes (mata CLS). `lazy` no
elemento LCP é erro clássico que *piora* a métrica — por isso o hero é `eager` e só ele.

#### 4.5 "Embaixo tem que ter várias telas vindo"

**Base: `overflow-x: auto` com `scroll-snap` — uma lista rolável nativa.** Funciona com dedo, com
teclado, com leitor de tela, **sem JS**. O scroll-driven horizontal entra **por cima**, como enfeite;
em `prefers-reduced-motion` o enfeite some e sobra a lista, 100% funcional. É o "caminho sem
movimento" da regra 5 no mesmo componente, não uma segunda implementação.

**Não fazer marquee em loop infinito:** movimento contínuo fora do controle do usuário queima
bateria, compete com a leitura e obriga a duplicar o DOM.

**Acessibilidade muda aqui:** o hero de hoje é `aria-hidden="true"` e isso está **certo** para um
desenho decorativo. **Telas reais são conteúdo:** cada uma precisa de `alt` que descreva o argumento
("Orçamento de R$ 2.480 aprovado, com três serviços e botão de enviar no WhatsApp"), nunca
"screenshot do app". É o que dá ao leitor de tela — e ao Google — o que a imagem carrega.

#### 4.6 A troca é para ficar mais leve, não mais pesado

Com as telas virando imagem, o `HeroDevices.tsx` encolhe drasticamente — sobra a moldura e o
parallax. Somado ao `client:media` da leva 1: **44,3 KB gzip de markup desenhado saem; ~60 KB de
imagem entram, e no celular saem também os 104,5 KB de React.** Imagem não bloqueia a main thread;
JS bloqueia. **Mas isso é hipótese até medir** (§4 deste plano fecha os alvos).

#### Arquivos tocados na leva 4

```
scripts/capturar-telas.mjs         (novo — deriva de scripts/qa-web.mjs)
web/src/data/elenco-ficticio.ts    (novo)
web/src/assets/telas/*             (novo — as capturas)
web/src/components/HeroDevices.tsx (o conteúdo da moldura vira <Picture>)
web/src/pages/index.astro          (seção da esteira)
web/src/styles/global.css          (scroll-snap + scroll-driven horizontal)
```

**Risco de colisão: BAIXO** com as outras levas (arquivos majoritariamente novos), **ALTO** com
qualquer onda que esteja mexendo em `src/` (app Expo) ou `webapp/` — uma mudança de UI lá quebra a
captura. Por isso o item de manutenção abaixo.

#### Como verificar a leva 4

```bash
# gate de privacidade: forçar uma violação e conferir que o build MORRE
node scripts/capturar-telas.mjs --teste-do-gate     # deve sair com código 1

# peso por imagem
for f in web/src/assets/telas/*.avif; do echo "$f $(stat -c%s "$f")"; done
# hero ≤ 61440 · esteira ≤ 40960 · painel ≤ 122880

# o LCP continua sendo o H1 — rodar no console da página publicada
new PerformanceObserver(l => console.log(l.getEntries().at(-1).element)).observe(
  {type:'largest-contentful-paint', buffered:true})
# esperado: <h1>, não <img>
```

**A régua:** Lighthouse mobile **antes e depois**, quatro números lado a lado — LCP, INP, CLS e KB
transferidos. **Se o LCP piorar mais de 100 ms, o recorte diminui** (9 telas → 5) até voltar.

**Manutenção — é isto que decide se sobrevive.** Screenshot é código que vence. Sem recaptura, em
três meses a landing mostra um produto que não existe mais — exatamente o defeito do
`/olli-painel.png`. Duas medidas: (a) o script roda no `preflight` e **falha se alguma tela do
roteiro não puder ser alcançada**, então a quebra aparece no PR e não na landing; (b) recaptura a
cada mudança visual grande, que é barato porque é um comando.

---

### LEVA 5 — Blog (infra M ~1 dia · escrita G ~1 dia por post, **depende do dono**)

**Gate antes de escrever uma linha de código:** *não construir a infra do blog enquanto não
existirem **4 posts escritos***. Blog vazio (ou com 1 post de março) comunica "empresa parada" para
o mesmo visitante que precisa confiar dinheiro nela. É pior que não ter blog.

#### 5.1 O blog serve **apenas o prestador**. Uma audiência.

As duas audiências têm intenções opostas. O dono de casa busca "quanto custa limpeza de ar
condicionado" e quer **contratar um técnico** — a OLLI não é marketplace, não tem lead-gen, vale
**R$ 0**. Pior: consome crawl budget e derruba o engajamento das páginas de dinheiro. E o adversário
nessa SERP (Triider, portais de notícia) é impossível hoje com 10 URLs e zero backlink.

**A exceção inteligente, que entrega o desejo do dono:** a família *"quanto cobrar"* é dual-intent.
Escrita do lado do prestador ("quanto **cobrar** por limpeza de ar-condicionado, por BTU, com o
custo por trás"), ela fala com o comprador, pega parte da cauda de "quanto custa" por sobreposição
semântica, e ataca um ângulo que nenhum portal consegue escrever, porque exige saber o custo por
dentro — hipoclorito, tempo de máquina, deslocamento, imposto. **A OLLI tem isso; a Revista Oeste
não.**

#### 5.2 Sobre "notícias atualizadas" — a resposta honesta

**Google News não aceita mais inscrição desde 25/04/2024**; a descoberta é algorítmica, por
relevância, proeminência e **autoridade**. Um blog novo de uma marca com zero pagante e zero
cobertura de imprensa não entra em superfície de notícia por esforço de escrita. E notícia exige
cadência **para sempre**: cada post carrega data visível.

**Contraproposta que entrega o desejo sem a dívida:** (a) categoria `regras` — mudança de norma
(PMOC/Lei 13.589, NR-10, ANVISA, MEI/NF) são poucos eventos por ano e cada um **atualiza um post
existente** (`atualizadoEm`) em vez de criar um que envelhece; (b) os posts "quanto cobrar … em
2026" são atualizados em janeiro **na mesma URL** — um dia de trabalho por ano refresca a categoria
inteira; (c) **`/novidades/` do produto, fora do blog** — changelog de 20 min/mês, que satisfaz o
instinto de "site vivo" sem prometer redação.

Se, mesmo assim, a decisão for notícia: o gate mínimo é **1 post/semana por 6 meses, com dono
definido**. Sem esse compromisso escrito, não construir a categoria.

#### 5.3 Estrutura (decisões que custam caro se erradas)

```
/blog/  ·  /blog/2/  ·  /blog/[slug]/  ·  /blog/categoria/[categoria]/  ·  /blog/rss.xml
```

- **Slug plano, sem categoria e sem data na URL.** `/blog/[categoria]/[slug]/` parece organizado e
  cobra 301 em massa no dia em que um post muda de categoria — e vai mudar. Sem ano no slug, senão
  morre a atualização anual das tabelas de preço, que é o mecanismo de frescor mais barato do blog.
- **Não existe `/blog/oficio/[oficio]/`.** `/para/[oficio]/` **já existe**, já tem FAQPage,
  BreadcrumbList, as calculadoras e o CTA. Uma segunda página por ofício é fabricar concorrente
  interno magro para a página que converte. O ofício vira **campo do post**, e os posts daquele
  ofício aparecem numa seção **dentro** de `/para/[oficio]/` — link interno nos dois sentidos, sem
  nenhuma página nova.
- **6 categorias recortadas por trabalho, não por assunto** (documentos, precificacao, gestao,
  ferramentas, tecnico, regras), e **nenhuma vai ao ar com menos de 4 posts** — isso vira `filter`
  no `getStaticPaths`, não boa intenção.
- **Uma dependência nova, exatamente uma: `@astrojs/rss`.** **Não instalar `@astrojs/mdx`** (§3.6).

#### 5.4 ⚠️ A armadilha que quebra o blog em silêncio

`dist/_headers` tem uma linha de `Content-Security-Policy` com **1.338 caracteres** e 18 hashes
sha256 — um por script inline do site. O Cloudflare Workers static assets impõe **2.000 caracteres
por linha**, e cada hash novo custa ~52 chars.

> **Sobram ~12 scripts inline antes de a linha estourar.** Quando estourar, não há erro de build: o
> CSP inteiro **para de ser aplicado, em silêncio**.

Consequência direta: **cada post NÃO pode trazer script inline próprio** (widget de compartilhar,
"copiar código", contador de leitura). 30 posts × 1 inline = CSP quebrado. E `img-src 'self' data:`
+ `default-src 'self'` significam **capa self-hosted** e **nada de `<iframe>` de YouTube** — o
bloqueio é silencioso na página do leitor.

#### 5.5 Dieta de Sentry (P, ~30 min, e todo post futuro agradece)

**Toda** página paga **47.964 B gzip de Sentry**, inclusive `/para/eletricista/`, que não tem ilha
React nenhuma. Um post em Markdown puro, que deveria custar ~8 KB de HTML e **zero** JS, vai nascer
pesando 48 KB de monitoramento. Ligar `bundleSizeOptimizations: { excludeReplayShadowDom,
excludeReplayIframe, excludeReplayWorker, excludeDebugStatements }` — a config não usa Replay, então
as três primeiras são grátis, e `excludeDebugStatements` sozinho vale ~5 KB gzip segundo a doc.
**Não** ligar `excludePerformanceMonitoring`: mataria o `tracesSampleRate` e com ele os Web Vitals
de campo, que são o número que decide as levas 2 e 4.

**Investigar (não prometo, não verifiquei):** se `@sentry/astro` permite escopo por rota, tirar o
SDK das páginas estáticas sem ilha vale 48 KB em 6+ páginas. Se não permitir, mantenha — o dado de
campo vale mais que os bytes.

#### Arquivos tocados na leva 5

```
web/src/content.config.ts            web/src/content/blog/*.md
web/src/pages/blog/[...page].astro   web/src/pages/blog/[slug].astro
web/src/pages/blog/categoria/[categoria]/[...page].astro
web/src/pages/blog/rss.xml.ts        web/src/components/CardPost.astro
web/src/layouts/Layout.astro         (props tipoOg/publicadoEm/atualizadoEm — og:type é 'website' fixo hoje)
web/src/pages/para/[oficio].astro    (seção de posts do ofício)
web/astro.config.mjs                 (lastmod no sitemap; bundleSizeOptimizations do Sentry)
```

**Risco de colisão: BAIXO** (quase tudo é arquivo novo). As duas exceções são `Layout.astro` e
`astro.config.mjs`, tocados também nas levas 1 e 3.

#### Como verificar a leva 5

```bash
cd web && npm run build

# (a) o CSP não estourou — o número que mata o blog em silêncio
awk '/Content-Security-Policy/ {print length($0)}' dist/_headers    # hoje 1338 · alarme em 1600 · morte em 2000

# (b) o post não carrega JS além do Sentry
grep -c 'type="module"' dist/blog/<slug>/index.html                 # esperado: 1 (só o Sentry)

# (c) rascunho não vazou para lugar nenhum
grep -rc "rascunho" web/src/pages/blog/ web/src/pages/para/         # ≥1 em CADA getCollection

# (d) o sitemap ganhou lastmod
grep -c "lastmod" dist/sitemap-0.xml                                 # > 0 (hoje: 0)

# (e) a dieta do Sentry funcionou
gzip -9 -c dist/_astro/page.*.js | wc -c                             # alvo: < 43.000 (base 47.964)
```

**O que NÃO medir:** tráfego em 30 dias. O que dá para medir em 30 dias é **publicação** (posts no
ar) e **indexação** (URLs no Search Console). Orgânico de cauda longa leva 3–6 meses.

**E não gerar 30 posts de IA numa tacada.** A política de spam do Google define *scaled content
abuse* pelo **propósito e valor**, não pelo método — e um lote de 30 textos genéricos publicados no
mesmo dia por um domínio sem histórico é exatamente o padrão. Ritmo: 2–4 posts/semana nas primeiras
4 semanas, depois 2–4/mês.

---

### LEVA 6 — Enfeite (M, e a maior parte é "ainda não")

Nada aqui entra antes de as levas 1–4 estarem no ar e medidas.

| Item | Veredito |
|---|---|
| **Aprofundar o CSS 3D** — glare ligado ao mouse, `translateZ` em 3–5 wrappers, espessura lateral (`rotateY(90deg)`), sombra reativa em camada separada | **Fazer.** P–M, zero dependência, e entrega ~90% do que o Spline entregaria neste caso (dois retângulos planos flutuando). O glare é o maior ganho de percepção 3D por custo perto de zero — reaproveita MotionValues que já existem. **Só onde há mouse**, portanto atrás do `client:media`. |
| **Página `/telas/`** com as ~90 restantes | **Fazer, no fim.** Custo marginal quase zero (o pipeline já capturou), satisfaz "quero mostrar todas" sem pagar o preço na página que converte. Linkada do **rodapé**, nunca do hero. |
| **Sequência de screenshots com transição** | **Fazer antes de pensar em vídeo.** Reaproveita as capturas da leva 4, dá ~70% da sensação de vídeo por ~5% do custo. |
| **Vídeo screencast** | **Só se a sequência não convencer.** ~20 s, um fluxo só (chega o pedido → monta → cliente aprova → vira OS), **sem áudio**, legenda **queimada**, `preload="none"`, pôster, **atrás de clique**, **abaixo da dobra**, auto-hospedado. Egress do Workers é **grátis e ilimitado**, teto de 25 MiB/arquivo — a premissa de "caro" estava errada. A de "lento" continua certa: asset estático **não tem bitrate adaptativo**, por isso o desenho é todo para que **quem não clicar não pague nada**. Cloudflare Stream resolveria o adaptativo, mas o player é iframe e nosso CSP não tem `frame-src` → bloqueado. **Bloqueado hoje por `ffmpeg`, que não está instalado.** |
| **Three.js / R3F / Spline** | **Não.** §1 deste plano e §3 conflitos. |
| **Vídeo gerado por IA / banco de imagens** | **Não.** O ativo é o produto real; "empresário sorrindo" não prova nada. |

---

## 3. CONFLITOS ENTRE OS ESPECIALISTAS — e a decisão

Esta seção é a razão de existir do documento. Cada conflito tem um veredito e o motivo.

### C1 — "3D pesado" vs "página rápida": **não há conflito, e isso é o achado**

Os quatro documentos convergem sem divergência: MOTION recusa GSAP (~40 KB gzip na main thread),
3D_E_TELAS recusa Spline (544 KB gzip, 17,9 s de CPU) e Three.js (~155 KB gzip, tree-shaking ruim), e
o `LANDING_BRIEF` já tinha recusado os dois. **Decisão: mantida a recusa, e o argumento que a fecha
não é o peso — é o produto.** 3D vende quando o produto **é uma coisa** (tênis, carro, máquina). O
produto da OLLI é uma tela. Não há objeto para explorar.

**E há um argumento que só aparece cruzando os documentos:** o Lighthouse **não calcula LCP** de
conteúdo dentro de `<canvas>`. Ou seja, adotar 3D **melhoraria o número escondendo o problema em vez
de resolvê-lo** — que é a regra 11 ("não use animação para esconder lentidão real") do avesso. Um
argumento a favor do 3D vira, na verdade, o argumento definitivo contra.

### C2 — Bytes de imagem vs "o JS não pode subir": **orçamentos separados**

MOTION §7.1 diz "zero JS novo, os bytes da landing têm que empatar ou cair". 3D_E_TELAS quer somar
200–400 KB de AVIF. Parecem incompatíveis; não são.

**Decisão: dois orçamentos, com regras diferentes.** JS bloqueia a main thread (parse, compile,
execução, INP); imagem decodifica fora dela e o usuário continua rolando. **JS: teto rígido, não
sobe. Imagem: teto de 400 KB, obrigatoriamente `lazy` e abaixo da dobra, exceto a do hero (60 KB,
`eager`).** Na prática as duas levas **somadas deixam a página mais leve no celular** (§4), porque o
`client:media` tira 104,5 KB de JS antes de a primeira imagem entrar.

### C3 — Fonte: a onda em andamento acabou de **abrir** um eixo de identidade

`CATALOGO_VISUAL.md` e `IDENTIDADE_APP_SITE.md` registram que fonte era **o único eixo já
convergido** entre as três superfícies (Plus Jakarta + Spectral nas três). A onda da fonte moveu
**landing e painel para Rubik** — e o app Expo continua em Plus Jakarta + Spectral
(`src/theme/fonts.ts` ainda referencia `Spectral_600SemiBold`). O eixo que estava fechado agora está
2×1.

**Decisão: não é problema da landing e não se resolve aqui.** A escolha do Rubik é boa e tem
justificativa registrada (o dono achou a anterior "estranha" e pediu letra mais arredondada; Rubik
arredonda sem afinar o traço, o que segura número e texto pequeno). **Mas fica registrado como
follow-up obrigatório do app:** portar Rubik para o Expo, ou a queixa "o aplicativo está muito
diferente do site" volta pelo eixo que ela tinha acabado de deixar. **Não reintroduzir Spectral na
landing** — ela estava declarada e não era usada em nenhuma página.

### C4 — "Consertar a regra cega de reduced-motion" vs custo: **não mexer nela**

MOTION §4.3 e 3D_E_TELAS §2.5 tratam `global.css:90-101` (`animation-duration: 0.01ms !important` em
`*`) como pré-requisito a corrigir. **Decidido: não editar.** Declarando todo scroll-driven dentro de
`@media (prefers-reduced-motion: no-preference)`, **não existe animação para a regra atropelar** — o
problema desaparece por construção, e a regra continua fazendo o trabalho dela em hover e
transições. Mexer nela é risco de regressão em toda a página por um problema que a estrutura correta
já elimina. **Menos trabalho e mais seguro.**

### C5 — Onde mora a animação do hero: **no wrapper Astro, e isto não estava em nenhum documento**

MOTION §6.1 descreve a animação do hero como CSS sobre os dispositivos. 3D_E_TELAS §2.4 diz que o
`HeroDevices.tsx` vai encolher drasticamente quando as telas virarem imagem. **Se a animação for
escrita dentro do componente React, a leva 4 reabre a leva 2 inteira.**

**Decisão: a classe animada vai num `<div>` estático do `index.astro`, em volta do
`<HeroDevices />`.** Três consequências, todas boas: a leva 4 troca o conteúdo sem tocar no
movimento; o movimento funciona no celular, onde (pós-leva 1) não há React hidratado; e o
componente React fica com uma responsabilidade só, o parallax de mouse.

### C6 — "Mostrar TODAS as telas" vs foco: **9 na landing, o resto em `/telas/`**

Não é meio-termo por educação: é a única forma de o dono ganhar as duas coisas. **E há um risco
específico deste produto que reforça o recorte:** `CATALOGO_VISUAL.md` abre dizendo que as três
superfícies "parecem produtos de empresas diferentes". Enquanto isso for verdade, **screenshot real
amplifica a incoerência que o desenho à mão escondia** — porque o desenho usa um vocabulário visual
único e as telas reais não. Isso não é motivo para não fazer; é motivo para **não colocar app e
painel lado a lado na mesma faixa** até a convergência de identidade acontecer.

### C7 — Blog grande vs manutenção: **infra só depois de 4 posts escritos**

`LANDING_BLOG_SEO.md` entrega 34 pautas e admite: ~1 dia por post bem feito. **34 dias de escrita, de
uma pessoa, num negócio com zero pagantes.** O documento é honesto sobre isso, mas não tira a
conclusão.

**Decisão:** (a) o **bloco 0 de SEO** (título da home, links do rodapé, `og:type`, `lastmod`) sobe
para a **leva 1** — são 3 horas e valem mais que os cinco primeiros posts; (b) a **infra do blog não
é construída até existirem 4 posts escritos** — infra sem conteúdo é dívida, e blog vazio é pior que
nenhum blog; (c) os 8 primeiros posts são os que o documento já elegeu (hora técnica, PMOC pilar,
comparativo com preço, modelo de orçamento, códigos de erro, quanto cobrar limpeza, planilha × app,
mensagens de cobrança) — cobrem as 6 categorias e ativam a ponte de 3 ofícios.

### C8 — Ordem interna da leva 1: **confiança antes de movimento**

MOTION coloca o gatilho da animação como item 4 da lista dele; CONFIANCA coloca o aviso legal como
item 1 da dele. Ambos estão certos dentro do próprio escopo. **Decisão: confiança primeiro.** O
favicon errado e o "não deveria estar publicado" são vistos por **todo** visitante no primeiro
segundo, inclusive por quem sai sem rolar. A animação é vista por quem já decidiu ficar. E o item de
maior valor por hora do plano inteiro — `client:media`, 104,5 KB — está na leva 1 e é uma linha.

### C9 — Colisão de arquivo entre levas: **serializar levas 2 e 3**

MOTION e CONFIANCA propõem, cada um, uma passada grande em `index.astro`: a leva 2 adiciona wrappers
e classes; a leva 3 troca ~85 ocorrências de `rounded-*`. **Decisão: nunca em paralelo, e o raio
depois do motion** — porque a leva 2 **cria wrappers** que a leva 3 vai precisar classificar. Fazer
na ordem inversa significa refazer o mapeamento de raio nos elementos novos. Commits separados, para
poder reverter o raio (decisão estética) sem reverter o movimento (correção de defeito).

### C10 — `Organization.logo`: dois documentos, o mesmo bug, uma correção

BLOG (A6) e CONFIANCA (§1.6) apontam independentemente que `Layout.astro:52` usa o banner OG de
1200×630 (239.577 B) como logo. **Decisão: correção única na leva 1**, apontando para o
`/icone-512.png` que o item do favicon já vai gerar. Custo marginal: zero.

---

## 4. O ORÇAMENTO DE PERFORMANCE DEPOIS DE TUDO

### 4.1 Peso alvo — home, primeira visita, celular

| | Hoje (medido) | Depois de tudo | Δ |
|---|---|---|---|
| HTML | 16,3 KB | ≤ 19 KB | +2,7 |
| CSS | 8,5 KB | ≤ 11 KB | +2,5 |
| **JS** | **152,5 KB** | **≤ 43 KB** | **−109,5** |
| Fonte (latin) | ~35 KB | ~35 KB | 0 |
| Imagem acima da dobra | 0 | ≤ 60 KB | +60 |
| **Acima da dobra** | **~212 KB** | **≤ 168 KB** | **−44 KB** |
| Imagem `lazy` abaixo da dobra | 0 | ≤ 340 KB | +340 |
| **Página inteira, se rolar até o fim** | ~212 KB | **≤ 508 KB** | +296 |

**A landing fica 21% mais leve no que importa** (o que é baixado antes do primeiro pixel útil),
mesmo ganhando uma screenshot real do produto no hero. Isso não é otimismo: são os 104,5 KB de
react-dom + motion + HeroDevices saindo do celular via uma linha (`client:media`), mais os ~5 KB do
Sentry via `bundleSizeOptimizations`.

**Teto rígido de JS na landing: 45 KB gzip no celular.** Se um PR de motion, blog ou telas subir esse
número, ele está errado — não importa quão bonito.

### 4.2 Métricas alvo

| Métrica | Alvo | Onde medir |
|---|---|---|
| **LCP** | **≤ 2,5 s** p75 mobile | Sentry (campo) e Lighthouse mobile com **Slow 4G: 1,6 Mbps / 150 ms RTT** — o preset é o quartil inferior do 4G, que é o público real |
| **INP** | **≤ 200 ms** p75 | Sentry. Scroll-driven não roda na main thread; se mexeu, algo virou JS |
| **CLS** | **≤ 0,1** p75 | `transform`/`opacity` não contam. Se subiu, alguém animou layout ou esqueceu `width`/`height` numa imagem |
| **FPS na rolagem** | **≥ 55 fps** | DevTools Performance, **CPU 4× + Slow 4G**, rolar topo→rodapé em ~8 s |
| **Elemento de LCP** | **o `<h1>`** | `PerformanceObserver`. Se virou `<img>`, o recorte de imagem diminui |

**O número que decide é o de campo, não o de laboratório.** O Sentry já está no ar com
`browserTracing` — temos Web Vitals de visitante real de graça. Comparar a semana anterior com a
posterior a cada deploy, segmentado por mobile. É o único número que responde à pergunta que
interessa: *o movimento custou visitante?* Numa landing que é a porta comercial de um produto com
zero pagante, essa pergunta não é acadêmica.

### 4.3 O que é cortado se estourar, **nesta ordem**

Definido **antes** de codar, para não virar discussão de gosto no dia:

1. **Vídeo.** Não existe ainda; é o mais fácil de não fazer.
2. **Profundidade CSS 3D extra** (glare, translateZ, espessura). É enfeite sobre enfeite.
3. **Esteira de telas: de 8 para 4.** Corta ~160 KB de imagem lazy sem tocar no hero.
4. **Página `/telas/`.** Não está no caminho de conversão.
5. **A linha que se desenha nos 3 passos.** É o único movimento "narrativo" e o plano já registra
   que se pode entregar tudo que o dono pediu sem ele.
6. **O parallax de mouse.** Aí a ilha inteira vira `.astro` estático e caem os ~104 KB **também no
   desktop**. Decisão de produto, mas o número está na mesa.
7. **Último recurso: a screenshot do hero volta a ser markup desenhado.** Só se o LCP não fechar de
   nenhum outro jeito.

**O que NUNCA é cortado:** o bloco institucional (é texto, custa ~0,3 KB e é obrigação legal), os
links legais no rodapé, o favicon correto e o `client:media`. Os quatro são de graça ou negativos em
peso.

**A ordem de prioridade implícita em "elegante, bonito, rápido e eficaz":** nesta landing **rápido é
o que sustenta os outros três**. Uma landing linda que demora 6 s no 4G da rua não converte
prestador nenhum — e o público está no rabo da distribuição de rede (garagem, subsolo, laje, rua),
não na mediana móvel brasileira de 265 Mbps que os relatórios celebram.

---

## 5. O QUE PEDIR AO DONO

Lista fechada, para ele responder de uma vez. **Sem os itens 1–3 o bloco institucional não é
renderizado** — o marcador fica em `empresa.ts` e nada falso vai ao ar.

### Dados (bloqueiam a leva 3)

| # | O que | Por quê |
|---|---|---|
| 1 | **Razão social** | Decreto 7.962/2013 art. 2º, I |
| 2 | **CNPJ** | idem. **Se ainda não existe, o bloco não sai** — e não substituir por CPF pessoal (expor CPF em página pública é risco de fraude para ele mesmo). A própria copy da página já fala com público MEI-literato; abrir o MEI/ME destrava também o gateway de pagamento como PJ |
| 3 | **Endereço completo com CEP** | Decreto 7.962/2013 art. 2º, II |
| 4 | **E-mail de contato** e **e-mail de privacidade/DPO** — e criar as duas caixas | LGPD exige identificar o controlador e o canal do Encarregado |
| 5 | **Nome de quem responde + horário + prazo real** | Vira a frase *"Quem responde é o {nome}. Segunda a sexta, 8h–18h. Resposta em até X horas úteis."* **Só publique o X que ele vai cumprir** — melhor "1 dia útil" cumprido que "na hora" quebrado |
| 6 | **Data de abertura do CNPJ** e **perfis oficiais que existem** | `foundingDate` e `sameAs` do JSON-LD. **Só se reais** — `foundingDate` é verificável no cartão CNPJ |

### Decisões (bloqueiam levas específicas)

| # | Decisão | Bloqueia |
|---|---|---|
| 7 | **Conta de captura do painel:** criar um tenant dedicado e descartável, só para ser fotografado, **ou** autorizar o `demo@grtech.com.br`? Recomendo o tenant dedicado — a conta demo é usada por humanos para outra coisa, e no dia em que alguém a usar com um cliente de verdade, esse nome vai para a landing na próxima captura, em silêncio | Leva 4, telas 6–7 |
| 8 | **CTA principal vira pílula (`rounded-full`)?** §2 explica os dois lados. Se não, fica em 16 px — ainda +33% de arredondamento. Trocar depois custa uma linha | Leva 3 |
| 9 | **Domínio: `useolli.com.br` ou `olliorcamentos.online`?** Está pendente na memória do projeto. Publicar telas, OG-image e (eventualmente) vídeo num domínio que vai mudar é retrabalho garantido em SEO e em links já compartilhados | Levas 4 e 5 |
| 10 | **Blog: ele se compromete com cadência?** Se a resposta for "não sei", a decisão é `regras` + tabelas anuais + `/novidades/`, **sem** categoria de notícia | Leva 5 |

### Materiais (só ele tem)

| # | O que | Para quê |
|---|---|---|
| 11 | **Foto real dele/da equipe em campo** | A seção "Feita por quem vive de campo" (`index.astro:438`) já é a melhor peça de confiança da página, e o comentário no código diz que "o slot está pronto pra foto real". Sem banco de imagens — foto de banco enfraquece |
| 12 | **Um número real da GR Tech** (anos de operação, equipamentos atendidos, ordens/mês) | Prova de **domínio do ofício**, não de base de clientes. Honesto desde que rotulado "na GR Tech", nunca "clientes OLLI" |
| 13 | **Logo em vetor + cores de marca** (dele ou de um cliente fictício bem feito) | A tela 8 (PDF white-label) é um dos argumentos de upgrade mais fortes e precisa de uma marca de verdade para não parecer maquete |
| 14 | **10 minutos de conversa sobre um ofício real** | O roteiro do vídeo e as pautas do blog ficam muito melhores saindo de um caso verdadeiro. É o insumo mais barato e mais valioso da lista, e nenhuma ferramenta substitui |
| 15 | **`ffmpeg` instalado** (não está — conferido) | Bloqueio nº 1 do vídeo. É grátis e é um download. Sem ele: não dá para converter, queimar legenda, cortar nem gerar pôster |
| 16 | **Revisão jurídica dos textos legais** | Independente da leva 1: tirar o aviso da tela hoje, agendar a revisão em paralelo. As duas coisas não se substituem |

⚠️ **Aviso operacional:** vários MCPs deste ambiente (Cloudflare, Figma) **não estão autenticados**, e
sessões de agente são não-interativas. Autorizar exige `claude mcp` / `/mcp` numa sessão interativa.
Não é falta de ferramenta — é falta de login. **Nada neste plano depende disso**; o Figma seria
bom-de-ter para molduras de aparelho, que hoje saem de CSS.

---

## 6. O QUE NÃO FAZER — lista fechada

Consolidada dos quatro documentos, sem repetição.

**Movimento**
- GSAP/ScrollTrigger (~40 KB gzip na main thread pelo que o browser faz com 0 KB).
- Manter a entrada e "só deixar mais lenta" — o problema é o gatilho, não os milissegundos.
- `IntersectionObserver` como fallback com movimento — entrega scroll-*triggered*, que é o que o
  dono rejeitou, ao custo de JS novo e um segundo caminho de código para 3,3% da audiência.
- `animation-timeline` sem `@supports` — é o bug de conteúdo invisível.
- Animar `width` (barra de 82%), `height` (`<details>` do FAQ), `box-shadow` ou `border-radius`.
- Animar transform no card de plano em destaque — derruba o `lg:-translate-y-3`.
- Animar os `blur-3xl` do hero (`index.astro:245-246`, dois radiais de 38 e 34 rem) — repintar
  gradiente borrado de tela cheia por frame.
- Animar os 8 cards de Recursos — reveal vira ruído.
- Count-up nos números da barra de confiança — o número muda enquanto a pessoa lê, e o número é a
  prova.
- Marquee em loop infinito na esteira; scroll hijacking; Lenis/ScrollSmoother.
- `will-change` espalhado — camada por elemento piora em Android com pouca RAM.
- `content-visibility: auto` neste ciclo — interação com timelines de scroll não testada aqui, e o
  sintoma de falha é confundível com falta de suporte.

**Telas, 3D e vídeo**
- Publicar screenshot capturado com login em conta de cliente real — nem "só para testar".
- As ~100 telas na home.
- Spline / Three.js / R3F — e **não abrir o CSP** para acomodá-los.
- Vídeo com autoplay no hero — vira o LCP e afunda a página no 4G.
- JPEG em screenshot de UI ("ringing" em volta de cada letra).
- Capturar sem congelar o relógio e sem `reducedMotion: 'reduce'`.
- Deixar as telas envelhecerem em silêncio — sem recaptura, a landing volta a mostrar um produto que
  não existe.

**Confiança**
- Selo inventado ("Site Seguro", "Empresa Verificada"). O RA Verificada é pago e auditado
  mensalmente; desenhar algo parecido é uso indevido de marca alheia.
- Depoimento inventado, mesmo "ilustrativo", mesmo com aviso em letra miúda.
- "Milhares de clientes" / "+X empresas" / "líder de mercado" — é o jogo do concorrente, e jogar sem
  as fichas quebra na primeira ligação de vendas.
- `aggregateRating` no JSON-LD — já barrado no código com comentário; **manter barrado**.
- `LocalBusiness` no schema — a OLLI é SaaS nacional, o cliente nunca vai ao endereço.
- Logo da GR Tech como "cliente" — ela é a **origem**, e "nascemos aqui" é verdadeiro e mais
  interessante.
- Publicar um CNPJ que não existe; substituir por CPF pessoal; "desde 2015" inflado.

**Ícone**
- Redimensionar `assets/icon.png` (a margem de ícone de app produz marca minúscula).
- Adicionar manifest "só para garantir" — manifest existindo é superfície que alguém no futuro
  promove a `standalone` sem entender o histórico.
- Registrar service worker. Nem para cache, nem "só na landing".
- Gerar 20 tamanhos. Cinco arquivos cobrem o caso.

**Blog**
- 30 posts de IA numa tacada (*scaled content abuse*).
- `/blog/[categoria]/[slug]/`; ano ou data no slug; categoria com menos de 4 posts.
- Canonicalizar categoria/paginação para `/blog/` — faz o Google descartar as páginas 2+ e, com
  elas, os posts que só são linkados de lá.
- `@astrojs/mdx` enquanto os posts forem prosa (traz a tentação de script inline por post, e o CSP
  tem ~12 hashes de folga).
- Ilha React no post; imagem externa; `<iframe>` de YouTube.
- Inventar autor, redação ou "equipe editorial".
- Prometer no post o que o app não faz — a lista do que a OLLI **não** faz já existe em
  `llms.txt.ts:87-94` e é a fonte para revisar cada post. Casos concretos: NR-10 (checklist
  `disponivel: false`) e nota fiscal (não emite).
- Escrever para dono de casa, por mais tentador que seja o volume.

**Geral**
- Mexer em `web/` enquanto outra onda estiver editando. Rebase antes de cada leva.
- Reintroduzir Spectral / `--font-display` na landing.
- Estender a escala de raio ao painel nesta onda.

---

## 7. Fontes

**Verificado por mim nesta sessão** (comandos no worktree, 18/07/2026): bytes do
`web/public/favicon.ico` (`89 50 4E 47` = PNG, não ICO) · tamanhos gzip do `dist/` (§0.2) ·
comprimento da linha de CSP no `dist/_headers` (1.338) · 6 subsets de Rubik e ausência de
`<link rel="preload">` no `dist/index.html` · `font-display: swap` nos seis `@font-face` ·
`Footer.astro` (variante `minimal` sem link legal) · `Layout.astro:85-86` (tags de ícone) e `:108`
(`og:type` fixo) · `global.css:90-101` (regra cega) e `:57` (`overflow-x: hidden`) · linhas reais de
`index.astro` pós-onda-da-fonte (295 / 427 / 473 / 505) · diff da onda da fonte em `web/` e
`webapp/` · `src/theme/fonts.ts` ainda em Spectral.

**Fatos do mundo, pesquisados hoje:**
[MDN — Firefox 152 (jun/2026): scroll-driven ainda atrás de `layout.css.scroll-driven-animations.enabled` no stable](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152) ·
[MDN — Scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) ·
[Sentry — Tree Shaking / `bundleSizeOptimizations`](https://docs.sentry.io/platforms/javascript/configuration/tree-shaking/) (~5 KB gzip com `excludeDebugStatements`)

**Herdadas dos quatro documentos** (cada uma com URL no documento de origem): Chrome for Developers
(scroll-driven roda fora da main thread) · caniuse `animation-timeline` · Statcounter mobile Brasil
jun/2026 · adoção de iOS 26 · GSAP grátis desde 30/04/2025 · web.dev Core Web Vitals · Lighthouse
"Slow 4G" 1,6 Mbps/150 ms · Cloudflare Workers static assets (25 MiB/arquivo, egress grátis;
`_headers` 2.000 chars/linha, 100 regras) · Cloudflare Stream pricing · caniuse AVIF · Spline
runtime 1,9 MB/544 KB gzip e 17,9 s de CPU · three.js ~155 KB gzip · Astro Content Collections,
RSS, sitemap, `client:media` · Google Search spam policies (*scaled content abuse*) · Google News
sem submissão desde 25/04/2024 · Decreto 7.962/2013 art. 2º · Google Organization structured data ·
Google favicon >48×48 · MDN/web.dev critérios de instalabilidade de PWA · NN/g fatores de
credibilidade · Reclame AQUI / CNDL (77% abandonam por desconfiança) · rodapés de Field Control,
Auvo e Bling conferidos em 18/07/2026.

**Documentos internos sintetizados:** `docs/ENXAME/LANDING_BLOG_SEO.md` ·
`docs/ENXAME/LANDING_MOTION.md` · `docs/ENXAME/LANDING_3D_E_TELAS.md` ·
`docs/ENXAME/LANDING_CONFIANCA.md` · `docs/ENXAME/CATALOGO_VISUAL.md` ·
`docs/ENXAME/IDENTIDADE_APP_SITE.md` · `docs/ENXAME/DIFERENCIACAO_UAU.md` · `docs/LANDING_BRIEF.md` ·
`docs/MOTION_SPEC.md`.
