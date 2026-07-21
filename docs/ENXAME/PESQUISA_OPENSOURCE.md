# PESQUISA_OPENSOURCE.md

**Lente:** código aberto que o OLLI poderia **usar** em vez de escrever.
**Data da pesquisa:** 21/07/2026. Todo preço, licença e "último commit" foi conferido
nesta data, na fonte primária (GitHub API, registry do npm, página de preço do
fornecedor). **Preço de API e limite de plano grátis mudam** — reconfira antes de
assinar qualquer coisa.
**Câmbio usado nas conversões:** US$ 1,00 = R$ 5,11 ([Investing.com, 20/07/2026](https://br.investing.com/currencies/usd-brl)).
Onde escrevi R$, é conversão minha, não preço em real do fornecedor.

**Autor:** agente read-only. Não editei uma linha de código. Tudo que digo que o OLLI
"já tem" foi conferido por leitura de arquivo ou `grep`, e o caminho está citado.

---

## 0. Legenda de licença (leia antes das recomendações)

| Licença | O que EXIGE de você | Serve para produto comercial fechado? |
|---|---|---|
| **MIT / ISC / Apache-2.0 / BSD** | Manter o aviso de copyright junto com a distribuição. Apache-2.0 adiciona concessão explícita de patente. | **Sim.** Sem risco. |
| **MPL-2.0** | Se você **modificar** um arquivo da lib, esse arquivo modificado tem que sair sob MPL. Seu código próprio, em arquivos novos, continua fechado. Você deve informar onde obter o fonte da parte MPL. | **Sim**, desde que não fork o arquivo. Mozilla é explícita: *"New files containing no MPL-licensed code are not Modifications"* ([MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)). |
| 🔴 **GPL-2.0 / GPL-3.0** | Se você **distribuir** um binário que incorpora código GPL, tem que distribuir o **código-fonte inteiro da obra derivada** sob GPL. | 🔴 **NÃO** para copiar código para dentro do OLLI. Rodar o programa como ferramenta separada (ex.: um servidor que você usa mas não distribui) não dispara a obrigação. |
| 🔴 **AGPL-3.0** | Igual à GPL **mais** o gatilho de rede: se usuários interagem com o software **pela rede**, você é obrigado a oferecer o fonte. Um SaaS não escapa. | 🔴 **NÃO.** Para um app/SaaS fechado, AGPL é a armadilha jurídica mais séria da lista. |
| **FSL (Functional Source License)** | Não é open source. Uso permitido menos "concorrer com o produto"; vira Apache-2.0 depois de 2 anos. | Depende. Para uso interno, normalmente sim. Leia o texto. |
| **LGPL-2.1** | Obrigações valem se você **linka** a biblioteca. **Rodar o executável** como ferramenta de linha de comando não contamina seu código. | **Sim**, como ferramenta de build/CI. |

**Regra de rocha para este repositório:** nenhuma linha de código GPL/AGPL entra no
OLLI. Ler para aprender modelagem é livre; copiar é contaminar.

---

## 1. Primeiro: o que o OLLI JÁ TEM (não proponha isso de novo)

Conferi antes de escrever. Este projeto é **muito** mais auto-suficiente do que uma
lista de dependências sugere. Qualquer proposta que reinvente um destes itens é
proposta ruim:

| O OLLI já resolve | Onde | Observação |
|---|---|---|
| Gerador de **QR code** em JS puro (Reed-Solomon, GF(256), máscaras) | `src/utils/qrcode.ts` + `worker/src/pmoc.js` | Zero dependência. Roda igual no app e no workerd. Não sugerir `qrcode`/`react-native-qrcode-svg`. |
| **Pix Copia-e-Cola** (BR Code EMV + CRC16-CCITT) | `src/utils/pixBrCode.ts` | 100% local, offline. Não sugerir `pix-utils`. |
| Validação de **CPF/CNPJ** e máscaras BR | `src/utils/masks.ts` (`isValidCPF`, `isValidCNPJ`) | Não sugerir `@brazilian-utils/brazilian-utils`. |
| **CEP** (ViaCEP) e **CNPJ** com cache | `src/services/cep.ts`, `worker/src/brasil.js` | |
| **Feriados** brasileiros calculados | `src/services/feriados.ts` (323 linhas) | |
| **Assinatura do cliente com o dedo** — PanResponder + `react-native-svg` + rasterização em JS puro | `src/components/assinatura/AssinaturaClienteModal.tsx`, `rasterizarAssinatura.ts` | Funciona offline. Veja o achado #2 abaixo. |
| **PDF/documento** (orçamento, contrato, recibo, PMOC, etiqueta, certificado ANVISA) via HTML | `src/utils/pdfGenerator.ts`, `contratoPdf.ts`, `reciboPdf.ts`, `termosPdf.ts`, `documentoBase.ts` | Saída única multiplataforma em `exportarDocumento.ts` (expo-print no nativo, iframe `print()` na web). O painel **reusa o mesmo gerador** (`webapp/src/olli/pdf/imprimirContrato.ts`). |
| **Gate de contraste** próprio, com prova da paleta inteira | `scripts/checar-contraste.mjs` | Roda no `preflight`. É melhor do que o que a maioria dos projetos tem. |
| **Sync per-row bidirecional** com LWW, tombstones e guarda de conflito | `src/services/cloudSync.ts` (2.255 linhas) | Ver seção 4 — tem um buraco, e ele **não** se resolve trocando de engine. |
| **Suíte de testes** (29 scripts) + CI de 3 pontas | `scripts/teste-*.ts`, `.github/workflows/ci.yml` | |

**O que o gate NÃO tem hoje** (conferido: `package.json` da raiz não tem script de
lint; `worker/package.json` só tem `check`/`deploy`; o único lint do repositório é
o Biome do `webapp/lefthook.yml`; `grep -rn "axe"` em `scripts/` = 0 resultados):

- lint na raiz (app) e no worker;
- **teste de acessibilidade automatizado** (nenhum);
- **varredura de segredo** (nenhuma — num repositório com histórico de `.env`, secrets do worker e um token de API fraco documentado na memória do projeto);
- **detecção de código/dependência morta** (nenhuma);
- regressão visual (nenhuma).

É exatamente aí que o código aberto paga mais rápido, e é por isso que 3 das 4
primeiras recomendações abaixo são de ferramenta de gate, não de biblioteca de
produto.

---

## 2. Achados de auditoria que valem mais que qualquer biblioteca nova

Estes saíram da leitura do código, não da busca. São ganho de graça.

### Achado 1 — `react-native-signature-canvas` está no `package.json` e **não é usado por nenhum arquivo**

```
grep -rl "react-native-signature-canvas" src/ App.tsx index.ts  →  0 arquivos
```

A assinatura real é a de `src/components/assinatura/AssinaturaClienteModal.tsx`
(PanResponder + SVG, escrita à mão, offline). A dependência ficou órfã: 103 KiB
descompactados e um `peerDependency` de `react-native-webview >= 13`.

**Fazer:** `npm uninstall react-native-signature-canvas`. Esforço **P** (minutos).
Risco: nenhum — `grep` prova que ninguém importa.
(`react-native-webview` **continua necessário**: `src/components/PdfPreviewModal.tsx:20` o carrega via `require`.)

### Achado 2 — `react-native-uuid` (68 KiB) faz o que o `expo-crypto` já instalado faz

`src/utils/id.ts` inteiro é:

```ts
import uuid from 'react-native-uuid';
export function generateId(): string { return uuid.v4() as string; }
```

O `expo-crypto` (já em `dependencies`) expõe `Crypto.randomUUID()` — UUID v4 RFC4122
com fonte criptograficamente segura, em Android/iOS/tvOS/**Web**
([docs Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/crypto/)).

**Fazer:** trocar o corpo de `id.ts` e desinstalar. Esforço **P**.
**Cuidado real:** IDs já gravados no SQLite não mudam — a troca só afeta IDs novos, e
os dois formatos são UUID v4. Rode `npm test` (a suíte de sync compara IDs).

### Achado 3 — `react-native-paper` + `react-native-paper-dates` = 4,6 MB para **3 imports**

| Pacote | Tamanho descompactado | Usado em |
|---|---|---|
| `react-native-paper` 5.15.3 (MIT) | **3.680 KiB** | `src/theme/index.ts:1` (`MD3DarkTheme`, `MD3LightTheme`) e `App.tsx:4` (`PaperProvider`) |
| `react-native-paper-dates` 0.23.9 (MIT) | **954 KiB** | `TimePickerModal` em `AgendaScreen.tsx:16` e `AgendaDesktopScreen.tsx:10` |

O `PaperProvider` só existe porque o `paper-dates` exige. Ou seja: 4,6 MB de
node_modules para **um seletor de hora**.

**NÃO faça isso agora.** Coloco aqui como item medido, não como tarefa. O caminho
honesto: **medir o APK antes de mexer**. O Metro não faz tree-shaking bom, então o
custo real no bundle provavelmente é grande — mas "provavelmente" não é medida.
Se e quando for medir, o substituto não precisa de biblioteca: o app já tem
`react-native-gesture-handler`, `react-native-svg` e 41 componentes próprios.
Esforço se for fazer: **M**. Benefício para o prestador: APK menor = instala em
celular fraco com pouca memória, que é exatamente o celular do técnico de campo.

---

## 3. AS RECOMENDAÇÕES (fortes, em ordem de pagar mais rápido)

### R1 — gitleaks: varredura de segredo no pre-commit e no CI 🟢 FAZER

| | |
|---|---|
| **Repositório** | [github.com/gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) |
| **Licença** | **MIT.** Exige só manter o aviso de copyright. Zero risco. |
| **Último release** | `v8.30.1`, 21/03/2026. Último push no repo: 20/07/2026. |
| **Mantenedores** | Concentrado: `zricethezav` (Zach Rice) com 671 commits, segundo colaborador (`rgmz`) com 126 — conferido na API do GitHub em 21/07/2026. **É risco de mantenedor único**, mitigado por 28,2 mil estrelas, releases regulares e pelo fato de ser ferramenta externa (se parar, você troca sem tocar no produto). |
| **Tamanho no bundle** | **Zero.** É um binário Go separado, não entra em `package.json` nem no APK. |
| **Onde roda** | Máquina do dev (Windows/Linux/macOS, binário único) e no CI. **Não** roda no React Native nem no Worker — nem precisa. |
| **Custo por uso** | **R$ 0,00.** |
| **Offline** | Roda 100% local. Não faz chamada de rede. |

**O que resolve PARA O PRESTADOR:** indiretamente, mas de forma severa — impede que
uma chave do Mercado Pago, o `service_role` do Supabase ou um secret do Worker vá
parar num commit público. Um vazamento desses, com dados de cliente (CPF, CEP,
endereço) no banco, é o fim do produto. O prestador nunca vai saber que existiu; é
disso que se trata.

**Por que agora:** a memória deste projeto tem entradas inteiras sobre recuperação
de secrets do Worker e sobre um `CLOUDFLARE_API_TOKEN` fraco no `.env`. Hoje nada
impede que um `.env` entre num commit por acidente.

**Esforço: P.** Duas coisas:
1. `.github/workflows/ci.yml` — um job novo com a action oficial;
2. um hook de pre-commit rodando `gitleaks protect --staged --redact`.

---

### R2 — Knip: matar dependência e código morto 🟢 FAZER

| | |
|---|---|
| **Repositório** | [github.com/webpro-nl/knip](https://github.com/webpro-nl/knip) |
| **Licença** | **ISC** (equivalente funcional ao MIT). Zero risco. |
| **Último release** | `knip@6.27.0`, 15/07/2026 — **seis dias antes desta pesquisa**. Vivíssimo. |
| **Mantenedores** | Lars Kappert (`webpro`) como mantenedor principal, 11,8 mil estrelas, 24 issues abertas — número baixíssimo para o porte, sinal de manutenção real. Dependência de um mantenedor: sim, e é uma devDependency, o que limita o dano. |
| **Tamanho no bundle** | **Zero no app.** 1.816 KiB só em `devDependencies`. |
| **Onde roda** | Node ≥ 20.19 / ≥ 22.12 (o CI do app já usa Node 22). **Não** roda no RN nem no Worker. |
| **Custo por uso** | **R$ 0,00.** |
| **Offline** | Análise estática local. |

**O que resolve PARA O PRESTADOR:** APK menor e menos superfície de bug. E, no
concreto: **eu já achei duas coisas na mão** (achados 1 e 2 acima) — o Knip acha as
que eu não achei, e acha de novo daqui a três meses sem ninguém lembrar de olhar.

**Cuidado real:** Knip dá falso-positivo em projeto com múltiplos `package.json`
(raiz, `web/`, `webapp/`, `worker/`) e com arquivos que só o Expo/Metro/Astro
carregam por convenção. **Comece rodando só na raiz, em modo relatório, sem falhar o
build.** Só depois de a lista estar limpa é que ele vira gate. Se você colocar como
gate no dia 1, ele vai quebrar o CI por engano e você vai desligar — e aí não serve
para nada.

**Esforço: P** para instalar e rodar; **M** para limpar a primeira lista.

---

### R3 — @axe-core/playwright: acessibilidade automatizada nas 3 pontas 🟢 FAZER

| | |
|---|---|
| **Repositório** | [github.com/dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm) (wrapper) sobre [dequelabs/axe-core](https://github.com/dequelabs/axe-core) (motor) |
| **Licença** | 🟡 **MPL-2.0.** Copyleft **por arquivo**: se você editar um arquivo do axe, o arquivo editado tem que sair sob MPL. Seu código, em arquivos seus, continua fechado. E aqui é `devDependency` — **nunca é distribuído ao usuário**, então a obrigação de disponibilizar fonte nem chega a ser acionada. Fonte: [MPL 2.0 FAQ da Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/). |
| **Último release** | `@axe-core/playwright` 4.12.1 no npm; tag `v4.11.3` de 04/05/2026; push no repo em 20/07/2026. `axe-core` (motor) com push em 20/07/2026. |
| **Mantenedores** | **Deque Systems** — empresa de acessibilidade, não indivíduo. É o motor que o Lighthouse usa por baixo. Risco de abandono: baixíssimo. |
| **Tamanho no bundle** | **Zero no produto.** 46 KiB do wrapper + o `axe-core` (~600 KiB) em `devDependencies`. |
| **Onde roda** | Node, dirigindo um navegador via Playwright. **Não** roda dentro do RN nativo nem no Worker. |
| **Custo por uso** | **R$ 0,00.** |
| **Offline** | Precisa da página servida (localhost basta). Nada de rede externa. |

**O pulo do gato, e é por isso que esta é a recomendação de melhor relação
custo/benefício da lista:** o **Playwright já é `devDependency` da raiz** (`^1.61.0`,
`package.json:63`) e já existe um script que sobe o Chromium e navega o app
(`scripts/qa-web.mjs`). Adicionar axe é **um `import` e três linhas** dentro de um
harness que já funciona.

E como o app Expo **também exporta para web** (`npm run export:web`), o axe consegue
auditar **as telas do app**, não só o painel e a landing. Um `accessibilityLabel`
faltando numa tela do RN vira um `aria-label` faltando no DOM do RN-web, e o axe
enxerga. É o único jeito barato de testar a11y de tela de React Native que existe
hoje — não há axe nativo para RN.

Estado atual: **45 dos 61 arquivos `.tsx` de `src/screens`** usam
`accessibilityLabel` — a base existe e é boa; o que falta é a régua que impeça os
outros 16 (e os próximos) de regredirem em silêncio.

**Esforço: P/M.** P para rodar contra a landing (`web/`, HTML estático). M para
cobrir painel e app, porque exige um fluxo autenticado — mas `qa-web.mjs` já mostra o
caminho.

**Onde plugar:** `npm run preflight` (que hoje é `typecheck && test && check:contraste && doctor`).
Encaixa ao lado do `check:contraste`, que já é o precedente da casa para "gate de
qualidade visual".

---

### R4 — expo-updates + EAS Update: consertar bug de campo no mesmo dia 🟢 FAZER

| | |
|---|---|
| **Pacote** | `expo-updates` — parte do [expo/expo](https://github.com/expo/expo) |
| **Licença** | **MIT.** Zero risco. |
| **Último push do monorepo** | 21/07/2026. 50,8 mil estrelas. |
| **Mantenedores** | **Expo (empresa)**. Primeira-parte da stack que você já usa. |
| **Tamanho no bundle** | Adiciona código nativo ao APK (ordem de dezenas de KB) — o custo real é o **rebuild obrigatório** do APK para instalar, não o tamanho. |
| **Onde roda** | Só no app nativo (Android/iOS). Não no Worker, não na web. |
| **Custo por uso** | **R$ 0,00 até 1.000 usuários ativos por mês** (plano Free do Expo, updates ilimitados). Próximo degrau: **Starter US$ 19/mês ≈ R$ 97/mês** para 3.000 MAU ([expo.dev/pricing](https://expo.dev/pricing), consultado 21/07/2026). Com **zero pagantes hoje**, isso é R$ 0 pelo horizonte inteiro que interessa. |
| **Offline** | Projetado para isso: se o serviço de update não responde, o app **carrega o bundle embutido** no APK. `fallbackToCacheTimeout` controla quanto tempo espera. O técnico sem sinal abre o app normalmente. Fonte: [docs Expo SDK 56 — expo-updates](https://docs.expo.dev/versions/v56.0.0/sdk/updates/). |

**O que resolve PARA O PRESTADOR:** hoje, se um bug de JavaScript aparece com o
técnico em cima do telhado, o conserto passa por: buildar APK no Windows → subir na
Play Store → esperar revisão → o prestador **atualizar** o app. Isso é dias. Com
expo-updates, é minutos, e o prestador nem percebe.

**Por que isso é uma recomendação de dono-sozinho:** é o item da lista que mais
compensa a falta de equipe. Uma pessoa não consegue estar disponível para um ciclo
de loja; consegue rodar `eas update`.

**Confirmado no repositório:** `app.json` **não tem** bloco `updates` nem
`runtimeVersion` (`grep -n "updates\|runtimeVersion" app.json` → vazio), e
`expo-updates` não está em `dependencies`. O `eas.json` já existe e está configurado
(`appVersionSource: "local"`, perfis development/preview/production).

**Cuidados reais, e são sérios:**
1. **Não atualiza código nativo.** Trocar/atualizar qualquer módulo Expo continua
   exigindo APK novo. O `runtimeVersion` é o que impede um bundle JS novo de rodar
   sobre um binário incompatível — **configure-o certo ou você quebra o app dos
   outros à distância**, que é pior do que não ter OTA.
2. **Só testa em release build.** Não dá para validar em Expo Go nem em dev build.
3. É poder de escrita remota no aparelho do cliente. Trate `eas update` com o mesmo
   respeito de um deploy de produção — porque é.

**Esforço: M.** Instalar é `npx expo install expo-updates`; o trabalho está na
política de `runtimeVersion` e num rebuild do APK.

---

### R5 — expo-network no lugar da sonda HTTP a cada 20 s 🟢 FAZER

| | |
|---|---|
| **Pacote** | `expo-network` (SDK 56) — [docs](https://docs.expo.dev/versions/v56.0.0/sdk/network/) |
| **Licença** | **MIT.** |
| **Mantenedores** | Expo (empresa). Primeira-parte. |
| **Tamanho no bundle** | Módulo Expo pequeno; exige rebuild do APK (é nativo). |
| **Onde roda** | Android, iOS, tvOS **e Web**. Não no Worker. |
| **Custo por uso** | **R$ 0,00** — e **economiza** dado móvel do prestador. |
| **Offline** | É o detector de offline. |

**O problema atual, no código:** `src/components/tecnico/BarraOffline.tsx:72-80`
detecta conectividade fazendo, no nativo, um `HEAD` no Supabase a cada **20 segundos**
com timeout de 4 s (`INTERVALO_SONDA_MS = 20000`). O próprio comentário explica por
quê: *"sem dependência nova (sem NetInfo no projeto)"*.

Isso é uma decisão defensável que envelheceu mal. Custo dela, no celular do técnico
em campo o dia inteiro: **180 requisições por hora**, rádio acordando o tempo todo,
bateria e franquia de dados indo embora — e uma latência de até 20 s para perceber
que a rede voltou.

`expo-network` oferece `useNetworkState()` e `addNetworkStateListener()`, com
`isInternetReachable`, **orientado a evento**: zero requisição, resposta instantânea.

**O que resolve PARA O PRESTADOR:** bateria e dado móvel — os dois recursos mais
escassos de quem trabalha na rua o dia inteiro. E a barra "tudo salvo" fica honesta
mais rápido.

**Cuidado real:** `isInternetReachable` pode ser `null` enquanto o SO não decidiu.
Trate os **três** estados (`true` / `false` / `null` = não sei) — a memória deste
projeto tem uma entrada inteira sobre o bug recorrente de *"erro vira vazio"*, e
tratar `null` como offline (ou como online) é exatamente a mesma armadilha.

**Esforço: P** no código, **M** contando o rebuild do APK. Se for fazer o R4
(expo-updates), faça os dois no mesmo rebuild.

---

### R6 — Regressão visual com o Playwright que você já tem 🟡 FAZER DEPOIS

| | |
|---|---|
| **Ferramenta** | `expect(page).toHaveScreenshot()` — **nativo do Playwright**, sem pacote novo |
| **Licença** | **Apache-2.0** ([microsoft/playwright](https://github.com/microsoft/playwright)). Zero risco. |
| **Último release** | `v1.61.1`, 23/06/2026. O `package.json` da raiz já pede `^1.61.0`. |
| **Mantenedores** | **Microsoft.** 93,2 mil estrelas. |
| **Tamanho no bundle** | Zero (devDependency já instalada). |
| **Custo por uso** | **R$ 0,00.** |

**O que resolve:** a landing e o painel são vitrine e ferramenta de trabalho. Uma
regressão de layout num deploy não aparece em `tsc --noEmit` nem em teste de lógica.

**Por que "depois" e não "agora":** teste de screenshot é o mais flaky que existe.
Fonte de ruído: fonte renderizada diferente entre Windows (sua máquina) e Linux (o
CI), animação (`motion` está nas duas pontas), e conteúdo dinâmico (datas, o "AGORA"
da agenda). Se você gerar as imagens de referência no Windows e comparar no Ubuntu
do GitHub Actions, **vai falhar sempre** e você vai desligar.

**Como fazer certo, se fizer:** gerar e comparar **sempre no mesmo ambiente** (o
container oficial `mcr.microsoft.com/playwright`), congelar animação
(`prefers-reduced-motion` — que a landing já respeita, `useReducedMotion` existe no
app) e congelar o relógio.

**Esforço: M.** **NÃO adote [lost-pixel](https://github.com/lost-pixel/lost-pixel)** —
o repositório está **ARQUIVADO** (último push 22/04/2026, arquivado desde então).
Adotar projeto arquivado é assumir dívida no dia 1.

---

### R7 — A fila de saída (outbox) do sync: **escreva você, não instale** 🟠 DECISÃO

Esta é a recomendação mais importante do documento, e ela é **para não instalar nada**.

#### O problema real, achado no código

O `cloudSync.ts` faz push **fire-and-forget**. O cabeçalho do arquivo declara a regra:
*"NUNCA lança — offline / deslogado / sem-config = no-op silencioso"* (linhas 10-11).
E o `BarraOffline.tsx:12-18` confirma que **não existe fila**: *"NÃO lê filas internas
do cloudSync.ts (… ele não expõe fila/contador de push hoje)"*.

Confirmei que a única reconciliação completa é `syncOnLogin()`, e o único chamador é
`App.tsx:303`, na mudança de estado de autenticação.

**Consequência:** o técnico edita uma OS no subsolo sem sinal → o push falha em
silêncio → **nada reenfileira**. O dado só sobe quando o app reabrir com sessão. Se
ele deixar o app aberto o dia todo (que é o comportamento normal em campo), o dado
fica só no aparelho.

**E a copy promete outra coisa.** Em `src/components/web/LandingSecoes.tsx:496`:
*"sincroniza quando a rede volta"*; em `:556`: *"Quando a internet volta, tudo
sincroniza automaticamente com a nuvem"*. Isso é verdade **se o app for reaberto**.
A memória deste projeto tem uma entrada chamada *"Copy tem que ser derivada da
fonte"* — este é o mesmo padrão, e é o tipo de coisa que o primeiro pagante descobre
antes de você.

> **Isto é um achado de produto, não uma proposta de biblioteca.** Registro aqui
> porque é o **único** problema que faria alguém considerar trocar de engine de
> sync — e a conclusão é que trocar de engine é a resposta errada.

#### A opção de biblioteca, avaliada honestamente

`@tanstack/react-query` (**MIT**, [TanStack/query](https://github.com/TanStack/query),
push em 20/07/2026, 50 mil estrelas, mantido por Tanner Linsley + equipe) tem
**mutação offline nativa**: mutação que falha por rede fica *paused* e é retomada
**na mesma ordem** quando reconecta. O painel já usa (`webapp/package.json:32`).

**Por que eu ainda não recomendo colocá-la no app para isso:** para as mutações
sobreviverem a um **fechamento do app** — que é o caso que importa — a documentação
exige três peças: `setMutationDefaults()` para cada tipo de mutação (funções não
serializam), o plugin `persistQueryClient`, e uma chamada de `resumePausedMutations()`
depois da hidratação ([docs TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)).

Ou seja: você precisaria registrar defaults para **as 14 `SyncTable`s** e mais os
tombstones, introduzir um segundo estado persistido ao lado do SQLite que já é a
fonte da verdade, e conviver com duas noções de "pendente". Para um dono sozinho,
isso é uma segunda máquina de estado para manter.

#### O que eu recomendo

Uma tabela `fila_sync` no SQLite que já existe: `(tabela, item_id, operacao,
atualizado_em, tentativas)`. `pushRow`/`removeRow` gravam nela **antes** de tentar a
rede; sucesso apaga a linha; o flush roda quando o `expo-network` (R5) disser que a
rede voltou e no `AppState` voltando a `active`. É a **mesma** semântica LWW/tombstone
que o arquivo já implementa — só passa a ser durável.

- **Esforço: M** (estimo 150-250 linhas, dentro de um arquivo que já tem 2.255 e cujo
  autor entendeu o problema).
- **Dependência nova: zero.** Bundle: zero.
- **O que quebra sem rede:** nada — é justamente o caso que passa a funcionar.
- **Bônus:** a `BarraOffline` para de estimar pendências por contador em memória e
  passa a ler o número verdadeiro (`SELECT count(*) FROM fila_sync`).

**A régua:** trocar `cloudSync.ts` por uma engine de terceiro é reescrever 2.255
linhas de regra de negócio testada (partição por tenant, contexto de equipe,
tombstone, guarda de conflito) para resolver um buraco que cabe em 200 linhas. Não
compensa. A seção 5 mostra o preço de cada alternativa.

---

## 4. Aprender sem copiar: modelagem de field service em código aberto

🔴 **AVISO JURÍDICO EM LETRAS GRANDES: TUDO NESTA SEÇÃO É GPL OU AGPL.**
🔴 **LER PARA APRENDER A MODELAGEM É LIVRE. COPIAR QUALQUER TRECHO DE CÓDIGO PARA DENTRO DO OLLI OBRIGA A ABRIR O OLLI INTEIRO.**
🔴 **AGPL vale mesmo sem distribuir binário: basta o usuário interagir pela rede — ou seja, um SaaS não escapa.**

| Projeto | Licença | Último push | Estrelas | Por que vale ler |
|---|---|---|---|---|
| [OCA/field-service](https://github.com/OCA/field-service) | 🔴 **AGPL-3.0** | 20/07/2026 | 190 | **A melhor referência de modelagem da lista.** Módulos de field service da Odoo Community Association, alvo Odoo 19. Separa conceitos que o OLLI hoje mistura ou ainda não tem: `fieldservice` (location × worker × order), `fieldservice_activity` (ações/tarefas **dentro** da ordem), `fieldservice_recurring` (ordem recorrente — parente do PMOC do OLLI), `fieldservice_agreement` (contrato de serviço), `fieldservice_equipment_warranty` (garantia por equipamento), `base_territory` (território geográfico). O OLLI já tem `equipamentos`/`assets`, `ordens_servico` e `pmoc_planos`; o que **não** tem é *activity* dentro da ordem e *território*. |
| [viniciusvams/LivreOS](https://github.com/viniciusvams/LivreOS) | 🔴 **AGPL-3.0** | 09/05/2026 | 17 | ERP/OS **brasileiro**, Laravel, explicitamente para MEI e pequena empresa. Projeto pequeno (17 estrelas, um mantenedor), então **não** é referência de engenharia — mas é referência de *quais campos o brasileiro preenche de fato* numa OS. |
| [frappe/erpnext](https://github.com/frappe/erpnext) | 🔴 **GPL-3.0** | 20/07/2026 | 37,1 mil | Modelagem madura de ciclo comercial completo (cotação → pedido → entrega → fatura). Útil para entender onde o "orçamento aprovado" vira compromisso contábil. |
| [Dolibarr/dolibarr](https://github.com/Dolibarr/dolibarr) | 🔴 **GPL-3.0** | 21/07/2026 | 7,4 mil | Tem módulo de *interventions* (visita técnica) simples e antigo — boa referência de "quanto é o mínimo". |
| [grokability/snipe-it](https://github.com/grokability/snipe-it) | 🔴 **AGPL-3.0** | 20/07/2026 | 14,1 mil | Gestão de ativos com QR/etiqueta e histórico por ativo. O OLLI já faz etiqueta QR (`etiquetaQrPdf.ts`, `worker/src/pmoc.js`); vale ver como eles modelam **checkout/checkin** e histórico de custódia. |
| [fleetbase/fleetbase](https://github.com/fleetbase/fleetbase) | 🔴 **AGPL-3.0** | 17/07/2026 | 2,1 mil | Roteirização/ordem de serviço em campo. Relevante para o ETA/rota que o OLLI já tem. |

**Como usar isto sem risco:** leia a **documentação e o esquema de banco**, não o
código-fonte. Anote conceitos ("ordem recorrente é uma entidade separada do plano",
"território é dimensão de primeira classe"), feche a aba, e escreva do zero. Se você
copiar um arquivo, o OLLI vira AGPL.

---

## 5. O QUE **NÃO** FAZER (com o número que fecha a discussão)

### 🔴 NÃO troque a camada de sync. Nenhuma das quatro alternativas passa no teste.

O `cloudSync.ts` tem 2.255 linhas e o `database.ts` tem 2.960. Elas carregam partição
por usuário (`particao.ts` existe por causa de um bug real de vazamento entre
tenants), contexto de equipe, tombstones, guarda de conflito por `atualizado_em` e
uma otimização de N+1 já documentada no código. Trocar isso é a operação mais
arriscada que existe num app que **já está em produção** — e a recompensa seria
resolver um buraco de 200 linhas (R7).

**Diga isto em voz alta antes de qualquer benefício:** se a migração der errado, o
sintoma não é "o app está lento". É **dado de cliente sumindo ou vazando entre
contas**. Não há rollback bonito depois que aparelhos já rodaram o schema novo.

| Candidato | Licença | Vivo? | Por que NÃO |
|---|---|---|---|
| [**WatermelonDB**](https://github.com/Nozbe/WatermelonDB) | MIT | **NÃO na prática** | Último commit **11/08/2025** (um merge de docs). Última versão estável `0.28.0` em **07/04/2025**; a pré-release `0.28.1-0` é de **24/07/2025**. Ou seja: **~11 meses sem commit**. Historicamente 129 contribuidores, mas na prática **um mantenedor** (Radek Pietruszewski / Nozbe). E o ponto que fecha: a última publicação é **anterior ao React Native 0.82** (08/10/2025), a primeira versão que roda **só** na New Architecture — o OLLI está no **RN 0.85.3**. Ninguém no repositório testou essa combinação. Adotar biblioteca de banco dormente num app de produção é escolher a dívida. |
| [**PowerSync**](https://github.com/powersync-ja/powersync-js) | SDK cliente Apache-2.0/MIT; **serviço sob FSL** (não é open source) | Sim (push 20/07/2026), mas só **691 estrelas** | O plano **Free** dá 2 GB sincronizados/mês, 500 MB hospedados, 50 conexões simultâneas — **e desativa o projeto após uma semana sem atividade** ([powersync.com/pricing](https://www.powersync.com/pricing), 21/07/2026). Um produto com zero usuários fica inativo o tempo todo: você acorda com o sync desligado. O degrau seguinte é **US$ 49/mês ≈ R$ 250/mês** — mais do que o OLLI fatura hoje (R$ 0). |
| [**RxDB**](https://github.com/pubkey/rxdb) | Core Apache-2.0 | Sim, muito (push 20/07/2026, 23,3 mil ⭐) | **O storage de SQLite/React Native é PAGO.** Fica no tier Pro, **US$ 99/mês ≈ R$ 506/mês**, cobrado anualmente ([rxdb.info/premium](https://rxdb.info/premium/), 21/07/2026). O core Apache-2.0 sozinho não te dá o que o OLLI precisa. Para um dono sozinho sem receita: fora de questão. |
| [**ElectricSQL**](https://github.com/electric-sql/electric) | Apache-2.0 | Sim, muito (push 20/07/2026, 10,3 mil ⭐) | Licença ótima, projeto sério — e **resolve metade do problema**. A própria documentação se define como *"a read-path sync engine for Postgres"* ([electric.ax/docs/intro](https://electric.ax/docs/intro)). O caminho de **escrita** continua sendo seu. O OLLI tem o pull funcionando (`pullAll`); o buraco é o **push** offline. Trocaria a metade que funciona e manteria a metade quebrada, além de exigir um serviço de sync rodando ao lado do Postgres. |

**Se um dia o OLLI tiver 500 prestadores pagantes e o sync virar o gargalo**,
reabra esta tabela — o ElectricSQL + TanStack DB (MIT, `@tanstack/db` 0.6.16, push
20/07/2026, com persistência SQLite anunciada para Expo/React Native) é o caminho a
reavaliar primeiro, por causa da licença Apache-2.0 e da compatibilidade com a stack.
**Hoje, com zero pagantes, é engenharia sem cliente.**

---

### 🔴 NÃO troque o motor de PDF. O atual está certo.

O caminho HTML → `expo-print` (nativo) / `iframe.print()` (web), com o **mesmo**
gerador reusado pelo painel, é bom por três razões que nenhuma biblioteca de PDF
entrega junto: (a) funciona **offline**, no meio da rua; (b) é **um só layout** para
celular e computador — `webapp/src/olli/pdf/imprimirContrato.ts` documenta a cadeia
de imports conferida arquivo a arquivo para isso ser verdade; (c) já resolve QR
inline por causa de uma diferença real entre o motor de impressão do iOS e o do
Android (`src/utils/qrcode.ts`), conhecimento que se perde numa migração.

| Alternativa | Licença | Veredito |
|---|---|---|
| [**pdf-lib**](https://github.com/Hopding/pdf-lib) | MIT | 🔴 **Último push 17/07/2024 — dois anos.** 317 issues abertas. Roda no Worker e no RN, mas é projeto parado. Não adote. |
| [**@react-pdf/renderer**](https://github.com/diegomura/react-pdf) | MIT | Vivo (push 10/07/2026, 16,7 mil ⭐). Mas é **outro** modelo de layout (componentes próprios, não HTML/CSS): você reescreveria orçamento, contrato, recibo, PMOC, etiqueta e certificado ANVISA do zero, e passaria a manter **dois** layouts durante a migração. Esforço **G** para benefício ~zero. |
| **Cloudflare Browser Rendering** | Serviço, não OSS | Só se um dia o **worker** precisar produzir PDF sozinho (ex.: anexar PDF num e-mail sem passar pelo celular). Custa **US$ 5/mês** do plano Workers Paid + **US$ 0,09/hora-navegador** com 10 h/mês incluídas ([changelog Cloudflare, 28/07/2025](https://developers.cloudflare.com/changelog/post/2025-07-28-br-pricing/)). A 500 ms por PDF, 10 h grátis ≈ 72 mil PDFs/mês. Registre como opção futura, **não** como troca do que existe. |

---

### 🔴 NÃO adote sistema de design novo no app (NativeWind / Tamagui / react-native-reusables)

[react-native-reusables](https://github.com/founded-labs/react-native-reusables) (MIT,
8,5 mil ⭐, push 02/07/2026) é bom e é literalmente "shadcn para React Native" — o
painel já usa shadcn, então a tentação de unificar é real.

**Mas:** o app tem **41 componentes próprios** em `src/components` e **41 telas** em
`src/screens`, com um sistema de tema próprio (`src/theme`) que tem **prova
automatizada de contraste** (`scripts/checar-contraste.mjs` mede 2 modos × 4
superfícies × 6 tokens + gradientes). Migrar para NativeWind significa **jogar fora
esse gate**, porque ele lê os tokens do tema atual. Você trocaria uma garantia
medida por uma promessa. Esforço **G**, benefício para o prestador: **nenhum**.

Mesma resposta para [Tamagui](https://github.com/tamagui/tamagui) (MIT, ativo) e
[NativeWind](https://github.com/nativewind/nativewind) (MIT, ativo): boas
bibliotecas, momento errado.

---

### 🔴 NÃO reescreva o roteador do Worker (Hono e afins)

`worker/src/index.js` roteia com `url.pathname.startsWith(...)` em ~1.016 linhas, e
funciona em produção. Trocar por um framework é churn puro: **zero** benefício para
o prestador, e cada `wrangler deploy` tem custo real documentado na memória do
projeto (a mudança de chave de idempotência cobra 1 crédito extra).

---

### 🔴 NÃO auto-hospede geocodificação (Nominatim / OSRM / Valhalla)

O worker usa Geocoding API + Routes API, e **o próprio código já documenta o SKU**
(`worker/src/etaSaida.js:450-452`: *"TRAFFIC_UNAWARE = Essentials (US$5/1k, 10k
grátis); TRAFFIC_AWARE = Pro (US$10/1k, 5k grátis)"*) — e implementa cache de
geocodificação normalizando acento/caixa/pontuação para não pagar duas vezes pelo
mesmo cliente (`:242-244`). Isso está **certo**.

Números confirmados na fonte primária ([lista de preços Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing), 21/07/2026):

| SKU | Grátis/mês | Preço | Em R$ (a R$ 5,11) |
|---|---|---|---|
| Geocoding (Essentials) | 10.000 | US$ 5,00/mil | **R$ 0,026 por chamada** |
| Compute Routes Essentials | 10.000 | US$ 5,00/mil | **R$ 0,026 por chamada** |
| Compute Routes Pro (com trânsito) | 5.000 | US$ 10,00/mil | **R$ 0,051 por chamada** |

[Nominatim é GPLv2/GPLv3](https://operations.osmfoundation.org/policies/nominatim/)
(auto-hospedar sem distribuir não dispara a obrigação — mas confirme antes de expor
como serviço). O problema não é jurídico, é operacional: um extrato de OSM do Brasil,
um Postgres dedicado, reimportação periódica e monitoramento. **Isso é uma pessoa de
infraestrutura em tempo parcial.** O dono é uma pessoa só. Com 10.000 geocodificações
grátis por mês e **zero** usuários pagantes, você está gastando R$ 0,00 hoje.
**Proposta morta.** A instância pública do OSM não é alternativa: o teto é
1 requisição por segundo e a política proíbe uso como backend de produto.

---

### 🔴 NÃO adote projeto arquivado

[lost-pixel](https://github.com/lost-pixel/lost-pixel) — MIT, 1,7 mil ⭐, e
**ARQUIVADO** (último push 22/04/2026). Aparece em toda lista de "regressão visual
open source" de 2025. Use o Playwright que você já tem (R6).

---

## 6. Tabela-resumo

| # | O quê | Licença | Vivo em 21/07/2026 | Esforço | Custo/uso | Roda em RN? | Roda no Worker? | Quebra sem rede? |
|---|---|---|---|---|---|---|---|---|
| A1 | Remover `react-native-signature-canvas` (morta) | — | — | **P** | R$ 0 | — | — | Não |
| A2 | `expo-crypto.randomUUID()` no lugar de `react-native-uuid` | MIT | Sim | **P** | R$ 0 | Sim | — | Não |
| R1 | **gitleaks** (segredo no pre-commit + CI) | MIT | v8.30.1 · 21/03/2026 | **P** | R$ 0 | Não (binário) | Não | Não |
| R2 | **Knip** (código/dep morta) | ISC | 6.27.0 · 15/07/2026 | **P**→M | R$ 0 | Não (devDep) | Não | Não |
| R3 | **@axe-core/playwright** (a11y automatizada) | 🟡 MPL-2.0 (devDep, não distribui) | 20/07/2026 | **P/M** | R$ 0 | Via export web | Não | Não |
| R4 | **expo-updates + EAS Update** (OTA) | MIT | 21/07/2026 | **M** | R$ 0 até 1.000 MAU | Sim | Não | Não — cai no bundle embutido |
| R5 | **expo-network** (fim da sonda de 20 s) | MIT | SDK 56 | **P** (+rebuild) | R$ 0 (economiza dado) | Sim | Não | É o detector |
| R6 | Regressão visual com Playwright nativo | Apache-2.0 | v1.61.1 · 23/06/2026 | **M** | R$ 0 | Não | Não | Não |
| R7 | **Outbox no SQLite** — código próprio, zero dependência | — | — | **M** | R$ 0 | Sim | — | **Conserta** o offline |

---

## 7. Ordem sugerida

**Nesta semana (tudo P, tudo R$ 0, nada toca produção):**
1. A1 + A2 — remover as duas dependências mortas.
2. R1 — gitleaks. É o único item da lista cuja ausência pode acabar com o produto.
3. R2 — Knip em modo relatório (ainda **não** como gate).

**Antes do primeiro pagante:**
4. R7 — a fila de saída. É a diferença entre a landing dizer a verdade e não dizer.
5. R3 — axe na landing primeiro (mais fácil), depois painel e app.

**No próximo rebuild do APK (junte os dois no mesmo build):**
6. R4 — expo-updates. Depois dele, você conserta bug de campo sem passar pela loja.
7. R5 — expo-network.

**Quando sobrar folga:**
8. R6 — regressão visual, com o cuidado de ambiente descrito.
9. Achado 3 — medir o APK antes de encostar em `react-native-paper`.

---

## 8. A conclusão que interessa

**Praticamente nada do que o OLLI escreveu à mão deveria ter sido uma biblioteca.**
QR, Pix BR Code, validação de CPF/CNPJ, assinatura com o dedo, geração de documento,
gate de contraste — em todos esses casos a decisão de escrever foi **certa**, porque a
restrição (funcionar offline, no meio da rua, idêntico no iOS e no Android, sem
dependência nativa nova) elimina as bibliotecas antes da comparação.

O código aberto que o OLLI está deixando na mesa **não é biblioteca de produto — é
ferramenta de gate**: varredura de segredo, acessibilidade, código morto. Custam
R$ 0,00, não entram no bundle, não têm risco de licença e não exigem manutenção
constante. São exatamente o tipo de coisa que uma pessoa sozinha consegue manter.

E o item de maior valor da lista inteira — a fila de saída do sync (R7) — **não se
compra**. Escreve-se, em 200 linhas, dentro de um arquivo que já entendeu o problema.
