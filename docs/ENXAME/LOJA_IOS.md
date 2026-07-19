# LOJA iOS — o iPhone, do jeito que dá para adiantar sem a conta Apple

> **Escrito em 2026-07-19.** Irmão do `LOJA.md` (que é da Google Play). Aqui só o iPhone.
>
> A conta Apple é sua e custa US$ 99/ano. **Mas a maior parte do trabalho não depende dela** — este
> documento existe para que, no dia em que você pagar, falte o mínimo. O que eu podia adiantar no
> código, adiantei e **medi**. O que exige a conta, está escrito como passo literal.
>
> **Como ler as marcas** (mesmas do `LOJA.md`):
> - **`[PRONTO]`** — está no repositório e foi medido. Nada a fazer.
> - **`[VOCÊ]`** — exige conta, senha, cartão, aceite de termos ou um clique que nenhum agente pode dar.
> - **`[DECISÃO]`** — ninguém decide por você; o código já suporta as duas saídas.
> - **`[FALTA]`** — trabalho de máquina que ainda não foi feito, e não depende da conta.
>
> **Fonte que manda sobre dinheiro no iPhone:** `docs/ENXAME/VEREDITO_APPLE_IAP.md` (apurado
> 18/07). Este documento **não** re-decide nada daquilo — só verifica se o código continua obedecendo.

---

## 0. O PRIMEIRO PASSO, E ELE NÃO É PAGAR

**`[VOCÊ]` Aceitar o Apple Developer Program License Agreement.**

O prazo venceu em **06/07**. Enquanto o aceite não for dado, a conta fica com o regime brasileiro
**não destravado** — e isso não é um aviso cosmético: com o contrato pendente, o App Store Connect
bloqueia envio de build e as opções de pagamento do Brasil (as do acordo com o CADE, descritas no
`VEREDITO_APPLE_IAP.md` §2) não aparecem para a conta.

Onde: App Store Connect → **Business** (ou **Agreements, Tax, and Banking**) → aceitar o
**Program License Agreement** pendente. Leva ~2 minutos e é a coisa que destrava todo o resto.

Enquanto isso não estiver feito, **nada** abaixo da seção 3 funciona, por mais pronto que o código esteja.

---

## 1. O QUE JÁ ESTÁ PRONTO NO CÓDIGO

Tudo nesta seção foi **medido hoje** com `npx expo config --type introspect`, que aplica os plugins e
mostra o `Info.plist` final — não é leitura de `app.json` a olho, é o arquivo que o build vai gerar.

### 1.1 Identidade `[PRONTO]`

| campo | valor | onde |
| --- | --- | --- |
| `bundleIdentifier` | `online.olliorcamentos.app` | `app.json:12` |
| `buildNumber` | `1` | `app.json:13` |
| `version` (CFBundleShortVersionString) | `1.1.0` | `app.json:6` |
| `usesAppleSignIn` | `true` | `app.json:14` |
| `ITSAppUsesNonExemptEncryption` | `false` | `app.json:16` |
| `supportsTablet` | `false` | `app.json:11` — ver §3.1 |

O bundle id é o **mesmo** do Android, e isso está certo — são lojas diferentes, não colidem.

**`usesAppleSignIn: true` não é enfeite, é obrigação.** O app oferece login com Google
(`src/screens/` — botão Google na tela de login). A Guideline 4.8 exige que, havendo login social de
terceiro, exista também "Sign in with Apple". Ele existe (`expo-apple-authentication` no
`package.json`, plugin declarado no `app.json`). Se um dia o botão Google sair, este continua podendo ficar.

### 1.2 Permissões — cada uma com texto pt-BR e uso real `[PRONTO]`

Este é o item que reprova em review quando está errado ("permissão declarada sem uso"). Eu **não**
confiei na documentação anterior: fui nos imports.

| chave no Info.plist | texto (pt-BR, final) | quem usa de verdade |
| --- | --- | --- |
| `NSCameraUsageDescription` | "O OLLI usa a câmera para fotografar os serviços do orçamento e para ler o QR do equipamento." | `expo-image-picker` (6 telas) + `CameraView` em `src/screens/EscanearQrScreen.tsx:114` |
| `NSPhotoLibraryUsageDescription` | "O app precisa de acesso às fotos para adicionar imagens aos orçamentos." | `ImagePicker.requestMediaLibraryPermissionsAsync()` em 7 arquivos |
| `NSMicrophoneUsageDescription` | "O OLLI usa o microfone para você ditar orçamentos e falar com a assistente." | `expo-audio` (`src/services/vozNuvem.ts`) + reconhecimento de fala |
| `NSSpeechRecognitionUsageDescription` | "O OLLI usa o reconhecimento de fala para montar orçamentos ditados." | `ExpoSpeechRecognitionModule` em `src/services/reconhecimentoVoz.ts` |

**Não há `NSPhotoLibraryAddUsageDescription`, e está certo:** o app **lê** da galeria, nunca salva
nela (procurei `saveToLibraryAsync`/`MediaLibrary`/`CameraRoll` — zero ocorrências).

**Não há nenhuma chave `NSLocation*`, e está certo:** `expo-location` **não está instalado**
(`grep -c expo-location package.json` → `0`) e `LOCALIZACAO_DISPONIVEL = false`
(`src/services/localizacaoEquipe.ts:62`). No iOS o app nunca pede localização. Se um dia a Onda 8
instalar `expo-location`, **volte aqui** — aí a chave passa a ser obrigatória.

### 1.3 Três defeitos que eu encontrei e consertei hoje

Todos os três eram do tipo que só aparece no `Info.plist` gerado — invisíveis lendo o `app.json`.

**(a) `NSFaceIDUsageDescription` em inglês, para um recurso que o app não tem.**
O plugin do `expo-secure-store` escreve, por padrão,
`"Allow $(PRODUCT_NAME) to access your Face ID biometric data."`
(`node_modules/expo-secure-store/plugin/build/withSecureStore.js:7`). O app **não usa biometria**:
`expo-local-authentication` não está instalado e não há uma única referência a
`LocalAuthentication`/`FaceID`/`requireAuthentication` em `src/`. Era exatamente o caso "permissão
declarada sem uso" — **e ainda em inglês**, num app pt-BR.
**Conserto:** `"faceIDPermission": false` (`app.json:114`). Confirmei que `false` **apaga** a chave
lendo o próprio Expo (`@expo/config-plugins/build/ios/Permissions.js:28-30` faz `delete infoPlist[permission]`).
Medido depois: `NSFaceIDUsageDescription = null`. Isso é iOS-puro — **não** mexe no Android
(a parte Android daquele plugin é regra de backup, controlada por outra opção).

**(b) `UIBackgroundModes: ["audio"]` sem áudio em background.**
O plugin do `expo-audio` liga `enableBackgroundPlayback` por padrão
(`node_modules/expo-audio/plugin/build/withAudio.js:8`), e isso injeta o background mode de áudio.
Só que o app **não toca áudio**: de `expo-audio` ele importa apenas `useAudioRecorder`,
`RecordingPresets`, as permissões e `setAudioModeAsync` (`src/services/vozNuvem.ts:3-9`) — procurei
`useAudioPlayer`/`createAudioPlayer`/`.play()` em todo o `src/`: **zero**. E o modo que o autor
configura é `{ allowsRecording: true, playsInSilentMode: true }` (`vozNuvem.ts:362`), sem nenhuma
flag de background. Declarar background mode que não se usa é rejeição por Guideline 2.5.4.
**Conserto:** `"enableBackgroundPlayback": false` (`app.json:108`). Medido depois: `UIBackgroundModes = null`.
> ⚠️ **O trade-off, explícito:** sem esse background mode, uma gravação em andamento é interrompida
> se o usuário sair do app no meio do ditado. Isso **já era o comportamento do Android** (o plugin
> não cria foreground service porque `enableBackgroundRecording` é `false`), então o conserto
> *alinha* as plataformas em vez de degradar uma. Se você quiser ditado sobrevivendo em background,
> é uma feature a construir nas duas plataformas — não é reverter esta linha.

**(c) O texto pt-BR do microfone estava ganhando por sorte.**
O plugin do `expo-camera` também escreve `NSMicrophoneUsageDescription`, e como o `app.json` só
passava `cameraPermission`, ele usava o default **inglês**
(`withCamera.js:6`). O valor final saía em pt-BR só porque `expo-audio` vem **depois** dele na lista
de plugins e sobrescreve. Ou seja: **reordenar a lista de plugins trocaria o texto para inglês, em
silêncio.** Conserto: passei `microphonePermission` explícito ao `expo-camera` também (`app.json:50`).
Agora as três fontes escrevem o mesmo texto e a ordem deixou de importar.

Verificação final, depois dos três: **nenhuma string `Allow $(PRODUCT_NAME)` sobrou** no
`Info.plist` gerado.

### 1.4 Privacy Manifest (`PrivacyInfo.xcprivacy`) `[PRONTO — a parte que bloqueia o upload]`

**O requisito, hoje:** desde 01/05/2024 o App Store Connect **recusa no upload** apps que usem
"required reason APIs" sem declará-las num `PrivacyInfo.xcprivacy`
([Apple](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)).
As categorias são coisas banais como ler timestamp de arquivo, espaço em disco, boot time e `UserDefaults`.

**A descoberta:** o Expo **não gerava nenhum manifest de app** para o OLLI. O plugin existe
(`@expo/config-plugins/build/ios/PrivacyInfo.js`) mas a primeira coisa que ele faz é:

```js
const privacyManifests = config.ios?.privacyManifests;
if (!privacyManifests) {
  return config;          // <- sem a chave no app.json, ele não faz NADA
}
```

Como o `app.json` não tinha `ios.privacyManifests`, o arquivo simplesmente não era criado. A doc da
Expo ainda avisa que *"Apple does not correctly parse all the PrivacyInfo files included by static
CocoaPods dependencies"* — ou seja, não dá para confiar só nos manifests que vêm dentro de cada pod.

**O que eu declarei, e de onde tirei cada linha.** Não inventei: li os `PrivacyInfo.xcprivacy` que os
pacotes instalados já trazem e declarei a **união** deles no nível do app.

| categoria | códigos | pacote instalado que a exige |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` | `@react-native-async-storage/async-storage`, `expo-application`, `expo-file-system` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` | `expo-file-system` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | `expo-device` |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | `expo-notifications`, `expo-constants`, `expo-system-ui` |

Mais `NSPrivacyTracking: false` e `NSPrivacyTrackingDomains: []` — o app **não rastreia**: não há
IDFA, não há `expo-tracking-transparency`, não há rede de anúncios. Por isso também **não** existe
prompt de ATT, e não deve existir.

Está em `app.json:18`. O plugin do Expo faz *merge* (não substitui), então isso soma ao que os pods
trouxerem.

> **O que eu NÃO declarei, de propósito:** `NSPrivacyCollectedDataTypes`. Ver §4 — é uma declaração
> legal sua, tem que bater com o questionário do App Store Connect, e eu deixei o bloco pronto para
> colar depois que você conferir.

### 1.5 A trava da Guideline 3.1.1 continua valendo `[PRONTO]`

O `VEREDITO_APPLE_IAP.md` decidiu: **no iPhone o app não vende nada**. Verifiquei que continua verdade
depois de todas as ondas — e verifiquei que o teste que protege isso **morde**.

```
$ node scripts/teste-planos-ios.ts
PASSOU: 19 ok, 0 falha(s)      exit=0
```

**Mutation check** (fiz em cópias no scratchpad; **o repositório não foi tocado**):

| mutação na cópia | o teste pegou? |
| --- | --- |
| apagar `if (!COMPRA_NO_APP) return;` de `falarComSuporte` (PlanosScreen) | **sim** — exit 1 |
| trocar `COMPRA_NO_APP` por `true` (ContaScreen) | **sim** — exit 1 |
| desguardar a dica do portal (`{ANUNCIA_TROCA_PLANO` → `{true`) | **sim** — exit 1 |

Então o teste não é decorativo: ele falha quando a guarda some. As constantes vivas hoje:

```
src/screens/PlanosScreen.tsx:39      const COMPRA_NO_APP = Platform.OS !== 'ios';
src/screens/AssinaturaScreen.tsx:44  const ANUNCIA_TROCA_PLANO = Platform.OS !== 'ios';
src/screens/AssinaturaScreen.tsx:47  const COMPRA_NO_APP = Platform.OS !== 'ios';
src/screens/ContaScreen.tsx:61       const COMPRA_NO_APP = Platform.OS !== 'ios';
src/screens/CreditosScreen.tsx:45    const COMPRA_NO_APP = Platform.OS !== 'ios';
```

**Duas correções ao que o próprio script diz de si mesmo:**

1. O docblock dele (`scripts/teste-planos-ios.ts:7-10`) afirma que ele **não** está ligado no
   `npm test`. **Está desatualizado** — hoje ele está na cadeia (`grep -o "test:planos-ios"
   package.json` → 2 ocorrências: o script e a cadeia do `test`). Ou seja, ele roda no `preflight`.
   Comentário obsoleto, não defeito.
2. **`CreditosScreen.tsx` tem a guarda mas o teste não a cobre.** Li a tela: a guarda está íntegra e
   é até mais forte que nas outras (nem carrega os pacotes no iOS — `linha 106`; early-return na
   `138`; JSX condicionado na `262`). Mas se alguém quebrar **essa** tela, o teste passa mesmo assim.
   É a única das 5 telas fora da rede. `[FALTA]` — não consertei porque `scripts/` e `src/` são de
   outro agente nesta rodada.

---

## 2. O QUE VOCÊ FAZ EM MINUTOS, QUANDO TIVER A CONTA

Em ordem. Nenhum destes exige código novo.

1. **`[VOCÊ]` Aceitar o Program License Agreement** — §0. Sem isto, o resto falha.
2. **`[VOCÊ]` Criar o App ID / registrar o bundle** `online.olliorcamentos.app` no Developer Portal.
   Marcar a capability **Sign in with Apple** (o app usa) e **Push Notifications** (usa `expo-notifications`).
3. **`[VOCÊ]` Criar o app no App Store Connect** com esse bundle id. Anotar o **ascAppId** (o número
   que aparece na URL) e o **Team ID**.
4. **`[VOCÊ]` Preencher `eas.json`** — hoje `submit.production.ios` está `{}` de propósito: eu não
   invento credencial. Quando tiver os números, fica:
   ```json
   "ios": {
     "appleId": "seu-email@apple",
     "ascAppId": "0000000000",
     "appleTeamId": "XXXXXXXXXX"
   }
   ```
   (`appleId` é o e-mail da conta, não uma senha. **Senha e app-specific password não vão para
   arquivo** — o EAS pede na hora.)
5. **`[VOCÊ]` `eas credentials`** — deixe o EAS gerar o Distribution Certificate e o Provisioning
   Profile. Ao contrário do Android, aqui **não** existe keystore para você guardar; a Apple é a dona.
6. **`[VOCÊ]` `eas build -p ios --profile production`** e depois `eas submit -p ios`.
   ⚠️ Eu **não** rodei nem devo rodar nenhum dos dois.
7. **`[VOCÊ]` Responder o questionário de privacidade** no App Store Connect — a "nutrition label".
   O rascunho derivado do código está na §4. **Ele tem que bater com o que o app faz de verdade.**
8. **`[VOCÊ]` Export Compliance** — quando o ASC perguntar, a resposta já está no binário
   (`ITSAppUsesNonExemptEncryption = false`), então ele **não deve** nem perguntar. Se perguntar:
   o app usa só HTTPS padrão, que é isento.

---

## 3. AS DECISÕES QUE SÃO SUAS

### 3.1 `[DECISÃO]` iPad: hoje está **fora**, e eu recomendo manter

`supportsTablet: false` (`app.json:11`). Consequências, medidas:

- O app roda no iPad em **modo de compatibilidade iPhone** (janela de iPhone). É permitido.
- **Você não precisa produzir screenshots de iPad** — a Apple só exige se o app declarar suporte
  ([Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)).
  Isso economiza um jogo inteiro de imagens.
- O custo: o app não aparece bem em busca de iPad e perde esse público.

Ligar depois é uma linha — **mas** aí entra QA de layout em telas grandes (o app é desenhado em
portrait, `orientation: "portrait"`) e o jogo de screenshots de 13". Recomendo: publique iPhone-only,
ligue iPad quando houver demanda.

### 3.2 `[DECISÃO]` Continuar sem vender no iPhone

Está decidido no `VEREDITO_APPLE_IAP.md` e o código obedece (§1.5). Só relembrando o custo, para a
decisão não ser esquecida: **usuário de iPhone assina pelo site**, e o app não pode nem mencionar
isso. Se um dia quiser vender no app, o `VEREDITO` §1 é claro — é construir StoreKit **de qualquer
jeito**, e aí 10–21% de comissão. Não existe atalho.

### 3.3 `[DECISÃO]` `NSAllowsArbitraryLoads` está `true`

O `Info.plist` final tem `NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, ... }` — é default
do template Expo, para o dev server funcionar. Em produção o app só fala HTTPS
(Supabase e `diagnostico.olliorcamentos.online`). Isso **não bloqueia** a publicação, mas a Apple
pode pedir justificativa. Dá para desligar via `ios.infoPlist`, **porém** isso quebra o
`expo start` em rede local — por isso não mexi sozinho. Se quiser, é um item de uma linha.

---

## 4. A "NUTRITION LABEL" — rascunho derivado do código, para você conferir

Isto responde tanto o questionário do App Store Connect quanto o bloco
`NSPrivacyCollectedDataTypes` que **deixei de fora** do `app.json` de propósito: é uma declaração
legal sua, e mentir nela (para mais ou para menos) é problema de verdade. Eu derivei da fonte:

| dado | coleta? | onde eu vi |
| --- | --- | --- |
| E-mail, nome | **sim** | conta Supabase (`src/services/supabase.ts`) |
| Identificador de usuário | **sim** | id Supabase + pseudônimo SHA-256 do analytics (`analyticsRemoto.ts:68-75`) |
| Conteúdo do usuário (orçamentos, clientes) | **sim** | é o produto |
| Fotos | **sim** | anexadas ao orçamento e enviadas à IA |
| Áudio | **sim** | ditado vira base64 e vai para `POST /transcrever` (`vozNuvem.ts:167,278`) |
| Suporte / feedback | **sim** | `src/services/feedback.ts` |
| Crash e desempenho | **sim** | Sentry, `App.tsx:58` (`sendDefaultPii: false`, `tracesSampleRate: 0.1`) |
| **Localização** | **NÃO** | `expo-location` não instalado; `LOCALIZACAO_DISPONIVEL = false` |
| **Dados financeiros** | **NÃO** | pagamento não acontece no app iOS (§1.5); cartão nunca toca o app |
| **Rastreamento / anúncios** | **NÃO** | sem IDFA, sem ATT, sem rede de anúncios |
| Contatos, saúde, navegação | **NÃO** | nenhum módulo instalado |

**Uma incerteza que eu não vou esconder:** o Sentry coleta modelo de aparelho, versão de SO e um
identificador de instalação. Se você quiser rigor máximo, marque também **Device ID** no
questionário, com finalidade *App Functionality / Analytics*. Eu não consegui provar exatamente o
que o SDK nativo envia — o manifest dele vive no pod `sentry-cocoa`, que só existe depois de um
`pod install` num Mac. **Não afirmo que falta; afirmo que não verifiquei.**

Bloco pronto para colar em `app.json` dentro de `ios.privacyManifests`, **depois** de você conferir
a tabela acima:

```json
"NSPrivacyCollectedDataTypes": [
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeEmailAddress",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeName",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeUserID",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality",
                                           "NSPrivacyCollectedDataTypePurposeAnalytics"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeOtherUserContent",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePhotosorVideos",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeAudioData",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCustomerSupport",
    "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCrashData",
    "NSPrivacyCollectedDataTypeLinked": false, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
  { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePerformanceData",
    "NSPrivacyCollectedDataTypeLinked": false, "NSPrivacyCollectedDataTypeTracking": false,
    "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAnalytics"] }
]
```

**Você já tem política de privacidade publicada** (`https://olliorcamentos.online/legal/privacidade/`
— respondeu 200, 26.760 b, no teste de 19/07). O ASC exige a URL; ela existe.

---

## 5. O QUE AINDA FALTA, E NÃO DEPENDE DA CONTA

### 5.1 `[FALTA]` Screenshots de iPhone — os do Android **não servem**

Medido: `assets/loja/screenshots/*.png` são **1080x1920** (9:16, formato Android). A Apple não aceita
essa dimensão. Para iPhone é preciso um jogo novo, em portrait, no tamanho do slot de **6,9"**.

> **Uma imprecisão que eu não vou disfarçar:** a página oficial da Apple lista o slot de 6,9" como
> **1260 x 2736**, enquanto os guias de mercado citam **1290 x 2796** e **1320 x 2868** (são
> aparelhos diferentes na mesma prateleira). O App Store Connect aceita mais de uma. **Confirme o
> número no próprio ASC na hora do upload** — é o único lugar que não erra, e dimensão errada é a
> causa nº 1 de recusa de screenshot.

Mínimo 1, máximo 10 por prateleira; enviando só a maior, o ASC escala para as menores. **Sem alpha.**
Já existe maquinário de captura em `scripts/telas/` (usado para o Android) — adaptar o viewport é
trabalho de máquina, não seu.

### 5.2 `[PRONTO]` Ícone

`assets/icon.png` é **1024x1024, colorType 2 (RGB, sem canal alpha)** — medido lendo o cabeçalho do
PNG. É exatamente o que a App Store exige (ela **rejeita** ícone com transparência). Nada a fazer.

### 5.3 `[FALTA]` `CreditosScreen` fora do teste 3.1.1

Ver §1.5, item 2. A guarda está correta hoje; o que falta é a rede que impede alguém de quebrá-la
amanhã. Precisa de uma sessão com permissão de escrita em `scripts/`.

### 5.4 Sobre testar antes de pagar — a verdade incômoda

`eas.json` tem perfis `development` e `preview` com `ios.simulator: true`, e build de simulador
**não precisa de conta paga**. Só que rodar um `.app` de simulador **exige um Mac** — não existe
simulador de iOS no Windows. Então, na sua máquina, **não há como ver o app rodando no iPhone antes
de ter conta e um aparelho** (ou um Mac emprestado). Prefiro dizer isso agora a você descobrir depois
de pagar.

---

## 6. O QUE ESTE DOCUMENTO **NÃO** PROVA

Para o próximo agente não confundir o que foi medido com o que foi suposto:

- **Nenhum build de iOS foi feito.** Não rodei `eas build`, `eas submit` nem `expo prebuild`. Tudo
  aqui é `expo config --type introspect` (que aplica os plugins **sem** gerar projeto nativo) e
  leitura dos pacotes em `node_modules/`.
- **O `PrivacyInfo.xcprivacy` final não foi visto**, porque só nasce no prebuild. O que eu provei é
  que a entrada existe no `app.json` e que o plugin que a consome deixa de ser no-op — que era
  exatamente o defeito.
- **Nada foi criado na Apple.** Nenhuma conta, nenhum App ID, nenhum certificado.
- **O comportamento dos consertos (a) e (b) não foi visto rodando em iPhone** — foi provado no
  `Info.plist` gerado. Para o (b) especialmente, o teste de verdade é gravar um ditado num iPhone
  real e sair do app.
- **A comissão e o regime brasileiro** não foram reapurados: são do `VEREDITO_APPLE_IAP.md` (18/07).

**Gates rodados nesta sessão:** `npm run typecheck` → **exit 0**. `node scripts/teste-planos-ios.ts`
→ **exit 0, 19 ok**. `app.json` e `eas.json` validados como JSON (`JSON.parse`) → ambos válidos.
`eas.json` **não foi modificado**.
