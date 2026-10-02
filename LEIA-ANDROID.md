# OLLI Orçamentos — Android e Google Play

Fonte operacional atual para gerar e publicar o aplicativo Android. Atualizado em 02/10/2026.

## Estado atual

- **Stack:** Expo SDK 57 / React Native 0.86 (Hermes, New Architecture) / React 19.2.
- **Nome:** OLLI Orçamentos.
- **Pacote:** `online.olliorcamentos.app`.
- **Versão no `app.json` desta base:** `1.1.8`, `android.versionCode` `23`. A próxima release é a
  **1.2.0 (`versionCode` 24)**: leva as correções de conformidade e a assinatura pelo Google Play
  Billing direto (veja "Cobrança no Android").
- **Faixas na Play (conferido por API em 02/10/2026):** teste fechado (alpha) com a 1.1.8 (23);
  **produção ainda aponta para a 1.1.2 (18), antiga: nunca envie a 18 para revisão** — a próxima
  versão de produção tem de ser a 24 ou maior.
- **Target/compile SDK:** 36 (exigência da Play para apps novos e atualizações desde 31/08/2026,
  com prorrogação possível até 01/11/2026). Edge-to-edge sempre ligado.
- **Tamanho de página de 16 KB:** a 1.1.8 passa; a 1.2.0 traz o MapLibre e precisa ser conferida
  de novo (veja "Verificar o artefato").
- **Conta de desenvolvedor:** de **organização** (OLLI INTELIGENCIA DIGITAL SISTEMAS LTDA). Ela
  **não** tem a exigência de 12 testadores por 14 dias das contas pessoais.
- **Política de privacidade:** https://olliorcamentos.online/legal/privacidade/
- **Exclusão de conta (URL da Play):** https://olliorcamentos.online/excluir-conta/ (e dentro do app,
  em Conta → Excluir minha conta).
- **Relatório histórico de release:** `docs/RELEASE_ANDROID_2026-08-20.md` (proveniência do code 15).

## Cobrança no Android

- O Android da Play **não oferece compra por fora**: nada de Pix, Stripe, cartão pela web, 12x, link
  para planos no site ou "assine pelo site" em tela, ajuda, lembrete, e-mail ou página aberta pelo
  app. O teste `scripts/teste-roteamento-pagamento.ts` falha se algum texto do Android citar isso.
- A assinatura Pro e Empresa no Android é feita e gerenciada pela **Google Play** (Play Billing
  direto com `expo-iap`; o servidor valida a compra com a Play Developer API e recebe os avisos pelo
  Pub/Sub). Quem assina pela web continua com o plano no Android, mas o Android não mostra preço
  nem link da web.
- **Kill switch do servidor:** a venda só aparece quando o worker responde `GET /play/config` com
  `ligado: true` (variável `PLAY_BILLING_MODE=on`). Desligada, a tela diz que a assinatura está
  indisponível. Nunca existe modo demonstração.
- Detalhes, IDs do catálogo e passos de ativação: `docs/GOOGLE_PLAY_BILLING.md`.

## Caminho canônico: build local em `C:\OLLI_REL`

O build de loja é gerado na máquina do dono (a assinatura usa a chave de upload local; o Gradle assina
o AAB). A pasta `android/` é gerada pelo prebuild e não é versionada.

```powershell
cd C:\OLLI_REL
npm ci
npx expo prebuild -p android --clean --no-install
.\scripts\build-android-production.ps1
```

O script `scripts\build-android-production.ps1`:

- carrega o cofre local de credenciais (`credenciais-locais.env`, só no processo; nada vai para disco);
- exige as variáveis `OLLI_UPLOAD_KEYSTORE_*` e `SENTRY_AUTH_TOKEN` e confere a chave de upload
  (SHA-1 `44:93:1D:96:77:A6:24:40:26:F3:87:2B:AC:71:AC:91:38:88:20:1E`);
- remove qualquer `SENTRY_DISABLE_AUTO_UPLOAD` herdado, para o resultado nunca passar sem source maps;
- gera o `app-release.aab` assinado e confere a assinatura com `jarsigner`.

Observações do Windows (veja a memória de build do projeto): o caminho curto `C:\OLLI_REL` é
obrigatório (limite de caminho do Windows), e o build precisa de `org.gradle.jvmargs` maior e de
`lint { checkReleaseBuilds false }` aplicados ao `android/` depois do prebuild. As variáveis
`EXPO_PUBLIC_*` do build entram pelo `.env.local` (o build local **não** lê o `env` do `eas.json`).

O `versionCode` é o do `app.json` no build local (`appVersionSource: "remote"` do `eas.json` só vale
no EAS). Antes de gerar, confirme na Play que o número ainda não foi usado.

## Verificar o artefato antes de enviar

1. Manifesto com `versionCode` e `versionName` esperados, `targetSdk` 36 e **sem** permissões
   proibidas (localização, `READ_MEDIA_*`, `SYSTEM_ALERT_WINDOW`, `AD_ID`).
2. Assinatura com o SHA-1 da chave de upload acima.
3. Alinhamento de 16 KB de todos os `.so` (principalmente os do MapLibre) e, no Console, o App
   bundle explorer em "Tamanho de página da memória: compatível com 16 KB".
4. Instalação limpa em aparelho físico (ou emulador Android 35/36): login com a conta de revisão,
   sair e entrar de novo, relógio do aparelho adiantado, tela do mapa, Ajuda e Planos sem Stripe nem
   Pix, `logcat` sem `FATAL`.

## Envio para a Play

Subir por API só funciona nas faixas de **teste** (a conta de serviço de automação não publica em
produção). A sequência segura é:

1. gerar o AAB e conferir o artefato;
2. enviar à faixa de teste fechado (alpha) e acompanhar o relatório de pré-lançamento e o Android
   vitals;
3. testar a compra com as contas de **teste de licença** (a assinatura direta exige isso);
4. criar a release de **produção** pelo Console, substituindo a 18, com lançamento gradual;
5. enviar para revisão **junto** das declarações do Console (Acesso ao app, Segurança dos dados,
   Conteúdo do app) já atualizadas — veja `docs/LOJAS.md`, seções 0 e 2.5.

A faixa `internal` serve só para conferência rápida do artefato.

## EAS Build (alternativa)

Existe um perfil `production` em `eas.json` (AAB, credencial remota, `autoIncrement`), mas o contador
remoto de `versionCode` está atrás da Play (a Play já tem 23). Se for usar o EAS, ajuste o contador
remoto **antes** do build (`eas build:version:set`), confira o SHA-1 com `eas credentials -p android`
e garanta `SENTRY_AUTH_TOKEN` como secret sensível do ambiente `production`. O build na nuvem não lê o
`.env.local`: registre as `EXPO_PUBLIC_*` necessárias no EAS (veja `docs/LOJAS.md`, seção 1.5).

Nunca salve a chave da Play, a keystore, as senhas ou o token do Sentry no Git.

## Android Studio (depuração)

Use apenas para depurar o projeto nativo:

```powershell
npm ci
npx expo prebuild -p android --clean
```

Abra a subpasta `android/` no Android Studio. Para um artefato de loja, use o caminho canônico acima.
