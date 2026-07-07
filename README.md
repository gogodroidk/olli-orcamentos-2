# OLLI Orçamentos

App para eletricistas e técnicos autônomos criarem **orçamentos profissionais no celular**: catálogo de serviços/produtos, clientes, agenda com lembretes, PDF com a marca do prestador, link de aprovação para o cliente, recibos e sincronização em nuvem.

## Stack

- Expo SDK 56 / React Native 0.85 / React 19 / TypeScript strict
- SQLite local via `expo-sqlite` (offline-first)
- Supabase Auth + sincronização per-row com guarda de timestamp e tombstones
- Cloudflare Workers: link público de aprovação do cliente (`worker/src/link.js`), painel admin (`worker/src/admin.js`) e diagnóstico por IA (`worker/src/index.js`)
- Notificações locais (lembretes de visita) via `expo-notifications`
- React Navigation, React Native Paper, Plus Jakarta Sans + Spectral

## Primeiros passos

```bash
npm install
copy .env.example .env.local
npm run preflight
npm run web
```

No `.env.local`, preencha:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_LINK_BASE_URL=      # domínio do worker de link (opcional)
EXPO_PUBLIC_DIAGNOSTICO_URL=    # worker de diagnóstico IA (opcional)
EXPO_PUBLIC_WHATSAPP_SUPORTE=   # WhatsApp de vendas/planos (opcional)
```

Esses valores são públicos no bundle mobile/web. Nunca use `service_role`, chaves secretas ou senhas em variáveis `EXPO_PUBLIC_*` — segredos de IA vivem como secrets do Worker.

## Build Android (APK)

```bash
npx expo prebuild -p android
cd android && gradlew assembleRelease
# APK em android/app/build/outputs/apk/release/app-release.apk
```

Notas de Windows (aprendidas na prática):

- **Caminho curto obrigatório**: o CMake do `react-native-screens` estoura o limite de 250 caracteres em caminhos profundos. Clone/trabalhe em algo como `C:\olli`. Drive `subst` não resolve (o Node desfaz o disfarce via `realpath`) e a raiz do drive também não (o autolinking do Expo não encontra `package.json` na raiz).
- **Memória do Gradle**: o template padrão (512 MB de Metaspace) derruba o lint das bibliotecas com `OutOfMemoryError`. O `android/gradle.properties` precisa de `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1536m`, e o lint de release pode ficar desligado no `app/build.gradle` (`lint { checkReleaseBuilds false }`).

## Build iOS

Projeto pronto para EAS Build (ícone sem canal alpha, `buildNumber`, permissões PT-BR, sem permissão de microfone desnecessária). Requer conta Apple Developer:

```bash
npx eas build -p ios --profile production
```

## Scripts

- `npm start` / `npm run start:clear`: abre o Expo (com/sem cache do Metro).
- `npm run web`: roda a versão web.
- `npm run android` / `npm run ios`: build/run local.
- `npm run typecheck`: valida TypeScript.
- `npm run doctor` / `npm run preflight`: Expo Doctor (+ TypeScript).
- `npm run qa:web`: com o web server aberto (porta 8082), valida Home e fluxo inicial em desktop/mobile e salva screenshots em `qa-artifacts/` (fora do git).

## Estrutura

```text
src/
  components/   Componentes visuais reutilizáveis (Olli*)
  database/     SQLite local, export/import, limpeza segura e estatísticas
  navigation/   Stacks e tabs do app
  screens/      Telas principais
  services/     Supabase, sync per-row, agenda/lembretes, CEP, IA, chaves de storage
  steps/        Etapas do fluxo de novo orçamento (wizard 4 passos)
  theme/        Cores, tipografia e tema Paper
  types/        Tipos de domínio
  utils/        Máscaras, datas, moeda, PDF e IDs
worker/
  src/          Cloudflare Workers: link do cliente, admin e diagnóstico IA
supabase/
  migrations/   Migrações SQL do projeto remoto
docs/
  SUPABASE.md   Estado do backend, policies e checklist
```

## Qualidade

Rodada completa de revisão multi-agente em 2026-07-07 (tela por tela + sync + UX + marketing + prontidão de loja): typecheck limpo, `qa:web` passando em desktop e mobile, APK de release compilando. O `npm audit` ainda reporta avisos moderados herdados do toolchain Expo; o fix automático é incompatível com o SDK 56 e não foi aplicado.
