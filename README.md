# OLLI Orçamentos

App para eletricistas e técnicos autônomos criarem **orçamentos profissionais no celular**: catálogo de serviços/produtos, clientes, agenda com lembretes, PDF com a marca do prestador, link de aprovação para o cliente, recibos e sincronização em nuvem.

## Stack

- Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript strict
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

## Build Android

O artefato canônico de loja é um **AAB gerado pelo EAS** com credenciais
remotas. A pasta `android/` é gerada e ignorada; um arquivo local dentro dela
não prova que o commit é reproduzível.

```bash
npx eas whoami
npx eas build -p android --profile production
# depois do canário interno validado:
npx eas submit -p android --profile production --latest
```

Para instalar diretamente em aparelho durante QA, gere o perfil `preview`, que
produz APK interno sem confundi-lo com o bundle de publicação:

```bash
npx eas build -p android --profile preview
```

Notas de Windows (aprendidas na prática):

- **Caminho curto obrigatório**: o CMake do `react-native-screens` estoura o limite de 250 caracteres em caminhos profundos. Clone/trabalhe em algo como `C:\olli`. Drive `subst` não resolve (o Node desfaz o disfarce via `realpath`) e a raiz do drive também não (o autolinking do Expo não encontra `package.json` na raiz).
- **Memória do Gradle local**: se for necessário diagnosticar um prebuild nativo,
  use 4 GB de heap/1,5 GB de Metaspace. A configuração definitiva da loja deve
  continuar derivada de `app.json`/config plugins, não de um `android/` solto.

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
  ideias-futuras/  Cofre versionado; não é roadmap ativo
```

## Qualidade

Revisão integrada atualizada em 2026-08-20: TypeScript, Expo Doctor 21/21,
testes de tenant/cobrança/IA/admin e builds separados da landing e do painel.
O `npm audit` ainda reporta avisos de alta severidade na cadeia de build
Expo/Metro; o único “fix” automático sugerido rebaixa a stack e não deve ser
aplicado com `--force`. O release só é aceito depois de preflight completo,
build EAS ligado ao commit e teste físico do artefato exato.
