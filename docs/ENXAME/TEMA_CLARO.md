# Tema claro — diagnóstico medido e paleta corrigida

**Queixa do dono:** *"as cores, no CLARO não está legal, está meio estranha a cor, não está muito legal não."*

Isso é sensação. Abaixo está o número por trás dela.

**Veredicto em uma linha:** o problema **não é contraste de texto** — é que o modo claro
**não tem escada de superfície**. O cartão está a **ΔL\* = 0,00** do "elevado", a sombra que
deveria levantá-lo tem **alfa efetivo 0,008** (é um bug de RN, não escolha de design), e a borda
de todo cartão é **a cor da marca a 28%** — um contorno azul (ou rosa, ou vermelho, conforme a
marca que o prestador escolher). Três mecanismos de separação, os três perto de zero, e um deles
colorido. É por isso que parece "estranho" e nada respira.

Tudo aqui é reproduzível. Os comandos estão em [§8](#8-como-verificar).

---

## 1. Com que régua eu medi (e por que quatro)

O gate atual (`npm run check:contraste`) usa **só** a razão WCAG 2.x. Ela é a régua legal, mas
responde uma pergunta só — *"dá pra ler?"* — e responde mal em alguns casos. Usei mais três:

| Régua | O que mede | Por que precisei |
|---|---|---|
| **WCAG 2.x** (razão) | legibilidade mínima | é o que o gate exige. Não pode piorar. |
| **CIE L\*** | luminosidade **perceptual** (0–100) | razão de contraste não serve pra medir se duas *superfícies* parecem diferentes. `1,073:1` não diz nada; `ΔL\* = 2,8` diz. |
| **APCA Lc** | contraste sensível à **polaridade** e ao tamanho da fonte | WCAG 2 dá o mesmo número trocando texto e fundo. O olho não. É o motivo de temas escuros "passarem no papel e ficarem lamacentos". |
| **ACR** (ambient contrast ratio) | contraste que **sobra** sob luz refletida | este app é usado na rua. `ACR = (L_claro + L_refl)/(L_escuro + L_refl)`. |

Limiares APCA usados (fonte oficial): **Lc 90** corpo fluente · **Lc 75** mínimo para corpo de
texto · **Lc 60** conteúdo que não é corpo · **Lc 45** título grande · **Lc 30** mínimo absoluto
(placeholder, desabilitado) · **Lc 15** — abaixo disso, *"trate como invisível"*.

> **Honestidade sobre a régua:** APCA **não** é norma. Auditoria de acessibilidade cobra WCAG 2.
> Usei APCA como **diagnóstico**, nunca como gate. A proposta continua passando no WCAG 2 —
> ver [§7](#7-prova).

---

## 2. O achado principal: o claro não tem escada, o escuro tem

O dono elogiou o escuro antes. Isto é o que o escuro acerta:

| | superfície | hex | L\* | matiz | ΔL\* do degrau anterior |
|---|---|---|---:|---:|---:|
| **CLARO (hoje)** | surfaceVariant | `#EDF1F6` | 94,98 | 213° | — |
| | background | `#F5F7FA` | 97,16 | 216° | **2,18** |
| | surface | `#FFFFFF` | 100,00 | **0° (neutro)** | **2,84** |
| | surfaceElevated | `#FFFFFF` | 100,00 | **0° (neutro)** | **0,00** ← |
| | | | | **amplitude** | **5,02** |
| **ESCURO (hoje)** | background | `#07111F` | 4,92 | 215° | — |
| | surfaceVariant | `#0D1A2C` | 9,04 | 215° | 4,12 |
| | surface | `#102238` | 12,86 | 213° | 3,82 |
| | surfaceElevated | `#16304D` | 19,31 | 212° | 6,45 |
| | | | | **amplitude** | **14,39** |

Três diferenças mensuráveis, e as três explicam a queixa:

**(a) O escuro tem 4 degraus reais; o claro tem 2 e meio.** `surface`, `surfaceElevated` e `card`
são **o mesmo `#FFFFFF`** no claro. `surfaceElevated` é o fundo do `OlliCard`
(`src/components/OlliCard.tsx:53`) — o cartão principal do app. Ele está a **ΔL\* = 0,00** do
nível de baixo. Não existe elevação: existe uma cor só, chamada por três nomes.

**(b) A amplitude do escuro é 2,9× a do claro** (14,39 vs 5,02). O claro tem 5 pontos de L\* pra
distribuir entre 4 níveis. Não cabe.

**(c) O claro quebra a família de matiz no meio.** `background` e `surfaceVariant` são
azul-acinzentados (h≈215°, s≈33%). `surface`/`card`/`surfaceElevated` são **branco puro, neutro,
s = 0%**. O escuro mantém os 4 níveis em h 212–215°, s 54–63% — uma família só.

Um branco neutro cercado por cinza-azulado sofre **contraste simultâneo**: o olho compensa o
azul do entorno e lê o branco como levemente **amarelado/sujo**. Esse é, literalmente, o
"está meio estranha a cor". Não é o cartão que está errado sozinho — é o **par**.

---

## 3. A sombra do modo claro não existe (bug, não estilo)

`cores.ts:454` → `sombraCor: 'rgba(15,27,45,0.10)'`
`cores.ts:532-534` → `shadowOpacity: op(0.25, 0.06 / 0.08 / 0.10)`

A documentação do React Native é explícita: `shadowOpacity` *"Sets the drop shadow opacity
**(multiplied by the color's alpha component)**"*. Então:

| sombra | alfa da cor | × shadowOpacity | **alfa efetivo** | ΔL\* que cava no fundo |
|---|---:|---:|---:|---:|
| `sm` | 0,10 | 0,06 | **0,0060** | 0,35 |
| `md` | 0,10 | 0,08 | **0,0080** | **0,69** |
| `lg` | 0,10 | 0,10 | **0,0100** | 0,69 |
| *painel (`webapp`), p/ comparar* | 0,16 | — | **0,1600** | **5,01** |

A sombra `md` do app é **20× mais fraca** que a do painel. Ela some.

**E tem um agravante de plataforma.** Ainda pela doc do RN: `shadowOffset`, `shadowOpacity` e
`shadowRadius` são **iOS-only**; no Android só `elevation` vale. As `elevation: 3/6/10` estão lá
e o Android desenha a sombra nativa dele. **Previsão testável:** hoje o **APK tem sombra e a web
não**. Se o dono abriu os dois lado a lado e achou a web "mais chapada", é isto.

---

## 4. Toda borda de cartão é a cor da marca a 28%

`cores.ts:441` → `strokeGlow: escuro ? comAlfa(accent, 0.24) : comAlfa(primary, 0.28)`

**72 sítios** usam `strokeGlow` como `borderColor` — incluindo `OlliCard.tsx:50`,
`OlliButton.tsx:96` (variante outline), `GradientHeader`, `EmptyState`, `GatePro`, `DialogoDesktopHost`.

No **escuro** isso é certo: um véu de acento sobre superfície escura lê como *glow*. No **claro**,
o mesmo véu sobre um cartão claro lê como **contorno colorido de adesivo**. E como a marca é
configurável, cada prestador ganha uma cor de contorno diferente:

| marca | borda do cartão hoje | saturação | matiz |
|---|---|---:|---:|
| Azul OLLI | `#BBD7F1` | **66%** | 209° |
| Índigo | `#CAC7F0` | **58%** | 244° |
| Roxo | `#D6C3F4` | **69%** | 263° |
| Rosa | `#EDBED2` | **57%** | 334° |
| **Vermelho** | `#F5C2C2` | **72%** | 0° |
| Laranja | `#EECABB` | **60%** | 18° |
| Terracota | `#EACFBA` | **53%** | 26° |
| Esmeralda | `#B9D9D0` | 30% | 163° |

O prestador que escolhe **Vermelho** ganha o app inteiro com **cartões de contorno rosa**. Isso é
"cor de marca saturada demais usada em área grande" — só que a área não é um bloco, é o
**perímetro de tudo**, o que é pior: o olho persegue borda.

---

## 5. Texto: onde o WCAG mentiu e onde não mentiu

Aqui eu preciso me corrigir em público, porque a régua padrão dá a resposta errada:

| token (sobre o cartão) | claro WCAG | claro **APCA** | escuro WCAG | escuro **APCA** |
|---|---:|---:|---:|---:|
| `onSurface` | 17,28:1 | Lc 104 | 16,06:1 | Lc 105 |
| `onSurfaceVariant` (495 usos) | 5,23:1 | **Lc 76** | 6,92:1 | **Lc 54** |
| `onSurfaceMuted` (227 usos) | 2,90:1 | **Lc 55** | 3,69:1 | **Lc 29** |
| `tabInactive` | 3,34:1 | Lc 61 | 4,30:1 | Lc 34 |
| `outline` | 1,23:1 | **Lc 11** | 1,35:1 | Lc 0 |

Pelo WCAG, o claro parece pior que o escuro em tudo. **Pelo APCA é o contrário** — o texto
secundário do claro (Lc 76) está *acima* do mínimo de corpo de texto (Lc 75), e o do escuro
(Lc 54) está abaixo. É o defeito conhecido do WCAG 2 com polaridade.

**Conclusão honesta: o texto do claro não era o problema principal.** Dois pontos sobrevivem
às duas réguas, porém:

- **`onSurfaceMuted` a Lc 55, com 227 usos.** Lc 55 é abaixo de Lc 60 ("conteúdo que não é
  corpo"). Se 227 sítios fossem todos placeholder, tudo bem. Não são.
- **`outline` a Lc 11** — abaixo do Lc 15 que a própria APCA manda *"tratar como invisível"*.
  Somado à sombra de 0,008 e ao ΔL\* de 2,84, fecha o diagnóstico: **as três formas de separar
  um cartão do fundo estão desligadas ao mesmo tempo.**

### E sob sol (ACR), tudo muda

| token | sala escura | escritório | sombra externa | sol direto |
|---|---:|---:|---:|---:|
| `onSurface` | 17,28:1 | 7,15:1 | 4,18:1 | 2,76:1 |
| `onSurfaceVariant` | 5,23:1 | 3,82:1 | **2,88:1** | 2,21:1 |
| `onSurfaceMuted` | 2,90:1 | 2,49:1 | **2,12:1** | **1,80:1** |
| **cartão vs fundo** | **1,073** | 1,066 | **1,058** | **1,048** |

Na rua, o secundário cai abaixo de 3:1 e o terciário some. E a separação cartão↔fundo, que já
era 1,073 no escritório, vira 1,048. **O app claro, no sol, é uma folha branca lisa com texto.**

---

## 6. Comparação com o painel e a landing

Os outros dois produtos do OLLI resolveram a escada de texto melhor que o app:

| produto | primário | secundário | terciário |
|---|---|---|---|
| **landing** (`web/src/styles/global.css`) | `#0f1c2e` — 17,13:1 / Lc 104 | `#475569` — 7,58:1 / **Lc 86** | `#64748b` — 4,76:1 / **Lc 73** |
| **painel** (`webapp/.../tokens/color.ts`) | `#1C252E` — 15,52:1 / Lc 102 | `#637381` — 4,88:1 / Lc 74 | `#919EAB` — 2,73:1 / Lc 53 |
| **app claro (hoje)** | `#0F1B2D` — 17,28:1 / Lc 104 | `#656D79` — 5,23:1 / Lc 76 | `#9398A1` — 2,90:1 / **Lc 55** |

A landing usa **cinzas opacos escolhidos a dedo** e tem a escada mais bem espaçada (104 → 86 →
73). O app deriva tudo de **alfa sobre a tinta**, e alfa não é linear em luminância: o mesmo
número dá resultados diferentes nos dois modos.

| token | claro | resultado | escuro | resultado |
|---|---|---|---|---|
| `onSurfaceVariant` | α 0,64 | Lc 76 | α 0,62 | Lc 54 |
| `onSurfaceMuted` | α 0,45 | Lc 55 | α 0,40 | Lc 29 |
| `tabInactive` | α 0,50 | Lc 61 | α 0,45 | Lc 34 |

Alfas quase iguais, percepções muito diferentes. Os alfas do claro foram herdados do escuro com
um ajustezinho — nunca foram calibrados para o claro.

---

## 7. A paleta corrigida

**Princípio que governa tudo abaixo:** *o **cartão** fica quase branco (é onde o texto mora — sob
sol, luminância é legibilidade); a **página** desce pra abrir espaço para a escada.* Isso dá
hierarquia sem sacrificar o sol — o `onSurface` cai só de 17,28:1 para 17,00:1.

### 7.1 Superfícies (`SUPERFICIES.claro`, `cores.ts:284-291`)

| token | antes | L\* | **depois** | L\* | por quê |
|---|---|---:|---|---:|---|
| `surfaceVariant` | `#EDF1F6` | 94,98 | **`#D9E1EC`** | 89,23 | degrau recuado real (input, chip) |
| `background` | `#F5F7FA` | 97,16 | **`#E5EAF2`** | 92,54 | página desce e abre espaço acima |
| `surface` | `#FFFFFF` | 100,00 | **`#F0F4F8`** | 96,00 | deixa de ser branco puro → entra na família de matiz |
| `card` | `#FFFFFF` | 100,00 | **`#F0F4F8`** | 96,00 | alias de `surface` (igual ao escuro) |
| `surfaceElevated` | `#FFFFFF` | 100,00 | **`#FDFDFE`** | 99,33 | **para de colidir com `surface`** — o `OlliCard` agora tem nível próprio |
| `tinta` | `#0F1B2D` | — | `#0F1B2D` | — | sem mudança |

Escada resultante: degraus de **3,30 / 3,46 / 3,34**, amplitude **10,10** (era 5,02, com um
degrau de zero). Matiz 210–217° em todos — família única, como no escuro.

> Nota honesta: `#FDFDFE` é `rgb(253,253,254)`. Reportar "matiz 240°, saturação 33%" para essa
> cor não significa nada — HSL fica instável perto do branco. O que importa é que **não é
> `#FFFFFF` neutro** e está a ΔL\* 3,34 do nível de baixo.

### 7.2 Texto e traço (dentro de `criarPaleta`)

| token | antes | depois | antes → depois (sobre o cartão) |
|---|---|---|---|
| `onSurfaceVariant` | α 0,64 | **α 0,72** | 5,23:1 / Lc 76 → **6,84:1 / Lc 83** |
| `onSurfaceMuted` | α 0,45 | **α 0,60** | 2,90:1 / Lc 55 → **4,57:1 / Lc 71** |
| `tabInactive` | α 0,50 | **α 0,62** | 3,34:1 / Lc 61 → **4,86:1 / Lc 73** |
| `outline` | α 0,10 | **α 0,12** | Lc 11 → **Lc 14** |
| `outlineDark` | α 0,16 | **α 0,20** | Lc 19 → **Lc 24** |

`outline` sobe até o **piso** de discernibilidade da APCA (Lc 15), não acima dele. Isso é
deliberado: o risco oposto — borda forte demais criando ruído de grade — é real, e Lc 14–24 é
hairline, não grade.

### 7.3 `strokeGlow` deixa de ser a marca (no claro)

```
antes:  strokeGlow: escuro ? comAlfa(accent, 0.24) : comAlfa(primary, 0.28)
depois: strokeGlow: escuro ? comAlfa(accent, 0.24) : comAlfa(tinta,   0.16)
```

O escuro **não muda** (lá o glow de acento é o efeito certo). No claro, as 12 marcas passam a
gerar a **mesma** borda neutra `#D7D9DD` (s = 8%, Lc 19) em vez de 12 contornos coloridos com
saturação de 30% a 72%. A marca continua aparecendo onde deve: botão primário, gradiente do
header, `tabActive`, chips de container.

### 7.4 A sombra volta a existir

```
antes:  sombraCor: 'rgba(15,27,45,0.10)'   +  shadowOpacity 0.06 / 0.08 / 0.10
depois: sombraCor: '#0F1B2D'               +  shadowOpacity 0.10 / 0.14 / 0.18
```

Cor **opaca** → `shadowOpacity` deixa de ser multiplicado por 0,10 e passa a valer o que diz.
Alfa efetivo da `md`: **0,008 → 0,140** (17,5×). ΔL\* que a sombra cava no fundo: **0,69 → 10,34**.

A sombra é **navy** (`#0F1B2D`, h 216°), não preta — fica na família da página. O clássico
"sombra preta sobre fundo quente vira cinza sujo" **não se aplica aqui**, porque a página do OLLI
é fria; era um risco que valia checar e não é problema.

### 7.5 Bug que o gate nunca mediu — e que eu quase piorei

`cores.ts:398` deriva `primaryContainerText` contra **`'#FFFFFF'` cravado**. Mas o chip não é
branco: é `comAlfa(primary, 0.10)` **sobre a superfície real**. Medindo contra o chip de verdade:

| | pior das 12 marcas | quantas reprovam (< 4,5:1) |
|---|---:|---:|
| **claro, hoje** | 4,13:1 (Vermelho) | **5 de 12** |
| **escuro, hoje** | 3,87:1 (Azul OLLI) | **11 de 12** |

Isso já está quebrado em produção, nos dois modos, e o gate não vê porque `primaryContainer`
não está na lista `PRIMEIRO_PLANO` do script. **E escurecer as superfícies pioraria** (Azul iria
a 4,03:1). Correção — reusa o padrão que o próprio arquivo já tem em `corCategoriaEmChip`:

```
antes:  primaryContainerText: ajustarParaContraste(primary, escuro ? sup.surface : '#FFFFFF', 4.5)
depois: primaryContainerText: ajustarParaContraste(
          primary, achatarVeu(sup.surface, comAlfa(primary, escuro ? 0.16 : 0.10)), 4.5)
```

Resultado: **0 de 12 reprovam** nos dois modos (pior claro 4,56:1; pior escuro 4,55:1).
Como efeito colateral, `dangerLight` (4,38→4,56) e `warningLight` (4,45→4,91) — que também
estavam abaixo de 4,5 — passam a passar.

### 7.6 Complemento

| token | antes | depois | por quê |
|---|---|---|---|
| `surfaceGlass` (claro) | `rgba(255,255,255,0.88)` | `rgba(253,253,254,0.90)` | senão o vidro fica **mais claro** que o novo topo da escada e a ordem inverte |

---

## 7-bis. Prova

Compilei a paleta proposta e rodei **a lógica exata** de `scripts/checar-contraste.mjs` (§2 prova
da paleta e §3 invariante do branco) contra ela.

```
[A] GATE OFICIAL NA PALETA NOVA
  PASSA  Azul OLLI    pior par 4.50:1   ...   PASSA  Grafite  pior par 4.50:1
  (12/12 marcas × 2 modos)
  §3: as 12 marcas resolvem sobre* = #FFFFFF nos 2 modos
      → os 120 '#fff' cravados no app seguem corretos
  >>> GATE PASSA <<<

[G] REGRESSÃO NO ESCURO
  Único token alterado: primaryContainerText (correção da §7.5, melhora 11 de 12 marcas).
  Todo o resto do modo escuro: IDÊNTICO nas 12 marcas.
```

O pior par continua sendo `escuro warning/surfaceElevated` a 4,50:1 — **exatamente o mesmo de
hoje**, porque não toquei em nada do escuro. O modo que o dono elogiou fica intacto.

Ganhos no claro, medidos:

| | antes | depois |
|---|---:|---:|
| amplitude da escada (ΔL\*) | 5,02 | **10,10** |
| menor degrau (ΔL\*) | **0,00** | **3,30** |
| cartão vs fundo (ΔL\*) | 2,84 | **6,80** |
| sombra `md`, alfa efetivo | 0,0080 | **0,1400** |
| saturação da borda do cartão | 8%–72% (varia c/ marca) | **8% em todas** |
| `onSurfaceMuted` | 2,90:1 / Lc 55 | **4,57:1 / Lc 71** |
| `onSurfaceVariant` sob sombra externa (ACR) | 2,88:1 | **3,20:1** |
| `primaryContainerText` reprovando | 5/12 claro, 11/12 escuro | **0/12 e 0/12** |

---

## 8. Como verificar

```bash
# 1. o gate oficial — tem que continuar verde
npm run check:contraste

# 2. blast radius: brancos cravados que assumiriam surface === #FFFFFF
grep -rn "backgroundColor:\s*['\"]\(#fff\|#FFFFFF\|white\)['\"]" --include=*.tsx src/
```

O grep (2) devolve **6 ocorrências, todas legítimas e nenhuma a corrigir**: papel do PDF
(`PdfPreviewModal` ×3), fundo do QR code (`PixCobrancaModal`, `CreditosScreen` — leitor de QR
precisa de branco máximo) e o CTA da landing sobre gradiente. Nenhuma delas assume que `surface`
é branco. **A mudança inteira cabe em um arquivo: `src/theme/cores.ts`.**

Checagem a olho, na ordem que mais rende: **Início → um cartão de OS → Agenda → Conta**, no
claro, **e depois trocar a marca para Vermelho** — é o caso onde a borda rosa aparecia.

### Sugestão de gate (opcional, separado desta paleta)

O script hoje mede 6 tokens de primeiro plano e **não mede** `onSurfaceVariant`, `onSurfaceMuted`,
`tabInactive`, `outline` nem `primaryContainer` — que são justamente os que estavam quebrados.
Acrescentar `onSurfaceVariant` e `primaryContainerText` (contra o chip achatado) à prova fecharia
o buraco. Esforço **P**. Não é pré-requisito da paleta.

---

## 9. O que NÃO fazer

- **Não subir o gate para 7:1.** Ele é o que amarra as 12 marcas. A 7:1 as marcas escuras no
  modo escuro ficariam pastel e o escuro — o modo elogiado — quebraria. E a APCA já mostrou que o
  texto do claro nem era o gargalo. Aumentar o número trataria o sintoma errado.
- **Não trocar WCAG por APCA no gate.** APCA não é norma; auditoria cobra WCAG 2. Use como
  diagnóstico.
- **Não devolver `#FFFFFF` ao cartão "por causa do sol".** `#FDFDFE` tem 99% da luminância do
  branco (L\* 99,33 vs 100) — o ganho de sol é nulo e o custo é a escada inteira.
- **Não colorir a sombra do claro** (glow ciano/azul). Já está decidido certo em `criarSombras`
  (`glowCyan`/`glowBlue` viram sombra neutra no claro). Sombra colorida sobre superfície clara lê
  como borrão.
- **Não seguir o `useColorScheme()` do sistema.** É decisão registrada do dono (`TemaProvider.tsx`):
  o app abre sempre no claro. Nada aqui muda isso.
- **Não acrescentar cor de marca clara ao seletor** (amarelo, ciano) achando que "agora dá".
  O invariante §3 continua sendo o que segura os 120 `#fff` cravados. Nada nesta proposta afrouxa
  isso.
- **Não mexer em `inkLight`** para "consertar" — ele tem **0 usos** em `src/`. É token morto;
  apagar é limpeza, não tema.

---

## 10. Custo, esforço, e o que quebra se a rede cair

| | |
|---|---|
| **Arquivos tocados** | **1** — `src/theme/cores.ts` |
| **Esforço de código** | **P** — ~12 linhas: 6 hexes de superfície, 5 alfas, 1 expressão de `strokeGlow`, 3 `shadowOpacity`, 1 `sombraCor`, 1 `primaryContainerText`, 1 `surfaceGlass` |
| **Esforço de QA** | **M** — nenhuma tela muda de código, mas ~95 telas mudam de aparência. Vale a passada a olho da §8. |
| **Custo por uso** | **R$ 0,00.** Nenhuma API, nenhuma chamada de rede, nenhum byte. A paleta é aritmética local. |
| **Se a rede cair** | **Nada acontece.** `criarPaleta` é função pura e o tema já persiste local em `AsyncStorage` (`TemaProvider`, chave `olli.tema.v1`). Esta é das poucas mudanças do enxame com risco de rede exatamente zero. |
| **Rollback** | Reverter o arquivo. Não há migração, cache nem estado salvo derivado da paleta. |
| **Risco real** | O dono pode simplesmente **não gostar** da página mais escura. É gosto, e é dele. Mas os degraus (3,30/3,46/3,34) são um parâmetro: dá pra comprimir a escada para ~2,6 por degrau e ainda ficar acima do que existe hoje. O que **não** dá é manter o degrau de 0,00. |

### Limite deste documento

Eu **não vi o app numa tela** — estes são valores computados a partir do código, não uma
avaliação visual. O que este documento entrega não é "confie em mim, ficou bonito": é o dono
poder olhar e dizer *por que* estava estranho, e ter um parâmetro pra ajustar se quiser.

E vale registrar o que a §7.5 mostrou: **escurecer as superfícies do claro piorava um bug que já
existia.** Se essa mudança tivesse ido direto pro código sem medir as 12 marcas, teria consertado
a aparência e quebrado o contraste do chip de plano em silêncio.

---

## Fontes

- [React Native — Shadow Props](https://reactnative.dev/docs/shadow-props) — `shadowOpacity` é multiplicado pelo alfa da cor; `shadowOffset`/`shadowOpacity`/`shadowRadius` são iOS-only, Android usa `elevation`
- [APCA — in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html) — níveis Lc 15/30/45/60/75/90
- [APCA — Easy Intro](https://git.apcacontrast.com/documentation/APCAeasyIntro) — método e limitações do WCAG 2
- [Do not rely on WCAG 2 contrast calculation, try APCA](https://from.red/blog/do-not-rely-on-wcag2-contrast-calculation-try-apca/) — assimetria de polaridade
- [BOE — Why the Display Industry Needs the ACR Standard](https://blog.boe.com/darkroom-to-living-room-display-industry-needs-acr-standard) — ACR e luz refletida
- [VarTech — Sunlight-Readable Displays: An Engineering Overview](https://www.vartechsystems.com/articles/designing-operator-interfaces-bright-outdoor-conditions) — leitura sob sol
- [Material Design 3 — Color roles](https://m3.material.io/styles/color/roles) e [Tone-based surfaces](https://m3.material.io/blog/tone-based-surface-color-m3) — escada `surfaceContainer*` (o mesmo problema, resolvido por degraus de tom)
