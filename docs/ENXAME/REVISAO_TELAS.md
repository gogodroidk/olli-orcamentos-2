# REVISÃO ADVERSARIAL — as imagens que representam o produto

> Revisor: leva de revisão (2026-07-19). **Read-only**: nada de código foi tocado.
> Recorte: `assets/loja/screenshots/` (Play), `web/public/telas/` (landing, NO AR agora)
> e `scripts/telas/` (o pipeline que gera as duas).
>
> Tudo abaixo foi **medido**, não lido do `conformidade.json`. Onde há número, há
> comando que o produziu. Onde não deu para medir, está escrito que não deu.

---

## Veredito em três linhas

1. **Nada reprova na regra da Google.** Medi os 8 arquivos com parser de cabeçalho
   PNG próprio (sem sharp, para não confiar na mesma biblioteca que gerou o laudo):
   os 8 batem em todas as regras. O `conformidade.json` **não mentiu** em nenhum campo.
2. **O problema não é formato, é o que está DENTRO das imagens.** Três das oito
   telas da Play vendem contra o produto — uma delas tem **67% da altura vazia**.
3. **O portão de privacidade tem um furo demonstrável**: ele lê `innerText`, que
   **não enxerga o valor de campo de formulário** — e o pipeline digita em campo de
   formulário em exatamente duas telas publicadas. Provei com Playwright (§C1).

---

# A) TELAS DA PLAY — `assets/loja/screenshots/`

## A1. Medição independente (parser próprio, sem sharp)

Comando: parser de `IHDR`/chunks escrito para esta revisão, lendo byte a byte.

| arquivo | dim. | colorType | canais | alpha | bits | tRNS | interlace | bytes |
|---|---|---|---|---|---|---|---|---|
| 01-novo-orcamento-itens.png | 1080×1920 | 2 (truecolor RGB) | 3 | não | 24 | não | 0 | 527.261 |
| 02-orcamento-aprovado.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 565.387 |
| 03-lista-orcamentos.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 488.714 |
| 04-ordem-servico.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 413.022 |
| 05-agenda.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 499.478 |
| 06-codigos-erro.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 544.876 |
| 07-diagnostico-ia.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 442.214 |
| 08-clientes.png | 1080×1920 | 2 | 3 | não | 24 | não | 0 | 443.874 |

**Total: 3.924.826 bytes (3,74 MB) · maior arquivo 565 KB · proporção 1080/1920 = 0,5625 (9:16 exato).**

Conferências que o `conformidade.json` alega e que confirmei de forma independente:

- `colorType 2` + `bitDepth 8` = **PNG 24-bit truecolor**. Não há chunk `tRNS`
  (a única forma de um PNG colorType 2 carregar transparência). Alpha **realmente** ausente.
- `interlace 0` (não-entrelaçado).
- Extras: além do `IHDR`/`IDAT`/`IEND` só existe `pHYs`. **Nenhum `eXIf`, `tEXt`, `iTXt`
  ou `iCCP`** — ou seja, nenhum metadado com caminho de máquina, nome de usuário ou
  software vazando junto com a imagem. Isso não estava no laudo e é um ponto a favor.

## A2. Regra ATUAL da Google (verificada hoje na fonte)

Fonte: **[Add preview assets to showcase your app — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9866151)**, lida em 19/07/2026.
É a mesma URL que `moldura-loja.mjs:235` já cita — e ela **continua valendo**, o que
importa dizer porque a pergunta era justamente "a regra mudou?".

| regra oficial | valor | o nosso | veredito |
|---|---|---|---|
| formato | "JPEG or 24-bit PNG (no alpha)" | PNG 24-bit, sem alpha | **passa** |
| lado mínimo | 320 px | 1080 px | **passa** |
| lado máximo | 3840 px | 1920 px | **passa** |
| maior ≤ 2× menor | "can't be more than twice as long as the minimum dimension" | 1920 = 1,78 × 1080 | **passa** |
| proporção | 16:9 (paisagem) / 9:16 (retrato) | 0,5625 = 9:16 exato | **passa** |
| quantidade mínima | "a minimum of two screenshots" | 8 | **passa** |
| quantidade máxima | até 8 por tipo de aparelho | 8 (no teto) | **passa** |
| superfícies de recomendação | "at least four screenshots with minimum 1080px" | 8 com 1920 px | **passa** |
| peso | (a página não fixa limite por arquivo; `REGRAS.bytesMax = 8 MB` é folga) | 565 KB no pior caso | **passa** |

**Nenhuma reprovação de formato. Não há risco de recusa por asset nesta leva.**

Duas observações que a regra levanta e que o repo não cobre:

- **Não existem screenshots de tablet.** `app.json:11` traz `supportsTablet: false`, mas essa
  chave é do **iOS**; no Android o app roda em tablet por padrão (nada no manifest restringe
  tamanho de tela). A listagem publica sem isso (o mínimo de 2 já está satisfeito pelo
  telefone), então **não é bloqueio** — é elegibilidade perdida nas superfícies de tablet
  e Chromebook, onde a Google pede ~4 por classe. Decisão de negócio, não defeito.
- **`assets/loja/feature-graphic.png` e `icone-512.png` também passam** (medi junto):
  feature 1024×500 truecolor RGB sem alpha, 165 KB; ícone 512×512 RGBA 32-bit, 48 KB.

## A3. O que as imagens COMUNICAM — aqui está o estrago

### 🔴 A3.1 — `04-ordem-servico.png`: 67% da tela é cinza vazio

Medi a última linha de pixel com conteúdo na captura de origem (`ordem-servico@2x.webp`,
786×1704): **linha 563 de 1704**. Da linha 564 até o fim é fundo chapado.

```
tela                     ultima linha com conteudo   % da altura VAZIA no rodape
ordem-servico              563 / 1704                67%
diagnostico-ia             955 / 1704                44%
lista-orcamentos          1343 / 1704                21%
orcamento-aprovado        1703 / 1704                 0%
```

A 4ª screenshot da vitrine é **um cartão no topo e dois terços de nada**. A legenda promete
`O "sim" do cliente vira ordem de serviço`; a imagem entrega uma lista com um item e um
vazio enorme. O `elenco.mjs:92-94` escreve, com todas as letras, a regra que esta tela viola:

> "uma lista de um item não mostra que o produto organiza trabalho, mostra que ele está vazio."

A regra foi aplicada aos orçamentos (`ORCAMENTOS_EXTRA` existe só para isso) e **não** foi
aplicada às ordens de serviço: `semearTudo` (`semear.mjs:270-273`) cria **uma** OS.

**Caminho da falha:** o prestador abre a listagem na Play, desliza até a 4ª imagem e vê
uma tela vazia. É a imagem que mais parece "app sem nada dentro" de todo o conjunto — e ela
está a dois deslizes da primeira.

**Conserto:** semear 3–4 OS em estados diferentes (Aberta / Agendada / Em execução — os
filtros já estão desenhados na tela e hoje aparecem todos zerados). Mesma receita já usada
em `ORCAMENTOS_EXTRA`.

### 🔴 A3.2 — `05-agenda.png`: o relógio congelado caiu num SÁBADO

`elenco.mjs:39-41` documenta a intenção:

> "**Sexta-feira**, 18/07/2026, 10h35 (horário de Brasília). Sexta de manhã é de propósito:
> é quando a agenda da semana ainda tem coisa."

**18/07/2026 é SÁBADO.** Conferido:

```
$ node -e "new Date('2026-07-18T13:35:00.000Z').toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',...})"
sábado, 18 de julho de 2026 às 10:35
```

E o app imprime isso na imagem publicada: `05-agenda.png` mostra **"Sábado, 18 de julho"**.
Não é só o comentário que está errado — a decisão de produto que ele descreve **nunca
aconteceu**. Todas as telas com data, na Play e na landing, mostram um prestador trabalhando
no sábado.

O efeito composto aparece na tela de computador (§B4): com "hoje" no **sábado**, ele cai na
6ª de 7 colunas da semana, e os offsets usados (`dias: 0, 0, -1`) empilham tudo na borda
sexta/sábado. Resultado medido no `agenda-computador@2x.webp`: semana **13–19 de jul** com
**Seg 13, Ter 14, Qua 15, Qui 16 e Dom 19 completamente vazios** — 5 colunas de 7. O
`elenco.mjs:116-118` diz que esse arranjo existe justamente para evitar

> "seis colunas vazias e uma cheia, o que vende exatamente o contrário do que se quer vender."

Foram cinco em vez de seis. O objetivo declarado não foi atingido.

**Conserto:** mover `AGORA` para uma quarta ou quinta-feira de manhã (ex.: `2026-07-15T13:35:00.000Z`
= quarta) **e** espalhar `AGENDAMENTOS` por `dias: -2, -1, 0, 0, +1, +2`. Corrigir também o
comentário — hoje ele afirma um fato falso e é a única fonte de verdade sobre a escolha.

### 🟡 A3.3 — `05-agenda.png`: duas visitas no MESMO horário

Os dois compromissos do dia aparecem ambos às **09:00** (`criarAgendamentos` nunca define
hora; o app cai no padrão). Para o público-alvo — alguém que vive de encaixar visita — duas
visitas às 09:00 lê como conflito de agenda, não como organização.

### 🟡 A3.4 — `02-orcamento-aprovado.png`: a 2ª imagem da vitrine é um cartão de cobrança

É a screenshot que a Play mostra na busca, e a legenda promete `Aprovado, com PDF e envio no
WhatsApp`. O maior bloco da imagem é o painel **"Envie uma proposta pronta para aprovação —
2/5 sinais de confiança configurados"**, com três chips de alerta âmbar (`Logo da empresa ⚠`,
`Garantia clara ⚠`, `Pagamento explicado ⚠`).

O produto está mostrando ao visitante que a proposta está **incompleta**. Pior: o valor
aprovado — R$ 2.480, o argumento inteiro — **não aparece no enquadramento**.

**Conserto:** semear os 5 sinais de confiança (logo, validade, garantia, pagamento, aprovação)
antes da captura, ou rolar a tela até o bloco de valor. Hoje `capturar-uma.mjs:66-71` força
`scrollTop = 0` em tudo — o que é certo como padrão, mas esta tela precisa de exceção.

### 🟡 A3.5 — `01` e `02` contam uma história com dois números diferentes

- `01-novo-orcamento-itens.png` → **"Nº 00426"**
- `02-orcamento-aprovado.png` → **"nº 00126"**
- `03-lista-orcamentos.png` → lista 00126 / 00226 / 00326, **e o 00426 não está lá**

Não é bug de numeração — é comportamento correto: `getNextOrcamentoNumber()`
(`database.ts:1638-1642`) devolve `seq(3 dígitos) + ano(2)`, e o rascunho da tela 01 é o 4º
orçamento da rodada, criado com `pararEm: 'itens'` (`capturar-uma.mjs:31`), ou seja, **reserva
número e nunca é gerado**. Internamente coerente.

O problema é de **vitrine**: as duas primeiras imagens são, por decisão explícita
(`loja.mjs:59-63`), o "ciclo inteiro do dinheiro" — montar → aprovar. Elas mostram o mesmo
cliente e o mesmo R$ 2.480 com **dois números de documento diferentes**, e o número da
primeira não existe na lista da terceira. Quem lê com atenção — que é quem está decidindo
pagar — vê uma costura.

**Conserto:** capturar a tela 01 a partir do orçamento-herói em modo edição, em vez de criar
um 4º rascunho.

### 🟢 A3.6 — O que está BOM e não deve ser mexido

- **`06-codigos-erro.png`**: a legenda diz "698 códigos de erro" e o cabeçalho do app na
  imagem diz **"698 códigos de erro · 23 marcas"**. A âncora `esperar: '698 códigos'`
  (`loja.mjs:85`) garante que a legenda **falhe a captura** se a base mudar, em vez de virar
  mentira publicada. É o padrão certo e é o único lugar do conjunto que o aplica.
- **`03-lista-orcamentos.png`**: "3 orçamentos · R$ 3.525,00". Confere: 2.480 + 780 + 265 = 3.525.
- **Nenhum dado que pareça de cliente real.** Os telefones são todos `(11) 90000-xxxx` —
  faixa que a numeração brasileira não aloca (`elenco.mjs:12-17`); não há CPF nem CNPJ em
  lugar nenhum; endereços são rua genérica sem CEP. Varri as 8 imagens: nenhum avatar com
  foto de pessoa, nenhum documento, nenhum e-mail além do da própria empresa.
  **Um ponto para o dono decidir:** `Ramalho Climatização` e `contato@ramalhoclima.com.br`
  são o negócio real dele (`elenco.mjs:31-34` assume isso). É consentido por definição, mas
  publicar na Play amarra o nome do negócio dele ao produto para sempre. Se não for o desejado,
  é **uma linha** em `elenco.mjs` + recaptura.

---

# B) TELAS DA LANDING — `web/public/telas/` (no ar agora)

## B1. Peso — o que a página realmente baixa

`web/public/telas/` tem **951,6 KB em 33 arquivos** (AVIF 373,7 KB · WebP 570,7 KB).
Mas peso em disco não é peso baixado. Simulei a escolha do `srcset` (menor candidato
com `w ≥ sizes × DPR`) contra o HTML **realmente construído** em `web/dist/index.html`:

| cenário | AVIF | WebP (iOS 15 / WebView antiga) |
|---|---|---|
| DPR 1 (desktop comum) | **127,6 KB** | 172,5 KB |
| DPR 2 (celular Android típico) | **228,4 KB** | 362,7 KB |
| DPR 3 (celular topo) | **228,4 KB** | 362,7 KB |

**Contexto honesto:** esses bytes **não competem com os ~48 KB de JS acima da dobra**. A
esteira é a 4ª seção (`index.astro:473`, depois de hero, faixa, ofícios e "como funciona") e
**todas** as 8 imagens saem com `loading="lazy"` + `decoding="async"` — confirmado no HTML
compilado, não no `.astro`. Nenhuma imagem entra no caminho crítico. O hero é SVG desenhado
(`HeroDevices.tsx`), não usa nada desta pasta.

Então isto **não é emergência**. É desperdício mensurável a ser resolvido quando houver leva.

## B2. Conferência do `<picture>` — está tudo certo aqui

Lido de `web/dist/index.html` (o que está no ar), não do fonte:

- ✅ **AVIF + WebP com fallback**: dois `<source type>` + `<img src>` apontando para o WebP
  1×. Quem não tem AVIF não vê retângulo quebrado. O schema em `telas.ts:117-128` **exige**
  os dois formatos e mata o build se faltar um.
- ✅ **Lazy**: `loading="lazy"` nas 8.
- ✅ **Dimensão declarada**: `width="248" height="538"` (celular) e `width="440" height="275"`
  (computador), com `class="h-auto w-full"` dentro de `<figure style="width:248px">`.
  **Não há salto de layout** — a caixa é reservada antes de a imagem chegar.
- ✅ **`sizes` honesto**: `sizes="248px"`, a largura real do cartão, e não `100vw`. Isso está
  certo e o comentário em `EsteiraTelas.astro:71-76` explica por quê.
- ✅ **`alt` honesto** — conferi cada um contra a imagem correspondente. O da tela-herói diz
  "orçamento nº 00126 … status Aprovado … WhatsApp, gerar link e gerar PDF": abri o arquivo,
  é exatamente isso. O schema recusa `alt` genérico (`telas.ts:80,102-111`) e recusa `alt`
  começando com "screenshot/captura/imagem/print/foto".

**Nada a consertar em B2.** Esta parte foi bem feita.

## B3. 🟡 Superamostragem sistemática — 77 KB jogados fora no celular

`capturar-telas.mjs:76-79` gera as variantes a partir do **viewport de captura**
(786 e 393 px), não da **largura de exibição** (248 px). Resultado:

| slot | DPR | precisa | baixa | desperdício |
|---|---|---|---|---|
| 248 px | 1 | 248 px | **393 px** | 1,58× |
| 248 px | 2 | 496 px | **786 px** | 1,58× |
| 248 px | 3 | 744 px | 786 px | 1,06× ✓ |
| 440 px | 1 | 440 px | **1440 px** | 3,27× |
| 440 px | 2 | 880 px | **1440 px** | 1,64× |

O DPR 3 já está certo. O **DPR 2 — que é o celular Android mediano, o público do produto —
paga 1,58× em todas as sete telas de celular**.

Reencodei para medir de verdade (AVIF q62 effort 6, a partir do `@2x.webp`, portanto
**estimativa conservadora**: o pipeline real encodaria do PNG de origem e sairia igual ou melhor):

```
TOTAL AVIF DPR2   hoje 228,4 KB  ->  com um degrau de 496w: 151,3 KB   (-34%, -77 KB)
```

Detalhe por tela (hoje 786w → proposto 496w): orcamento-aprovado 45,7→30,7 · novo-orcamento-itens
44,2→29,9 · lista-orcamentos 32,2→22,1 · agenda 29,9→20,4 · clientes 19,9→13,7 ·
ordem-servico 15,8→9,7 · diagnostico-ia 20,4→14,5 · agenda-computador 20,3→10,3 (880w).

**Conserto:** **acrescentar** um degrau de 496w (celular) e 880w (computador) ao `srcset` —
não substituir o 786w, que é o degrau correto do DPR 3. Custo: 7 arquivos a mais.
Medi também o caminho "trocar 786w por 744w": **não compensa** (236,4 KB, pior que hoje).

## B4. 🔴 O cartão de computador é ilegível no tamanho em que é exibido

`LARGURA_EXIBIDA.computador = 440` (`telas.ts:184`), e a fonte é uma captura de 1440×900.
Renderizei a imagem no tamanho **real de exibição (440×275)** e olhei:

O texto fica com ~4 px de altura. Não se lê "Manutenção preventiva", não se lê "Clínica Vida
& Saúde", não se lê nenhum dia da semana. O cartão vira uma textura cinza quadriculada.

A legenda publicada promete: *"No computador o OLLI abre a semana toda: **dá para ver os
buracos da agenda** antes de prometer prazo ao cliente."* No tamanho exibido, o visitante
não vê buraco nenhum porque não vê nada. E quando ele **consegue** ver (só ampliando o
arquivo), o que aparece são **5 dos 7 dias vazios** (§A3.2) — que é o argumento contrário.

**Conserto, por ordem de esforço:**
1. Recortar a captura de computador na **região que importa** (a grade da semana, sem a barra
   lateral e sem o cabeçalho de filtros) antes de reduzir — a densidade útil por pixel triplica.
2. Ou dar a esse cartão largura maior que 440 px (ele já é `flex: 0 0 auto` num trilho rolável;
   nada quebra se ele for mais largo).
3. Corrigir o `AGORA` (§A3.2) para a semana não estar vazia.

## B5. 🟡 100,4 KB publicados que nenhum navegador escolhe

`agenda-computador@2x.avif` (37,9 KB) e `agenda-computador@2x.webp` (62,4 KB) são 2880 px de
largura para um slot de 440 px. Para o browser escolhê-los seria preciso `DPR ≥ 3,28`. Em
DPR 1, 2 e 3 o candidato vencedor é sempre o de 1440w.

São arquivos versionados em git (33 arquivos rastreados em `web/public/telas/`) e servidos
pelo Cloudflare Pages sem nunca serem baixados. Não custa banda de visitante — custa deploy
e ruído no diff.

## B6. 🟡 A legenda da agenda promete "endereço" e a imagem não tem endereço

`roteiro.mjs:61` / `telas.json`:

> "As visitas do dia com cliente, horário **e endereço**. O que ia ficar no papel do bolso."

Recortei o cartão da imagem publicada (`agenda@2x.webp`) em resolução plena. O cartão mostra:
**09:00 · "Limpeza do split da produção" · Padaria Pão Quente · chip "Visita"**. Não há
endereço em lugar nenhum do cartão, nem no de cima.

Isto é exatamente a classe de erro registrada em `olli-copy-derivada-da-fonte`: copy escrita
de memória, não derivada do que a tela mostra. Está **no ar agora**.

**Conserto:** trocar "e endereço" por "e o serviço" na legenda (1 linha em `roteiro.mjs:61`,
regenera o `telas.json`). Não é preciso recapturar imagem.

---

# C) O PIPELINE — `scripts/telas/`

## C1. 🔴 O portão de privacidade é CEGO para valor de campo de formulário

`gate-privacidade.mjs:51`:

```js
const texto = await page.evaluate(() => document.body.innerText);
```

`innerText` devolve o texto **renderizado como nó de texto**. O `value` de um `<input>` ou
`<textarea>` **não é nó de texto filho** — não entra. Não deduzi: medi, com o Playwright que
o próprio pipeline usa.

```
página de teste: <div>Cliente: Fulano</div>
                 <input value="(11) 98765-4321">
                 <textarea>meu CEP e 01310-100 e email joao@empresa.com.br</textarea>

innerText que o portão lê  ->  "Cliente: Fulano"
texto REAL na tela         ->  "Cliente: Fulano(11) 98765-4321 meu CEP e 01310-100 e email joao@empresa.com.br"
```

E rodando o portão **de verdade** (`import { conferirTexto } from './gate-privacidade.mjs'`)
sobre as duas strings:

```
o que o portão AVALIA hoje : []
se ele visse os campos     : [ "CEP fora do elenco: \"01310-100\"",
                               "e-mail fora do elenco: \"joao@empresa.com.br\"",
                               "telefone fora do elenco: \"(11) 98765-4321\"" ]
```

**As regex funcionam. O portão simplesmente não recebe o texto.**

**Por que isto importa agora, e não em tese:** o pipeline **digita em campo de formulário de
propósito** em duas telas publicadas.

- `07-diagnostico-ia.png` (Play) e `diagnostico-ia.*` (landing, no ar): quatro campos
  preenchidos via `tela.preparar` (`roteiro.mjs:86-91`) — marca, modelo, código e um sintoma
  de 96 caracteres. **Todos invisíveis ao portão.** A imagem prova: os quatro valores estão
  dentro das caixas cinzas de campo.
- `06-codigos-erro.png` (Play): `"E4"` digitado na busca (`loja.mjs:87`). Idem.

Que `preencher()` opera sobre `<input>` está provado pelo próprio repo: `semear.mjs:59` usa
`locator.fill()`, que o Playwright **recusa** em qualquer elemento que não seja
`<input>`/`<textarea>`/`[contenteditable]`; e `preencherPorRotulo` (`semear.mjs:69`) usa o
xpath `following::input` explicitamente.

**Hoje não vaza nada** — os valores são literais fixos de `roteiro.mjs` e o banco é SQLite
vazio. O defeito é que **o portão não é o que ele diz ser**. O cabeçalho
(`gate-privacidade.mjs:1-21`) declara "roda ANTES de gravar cada imagem", "aqui a regra é
FALHAR, não avisar", "duas checagens sobre o **texto visível da tela**", e lista as limitações
conhecidas (`<canvas>`, imagem embutida) — **e esta não está na lista**. Quem ler aquele
cabeçalho vai confiar em algo que não cobre a superfície mais óbvia de entrada de dado.

O risco é real e recente: o commit `f112956 feat: CEP preenche endereço` acabou de ligar
**preenchimento automático de endereço por CEP**. No dia em que alguém semear um cliente com
CEP para deixar a tela mais rica, o CEP entra por um `<input>` — e passa direto.

**Conserto (uma linha):**

```js
const texto = await page.evaluate(() =>
  document.body.innerText + '\n' +
  [...document.querySelectorAll('input,textarea')].map((e) => e.value).join('\n'));
```

E acrescentar a limitação à lista do cabeçalho, com a mesma honestidade das outras duas.

## C2. 🟠 Uma captura que falha no meio APAGA a esteira da landing em silêncio

`capturar-telas.mjs` faz, nesta ordem:

1. `rmSync(SAIDA, { recursive: true, force: true })` — **linha 101**, destrói `web/public/telas/` inteiro
2. loop de captura, gravando imagem por imagem — **linhas 117-141**, **sem `try/catch`**
3. `writeFileSync(.../telas.json)` — **linha 148**, só depois do loop terminar

Se a 5ª tela de 8 estourar uma âncora, o processo morre com o diretório **parcialmente
preenchido e sem `telas.json`**. Aí `carregarTelas()` (`telas.ts:274-276`) encontra ENOENT,
devolve `{ estado: "ausente" }` — que é o caminho **legítimo** de "ainda não geraram" — e
`EsteiraTelas.astro:31` não renderiza nada. **O build passa. O deploy passa. A seção some.**

É exatamente o defeito que `telas.ts:18-33` gasta quarenta linhas jurando impedir ("erro
NUNCA vira sucesso", "manifesto quebrado tratado como 'sem telas' faria a seção sumir da
landing sem ninguém perceber"). A porta foi trancada para *manifesto quebrado* e ficou aberta
para *manifesto apagado*.

Contraste que prova que é lapso e não decisão: **`loja.mjs` faz isso certo** — coleta
`falhas[]`, imprime todas e `process.exit(1)` (`loja.mjs:188-194, 247-252`). O pipeline da
landing não ganhou o mesmo tratamento.

**Atenuante honesto:** os 33 arquivos são versionados em git, então `git status` mostraria as
deleções — se alguém olhar. Com o fluxo documentado do dono ("buildar+deploy nesse projeto a
cada leva"), rodar a captura e buildar em seguida publica a landing sem a seção, sem erro em
lugar nenhum.

**Conserto:** `try/catch` por tela como em `loja.mjs`, e `process.exit(1)` no fim se houver
falha. Melhor ainda: gravar em diretório temporário e só trocar pelo definitivo no sucesso.

## C3. ✅ O que é genuinamente repetível — e é bastante

Não é teatro. O pipeline resolve, com cuidado real, quase tudo que faz screenshot variar:

- **Relógio ancorado** (`navegador.mjs:56-57`): `clock.install` + `resume`, com o comentário
  explicando por que `setFixedTime` travava o `Animated` do RN. `AGORA` é literal.
- **`deviceScaleFactor`, `locale`, `timezoneId`, `colorScheme`, `reducedMotion`** todos fixos.
- **Âncoras de conteúdo, nunca `waitForTimeout`** — `roteiro.mjs:21-24` proíbe explicitamente,
  e a única exceção (`capturar-uma.mjs:52-61`) é declarada e justificada (400 ms para uma
  animação de duração conhecida de 150 ms).
- **Blur + `scrollTop = 0`** antes de fotografar (`capturar-uma.mjs:55-71`) — matam as duas
  fontes de diff que sobravam.
- **Portão de rede** em `novaPagina` e na moldura: qualquer saída para host externo **aborta**
  (`navegador.mjs:65-72`, `moldura-loja.mjs:151-158`).
- **`guarda-bundle.mjs`**: lê o ref do projeto Supabase de `src/config.ts` e recusa continuar
  se ele aparecer no JS exportado. Roda nos **dois** pipelines. Esta é a defesa que realmente
  funciona — e é arquitetural, não regex: sem credencial no bundle, não há dado real ao
  alcance do browser.
- **Ano do número do documento vem do relógio congelado** (`database.ts:1640`), então "00126"
  continua "00126" mesmo rodando em 2027. Genuinamente determinístico.

**O que falta:** nenhum teste afirma estabilidade byte a byte. O cabeçalho de
`capturar-uma.mjs:48-50` conta que "quatro dos 33 arquivos saíam com bytes diferentes a cada
execução" — a causa foi corrigida, mas **nada impede a regressão**. Um `--conferir` que
recaptura e compara md5 com o que está em git fecharia isso. Não é defeito; é a rede que falta.

## C4. 🟡 `docs/ENXAME/LOJA.md` manda refazer, à mão, o que já está pronto

`LOJA.md:150-151`, na lista de passos pendentes:

> 13. [ ] Capturar as 8 telas e rodar `node assets/loja/montar-screenshots.js`
>     (passo a passo em `assets/loja/SCREENSHOTS.md`).

Esse é o caminho **antigo**: emulador + adb + APK. `loja.mjs:16-20` diz que ele foi substituído
("aqui não há aparelho, não há APK e não há login"), e as 8 screenshots **já existem,
conformes e commitadas**.

**Caminho da falha:** o dono abre `LOJA.md` para publicar — é o documento feito para isso —
chega no item 13 ainda com `[ ]`, sobe o emulador e refaz por adb um trabalho já entregue.
Ou pior: conclui que falta screenshot e adia a publicação.

**Conserto:** marcar o item 13 como feito e trocar o comando por `node scripts/telas/loja.mjs`.

---

# Ordem de conserto — por impacto

## Landing (está no ar; consertar nesta ordem)

| # | o quê | onde | esforço | por que primeiro |
|---|---|---|---|---|
| 1 | Legenda promete "endereço" que a imagem não tem | `roteiro.mjs:61` | 1 linha, sem recaptura | copy falsa publicada; mesma classe de erro que já bateu 5× |
| 2 | Cartão de computador ilegível a 440 px | `telas.ts:184` + recorte em `capturar-telas.mjs` | médio | o cartão não entrega o argumento que a legenda promete |
| 3 | `ordem-servico` 67% vazia | `semear.mjs:270` (semear 3–4 OS) | médio, exige recaptura | vende "app vazio" |
| 4 | Sábado + semana com 5 dias vazios | `elenco.mjs:41,120-124` | médio, exige recaptura | some junto com o #3 numa recaptura só |
| 5 | Degrau de 496w / 880w no `srcset` | `capturar-telas.mjs:76-79` | pequeno | **−77 KB (−34%) no celular DPR 2** |
| 6 | Apagar `agenda-computador@2x.*` | `web/public/telas/` | trivial | 100,4 KB publicados que ninguém baixa |

**#3, #4 e #5 saem numa recaptura só.** Não recapturar três vezes.

## Play (ainda não publicado — dá tempo)

| # | o quê | onde |
|---|---|---|
| 1 | `04-ordem-servico`: tela vazia na 4ª posição da vitrine | `semear.mjs:270` |
| 2 | `02-orcamento-aprovado`: cartão de cobrança cobrindo o valor aprovado | semear os 5 sinais de confiança |
| 3 | Sábado em toda tela com data | `elenco.mjs:41` |
| 4 | `01` e `02` com números de documento diferentes | `capturar-uma.mjs:24-32` |
| 5 | Duas visitas às 09:00 | `semear.mjs:202-220` |
| — | Formato/dimensão/alpha/peso | **nada a fazer — os 8 passam** |

## Pipeline

| # | o quê | onde | esforço |
|---|---|---|---|
| 1 | Portão cego a valor de campo | `gate-privacidade.mjs:51` | **1 linha** |
| 2 | Falha parcial apaga a esteira em silêncio | `capturar-telas.mjs:101,117-141` | pequeno |
| 3 | `LOJA.md` item 13 obsoleto | `docs/ENXAME/LOJA.md:150` | trivial |
| 4 | Sem guarda de estabilidade byte a byte | `capturar-telas.mjs` (novo `--conferir`) | médio, opcional |

---

## Fonte

- [Add preview assets to showcase your app — Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/9866151) — lida em 19/07/2026. É a mesma URL citada em `moldura-loja.mjs:235` e ela continua valendo: mínimo 2 capturas, máximo 8 por tipo de aparelho, JPEG ou PNG 24-bit sem alpha, lado entre 320 e 3840 px, maior lado ≤ 2× o menor, e ≥ 4 capturas com ≥ 1080 px para concorrer às superfícies de recomendação.
