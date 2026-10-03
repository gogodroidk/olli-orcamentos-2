# Assinatura pela Google Play (Play Billing direto) — como funciona e como ligar

Estado em 02/10/2026: **app pronto na 1.2.0 (versionCode 24)**, com Play Billing **direto** pelo
`expo-iap` 5.8.2 (Play Billing Library 9.1). **Sem RevenueCat e sem serviço de terceiro.** O lado do
servidor (`worker/src/play.js`) entra na mesma release. A venda fica atrás de um **interruptor do
servidor** (`PLAY_BILLING_MODE`): se o teste falhar, o app sai com a venda desligada e a tela diz que a
assinatura pelo app está indisponível no momento. **Nunca modo demo.**

## Como funciona (1 minuto)

```
App Android ──(expo-iap: requestPurchase, obfuscatedAccountId = sha256hex(user.id))──▶ Google Play (cobra)
     │
     │ purchaseUpdatedListener (compra PURCHASED)
     ▼
POST https://diagnostico.olliorcamentos.online/play/verificar     Authorization: Bearer <JWT do Supabase>
     { purchaseToken, productId, basePlanId | null }      (montado por corpoVerificacaoPlay)
     │
     ▼
worker/src/play.js ── subscriptionsv2.get (Google Play Developer API, conta de serviço)
     │                confere pacote, produto do catálogo, obfuscatedExternalAccountId == sha256(userId do JWT)
     │                grava public.assinaturas (+ play_compras) e reconhece (acknowledge)
     ▼
200 { ok:true, estado:'ativo', plano, vigenteAte }  ──▶  app chama finishTransaction  ──▶  relê o plano do SERVIDOR
200 { ok:true, estado:'pendente'|'encerrado'|'sem_efeito', plano:null }  ──▶  "sem liberação" (texto neutro, sem finalizar)
409 { ok:false, erro: 'token_de_outra_conta' }  ──▶  "Esta assinatura já está ligada a outra conta OLLI"

Renovação, cancelamento, carência, suspensão, estorno:
Google ──RTDN──▶ Pub/Sub (tópico olli-play-rtdn) ──pull pelo cron próprio 3,23,43 (:03/:43)──▶ worker ──▶ subscriptionsv2.get ──▶ assinaturas
```

- **Quem libera é o servidor.** O app nunca libera plano sozinho. Se o servidor não confirmar, a compra
  fica sem reconhecimento e a própria Play **estorna em 3 dias** — melhor que cobrar sem entregar.
- **Ligado** = Android + fora do Expo Go + módulo nativo `ExpoIap` no binário + `GET /play/config`
  respondendo `{ ligado: true }`. Sem flag de build (o build local não lê o `env` do `eas.json`).
- **Preço:** o app mostra **só** o preço que a Play devolve. No Android nunca aparece o preço da web
  (nem com a venda desligada).
- **iOS continua sem compra.** A web continua vendendo por Stripe/Pix. O painel web mostra
  "Gerenciar na Google Play" para quem assinou no Android.

## Catálogo (JÁ CRIADO no Play Console — não recriar; IDs não podem ser reutilizados)

| Assinatura | Plano básico | Id lógico no app/worker | Plano OLLI | Preço na Play |
|---|---|---|---|---|
| `olli_pro` | `mensal` (P1M) | `olli_pro:mensal` | Pro | o da web: `PRECO_PRO.mensalCentavos` |
| `olli_pro` | `anual` (P1Y) | `olli_pro:anual` | Pro | o da web: `PRECO_PRO.anualCentavos` |
| `olli_empresa` | `mensal` (P1M) | `olli_empresa:mensal` | Empresa | o da web: `PRECO_EMPRESA.mensalCentavos` |
| `olli_empresa` | `anual` (P1Y) | `olli_empresa:anual` | Empresa | o da web: `PRECO_EMPRESA.anualCentavos` |

- Fonte única: `ASSINATURA_PLAY_POR_PLANO` em `src/services/playBillingRegras.ts` (app e worker leem
  de lá). Produto desconhecido **não libera nada**.
- Preços conferidos em `src/services/precosPlanos.ts` (dono decidiu: preço da Play = preço da web).
  Se a fonte mudar, mude o Console junto — o app não tem número digitado para a Play.
- **Sem teste grátis na Play** (decisão do dono). O app só vende a oferta-base de cada plano básico
  (uma fase de preço); uma oferta com teste/preço de entrada **não vira botão** até existir o texto
  exigido pela política.
- País: **Brasil**.

## O que já está configurado fora do código (02/10/2026)

| Item | Valor |
|---|---|
| Assinaturas | `olli_pro` e `olli_empresa`, base plans `mensal`/`anual` **ativos** |
| RTDN | tópico `projects/claude-motor/topics/olli-play-rtdn` |
| Assinatura Pub/Sub (PULL) | `projects/claude-motor/subscriptions/olli-play-rtdn-worker` |
| Conta de serviço | `olli-play-verify@claude-motor.iam.gserviceaccount.com` (sem papéis no projeto; na Play: ver dados financeiros + gerenciar pedidos e assinaturas). Chave JSON local, vai no secret `PLAY_SA_JSON` |
| Teste de licença | ligado (testadores com resposta LICENSED) |

## Worker — nomes (decisão C6)

| Tipo | Nome | Valor |
|---|---|---|
| secret | `PLAY_SA_JSON` | JSON da chave da `olli-play-verify@` (nunca no app, nunca no `eas.json`) |
| secret | `PLAY_TESTE_PERMITIDOS` | user_ids que podem fazer compra de teste (licença) |
| var | `PLAY_BILLING_MODE` | `off` \| `on` — o **kill switch da vitrine** lido por `GET /play/config`. Não bloqueia `/play/verificar` (compra já paga sempre é registrada) |
| var | `PLAY_PACKAGE_NAME` | `online.olliorcamentos.app` |
| var | `PLAY_PUBSUB_SUBSCRIPTION` | `projects/claude-motor/subscriptions/olli-play-rtdn-worker` |

Contrato que o app usa (`src/services/playBillingWorker.ts`):

- `GET /play/config` → `{ ligado: boolean }`. Qualquer outra resposta = "não sei" → a tela mostra
  "Tentar de novo", **nunca** vende nem diz "desligado".
- `POST /play/verificar` (Bearer JWT) `{ purchaseToken, productId, basePlanId | null }` (o worker
  aceita também o legado `produtoId: 'olli_pro:mensal'`) →
  `200 { ok: true, estado: 'ativo', plano: 'pro'|'empresa', vigenteAte }` |
  `200 { ok: true, estado: 'pendente'|'encerrado'|'sem_efeito', plano: null, vigenteAte: null }` (sem liberação) |
  `409 { ok: false, erro: 'token_de_outra_conta' }` | `401` (sessão) | outro `4xx` (recusada: não repete,
  não finaliza) | `429/5xx` (erro: tenta depois). O produto e o plano básico valem os da API do Google:
  `basePlanId` errado ou ausente vindo do app só gera log no worker, nunca recusa.
- O formato é UM só e mora em `playBillingRegras.ts` (`corpoVerificacaoPlay` monta o pedido,
  `interpretarVerificacaoPlay` lê a resposta); `worker/scripts/teste-play-verificacao.js` importa as duas
  e as roda contra o `handlePlay` real.

## App — onde mora cada coisa

| Arquivo | Papel |
|---|---|
| `src/services/playBillingRegras.ts` | Regras PURAS: catálogo, `estadoPlayBilling`, `pacotesDaLoja`/`ofertasDoCatalogo` (preço da loja), `comoComprarNaPlay` (troca = substituição), `traduzirFalhaPlay` (`ErrorCode` do expo-iap), `interpretarConfigPlay`/`interpretarVerificacaoPlay` (3+ estados), `donoDaCompraPlay`, `urlGerenciarNaPlay`. Também usado pelo worker e pelo painel (alias `@play-billing-regras`) |
| `src/services/playBilling.android.ts` | **Único** arquivo que importa `expo-iap`: conexão, listeners, compra, restaurar, sincronizar, gerenciar |
| `src/services/playBilling.ts` | Versão iOS/web: sempre desligada (mesma interface; o `tsc` confere) |
| `src/services/playBillingWorker.ts` | `/play/config` e `/play/verificar` (padrão de `pixPlano.ts`) |
| `src/screens/PlanosScreen.tsx` | Abas, preço da loja, termos antes de comprar, "Restaurar compras", "Gerenciar na Google Play"; sem venda = "Assinatura pelo app indisponível no momento", sem preço |
| `src/screens/AssinaturaScreen.tsx` | "Gerenciar na Google Play" (deep link da Play); recibo no Android = só PDF de fatura paga |
| `src/screens/ContaScreen.tsx` | Linha "Assinaturas na Google Play" (Android); aviso de cancelamento na exclusão |
| `src/services/lembreteAssinaturaLoja.ts` | Android: assinante da Play só vê "Gerenciar na Google Play", nunca Pix |

### Fluxos do app

1. **Abrir Planos**: `GET /play/config` → (`ligado`) `initConnection` → `fetchProducts(['olli_pro','olli_empresa'], 'subs')`
   → ofertas com o preço da loja. Estados: carregando / erro (+ "Tentar de novo") / sem login /
   indisponível (servidor desligou) / ok.
2. **Assinar**: o app mostra **antes** preço da loja, periodicidade, renovação automática e como
   cancelar (política de assinaturas) → `requestPurchase` com `obfuscatedAccountId = sha256hex(user.id)`
   (64 caracteres, sem PII) → o desfecho chega pelo listener → `/play/verificar` → `finishTransaction`.
   - Já assina outro plano/período pela Play → **troca** (`purchaseToken` antigo +
     `subscriptionProductReplacementParams`, modo `with-time-proration`: vale na hora, com crédito do
     tempo pago). Nunca uma 2ª assinatura.
   - Mesma assinatura e mesmo plano básico → "você já tem; restaure".
   - Compra de **outra conta OLLI** nesta conta Google → recusada no app; o servidor também devolve 409.
   - `pending`/`deferred-payment` → "pagamento em processamento", **nada é liberado**.
   - Assinatura **suspensa** (`isSuspendedAndroid`) → não dá acesso; leva a "Gerenciar na Google Play".
   - `billing-unavailable` (PBL 9) → "Play Store indisponível neste aparelho", nunca "sem plano".
   - Quem já tem plano pago por Stripe, Pix ou concessão **não vê oferta de compra**. Quem assina
     **pela Play** vê, abaixo de "Sua assinatura", a seção "Trocar de plano pela Google Play"
     (Pro ↔ Empresa, mensal ↔ anual) — a Play Store não troca `olli_pro` por `olli_empresa` sozinha.
3. **Restaurar compras**: `getAvailablePurchases({ includeSuspendedAndroid: true })` → cada compra do
   OLLI desta conta vai ao `/play/verificar`. Funciona também com a venda **desligada** no servidor
   (o botão continua na tela): quem já pagou precisa conseguir registrar a compra.
4. **Sincronização silenciosa**: ao abrir o app (`INITIAL_SESSION`/`SIGNED_IN`) e ao voltar ao
   primeiro plano (`AppState` active), no máximo 1×/min: compras ainda **não reconhecidas** vão ao
   servidor (app morto no meio, rede, pendente que compensou) — inclusive com a venda desligada; só
   para quando `/play/config` não responde ("não sei").
   Sessão guardada sem token no momento (renovação em espera) é "não sei", nunca "sem login".
5. **Gerenciar**: `deepLinkToSubscriptions({ skuAndroid, packageNameAndroid })`; sem produto conhecido,
   `https://play.google.com/store/account/subscriptions?package=online.olliorcamentos.app`.
6. **Excluir conta** (decisão C12): o servidor cancela a renovação da assinatura da Play
   (`subscriptionsv2…:cancel`) e apaga `play_compras`; a tela avisa antes e leva à central da Play.

### Regras de política (Android) que o código tranca

- Nunca citar/linkar Pix, Stripe, cartão pela web, 12x ou "assine pelo site" (anti-steering vale no
  Brasil até 30/09/2027). Gates: `scripts/teste-play-billing.ts`, `scripts/teste-roteamento-pagamento.ts`,
  `scripts/teste-lembrete-assinatura-loja.ts`.
- Sem venda = sem preço (nem o da web) e texto "indisponível no momento", sem convite a comprar fora.
- Recibo de assinatura feita na web: no Android só o **PDF de fatura paga** (`/stripe/faturas?plataforma=android`),
  nunca a página hospedada (que tem botão de pagar quando a fatura está em aberto).

## Build (local, `C:\OLLI_REL`)

1. `npm install` (troca `react-native-purchases` por `expo-iap@5.8.2` no `node_modules`).
2. `npx expo prebuild -p android --clean --no-install`. Os plugins do `app.json` já aplicam:
   - `expo-iap` (sem opções — a 5.8.2 só aceita pin `amazon`/`horizon` no plugin; a loja **Play** é
     fixada por `-PopeniapStore=play` no `build-android-production.ps1` e por
     `ORG_GRADLE_PROJECT_openiapStore=play` nos perfis do `eas.json`);
   - `./plugins/withGradleReleaseTweaks` (`org.gradle.jvmargs` e `lint { checkReleaseBuilds false }`
     — acabou o patch manual depois do prebuild);
   - `./plugins/withBackupSemBanco` (backup automático só com preferências; o SQLite fica de fora;
     `expo-secure-store` com `configureAndroidBackup: false`).
3. `scripts\build-android-production.ps1`.
4. Conferir no AAB: `versionCode 24`, `versionName 1.2.0`, `com.android.vending.BILLING` presente,
   `USE_BIOMETRIC`/`USE_FINGERPRINT` ausentes, **uma só** `com.android.billingclient:billing` (9.1.0),
   16 KB ok. `node scripts/verificar-config-release.mjs` confere a configuração versionada.

## Ordem de ativação

1. Migrations do servidor (`play_compras` e lembretes que reconhecem a Play).
2. Secrets `PLAY_SA_JSON` e `PLAY_TESTE_PERMITIDOS`.
3. Deploy do worker com `PLAY_BILLING_MODE=off` (avisar antes: o deploy cobra 1 crédito extra;
   usar `env -u CLOUDFLARE_API_TOKEN`).
4. "Enviar notificação de teste" do RTDN e conferir que chega pelo pull (o pull roda no cron
   próprio `3,23,43`: minutos :03 e :43; a reconciliação roda no :23 e, às 05:23 UTC, a varredura de
   anuladas no lugar dela). Na assinatura `olli-play-rtdn-worker` do GCP, `ackDeadlineSeconds` ≥ 60.
   Pré-requisito: a migration `20261004110200_empresa_carimbo_servidor.sql` também entra nesta leva.
5. `PLAY_BILLING_MODE=on` e confirmar com os testadores de licença.
6. Build vc24 → faixa alpha → teste com licença: compra, renovação acelerada (5 min), cancelamento,
   expiração, estorno, restaurar em outro aparelho, 409 com outra conta, troca Pro↔Empresa.
7. Produção com lançamento gradual. **Se o teste falhar:** manter `PLAY_BILLING_MODE=off` — o app sai
   igual, dizendo que a assinatura pelo app está indisponível.

## Desligar a venda a qualquer momento

`PLAY_BILLING_MODE=off` no worker. O app relê `/play/config` ao abrir Planos e antes de cada compra:
some o preço, somem as abas e o botão, e a tela diz "Assinatura pelo app indisponível no momento".
Quem já assina continua com o plano (o servidor segue processando RTDN) e com o "Gerenciar na Google Play".
O `off` NÃO bloqueia `POST /play/verificar`: uma compra paga segundos antes do desligamento ainda é
registrada e reconhecida (senão a Play estornaria e o cliente ficaria sem o plano).

## Vigência e folga de renovação

- `revenuecat_vigencia_ate` = `expiryTime` **exato** da Play.
- `current_period_end` (o que libera o plano) = `expiryTime + 2 h` quando a assinatura está ATIVA e
  com renovação automática (`FOLGA_RENOVACAO_MS` em `play.js`). Sem isso o assinante caía para o
  Grátis a cada renovação até o próximo pull do RTDN (até 40 min). Cancelada/carência: exata.
- "A linha é da Play?" (`sustentadaPelaPlay` no worker e `v_play_sustenta` na migration 20261004110100)
  aceita essa folga (2 h + 1 min).
- Encerrar uma compra da Play com OUTRA compra da Play viva na mesma conta OLLI (duas contas Google)
  não derruba o plano: a linha passa a apontar para a outra.

## Tetos por invocação (plano Free: 50 subrequests)

- RTDN e reconciliação: no máximo 3 itens por rodada (`PLAY_RTDN_MAX`/`PLAY_RECONCILIAR_MAX` acima de
  3 são cortados).
- Varredura de anuladas: orçamento de 40 subrequests; uma anulada nossa só é reivindicada se couber
  tratá-la na mesma rodada.
- **Cron próprio (03/10/2026):** medido com `wrangler tail`, a invocação `7,27,47` (alertas + Play)
  batia 10 ms de CPU — o teto do plano Free — e o RTDN nunca era lido. A Play passou para o cron
  `3,23,43` (CRON_PLAY), invocação só dela. Usa 3 dos 5 crons da conta Free.

## Limites conhecidos

- A troca precisa do token da assinatura atual; se a loja não devolver, o app pede "Restaurar" e não
  arrisca cobrança dupla.
- Se a loja não informar o plano básico da assinatura ativa (`currentPlanId`), o app trata como "já
  tem" (não troca mensal↔anual por segurança); o usuário troca pela central da Play.
- Créditos de IA continuam sem compra no Android (seria produto consumível da Play; outro escopo).
