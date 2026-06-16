# OLLI Orçamentos

Aplicativo Expo/React Native para criar orçamentos, recibos, catálogo de serviços/produtos, dados do negócio, PDF e backup em nuvem via Supabase.

## Stack

- Expo SDK 56 / React Native 0.85 / React 19
- TypeScript strict
- SQLite local via `expo-sqlite`
- Supabase Auth + tabela `backups` para sincronização manual em nuvem
- React Navigation, React Native Paper, Plus Jakarta Sans

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
```

Esses valores são públicos no bundle mobile/web. Nunca use `service_role`, chaves secretas ou senhas em variáveis `EXPO_PUBLIC_*`.

## Scripts

- `npm start`: abre o Expo.
- `npm run start:clear`: abre o Expo limpando cache do Metro.
- `npm run web`: roda a versão web.
- `npm run android`: build/run Android local.
- `npm run ios`: build/run iOS local.
- `npm run typecheck`: valida TypeScript.
- `npm run doctor`: roda o Expo Doctor.
- `npm run preflight`: roda TypeScript + Expo Doctor.
- `npm run qa:web`: com o web server já aberto, valida Home e fluxo inicial em desktop/mobile e salva screenshots em `qa-artifacts/`.

## Estrutura

```text
src/
  components/   Componentes visuais reutilizáveis
  database/     SQLite local, export/import e estatísticas
  navigation/   Stacks e tabs do app
  screens/      Telas principais
  services/     Supabase/Auth/backup
  steps/        Etapas do fluxo de novo orçamento
  theme/        Cores, tipografia e tema Paper
  types/        Tipos de domínio
  utils/        Máscaras, datas, moeda, PDF e IDs
supabase/
  migrations/   Migrações SQL do projeto remoto
docs/
  SUPABASE.md   Estado do backend, policies e checklist
```

## Preflight atual

Em 2026-06-15:

- `npm run typecheck`: passou.
- `npx expo-doctor`: 21/21 checks passaram.
- `npm run qa:web`: passou em desktop 1280x720 e mobile 390x844.
- Supabase: advisors acionáveis de RLS/function corrigidos por migration.

O `npm audit` ainda reporta avisos moderados herdados do toolchain Expo/config plugins. O fix automático sugerido pelo npm é incompatível com o SDK 56, então não foi aplicado.
