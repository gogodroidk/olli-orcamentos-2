---
name: project-olli-build-status
description: Status do build do app OLLI Orçamentos - o que foi criado e o que falta
metadata: 
  node_type: memory
  type: project
  originSessionId: b38e5d95-9e9b-4e00-9db5-2d7962cbad70
---

# Status do Build — OLLI Orçamentos

App React Native Expo, pronto para rodar via Expo Go no Samsung S24.

**Why:** Igor quer usar no dia a dia para criar orçamentos profissionais.
**How to apply:** Quando continuar o desenvolvimento, conferir esta lista antes de começar.

## V2 — REBUILD DE QUALIDADE (2026-06-10)

Reescrita completa focada em corrigir bugs críticos e elevar o visual a nível de produto comercial. Feita inline no Opus 4.8.

**Bugs críticos corrigidos:**
- **Teclado fechava a cada letra** → causa: componentes `Field` definidos DENTRO do render (recriados a cada keystroke). Solução: criado `src/components/OlliInput.tsx` (memoizado, nível de módulo) usado em TODAS as telas de formulário.
- **Desconto não funcionava** → handlers vazios `() => {}` + prop do Step2 só aceitava itens. Solução: Step2 agora recebe `onChangeItens` + `onChangeOrc`.
- **Preço "12,50" virava 12** → `parseCurrency` reescrito em `src/utils/currency.ts` trata vírgula/ponto BR. Novo `OlliMoneyInput` com máscara de centavos.
- **Fotos/logo sumiam no PDF** → URIs file:// não renderizam no expo-print. Solução: `populateImages()` converte tudo para base64 antes de montar o HTML. Adicionada seção de fotos e logo no cabeçalho. Emojis removidos (viravam tofu).

**Novos componentes:** OlliInput, OlliMoneyInput, GradientHeader, AnimatedEntrance, OlliButton (turbinado com haptics+gradiente). `src/utils/masks.ts` (telefone, CPF, CNPJ, CEP, data, moeda, validação CPF).

**Visual premium:** splash animado, HomeScreen com hero gradiente + gráfico de faturamento (gifted-charts) + saudação por hora, FABs com gradiente, animações de entrada em cascata, haptics. Headers em gradiente (expo-linear-gradient) com safe-area em todas as telas. App.tsx com SafeAreaProvider.

**Libs adicionadas:** expo-linear-gradient, expo-haptics (ambas exigem rebuild nativo).

TypeScript: 0 erros. Todas as telas de formulário migradas para OlliInput.

## CONCLUÍDO ✅ (V1 base)

### Foundation
- `src/theme/index.ts` — design system GR Tech (azul #1565C0)
- `src/types/index.ts` — todos os TypeScript interfaces
- `src/database/database.ts` — SQLite offline-first, dados pré-populados
- `src/utils/currency.ts`, `date.ts`, `id.ts`
- `src/utils/pdfGenerator.ts` — HTML template completo para expo-print
- `App.tsx` — entry point com PaperProvider + NavigationContainer
- `app.json` — configurado para OLLI Orçamentos, Android package com.grtech.olliorcamentos

### Navigation
- `src/navigation/AppNavigator.tsx` — bottom tabs (Início/Orçamentos/Catálogo/Meu Negócio) + native-stack

### Components
- `src/components/OlliButton.tsx`
- `src/components/OlliCard.tsx`
- `src/components/StatusBadge.tsx`
- `src/components/StepIndicator.tsx`
- `src/components/EmptyState.tsx`

### Screens
- `HomeScreen.tsx` — dashboard com stats, quick actions, recentes
- `OrcamentosScreen.tsx` — lista com filtros, busca, clone, delete
- `NovoOrcamentoScreen.tsx` — wizard container 4 steps
- `VisualizarOrcamentoScreen.tsx` — ver/compartilhar PDF + WhatsApp + status
- `CatalogoScreen.tsx` — menu navegação catálogo
- `ClientesScreen.tsx` — CRUD completo
- `ServicosScreen.tsx` — CRUD com margem de lucro
- `ProdutosScreen.tsx` — CRUD com margem de lucro
- `EmitirReciboScreen.tsx` — recibo PDF
- `MeuNegocioScreen.tsx` — config empresa + depoimentos

### Steps do Wizard
- `src/steps/Step1Cliente.tsx` — busca cliente + autocomplete + novo cliente
- `src/steps/Step2Itens.tsx` — adicionar serviços/produtos do catálogo ou manual
- `src/steps/Step3Detalhes.tsx` — datas, pagamento, condições, garantia
- `src/steps/Step4Personalizacao.tsx` — assinatura, aprovação, fotos

## PENDENTE para V2

- Assinatura digital com toque na tela (react-native-signature-canvas) — Step4 tem placeholder
- Dashboard financeiro com gráficos (react-native-gifted-charts)
- Modo clone de orçamento com novo número sequencial
- Firebase sync para link web de aprovação
- Push notifications para lembretes de validade
- APK definitivo via EAS Build

## Como rodar (dev)

```
cd "C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS\olli-orcamentos"
npx expo start
```

Escanear QR com Expo Go no Samsung S24.
TypeScript: 0 erros confirmado.

## Build APK local (FUNCIONOU — 2026-06-10)

APK final: `Desktop\OLLI ORCAMENTOS\OLLI-Orcamentos-v1.0.apk` (35,8 MB, arm64-v8a)

Ambiente:
- JAVA_HOME = `C:\Program Files\Android\Android Studio\jbr` (JDK 21 do Android Studio — o Adoptium instalado é JDK 25, NÃO usar, incompatível)
- ANDROID_HOME = `%LOCALAPPDATA%\Android\Sdk`

Ajustes que foram necessários:
1. `app.json`: adaptiveIcon aponta para `android-icon-foreground/background/monochrome.png` (não existe adaptive-icon.png)
2. `android/gradle/wrapper/gradle-wrapper.properties`: Gradle **8.13** (o prebuild gera 9.3.1 que quebra com "JvmVendorSpec IBM_SEMERU"; AGP exige mínimo 8.13)
3. `android/gradle.properties`: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m` (default 2048m/512m dá OutOfMemoryError: Metaspace)
4. `android/gradle.properties`: `reactNativeArchitectures=arm64-v8a` (só S24, build 2x mais rápido)
5. Comando: `.\gradlew assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease`

ATENÇÃO: `npx expo prebuild --clean` REGENERA a pasta android e desfaz os ajustes 2-4. Reaplicar após cada prebuild.

### CAUSA-RAIZ REAL dos "Unable to delete" = MAX_PATH (260 chars) do Windows (descoberto 2026-06-10)
Os erros recorrentes "Unable to delete directory ... node_modules\expo\android\build\.transforms\..." NÃO eram Defender nem lock de processo — eram o **limite de 260 caracteres de caminho do Windows**. As pastas de cache do Gradle (`.transforms\<hash>\transformed\bundleLibRuntimeToDirRelease\..._dex\expo\modules\fetch`) ficam fundas demais; somadas ao caminho base longo `C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS\olli-orcamentos\` (com ESPAÇO), estouram MAX_PATH. O Windows consegue CRIAR mas não APAGAR esses caminhos.
**Como contornar sem mover o projeto:** apagar as pastas de build com o prefixo `\\?\` que ignora o limite: `cmd /c rmdir /s /q "\\?\<caminho completo>"`. Depois buildar do ZERO (build limpo só CRIA, não precisa apagar pasta longa pré-existente). Sequência que FUNCIONOU:
1. `cmd /c rmdir /s /q "\\?\...\android\app\build"` + `\android\build` + `\node_modules\expo\android\build` + `\node_modules\expo-modules-core\android\build`
2. matar java
3. `.\gradlew assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease --no-daemon`
**Fix DEFINITIVO (se voltar a travar):** mover o projeto para caminho curto tipo `C:\olli` — encurta ~46 chars e os caminhos de cache ficam folgados. Defender exclusão/desligar AJUDA (build foi de 10 p/ 81 tarefas) mas não resolve sozinho o MAX_PATH.
gradle.properties: parallel=false, daemon=false ajudam.

### APK v3 (nova identidade visual + correções dos agentes) = `Desktop\OLLI ORCAMENTOS\OLLI-Orcamentos-v3.apk` (37,7 MB)

### Travamento "Unable to delete directory" no rebuild (resolvido 2026-06-10)
Sintoma: `mergeReleaseResources`/`merged.dir` falha com "Failed to delete some children". Causa: daemon Gradle (java.exe) preso de build anterior segurando a pasta `app/build`, OU um `cmd.exe` aberto com cwd na pasta android. `gradlew --stop` NEM sempre mata o daemon.
Solução que funcionou:
1. `Stop-Process` no java.exe preso (achar com `Get-Process java`)
2. `Remove-Item android\app\build -Recurse -Force` (apagar pasta inteira)
3. Rebuild com **`--no-daemon`** (não deixa daemon preso depois)
NÃO usar `cmd /c "set X && gradlew.bat"` via Bash — o cmd fica vivo travando a pasta. Usar PowerShell com `$env:` direto.

### APK v2 (com todas as melhorias) — 36,3 MB
`C:\Users\ADMIN\Desktop\OLLI ORCAMENTOS\OLLI-Orcamentos-v2.apk`
