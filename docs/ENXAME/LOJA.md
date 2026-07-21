# LOJA — a checklist para publicar o OLLI na Google Play

> **Fechada em 2026-07-20.** Este é o documento que você segue do começo ao fim. Foi escrito para ser
> seguido **literalmente, na ordem**: cada passo tem número, e o número não muda de lugar.
>
> **Tudo que está marcado `[PRONTO]` foi medido HOJE por comando**, não lido de um laudo anterior.
> Onde há número aqui, há um comando que você pode rodar para chegar no mesmo número. Onde eu não
> consegui medir, está escrito que não consegui e por quê.
>
> **Como ler as marcas:**
> - **`[PRONTO]`** — está no repositório e foi conferido. Você não faz nada.
> - **`[VOCÊ]`** — conta, senha, cartão, aceite de contrato ou um clique que nenhum agente pode dar.
> - **`[CLAUDE]`** — eu executo quando você autorizar. Mexe em build ou em arquivo de outra frente.
> - **`[DECISÃO]`** — ninguém decide por você; o código já aguenta as duas saídas.
>
> **⚠️ Fontes que NÃO valem mais.** A ficha oficial é `assets/loja/FICHA.md` e as respostas dos
> formulários são `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`. **`docs/STORE_LISTING.md` e
> `docs/LOJAS.md` §2.5/§3.7 estão DESATUALIZADOS** — eles mandam declarar dados de uso como não
> coletados, e o `@sentry/react-native` está no `package.json` desde então. Não preencha a Console
> por eles.
>
> **iPhone é outro documento.** `docs/ENXAME/LOJA_IOS.md`. Não há resumo de iOS aqui de propósito:
> duas versões da mesma lista é como uma delas envelhece sem ninguém notar.

---

## Resumo em uma tela

| | quantos | onde |
| --- | --- | --- |
| **`[PRONTO]`** — no repositório, medido | 9 itens | Parte 1 |
| **`[VOCÊ]`** — conta, decisão, clique | 21 passos (1–8 e 14–26) | Partes 2, 4 e 5 |
| **`[CLAUDE]`** — código e build | 5 passos (9–13) | Parte 3 |
| **Travas antes de gerar o `.aab`** | **1 de política + 1 decisão** | **Parte 0** |

São **26 passos numerados**, do 1 ao 26, na ordem em que se fazem.

**Você não está esperando screenshot, ficha, ícone nem imagem de destaque.** Está esperando: abrir a
conta, decidir duas coisas, e me autorizar a mexer no build.

---

# PARTE 0 — LEIA ANTES DE QUALQUER COISA

São três, e nenhum é capricho. O **0.1** pode fazer o app ser removido **depois** de publicado. O
**0.2** faz você responder **errado** um formulário que a Google trata como declaração formal. O
**0.3** não trava nada — mas muda o que o revisor da Play vai encontrar quando abrir o app.

### 0.1 🔴 `READ_MEDIA_IMAGES` continua no `app.json` — risco de remoção `[CLAUDE]`

Confirmado hoje: `app.json:51`. As permissões declaradas são
`["CAMERA", "READ_MEDIA_IMAGES", "RECORD_AUDIO"]`.

O app **não precisa** dessa permissão, e ela o sujeita à *Photo and Video Permissions policy* — sob
a qual o OLLI **não se qualifica** (não é editor de foto nem rede social; anexar foto a orçamento é
exatamente o caso de "uso pontual" que a política manda resolver com o seletor do sistema).
`expo-image-picker` **não** declara essa permissão por conta própria e já usa o Android Photo Picker
(`PickVisualMedia`), que não exige permissão nenhuma. → **passo 9**.

### 0.2 🟠 `EXPO_PUBLIC_POSTHOG_KEY` muda a resposta do Data Safety `[DECISÃO]`

Se essa chave for configurada no EAS, "Ações no app" passa a **sair do aparelho** e o formulário de
Segurança dos Dados fica errado no mesmo instante, sem aviso nenhum
(`src/services/analyticsRemoto.ts:40,46` — sem a chave é no-op declarado, com aviso no console).
Ou você não configura, ou configura **e já declara**. → **passo 8**, e ele vem **antes** do passo 18.

### 0.3 Não é trava, mas você precisa saber: `EXPO_PUBLIC_DIAGNOSTICO_URL` desliga mais do que a IA

`src/config.ts:47` deriva **`PAGAMENTOS_URL` da mesma variável** (`config.ts:59`). Sem ela ficam
desligados, de uma vez: diagnóstico por IA, assistente Olli, **Stripe Checkout e portal de
assinatura**, exclusão de conta pelo app, preenchimento de endereço por CEP, consulta de CNPJ, ETA
de trânsito e feriados.

**O app não mente sobre isso** — e isso foi conferido linha a linha hoje, não presumido:
`olliIA.ts:157` responde *"Diagnóstico por IA ainda não ligado — mostrando a base de códigos"*, e
`PlanosScreen.tsx:305-307` abre *"Ainda não disponível — o pagamento online ainda não foi
configurado"*. Ele fica **desligado dizendo que está desligado**, que é a regra da casa. Mas um
revisor da Play que abrir a tela de Planos e receber "ainda não disponível" vai reprovar por
funcionalidade quebrada. → **passo 12**.

---

# PARTE 1 — `[PRONTO]` · está no repositório, nada a fazer

| Item | Arquivo | Como sei que está certo (comando que roda hoje) |
| --- | --- | --- |
| Título 28/30 · descrição breve 69/80 · descrição completa 3.085/4.000 · novidades 314/500 | `assets/loja/FICHA.md` | `node assets/loja/medir.js` — rodado hoje, os quatro passam com folga |
| Tabela de provas: cada afirmação da ficha aponta o arquivo do repo que a sustenta | `assets/loja/FICHA.md` | O app tem zero usuários. Uma promessa falsa na ficha vira nota 1 na primeira semana |
| Palavras-chave e análise da concorrência real na Play | `assets/loja/PALAVRAS-CHAVE.md` | `node assets/loja/palavras.js` — 28 de 29 termos cobertos; o ausente é decisão documentada |
| **Imagem de destaque** 1024×500, PNG 24-bit sem alpha, 165,2 KB | `assets/loja/feature-graphic.png` | Medida hoje por parser de PNG próprio: `colorType 2`, 8 bits/canal, sem `tRNS`. Regera com `node assets/loja/gerar.js` |
| **Ícone da ficha** 512×512, PNG 32-bit **com** alpha, 48,1 KB (limite da Google: 1.024 KB) | `assets/loja/icone-512.png` | Medido hoje: `colorType 6` (RGBA). O `assets/icon.png` de origem **não** tem alpha — o script corrige |
| **As 8 screenshots 1080×1920** | `assets/loja/screenshots/01…08-*.png` | Medidas hoje, byte a byte. Detalhe na **Parte 6** |
| Laudo de conformidade das 8, gerado pelo próprio pipeline | `assets/loja/screenshots/conformidade.json` | `faltando: []` e `ok: true` nas oito |
| Respostas do IARC e do formulário de Segurança dos Dados | `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md` | Pronto para transcrever campo a campo |
| Redirect `/privacidade` → `/legal/privacidade/` | `web/astro.config.mjs:66` | Existe no código; falta só confirmar no ar (**passo 14**) |

### Identidade do app — conferida no código hoje

| campo | valor | onde |
| --- | --- | --- |
| package Android | `online.olliorcamentos.app` | `app.json:47` |
| bundle id iOS | `online.olliorcamentos.app` | `app.json:12` |
| versão | `1.1.0` | `app.json:6` |
| versionCode Android | `9` | `app.json:48` |
| buildNumber iOS | `1` | `app.json:13` |
| keystore de upload | `CONFIG CLAUDE/olli-keystore/olli-upload.jks` — **o arquivo existe** | `eas.json` → `build.production.android.credentialsSource: "local"` |
| `credentials.json` | **não existe ainda** e está no `.gitignore:51` | → **passo 11** |

Nada **nesta tabela** é placeholder e não há bump de versão pendente. O único placeholder que resta
no `app.json` é `extra.eas.projectId: "olli-orcamentos"` (`app.json:139`) → **passo 10**.

> **Não suba emulador para refazer screenshot.** O caminho antigo (emulador + adb + APK +
> `assets/loja/montar-screenshots.js`) foi substituído por `node scripts/telas/loja.mjs`, que não
> precisa de aparelho, de APK nem de login. `assets/loja/SCREENSHOTS.md` continua no repositório como
> **histórico** — não siga o passo a passo dele.

---

# PARTE 2 — `[VOCÊ]` · abrir a conta e decidir (antes de tudo)

Nenhum passo desta parte depende de código. O passo 2 muda o **cronograma inteiro** — decida-o antes
de gastar tempo com o resto.

1. [ ] **Abrir e pagar a conta Play Console.** Taxa única, historicamente US$ 25 — confirme o valor em
   BRL na hora. *Precisa do seu cartão.*

2. [ ] **`[DECISÃO]` Conta PESSOAL ou de ORGANIZAÇÃO.** Conta **pessoal** criada depois de
   13/nov/2023 é obrigada a rodar teste fechado com **12 testadores por 14 dias corridos** antes de
   pedir produção. Conta de **organização** (CNPJ verificado) é isenta.
   → Se for pessoal, **junte os 12 e-mails agora**: os 14 dias só começam a contar depois do primeiro
   upload, e a Console mede engajamento real — testador que instala e não abre não conta.

3. [ ] **Definir o e-mail de contato público** da ficha. Ele fica visível na loja para qualquer um.

4. [ ] **Aprovar o visual**: abra `assets/loja/feature-graphic.png` e `assets/loja/icone-512.png`.

5. [ ] **`[DECISÃO]` Escolher o título**: `OLLI: Orçamento, OS e Recibo` (recomendado, 28/30) ou
   `OLLI Orçamentos` (conservador, 15/30). O porquê está em `assets/loja/FICHA.md` §1. As duas passam
   na política — dá para decidir depois por experimento A/B da própria Console, com número em vez de
   opinião.

6. [ ] **`[DECISÃO]` `Ramalho Climatização` nas screenshots.** As 8 imagens mostram o nome do seu
   negócio real e o e-mail `contato@ramalhoclima.com.br` (`scripts/telas/elenco.mjs:70-79`). É
   consentido por definição, mas publicar na Play amarra o nome do seu negócio ao produto **para
   sempre** — screenshot publicado não se despublica. Se preferir um nome inventado: é **uma linha**
   no elenco e uma recaptura de ~10 minutos. **Decida agora, não depois de publicar.**

7. [ ] **Login no EAS** (`eas whoami`) — *sua credencial, você digita.*

8. [ ] **`[DECISÃO]` PostHog** (ver **0.2**). Decida **antes** do passo 18, não depois.

---

# PARTE 3 — `[CLAUDE]` · código e build, quando você autorizar

Em ordem. O passo 9 é bloqueio de política, não capricho (ver **0.1**).

9. [ ] Remover `READ_MEDIA_IMAGES` do `app.json:51` e testar anexo de foto em Android 13+.

10. [ ] `eas init` — trocar o placeholder `extra.eas.projectId: "olli-orcamentos"` (`app.json:139`)
    pelo UUID real.

11. [ ] `credentials.json` local apontando para a keystore.
    ⚠️ **`[VOCÊ]` no meio deste passo:** a senha da keystore está no cofre e **eu não digito senha em
    formulário nenhum**. Você cola a senha; eu monto o resto do arquivo. O `.gitignore:51` já cobre
    `credentials.json` — ele não vai para o git.

12. [ ] `eas env:create` no ambiente *production*: `EXPO_PUBLIC_DIAGNOSTICO_URL` e
    `EXPO_PUBLIC_WHATSAPP_SUPORTE`. Aponte a primeira para o worker que está no ar
    (`diagnostico.olliorcamentos.online`). Sem ela, ver o alcance real em **0.3**.
    ⚠️ **Mudou nesta leva:** com as migrations aplicadas em produção, a **cota de IA passou a valer
    de verdade**. Antes ela era ilimitada por *fail-open*; agora cada diagnóstico consome crédito de
    quem pediu. Não bloqueia a publicação — mas se você testar muito na conta demo, o consumo é real.

13. [ ] `eas build -p android --profile production` → `.aab` assinado (build na nuvem, não precisa
    Android Studio). O perfil `production` já sai como `app-bundle` (`eas.json`).
    ⚠️ Sua regra: só depois do ciclo comercial estar de pé.

---

# PARTE 4 — `[VOCÊ]` · preencher a Console (eu passo o texto, você clica)

14. [ ] **Confirmar no navegador** que `https://olliorcamentos.online/legal/privacidade/` abre. A
    Console valida que a URL resolve; daqui só consigo ver 403 de antibot, então essa confirmação é
    sua.
15. [ ] Criar o app: nome, idioma padrão **pt-BR**, tipo *App*, **gratuito**.
16. [ ] Colar a ficha de `assets/loja/FICHA.md`.
17. [ ] Subir **ícone**, **imagem de destaque** e **as 8 screenshots** de `assets/loja/`.
18. [ ] **Segurança dos dados** — Parte 2 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`.
    **Não** use `docs/LOJAS.md` §2.5. Se você decidiu ligar o PostHog no passo 8, a resposta muda.
19. [ ] **Classificação de conteúdo (IARC)** — Parte 3 do mesmo documento. Responda **Sim** para IA
    generativa e descreva o botão de sinalizar, que já existe no app.
20. [ ] **Acesso ao app** — fornecer ao revisor uma conta de teste que funcione. A conta demo já
    existe (`demo@grtech.com.br`, plano Empresa ativo, dados completos). **A senha fica no cofre e
    não entra neste arquivo nem em nenhum outro do repositório** — você a cola direto no campo da
    Console. Esquecer este passo é reprovação garantida: o revisor trava no login e reprova sem
    testar nada.
21. [ ] **Público-alvo**: só faixas **18+** (evita a política Famílias, que é bem mais exigente).
22. [ ] **Anúncios**: "não contém anúncios".
23. [ ] Aceitar os termos do programa para desenvolvedores — *aceite de contrato, só você.*

---

# PARTE 5 — `[VOCÊ]` · publicar

24. [ ] Se conta pessoal: teste fechado → 12 testadores → esperar os 14 dias com uso real.
25. [ ] Subir o `.aab` em teste interno e **conferir no aparelho**: a assistente Olli responde e a
    tela de Planos abre o checkout. Se qualquer um dos dois disser "ainda não disponível", o passo 12
    foi pulado.
26. [ ] **Clique final de publicar.** *Só você.*

---

# PARTE 6 — as 8 screenshots, medidas hoje

Regerar: **`node scripts/telas/loja.mjs`** (usa o export web já em `.expo/telas-build`; `--exportar`
refaz o export antes).
Reconferir sem regerar: **`node scripts/telas/medir-ocupacao.mjs`**.
Conferir o portão de privacidade: **`node scripts/telas/gate-privacidade.mjs --conferir`**.

## 6.1 A regra da Google, lida na fonte hoje (20/07/2026)

Fonte: **[Add preview assets to showcase your app — Play Console Help](https://support.google.com/googleplay/android-developer/answer/9866151)**,
lida hoje em inglês **e** em pt-BR (as duas versões dizem o mesmo). É a mesma URL citada em
`scripts/telas/moldura-loja.mjs:12` e gravada em `conformidade.json` → `regrasEm`.

| regra oficial | exigido | o nosso | veredito |
| --- | --- | --- | --- |
| formato da screenshot | "JPEG or 24-bit PNG (no alpha)" | PNG `colorType 2`, 8 bits/canal = 24-bit, sem `tRNS` | **passa** |
| lado mínimo | 320 px | 1080 px | **passa** |
| lado máximo | 3840 px | 1920 px | **passa** |
| maior lado ≤ 2× o menor | 1920 ≤ 2160 | razão medida 1,7778 | **passa** |
| proporção p/ destaque | 16:9 ou 9:16 | 1080/1920 = 0,5625 = **9:16 exato** | **passa** |
| quantidade mínima | "a minimum of two screenshots" | 8 | **passa** |
| quantidade máxima | "up to 8 screenshots for each supported device type" | 8 (no teto) | **passa** |
| superfícies de recomendação | "at least four screenshots with minimum 1080px" | 8 com 1920 px | **passa** |
| **ícone** | "32-bit PNG (with alpha)", 512×512, máx. 1.024 KB | 512×512 RGBA, 48,1 KB | **passa** |
| **imagem de destaque** | "JPEG or 24-bit PNG (no alpha)", 1024×500 | 1024×500 RGB 24-bit, 165,2 KB | **passa** |

Duas coisas que apurei e que mudam o que a gente pensava saber:

- **Não existe limite de peso por screenshot nessa página.** O "8 MB" que circula é da seção de
  **Android XR**, não de telefone. O `REGRAS.bytesMax = 8 MB` em `moldura-loja.mjs:66` é folga
  interna nossa, não citação da Google. O maior arquivo mede 551,8 KB.
- **Capturas de tablet são recomendadas, não obrigatórias.** A página diz: "For Chromebook and
  tablets, you can add a minimum of 4 screenshots… between 1,080 and 7,680px". O mínimo de 2 já está
  satisfeito pelo telefone. Ver Parte 7.

## 6.2 Formato — os 8 passam, medidos byte a byte

Medido com um parser de PNG escrito para esta conferência, **sem `sharp`** — para não confiar na
mesma biblioteca que gerou o laudo do próprio pipeline. Lê `IHDR` e percorre os chunks.

| arquivo | dim. | colorType | bits | alpha | tRNS | interlace | bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01-novo-orcamento-itens.png | 1080×1920 | 2 (truecolor RGB) | 8×3 = 24 | não | não | 0 | 527.346 |
| 02-orcamento-aprovado.png | 1080×1920 | 2 | 24 | não | não | 0 | 565.075 |
| 03-lista-orcamentos.png | 1080×1920 | 2 | 24 | não | não | 0 | 510.988 |
| 04-ordem-servico.png | 1080×1920 | 2 | 24 | não | não | 0 | 507.966 |
| 05-agenda.png | 1080×1920 | 2 | 24 | não | não | 0 | 552.368 |
| 06-codigos-erro.png | 1080×1920 | 2 | 24 | não | não | 0 | 544.876 |
| 07-diagnostico-ia.png | 1080×1920 | 2 | 24 | não | não | 0 | 442.214 |
| 08-clientes.png | 1080×1920 | 2 | 24 | não | não | 0 | 492.659 |

**Total 4.143.492 bytes (3,95 MB) · maior arquivo 551,8 KB · proporção 0,5625 nas oito.**

Os únicos chunks presentes são `IHDR`, `pHYs`, `IDAT` e `IEND`. **Nenhum `eXIf`, `tEXt`, `iTXt` ou
`iCCP`** — ou seja, nenhum caminho de máquina, nome de usuário ou nome de software vaza junto com a
imagem. Não estava sendo cobrado por ninguém; é um ponto a favor e agora está medido.

## 6.3 Conteúdo — a régua que a Google não tem

Formato e conteúdo são portões diferentes. Uma tela oca não é recusada pela loja; é recusada pelo
prestador que desliza a vitrine e vê "app sem nada dentro". `04-ordem-servico` já passou em **todas**
as regras da Play com dois terços da altura em fundo chapado.

O medidor responde a **duas** perguntas, e a segunda existe porque a primeira tinha um ponto cego
demonstrado: *rodapé vazio* só enxerga o vazio que chega até a última linha, e **basta um botão
flutuante ou uma barra de abas colada embaixo para o contador zerar**.

**Laudo do pipeline** (`conformidade.json`, medido na **captura crua**, 1179×2556 — a resolução mais
alta, e é este o número que vale):

| tela | ocupação | rodapé vazio | maior faixa vazia |
| --- | --- | --- | --- |
| 01-novo-orcamento-itens | 82,0% | 0,9% | 4,1% |
| 02-orcamento-aprovado | 95,9% | 0,0% | 2,0% |
| 03-lista-orcamentos | 87,8% | 7,0% | 7,0% |
| 04-ordem-servico | 88,7% | 2,8% | 2,8% |
| 05-agenda | 82,6% | 1,4% | 4,3% |
| 06-codigos-erro | 86,8% | 0,0% | 3,4% |
| 07-diagnostico-ia | 53,6% | 44,3% | 44,3% *(tolerância declarada: 50%)* |
| 08-clientes | 90,5% | 0,0% | 1,9% |

> ⚠️ **Se você rodar `node scripts/telas/medir-ocupacao.mjs`, os números vão ser outros — e está
> certo.** Aquele comando mede o arquivo **já emoldurado**, recortado de volta (698×1517); o laudo
> acima mede a captura crua em 1179×2556. Reduzir borra texto miúdo, então a coluna `ocupação` sai
> bem mais baixa por lá (04-ordem-servico: 88,7% no laudo, 42,1% pelo comando). **O veredito é o
> mesmo nas duas medições: nenhuma das oito é oca.** O próprio comando imprime esse aviso no rodapé
> desde esta leva, para ninguém achar que a imagem mudou.

## 6.4 O que foi consertado até aqui — e confirmado hoje, olhando a imagem

Todo conserto foi de **dado de semeadura**, nunca de imagem: nenhuma screenshot foi retocada, todas
saem do app rodando de verdade.

- **`04-ordem-servico` tinha 67% da altura vazia.** Era **uma** OS numa tela inteira. Hoje a imagem
  mostra **6 ordens de serviço** — OS-0001 a OS-0006 — cobrindo os cinco estados que os filtros do
  topo já ofereciam e que apareciam todos zerados: Aberta, Em execução, Agendada, Pausada e
  Concluída, cada uma com o chip de checklist (0/5, 3/5, 0/4, 2/3, 0/4, 5/5). A primeira da lista é a
  OS nascida do orçamento 00126, que é literalmente a promessa da legenda. **Medido hoje: 2,8% de
  rodapé vazio** — e a versão que continua no ar na landing ainda mede **67,4%** (ver o fim deste
  documento).
- **`08-clientes` mostrava o mesmo cliente DUAS vezes.** "Clínica Vida & Saúde" aparecia duplicada,
  mesmo telefone e tudo — a semeadura cadastrava o cliente do orçamento-herói e o cadastrava de novo
  ao criar o 3º orçamento extra. A vitrine mostrava o produto **criando a bagunça que ele promete
  arrumar**. Conferido hoje na imagem: **6 clientes distintos**, cabeçalho "6 cadastrados", nenhum
  nome repetido.
- **O relógio congelado caía num SÁBADO.** O elenco jurava "sexta-feira, 18/07/2026", e 18/07/2026 é
  sábado: a agenda publicava "Sábado, 18 de julho" e os orçamentos saíam datados de fim de semana.
  Agora `AGORA = 2026-07-15T13:35:00.000Z`, **conferido por comando**: `quarta-feira, 15 de julho de
  2026 às 10:35`. A imagem imprime "Quarta-feira, 15 de julho"; a lista de orçamentos, "15/07/2026".
- **As duas visitas do dia estavam ambas às 09:00.** Para quem vive de encaixar visita, isso lê como
  conflito — e o próprio app concorda, tem detector de sobreposição. Hoje a imagem mostra **quatro
  visitas em 08:00, 10:30, 14:00 e 16:30**, e a agenda se espalha por quatro dias da semana
  (`dias: -1, 0, +1, +2`), para a tela de computador não sair com seis colunas vazias.
- **Os cartões da agenda não tinham endereço** — o campo existia e ninguém preenchia, enquanto a
  legenda prometia endereço. Hoje cada visita mostra o endereço e o botão de traçar rota, que é
  feature real. A legenda foi trocada para "O dia inteiro, com hora e endereço", que é o que a imagem
  entrega.
- **`02-orcamento-aprovado` publicava "2/5 sinais de confiança configurados"** com três fichas âmbar
  de alerta, no maior bloco da SEGUNDA imagem — a que a Play mostra na busca. O produto usava o
  espaço mais caro da listagem para avisar que a proposta estava incompleta. Agora são **4/5**.

**Determinismo:** duas rodadas seguidas produzem os 8 arquivos com **md5 idêntico** — verificado pela
leva de 19/07, **não re-medido nesta leva**. Reproduzir custa duas rodadas completas do pipeline e
reescreve a pasta; como os arquivos em disco estão conformes e commitados, não valia o risco de
mexer neles só para reconfirmar. Está escrito aqui com a data para ninguém tratar como medição de
hoje. As causas conhecidas de variação continuam fechadas: relógio ancorado (`navegador.mjs`), ano do
número do documento vindo do relógio congelado, `blur` + `scrollTop = 0` antes de fotografar.

## 6.5 Os portões que impedem a próxima regressão

Não é documentação: são comandos que saem com código **1** e param a leva.

| portão | onde | o que ele impede |
| --- | --- | --- |
| **Privacidade** | `scripts/telas/gate-privacidade.mjs` | CPF, CNPJ, CEP, e-mail ou telefone fora do elenco aparecer numa imagem. **Lê nó de texto E valor de `<input>`/`<textarea>`/`<select>`** — era cego para campo de formulário, que é justamente onde o pipeline digita de propósito (o "E4" da busca e os quatro campos do diagnóstico). Rode `--conferir` para ver o portão sendo testado contra um dado plantado |
| **Bundle sem credencial** | `scripts/telas/guarda-bundle.mjs` | O browser de captura ter credencial de produção na mão. Roda nos dois pipelines. É defesa arquitetural, não regex: sem credencial no bundle, não existe dado real ao alcance |
| **Vazio** | `scripts/telas/medir-ocupacao.mjs` | Tela oca voltar para a vitrine. Duas medidas (rodapé e maior faixa contínua), limite de 20%, uma tolerância declarada e justificada |
| **Formato** | `scripts/telas/moldura-loja.mjs` → `conferirConformidade` | Arquivo com alpha, fora de 9:16 ou fora dos limites de lado chegar à Console |
| **Leva incompleta** | `scripts/telas/loja.mjs` e `capturar-telas.mjs` | Uma rodada que falha no meio **apagar a leva boa**. Nenhum dos dois toca a pasta antes de todos os portões passarem: as imagens ficam em memória e a pasta só é trocada no fim |

---

# PARTE 7 — decisões abertas (não são defeitos)

- **`07-diagnostico-ia` tem 44,3% de tela vazia e fica assim.** É a única das oito com exceção
  declarada, e ela reprovaria no limite geral de 20%. É um formulário: abaixo de "Pedir diagnóstico"
  fica o espaço da RESPOSTA, e a resposta vem do worker de IA, que o build de captura (offline de
  propósito) não alcança. A tolerância está **escrita e justificada** em `scripts/telas/loja.mjs:113-122`,
  não escondida afrouxando o limite geral. Agora que o worker está no ar, dá para fechar isto de
  verdade — mas capturar com o worker de pé **consome crédito de IA**, então é decisão sua.
- **Sem screenshots de tablet.** `app.json:11` traz `supportsTablet: false`, mas essa chave é do
  **iOS**; no Android o app roda em tablet por padrão. **Não é bloqueio** — a Google pede um mínimo
  de 4 por classe de tablet/Chromebook e o mínimo geral de 2 já está satisfeito pelo telefone. O que
  se perde é elegibilidade nas superfícies de tablet e Chromebook. É decisão de negócio.
- **As telas 01 e 02 mostram números de documento diferentes.** Conferido hoje na imagem: a 01 monta
  o **nº 00526** e a 02 aprova o **nº 00126**, que é o que aparece na lista da 03 (4 orçamentos,
  R$ 4.485,00 — 2.480 + 960 + 780 + 265, confere). Não é bug: o rascunho da tela 01 **reserva** um
  número e nunca é gerado, que é o comportamento correto do app. Fica registrado porque quem lê com
  atenção percebe — e quem lê com atenção é quem está decidindo pagar. Consertar exige capturar a
  tela 01 de dentro do orçamento-herói em modo edição, o que é reestruturação do pipeline, não uma
  linha.
- **O valor aprovado (R$ 2.480) continua fora do enquadramento da `02`.** Conferi a imagem hoje: ela
  mostra "Orçamento nº 00126 · Clínica Vida & Saúde", o chip **Aprovado**, a data 15/07/2026 às
  10:35 e os oito atalhos (Duplicar, Link, WhatsApp, Pix, PDF, Recibo, Criar OS, Agendar). A legenda
  promete "Aprovado, com PDF e envio no WhatsApp" e a imagem **entrega exatamente isso** — a copy não
  mente. O que se perde é o argumento mais forte: o número do dinheiro não aparece na segunda imagem
  da vitrine, que é a que a Play mostra na busca. Consertar exige rolar a tela antes de fotografar, e
  `capturar-uma.mjs` força `scrollTop = 0` em tudo de propósito (é o que mata diff entre rodadas).
  Seria uma exceção declarada para uma tela só. **Não é defeito; é uma escolha em aberto.**
- **Print cru de emulador reprova no upload.** `olli_phone` é 1080×2400, o que quebra **duas** regras
  de uma vez: a proporção passa de 9:16 e o maior lado passa do dobro do menor (2400 > 2160). Só
  importa se alguém decidir refazer as screenshots pelo caminho antigo. **Não precisa.**

---

# ⚠️ A landing está MUITO atrás da Play — medido hoje

`web/public/telas/` foi gerado com o elenco **antigo** e **não foi regerado** — `capturar-telas.mjs`
escreve em `web/`, que é de outra frente. Isto não afeta a publicação na Play. Mas está **no ar
agora**, e o buraco é maior do que a nota anterior dizia.

Rodei o mesmo medidor de vazio sobre as imagens que estão no ar (`web/public/telas/*@2x.webp`).
**Seis das oito reprovam** pela régua que as oito da Play passam:

| tela no ar | ocupação | rodapé vazio | maior faixa vazia | |
| --- | --- | --- | --- | --- |
| `ordem-servico@2x` | 29,9% | **67,4%** | **67,4%** | ❌ é a tela oca que a Play já não tem mais |
| `diagnostico-ia@2x` | 53,5% | 44,5% | 44,5% | ❌ mesma exceção da Play, mas na landing não há tolerância declarada |
| `clientes@2x` | 59,4% | 0% | **34,7%** | ❌ mostra **3** clientes; a Play mostra 6 |
| `agenda@2x` | 62,1% | 1,3% | **23,8%** | ❌ **"Sábado, 18 de julho"**, 2 visitas ambas às 09:00, sem endereço |
| `lista-orcamentos@2x` | 73,5% | **21,9%** | 21,9% | ❌ |
| `agenda-computador@2x` | 67,4% | 2,8% | **20,4%** | ❌ |
| `novo-orcamento-itens@2x` | 81,7% | 0,9% | 4,2% | ✅ |
| `orcamento-aprovado@2x` | 95,9% | 0% | 1,9% | ✅ |

**Correção de uma nota anterior:** a landing **não** tem cliente duplicado. Abri a imagem: ela mostra
"Ar Frio Refrigeração", "Clínica Vida & Saúde" e "Padaria Pão Quente", três nomes distintos,
"3 cadastrados" no cabeçalho. Ela foi gerada **depois** do conserto do duplicado e **antes** de
`CLIENTES_EXTRA` existir. O defeito no ar é o vazio, não a duplicata.

**O que continua verdade e é copy falsa publicada:** a legenda da agenda no ar diz, literalmente,
*"As visitas do dia com cliente, horário **e endereço**"* (`web/public/telas/telas.json`) — e o
cartão na imagem no ar **não tem endereço**. Conferido abrindo os dois arquivos, não de memória.

Detalhe que importa para quem for consertar: **o texto-fonte já está certo, a imagem é que está
velha.** `roteiro.mjs:68-71` já traz a legenda e um `alt` que descrevem quatro visitas com horário,
cliente, tipo e endereço. Uma recaptura alinha os dois **sem tocar em uma linha de texto**. Enquanto
ela não acontece, o `alt` no ar continua honesto (ele descreve a imagem velha) e só a legenda mente.

**Quem for recapturar a landing:** `node scripts/telas/capturar-telas.mjs`. Resolva na mesma rodada o
resto de `REVISAO_TELAS.md` §B — o cartão de computador é ilegível a 440 px e faltam os degraus de
496w/880w no `srcset` (−77 KB no celular DPR 2). **Não recapture três vezes.**

---

## Quando o formulário de Segurança dos Dados precisa ser REFEITO

Ver a Parte 5 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`. Gatilhos: chave do PostHog,
`expo-location`, upload de fotos para a nuvem, `expo-contacts`, Google Agenda ligado, Sentry
desligado ou trocado, ou qualquer SDK de terceiro novo no `package.json`.
