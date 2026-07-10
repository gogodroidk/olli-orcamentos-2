# LOJAS — roteiro para publicar o OLLI Orçamentos (Play Store + App Store)

> Meta: contas pagas e primeiro envio prontos até **dia 20**. Este documento é o passo-a-passo
> executável. Escrito em 2026-07-09 com base no estado real do app nesta data — revalide os itens
> marcados **[VERIFICAR]** perto da data do envio, porque políticas de loja mudam.
>
> Pacote (`applicationId` / `bundleIdentifier`): `online.olliorcamentos.app` (igual nas duas lojas).

> **Chave de UPLOAD (Android): GERADA em 2026-07-09.**
> Arquivo: `CONFIG CLAUDE/olli-keystore/olli-upload.jks` (PKCS12, alias `olli-upload`, RSA 4096,
> SHA384withRSA, válida até 2053). Senha no cofre local (`OLLI_UPLOAD_KEYSTORE_PASSWORD`), **nunca**
> no repositório — `.gitignore` bloqueia `credentials.json`, `*.jks`, `*.keystore`, `*.p12`.
> **SHA-1 desta chave:** `44:93:1D:96:77:A6:24:40:26:F3:87:2B:AC:71:AC:91:38:88:20:1E`
> — é ESTE valor que vai no OAuth client Android do Google (o SHA-1 antigo, `5E:8F:...`, era do
> keystore de *debug* e não serve para produção).
>
> Com **Play App Signing** (padrão para apps novos), o Google guarda a chave de assinatura do app e
> você guarda só a de upload. Perder a de upload é recuperável (o Google reseta mediante pedido);
> perder a de assinatura, não — e ela fica com eles. Guarde a senha mesmo assim.
> Versão atual em `app.json`: `1.1.0`, `android.versionCode` 9, `ios.buildNumber` "1".

---

## 0. O que o app realmente coleta hoje (base para os formulários das lojas)

Levantado direto do código (`app.json`, `src/services/*`, telas de tela cheia) — não do que está
"planejado". Se algo abaixo mudar, atualize também a seção 5 (Data Safety) e 6 (Privacy Nutrition
Labels).

| Dado | Onde é coletado | Para quê | Sai do aparelho? |
| --- | --- | --- | --- |
| Nome, e-mail, telefone | Cadastro (`EntrarScreen.tsx`) | Criar a conta, identificar o orçamento/empresa | Sim — Supabase (auth + tabela `empresas`), com RLS por organização |
| Senha | Cadastro/login | Autenticação | Sim — Supabase Auth (hash, nunca em texto puro no app) |
| Login social Google | Botão "Continuar com o Google" (`EntrarScreen.tsx`, OAuth via `expo-web-browser`) | Autenticação alternativa | Sim — fluxo OAuth padrão do Supabase; o app não guarda a senha do Google |
| Fotos (CAMERA / READ_MEDIA_IMAGES) | Fotos de serviços/equipamentos anexadas a orçamentos e ao inventário PMOC | Documentar o serviço para o cliente | Sim, se o usuário sincronizar com a nuvem (Supabase Storage) — local por padrão |
| Áudio (RECORD_AUDIO) | Ditado de orçamento por voz e chat com a assistente Olli (`OlliVozScreen.tsx`, `OlliChatScreen.tsx`) | Criar orçamento falando, tirar dúvida técnica | **Modo "dispositivo"**: reconhecimento nativo, o áudio não sai do aparelho. **Modo "nuvem"**: o áudio grava com `expo-audio` e vai para o Worker Cloudflare, que repassa para o modelo de IA (Gemini) para transcrever — não é armazenado depois de transcrito |
| Localização da equipe | Tela "Equipe ao vivo" (`localizacaoEquipe.ts`, `EquipeAoVivoScreen.tsx`) — **atrás de flag**: hoje só funciona na versão **web** via `navigator.geolocation`; a captura nativa em background (expo-location) ainda não está instalada no app mobile | Gestor ver a posição do técnico em campo | Sim — tabela `localizacoes_equipe` no Supabase, RLS restringe a "própria linha OU gestão da mesma organização" (nunca entre organizações) |
| Assinatura/plano (Stripe) | Tela Planos (`PlanosScreen.tsx`) abre o Checkout do Stripe num navegador externo (`Linking.openURL`) | Cobrar a assinatura Pro/Empresa do prestador | Sim — processado pelo Stripe; o OLLI nunca vê número de cartão |
| Eventos de uso (analytics) | `src/services/analytics.ts` (`track()`) | Funil interno (orçamento criado/enviado/aprovado, uso de IA) | **Não** — hoje grava só no SQLite local do aparelho. Não há Sentry/PostHog ligados ainda (bloqueios B7/B8 em `docs/KNOWN_BLOCKERS.md`). Quando ligar, revisite as seções 5 e 6 |
| Dados de clientes/orçamentos/serviços | Uso normal do app | O produto em si (CRM + orçamentos) | Sim, se a organização usar backup/sync na nuvem — offline-first por padrão |

Não há coleta de: contatos do aparelho, SMS, calendário nativo (a integração com Google Agenda é
opt-in e por OAuth, não lê o calendário do sistema), identificadores de publicidade, nem
compartilhamento de dados com redes de anúncio.

---

## 1. Três bloqueios que PRECISAM de código antes de submeter (fora do escopo deste documento)

Este documento e o `eas.json` cobrem só configuração/loja. Os três itens abaixo são
**funcionalidade** e alguém precisa implementá-los antes do envio real — não são coisas que se
resolvem preenchendo formulário:

1. **Botão "Excluir minha conta" dentro do app.** A Apple **exige** isso desde 2022 (App Store
   Review Guideline 5.1.1(v)) para qualquer app com criação de conta, e a Play Store também cobra
   um "mecanismo de exclusão" no Data Safety. Sem isso a Apple rejeita na primeira revisão, sempre.
   **Status: FEITO.** `src/services/conta.ts` + `worker/src/conta.js` (rota `POST /conta/excluir`)
   e o botão na `ContaScreen` (modal com "digite EXCLUIR" + alerta de última confirmação). O worker
   cancela a assinatura Stripe ANTES de apagar `auth.users`, e se o cancelamento falhar ele devolve
   502 e **não apaga nada** — apagar a conta com a assinatura viva deixaria o cartão sendo cobrado
   sem nenhuma conta pela qual cancelar.
2. **"Sign in with Apple" na tela de login.** **Status: CÓDIGO FEITO, falta 1 passo humano.**
   `src/services/appleAuth.ts` + `src/components/BotaoApple.tsx` + `EntrarScreen.tsx`; `app.json` com
   o plugin `expo-apple-authentication` e `ios.usesAppleSignIn: true`. O botão é o componente nativo
   da Apple (a HIG exige), aparece só no iOS 13+ (`isAvailableAsync`) e tem peso equivalente ao do
   Google, como a Guideline 4.8 manda. Anti-replay: nonce aleatório — o **SHA-256** vai para a Apple
   (vira claim no `identityToken`) e o **valor cru** vai para o `supabase.auth.signInWithIdToken`,
   que hasheia e compara (confirmado na tipagem instalada, `auth-js/types.d.ts:586`). Inverter os
   dois faz o login falhar SEMPRE.

   **CONFIGURAÇÃO DO SUPABASE: FEITA (2026-07-09).** Provider Apple habilitado via Management API,
   com `external_apple_client_id = online.olliorcamentos.app`; verificado relendo a config da nuvem
   (`external_apple_enabled: true`). Para login NATIVO só isso é necessário — Services ID, Team ID e
   chave `.p8` só entram no fluxo OAuth da web, que não usamos.

   **NÃO DÁ PARA TESTAR antes da conta Apple Developer paga:** rodar o app no iPhone exige um
   provisioning profile com a entitlement `com.apple.developer.applesignin`, e isso só sai com a
   conta. Até lá o código é inerte no Android e na web (o módulo é `require`-preguiçoso; fora do iOS
   o botão renderiza `null`).
3. **In-App Purchase no build iOS — DECIDIDO (D-16), falta implementar.** A tela Planos abre o
   Stripe Checkout num navegador externo. No iOS isso viola a Guideline 3.1.1: *"If you want to
   unlock features or functionality within your app ... you must use in-app purchase."*

   As três exceções foram checadas contra o texto vigente da guideline e **nenhuma cobre o OLLI**:
   - **3.1.3(c) Enterprise Services** termina em *"Consumer, single user, or family sales must use
     in-app purchase."* — o alvo do OLLI é o autônomo, venda para usuário único.
   - **3.1.3(b) Multiplatform Services** só libera acesso ao que foi comprado no site *"provided
     those items are also available as in-app purchases within the app"* — exige IAP de todo jeito.
   - **3.1.3(f) Free Stand-alone Apps** exige ser companion de uma ferramenta **web** paga (os
     exemplos são VoIP, cloud storage, e-mail, hospedagem). O app OLLI **é** o produto, offline-first,
     e é dentro dele que o recurso pago destrava.

   **Escopo do trabalho:** StoreKit no build iOS (produtos de assinatura no App Store Connect),
   validação de recibo no worker (App Store Server API, JWS assinado), endpoint de App Store Server
   Notifications v2, e a tabela `assinaturas` ganhando a origem (`stripe` | `apple`) para reconciliar
   as duas trilhas. No iOS, a tela Planos vende por IAP; Stripe segue no web e no Android.
   **Custo: 15%** (Small Business Program, receita abaixo de US$1M/ano).
   **Não é testável antes da conta paga** — o sandbox de IAP exige App Store Connect.

   (Registro histórico dos caminhos avaliados:)
   - (a) Implementar StoreKit/`expo-in-app-purchases` para o build iOS e reconciliar com o mesmo
     estado de plano que hoje vem do webhook do Stripe (mais trabalho, mas é o caminho "oficial");
   - (b) Ocultar/desabilitar o CTA de assinatura na build iOS (deixar só leitura do plano atual +
     texto "gerencie sua assinatura em olliorcamentos.online") — comum em apps B2B/SaaS multiplataforma,
     mas ainda pode ser questionado pela revisão;
   - (c) Consultar diretamente as guidelines atuais da Apple (podem ter mudado) antes de decidir.
   **[VERIFICAR]** — política de compra externa da Apple é a área que mais muda; revalide perto do envio.

Recomendação: tratar os itens 1 e 2 como pré-requisito de código antes de sequer tentar enviar pro
iOS (a Play Store não exige nenhum dos dois — pode-se enviar Android sem esperar). O item 3 é uma
decisão de produto que precisa ser tomada, não só codificada.

---

## 1.5 Variáveis de ambiente no build da nuvem (`EXPO_PUBLIC_*`) — não pule isto

O build local no Windows usa um `.env.local` (gitignored) copiado manualmente na máquina — ver
memória `olli-build-apk-windows.md`. **O EAS Build na nuvem NÃO tem acesso a esse arquivo local.**
Sem configurar as mesmas variáveis no EAS, o build de loja sai "capado" silenciosamente:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` têm fallback hardcoded em
  `src/config.ts` — funcionam mesmo sem configurar nada (não são segredo, são a URL/chave pública
  do projeto Supabase).
- `EXPO_PUBLIC_DIAGNOSTICO_URL` **não tem fallback, de propósito** (ver comentário em
  `src/config.ts`) — sem ela, o build de loja sobe com a IA de diagnóstico/voz/chat **desligada**,
  sem erro nenhum (caminho "honesto" do app, mas não é o que você quer publicar na loja).
- `EXPO_PUBLIC_LINK_BASE_URL` também tem fallback hardcoded (`link.olliorcamentos.online`).

Antes de rodar `eas build --profile production`, registre as variáveis do `.env.example` no
projeto EAS (uma vez só, ficam salvas na conta):
```
npx eas env:create --name EXPO_PUBLIC_DIAGNOSTICO_URL --value https://diagnostico.olliorcamentos.online --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_WHATSAPP_SUPORTE --value <numero-com-ddi> --environment production --visibility plaintext
```
`--visibility plaintext` é o correto aqui — são as mesmas variáveis `EXPO_PUBLIC_*` que já entram
no bundle público do app (não são segredo; segredo de verdade, tipo chave de IA, fica só no
Worker). Repita para as demais do `.env.example` que fizerem sentido para o build de produção.
Depois de qualquer build de loja, abra o app instalado e confirme que a assistente Olli/diagnóstico
por IA responde — se estiver "desligada", é sinal de que essa etapa foi pulada.

---

## 2. ANDROID (Google Play)

### 2.1 Conta de desenvolvedor
- https://play.google.com/console → taxa única (histórico ~US$ 25, confirme o valor atual na hora
  de pagar — **[VERIFICAR]**).
- **Se a conta for pessoal (não organização) e for criada agora**: contas pessoais criadas depois de
  13/nov/2023 são **obrigadas** a rodar um teste fechado com **pelo menos 12 testadores opt-in por
  14 dias corridos** antes de poder pedir acesso à produção. Isso é sequencial, não dá pra pular —
  então **crie a conta e suba a primeira build de teste fechado o quanto antes**, mesmo antes do
  dia 20, para os 14 dias já estarem correndo. Contas de organização (Google Workspace/CNPJ
  verificado) ficam isentas dessa exigência.

### 2.2 Keystore de upload — **⚠️ SE PERDER, PERDE O APP**
A keystore assina o `.aab`. Se você perder o arquivo **e** a senha, não existe recuperação — a
Play Store não aceita mais um app com o mesmo `applicationId` assinado por outra chave. Guarde o
arquivo E a senha em pelo menos dois lugares (ex.: `CONFIG CLAUDE/credenciais-locais` + um backup
fora da máquina, como um cofre de senhas ou HD externo).

Duas formas de gerar — escolha uma:

**Opção A — deixar o EAS gerar e guardar por você (recomendado, mais simples):**
```
npx eas credentials --platform android
```
Escolha "Set up a new keystore" quando perguntado. O EAS guarda a keystore criptografada na conta
Expo (ligada ao projeto) — ainda assim, baixe uma cópia local depois (`eas credentials` → "Download
keystore") e guarde nos dois lugares citados acima.

**Opção B — gerar você mesmo com `keytool` (Java, vem com o JDK) e depois subir pro EAS:**
```
keytool -genkeypair -v -keystore olli-upload-keystore.jks -alias olli-upload -keyalg RSA -keysize 2048 -validity 10000
```
Ele vai pedir senha da keystore, senha da chave (pode ser igual) e dados do certificado (nome,
organização, país — não precisam ser exatos, mas mantenha consistentes). Depois:
```
npx eas credentials --platform android
```
→ "Set up a new keystore" → "I want to upload my own file" → aponte para `olli-upload-keystore.jks`.

Em qualquer opção: **nunca** commite o `.jks` no git — já está no `.gitignore` (`*.jks`).

### 2.3 Gerar o AAB assinado
```
npm install -g eas-cli   # se ainda não tiver
npx eas login
npx eas build -p android --profile production
```
Perfil `production` do `eas.json` já está configurado para `buildType: app-bundle` (o formato que a
Play Store exige para apps novos — não é mais o `.apk`). Ao final, o EAS dá um link para baixar o
`.aab`. Build roda 100% na nuvem da Expo — não precisa de Android Studio nem SDK instalado na
máquina.

Para gerar um `.apk` de teste rápido (instalável direto no aparelho, sem passar pela loja), use o
perfil `preview`:
```
npx eas build -p android --profile preview
```

### 2.4 Subir na Play Console
1. Play Console → "Criar app" → nome `OLLI Orçamentos`, idioma padrão pt-BR, tipo "App", gratuito.
2. Preencher a ficha da loja (texto pronto em `docs/STORE_LISTING.md`).
3. **Política de privacidade**: URL obrigatória. Use `https://olliorcamentos.online/privacidade`
   (mesma URL já referenciada em `LEIA-ANDROID.md`) — confirme que a página existe e está no ar
   antes de enviar; se não existir ainda, publicá-la é pré-requisito, não algo pra fazer depois.
4. **Teste fechado primeiro** (se aplicável — ver 2.1): Console → Testar e lançar → Teste fechado →
   criar uma faixa, subir o primeiro `.aab`, adicionar e-mails dos 12 testadores, esperar 14 dias
   com engajamento real (abrir o app periodicamente — a Play Console mede isso e marca testador
   inativo).
5. Depois do teste fechado (ou direto, se conta de organização): "Produção" → "Criar nova versão" →
   subir o `.aab` → preencher "novidades desta versão" (texto em `docs/STORE_LISTING.md`).
6. **Target API level**: Expo SDK 56 já compila com `compileSdkVersion`/`targetSdkVersion` = **35**
   (Android 15) por padrão — atende a exigência atual da Play Store para apps novos. **[VERIFICAR]**:
   a partir de **31/ago/2026** a Play Store passa a exigir API **36** para apps novos e atualizações
   (extensão possível até 01/nov/2026). Se o envio acontecer depois dessa data, confirme que o SDK
   do Expo em uso já compila com API 36 antes de enviar — senão a Play Console recusa o upload.
7. **Classificação de conteúdo**: preencher o questionário IARC dentro da própria Play Console
   (não é um campo de texto livre — é um formulário próprio). Categoria esperada: "Ferramentas"
   ou "Negócios", classificação livre (sem conteúdo sensível).

### 2.5 Data Safety (formulário "Segurança dos dados")
Preencher em Play Console → Política → Segurança dos dados, usando a tabela da seção 0 deste
documento. Resumo pronto pra marcar:

| Categoria (nome atual do formulário) | Coletado? | Compartilhado com terceiro? | Finalidade | Opcional? | Pode excluir? |
| --- | --- | --- | --- | --- | --- |
| Informações pessoais (nome, e-mail, telefone) | Sim | Não (só processadores: Supabase) | Funcionalidade do app, gerenciamento de conta | Não (necessário pro cadastro) | Sim, uma vez o botão de exclusão de conta existir (item 1 da seção 1) |
| Fotos | Sim | Não | Funcionalidade do app | Sim | Sim (apagar o orçamento/equipamento apaga a foto) |
| Áudio | Sim | Sim, com processador de IA (Gemini, via Worker próprio) só no modo "nuvem" | Funcionalidade do app (ditado, assistente) | Sim (modo "dispositivo" não sai do aparelho) | Não é retido após transcrever |
| Localização aproximada/precisa | Sim, só quando a organização usa "Equipe ao vivo" | Não | Funcionalidade do app (gestão de equipe em campo) | Sim (recurso opt-in, hoje só ativo na web) | Sim |
| Informações financeiras (assinatura) | Sim | Sim (Stripe, processador de pagamento) | Cobrança da assinatura | Sim (só quem assina Pro/Empresa) | N/A — histórico de cobrança fica com o Stripe |
| Interações no app (App interactions) | Sim | Não | Analytics interno (funil) | N/A | Fica no aparelho, some ao desinstalar |

Todas as categorias: **dados transmitidos criptografados em trânsito** = Sim (HTTPS/TLS em toda
chamada Supabase/Worker/Stripe). **Mecanismo de exclusão de dados** (antigo "Deletion mechanism",
hoje "Deletion request mechanism") = aponte para a política de privacidade + o botão de exclusão de
conta (pré-requisito do item 1 da seção 1) uma vez implementado.

---

## 3. iOS (App Store)

### 3.1 Conta Apple Developer
- https://developer.apple.com/programs/ → **US$ 99/ano** (Individual — dá pra distribuir na App
  Store pública e até 100 testadores no TestFlight). **[VERIFICAR]** valor/moeda local na hora de
  pagar.
- Pode levar de algumas horas a 1-2 dias para aprovar (mais se for pessoa jurídica — exige D-U-N-S
  number). Se for entrar no ar até dia 20, iniciar o cadastro o quanto antes.

### 3.2 EAS Build na nuvem — sem precisar de Mac
```
npx eas build -p ios --profile production
```
O `eas.json` já está configurado para isso — a build de iOS do EAS roda em máquinas macOS hospedadas
pela Expo por padrão; **não é necessário nenhum Mac físico** para compilar. Na primeira execução o
CLI pergunta se quer que o EAS gerencie os certificados/provisioning profiles automaticamente —
responda que sim (mais simples e é o caminho recomendado pela própria Expo). Ele vai pedir login
com a conta Apple Developer para gerar/baixar o certificado de distribuição e o profile — isso
acontece uma vez só, e fica guardado na conta EAS do projeto (`eas credentials --platform ios` para
gerenciar depois).

Para testar rápido sem esperar certificado (útil enquanto a conta Apple Developer ainda não saiu):
```
npx eas build -p ios --profile preview
```
O perfil `preview` do `eas.json` está configurado com `ios.simulator: true` — gera um `.app` para o
Simulador do iOS, **sem precisar de nenhuma credencial Apple**. Bom para validar a build antes da
conta paga estar pronta.

### 3.3 Bundle ID
Já está fixo em `app.json`: `online.olliorcamentos.app` (mesmo valor do Android — não precisa ser
igual, mas mantivemos igual por simplicidade). Ele precisa ser registrado uma vez em
developer.apple.com → Certificates, IDs & Profiles → Identifiers (o `eas build` faz isso sozinho na
primeira vez, se você deixar o EAS gerenciar credenciais).

### 3.4 Sign in with Apple + botão de exclusão de conta
**Pré-requisitos de código** — ver seção 1, itens 1 e 2. Não avance para o envio (3.6) sem os dois.

### 3.5 EAS Submit → App Store Connect
```
npx eas submit -p ios --profile production
```
Duas formas de autenticar (escolha uma e complete em `eas.json` → `submit.production.ios`, hoje
deixado vazio de propósito — **não invente esses valores**, preencha só quando tiver a conta):
- **Apple ID + senha de app** (mais simples): `"appleId": "seu-email@dominio.com"` no `eas.json`, e
  a senha de app (gerada em appleid.apple.com → Segurança → Senhas de app) na variável de ambiente
  `EXPO_APPLE_APP_SPECIFIC_PASSWORD` (nunca no `eas.json` — variável de ambiente local, ou
  `CONFIG CLAUDE/credenciais-locais.env`).
- **App Store Connect API Key** (melhor para automação/CI): gerar em App Store Connect → Users and
  Access → Integrations → App Store Connect API, e preencher `ascApiKeyPath`/`ascApiKeyIssuerId`/
  `ascApiKeyId` no `eas.json`.

Também precisa do **`ascAppId`** (o "Apple ID" numérico do app dentro do App Store Connect —
aparece em App Information → General Information, só existe depois de criar o app lá pela primeira
vez em App Store Connect → Meus Apps → "+").

### 3.6 Conta de teste para o revisor da Apple
A Apple **exige** credenciais de um usuário de teste funcional em "App Review Information" (dentro
da versão em revisão, em App Store Connect) sempre que o app tem login. Criar uma conta dedicada
(ex.: `revisor-apple@olliorcamentos.online` + senha forte, guardada em
`CONFIG CLAUDE/credenciais-locais.env`) com uma organização de exemplo já povoada (alguns clientes,
serviços, um orçamento) para o revisor conseguir navegar sem ficar num app vazio. Não reutilize uma
conta real de cliente.

### 3.7 Privacy Nutrition Labels (App Privacy, dentro de App Store Connect)
Preencher em App Store Connect → App Privacy, usando a mesma base da seção 0. Mapeamento pelas
categorias da Apple:

| Categoria Apple | Coletado? | Vinculado à identidade do usuário? | Usado para rastreamento (tracking)? |
| --- | --- | --- | --- |
| Contact Info (nome, e-mail, telefone) | Sim | Sim | Não |
| User Content (fotos anexadas a orçamentos/equipamentos) | Sim | Sim | Não |
| Audio Data (ditado por voz / chat com IA) | Sim | Sim | Não |
| Location (Coarse ou Precise — "Equipe ao vivo") | Sim, só se a organização ativar equipe/localização | Sim | Não |
| Financial Info (status da assinatura Stripe) | Sim | Sim | Não |
| Usage Data (eventos internos de uso) | Hoje **não sai do aparelho** — declare como não coletado até Sentry/PostHog entrarem (bloqueios B7/B8) | — | Não |
| Identifiers | Não (nenhum ID de publicidade é lido) | — | Não |

"Usado para rastreamento entre apps/sites de terceiros" = **Não** em tudo — o OLLI não tem SDK de
ads nem compartilha dado com rede de anúncio. Isso evita o rótulo de "App Tracking Transparency"
(não precisa pedir permissão de rastreamento — ATT não se aplica).

**Justificativa das permissões nativas (Info.plist / usage strings)** — já estão escritas em
`app.json` (plugins `expo-image-picker`, `expo-audio`, `expo-speech-recognition`), confira que o
texto exibido ao usuário bate com o motivo real:
- `NSCameraUsageDescription`: "O app precisa de acesso à câmera para fotografar os serviços."
- `NSPhotoLibraryUsageDescription`: "O app precisa de acesso às fotos para adicionar imagens aos orçamentos."
- `NSMicrophoneUsageDescription`: "O OLLI usa o microfone para você ditar orçamentos e falar com a assistente."
- `NSSpeechRecognitionUsageDescription`: "O OLLI usa o reconhecimento de fala para montar orçamentos ditados."

### 3.8 Checklist final iOS
- [ ] Sign in with Apple implementado e testado (item 1, seção 1)
- [ ] Botão "Excluir minha conta" implementado e testado (item 2, seção 1)
- [ ] Decisão tomada sobre Stripe Checkout x In-App Purchase (item 3, seção 1)
- [ ] Conta Apple Developer ativa
- [ ] `eas build -p ios --profile production` gerou `.ipa` sem erro
- [ ] App criado em App Store Connect, `ascAppId` preenchido em `eas.json`
- [ ] Conta de teste com dados de exemplo cadastrada em App Review Information
- [ ] App Privacy preenchido (seção 3.7)
- [ ] Política de privacidade publicada e no ar
- [ ] `eas submit -p ios --profile production`

---

## 4. Sequência recomendada (pensando no dia 20)

1. **Agora** (o quanto antes, independe de código): abrir as contas Play Console e Apple Developer —
   são as duas coisas que só o dono pode fazer (pagamento com cartão/dados fiscais).
2. **Assim que a conta Play existir**: se for conta pessoal, subir a primeira build (`eas build -p
   android --profile preview` ou `production`) para o teste fechado — os 14 dias começam a contar
   só depois disso, então quanto antes começar, menos risco de atrasar o dia 20.
3. **Em paralelo, no código** (fora do escopo deste doc — abrir como tarefas separadas): Sign in
   with Apple, botão de excluir conta, decisão sobre Stripe x IAP no iOS.
4. **Assim que a conta Apple existir**: `eas build -p ios --profile production` (não depende dos
   itens de código estarem prontos para *compilar* — só para *passar na revisão*). Vale gerar a
   build cedo para testar no TestFlight enquanto o resto anda.
5. **Perto do dia 20**: preencher Data Safety (Android) e App Privacy (iOS) com as tabelas das
   seções 2.5 e 3.7, publicar a política de privacidade se ainda não estiver publicada, e enviar
   para revisão em ambas as lojas.

## 5. O que fica fora do escopo deste documento
- Implementação de Sign in with Apple, exclusão de conta e a decisão Stripe/IAP (seção 1) — são
  tarefas de código, não de configuração de loja.
- Correção do `applicationId`/`bundleIdentifier` ou do `extra.eas.projectId` em `app.json` — hoje
  `extra.eas.projectId` está com o valor placeholder `"olli-orcamentos"` (não é um UUID real de
  projeto EAS). Rodar `npx eas init` (ou a primeira `eas build`) resolve isso automaticamente,
  escrevendo o ID real de volta no `app.json` — mas como `app.json` não é um arquivo desta frente,
  quem rodar o primeiro build precisa confirmar que esse campo foi atualizado.
