# LANDING_MOTION — movimento dirigido pelo scroll na landing (web/)

> Escopo: **só `web/`** (Astro 7 + Tailwind 4, servido na raiz `olliorcamentos.online`).
> Complementa `docs/MOTION_SPEC.md`, que declara na primeira linha: *"**Não** cobre a landing de vendas."*
> Complementa `docs/LANDING_BRIEF.md` §3D/perf — onde discordo dele, digo onde e por quê (§3.5).
> **Este documento não altera código.** Outra onda está editando `web/` (troca de fonte) nesta janela.

---

## 0. Decisão em cinco linhas

1. **Mecanismo: CSS scroll-driven nativo** (`animation-timeline: view()` / `scroll(root)`) — **0 KB de JS**, roda fora da main thread, e cobre **~95% do tráfego mobile brasileiro** (conta em §3.2).
2. **GSAP/ScrollTrigger: NÃO.** A licença deixou de ser problema (é grátis desde 30/04/2025), mas o peso não se justifica: ~40 KB gzip para fazer o que o browser faz de graça.
3. **Motion (`motion/react`, já no `package.json`): fica, mas encolhe** — só dentro do `HeroDevices`, e só onde há mouse. Ver §3.4 e §7.2.
4. **A queixa do dono não é de duração — é de gatilho.** A animação de hoje dura 950–1000 ms e termina ~1,2 s depois do load. Ele nunca a vê. Deixá-la "mais lenta" no mesmo gatilho não resolve nada; trocar o gatilho resolve tudo. §2.
5. **Nada acima da dobra entra de `opacity: 0`.** O H1 é o LCP. Regra que o `LANDING_BRIEF.md:119` já tinha fixado — aqui ela vira restrição arquitetural do mecanismo, não recomendação.

---

## 1. O que existe hoje (lido no código, com números)

### 1.1 Animação

A landing inteira tem **uma** animação de verdade. Grep em `web/src` por `IntersectionObserver`, `animation-timeline`, `@keyframes`, `whileInView`, `useInView`: **zero ocorrências**. O único resultado é `index.astro:291`, `<HeroDevices client:load />`.

| Onde | Arquivo | O que faz |
|---|---|---|
| Entrada do browser mockup | `web/src/components/HeroDevices.tsx:86-92` | `initial={{opacity:0, y:48, rotateY:20}}` → `animate`, `duration: 0.95`, ease `[0.16,1,0.3,1]` |
| Entrada do phone | `HeroDevices.tsx:108-113` | `initial={{opacity:0, y:72, rotateY:-22}}` → `animate`, `duration: 1`, **`delay: 0.18`** |
| Parallax de mouse | `HeroDevices.tsx:25-47` | `useMotionValue` + `useSpring` (stiffness 120, damping 18) → `rotateX/rotateY`. Sem `setState` por frame — está bem feito. |
| Hover de card/botão | `index.astro` (várias) | Utilitários `transition` do Tailwind. Sem token de duração. |
| Reduced-motion | `global.css:90-101` | Regra cega: `animation-duration: 0.01ms !important` em `*`. Ver §4.3 — **isto vai atropelar scroll-driven**. |

### 1.2 Tokens

Existe **um** token de motion no projeto inteiro: `--ease-out-soft: cubic-bezier(0.16,1,0.3,1)` (`global.css:39`). E ele **não é usado** pelo `HeroDevices`, que repete a mesma curva cravada em dois lugares (`:91` e `:112`). Todo o resto — 0.95, 1, 0.18, 48, 72, 20, -22, 120, 18 — é número mágico. O app tem `src/theme/motion.ts` como fonte única (`MOTION_SPEC.md` §2); a landing não tem equivalente.

### 1.3 Custo atual, medido no `dist/` deste worktree

```
index.html                  16,4 KB gzip
Layout.<hash>.css           10,6 KB gzip
page.<hash>.js              48,0 KB gzip   ← Sentry browser SDK + browserTracing
client.<hash>.js            57,2 KB gzip   ← react-dom (renderer da ilha)
HeroDevices.<hash>.js       44,3 KB gzip   ← motion + o markup dos mockups
react.<hash>.js              3,3 KB gzip
```

`index.html` traz `client="load"`, `component-url=/_astro/HeroDevices…js`, `renderer-url=/_astro/client…js`. Ou seja: **~105 KB gzip de JS hidratam no load** (react-dom + motion + HeroDevices) para entregar (a) uma animação de entrada de 1 s e (b) um parallax de mouse.

**No celular do prestador brasileiro, (b) não existe** — não há mouse. Sobra (a): ~105 KB gzip (≈ 330 KB de JS para parsear e executar) por uma animação que o dono já disse que não vê.

> Nota lateral, fora do meu escopo mas honesta: o maior JS da página é o **Sentry (48 KB gzip)**, não o hero. Quem for cortar bytes deveria olhar para lá também. Do lado bom: o `browserTracing` já está ligado, então **temos Web Vitals de campo de graça** — uso isso em §7.3.

---

## 2. Animação de entrada ≠ animação dirigida pelo scroll

O dono descreveu com precisão duas coisas diferentes. Vale separar, porque muda a implementação inteira.

| | **Entrada (o que existe)** | **Scroll-triggered** | **Scroll-driven (o que ele pediu)** |
|---|---|---|---|
| O que dispara | montagem do componente | o elemento cruzar a viewport | nada dispara — não há gatilho |
| Quem controla o progresso | o relógio (`duration`) | o relógio, depois do gatilho | **a posição da rolagem** |
| Rolar para trás | nada acontece | nada acontece (ou repete) | **desfaz, na mesma proporção** |
| Como se implementa | `transition: { duration }` | `IntersectionObserver` + classe | `animation-timeline` |
| Falha típica | acaba antes de você olhar | evento perdido → `opacity:0` eterno | conteúdo escondido em browser sem suporte |
| "Mais lento" significa | aumentar ms | aumentar ms | **aumentar distância de rolagem** |

**A consequência que muda o produto:** em scroll-driven, a duração em segundos deixa de ser decisão nossa — vira do polegar dele. Se ele rolar devagar, é devagar; se der um flick, termina rápido. É *exatamente* o que ele pediu ("enquanto eu vou descendo vai fazendo coisa"). O que continuamos controlando é a **distância** (§5.2).

**A consequência de engenharia:** scroll-driven não tem estado. Não existe "evento perdido". Se ele chegar por `#planos` (o header tem 4 âncoras — `index.astro:232-235`), recarregar no meio da página, ou o navegador restaurar a posição de scroll, cada elemento resolve seu progresso pela **posição**, não por um evento que pode ter passado. Isso elimina de saída a classe de bug mais comum de reveal na web.

---

## 3. Escolha de mecanismo

### 3.1 Os quatro candidatos

| | JS enviado | Faz scroll-**driven**? | Roda fora da main thread | Licença | Veredito |
|---|---|---|---|---|---|
| **CSS `animation-timeline`** | **0 KB** | Sim | Sim ([Chrome docs](https://developer.chrome.com/docs/css-ui/scroll-driven-animations): *"running off the main thread"*) | web platform | ✅ **base de tudo** |
| `IntersectionObserver` + CSS | ~0,5 KB | **Não** (só dispara) | animação sim, observer sim | web platform | ⚠️ só se precisarmos de fallback com movimento — §4.2 |
| **Motion** (já instalado) | 5,1 KB o `scroll()` avulso; **~105 KB gzip a ilha React inteira** | Sim (usa `ScrollTimeline` nativo quando dá) | quando cai no ScrollTimeline | MIT | ⚠️ **só no `HeroDevices`** — §3.4 |
| **GSAP + ScrollTrigger** | ~22 KB + ~18 KB gzip | Sim | Não (rAF na main thread) | grátis desde 30/04/2025 | ❌ **não** — §3.3 |

### 3.2 Suporte — a conta que importa é a do público, não a global

O número que se cita normalmente é o global do caniuse: **83,66%** para `animation-timeline: scroll()`. Ele subestima o nosso caso, porque o público é prestador **brasileiro, em celular**.

Suporte por browser (caniuse / MDN):
- **Chrome/Edge 115+** — desde julho/2023. Chrome for Android atual: 150+.
- **Safari 26.0+** (incl. iOS 26) — chegou em setembro/2025.
- **Firefox** — ainda atrás da flag `layout.css.scroll-driven-animations.enabled` no stable; ship previsto para a **155**. Não é Baseline por causa disto.

Mix real de browser mobile no **Brasil** (Statcounter, junho/2026): Chrome **80,98%** · Safari **13,5%** · Samsung Internet **3,94%** · Opera 0,64% · **Firefox 0,43%** · Brave 0,2%.
Adoção de iOS 26 (Apple, dado de 07/06/2026): **79%** de todos os iPhones.

Conta, com as premissas à vista:

```
Chrome mobile                        80,98%  → suporta (versões < 115 são resíduo)
Samsung Internet (Chromium)           3,94%  → suporta nas versões correntes
Safari  13,5% × 79% em iOS 26        10,67%  → suporta
──────────────────────────────────────────────
estimativa de cobertura                ~95%
Safari em iOS ≤ 18   13,5% × 21%      2,84%  → fallback
Firefox                               0,43%  → fallback (até a 155)
```

**~95% do tráfego mobile brasileiro anima; ~3,3% cai no fallback.** É estimativa, não medição — mas as três entradas são públicas e citadas. E o fallback é "não anima", não "quebra" (§4.1).

### 3.3 Por que **não** GSAP (a regra 3 exige justificar, e eu não consigo)

A objeção histórica caiu: a GSAP é **100% grátis desde 30 de abril de 2025**, plugins de Club inclusos (ScrollTrigger, ScrollSmoother), uso comercial coberto pela Standard License. A regra 12 está satisfeita. O problema é outro:

- **Peso:** ~22 KB (core) + ~18 KB (ScrollTrigger) gzip = ~40 KB de JS **acrescentados** a uma página que pode fazer isto com 0 KB. Em 4G no meio da rua, isso é tempo de tela em branco.
- **Thread:** ScrollTrigger sincroniza no `requestAnimationFrame` da main thread. Scroll-driven CSS não. Numa página que já tem `backdrop-blur-lg` num header sticky (`Header.astro:31`) e dois `blur-3xl` de tela cheia no hero (`index.astro:245-246`), competir por main thread é a última coisa que queremos.
- **Necessidade:** nada no roteiro do §6 pede pin, scrub com `normalizeScroll`, timeline encadeada ou morph. É tudo `translateY` + `opacity` + `scaleX`.

GSAP passa a valer a pena quando houver uma seção de scrollytelling de verdade (pin + sequência longa). Não é o caso desta página. **Não propor.**

### 3.4 O papel que sobra para o Motion

O Motion já está no bundle e tem uma vantagem real que a doc dele declara: *"the only animation library that runs scroll-linked animations on the browser's native `ScrollTimeline` where possible"*. Mas ele só existe onde há ilha React hidratada — e hidratar ilha ao longo de uma página estática seria a pior decisão de performance disponível aqui.

**Regra:** Motion **só** dentro de `HeroDevices.tsx`, e só para o que exige JS de verdade — o **parallax de mouse**, que depende de coordenadas do cursor. Todo o resto da página, incluindo a própria movimentação do hero no scroll, é CSS.

### 3.5 Onde eu discordo do `LANDING_BRIEF.md` (e onde concordo)

O brief já tratou de 3D/motion do hero. Não vou reapresentar como novo o que ele já decidiu:

**Já era dele, e continua valendo — não mexo:**
- `:119` — "H1 **NUNCA** entra de `opacity:0` (LCP deve ser o texto)". Adotado como restrição de mecanismo (§6.1).
- `:114` — rejeição de three.js/R3F/Spline (>150 KB, game-loop, CSP `connect-src 'self'`). Mantida; nada aqui reabre isso.
- `:119` — gate `matchMedia('(pointer: fine)')` no parallax. Eu levo isso um passo adiante em §7.2.
- `:67`/`:119` — alvos LCP≤2,5 s / INP≤200 ms / CLS≤0,1 e "reduzir os blobs `blur-3xl`". Confirmados e reforçados (§7.1, §8).
- `:115` — armadilha do `overflow-hidden` matando `preserve-3d` nos filhos. Continua real.

**Onde eu divirjo, com dado novo:**
- `:118` diz: *"(d) MOBILE (sem mouse): tilt ligado ao scroll com `useScroll`+`useTransform`. NÃO apostar em CSS `animation-timeline:view()` como via única (Firefox stable atrás de flag em jun/2026); se usar, `@supports` + fallback."*
  A cautela estava certa **para o global**. Mas medindo o público real (§3.2), Firefox é **0,43%** do mobile brasileiro — e a alternativa proposta (`useScroll`/`useTransform`) exige manter os ~105 KB gzip da ilha React hidratados **no celular**, que é justamente o aparelho que não pode pagar. Trocar 0,43% de cobertura por 105 KB no dispositivo mais fraco é um mau negócio.
  **Proposta:** CSS scroll-driven como via principal, com o `@supports` + fallback que o próprio brief autoriza. Motion fica só onde há mouse.

---

## 4. Fallback — o conteúdo nunca some

### 4.1 A regra que impede o bug clássico

O bug clássico de reveal é conteúdo com `opacity: 0` esperando um scroll que nunca vai animar. Ele não pode acontecer aqui, e a proteção é estrutural, não uma verificação manual:

> **O estado base do CSS é o estado FINAL, visível.** A opacidade/deslocamento inicial existe **só dentro do `@keyframes`**, e o `@keyframes` só é aplicado dentro de dois guardas. Browser que não entende `animation-timeline` ignora a declaração inteira e vê a página pronta.

```css
/* base: é isto que 100% dos visitantes veem se tudo mais falhar */
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
  /* opacidade resolve ANTES do movimento: texto legível cedo, movimento assenta depois */
  from   { opacity: 0; transform: translateY(var(--olli-sobe-md)); }
  60%    { opacity: 1; }
  to     { opacity: 1; transform: none; }
}
```

Três consequências, todas boas:
- Firefox stable / iOS ≤ 18 → página estática, completa, legível. Nenhuma penalidade de SEO (o HTML é o mesmo; a landing é SSG).
- `prefers-reduced-motion: reduce` → a animação **nunca é declarada**. Não é "declarada e neutralizada" — não existe.
- Leitor de tela / crawler → indiferentes; nada depende de JS.

### 4.2 O fallback deve mover alguma coisa?

**Não.** `IntersectionObserver` só entrega scroll-*triggered*, que é o gatilho que o dono acabou de rejeitar — daria a 3,3% da audiência um comportamento **diferente** e pior, ao custo de JS novo e de um segundo caminho de código para manter. Página estática é um fallback legítimo, não um defeito.

**A exceção que precisa de cuidado é o hero** (§6.1): ele não "revela", ele **rearranja**. Se o rearranjo não acontecer, o visitante vê a pose inicial parada. Daí a regra:

> **A pose de progresso 0% do hero tem que ser uma composição que você assinaria como o hero definitivo.** Se ela parecer "meio montada", o desenho está errado — não o fallback.

### 4.3 ⚠️ Armadilha específica desta base: a regra cega de reduced-motion

`web/src/styles/global.css:90-101`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Para animação baseada em tempo, isso funciona (salta para o estado final). Para animação de **progresso**, `animation-duration` tem outro papel: sob timeline de scroll a duração precisa ser `auto` para ocupar o range inteiro; um valor de tempo comprime os keyframes numa fatia do range — e com `!important` de `0.01ms` o efeito prático é o card ficar no estado `from` (invisível) pelo range quase todo e "estalar" no fim. **É o bug do §4.1 entrando pela porta dos fundos, via a regra que existe justamente para proteger.**

**Correção:** nunca depender dessa regra para scroll-driven. Declarar tudo dentro de `@media (prefers-reduced-motion: no-preference)` (§4.1) — sem animação declarada, não há duração para atropelar. A regra cega continua útil para hover/transições e deve ficar.

### 4.4 ⚠️ Segunda armadilha: `body { overflow-x: hidden }`

`global.css:57`. Em CSS, quando um eixo é `visible` e o outro não, o `visible` computa para `auto` — o elemento pode virar container de scroll. No `<body>` normalmente o overflow **propaga para a viewport** e não cria um scroller novo, então provavelmente está tudo bem. Mas "provavelmente" não é um plano: se `view()` resolver contra o scroller errado, as animações simplesmente não rodam, e o sintoma (página estática) é indistinguível de "browser sem suporte".

**Ação:** testar explicitamente antes de acreditar. Se romper, `overflow-x: clip` resolve — `clip` **não** cria container de scroll. Custo: **P**.

Bônus relacionado: `html { scroll-behavior: smooth }` (`global.css:49`) mais as âncoras do header significa que clicar em "Planos" vai varrer todas as animações do caminho na velocidade do smooth-scroll do browser. Isso é correto e desejável — não fazer nada.

---

## 5. Tokens

Onde moram: `web/src/styles/global.css`, dentro do bloco `@theme` que já existe (Tailwind 4 é CSS-first — nada de arquivo de config novo, nada de dependência). Mesmo princípio do `MOTION_SPEC.md` §2: **número de motion em componente é bug de revisão.**

### 5.1 Duração — só para o que ainda é baseado em tempo

Scroll-driven não usa duração. Estes tokens governam hover, foco, o header e o `<details>` do FAQ — que continuam por tempo.

| Token | Valor | Onde |
|---|---|---|
| `--olli-dur-1` | **160 ms** | hover/foco de link e chip. Mesmo número do `dur.fast` do app — as duas casas passam a falar a mesma língua. |
| `--olli-dur-2` | **260 ms** | hover de card (o `hover:-translate-y-1` dos cards de ofício, `index.astro:348`), botão. |
| `--olli-dur-3` | **420 ms** | mudança de estado maior (abrir/fechar). Teto. |

Acima de 420 ms em interação por tempo, a interface deixa de responder e começa a fazer o usuário esperar. Hoje esses valores são o default do Tailwind (150 ms) em toda parte, sem intenção.

### 5.2 Alcance — é **este** o token que significa "mais lento"

Este é o pedido do dono traduzido em número. Distância de rolagem que a animação consome:

| Token | Valor | Rolagem aproximada (celular 390×844) | Uso |
|---|---|---|---|
| `--olli-alcance-1` | `25%` (de `cover`) | **~260 px** | item de grade, chip, linha |
| `--olli-alcance-2` | `35%` (de `cover`) | **~365 px** | **padrão**: card, bloco de texto, seção |
| `--olli-alcance-3` | `50%` (de `cover`) | **~520 px** | só peça grande (hero, painel da IA) |

Como ler: a fase `cover` de um elemento dura `altura da viewport + altura do elemento`. Para um card de ~200 px numa tela de 844 px, `cover` = 1044 px; 35% disso ≈ 365 px de rolagem.

**Por que não mais lento que isso** — e essa é a resposta honesta ao "deixa lenta":

> **Teto:** a revelação tem que terminar **antes** de o elemento chegar a ~55% da altura da tela, que é onde ele fica confortável de ler. Passar disso é entregar texto meio transparente para alguém que já está tentando lê-lo — e aí a irritação é maior do que a de rápido demais. `--olli-alcance-3` (~520 px) já está perto desse teto num celular. **Não subir daí sem testar em aparelho real.**

E o ponto que precisa estar claro para o dono: com scroll-driven, **um flick rápido termina a animação em ~300 ms de relógio**. Isso não é "mais rápido do que hoje ficou ruim" — é ele no controle. Se ele quiser ver devagar, ele rola devagar, e a animação obedece. É a diferença entre um vídeo e um manípulo.

### 5.3 Distância

| Token | Valor | Uso |
|---|---|---|
| `--olli-sobe-sm` | **8 px** | chip, linha de lista |
| `--olli-sobe-md` | **16 px** | card, parágrafo — **padrão** |
| `--olli-sobe-lg` | **28 px** | bloco grande, hero |

**Teto de 28 px, e é firme.** Hoje o hero usa **48 px e 72 px** (`HeroDevices.tsx:89,110`) — números de animação de entrada, onde o elemento vem "de fora". Em scroll-driven o elemento já está entrando na tela por conta da rolagem; somar 72 px de deslocamento próprio faz ele parecer atrasado em relação ao dedo, como se a página estivesse travando. **Movimento dirigido pelo scroll quer distância curta.**

### 5.4 Easing

| Token | Valor | Uso |
|---|---|---|
| `--ease-out-soft` | `cubic-bezier(0.16,1,0.3,1)` | **já existe** (`global.css:39`) — fica para o que é por tempo (hover, foco) |
| `--olli-ease-scroll` | **`linear`** | **todo** scroll-driven |

Isto é contraintuitivo e é a decisão técnica mais importante do §5. A curva atual é uma expo-out agressiva: ~97% do progresso nos primeiros 50% do tempo. Excelente para entrada (o elemento "chega" e assenta). **Péssima para scroll**: o visitante rola 30% do alcance, a animação já está praticamente terminada, e os outros 70% de rolagem não produzem nada visível. Ele percebe isso como "quebrado", não como "suave".

Em scroll-driven a curva certa é `linear` — progresso 1:1 com o dedo. A sensação de "ease" vem do §4.1: a **opacidade fecha em 60% do range** e o transform continua até 100%. O texto fica legível cedo, o movimento assenta depois. Ease sem mentir sobre o progresso.

### 5.5 Stagger

| Token | Valor | Uso |
|---|---|---|
| `--olli-stagger` | **6%** do range por item | **máx. 3 passos**; só nos "3 passos" (§6.4) |

E a recomendação de engenharia é: **não construir maquinaria de stagger para as grades.**

Com `view()`, cada elemento tem sua própria timeline, derivada da **posição** dele. No celular — que é o público — todas as grades da landing são de **uma coluna**, então o stagger acontece sozinho, de graça, e é *espacial* em vez de temporal (é a rolagem que separa os itens, não um `delay`). No desktop, itens da mesma linha compartilham o `Y` e animam juntos, o que é aceitável e até mais calmo.

Se algum dia for preciso escalonar uma linha: deslocar `animation-range-start` **e** `-end` por item (`calc()` com um `--col` inline) para o alcance não encolher. Conferir `calc()` dentro de `animation-range` no browser antes — não testei.

---

## 6. O roteiro da página, seção por seção

Ordem do `web/src/pages/index.astro`. A coluna que mais importa é a última.

| # | Seção | Linhas | Anima? |
|---|---|---|---|
| 1 | Header sticky | `Header.astro:31` | **Não** |
| 2 | Hero — texto e CTA | `:254-287` | **Não** |
| 2b | Hero — dispositivos | `:290-292` | **Sim** — parallax de scroll |
| 3 | Barra de confiança | `:297-319` | **Não** |
| 4 | Feito pro seu ofício | `:332-367` | **Sim** — revelação |
| 5 | Como funciona | `:370-384` | **Sim** — revelação + linha que desenha |
| 6 | Recursos (8 cards) | `:387-405` | **Só o cabeçalho** |
| 7 | Destaque IA | `:408-430` | **Sim** — a barra de confiança preenche |
| 8 | Origem / GR Tech | `:438-457` | **Não** |
| 9 | Planos | `:460-493` | **Sim** — revelação, com armadilha (§6.7) |
| 10 | FAQ | `:496-512` | **Não** |
| 11 | CTA final | `:515-521` | **Sim** — revelação |
| 12 | Rodapé | `Footer.astro` | **Não** |

**7 de 12 não se mexem.** Isso é deliberado (regra 13/14): se tudo anima, nada tem destaque, e uma página em que cada bloco treme enquanto se rola é cansativa de ler — e é uma página de venda, feita para ser lida.

### 6.1 Hero — o coração do pedido

**O que muda:** a animação de entrada de `HeroDevices.tsx:86-115` (`initial`/`animate`, 950 ms + 1000 ms com `delay: 0.18`) **é removida**. No lugar, os dispositivos ficam ligados à rolagem.

**Como, tecnicamente** — e aqui está a sutileza que decide entre funcionar e não funcionar:

Não dá para usar um range de `entry` no hero. `entry` é a fase em que o elemento *entra* na viewport; no desktop os dispositivos já estão inteiramente visíveis no scroll 0, então `entry` já terminou e a animação nasceria em 100% — parada. Usar `cover` resolve: `cover` cobre todo o período em que o elemento intersecta a viewport, então no load o hero está em algum ponto **no meio** do range e continua progredindo conforme se rola.

```css
/* wrapper do HeroDevices, no HTML estático do Astro (fora dos overflow-hidden) */
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .hero-phone   { animation: hero-phone   linear both;
                    animation-timeline: view(); animation-range: cover; }
    .hero-browser { animation: hero-browser linear both;
                    animation-timeline: view(); animation-range: cover; }
  }
}
@keyframes hero-phone {
  from { transform: translateY(18px)  rotateY(4deg); }
  to   { transform: translateY(-18px) rotateY(12deg); }
}
```

**Nada de `opacity` aqui.** Os dispositivos estão sempre visíveis, em qualquer progresso; o que muda é a **pose relativa** — o telefone desliza e gira em relação ao browser, o leque abre conforme se desce. É isso que ele descreveu: *"enquanto eu vou descendo vai fazendo coisa"*.

E é o que resolve os três problemas de uma vez:
- **LCP:** nenhum elemento acima da dobra começa transparente (`LANDING_BRIEF.md:119`).
- **Fallback:** sem suporte, os dispositivos ficam na pose do meio do range — que é (por construção) a composição que já está no ar hoje. Ninguém perde nada.
- **A queixa:** não acontece mais no load. Acontece no dedo dele.

**Texto, CTA e chips do hero: intocados.** O H1 é o LCP; os CTAs são o que converte. Se o botão "Criar meu primeiro orçamento" chegar 300 ms depois porque está fazendo fade, a animação custou dinheiro literal. Esforço: **M**.

### 6.2 Barra de confiança — não animar, e principalmente **sem count-up**

`R$ 0 · 6 ofícios · 21 calculadoras · 698 códigos` (`:307-311`). Está logo abaixo da dobra: em celular, muitas vezes já visível sem rolar. Contador que sobe é o clichê da categoria e é ativamente ruim aqui: o número **muda enquanto a pessoa lê**, e o número é a prova. `698` tem que ser `698` no primeiro frame. Esforço: **zero (não fazer)**.

### 6.3 Feito pro seu ofício — revelação padrão

6 cards + 1 tracejado (`:345-360`). `.olli-revela` com `--olli-alcance-2` (~365 px) e `--olli-sobe-md` (16 px). No celular vira 1 coluna e o escalonamento sai de graça (§5.5). Esforço: **P**.

### 6.4 Como funciona — o momento em que a página "faz coisa"

Três passos (`:376-382`). Além da revelação, é aqui que cabe **uma** animação verdadeiramente dirigida pelo scroll, e é o melhor lugar da página para ela: uma linha ligando 01 → 02 → 03 que **se desenha** conforme se desce. É `transform: scaleX()` (ou `scaleY` no celular, onde a grade é vertical) com `transform-origin` na ponta — transform puro, composita, custo próximo de zero.

Vale porque o movimento **carrega significado**: a linha crescendo *é* o progresso do fluxo de trabalho que o texto está descrevendo. É o P1 do `MOTION_SPEC.md` ("movimento comunica estado") aplicado à landing. Único lugar onde o stagger de `--olli-stagger` faz sentido (3 itens, 3 passos, teto batido). Esforço: **M**.

### 6.5 Recursos — só o cabeçalho, e isto é uma recomendação de conter

8 cards em grade de 4 (`:394-402`). **Não animar os cards.** Oito elementos entrando é onde reveal vira ruído — e no celular são 8 revelações seguidas, uma atrás da outra, na mesma rolagem. É a regra 14 (tela densa: motion funcional vence motion cinematográfico) e é o "light touch" que o NN/g cobra e que o `MOTION_SPEC.md` §P1 já adotou para o app.

Anima só o `<h2>` da seção, com `--olli-alcance-1`. Se depois de ver no ar o dono quiser os cards, a alternativa menos ruim é **opacity apenas, sem deslocamento** (`--olli-sobe-*` = 0): a página respira sem tremer. Esforço: **P**.

### 6.6 Destaque IA — a barra de confiança que preenche

`index.astro:420-426`, a barra "confiança 82%". Hoje: `<div class="h-full rounded-full brand-gradient" style="width:82%">`.

Este é o melhor candidato da página inteira: o preenchimento **conta a história do produto** (a IA calculando a confiança do diagnóstico) em vez de decorar.

**Mas não animar `width`** — regra 6: reflow por frame, e some o benefício de compositor. A conversão certa:

```html
<!-- trilho: já tem overflow-hidden + rounded-full em :422 — ele clipa as pontas -->
<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
  <div class="olli-barra h-full w-full brand-gradient"></div>  <!-- w-full, não width:82% -->
</div>
```
```css
.olli-barra { transform: scaleX(0.82); transform-origin: left; }
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .olli-barra { animation: olli-barra linear both;
                  animation-timeline: view(); animation-range: entry 10% cover var(--olli-alcance-3); }
  }
}
@keyframes olli-barra { from { transform: scaleX(0); } to { transform: scaleX(0.82); } }
```

Detalhe que salva o visual: como o trilho **já** tem `overflow-hidden rounded-full`, o filho pode ser retangular e ainda assim aparecer com pontas arredondadas — sem a distorção de raio que `scaleX` normalmente causa. O estado base (`scaleX(0.82)`, fora dos guardas) garante que quem não anima vê os 82% corretos. Esforço: **P**.

### 6.7 Planos — ⚠️ armadilha de transform

`index.astro:469`: o card em destaque tem `lg:-translate-y-3` **estático**, é assim que ele fica elevado em relação aos outros. Se a revelação animar `transform` **nesse mesmo elemento**, a animação sobrescreve o `translate` do Tailwind e o card **cai** para a linha dos outros quando terminar. O destaque visual do plano Pro — o que a página está tentando vender — some.

**Solução:** animar um **wrapper** em volta do card, nunca o card. Vale como regra geral: elemento que já carrega `transform` estático não recebe animação de transform. Fazer um grep por `translate|rotate|scale` no `index.astro` antes de aplicar `.olli-revela` em qualquer lugar. Esforço: **P** (se souber; **G** em depuração se não souber).

### 6.8 FAQ — não animar

9 `<details>/<summary>` (`:502-510`). O `<details>` nativo é indexável (o `LANDING_BRIEF.md:67` conta com isso) e o browser já entrega a abertura. Animar altura de disclosure é a violação canônica da regra 6, e as soluções (grid-template-rows, `::details-content`) são complexidade sem retorno numa página onde o FAQ é o item menos disputado. O `group-open:rotate-45` do `+` (`:506`) já é transform e já está certo. Esforço: **zero**.

### 6.9 CTA final — revelação sóbria

`:515-521`. `--olli-alcance-2`, `--olli-sobe-md`, sem stagger. É o último pedido de conversão da página: ele tem que estar **cheio e legível** rápido. Esforço: **P**.

---

## 7. Orçamento de performance

### 7.1 Regras invioláveis

1. **Só `transform` e `opacity`.** Nenhuma animação toca `width/height/top/left/margin`. §6.6 mostra a conversão de `width` → `scaleX`. Gate de PR: grep por `@keyframes` seguido de propriedade de layout tem que voltar vazio.
2. **Zero JS novo.** O CSS scroll-driven adiciona **~1 KB gzip** ao `Layout.css` (10,6 KB hoje). Se um PR de motion aumentar o JS da landing, ele está errado.
3. **`will-change` só nos dispositivos do hero.** Chrome já promove animação de transform/opacity sozinho; espalhar `will-change` cria camada por elemento e em Android com pouca RAM isso piora em vez de melhorar. O `LANDING_BRIEF.md:119` já dizia "só onde medido".
4. **Nada de mover os `blur-3xl`.** `index.astro:245-246`: dois radiais de 38 rem e 34 rem com `blur-3xl`. O brief já os apontou como o item mais caro em GPU mobile (`:67`). Ligá-los ao scroll = repintar gradiente borrado de tela cheia por frame. **Proibido.** Se algo tem que se mexer atrás do hero, que sejam os dispositivos (§6.1), não os blobs.
5. **`content-visibility: auto` fica fora** deste ciclo. A interação dele com timelines de scroll não foi testada aqui, e o sintoma de falha (elemento nunca anima) é confundível com falta de suporte.

### 7.2 A grande economia: hidratar a ilha só onde ela serve

Hoje: `<HeroDevices client:load />` (`index.astro:291`) → ~105 KB gzip de react-dom + motion + componente, hidratados no load, **em todo aparelho**.

Depois de §6.1, a única coisa que ainda precisa de JS no hero é o **parallax de mouse**. O que quer dizer que a ilha só precisa hidratar em aparelho **com mouse**:

```astro
<HeroDevices client:media="(hover: hover) and (pointer: fine)" />
```

O Astro renderiza o HTML da ilha no build de qualquer jeito (é SSG), então o hero aparece igual em todo mundo — só não baixa nem executa o JS onde ele não teria função. **No celular do prestador brasileiro: 0 KB de React, 0 KB de Motion, 0 hidratação.** O movimento no scroll continua acontecendo, porque é CSS.

Esta é a maior alavanca de performance deste documento, e ela veio de graça junto com a mudança que o dono pediu. É também a versão mais forte do gate `matchMedia('(pointer: fine)')` que o `LANDING_BRIEF.md:119` já pedia: em vez de ligar/desligar o efeito depois de baixar o código, não se baixa o código.

Se, na revisão, o parallax de mouse não sobreviver ao corte, a ilha inteira vira `.astro` estático e caem os ~105 KB **também no desktop**. Decisão de produto, não minha — mas o número está na mesa.

### 7.3 Alvos e como medir antes/depois

Alvos (já fixados no `LANDING_BRIEF.md:67`; confirmados contra [web.dev/vitals](https://web.dev/articles/vitals), p75 mobile):

| Métrica | Alvo | Por que importa aqui |
|---|---|---|
| **LCP** | ≤ 2,5 s | o LCP é o H1. Nenhuma animação pode tocá-lo (§6.1). |
| **INP** | ≤ 200 ms | scroll-driven CSS não roda na main thread → não deveria mover. Se mover, algo virou JS. |
| **CLS** | ≤ 0,1 | `transform`/`opacity` **não** contam para CLS. Se o CLS subir, alguém animou layout. |
| **FPS na rolagem** | ≥ 55 fps | o teste que representa o público: Android intermediário, rolando a página inteira. |
| **JS da landing** | **não pode subir** | baseline medido: page 48,0 + client 57,2 + HeroDevices 44,3 + react 3,3 KB gzip. |

**Como medir — laboratório (o número do antes/depois):**
1. `npm run build` no `web/`, `npm run preview`.
2. Chrome DevTools → Performance, **CPU 4× throttle + Slow 4G** (é a condição do público, não "sem throttle").
3. Gravar uma rolagem de topo ao rodapé em ~8 s. Ler: frames caídos, main thread durante a rolagem, e o painel Layers para contar camadas compostas.
4. Lighthouse mobile, 3 execuções, mediana. Guardar o JSON de antes.
5. Verificação de bytes, que é objetiva e não depende de máquina:
   ```bash
   cd web && npm run build
   for f in dist/_astro/*.js; do echo "$f $(gzip -c "$f" | wc -c)"; done
   ```
   Comparar com a baseline do §1.3. **A da landing tem que empatar ou cair.**
6. Este ambiente tem o MCP `chrome-devtools` (`lighthouse_audit`, `performance_start_trace`) — dá para automatizar 2–4 e anexar o traço ao PR.

**Como medir — campo (o número que decide):** o Sentry já está no ar com `browserTracing`, que coleta LCP/INP/CLS de visitante real. Comparar a semana anterior com a posterior ao deploy, segmentado por mobile. É o único número que responde à pergunta que interessa: *o movimento custou visitante?* E a landing é a porta de entrada comercial de um produto com zero pagante — essa pergunta não é acadêmica.

**Critério de reversão, definido antes de codar:** se LCP p75 mobile subir mais de 100 ms, ou o INP p75 sair de "bom", o motion volta atrás. Sem discussão de gosto.

### 7.4 Acessibilidade (regra 9)

- **Teclado/foco:** nada aqui muda ordem de foco ou intercepta tecla. Mas o `Tab` pode mandar o foco para um elemento a meio caminho da revelação (`opacity` intermediária); é aceitável porque o browser rola até ele e a timeline resolve pela posição. **Testar mesmo assim:** `Tab` do topo ao rodapé, sem mouse — nenhum destino de foco pode ficar invisível.
- **Leitor de tela:** conteúdo sempre no DOM, sempre visível no estado base. `HeroDevices` já é `aria-hidden="true"` (`:54`) e é decorativo — correto.
- **`prefers-reduced-motion`:** §4.1/§4.3. Testar com o toggle do SO ligado: **nenhum pixel se move ao rolar a página inteira**, e nada fica escondido.
- **Aparelho fraco:** o teste que vale é celular Android intermediário real em 4G — não o desktop do dono com fibra.

---

## 8. O que NÃO fazer (considerado e recusado)

| Recusado | Por quê |
|---|---|
| **GSAP + ScrollTrigger** | ~40 KB gzip por algo que o browser faz com 0 KB, e na main thread. Licença já não é objeção (grátis desde 30/04/2025) — o peso é. §3.3 |
| **Manter a entrada e só aumentar a duração** | Não resolve a queixa. O problema é o gatilho, não os milissegundos. Duração maior no load = o dono espera mais por algo que continua não vendo. §2 |
| **`IntersectionObserver` como fallback com movimento** | Entrega scroll-*triggered*, que é o que ele rejeitou; JS novo e um segundo caminho de código para 3,3% da audiência. §4.2 |
| **Count-up nos números da barra de confiança** | O número muda enquanto a pessoa lê — e o número é a prova. §6.2 |
| **Animar os 8 cards de Recursos** | Reveal vira ruído; regra 14. §6.5 |
| **Animar os `blur-3xl` do hero** | Repintar gradiente borrado de tela cheia por frame; o brief já os apontou como o item mais caro em GPU mobile. §7.1 |
| **Animar `width` da barra de 82%** | Reflow por frame (regra 6). Vira `scaleX`. §6.6 |
| **Animar transform no card de plano em destaque** | Sobrescreve o `lg:-translate-y-3` de `index.astro:469` e derruba o destaque do Pro. §6.7 |
| **Animar a abertura do `<details>` do FAQ** | Animação de altura; e o `<details>` nativo é o que mantém o FAQ indexável. §6.8 |
| **Scroll hijacking, scroll-snap, biblioteca de smooth-scroll (Lenis/ScrollSmoother)** | Tira do usuário o controle da rolagem — o oposto exato do que ele pediu — e briga com o `scroll-behavior: smooth` das âncoras do header. |
| **`animation-timeline` como via única, sem `@supports`** | Firefox stable ainda atrás de flag; sem guarda, é o bug de conteúdo invisível. §4.1 |
| **three.js / R3F / Spline** | Já recusado em `LANDING_BRIEF.md:114` (>150 KB, game-loop, CSP bloqueia o `.splinecode`). Nada aqui reabre. |
| **`will-change` espalhado** | Camada por elemento; em Android com pouca RAM piora. §7.1 |

---

## 9. Ordem de execução e esforço

| # | Item | § | Esforço | Por quê nesta ordem |
|---|---|---|---|---|
| 1 | Tokens no `@theme` do `global.css` | §5 | **P** | tudo depende; sem isto voltam os números mágicos |
| 2 | Testar `overflow-x: hidden` vs `view()` | §4.4 | **P** | se romper, todo o resto não roda — e falha em silêncio |
| 3 | Classe `.olli-revela` com os dois guardas | §4.1 | **P** | a peça de segurança vem antes do primeiro uso |
| 4 | Hero: tirar a entrada, ligar ao scroll | §6.1 | **M** | é o pedido do dono |
| 5 | `client:media` no `HeroDevices` | §7.2 | **P** | ~105 KB gzip fora do celular |
| 6 | Revelações: ofícios, planos (wrapper!), CTA | §6.3/6.7/6.9 | **P** | volume, baixo risco |
| 7 | Barra de 82% → `scaleX` | §6.6 | **P** | melhor relação significado/custo da página |
| 8 | Linha que desenha nos 3 passos | §6.4 | **M** | o único movimento "narrativo"; pode cair sem prejuízo |
| 9 | Medir campo (Sentry) 7 dias | §7.3 | **P** | é o número que decide se fica |

Sem o item 8, ainda assim se entrega tudo que o dono pediu.

---

## 10. Fontes

Suporte e especificação
- MDN — [`animation-timeline`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline) · [Scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) · [Timelines](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations/Timelines)
- Can I use — [`animation-timeline: scroll()`](https://caniuse.com/mdn-css_properties_animation-timeline_scroll) — 83,66% global; Chrome 115+, Safari 26+, Firefox a partir da 155
- Chrome for Developers — [Scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations) — *"running off the main thread"*; `scroll()` vs `view()`; `animation-range`
- MDN — [`prefers-reduced-motion`](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-reduced-motion)

Público (a conta do §3.2)
- Statcounter — [Mobile Browser Market Share Brazil](https://gs.statcounter.com/browser-market-share/mobile/brazil), jun/2026: Chrome 80,98% · Safari 13,5% · Samsung 3,94% · Firefox 0,43%
- Apple, via [MacRumors](https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/) / [9to5Mac](https://9to5mac.com/2026/06/10/ios-26-adoption-grows-but-still-lags-slightly-behind-ios-18/) — 79% dos iPhones em iOS 26 (medição de 07/06/2026)

Bibliotecas
- [Motion — scroll()](https://motion.dev/docs/scroll) (5,1 KB; usa `ScrollTimeline` nativo) · [React scroll animations](https://motion.dev/docs/react-scroll-animations) (scroll-linked vs scroll-triggered)
- [Webflow — GSAP 100% free](https://webflow.com/updates/gsap-becomes-free) (30/04/2025) · [GSAP Standard License](https://gsap.com/community/standard-license/) · [Bundlephobia — gsap](https://bundlephobia.com/package/gsap) (~22 KB core, ~18 KB ScrollTrigger, gzip)

Performance e UX
- [web.dev — Core Web Vitals](https://web.dev/articles/vitals) — LCP ≤2,5 s · INP ≤200 ms · CLS ≤0,1, p75
- [NN/g — The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/) — "light touch" (base do P1 do `MOTION_SPEC.md`)

Documentos internos lidos
- `docs/MOTION_SPEC.md` (declara não cobrir a landing; P1/P3/P4 e o modelo de tokens foram seguidos por analogia)
- `docs/LANDING_BRIEF.md` §"Tema (auto + toggle) e 3D", linhas 113-119 e 67 — divergência registrada em §3.5
- `docs/ENXAME/IDENTIDADE_APP_SITE.md` — landing é light-only (`color-scheme: light`, zero `dark:`); nada aqui depende de tema

Medições próprias (worktree `app-complete-analysis-optimization-9a1912`, `web/dist/`)
- Bytes gzip do §1.3 e §7.3 — medidos com `gzip -c | wc -c` no build atual, não estimados
