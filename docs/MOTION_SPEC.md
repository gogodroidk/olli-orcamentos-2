# OLLI Orçamentos — Spec de Motion e Deleite

> Documento de implementação. Um engenheiro executa isto sem precisar decidir mais nada.
> Escopo: micro-interações, abertura, haptics, tema, performance. **Não** cobre a landing de vendas.
> Fase atual: spec. Nenhuma linha de código foi alterada para produzir este documento.

## Restrições que valem para tudo aqui (P0 — violar invalida a proposta)

- **Motion funcional (`generic-saas`)**: movimento explica mudança de estado; em tela densa, motion funcional vence motion cinematográfico.
- **Só `transform` e `opacity`**, sempre `useNativeDriver: true` no nativo. Nada de `height/width/top/left/margin/flex/borderWidth` animado. Fonte: [React Native — Animations](https://reactnative.dev/docs/animations) ("you can only animate non-layout properties: things like `transform` and `opacity` will work, but Flexbox and position properties will not").
- **D-11**: sem `react-native-reanimated`, `moti`, `lottie`, `rive`, `skia` neste ciclo. Só o `Animated` core.
- **D-10**: 1 APK no fim do ciclo. Nada que exija módulo nativo novo / prebuild.
- **`LayoutAnimation` é considerado indisponível** — ver §6.
- Roda também na **web** (react-native-web): tudo tem que degradar sem quebrar.
- **Reduced-motion** (`useReducedMotion` já existe em `src/theme/motion.ts`) e **acessibilidade** (alvo 44×44, contraste AA) são gate.

## Onde as três pesquisas discordaram — e o que este documento decide

1. **Splash animada.** Pesquisa 2 e 3 tratam a `BrandSplash` como algo a preservar/animar (cross-fade, guard de reduced-motion). Pesquisa 1 provou que **ela nunca é vista**: fica montada *atrás* da splash nativa, e no tick em que `ready` vira `true` a árvore já trocou para o `NavigationContainer` **antes** de `hideAsync()` rodar (`App.tsx:216-222,233-264`). **Decisão:** não se anima o que não se vê. Remove-se a animação morta, corrige-se a cor, e o deleite de abertura vai para o **primeiro paint da tela de destino**. Detalhe em §4.
2. **Skeleton em espera curta.** Pesquisa 1 (NN/g): skeleton em carregamento <1s pisca e *piora* a percepção. Pesquisa 3 (kit local): "nunca deixe uma tela carregando vazia". **Decisão:** usa-se skeleton, **mas** com atraso mínimo para montar (leitura local <180ms nunca mostra skeleton) e tempo mínimo de exibição (não pisca). Resolve as duas. Detalhe no catálogo item C2 e nos tokens `Motion.skeleton`.
3. **`LayoutAnimation`.** `motion.ts:28-30` o habilita no Android; Pesquisa 2 mostrou que é **no-op sob a New Architecture** (Expo SDK 56, Fabric obrigatório). **Decisão:** tratado como indisponível; a chamada morta é removida; saídas de lista são feitas só com `Animated`. Detalhe em §6.
4. **Háptico em card.** `OlliPressable` e `OlliCard` usam `haptic="selection"` como default. Pesquisa 2 (Apple HIG): "selection" é para mudança de *valor* num controle, não para abrir/navegar. **Decisão:** abrir card/navegar = sem háptico; "selection" só para escolha de valor real. Detalhe em §5 e catálogo C7.

---

## 1. Princípios

Cinco. Cada um com a fonte e **o que ele proíbe** — princípio que não proíbe nada é decoração.

### P1 — Movimento comunica estado. Se não comunica, não existe.
Motion serve a hierarquia, feedback e status; nunca preenche tempo.
**Fonte:** [NN/g — The Role of Animation and Motion in UX](https://www.nngroup.com/articles/animation-purpose-ux/) ("animations should be used with a light touch — primarily as a tool for providing users with easily noticeable, smooth feedback [...] it's these down-time animations that often frustrate participants in usability testing"); [Material 3 — Motion](https://m3.material.io/styles/motion/overview/how-it-works) (informative/focused/expressive).
**Proíbe:** loop infinito que não carrega informação (o `FloatingIcon` do `EmptyState`, a flutuação/respiração/piscada do `OlliMascot` quando não sinalizam nada); animação de "abertura" que ninguém vê (`BrandSplash`); qualquer efeito cujo único propósito é "parecer premium".

### P2 — O toque responde em 1 frame, dissociado da rede.
A primeira mudança de pixel acontece no mesmo frame do dedo (~16ms), não quando `onPress`/rede volta. A rede dispara o *segundo* estágio (loading → sucesso/erro), nunca o primeiro.
**Fonte:** [NN/g — Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) (0.1s = "reacting instantaneously"); [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) ("Always include a press state [...] Without a press state, a button can feel unresponsive").
**Proíbe:** feedback de toque que aguarda o handler ou a rede; área tocável sem press-state; usar spinner/loading como *primeiro* sinal de que o toque foi recebido.

### P3 — Só `transform` e `opacity`, no native driver.
**Fonte:** [React Native — Animations](https://reactnative.dev/docs/animations); [Using Native Driver for Animated (RN blog)](https://reactnative.dev/blog/2017/02/14/using-native-driver-for-animated).
**Proíbe:** animar `height/width/top/left/margin/flex`; animar cor (`backgroundColor/borderColor`) com `useNativeDriver: true`; `LayoutAnimation` (no-op no Android sob New Arch — §6). **Exceções já existentes e fechadas** (não estender a novas telas sem justificar): `CountUp.tsx` (reescreve texto por frame → `useNativeDriver: false` obrigatório) e `OlliInput.tsx` (anima `borderColor` no foco → `useNativeDriver: false`).

### P4 — Reduced-motion, 44×44 e contraste AA são gate.
Todo loop e toda entrada checam `useReducedMotion()` e caem no estado final sem interpolar. Todo alvo tocável tem ≥44×44 ou `hitSlop` que o alcance. Todo texto tem contraste ≥4.5:1 (≥3:1 se grande/negrito).
**Fonte:** [WCAG 2.5.5 — Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html); [WCAG 1.4.3 — Contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html); [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion) (respeitar "Reduce Motion").
**Proíbe:** `Animated.loop` ou entrada animada sem guard de `useReducedMotion`; botão/ícone tocável <44px sem `hitSlop`; cor de marca escolhida pelo usuário aplicada a texto sem clamp de contraste (§7).
**Exceção declarada:** o press-scale (P2) permanece ativo sob reduced-motion — é feedback funcional de toque, transform-only e sub-limiar (0.97, 160ms), não o "movimento grande" (parallax/zoom/deslize longo) que a preferência combate. Registrado aqui para não ser tratado como pendência.

### P5 — Sucesso rotineiro é mudo. Celebração é rara e protegida.
Salvar um orçamento, marcar um item de checklist, editar: silêncio (o resultado na tela basta). Festa (confete + háptico Success) só em marco raro e com trava contra repetição.
**Fonte:** kit local `03-SAAS-MOTION-PATTERNS.md` ("Sucesso frequente deve ser discreto [...] Confete em ações rotineiras" = anti-padrão); [Apple HIG — Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) ("Avoid overusing haptics [...] become tiresome when it plays frequently").
**Proíbe:** confete/`notificationAsync(Success)` em save rotineiro; repetir celebração ao reeditar algo já aprovado; háptico em todo toque de lista. (O código já obedece: `Celebracao` só dispara na criação, `NovoOrcamentoScreen.tsx`, e na transição para `aprovado`, `VisualizarOrcamentoScreen.tsx` — manter essa disciplina.)

---

## 2. Tokens

Fonte única: `src/theme/motion.ts`. **Nenhum número mágico em componente** — se um valor de motion não sai de `Motion`, é bug de revisão.

### 2.1 O que já existe (v3) e está correto — manter

| Token | Valor atual | Veredito |
|---|---|---|
| `dur.fast` | 160 | Mantém. É o press-in (`OlliPressable:74`) e a duração de micro-transições. |
| `dur.base` | 260 | Mantém. Transição de tela (`AppNavigator:418`) e mudanças de estado padrão. |
| `dur.slow` | 420 | Mantém. Movimentos maiores / ênfase. |
| `dur.celebrate` | 900 | Mantém. Só a `Celebracao`. |
| `easing.standard` | `Easing.out(Easing.cubic)` | Mantém. Desaceleração padrão de entrada. |
| `easing.inOut` | `Easing.inOut(Easing.ease)` | Mantém. Loops (shimmer, respiração). |
| `stagger` | 55 | Mantém. Delay entre itens da cascata. |
| `maxStagger` | 12 | Mantém. Teto de itens escalonados (o 13º em diante não atrasa mais — evita cascata eterna em lista longa). |

### 2.2 O que muda

| Token | Hoje | Proposto | Motivo |
|---|---|---|---|
| `easing.spring` | `Easing.out(Easing.back(1.4))` — **definido mas nunca importado** | `Easing.out(Easing.back(1.4))` — **passa a ser a única fonte de overshoot** | Havia dois "springs" divergentes: este token (1.4, morto) e um `back(1.5)` inline em `App.tsx:94`. O inline morre junto com a animação da `BrandSplash` (§4). Fica um só valor. Não confundir com `Animated.spring` (mola física de `OlliPressable:81`), que é outra ferramenta — ver `spring.press` abaixo. |
| `dur.entrance` | não existe — `AnimatedEntrance.tsx:32` usa `380` cravado | **adicionar** `dur.entrance: 380` | Elimina o número mágico. Valor preservado (não muda o feel da cascata). |
| `distance.enterY` | não existe — `AnimatedEntrance.tsx:39` usa `24` | **adicionar** `distance.enterY: 24` | Deslize vertical de entrada. |
| `distance.enterX` | não existe — `AnimatedEntrance.tsx:40` usa `32` | **adicionar** `distance.enterX: 32` | Deslize horizontal de entrada. |
| `scale.enterFrom` | não existe — `AnimatedEntrance.tsx:41` usa `0.92` | **adicionar** `scale.enterFrom: 0.92` | Escala inicial da entrada `from="scale"`. |
| `scale.exitTo` | não existe | **adicionar** `scale.exitTo: 0.90` | Escala final da saída de item (catálogo C6). |
| `press.scale` | não existe — `OlliPressable:61` default `0.97` | **adicionar** `press.scale: 0.97` | Press padrão. |
| `press.scaleSubtle` | não existe — `OlliCard:29` usa `0.98` | **adicionar** `press.scaleSubtle: 0.98` | Press de card grande (menos "afunda"). |
| `spring.pressFriction` | não existe — `OlliPressable:83` usa `friction: 6` | **adicionar** `spring.pressFriction: 6` | Volta do press. |
| `skeleton.minDelay` | não existe | **adicionar** `skeleton.minDelay: 180` | Só monta skeleton se o load passar disto (evita flash em leitura local rápida). Base: NN/g — abaixo de ~0.1–1s não se deve mostrar indicador. |
| `skeleton.minVisible` | não existe | **adicionar** `skeleton.minVisible: 320` | Uma vez mostrado, fica no mínimo isto (não pisca). Base: NN/g — "the quick flashing page can cause users to feel like they can't keep up". |

### 2.3 Forma final proposta de `Motion`

```
export const Motion = {
  dur:      { fast: 160, base: 260, slow: 420, entrance: 380, celebrate: 900 },
  easing:   { standard: Easing.out(Easing.cubic),
              spring:   Easing.out(Easing.back(1.4)),
              inOut:    Easing.inOut(Easing.ease) },
  distance: { enterY: 24, enterX: 32 },
  scale:    { enterFrom: 0.92, exitTo: 0.90 },
  press:    { scale: 0.97, scaleSubtle: 0.98 },
  spring:   { pressFriction: 6 },
  skeleton: { minDelay: 180, minVisible: 320 },
  stagger: 55,
  maxStagger: 12,
} as const;
```
Além disso: **remover** o bloco `UIManager.setLayoutAnimationEnabledExperimental` de `motion.ts:26-30` (no-op sob New Arch — §6). Ele promete uma capacidade que o app não tem e induz alguém a construir em cima dela.

---

## 3. Catálogo de micro-interações (priorizado por impacto/esforço)

Ordem = maior impacto por menor esforço primeiro. Todas usam só `transform`/`opacity` + tokens de §2.

### C1 — Cor da abertura bate com a primeira tela · impacto ALTO / esforço BAIXO
- **Onde:** `app.json:56` (`expo-splash-screen.backgroundColor` `#0A2547`); `App.tsx:275` (`styles.splash` = `Colors.primaryDark` = `#0A2547`); primeira tela real = `Colors.background` `#07111F` (`App.tsx:273`).
- **Gatilho:** cold start (a splash nativa fecha e a primeira tela aparece).
- **O que anima:** nada novo — é a transição de saída da splash nativa (fade do próprio `expo-splash-screen`). O trabalho é **igualar cor**, não adicionar movimento.
- **Mudança:** `backgroundColor` da splash nativa e da `BrandSplash` passam a `#07111F` (`Colors.background`). Assim a última cor exibida na abertura é idêntica à primeira cor da tela real.
- **Duração/easing:** —.
- **Háptico:** não.
- **Reduced-motion:** irrelevante (é cor).
- **Aceite:** capturar 3 cold starts; no frame da troca splash→app não há salto de cor perceptível. `#0A2547` continua válido para adaptive icon (`app.json:18`) e notificações (`app.json:49`) — **não** mexer nesses.
- **Fonte:** [Apple HIG — Launching](https://developer.apple.com/design/human-interface-guidelines/launching) ("Design a launch screen that's nearly identical to the first screen of your app").

### C2 — Skeleton com atraso e piso de exibição · impacto ALTO / esforço BAIXO
- **Onde:** `OlliSkeleton.tsx` (usado em ~27 telas, sempre atrás de `carregando=useState(true)` sem debounce). Também `AppNavigator.tsx:204-205` (`HomeCarregando` renderiza uma `View` **vazia** — pior que skeleton: é o frame em branco do primeiro paint do dono).
- **Gatilho:** início de um carregamento (leitura de SQLite, sync).
- **O que anima:** o shimmer já existente (`translateX` + `opacity`, `useNativeDriver`). Novo: montagem condicionada por tempo.
- **Regra:** wrapper de exibição (`useDelayedLoading` ou `<Skeleton.Gate>`): só monta o skeleton se `carregando` ainda for `true` depois de `Motion.skeleton.minDelay` (180ms); uma vez montado, permanece ≥ `Motion.skeleton.minVisible` (320ms) mesmo que o dado chegue antes, para não piscar. Substituir o `HomeCarregando` vazio por um skeleton do layout da home.
- **Duração/easing:** shimmer mantém `1100ms`, `easing.inOut`.
- **Háptico:** não.
- **Reduced-motion:** com reduced-motion, o shimmer não anima (fica um bloco estático de `surfaceVariant`); a lógica de atraso/piso permanece.
- **Aceite:** leitura local que resolve em <180ms **não** mostra skeleton (zero flash); leitura de 500ms mostra skeleton por ≥320ms; `HomeCarregando` nunca é uma tela totalmente vazia.
- **Fonte:** [NN/g — Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/); [NN/g — Response Time Limits](https://www.nngroup.com/articles/response-times-3-important-limits/).

### C3 — Botão em loading não engole o rótulo nem salta de largura · impacto ALTO / esforço BAIXO
- **Onde:** `OlliButton.tsx:34-43` (`loading` **substitui** `icon+label` por um `ActivityIndicator` solto).
- **Gatilho:** `loading=true` (ação em voo — salvar, gerar).
- **O que anima:** nada; é layout estável. O `ActivityIndicator` entra **ao lado** do rótulo, que permanece.
- **Regra:** em `loading`, manter o `<Text>` do rótulo e pôr o `ActivityIndicator` à esquerda dele (ou fixar `minWidth` = largura de repouso). Nada de trocar todo o conteúdo por um spinner.
- **Duração/easing:** —.
- **Háptico:** não (o háptico é do toque que iniciou a ação, já disparado por `OlliPressable`).
- **Reduced-motion:** o `ActivityIndicator` é indicador de sistema; mantido.
- **Aceite:** largura do botão idêntica (±2px, medir via `onLayout`) entre repouso e loading para o mesmo rótulo; o texto continua legível durante a espera.
- **Fonte:** [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) ("display an activity indicator [...] the label changes from Checkout to Checking out…").
- **Junto (mesma tela):** `OlliButton.tsx:28` — `minHeight` do size `sm` sobe de **40 → 44** (WCAG 2.5.5). `md`/`lg` já passam.

### C4 — Fechar o buraco de reduced-motion nos loops · impacto ALTO / esforço BAIXO
- **Onde:** `OlliMascot.tsx:28-77` (flutuação + respiração + piscada, 3 loops), `EmptyState.tsx:16-35` (`FloatingIcon`), `OlliSkeleton.tsx:22-33` (shimmer), `Celebracao.tsx:48-66` (single-shot). Só 4 arquivos no projeto hoje chamam `useReducedMotion` — nenhum destes.
- **Gatilho:** montagem do componente.
- **O que anima:** o que já anima (transform/opacity). Novo: guard.
- **Regra:** o padrão que `AnimatedEntrance.tsx:26-29` já usa — `const reduzir = useReducedMotion(); if (reduzir) { /* estado final estático */ return; }` dentro do `useEffect`, sem iniciar o loop. Mascote: fica parado (sem flutuar/respirar/piscar). FloatingIcon: ícone fixo. Shimmer: bloco estático. Celebração: mostra check + texto no estado final e chama `onDone` imediatamente (sem confete voando).
- **Duração/easing:** inalterado quando reduced-motion está desligado.
- **Háptico:** a `Celebracao` mantém o `notificationAsync(Success)` mesmo em reduced-motion (é resultado de tarefa, não movimento — canal independente, ver Apple HIG "Feedback").
- **Reduced-motion:** é o objeto do item.
- **Aceite:** com "Reduzir movimento"/"Remover animações" ligado no SO, nenhum pixel se move em regime permanente em nenhuma tela; todo conteúdo continua presente e legível.
- **Fonte:** [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion); MDN [`prefers-reduced-motion`](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-reduced-motion).

### C5 — Botão central da tab bar usa a mesma engine de toque · impacto MÉDIO / esforço BAIXO
- **Onde:** `AppNavigator.tsx:209-235` (`CenterButton`, o "＋ Orçar" — a ação mais importante da barra) usa `TouchableOpacity` cru com `activeOpacity={0.85}`, fora do design system.
- **Gatilho:** toque no botão central.
- **O que anima:** press-scale de `OlliPressable` (`transform: scale` → `press.scale`), substituindo o `activeOpacity`.
- **Regra:** trocar o `TouchableOpacity` por `OlliPressable` com `haptic="medium"` (mantém o `impactAsync(Medium)` que já existe em `:218` — remover a chamada manual para não vibrar duas vezes) e `scaleTo={Motion.press.scale}`.
- **Duração/easing:** press-in `dur.fast`, volta `spring.pressFriction`.
- **Háptico:** `impact medium` (uma vez — é a ação-âncora do app).
- **Reduced-motion:** press-scale exempto (P4).
- **Aceite:** o "＋ Orçar" afunda igual a qualquer outro botão do app; um único háptico por toque; nenhuma regressão no `pointerEvents="box-none"` do wrapper.
- **Fonte:** consistência de design system (kit local `03-SAAS-MOTION-PATTERNS.md` — "uma engine principal de UI").

### C6 — Saída animada de item de lista · impacto MÉDIO / esforço MÉDIO
- **Onde:** `Step2Itens.tsx:111-114` (`removeItem` dispara `notificationAsync(Warning)` e remove do array **no mesmo instante** — o item some sem transição, enquanto a entrada é animada em `:170-208` via `AnimatedEntrance`).
- **Gatilho:** toque na lixeira do item (`Step2Itens.tsx:202`).
- **O que anima:** `opacity 1→0` + `scale 1→scale.exitTo` (0.90) sobre o próprio item; **só depois** o item sai do array.
- **Regra:** um `<AnimatedListItem>` (ou hook `useExitAnim`) que possui entrada **e** saída: ao pedir remoção, anima a saída e no `.start(() => onRemoved())` chama o `onChangeItens` real. O `notificationAsync(Warning)` dispara no **início** da saída, sincronizado com o começo do fade (hoje ele fica solto).
- **Duração/easing:** `dur.fast`–`dur.base` (160–260), `easing.standard`.
- **Háptico:** `notificationAsync(Warning)` — resultado de tarefa (remoção), mapeamento correto; mantém-se, só re-sincronizado.
- **Reduced-motion:** com reduced-motion, remove instantâneo (sem fade), o háptico ainda dispara.
- **Aceite:** ao excluir, o item some com fade+encolhida em ≤260ms; o háptico coincide com o começo do fade. **Limitação documentada e aceita:** os itens vizinhos **saltam** para cima instantaneamente (sem `LayoutAnimation` — quebrado no Android — e sem Reanimated, não há como animar o reflow só com transform/opacity). O item que sai é rastreável; a lista fecha o buraco em corte seco. Isso é limite do toolset, não escolha estética.
- **Fonte:** [Apple HIG — Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) (harmonia entre canais visual e háptico); §6 sobre `LayoutAnimation`.

### C7 — Háptico de card reclassificado · impacto MÉDIO / esforço BAIXO
- **Onde:** `OlliCard.tsx:29` (default `haptic="selection"` para **qualquer** card tocável); `OlliPressable.tsx:60` (default `haptic="selection"`).
- **Gatilho:** toque num card que navega/abre detalhe.
- **O que anima:** nada — é regra de háptico.
- **Regra:** `OlliCard` passa a `haptic={false}` por default (abrir/navegar não vibra). Call-sites que representam **escolha de valor** (selecionar um plano, marcar/desmarcar) passam `haptic="selection"` explicitamente. `OlliPressable` mantém `selection` como default só porque muitos call-sites já o sobrescrevem com `false`; o alvo é: navegação → `false`, valor → `selection`, ação primária → `light`/`medium`.
- **Háptico:** ver §5.
- **Reduced-motion:** n/a (háptico tem toggle próprio do SO).
- **Aceite:** rolar uma lista densa de orçamentos tocando cards não gera trem de vibrações; escolher um plano vibra (`selection`).
- **Fonte:** [Apple HIG — Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) ("selection haptics" = mudança de valor; "Avoid overusing haptics").

### C8 — Limpeza de tokens e guardas de plataforma · impacto MÉDIO / esforço BAIXO
- **Onde:** `App.tsx:94` (`Easing.out(Easing.back(1.5))` inline — desaparece com §4); `AnimatedEntrance.tsx:32,39-41` (números mágicos → tokens de §2); `OlliSkeleton.tsx:28` e `OlliMascot.tsx:32-65` (`useNativeDriver: true` cravado, sem `Platform.OS !== 'web'` como os demais componentes fazem); `motion.ts:26-30` (enable de `LayoutAnimation` no-op).
- **Gatilho:** —.
- **Regra:** migrar os números mágicos para os tokens novos; unificar o guard `const useNativeAnimations = Platform.OS !== 'web'` (evita o warning de console do RNW e alinha com `OlliPressable`/`AnimatedEntrance`); remover o bloco de `LayoutAnimation`.
- **Aceite:** grep por número de motion cravado em `src/components` volta vazio; nenhum warning de `useNativeDriver` no console web; `easing.spring` é importado de pelo menos um lugar (ou é removido — decidir na revisão, mas não pode ficar morto).

---

## 4. Abertura — a recomendação é TIRAR, não pôr

**Fato técnico (Pesquisa 1, confirmado no código):** a `BrandSplash` (`App.tsx:88-108`) — logo com spring `back(1.5)` 650ms + fade 500ms + textos "OLLI"/tagline — **nunca aparece**. Ela é o fallback renderizado enquanto `ready === false` (`App.tsx:263`), mas fica **atrás da splash nativa**, que só é escondida por `SplashScreen.hideAsync()` no `useEffect` de `ready` (`App.tsx:220-222`). Quando `ready` vira `true`, a árvore já trocou para o `NavigationContainer` **antes** de a splash nativa sumir. Resultado: todo o motion ali é código morto do ponto de vista visual.

**O que as fontes mandam:**
- [Apple HIG — Launching](https://developer.apple.com/design/human-interface-guidelines/launching): "nearly identical to the first screen", "Avoid including text on your launch screen", "The launch screen isn't a branding opportunity". Ou seja, a Apple **desaconselha** uma splash decorada/animada — o objetivo é imperceptibilidade.
- [Android — Splash screens](https://developer.android.com/develop/ui/views/launch/splash-screen): fundo opaco de cor única; "Introducing an incomplete interface can be jarring"; não endossa alongar a splash por estética.
- Nem Apple nem Android endossam prolongar a splash. O boot do OLLI já não tem delay artificial (`preventAutoHideAsync` + gate em `dbReady && fontsLoaded`) — isso está certo.

**Decisões (todas dentro de P0, nenhuma dependência nova):**

1. **Igualar a cor** (C1): splash nativa e `BrandSplash` → `#07111F` (`Colors.background`), a cor da primeira tela real. Único ponto onde a abertura hoje "salta".
2. **Remover a animação morta da `BrandSplash`.** Ela vira uma `View` estática em `Colors.background` (opcionalmente o logo centrado, **sem** spring, **sem** os textos "OLLI"/tagline — Apple desaconselha texto e, de todo modo, nada disso é visto). Deletar `scale`, `opacity`, o `useEffect` de animação e o `back(1.5)` inline. Isso obedece P1 (não se anima o que não comunica) e limpa o token divergente (C8).
3. **O deleite de abertura mora na primeira tela, não na splash.** O ganho percebido de "app caro" vem de: (a) `HomeCarregando`/primeiro paint deixar de ser frame vazio e virar skeleton do layout (C2); (b) o conteúdo real entrar em **cascata** com `AnimatedEntrance` (`stagger` 55, `dur.entrance` 380) — que várias telas já fazem e deve ser o padrão da tela de destino do boot. É aqui que o usuário efetivamente olha.

**O que NÃO fazer na abertura:** não tentar cross-fade em JS entre `BrandSplash` e o `NavigationContainer` (Pesquisa 2 sugeriu, mas ambos ficam atrás da splash nativa — o cross-fade também não seria visto); não segurar a splash para exibir a animação (contra as duas HIGs); não pôr loader falso "para parecer premium" (gate do kit local proíbe).

---

## 5. Haptics — quando vibrar e quando não

Base: [Apple HIG — Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics); mapeamento para [`expo-haptics` (SDK 56)](https://docs.expo.dev/versions/v56.0.0/sdk/haptics/). Regra-mãe da Apple: "complement other feedback" (nunca canal único), "short haptics that complement discrete events", "Avoid overusing", "Use haptics consistently".

| Situação | Vibrar? | Chamada `expo-haptics` | Onde já está certo |
|---|---|---|---|
| Abrir card / navegar para detalhe | **Não** | — | corrigir default do `OlliCard` (C7) |
| Toque comum de lista | **Não** | — | maioria dos call-sites já passa `haptic={false}` |
| Ação primária (salvar, gerar, ＋ Orçar) | Sim | `impactAsync(Light)` — botões; `impactAsync(Medium)` — FAB central | `OlliButton` já usa `light`; `CenterButton` usa `medium` |
| Mudança de **valor** num controle (escolher plano, toggle, stepper de quantidade) | Sim | `selectionAsync()` | — |
| Remover item / ação destrutiva | Sim | `notificationAsync(Warning)` | `Step2Itens.tsx:112` |
| Erro de validação | Sim | `notificationAsync(Error)` | `Step1Cliente.tsx` |
| Marco raro (orçamento gerado, negócio fechado) | Sim | `notificationAsync(Success)` | `Celebracao.tsx:54` — **único** Success do app, correto |
| Save/edição rotineira | **Não** | — | não há Success espalhado — manter |

**Regras invioláveis:**
- **Nunca dois hápticos no mesmo toque.** Se um handler já dispara um `impact/notification`, o `OlliPressable`/`OlliButton` daquele toque vai com `haptic={false}`. Convenção já praticada (`AgendaScreen.tsx` tem comentário explícito) — formalizada aqui.
- **Háptico nunca é o único feedback** (P1/P2): sempre acompanha uma mudança visual.
- **Não construir toggle próprio de háptico.** No iOS o SO já suprime háptico em Low Power/ajuste do usuário/câmera ativa; `expo-haptics` chama sempre com `.catch(() => {})`, então falha silenciosa na web e onde não há motor. Isso satisfaz "make haptics optional" sem UI nova.
- **Web:** `expo-haptics` é no-op/silencioso — nenhuma ação especial, só não depender do háptico para comunicar nada.

---

## 6. O que NÃO fazer (considerado e rejeitado)

| Rejeitado | Por quê |
|---|---|
| **Splash animada/decorada e visível** | Apple HIG desaconselha ("isn't a branding opportunity", "avoid text"); e no OLLI ela nem é vista (§4). Investir no primeiro paint da tela real, não na splash. |
| **`LayoutAnimation` para inserir/remover/reordenar lista** | Anima layout (contra P3); é API **global** (afeta toda a tela seguinte, não só o alvo); e é **no-op no Android sob a New Architecture** — obrigatória na Expo SDK 56. Confirmado: [expo/expo#30153](https://github.com/expo/expo/issues/30153), [facebook/react-native#47617](https://github.com/facebook/react-native/issues/47617). O enable em `motion.ts:28-30` é código morto — remover. |
| **`react-native-reanimated` / `moti` / `lottie` / `rive` / `skia`** | D-11: cada dependência nativa nova força prebuild, e prebuild já quebrou release em silêncio (Hermes, v6). Fora deste ciclo. |
| **Shared-element / hero transition entre rotas** | O `native-stack` usa transições nativas do SO; não há gancho para reparentar um nó entre telas sem worklets (Reanimated). Tecnicamente bloqueado por D-11. Usar continuidade **barata**: cor/chrome consistente tela-a-tela + `fade` onde já se usa. |
| **Transição de tela customizada em `Animated`** | A doc do RN não dá sinal de que supere a transição nativa do `native-stack` (gesto nativo, sem custo de JS thread). Ficar com o padrão da lib é mais barato e melhor percebido. |
| **Confete/`Success` em salvamento rotineiro** | P5; kit local lista "Confete em ações rotineiras" como anti-padrão. Manter `Celebracao` só nos 2 marcos raros já existentes. |
| **Skeleton em espera curta sem debounce** | NN/g: <1s pisca e piora a percepção. Resolver com `skeleton.minDelay`/`minVisible` (C2), não removendo o skeleton. |
| **Parallax / zoom decorativo / movimento de fundo contínuo** | P1 (não comunica estado) + risco vestibular sob reduced-motion (P4). |
| **Animar `height`/`width`/`margin`/`flex`/`top` (ex.: "expandir" card mudando altura)** | Reflow por frame, cai de FPS (P3). Expandir/colapsar deve ser `opacity`+`scale`+`translateY`, não `height`. |
| **Canvas/WebGL/3D atrás de formulário, tabela ou tarefa** | P0 do projeto. (3D só na landing de vendas, fora deste escopo.) |
| **Háptico em todo toque / dois hápticos por toque** | Apple HIG "becomes tiresome"; §5. |
| **`Shadow.md`/glow em cada linha de `FlatList` longa no Android** | Bug documentado de sombra em `FlatList` no Android ([facebook/react-native#16431](https://github.com/facebook/react-native/issues/16431), [#22672](https://github.com/facebook/react-native/issues/22672)). Em lista, usar borda de 1px (`Colors.outline`, que o `OlliCard` já tem); reservar sombra pesada para card isolado/modal. |
| **Gerar paleta com o algoritmo Material HCT** | Precisa de CAM16 (colorimetria não-trivial); inviável sem `material-color-utilities`. Usar HSL + clamp WCAG (§7). |

---

## 7. Tema claro/escuro + cor de marca

### Estado atual
App é **escuro-only** ("cockpit"). Não há infraestrutura de tema: `Colors` (`src/theme/index.ts`) é objeto plano de hex, importado direto em ~66 arquivos; há ~51 `rgba(255,255,255,…)` cravados em ~22 componentes (hairlines que assumem "branco translúcido sobre escuro"). **Ganhar tema claro é tarefa de arquitetura (ThemeProvider/`useTheme` + tokenizar esses rgba), não de motion — está fora deste ciclo.** O que a spec fixa é a **regra**, para (a) motion novo não assumir fundo escuro e (b) o tema claro, quando vier, nascer acessível.

### Regra de elevação/sombra
- **Escuro:** elevação por **cor** — superfície mais clara à medida que sobe (`background #07111F → surface #102238 → surfaceElevated #16304D`). Já implementado e correto. Fonte: [Apple HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) (base vs elevated colors), [Material 2 — Dark theme](https://m2.material.io/design/color/dark-theme.html) (overlay 0–16%).
- **`Shadow.glowCyan`/`glowBlue`/`focusRing` (`index.ts:150-152`) são escuro-only.** Um brilho colorido só funciona contra fundo quase preto; em fundo claro vira mancha suja. **Regra para o tema claro:** trocar glow por **sombra neutra suave + borda de 1px na cor de marca** (o `surfaceTint` do [Material 3 — Elevation](https://m3.material.io/styles/elevation/applying-elevation)). Componente novo **não** deve cravar glow assumindo fundo escuro — deve pegar a sombra do token de tema.

### Regra de contraste com cor de marca escolhida pelo usuário
- Régua legal: **WCAG 1.4.3** — 4.5:1 texto normal, 3:1 texto grande/negrito.
- **Dá para gerar paleta acessível a partir de 1 cor sem lib nova?** **Parcialmente, e é o suficiente:**
  - **Não** dá para reproduzir o Material HCT (Hue/Chroma/Tone) — exige CAM16, matemática de colorimetria que só vem na `material-color-utilities`. Não perseguir paridade com Material You.
  - **Dá** para: (1) deixar o usuário escolher a cor livremente; (2) gerar um degradê de 5–7 tons por interpolação **HSL** ajustando só a *lightness* (mantendo hue/saturation) — não é perceptualmente uniforme, mas é honesto e sem dependência; (3) **validar em runtime** com a fórmula de **luminância relativa do WCAG** (~15 linhas de TS puro: sRGB→linear, pesos 0.2126/0.7152/0.0722, razão entre as duas luminâncias) e, se o texto sobre a cor escolhida não atingir 4.5:1, clarear/escurecer o tom até atingir. Fórmula pública: [WCAG — relative luminance](https://www.w3.org/WAI/GL/wiki/Relative_luminance).
- **O que precisaria para ir além (não neste ciclo):** a lib `material-color-utilities` (violaria D-10/D-11 por trazer dependência) para tons perceptualmente uniformes. Sem ela, a rota HSL+WCAG é a única comprovadamente implementável.

---

## 8. Orçamento de performance

O que medir, com que ferramenta (todas sem dependência nova), e o limite.

| Métrica | Como medir | Limite |
|---|---|---|
| **FPS durante animação** (cascata de entrada, press, celebração) | Perf Monitor do RN (dev menu) / overlay de FPS; no Android, GPU rendering profile | ≥ 55 fps sustentado; nenhuma animação de UI derruba abaixo disso em Android médio. Alvo 60 (16,7ms/frame). |
| **Tempo até o primeiro toque útil** (cold start → primeira tela interativa) | `performance.now()`/timestamp no boot vs. `onReady` do `NavigationContainer`; [Android Vitals — launch time](https://developer.android.com/topic/performance/vitals/launch-time) | < 2s alvo. **≥ 5s = "excessivo"** (teto do Play Console) — falha de release. |
| **JS thread livre durante animação** | Perf Monitor (linha JS); checar que animações rodam no UI thread | Toda animação de UI = `transform`/`opacity` com `useNativeDriver: true` → JS thread não participa do frame. Exceções (`CountUp`, `OlliInput`) são JS-driven por natureza. |
| **`CountUp` simultâneos** (`CountUp.tsx` roda `useNativeDriver:false` + listener por frame) | Contar instâncias na tela; medir FPS no painel do dono (`InicioDesktopScreen`) inclusive em web/desktop fraco | Testar FPS com todos os KPIs animando juntos; se cair <55fps, escalonar os inícios ou animar um por vez. |
| **Zero propriedade de layout animada** | grep de `Animated` + (`height|width|top|left|margin|flex|borderWidth`) no diff | Deve voltar vazio (fora das exceções declaradas em P3). Gate de PR. |
| **Loops pausam fora de vista / respeitam reduced-motion** | Inspeção: todo `Animated.loop` tem `useReducedMotion` guard e `loop.stop()` no cleanup | Nenhum loop rodando com reduced-motion ligado; loops de tela sem foco não seguram GPU sem necessidade (kit local `06-PERFORMANCE-ACCESSIBILITY.md`). |
| **Sombra em lista longa (Android)** | Rolar lista de 50+ itens no Android; observar jank/sombra crescente | Em `FlatList`, borda de 1px em vez de `Shadow.md`/glow por linha (§6). |
| **Skeleton não pisca** | Simular leitura <180ms e ~500ms | <180ms: skeleton não monta; ≥180ms: fica ≥320ms (C2). |

Regra de bolso final: se uma micro-interação não cabe em `transform`/`opacity` a 60fps com o JS thread livre, ela está fora do escopo deste ciclo — não se resolve com lib nova (D-10/D-11).

---

### Fontes (todas lidas nas pesquisas que originaram esta spec)
Apple HIG (Launching, Buttons, Playing haptics, Dark Mode, Motion, Feedback, Progress indicators) · Android Developers (Splash screens, Launch time / Vitals) · NN/g (Response Time Limits, Skeleton Screens 101, Animation & Motion in UX, Empty States, Microinteractions) · Material 2 (Dark theme) / Material 3 (Elevation, Motion, Container Transform) · React Native (Animations, useNativeDriver, Shadow Props, LayoutAnimation) · React Navigation (Native Stack) · WCAG 2.1 (1.4.3 Contrast, 2.5.5 Target Size, relative luminance) · Expo SDK 56 (Haptics) · Refactoring UI · issues confirmadas: expo/expo #30153/#38333/#38334, facebook/react-native #47617/#16431/#22672.
