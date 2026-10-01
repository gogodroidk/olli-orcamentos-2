# OLLI — Gate de desempenho e motion (item 2.17)

> Complementa `docs/MOTION_SPEC.md` (o que anima e como). Este documento diz
> **como provar** que o app não engasga, e qual é a régua para liberar um APK.

## 1. O gate

Um APK só é liberado se, no **celular de referência**, as quatro telas abaixo
passarem nos quatro critérios.

**Celular de referência:** Samsung Galaxy S20 FE, `SM-G780F` (o mesmo do
`npm run qa:android`, Android 13/API 33). Build **release** (o debug com Metro é
bem mais lento e não serve de régua). Tela em **60 Hz** ("Suavidade de movimento" =
Padrão), para a medida ser comparável entre rodadas.

| Tela (rota)                          | Frames congelados | Frames lentos | TalkBack | Reduzir movimento |
|--------------------------------------|:-----------------:|:-------------:|:--------:|:-----------------:|
| Home (`Home`)                        | **0**             | **< 5%**      | passa    | passa             |
| Agenda (`Agenda`)                    | **0**             | **< 5%**      | passa    | passa             |
| Orçar (`NovoOrcamento`)              | **0**             | **< 5%**      | passa    | passa             |
| Detalhe do orçamento (`VisualizarOrcamento`) | **0**     | **< 5%**      | passa    | passa             |

Definições (as do Sentry React Native, que é onde a medida de produção mora):

- **Frame lento:** frame que estourou o orçamento da taxa de atualização (16,7 ms a 60 Hz).
- **Frame congelado:** frame que levou mais de **700 ms**. Um único congelado reprova a tela,
  porque ele é percebido como "o app travou".
- **% lentos** = `frames_slow / frames_total` da transação da tela.

## 2. O que está ligado no app

Em `App.tsx`, logo no `Sentry.init` (ver o comentário no código):

- `reactNavigationIntegration({ routeChangeTimeoutMs: 1000, ... })`: cada troca de
  rota vira uma transação com o **nome da tela** (nunca parâmetro de rota). O
  container é registrado no `onReady` do `NavigationContainer`. Navegação que não
  conclui em 1 s é descartada (não vira "tela lenta" falsa).
- `enableNativeFramesTracking: true`: grava `frames_total`, `frames_slow` e
  `frames_frozen` em cada transação (só no nativo).
- `enableStallTracking: true`: grava quanto tempo o **JS** ficou travado
  (`stall_count`, `stall_total_time`, `stall_longest_time`). Frame lento com stall
  alto = culpa do JS (render/efeito pesado); sem stall = culpa da UI nativa.
- `enableAppStartTracking: true` e TTID no nativo: tempo de abertura e de primeira
  pintura de cada tela.
- **Não mudou:** DSN, `sendDefaultPii: false`, redatores (`beforeSend`,
  `beforeSendTransaction`, `beforeBreadcrumb`) e erro em 100%. Trace segue
  amostrado em **10%** (`tracesSampleRate: 0.1`) por causa da cota do plano grátis.

## 3. Como medir

### 3.1 No aparelho (antes de liberar o APK) — a medida que decide o gate

Com 10% de amostragem, uma rodada de QA manda poucas transações ao Sentry; por
isso a régua do APK é medida **no próprio aparelho**, pelo Android:

```bash
PKG=online.olliorcamentos.app
adb shell dumpsys gfxinfo $PKG reset      # zera os contadores
# abra UMA tela e use-a por ~30 s: rolar a lista, abrir/fechar folhas, voltar
adb shell dumpsys gfxinfo $PKG            # leia "Janky frames" e, quando o Android
                                          # mostrar, "Number Frozen Frames"
```

Repita para cada uma das quatro telas (um `reset` por tela). Anote no
`docs/EXECUTION_LOG.md`: tela, total de frames, % janky, congelados e a versão do APK.

Roteiro por tela (o mesmo toda rodada, para comparar):

- **Home:** abrir frio, rolar até o fim e voltar ao topo, abrir e fechar um card.
- **Agenda:** trocar de dia 5×, abrir e fechar um compromisso, rolar a semana.
- **Orçar:** passar pelos 4 passos, adicionar 5 itens, abrir o teclado em campo de valor.
- **Detalhe:** abrir um orçamento com 10+ itens, rolar até o fim, abrir a pré-visualização do PDF.

### 3.2 Em produção (Sentry) — a medida que vigia regressão

No Sentry → *Performance* (ou *Insights → Mobile → Screen Rendering*), filtre
`environment:production` e a transação por nome (`Home`, `Agenda`,
`NovoOrcamento`, `VisualizarOrcamento`). Acompanhe:

- `frames_frozen`: tem de ficar em 0 (qualquer valor > 0 abre investigação);
- `frames_slow / frames_total` no p75: abaixo de 5%;
- `stall_longest_time`: aponta se o gargalo é JS.

Os números de produção vêm de aparelhos variados (muitos mais fracos que o S20 FE):
servem para ver **tendência e regressão**, não para reprovar o APK sozinhos.

### 3.3 TalkBack (passa = todas as respostas "sim")

Ligar em Configurações → Acessibilidade → TalkBack. Em cada uma das quatro telas:

- Todo botão/ícone tocável é anunciado com um nome que diz o que faz (nada de "botão" sem rótulo).
- A ordem de foco segue a leitura visual (de cima para baixo, da esquerda para a direita).
- Ações de toque duplo funcionam (abrir orçamento, salvar, voltar).
- Mudança de estado relevante é anunciada (salvo, erro, carregando).
- Nenhum frame congelado ao navegar com TalkBack ligado.

### 3.4 Reduzir movimento (passa = todas as respostas "sim")

Ligar em Configurações → Acessibilidade → Melhorias de visibilidade →
**Remover animações** (o app lê isso por `useReducedMotion`, em `src/theme/motion.ts`).
Em cada uma das quatro telas:

- Nada desliza, pulsa, flutua ou fica em loop; o conteúdo aparece direto no estado final.
- Nenhuma informação depende de animação para ser entendida.
- A tela continua com 0 congelados e < 5% lentos (desligar animação não pode piorar).

## 4. Quando reprova

1. Reprovou em frames: abra a transação da tela no Sentry ou rode o roteiro com
   `adb shell dumpsys gfxinfo` e veja o stall. Stall alto → render/efeito no JS
   (memoização, lista sem `FlatList`/virtualização, trabalho síncrono no `onPress`).
   Stall baixo → animação fora do native driver ou de propriedade de layout (proibido
   pelo `MOTION_SPEC.md`, P3).
2. Reprovou em TalkBack ou reduzir movimento: é bug de acessibilidade, mesma
   prioridade de bug funcional.
3. O APK não sai até a tela voltar a passar. Registrar a medição da correção no
   `docs/EXECUTION_LOG.md`.
