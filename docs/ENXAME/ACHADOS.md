# ACHADOS — backlog vivo do enxame (Onda 1)

> Ledger acionável. Cada item: `[status] descrição — arquivo:linha — abordagem`.
> status: `[ ]` aberto · `[~]` em onda · `[x]` feito+verificado · `[BLOQ]` humano · `[?]` re-verificar.
> Fonte: Onda 1 (6 agentes, 2026-07-17). Gate verde é pré-requisito de qualquer `[x]`.

## P0 — confiança / dinheiro / correção (ataca primeiro)

### App (Expo, src/)
- [x] **Gate de teste quebrado** — `scripts/teste-webhook-events.ts:34` usava `SUPABASE_SERVICE_ROLE` (runtime lê `SUPABASE_SERVICE_ROLE_KEY`). Corrigido; `npm test` exit 0.
- [x] **Gate de typecheck quebrado** — `tsconfig.json` raiz não excluía `web/`. Corrigido; `npm run typecheck` exit 0.
- [x] **Skeleton infinito na Home** (Onda 2) — `HomeScreen.tsx` `load()` ganhou try/catch/finally + estado `carregandoErro`; `loadRadar` distingue erro; `refresh()` try/finally; UI com 3º ramo erro+retry; StarterCard guardado. typecheck exit 0.
- [x] **"Erro vira vazio" sistêmico** (Onda 2+3) — 3 estados+retry aplicados, reusando o padrão da HomeScreen. Feitos: HomeScreen (O2), TecnicoHome, Lixeira m+d, Creditos-pacotes, Equipamento m+d (+busca cliente), Ordens m+d + PainelNovaOS, EmitirRecibo, Hoje, VisualizarOrcamento (trilha do link), InicioDesktop, PMOC m+d. typecheck+test exit 0. ✅ **Fechado 100%** (Onda 8, G1): AgendaScreen, ContaScreen (+ achou o backup "erro vira vazio" de brinde), Step4Personalizacao, CodigosErro. Raiz "erro vira vazio" do app inteiro coberta.
- [x] **PlanosScreen sem catch** (Onda 3, A3) — `carregarPlano()` ganhou catch + estado de erro visível.
- [x] **CreditosScreen inconsistente** (Onda 3, A3) — pacotes de recarga Pix agora fazem 3 estados+retry (saldo intacto).
- [x] **PMOC fallback diverge mobile/desktop** (Onda 3, A8) — shape unificado: ambos os campos (`periodicidades` contagem + `periodicidadeLabels` rótulos) presentes nos dois lados; corrigido no arquivo certo (`PmocPlanosScreen` plural, não singular).

### Segurança
- [x] **XSS no PDF do orçamento** (Onda 2) — os campos de texto JÁ eram escapados (commit c73d866). Buraco real: o helper `img()` devolvia data URI **crua** (o recibo escapa logoData/assinaturaData). Fix: `escapeHtml` dentro de `img()` (`src/utils/pdfGenerator.ts`) — no-op p/ base64 legítimo, mata URI adulterada. typecheck exit 0.
- [x] **Worker teto de payload / rate-limit** (Onda 4, B1) — stripe webhook + infra já existiam (O2-18). Adicionado: teto no **MP webhook** (128KB, 2 camadas) + pre-check Content-Length no `/transcrever` + **rate-limit por IP só no /transcrever** (fail-open; NÃO em webhooks — derrubaria evento de pagamento). Novo binding `TRANSCREVER_RL` → precisa `wrangler deploy` (humano, ver BLOQUEIOS). node --check + 8 testes verdes. **Resta:** `/transcrever` ainda valida cota de IA só no client (worker não checa plano/cota) — item maior, pendente. **Novo:** `abacate.js` webhook sem teto (AbacatePay fora de produção — baixo).

### Painel (webapp/)
- [x] **Links de filtro KPI mortos** (Onda 2) — `OrcamentosPage` agora lê `?status=` (useSearchParams v7), valida contra os slugs reais num `Set`, aplica até o dono mexer no dropdown. Slugs batem 1:1 (sem normalização). ⚠️ não typechecado local (webapp sem node_modules) — CI cobre.

### Landing (web/)
- [x] **FAQ mente e vira JSON-LD pro Google** (Onda 2) — `index.astro` reescrito p/ a verdade ("roda no navegador do celular e do computador... app Android a caminho das lojas"); propaga automático pro FAQPage (schema deriva do array `faq`).
- [ ] **Ajuda promete offline+voz ausentes no painel** — `web/src/pages/ajuda/index.astro` (via `src/content/ajuda/index.ts`) — recursos do app Expo não publicado, ausentes do painel pra onde o CTA manda. Abordagem: adaptar copy da ajuda web ao que o painel realmente faz.
- [x] **404 sem noindex + CTA errado** (Onda 2) — prop `noindex` no `Layout.astro`; `404.astro` usa `noindex={true}` + CTA agora `APP_CADASTRO_URL` (CC-01).

## P1 — coerência / UX / venda
- [x] **Feature paga invisível: EquipeAoVivoScreen** (Onda 2) — botão "Equipe ao vivo no mapa" adicionado em `EquipeScreen.tsx` (card) e `EquipeDesktopScreen.tsx` (header); navega p/ a rota (GateEquipe interno trata não-Empresa). Copy "(em breve)" removida de `PlanosScreen.tsx`. typecheck exit 0. ⚠️ falta clicar no botão em runtime (QC visual — Onda de screenshots).
- [ ] **NOVO (Onda 2): benefício órfão `dashboard_empresa`** — "Painel de gestão e metas da equipe" era anunciado como benefício mas **não existe tela nenhuma** (entitlement `dashboard_empresa` só aparece na tabela + texto do GatePro, sem implementação). c2 REMOVEU a linha de `PlanosScreen` (não dá pra vender o que não existe). **Decisão do dono:** construir a tela OU manter removido. Se construir, precisa regatear a entitlement. → também em BLOQUEIOS.
- [x] **Diagnóstico IA sem gate de vertical** (Onda 4, B3) — novo `webapp/src/olli/verticais.ts` (espelha o app); gate no menu + na rota `/diagnostico`, só HVAC vê; sem ofício = vê tudo (backward-compat), 3 estados (nunca esconde por "não sei"). webapp typecheck exit 0.
- [ ] **Equipe no painel é só leitura** — trocar papel/desativar/remover exige o app celular (honesto no ConvidarDialog, mas lacuna pra quem só usa web). Abordagem: decidir se traz CRUD de papel ao painel (produto).
- [x] **Sem onboarding guiado no painel** (Onda 5, C3) — bloco "Primeiros passos" no `/inicio` (novo `PrimeirosPassosCard.tsx`), 3 CTAs (orçamento/cliente/empresa), só p/ conta nova (zero orçamentos E zero clientes), 3 estados (nunca durante carregando/erro). webapp tsc exit 0.
- [x] **Nav da Home não linka #oficios** (Onda 5, C2) — item "Seu ofício" no header, âncora `#oficios`.
- [x] **reduced-motion** (Onda 4, B4) — 3 dos 4 já respeitavam (`useReducedMotion` em `theme/motion.ts`); faltava só o container do wizard `NovoOrcamentoScreen` — corrigido (pula animação, aplica estado final).
- [x] **NovoOrcamentoScreen usa window.alert/confirm cru** (Onda 5, C4) — trocado por `avisar`/`confirmar` (dialogo temático `DialogoDesktopHost`, montado no App.tsx).
- [x] **Notificação: deep-link morto + vazamento** (Onda 5, C5) — cold-start navega (fila no `onReady`); "sair e manter dados" cancela lembretes antes do signOut (parava de vazar nome/endereço); teto de 150 visitas PMOC (≤450 notificações).
- [x] **Badges PMOC usam matiz de categoria como cor de texto** (Onda 5, C1) — as 2 mobile já faziam certo; corrigido o `StatusPmocBadge` do `PmocDesktopScreen` com `corCategoriaEmChip`.

## P2 — limpeza / dead code / perf
- [x] **Rota morta TecnicoHome** (Onda 5, C1) — `<Stack.Screen name="TecnicoHome">` + entrada órfã no `RootStackParamList` removidas; import preservado (a Tab Home do técnico ainda usa a tela).
- [ ] **Lixo do template Slash (painel)** — `routes/sections/dashboard/backend.tsx`, `nav-data-backend.tsx`, `menuService.ts` (routerMode 'backend' nunca setado), `userService.ts` (auth real é supabase.auth direto), `pages/olli/list/index.tsx` + `placeholder/index.tsx` (órfãos), `sys/login/mobile-form.tsx` + `qrcode-form.tsx` (LoginStateEnum.MOBILE/QR_CODE inalcançáveis), `_mock/**` (só DEV). Abordagem: safe-delete com typecheck + comentário desatualizado em `frontend.tsx:11`. **Verificar imports antes de apagar.**
- [ ] **codigos_erro.json (365KB) estático no boot** — carregar sob demanda.
- [ ] **Sem code-splitting na web** — visitante anônimo baixa o ERP inteiro.
- [ ] **HojeScreen + radares fora do dashboard-agregado SQL** — mover pro agregado.
- [x] **Sinal (R$+data) + Laudo técnico no PDF** (Onda 4, B2) — achado STALE: já corrigido no commit 90265fc (12/07), confirmado (renderizado escapado + persistido no blob). Nada a fazer.

## Processo
- [x] **Sem CI** (Onda 3) — `.github/workflows/ci.yml` criado: 3 jobs (app-gate: typecheck+test em Node 22 por causa do type-stripping dos testes `.ts`; painel: pnpm build; landing: astro check+build), push+PR, sem deploy. Pega gate quebrado antes do merge.
- [ ] **NOVO (Onda 3): `webapp/` tem 2 lockfiles** — `package-lock.json` (desatualizado, falta @sentry/react) + `pnpm-lock.yaml` (atual, é o mantido). Confunde e faria `npm ci` falhar. Abordagem: apagar o `package-lock.json` órfão do webapp.
- [?] **Re-varrer AUDITORIA_ABA_POR_ABA.md** (152 achados, 07-14) — raízes 3,5,6,7,8 + ~140 P1-P3 NÃO re-verificados contra o código atual. Onda dedicada de sweep fresco.
- [?] **Contraste tema CLARO do painel** — rigor pixel-a-pixel foi aplicado ao app mobile, sem evidência equivalente no painel (tokens warning/success/info no claro).
