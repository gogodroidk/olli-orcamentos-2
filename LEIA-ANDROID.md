# OLLI Orçamentos — App Android (Play Store)

App **Expo / React Native** (SDK 56). A pasta `android/` **NÃO está versionada** — ela é 100% gerada
pelo Expo. Você precisa gerá-la com `npx expo prebuild -p android` antes de abrir no Android Studio
(ver Opção A, passo 2). O R8/ProGuard + shrinkResources já vêm ligados via `expo-build-properties`
no `app.json` (sobrevive ao prebuild).

- **Nome:** OLLI Orçamentos
- **Pacote (applicationId):** `online.olliorcamentos.app`
- **Versão:** ver `app.json` (`version` + `android.versionCode`) — hoje 1.1.0 / versionCode 9
- **Política de privacidade (a Play Store exige):** https://olliorcamentos.online/privacidade
- **Site / app:** https://olliorcamentos.online · https://app.olliorcamentos.online

---

## ⚠️ Importante (leia antes)
Este projeto **não é um app nativo puro** — ele é Expo/React Native. O Android Studio **consegue** compilar, mas só **depois** de instalar as dependências (`npm install`). Sem isso, o Gradle falha.

> **Jeito mais fácil (recomendado, SEM Android Studio):** veja a seção **"Opção B — EAS Build"** no fim. Gera o arquivo `.aab` pra Play Store com 1 comando, na nuvem. É bem mais simples que o Android Studio.

---

## Opção A — Compilar no Android Studio

### 1. Pré-requisitos (instale uma vez)
- **Node.js 20+** → https://nodejs.org
- **Android Studio** (já vem com o Android SDK + JDK) → https://developer.android.com/studio

### 2. Preparar o projeto
Abra um terminal **nesta pasta** (`olli-orcamentos`) e rode:
```
npm install
npx expo prebuild -p android    # GERA a pasta android/ (ela não vem no repo)
```
(baixa as dependências e cria a parte nativa — demora alguns minutos)

### 3. Abrir no Android Studio
- Android Studio → **Open** → selecione a subpasta **`android`** (agora ela existe; não a pasta de cima).
- Espere o **Gradle Sync** terminar (pode baixar componentes na 1ª vez).

### 4. Gerar o app assinado (.aab) pra Play Store
- Menu **Build → Generate Signed App Bundle / APK… → Android App Bundle**.
- Crie um **keystore** novo (guarde bem a senha — é a sua "chave de assinatura", você vai precisar dela sempre).
- Escolha **release** → **Finish**. O `.aab` sai em `android/app/build/outputs/bundle/release/`.

### 5. Publicar
- Play Console (https://play.google.com/console, conta de dev ~US$ 25 única vez) → criar o app → enviar o **.aab** → preencher ficha, classificação, e **colar a política de privacidade**: `https://olliorcamentos.online/privacidade`.

---

## Opção B — EAS Build (recomendado, mais fácil)
Não precisa de Android Studio. No terminal, nesta pasta:
```
npm install
npm install -g eas-cli
eas login            # cria/usa uma conta Expo grátis
eas build -p android --profile production
```
No fim ele te dá um link pra **baixar o `.aab`** (a Expo cuida da assinatura). Aí é só subir na Play Console (passo 5 acima).

> Dica: dá pra rodar a Opção B do próprio navegador/celular depois — a build acontece na nuvem da Expo.

---

## Atualizar versão (nas próximas publicações)
No arquivo **`app.json`**, aumente `version` (ex.: 1.0.1) e `android.versionCode` (ex.: 3), depois recompile.

## Observações técnicas
- Os dados públicos do Supabase (URL + chave anônima) já vêm embutidos (`.env.local`). A chave da IA fica só no servidor (Worker), nunca no app.
- O diagnóstico de 602 códigos funciona **offline**. Voz/Chat/IA pedem login (protege a cota).
- Se mudar algo no código e quiser regerar a parte nativa: `npx expo prebuild -p android --clean`.

Qualquer dúvida, me chama. 🚀
