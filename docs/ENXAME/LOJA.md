# LOJA — o que está pronto e o que depende de você

> **Fechado em 2026-07-19.** Este é o documento que você segue do começo ao fim para publicar o OLLI
> na Google Play. Ele foi escrito para ser seguido **literalmente**: se um item diz "pronto", o
> arquivo existe no repositório e foi medido; se diz "só você", é porque exige conta, senha, cartão
> ou um clique que nenhum agente pode dar no seu lugar.
>
> **Como ler as marcas:**
> - **`[PRONTO]`** — já está no repositório. Nada a fazer.
> - **`[VOCÊ]`** — só você. Conta, senha, pagamento, aceite de termos ou o clique de publicar.
> - **`[CLAUDE]`** — eu executo quando você autorizar. Não fiz ainda porque mexe em build ou em
>   arquivo de outra frente.
>
> **Fontes que valem, e as que não valem mais.** A ficha oficial é `assets/loja/FICHA.md` e as
> respostas dos formulários são `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`.
> ⚠️ **`docs/STORE_LISTING.md` e `docs/LOJAS.md` §2.5/§3.7 estão DESATUALIZADOS** — eles mandam
> declarar dados de uso como não coletados, e o Sentry está ligado desde então. Não preencha a
> Console por eles.

---

## Identidade do app (confirmada no código, 19/07)

| campo | valor | onde |
| --- | --- | --- |
| bundle id (Android e iOS) | `online.olliorcamentos.app` | `app.json:12,25` |
| versão | `1.1.0` | `app.json:6` |
| versionCode (Android) | `9` | `app.json:26` |
| buildNumber (iOS) | `1` | `app.json:13` |
| keystore de upload | `CONFIG CLAUDE/olli-keystore/olli-upload.jks` | `eas.json` usa `credentialsSource: local` |

Nada aqui é placeholder e não há bump pendente.

---

# PARTE 1 — `[PRONTO]` · está no repositório, nada a fazer

| Item | Arquivo | Como sei que está certo |
| --- | --- | --- |
| Título (28/30), descrição breve (69/80), descrição completa (3.085/4.000), novidades (314/500) | `assets/loja/FICHA.md` | Contagens **medidas** por `node assets/loja/medir.js`, não escritas à mão. Rodei hoje: os quatro campos passam |
| Tabela de provas — cada afirmação da ficha aponta o arquivo do repo que a sustenta | `assets/loja/FICHA.md` | O app tem zero usuários: uma promessa falsa na ficha vira nota 1 na primeira semana |
| Palavras-chave e análise da concorrência real na Play | `assets/loja/PALAVRAS-CHAVE.md` | 28 de 29 termos cobertos; o ausente é decisão documentada |
| Feature graphic 1024×500, 24-bit sem alpha | `assets/loja/feature-graphic.png` | Gerado da marca real. Regera com `node assets/loja/gerar.js` |
| Ícone da ficha 512×512, 32-bit com alpha | `assets/loja/icone-512.png` | Gerado. O `assets/icon.png` de origem **não** tinha alpha (medido: 3 canais) — o script corrige |
| **As 8 screenshots 1080×1920** | `assets/loja/screenshots/01…08-*.png` | Medidas hoje por um parser de PNG independente. Detalhe na Parte 6 |
| Respostas do IARC e do formulário de Segurança dos Dados | `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md` | Pronto para transcrever campo a campo |
| Redirect `/privacidade` → `/legal/privacidade/` | `web/astro.config.mjs:66` | Existe no código; falta só confirmar no ar (item 14 da Parte 3) |

**Não suba emulador para refazer screenshot.** O caminho antigo (emulador + adb + APK +
`assets/loja/montar-screenshots.js`) foi substituído por `node scripts/telas/loja.mjs`, que não
precisa de aparelho, de APK nem de login. `assets/loja/SCREENSHOTS.md` continua no repositório como
**histórico** — não siga o passo a passo dele.

---

# PARTE 2 — `[VOCÊ]` · abrir a conta e decidir (antes de tudo)

Nenhum item desta parte depende de código. Todos dependem de você, e o item 2 muda o cronograma
inteiro — decida-o antes de gastar tempo com o resto.

1. [ ] **Abrir e pagar a conta Play Console.** Taxa única, historicamente US$ 25 — confirme o valor
   em BRL na hora. *Precisa do seu cartão: não dá para eu fazer.*
2. [ ] **Decidir: conta PESSOAL ou de ORGANIZAÇÃO.** Conta **pessoal** criada depois de 13/nov/2023
   é obrigada a rodar teste fechado com **12 testadores por 14 dias corridos** antes de pedir
   produção. Conta de **organização** (CNPJ verificado) é isenta.
   → Se for pessoal, **junte os 12 e-mails agora**: os 14 dias só começam a contar depois do
   primeiro upload, e a Console mede engajamento real — testador que instala e não abre não conta.
3. [ ] **Definir o e-mail de contato público** da ficha. Ele fica visível na loja para qualquer um.
4. [ ] **Aprovar o visual**: abra `assets/loja/feature-graphic.png` e `assets/loja/icone-512.png`.
5. [ ] **Escolher o título**: `OLLI: Orçamento, OS e Recibo` (recomendado, 28/30) ou
   `OLLI Orçamentos` (conservador, 15/30). O porquê está em `assets/loja/FICHA.md` §1. As duas
   passam na política — dá para decidir depois por experimento A/B da própria Console, com número
   em vez de opinião.
6. [ ] **Login no EAS** (`eas whoami`) — *sua credencial, você digita.*
7. [ ] **Decidir sobre `Ramalho Climatização`.** As 8 screenshots mostram o nome do seu negócio real
   e o e-mail `contato@ramalhoclima.com.br` (`scripts/telas/elenco.mjs`). É consentido por
   definição, mas publicar na Play amarra o nome do seu negócio ao produto **para sempre** —
   screenshot publicado não se despublica. Se preferir um nome inventado: é **uma linha** no elenco
   e uma recaptura de 10 minutos. Decida agora, não depois de publicar.

---

# PARTE 3 — `[CLAUDE]` · código e build, quando você autorizar

Em ordem. O item 8 é bloqueio de política, não capricho — ver Parte 5.

8. [ ] Remover `READ_MEDIA_IMAGES` do `app.json:29` e testar anexo de foto em Android 13+.
9. [ ] `eas init` — trocar o placeholder `extra.eas.projectId: "olli-orcamentos"` (`app.json:110`)
    pelo UUID real.
10. [ ] `credentials.json` local apontando para a keystore.
    ⚠️ **`[VOCÊ]` no meio deste passo:** a senha da keystore está no cofre e **eu não digito senha
    em formulário nenhum**. Você cola a senha; eu monto o resto do arquivo. E `credentials.json`
    **não vai para o git**.
11. [ ] `eas env:create` no ambiente *production*: `EXPO_PUBLIC_DIAGNOSTICO_URL` e
    `EXPO_PUBLIC_WHATSAPP_SUPORTE`.
    **Sem a primeira, a assistente Olli sobe DESLIGADA e não dá erro visível** — o app simplesmente
    não responde. Aponte para o worker que está no ar (`diagnostico.` responde 200 desde o deploy
    de hoje).
    ⚠️ **Mudou hoje:** com as migrations aplicadas em produção, a **cota de IA passou a valer de
    verdade**. Antes desta leva a IA era ilimitada por *fail-open*; agora cada diagnóstico consome
    crédito de quem pediu. Isso não bloqueia a publicação — mas se você testar muito na conta demo,
    o consumo é real.
12. [ ] Decidir sobre `EXPO_PUBLIC_POSTHOG_KEY` (bloqueio 3, na seção BLOQUEIOS) — **antes** de responder o
    formulário de Segurança dos Dados, não depois.
13. [ ] `eas build -p android --profile production` → `.aab` assinado (build na nuvem, não precisa
    Android Studio). ⚠️ Sua regra: só depois do ciclo comercial estar de pé.

---

# PARTE 4 — preencher a Console (eu passo o texto, você clica)

14. [ ] **Confirmar no navegador** que `https://olliorcamentos.online/legal/privacidade/` abre. A
    Console valida que a URL resolve; daqui só consegui ver 403 de antibot, então essa confirmação
    é sua.
15. [ ] Criar o app: nome, idioma padrão **pt-BR**, tipo *App*, **gratuito**.
16. [ ] Colar a ficha de `assets/loja/FICHA.md` e subir ícone, feature graphic e as 8 screenshots.
17. [ ] **Segurança dos dados** — Parte 2 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`.
    **Não** use `docs/LOJAS.md` §2.5.
18. [ ] **Classificação de conteúdo (IARC)** — Parte 3 do mesmo documento. Responda **Sim** para IA
    generativa e descreva o botão de sinalizar, que já existe no app.
19. [ ] **Acesso ao app** — fornecer ao revisor uma conta de teste que funcione.
    A conta demo já existe (`demo@grtech.com.br`, plano Empresa ativo, dados completos). **A senha
    fica no cofre e não entra neste arquivo nem em nenhum outro do repositório** — você a cola
    direto no campo da Console. Esquecer este passo é reprovação garantida: o revisor trava no
    login e reprova sem testar nada.
20. [ ] **Público-alvo**: só faixas **18+** (evita a política Famílias, que é bem mais exigente).
21. [ ] **Anúncios**: "não contém anúncios".
22. [ ] Aceitar os termos do programa para desenvolvedores — *aceite de contrato, só você.*

---

# PARTE 5 — publicar

23. [ ] Se conta pessoal: teste fechado → 12 testadores → esperar os 14 dias com uso real.
24. [ ] Subir o `.aab` em teste interno e **conferir no aparelho que a assistente Olli responde**.
    Se ela estiver muda, o passo 11 foi pulado.
25. [ ] **Clique final de publicar.** *Só você.*

---

# 🚧 BLOQUEIOS — resolver antes de enviar

### 1. `READ_MEDIA_IMAGES` no `app.json` — risco de remoção do app
Confirmado hoje: a permissão continua declarada em `app.json:29`. O app **não precisa dela**, e ela
sujeita o OLLI à *Photo and Video Permissions policy* da Google — sob a qual ele **não se qualifica**
(não é editor de foto nem rede social; anexar foto a orçamento é o caso de "uso pontual" que a
política manda resolver com o seletor do sistema). Provado no código nativo da lib: `expo-image-picker`
**não** declara essa permissão e já usa o Android Photo Picker (`PickVisualMedia`), que não exige
permissão nenhuma. → Passo 8.

### 2. Print cru de emulador REPROVA no upload
`olli_phone` é 1080×2400, o que quebra **duas** regras de uma vez: a proporção passa de 9:16 e o
maior lado passa do dobro do menor (2400 > 2160). Isto só importa se alguém decidir refazer as
screenshots pelo caminho antigo. **Não precisa**: as 8 finais já estão prontas e conformes.

### 3. `EXPO_PUBLIC_POSTHOG_KEY` muda a resposta do Data Safety
Se essa chave for configurada no EAS, "Ações no app" passa a sair do aparelho e o formulário de
Segurança dos Dados fica errado **no mesmo instante, sem aviso nenhum**. Ou você não configura, ou
configura e já declara. (É a mesma armadilha, ao contrário, de `EXPO_PUBLIC_DIAGNOSTICO_URL`: sem
ela a IA sobe desligada em silêncio.)

---

# PARTE 6 — as 8 screenshots, medidas hoje

Regerar: **`node scripts/telas/loja.mjs`** (usa o export web já em `.expo/telas-build`; `--exportar`
refaz o export antes). Reconferir sem regerar: **`node scripts/telas/medir-ocupacao.mjs`**.

## Formato — os 8 passam

Medido **byte a byte no cabeçalho PNG**, com um parser escrito para esta conferência, sem `sharp` —
para não confiar na mesma biblioteca que gerou o laudo do próprio pipeline:

| regra da Google | exigido | o nosso |
| --- | --- | --- |
| formato | JPEG ou PNG 24-bit **sem alpha** | PNG, colorType 2 (truecolor RGB), 8 bits/canal = 24-bit, sem canal alfa e **sem chunk `tRNS`** |
| lado mínimo | ≥ 320 px | 1080 px |
| lado máximo | ≤ 3840 px | 1920 px |
| maior lado ≤ 2× o menor | 1920 ≤ 2160 | passa |
| proporção | 9:16 (retrato) | 0,5625 = 9:16 exato |
| quantidade | de 2 a 8 por tipo de aparelho | 8 (no teto) |
| ≥ 1080 px para as superfícies de recomendação | ≥ 4 capturas | 8 |

Peso total **3,95 MB**, maior arquivo **552 KB**, todas não-entrelaçadas. Só existem os chunks
`IHDR`/`pHYs`/`IDAT`/`IEND` — **nenhum `eXIf`, `tEXt`, `iTXt` ou `iCCP`**, ou seja, nenhum caminho
de máquina, nome de usuário ou nome de software vazando junto com a imagem.

## Conteúdo — a régua que a Google não tem

Formato e conteúdo são portões diferentes. Uma tela oca não é recusada pela loja; é recusada pelo
prestador que desliza a vitrine e vê "app sem nada dentro".

O medidor agora responde a **duas** perguntas, e a segunda existe porque a primeira tinha um ponto
cego demonstrado: *rodapé vazio* só enxerga o vazio que chega até a última linha, e **basta um botão
flutuante ou uma barra de abas colada embaixo para o contador zerar**. Duas telas passaram por esse
buraco:

| tela | rodapé vazio (dizia) | maior faixa vazia (dizia a verdade) | agora |
| --- | --- | --- | --- |
| `05-agenda` | 1,5% ✅ | **25,2%** ❌ escondido pela barra de abas | **4,3%** |
| `08-clientes` | 0,1% ✅ | **25,6%** ❌ escondido pelo botão "+" | **1,9%** |

Estado final das oito (medido na captura crua, antes da moldura):

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

Todo conserto foi de **dado de semeadura**, nunca de imagem: nenhuma screenshot foi retocada, todas
saem do app rodando de verdade.

## O que mudou nesta leva, e por quê

- **`08-clientes` mostrava o mesmo cliente DUAS vezes.** "Clínica Vida & Saúde" aparecia duplicado,
  mesmo telefone e tudo — a semeadura cadastrava o cliente do orçamento-herói e o cadastrava de novo
  ao criar o 3º orçamento extra. A vitrine mostrava o produto **criando a bagunça que ele promete
  arrumar**. A carteira agora tem 6 clientes distintos.
- **O relógio congelado caía num SÁBADO.** O elenco jurava "sexta-feira, 18/07/2026" e 18/07/2026 é
  sábado: `05-agenda` publicava "Sábado, 18 de julho" e os quatro orçamentos saíam datados de um fim
  de semana. Agora é **quarta-feira, 15/07/2026**, conferido por comando e não de cabeça.
- **As duas visitas do dia estavam ambas às 09:00.** Para quem vive de encaixar visita, isso lê como
  conflito de agenda — e o próprio app concorda, tem detector de sobreposição. Agora são quatro
  visitas em 08:00, 10:30, 14:00 e 16:30.
- **A legenda da agenda prometia "a semana inteira" numa foto do DIA.** Trocada por "O dia inteiro,
  com hora e endereço", que é o que a imagem entrega.
- **Os cartões da agenda não tinham endereço** — o campo existe e ninguém preenchia. Agora cada
  visita mostra o endereço e o botão de traçar rota, que é feature real.
- **A tela de orçamento aprovado publicava "2/5 sinais de confiança configurados"** com três fichas
  âmbar de alerta, no maior bloco da SEGUNDA imagem da vitrine — a que a Play mostra na busca. O
  produto usava o espaço mais caro da listagem para avisar que a proposta estava incompleta. Agora
  são **4/5**, com garantia e condições de pagamento preenchidas.

**Determinismo:** duas rodadas seguidas produzem os 8 arquivos com **md5 idêntico**. A semeadura
nova (seletor de hora, endereço, clientes extras) não quebrou isso.

---

# PARTE 7 — decisões abertas (não são defeitos)

- **`07-diagnostico-ia` tem 44,3% de tela vazia e fica assim** — é a única das oito com exceção
  declarada, e ela reprovaria no limite geral de 20%. É um formulário: abaixo de "Pedir
  diagnóstico" fica o espaço da RESPOSTA, e a resposta vem do worker de IA, que o build de captura
  (offline de propósito) não alcança. A tolerância está **escrita e justificada** no roteiro de
  `scripts/telas/loja.mjs`, não escondida afrouxando o limite geral. Agora que o worker está no ar,
  dá para fechar isto de verdade — mas capturar com o worker de pé **consome crédito de IA**, então
  é decisão sua, não conserto óbvio.
- **Sem screenshots de tablet.** `app.json:11` traz `supportsTablet: false`, mas essa chave é do
  **iOS**; no Android o app roda em tablet por padrão. **Não é bloqueio** (o mínimo de 2 já está
  satisfeito pelo telefone) — é elegibilidade perdida nas superfícies de tablet e Chromebook, onde a
  Google pede ~4 por classe.
- **As telas 01 e 02 mostram números de documento diferentes.** A 01 monta o nº 00526 e a 02 aprova
  o nº 00126, que é o que aparece na lista da 03. Não é bug: o rascunho da tela 01 **reserva** um
  número e nunca é gerado, que é o comportamento correto do app. Fica registrado porque quem lê com
  atenção percebe — e quem lê com atenção é quem está decidindo pagar. Consertar exige capturar a
  tela 01 de dentro do orçamento-herói em modo edição, o que é uma reestruturação do pipeline de
  captura, não uma linha.

---

# ⚠️ A landing continua desatualizada em relação a este elenco

`web/public/telas/` foi gerado com o elenco **antigo** e **não foi regerado** — `capturar-telas.mjs`
escreve em `web/`, que é de outra frente. As imagens no ar continuam válidas, mas:

- a legenda da agenda no ar promete "cliente, horário **e endereço**" e a imagem no ar **não tem
  endereço**. O elenco já foi corrigido (o endereço é semeado agora), então **uma recaptura resolve
  a copy falsa sem tocar em texto nenhum**;
- as imagens no ar ainda mostram o sábado, o cliente duplicado e a agenda com duas visitas às 09:00.

**Quem for recapturar a landing:** `node scripts/telas/capturar-telas.mjs`. O script já foi
consertado nesta leva — antes, uma captura que falhasse no meio **apagava a esteira da landing em
silêncio** (o `rmSync` acontecia antes do loop, e o manifesto ausente fazia a seção sumir sem erro no
build nem no deploy). Agora as imagens ficam em memória e a pasta só é trocada quando as 8 existirem.
Resolva junto o resto de `REVISAO_TELAS.md` §B: o cartão de computador é ilegível a 440 px e faltam
os degraus de 496w/880w no `srcset` (−77 KB no celular DPR 2).

---

## Quando o formulário de Segurança dos Dados precisa ser REFEITO

Ver a Parte 5 de `assets/loja/CLASSIFICACAO-E-DATA-SAFETY.md`. Gatilhos: chave do PostHog,
`expo-location`, upload de fotos para a nuvem, `expo-contacts`, Google Agenda ligado, Sentry
desligado ou trocado, ou qualquer SDK de terceiro novo no `package.json`.

---

# APÊNDICE — App Store (iOS)

A config de código foi auditada linha a linha (2026-07-18) contra a documentação versionada do Expo
SDK 56 e o comportamento real de merge dos config plugins. **Está pronta:**

- `NSCameraUsageDescription` unificado nos dois plugins que tocam a chave (`expo-camera` sobrescrevia
  o texto do `expo-image-picker` e apagava a menção ao uso mais comum da câmera).
- `NSMicrophoneUsageDescription` unificado nos três plugins que tocam a chave — antes o resultado
  final batia **por acaso**, dependendo da ordem dos plugins.
- `ios.config.usesNonExemptEncryption: false` adicionado: o app só usa TLS/HTTPS padrão, e o
  `expo-crypto` só faz hash SHA-256 para nonce/PKCE. Isso evita a pergunta de export compliance a
  cada envio.
- Permissões conferidas contra o uso real do código. **Localização e contatos não estão declarados —
  corretamente**, porque `expo-location`/`expo-contacts` não estão instalados. Declarar permissão que
  o app não usa reprova na review da Apple.
- `eas.json` conferido contra `https://docs.expo.dev/eas/json/`: nada faltando.

**Fora do escopo (é feature, não config):** o In-App Purchase da tela Planos no iOS não está
implementado — Stripe Checkout externo viola a Guideline 3.1.1. Decisão já tomada (D-16), falta codar.

### `[VOCÊ]` — iOS, em ordem
1. [ ] Abrir e pagar a conta Apple Developer (99 USD/ano — confirmar em BRL na hora).
2. [ ] Vincular o EAS à conta Apple (certificado e provisioning profile saem sozinhos no primeiro
   `eas build -p ios`).
3. [ ] Criar o app em App Store Connect → pegar o `ascAppId` numérico → **hoje ele não existe em
   `eas.json`**; preencher em `submit.production.ios.ascAppId` quando for automatizar o `eas submit`.
4. [ ] Decidir Stripe × IAP e, se for IAP, criar os produtos de assinatura em App Store Connect.
5. [ ] Preencher App Privacy (Privacy Nutrition Labels) — tabela pronta em `docs/LOJAS.md` §3.7.
6. [ ] Criar a conta de teste para o revisor (App Review Information).
7. [ ] `eas build -p ios --profile production` → `eas submit -p ios --profile production`.
8. [ ] Clique final de enviar para revisão / TestFlight.
