<!--
  RE-AUDITORIA TOTAL do OLLI — 2026-07-12.
  Método: 10 lentes Sonnet por superfície (app+web+landing+worker+db+build) + 4 lentes de completude
  (commits pós-auditoria, wizard, voz+PDF, backup+notificações+boot) → verificação adversarial contra o
  CÓDIGO (não contra outro modelo) → síntese Fable. 88 achados brutos → 54 confirmados + 34 confirmados-
  corrigidos na 1ª onda; +16 confirmados na 2ª. Baseline vivo: `tsc --noEmit` exit 0.
  Este documento SUPERA a auditoria de 2026-07-11 (7 lentes, 38 achados) — a seção RECONCILIAÇÃO abaixo
  registra o destino de cada achado daquela.
-->

# RE-AUDITORIA GERAL — OLLI (estado em 2026-07-12)

**Quão perto do perfeito: ~85%** (a fundação é excelente; subiu de 80-85% em 07-11 porque os 4 P0 de código
e ~12 P1 daquela auditoria foram confirmados CORRIGIDOS — mas a passada de completude revelou um cluster
NOVO de bugs de **integridade de dados na camada de identidade/conta/backup** que não existia no relatório
anterior e que precisa ser fechado antes de "perfeito", ainda mais porque o dono pediu *login perfeito*.)

---

## ALERTA OPERACIONAL — leia antes de qualquer push

O risco nº 1 continua não sendo código: **um `git push` na `main` pode derrubar o worker de produção**
(P0-1). E o risco agora é **composto**: o clobber apaga os secrets **E os 5 bindings de rate limit**
(`IA_RL`/`ETA_RL`/`LINK_RL`/`STRIPE_RL`/`ADMIN_RL`) — o worker degrada **fail-open**, e as rotas de custo
(Gemini, Routes/Geocoding) ficam sem limite até `reparar.mjs` (que restaura secrets, **não** os bindings).
O dono relatou ter desativado o Workers Build por Git em 07-11 (push monitorado ~6 min sem clobber) — mas o
estado só existe no dashboard. **Re-confirmar antes de confiar.** Ver `KNOWN_BLOCKERS.md` B5.

---

## RECONCILIAÇÃO — o que mudou desde 2026-07-11

### ✅ CORRIGIDO (verificado lendo o código atual)
| Achado 07-11 | Evidência da correção |
|---|---|
| **P0-2** owner backdoor no RLS | `20260718_rls_owner_backdoor.sql`: `papel <> 'owner'` no WITH CHECK do INSERT + índice único parcial de 1 owner/org |
| **P0-3** R8/ProGuard/shrink off | `app.json:80-88` `expo-build-properties` (ProGuard + shrinkResources), managed workflow |
| **P0-4** desktop+landing no bundle nativo | `src/screens/desktop/index.ts` (stub) + `index.web.ts` (real) + `LandingScreen.tsx/.web.tsx` — split de plataforma do Metro; ~12k linhas fora do Hermes |
| **P1-1** `/eta`+`/geocodificar` sem rate limit | binding `ETA_RL` + `bodyMuitoGrande` no worker |
| **P1-3** cliente do técnico no tenant errado | `20260719_clientes_insert_equipe.sql` + injeção de owner em `cloudSync.ts:588` |
| **P1-4** histórico de versões sumia | `clienteLink.ts:436-491` resolve `ownerUserId` por chamada |
| **P1-5** copy legal falsa | `privacidade.ts` reescrita (legítimo interesse) |
| **P1-6** convite no balde do checkout | chaves de rate limit namespaceadas (`convite:`/`excluir:`/`leitura:`) |
| **P1-7** PKCE plain | S256 via `expo-crypto` em `googleAgenda.ts` |
| **P1-9** contraste dos badges | `corStatusOrcamento`/`corCategoriaEmChip` no theme; `StatusBadge` herda |
| **P1-10** 96 `window.confirm` desktop | `ConfirmDialog` temático + `DialogoDesktopHost` (**resta 1 tela mobile** — ver P1 abaixo) |
| **P1-12** mascote ignora reduced-motion | `OlliMascot`/`EmptyState` com guard `reduzirMovimento` |
| **P1-14a** `react-native-vector-icons` morto | removido do `package.json` |
| **P1-17** pull do sync fora de transação | `pullTable` em `withTransactionAsync` |
| **P2-6/10/14** | `reparar.mjs` sem fallback; cabeçalho da `pmoc_fundacao`; `KNOWN_BLOCKERS` B4 |

Também confirmados corretos: guard do Pro 12x, upgrade-sobre-vigência, exclusão de conta tratando
`subscription_already_canceled`, e os dois pedaços do `5250f49` (getSession local, push paralelo) — sem
regressão de segurança nem de ordem (não há FK real entre as tabelas de negócio).

### ⏳ SEGUE ABERTO (do relatório 07-11)
P0-1 (Workers Build — humano); MFA/aal2 no `/admin` (**promovido a P1** — protege TODOS os tenants);
baseline das 13 tabelas legadas (**promovido a P1** — schema irreproduzível do repo); ícone android 990KB;
code-splitting web; consent screen OAuth (humano). **DECISÃO_PRODUTO** (não são bugs): paginação desktop
(revertida com nota), `orcamentos_publicos` owner-only.

---

## ACHADOS ABERTOS (re-auditoria 07-12)

### P0 — Críticos (o cluster novo de integridade de dados)

- **P0-1 · Workers Build por Git** (infra/humano, risco composto). Ver Alerta acima.
- **P0-A · Login grava empresa em branco e sobrescreve a real na nuvem** — `EntrarScreen.tsx:129-151`.
  O fail-safe do `fbdf7e2`: quando a checagem de conta na nuvem **erra (rede)** ou não acha a linha, manda o
  usuário **existente** pro Onboarding, que grava `empresaEmBranco()` e a empurra (`upsert onConflict:user_id`)
  — sobrescrevendo a empresa real; `empresaNuvemMudouDesdeUltimoPull` retorna `false` num aparelho novo (sem
  carimbo local), então o push passa, e a guarda anti-regressão propaga o vazio pros outros aparelhos. **É o
  bug direto do "login perfeito".** Fix: 3 estados no login (`tem`/`não tem`/`não sei`→retry, nunca Onboarding);
  Onboarding faz merge, nunca overwrite de campo já preenchido remotamente.
- **P0-B · Troca de conta no mesmo aparelho contamina o próximo tenant** — `ContaScreen.tsx:323-344`
  ("Sair e manter dados") + `cloudSync.ts` (`pullAll` aditivo). Sem "apagar dados", o SQLite do usuário A
  permanece e se mistura ao de B no próximo login/sync.
- **P0-C · Backup de técnico ressuscita dados excluídos do dono** — `database.ts:2123` (`exportAllData`) +
  `backup.ts` + `cloudSync.ts:556` — o backup pessoal do técnico snapshota os dados do DONO (puxados por sync
  de equipe); restaurar uma cópia antiga ressuscita itens que o dono excluiu, propagando pro tenant do time
  inteiro, sem trava de papel na UI.

### P1 — Graves (seleção; lista completa no FOLLOWUPS)

**Dinheiro & segurança:** paywall do plano Empresa **inexistente** (Equipe funciona de graça — entitlements
`equipe`/`mapa_equipe` nunca aplicados, worker nem client — `equipe.js:225`; ver `olli-paywall-empresa-ausente`);
`/stripe/webhook` sem teto de payload nem rate limit (`stripe.js:687`); **MFA ausente no `/admin`**; cota de
IA por voz só client-side (o worker `/transcrever` não valida plano/cota); **XSS armazenado** em `modeloPdf`
do orçamento (irmão do bug já corrigido no recibo — `pdfGenerator.ts`).

**Integridade multi-tenant (classe "erro vira vazio" renascida):** `contextoEquipeOwner` usa o wrapper
`getMinhaOrganizacao` que **colapsa erro em null** → escrita do técnico cai no tenant errado por uma falha de
rede no boot (`cloudSync.ts:558`); edição/exclusão de cliente por técnico **falha em silêncio** (RLS owner-only
sem gate de UI); tombstone `exclusoes` single-tenant → exclusão do técnico ressuscita no aparelho do dono;
técnico vê **todas** as OS enquanto o papel resolve (`OrdensDesktopScreen.tsx:54`, query sem gate fail-closed).

**Entrega ao cliente & UX:** sinal/entrada (R$ + data) e **laudo técnico** são preenchidos no wizard e **nunca
aparecem no PDF** entregue ao cliente (`Step3Detalhes.tsx`); `NovoOrcamentoScreen` ainda com `window.alert/confirm`
crus; badges de situação PMOC quebram contraste (2 telas); shimmer do `OlliSkeleton` (todo carregamento), pulso
do microfone e "digitando" ignoram reduced-motion; toque na notificação é **código morto** (nenhum
`addNotificationResponseReceivedListener`); lembretes PMOC sem teto (risco do limite ~500 do Android).

**Web/landing:** `public/index.html` estático ("ordem de serviço com **assinatura**") e `ComparadorLanding`
("equipe no mapa em tempo real = sim") ainda **mentem** (a mesma frase que o app marca "em breve"); zero
code-splitting (visitante anônimo baixa o ERP inteiro); `HojeScreen` e os radares fora do dashboard-agregado.

### P2 / P3 — Relevantes & menores
`/stripe/checkout` e `/transcrever` leem o corpo antes de auth/rate-limit; `convite` valida só content-length
(bypass chunked); memoização de `TabelaDados` anulada por callback inline em todas as telas; `_headers` sem CSP;
`codigos_erro.json` (365KB) importado estático no boot (viola "APK não incha"); ícone 990KB; KPIs de recibos não
agregados; cache de ETA só por destino; fotos `file://` viram blob morto em outro aparelho; lembretes da conta
anterior sobrevivem ao logout (vazam nome/endereço do cliente); `sinalValor` não reclampado / `sinalPercentual`
sobre subtotal pré-desconto; `ErrorBoundary` nativo sem "ir para o início"; `tsconfig` sem `noUnusedLocals` e
repo sem linter. Drift de docs (`SUPABASE.md`, `ROADMAP`, `multi-tenant`/`RLS_MATRIX`, `LEIA-ANDROID`,
`PROJECT_STRUCTURE`) — **corrigido nesta rodada**.

---

## PASSOS HUMANOS (com lead time)
1. **Hoje:** re-confirmar no dashboard Cloudflare que o Workers Build por Git segue desativado (risco composto).
2. **Esta semana:** TOTP na conta `ADMIN_EMAIL` (destrava o `aal2` do `/admin`).
3. **Verificar** se a consent screen OAuth (`calendar.events`) foi submetida — maior lead time (1-4 sem).
4. **Sessão com Supabase live:** `pg_dump --schema-only` das 13 tabelas legadas → `0000_baseline`.
5. **Decisões de produto:** aplicar o paywall Empresa agora? Técnico edita/exclui cliente? Equipe vê a resposta
   do cliente no link público? (Ver `KNOWN_BLOCKERS.md` — bloco de decisões.)

## SUPERFÍCIES QUE AINDA MERECEM LENTE PRÓPRIA (crítico de completude)
`src/steps/` foi coberto agora (matemática sólida; achados de dado-que-some no PDF). Ainda sem lente dedicada
e recomendados numa próxima: **voz ponta a ponta** (`vozNuvem`/`reconhecimentoVoz` + `/transcrever` — a
vitrine do produto), **fluxo completo de PDF/WhatsApp ao cliente final**, e **notificações como sistema**
(handler de toque, ciclo de vida por conta).

---
*Fundação genuinamente forte (RLS multi-tenant com imutabilidade e testes, worker com HMAC/anti-replay/
fail-closed, design system com contraste medido, sync com transação). O que separa do perfeito é finito e
nomeável: o cluster de integridade de identidade/conta/backup (P0-A/B/C), o paywall que vaza receita, e a
segunda metade da varredura de UX/reduced-motion/copy que não chegou ao mobile. Nada é retrabalho estrutural.*
