# Code map

This map organizes the codebase by responsibility. It is intentionally documentary: many imports are relative, so moving source files should be a separate refactor with verification.

## Entry and build

- `index.ts`: registers the Expo app.
- `App.tsx`: loads fonts/splash, initializes SQLite, onboarding and sync flow.
- `package.json`: npm scripts and dependencies.
- `app.json`: Expo/app-store metadata and runtime asset references.
- `metro.config.js`, `tsconfig.json`, `eas.json`: build/type/build-service configuration.

Do not move these without updating the corresponding build or Expo references.

## App shell

- `src/navigation/AppNavigator.tsx`: tabs, stacks, route types and screen registration.
- `src/navigation/safeBack.ts`: safe back-navigation helper.
- `src/theme`: colors, typography and React Native Paper theme.
- `src/components`: reusable UI primitives such as buttons, cards, inputs, headers, badges and logo/mascot components.

## Screens

- `src/screens/HomeScreen.tsx`: operational home/cockpit.
- `src/screens/HojeScreen.tsx`: day view and priorities.
- `src/screens/NovoOrcamentoScreen.tsx`: quote creation/editing shell.
- `src/screens/VisualizarOrcamentoScreen.tsx`: quote view, PDF, WhatsApp and public link actions.
- `src/screens/OrcamentosScreen.tsx`: quote list and filtering.
- `src/screens/ClientesScreen.tsx`: customer CRM.
- `src/screens/AgendaScreen.tsx`: appointments.
- `src/screens/ContaScreen.tsx` and `src/screens/EntrarScreen.tsx`: account/auth flows.
- `src/screens/OlliVozScreen.tsx`, `OlliChatScreen.tsx`, `DiagnosticoIAScreen.tsx`, `CodigosErroScreen.tsx`: AI and technical diagnosis.
- `src/screens/ServicosScreen.tsx`, `ProdutosScreen.tsx`, `MeuNegocioScreen.tsx`, `EmitirReciboScreen.tsx`, `PlanosScreen.tsx`, `OnboardingScreen.tsx`: catalog, business setup, receipts, plans and first-run flow.
- `src/screens/CatalogoScreen.tsx`: present in source; verify whether it should be routed or kept as dormant/historical.

## Quote wizard

- `src/steps/Step1Cliente.tsx`: customer data.
- `src/steps/Step2Itens.tsx`: services/products/items.
- `src/steps/Step3Detalhes.tsx`: payment, schedule and contractual details.
- `src/steps/Step4Personalizacao.tsx`: visual/document personalization.

## Persistence and sync

- `src/database/database.ts`: SQLite schema, CRUD, backup/restore, counters, stats and local mirrors.
- `src/services/cloudSync.ts`: Supabase table sync and conflict/timestamp logic.
- `src/services/backup.ts`: backup helpers.
- `src/services/supabase.ts`: Supabase client and auth helpers.
- `src/services/agenda.ts`: agenda service.

Large-file note: `database.ts` and `cloudSync.ts` are important hubs. Refactor only with tests/typecheck.

## External services and AI

- `src/services/clienteLink.ts`: public quote link publishing and status helpers.
- `src/services/olliAssistente.ts`: worker-backed quote/chat assistance.
- `src/services/olliIA.ts`: diagnostic AI/fallback logic.
- `src/services/cep.ts`: CEP lookup.
- `src/services/analytics.ts`: analytics helpers.

## Utilities

- `src/utils/pdfGenerator.ts`: quote PDF generation.
- `src/utils/exportarDocumento.ts`: export/share flow.
- `src/utils/html.ts`: HTML escaping/helpers.
- `src/utils/imagemDataUri.ts`: image conversion.
- `src/utils/currency.ts`, `date.ts`, `masks.ts`, `id.ts`, `mensagensOrcamento.ts`: formatting and pure helpers.

## Worker

- `worker/src/index.js`: routes requests and wires AI/link/admin features.
- `worker/src/link.js`: public client quote page and response flow.
- `worker/src/admin.js`: admin dashboard and user/admin operations.
- `worker/wrangler.jsonc`: Cloudflare Worker config. Keep secrets in Cloudflare, not in source.

## Scripts

- `scripts/qa-web.mjs`: Playwright QA flow; writes to `qa-artifacts`.
- `scripts/iphone-lab.mjs`: starts Expo Web and an iPhone Lab shell; reads `preview/iphone-lab.html`.
- `scripts/fix-cf-assets.mjs`: post-export Cloudflare asset-path fix.

## Known future cleanup candidates

- Repeated mapper logic appears across `database.ts`, `cloudSync.ts` and `agenda.ts`.
- `ProdutosScreen.tsx` and `ServicosScreen.tsx` have mirrored structure.
- `NovoOrcamentoScreen.tsx` and `OlliVozScreen.tsx` share quote-building/payment logic.
- Worker HTML/currency helpers duplicate some app-side helper concerns.
- `ContaScreen.tsx` and `EntrarScreen.tsx` overlap in auth behavior; document the UX distinction before refactoring.
