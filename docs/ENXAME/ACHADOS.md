# ACHADOS — backlog vivo do enxame (Onda 1)

> Ledger acionável. Cada item: `[status] descrição — arquivo:linha — abordagem`.
> status: `[ ]` aberto · `[~]` em onda · `[x]` feito+verificado · `[BLOQ]` humano · `[?]` re-verificar.
> Fonte: Onda 1 (6 agentes, 2026-07-17). Gate verde é pré-requisito de qualquer `[x]`.

## P0 — confiança / dinheiro / correção (ataca primeiro)

### App (Expo, src/)
- [x] **Gate de teste quebrado** — `scripts/teste-webhook-events.ts:34` usava `SUPABASE_SERVICE_ROLE` (runtime lê `SUPABASE_SERVICE_ROLE_KEY`). Corrigido; `npm test` exit 0.
- [x] **Gate de typecheck quebrado** — `tsconfig.json` raiz não excluía `web/`. Corrigido; `npm run typecheck` exit 0.
- [x] **Skeleton infinito na Home** (Onda 2) — `HomeScreen.tsx` `load()` ganhou try/catch/finally + estado `carregandoErro`; `loadRadar` distingue erro; `refresh()` try/finally; UI com 3º ramo erro+retry; StarterCard guardado. typecheck exit 0.
- [ ] **"Erro vira vazio" sistêmico (18+ sítios)** — `catch → setLista([])` sem estado de erro. Telas: TecnicoHomeScreen:68-83 (PIOR — única tela do técnico em campo), OrdemServicoScreen:130 e ~1104, EquipamentoScreen:137 e ~1223, LixeiraScreen:79, EmitirReciboScreen:~139, PmocPlanoScreen:162, HojeScreen:211, VisualizarOrcamentoScreen:125, HomeScreen.loadRadar:226, CreditosScreen.getPacotesPix:79, + espelhos desktop: EquipamentosDesktop:144, OrdensDesktop:86 + PainelNovaOS:132, LixeiraDesktop:111, InicioDesktop:168, PmocDesktop:164. Abordagem: primitiva compartilhada de 3 estados (base já existe em `contextoEquipe.ts`) + aplicar por tela. **Onda dedicada** (grande, mecânica).
- [ ] **PlanosScreen sem catch** — `src/screens/PlanosScreen.tsx:177-188` `carregarPlano()` só tem finally; rejeição não avisa o usuário na tela de assinatura. Abordagem: catch + estado de erro.
- [ ] **CreditosScreen inconsistente** — saldo/extrato fazem 3 estados certo, mas pacotes de recarga Pix (`:79`) usam `catch→[]`; tela de recarga parece "sem pacotes" numa falha de rede. Abordagem: mesmo padrão do saldo.
- [ ] **PMOC fallback diverge mobile/desktop** — `PmocPlanoScreen` usa `{periodicidades}`, `PmocDesktopScreen:158` usa `{periodicidadeLabels}`; corrigir um lado quebra o outro em silêncio. Abordagem: unificar shape.

### Segurança
- [x] **XSS no PDF do orçamento** (Onda 2) — os campos de texto JÁ eram escapados (commit c73d866). Buraco real: o helper `img()` devolvia data URI **crua** (o recibo escapa logoData/assinaturaData). Fix: `escapeHtml` dentro de `img()` (`src/utils/pdfGenerator.ts`) — no-op p/ base64 legítimo, mata URI adulterada. typecheck exit 0.
- [ ] **Worker sem teto de payload / rate-limit por IP** — `/stripe/webhook` e `/transcrever` bufferizam corpo sem limite; `/transcrever` valida cota de IA só no client (worker não valida plano/cota). Abordagem: limite de bytes + rate-limit fail-closed (padrão de `rateLimit` já existe) + validar cota no worker.

### Painel (webapp/)
- [x] **Links de filtro KPI mortos** (Onda 2) — `OrcamentosPage` agora lê `?status=` (useSearchParams v7), valida contra os slugs reais num `Set`, aplica até o dono mexer no dropdown. Slugs batem 1:1 (sem normalização). ⚠️ não typechecado local (webapp sem node_modules) — CI cobre.

### Landing (web/)
- [x] **FAQ mente e vira JSON-LD pro Google** (Onda 2) — `index.astro` reescrito p/ a verdade ("roda no navegador do celular e do computador... app Android a caminho das lojas"); propaga automático pro FAQPage (schema deriva do array `faq`).
- [ ] **Ajuda promete offline+voz ausentes no painel** — `web/src/pages/ajuda/index.astro` (via `src/content/ajuda/index.ts`) — recursos do app Expo não publicado, ausentes do painel pra onde o CTA manda. Abordagem: adaptar copy da ajuda web ao que o painel realmente faz.
- [x] **404 sem noindex + CTA errado** (Onda 2) — prop `noindex` no `Layout.astro`; `404.astro` usa `noindex={true}` + CTA agora `APP_CADASTRO_URL` (CC-01).

## P1 — coerência / UX / venda
- [x] **Feature paga invisível: EquipeAoVivoScreen** (Onda 2) — botão "Equipe ao vivo no mapa" adicionado em `EquipeScreen.tsx` (card) e `EquipeDesktopScreen.tsx` (header); navega p/ a rota (GateEquipe interno trata não-Empresa). Copy "(em breve)" removida de `PlanosScreen.tsx`. typecheck exit 0. ⚠️ falta clicar no botão em runtime (QC visual — Onda de screenshots).
- [ ] **NOVO (Onda 2): benefício órfão `dashboard_empresa`** — "Painel de gestão e metas da equipe" era anunciado como benefício mas **não existe tela nenhuma** (entitlement `dashboard_empresa` só aparece na tabela + texto do GatePro, sem implementação). c2 REMOVEU a linha de `PlanosScreen` (não dá pra vender o que não existe). **Decisão do dono:** construir a tela OU manter removido. Se construir, precisa regatear a entitlement. → também em BLOQUEIOS.
- [ ] **Diagnóstico IA sem gate de vertical** — painel `nav-data-frontend.tsx` mostra "Diagnóstico IA" (HVAC-only, `diagnostico/hvac.ts`) pra qualquer ofício, ao contrário de Ferramentas (filtra por VerticalId). Abordagem: gate por vertical no menu.
- [ ] **Equipe no painel é só leitura** — trocar papel/desativar/remover exige o app celular (honesto no ConvidarDialog, mas lacuna pra quem só usa web). Abordagem: decidir se traz CRUD de papel ao painel (produto).
- [ ] **Sem onboarding guiado no painel** — cai em `/inicio` zerado sem tour/checklist de primeiros passos. Abordagem: empty-state com CTA "criar 1º orçamento/cliente".
- [ ] **Nav da Home não linka #oficios** — hub das 6 páginas /para só acessível rolando. Abordagem: item no header.
- [ ] **reduced-motion faltando** — shimmer `OlliSkeleton`, pulso mic `OlliVozScreen`, "digitando" `OlliChatScreen`, container do wizard `NovoOrcamentoScreen`. Abordagem: fechar os 20% restantes do sweep (80% já respeitam).
- [ ] **NovoOrcamentoScreen usa window.alert/confirm cru** — trocar por ConfirmDialog temático.
- [ ] **Notificação: deep-link morto + vazamento** — `addNotificationResponseReceivedListener` não navega (código morto); falta teto de lembretes PMOC (~500 Android) e cancelar lembretes no logout "sair e manter dados" (vaza nome/endereço). Abordagem: implementar navegação por payload + teto + cancelar no logout.
- [ ] **Badges PMOC usam matiz de categoria como cor de texto** (2 telas) — aplicar `corCategoriaEmChip`.

## P2 — limpeza / dead code / perf
- [ ] **Rota morta TecnicoHome** — `AppNavigator.tsx:552` registrada, sem path em linking.ts nem navigate. Remover.
- [ ] **Lixo do template Slash (painel)** — `routes/sections/dashboard/backend.tsx`, `nav-data-backend.tsx`, `menuService.ts` (routerMode 'backend' nunca setado), `userService.ts` (auth real é supabase.auth direto), `pages/olli/list/index.tsx` + `placeholder/index.tsx` (órfãos), `sys/login/mobile-form.tsx` + `qrcode-form.tsx` (LoginStateEnum.MOBILE/QR_CODE inalcançáveis), `_mock/**` (só DEV). Abordagem: safe-delete com typecheck + comentário desatualizado em `frontend.tsx:11`. **Verificar imports antes de apagar.**
- [ ] **codigos_erro.json (365KB) estático no boot** — carregar sob demanda.
- [ ] **Sem code-splitting na web** — visitante anônimo baixa o ERP inteiro.
- [ ] **HojeScreen + radares fora do dashboard-agregado SQL** — mover pro agregado.
- [ ] **Dado descartado: Sinal (R$+data) + Laudo técnico** — preenchidos em `Step3Detalhes`, nunca aparecem no PDF do cliente. Abordagem: incluir no `pdfGenerator`. (confiança percebida — pode subir pra P0.)

## Processo
- [ ] **Sem CI** — não existe `.github/workflows`; push na main já deploya (Cloudflare Pages). Foi como os 2 gates quebrados passaram batido. Abordagem: Action rodando `npm test` + `typecheck` raiz + build webapp + `astro check` web em push/PR (NÃO wire deploy).
- [?] **Re-varrer AUDITORIA_ABA_POR_ABA.md** (152 achados, 07-14) — raízes 3,5,6,7,8 + ~140 P1-P3 NÃO re-verificados contra o código atual. Onda dedicada de sweep fresco.
- [?] **Contraste tema CLARO do painel** — rigor pixel-a-pixel foi aplicado ao app mobile, sem evidência equivalente no painel (tokens warning/success/info no claro).
