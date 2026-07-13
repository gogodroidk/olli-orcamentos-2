<!-- Referência de especialista AbacatePay — gerada por enxame multi-agente (6 agentes) lendo a doc oficial (docs.abacatepay.com + OpenAPI + llms.txt) em jul/2026. Para a integração Pix do OLLI. -->

# AbacatePay — Referência de Especialista (pt-BR)

> Síntese aterrada em 5 estudos da doc oficial (`docs.abacatepay.com`, `openapi-v1.yaml`, `openapi.yaml`, `llms.txt`). Onde as fontes conflitam, o ponto está marcado com **⚠️ incerteza**. Foco em **Pix**, com o restante (checkout, assinatura, customer, webhooks) coberto para dar contexto de integração no OLLI.

---

## 1. Visão geral

AbacatePay é um gateway de pagamentos brasileiro (Pix, Cartão, Boleto). Serve para:

- **Pix avulso / QR Code direto** — gerar um `brCode` (copia-e-cola) + `brCodeBase64` (imagem PNG do QR) e receber confirmação de pagamento. **É o caso de uso central do OLLI** (venda de créditos / desbloqueio de plano por Pix).
- **Checkout hospedado** (link `https://app.abacatepay.com/pay/...`) com Pix + Cartão (+ parcelamento) + Boleto num único link.
- **Assinaturas recorrentes** — porém **somente CARD** (ver §7).
- **Cadastro de clientes, produtos, cupons, payouts, transferências Pix**.

### ⚠️ Ponto mais importante antes de integrar: existem DUAS gerações de API vivas

| | **API v1 (legada, ativa)** | **API v2 (atual, "Checkout Transparente")** |
|---|---|---|
| Base | `https://api.abacatepay.com/v1` | `https://api.abacatepay.com/v2` |
| Pix direto | `POST /pixQrCode/create` | `POST /transparents/create` com `method:"PIX"` |
| Checar status | `GET /pixQrCode/check?id=` | `GET /transparents/check?id=` |
| Simular pagto | `POST /pixQrCode/simulate-payment?id=` | `POST /transparents/simulate-payment?id=` |
| Envelope resposta | `{ data, error }` | `{ data, error, success }` |
| Evento webhook (Pix pago) | `billing.paid` (id `bill_`) | `transparent.completed` (id `pix_char_`) |
| Enum `status` | 5 valores | 9 valores |

**Recomendação para o OLLI:** usar **v1 `pixQrCode/*`** — é o Pix avulso mais enxuto, com `brCode`/`brCodeBase64` diretos e o menor conjunto de campos. A v2 `transparents/*` é equivalente para Pix e é a rota "oficial atual"; escolha uma e **não misture paths de uma versão com convenções da outra** (armadilha campeã da doc). Este documento traz as duas, com curls literais.

---

## 2. Autenticação

- **Header:** `Authorization: Bearer <API_KEY>` (a chave é um JWT).
- **Base URL:** `https://api.abacatepay.com` — **o mesmo endpoint para dev e produção**. O ambiente é decidido **pela chave usada**, não por URL/flag/body. Citação literal da doc: *"The same endpoint api.abacatepay.com is used for the environment of development and production."*
- **Chave dev vs prod:** conta nova nasce em **Dev mode**. Para produção, o lojista clica em "Dev mode" no dashboard, envia documentos da empresa/sócios e aguarda aprovação (~24h por e-mail). É **processo humano**, não chamada de API.
- **Erros de auth:** `401` (chave ausente/incorreta/revogada — não há diferenciação entre os três) e `403` (chave válida sem permissão para o recurso).
- **Escopos de permissão** existem por chave (ex.: `CHECKOUT:READ`, `CUSTOMER:READ`, `WEBHOOK:CREATE`, `WITHDRAW:*`). Uma chave sem o escopo falha mesmo autenticada.

---

## 3. Endpoints

### 3.1 Pix — Criar QR Code (v1, legada) — recomendado p/ OLLI

**`POST https://api.abacatepay.com/v1/pixQrCode/create`**

Request (body JSON):

| Campo | Tipo | Obrig. | Notas |
|---|---|---|---|
| `amount` | number | **sim** | valor em **centavos** |
| `expiresIn` | number | não | segundos até expirar |
| `description` | string | não | **máx. 37 caracteres** (excesso é truncado silenciosamente) |
| `customer` | object | não | **tudo-ou-nada**: se enviado, `name`+`cellphone`+`email`+`taxId` viram TODOS obrigatórios |
| `metadata` | object | não | livre; default `{externalId:'123'}` |

Response — `data` (objeto PixQRCode):

| Campo | Ex. |
|---|---|
| `id` | `pix_char_123456` |
| `amount` | `100` |
| `status` | `PENDING` \| `EXPIRED` \| `CANCELLED` \| `PAID` \| `REFUNDED` |
| `devMode` | `true`/`false` |
| `brCode` | `00020101021226950014br.gov.bcb.pix…` (copia-e-cola) |
| `brCodeBase64` | `data:image/png;base64,iVBOR…` (**já é data URI completo**) |
| `platformFee` | `80` |
| `createdAt`/`updatedAt`/`expiresAt` | ISO 8601 |

`error` = `null` em sucesso.

```bash
curl -X POST https://api.abacatepay.com/v1/pixQrCode/create \
  -H "Authorization: Bearer $ABACATEPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "expiresIn": 3600,
    "description": "Creditos OLLI",
    "metadata": { "externalId": "olli:user-uuid:pedido-123" }
  }'
```

### 3.2 Pix — Checar status (v1)

**`GET https://api.abacatepay.com/v1/pixQrCode/check?id=<id>`** — `id` vai na **query string** (não no body/path). Sem body.

Response: `data.status` (mesmo enum) + `data.expiresAt`.

```bash
curl "https://api.abacatepay.com/v1/pixQrCode/check?id=pix_char_123456" \
  -H "Authorization: Bearer $ABACATEPAY_API_KEY"
```

### 3.3 Pix — Simular pagamento (v1, só sandbox)

**`POST https://api.abacatepay.com/v1/pixQrCode/simulate-payment?id=<id>`** — `id` na query. Body opcional `{ "metadata": {} }`. Retorna o PixQRCode com `status:"PAID"`.

**Só funciona com chave dev.** Em produção **retorna erro** (não é "sem efeito", é erro de fato).

```bash
curl -X POST "https://api.abacatepay.com/v1/pixQrCode/simulate-payment?id=pix_char_123456" \
  -H "Authorization: Bearer $ABACATEPAY_API_KEY" \
  -H "Content-Type: application/json" -d '{ "metadata": {} }'
```

### 3.4 Pix — Checkout Transparente (v2, atual) — equivalente

**`POST https://api.abacatepay.com/v2/transparents/create`**

Request:

| Campo | Tipo | Obrig. | Notas |
|---|---|---|---|
| `method` | `"PIX"` \| `"BOLETO"` | sim (default PIX) | |
| `data.amount` | number | **sim** | centavos; único obrigatório dentro de `data` |
| `data.expiresIn` | number | não | segundos (só PIX) |
| `data.description` | string | não | **máx. 500** (≠ 37 da v1) |
| `data.customer` | object | não | PIX: tudo-ou-nada (4 campos) |
| `data.externalId` | string | não | idempotência |
| `data.metadata` | object | não | |

Response — `data` (TransparentCharge): `id` (`pix_char_…`), `amount`, `status` (**9 valores**: PENDING, EXPIRED, CANCELLED, PAID, UNDER_DISPUTE, REFUNDED, REDEEMED, APPROVED, FAILED), `devMode`, `brCode`, `brCodeBase64`, `platformFee`, `receiptUrl` (só após pago), datas. **Envelope `{ data, error, success }`.** Requer escopo `CHECKOUT:READ`.

- Checar: **`GET /v2/transparents/check?id=<id>`**
- Simular: **`POST /v2/transparents/simulate-payment?id=<id>`** (só dev)

```bash
curl -X POST https://api.abacatepay.com/v2/transparents/create \
  -H "Authorization: Bearer $ABACATEPAY_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{ "method":"PIX", "data":{ "amount":10000, "expiresIn":3600,
    "description":"Creditos OLLI", "metadata":{ "externalId":"olli:user-uuid" } } }'
```

### 3.5 Checkout hospedado (v2) — Pix + Cartão + parcelamento

**`POST https://api.abacatepay.com/v2/checkouts/create`** — devolve `data.url` (`https://app.abacatepay.com/pay/bill_…`).

| Campo | Notas |
|---|---|
| `items[]` | `{id, quantity}` — obrig. |
| `methods` | default `["PIX","CARD"]` |
| `card.maxInstallments` | 1–12; **mín. R$10/parcela**; só ONE_TIME/MULTIPLE_PAYMENTS |
| `customerId`, `coupons`, `returnUrl`, `completionUrl`, `externalId`, `metadata` | opcionais |

> A v1 equivalente é `POST /v1/billing/create` (objeto `Billing`, id `bill_…`, campo `url`, `frequency: ONE_TIME|MULTIPLE_PAYMENTS`, `products[]` com preço mín. 100 centavos). Note: `data.amount` da resposta v1 está **`deprecated`** — calcule pelo `products`.

### 3.6 Assinatura (v2) — CARD-only

**`POST https://api.abacatepay.com/v2/subscriptions/create`** — `items` (exatamente 1, produto com `cycle` = WEEKLY/MONTHLY/SEMIANNUALLY/ANNUALLY), `methods` default `["CARD"]` (**"Only CARD supported"**). Outras: `POST /subscriptions/cancel` (imediato, irreversível), `POST /subscriptions/change-plan` (cria update pendente `subu_…`, não instantâneo).

### 3.7 Customer (v2)

**`POST https://api.abacatepay.com/v2/customers/create`** — só `email` obrigatório; opcionais `name`, `cellphone`, `taxId`, `zipCode`, `metadata`. Retorna `data.id` (`cust_…`). Listar: `GET /v2/customers/list` (`CUSTOMER:READ`, paginação cursor `limit`/`after`/`before`).

---

## 4. Fluxo Pix ponta-a-ponta (recomendado p/ OLLI)

```
(1) App pede compra  ──►  Worker POST /v1/pixQrCode/create { amount, metadata.externalId }
                              └─ metadata.externalId = "olli:<userId>:<pedidoId>"  (vínculo!)
(2) Worker devolve   ──►  { id: pix_char_…, brCode, brCodeBase64 }
(3) App exibe        ──►  <img src="{brCodeBase64}">  +  botão "copiar" com {brCode}
(4) Cliente paga no banco
(5a) WEBHOOK (preferido)  ──►  AbacatePay POST no seu endpoint: billing.paid / transparent.completed
       └─ Worker verifica (secret na query + HMAC) → lancarCreditos()/upsertAssinatura() → 200
(5b) POLLING (fallback)   ──►  App consulta GET /v1/pixQrCode/check?id= até status==="PAID"
(6) Libera acesso/créditos (idempotente pelo id do evento)
```

- **Prefira webhook** ao polling (recomendação oficial). Mantenha o polling só como fallback de UX (mostrar "pago!" rápido).
- O **vínculo com o usuário do OLLI** vai em `metadata.externalId` na criação — é o que o webhook devolve para você saber a quem creditar.

---

## 5. Webhooks + verificação HMAC

### Eventos (qual dispara no Pix pago)

- **Pix via QR Code direto / Transparente:** **`transparent.completed`** (v2, `data.transparent`, id `pix_char_…`, `status:"PAID"`).
- **Pix via Checkout hospedado:** **`checkout.completed`** (v2, `data.checkout`, id `bill_…`) — na v1 o nome é **`billing.paid`**.
- Demais: `*.refunded`, `*.disputed`, `*.lost`; `subscription.completed|renewed|cancelled|trial_started|payment_failed`; `transfer.*`, `payout.*`.

### Envelope padrão v2

```json
{ "id": "log_abc123xyz", "event": "transparent.completed",
  "apiVersion": 2, "devMode": false, "data": { "transparent": {...}, "customer": {...}, "payerInformation": {...} } }
```

Dados sensíveis vêm **mascarados** (CPF `123.***.***-**`, cartão só `last4`+`brand`). ⚠️ Não está claro se `metadata` é ecoado no payload do webhook — **não dependa disso**; se precisar do `externalId` no webhook, confirme em dev, ou re-consulte o recurso via `GET .../check`/API pelo `id`.

### Verificação — DUAS camadas independentes

1. **Secret na query string** — você cadastra o endpoint como `https://seu-dominio/abacate/webhook?webhookSecret=SEU_SECRET` e compara `?webhookSecret=` com o secret configurado.
2. **HMAC-SHA256 no header `X-Webhook-Signature`** — base64 do **raw body**.

> ### ⚠️ Pegadinha crítica do HMAC (marcada como incerta pela própria doc)
> O HMAC **NÃO usa o `secret` que você definiu** ao criar o webhook. A doc calcula com uma **chave pública FIXA da AbacatePay** (constante `ABACATEPAY_PUBLIC_KEY`), idêntica em todos os exemplos (Node/Python/Go) — aparentemente compartilhada entre todos os merchants:
> `crypto.createHmac("sha256", ABACATEPAY_PUBLIC_KEY).update(rawBody).digest("base64")`
> Fonte: `pages/webhooks/security`. **A própria auditoria recomenda confirmar com o suporte** se rotacionar seu `secret` também rotaciona a chave HMAC. **Consequência prática para o OLLI:** trate a camada (1) — o `webhookSecret` na query, que é *seu* e secreto — como a **defesa de autenticidade real**, e a camada (2) HMAC como verificação complementar. Não confie apenas no HMAC de chave pública compartilhada.

Valor documentado da constante (literal na doc, não é segredo):
```
ABACATEPAY_PUBLIC_KEY = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9"
```

### Código de verificação (Cloudflare Worker, `crypto.subtle`, base64)

```js
// Verifica X-Webhook-Signature = base64(HMAC-SHA256(rawBody, PUBLIC_KEY)).
async function verificarHmacAbacate(rawBody, sigHeader, publicKey) {
  if (!sigHeader || !publicKey) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(publicKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const macBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  // base64 do MAC (digest("base64") do exemplo Node):
  const esperado = btoa(String.fromCharCode(...new Uint8Array(macBuf)));
  return compararConstante(esperado, sigHeader.trim());   // timing-safe (reuso do stripe.js)
}
```

### Idempotência e retries (obrigatório)

- Idempotência **pelo campo `id` do evento (`log_…`)**, NÃO pelo id do recurso (`bill_`/`pix_char_`) — dois eventos podem apontar o mesmo recurso.
- Qualquer resposta **≠ 2xx** ou timeout ⇒ **reenvio com backoff**. **Responda `200` mesmo para evento já processado.**
- Endpoint deve ser **HTTPS público** — a API rejeita IP privado/localhost (teste local exige túnel). ✅ O OLLI já tem worker HTTPS público.
- Doc recomenda **não validar o payload com schema rígido** (Zod) — campos novos podem surgir.

---

## 6. Modo DEV / testes

- Ative Dev mode no dashboard; a **chave dev** define o ambiente.
- **`simulate-payment`** (§3.3/3.4) marca um Pix como `PAID` sem pagar de verdade — **só com chave dev**.
- Cartões de teste (para Checkout/assinatura): aprovado `4242 4242 4242 4242`; rejeitados `4000000000000002`, `...9995`, `...0127`, `...0069`, `...0101` (validade futura + CVV quaisquer). ⚠️ A doc **não documenta cartão/fluxo de teste específico p/ Pix** — para Pix em sandbox use `simulate-payment`.
- Webhooks criados em Dev mode recebem eventos simulados (`devMode:true`).

---

## 7. Erros, limites e armadilhas

- **`id` sempre na query string** em check/simulate (v1 e v2) — nunca no body/path.
- **`customer` é tudo-ou-nada** em Pix (v1 e v2): informou um campo, os 4 viram obrigatórios. (Boleto v2: só `name`+`taxId`.)
- **`description`:** 37 chars (v1) vs 500 (v2) — v1 trunca silenciosamente.
- **`brCodeBase64` já é `data:image/png;base64,…`** — não prefixe de novo no `<img src>`.
- **Enum `status` tem tamanhos diferentes** (5 na v1 / 9 na v2). Um `switch` que só trata os 5 antigos cai no default quando aparecer `UNDER_DISPUTE`/`APPROVED`/`FAILED`/`REDEEMED`. **Trate default como "não-pago / logar".**
- **Envelope muda:** v1 `{data,error}` / v2 `{data,error,success}`.
- **Assinatura é CARD-only** — **não há recorrência Pix nativa**. Para "assinatura via Pix" no OLLI: cobrança Pix avulsa por período + renovação manual (mesmo modelo do "Pro 12x" avulso já existente).
- **Parcelamento** só cartão, só ONE_TIME/MULTIPLE_PAYMENTS, mín. R$10/parcela, máx 12x.
- **`interest`/`fine`** só valem Boleto (ignorados em Pix/Card).
- **Não há tabela formal de códigos de erro nem rate limits** documentada — só `401`/`402`… na verdade só `401`/`403`.
- **SDK Node:** o oficial atual é **`@abacatepay/sdk`** (TS-first); **`abacatepay-nodejs-sdk` está DEPRECATED**. *(No OLLI não usamos SDK — fetch direto no worker, igual ao Stripe.)*

---

## 8. Blueprint de integração no OLLI

### Contexto do que já existe (reuso)

O worker OLLI (`worker/src/`) já tem **exatamente o padrão** que a AbacatePay pede — dá para copiar do `stripe.js`:

- **`worker/src/creditos.js`** → `lancarCreditos(env, { userId, delta, origem, ref, descricao })` — grava no ledger imutável `public.credit_ledger`, **idempotente por `(origem, ref)`** (409 = já lançado = sucesso). Retorna `{ ok, duplicado }`. **É o alvo direto do webhook de Pix pago para conceder créditos.**
- **`worker/src/stripe.js`** → `upsertAssinatura(env, userId, patch)` (upsert idempotente em `public.assinaturas`, merge por `user_id`) — **hoje é `function` privada, não exportada.** Para reusar no `abacate.js`: **exporte-a** (`export async function upsertAssinatura…`) ou extraia `upsertAssinatura`/`getAssinatura`/`sbHeaders` para um `worker/src/supa.js` compartilhado. **Não duplicar a lógica.**
- **`verificarAssinatura`/`compararConstante`** (HMAC timing-safe com `crypto.subtle`) — o `compararConstante` é reutilizável direto; o HMAC muda só de hex→base64 e de secret→PUBLIC_KEY (código no §5).
- **Roteamento** (`index.js:821`): `if (url.pathname.startsWith('/stripe/')) return handleStripe(...)`. Basta espelhar com `/abacate/`.
- Helpers `json()`, `CORS`, `getUser()` (valida JWT Supabase) — copiar/compartilhar.
- Padrão de **rate limit** (`STRIPE_RL.limit`) — criar binding `ABACATE_RL` análogo.

### O que criar: `worker/src/abacate.js` (novo arquivo)

Estrutura (espelha `stripe.js`), 3 rotas:

```
POST /abacate/pix       → cria cobrança Pix; devolve { id, brCode, brCodeBase64, expiresAt }
GET  /abacate/status    → GET pixQrCode/check?id=  (fallback de polling p/ o app)
POST /abacate/webhook   → recebe eventos; verifica secret(query)+HMAC; credita/assina; 200
```

Esqueleto pronto para codar:

```js
// worker/src/abacate.js — Pix AbacatePay no OLLI (sem SDK, fetch direto).
import { lancarCreditos } from './creditos.js';
import { upsertAssinatura, getUser, json, CORS, compararConstante } from './stripe.js'; // exporte-os

const ABACATE_API = 'https://api.abacatepay.com/v1';           // v1 pixQrCode/* (recomendado)
const ABACATE_PUBLIC_KEY = 'PUBLIC_KEY_DA_DOC';                // ver §5 (HMAC complementar)

export const ABACATE_ROUTES = new Set(['/abacate/pix', '/abacate/status', '/abacate/webhook']);

// Preço de cada pacote de créditos (centavos → quantos créditos concede).
const PACOTES = {
  creditos_50:  { amount: 4900,  creditos: 50,  descricao: 'OLLI 50 creditos'  },
  creditos_200: { amount: 17900, creditos: 200, descricao: 'OLLI 200 creditos' },
};

// ─── POST /abacate/pix ───────────────────────────────
async function criarPix(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  if (!env.ABACATEPAY_API_KEY) return json({ ok: false, erro: 'abacate_nao_configurado' }, 503);

  const body = await request.json().catch(() => ({}));
  const pacote = PACOTES[body && body.pacote];
  if (!pacote) return json({ ok: false, erro: 'pacote_invalido' }, 400);

  // pedidoId único → idempotência do crédito lá no webhook (ver ref abaixo).
  const pedidoId = crypto.randomUUID();
  const externalId = `olli:${user.id}:${pedidoId}:${body.pacote}`;

  const r = await fetch(`${ABACATE_API}/pixQrCode/create`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: pacote.amount,
      expiresIn: 3600,
      description: pacote.descricao.slice(0, 37),   // limite v1
      metadata: { externalId },
    }),
  });
  const { data, error } = await r.json().catch(() => ({}));
  if (!r.ok || error || !data) return json({ ok: false, erro: 'falha_criar_pix' }, 502);

  return json({ ok: true, id: data.id, brCode: data.brCode,
                brCodeBase64: data.brCodeBase64, expiresAt: data.expiresAt });
}

// ─── POST /abacate/webhook ───────────────────────────
async function webhook(request, env, url) {
  // Camada 1 (defesa real): secret na query, que é NOSSO e secreto.
  if (url.searchParams.get('webhookSecret') !== env.ABACATE_WEBHOOK_SECRET)
    return json({ erro: 'nao_autorizado' }, 401);

  const rawBody = await request.text();
  // Camada 2 (complementar): HMAC base64 com a public key da doc (ver §5).
  const sig = request.headers.get('X-Webhook-Signature');
  await verificarHmacAbacate(rawBody, sig, ABACATE_PUBLIC_KEY); // logar se falhar; NÃO bloquear só nisso

  let evt; try { evt = JSON.parse(rawBody); } catch { return json({ erro: 'payload' }, 400); }

  // Pix pago: v1 'billing.paid'  |  v2 'transparent.completed'.
  const pago = evt.event === 'billing.paid' || evt.event === 'transparent.completed';
  if (!pago) return json({ ok: true });   // eventos não tratados: 200

  // Recuperar externalId. ⚠️ metadata pode NÃO vir no webhook (§5): se faltar,
  // re-consulte GET /pixQrCode/check?id= pelo data.id e leia de lá, ou guarde o
  // vínculo (id→userId) numa tabela na criação.
  const ext = (evt.data && (evt.data.externalId
             || (evt.data.transparent && evt.data.transparent.externalId))) || '';
  const [, userId, pedidoId, pacoteKey] = ext.split(':');
  const pacote = PACOTES[pacoteKey];
  if (!userId || !pacote) return json({ ok: true, sem_vinculo: true });   // 200: não reenviar

  // Idempotência dupla: ref no ledger = event.id (log_…). Reenvio → 409 → ok.
  const res = await lancarCreditos(env, {
    userId, delta: pacote.creditos, origem: 'abacate_pix',
    ref: evt.id /* log_… */, descricao: pacote.descricao,
  });
  if (!res.ok) return json({ erro: 'falha_persistencia' }, 500); // 500 → AbacatePay reenvia
  return json({ ok: true });
}

// ─── roteador ────────────────────────────────────────
export async function handleAbacate(request, env, url) {
  const p = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (p === '/abacate/pix'     && request.method === 'POST') return criarPix(request, env);
  if (p === '/abacate/status'  && request.method === 'GET')  return checarStatus(request, env);
  if (p === '/abacate/webhook' && request.method === 'POST') return webhook(request, env, url);
  return json({ erro: 'nao_encontrado' }, 404);
}
```

Ligar no `index.js` (junto do bloco do Stripe, ~linha 821):

```js
import { handleAbacate } from './abacate.js';
// …
if (url.pathname.startsWith('/abacate/')) return handleAbacate(request, env, url);
```

### Cliente (app) — mostrar o Pix

1. `POST /abacate/pix { pacote: 'creditos_50' }` → recebe `{ brCode, brCodeBase64, id, expiresAt }`.
2. **QR:** `<Image source={{ uri: brCodeBase64 }} />` (React Native) ou `<img src={brCodeBase64}>` — **usar o data URI como veio**, sem re-prefixar.
3. **Copia-e-cola:** botão que copia `brCode` para o clipboard ("Copiar código Pix").
4. **Status:** poll leve em `GET /abacate/status?id=…` a cada ~4s até `PAID` (só para UX — a fonte de verdade é o webhook que já creditou). Tratar enum com **default = não-pago** (v2 tem 9 estados).
5. Ao virar `PAID`, atualizar o saldo (o `saldoCreditos`/`assinaturas` já refletem o `lancarCreditos` do webhook).

### Reusa vs cria — resumo

| Reusa (já existe) | Cria novo |
|---|---|
| `lancarCreditos` (ledger idempotente) | `worker/src/abacate.js` (3 rotas) |
| `upsertAssinatura`, `getAssinatura` (**exportar**) | Rota `/abacate/*` no `index.js` |
| `compararConstante` (timing-safe) | `verificarHmacAbacate` (hex→**base64**, secret→**public key**) |
| `getUser`, `json`, `CORS` | Secrets: `ABACATEPAY_API_KEY`, `ABACATE_WEBHOOK_SECRET` |
| Padrão rate-limit (`*_RL.limit`) | Binding `ABACATE_RL` + `PACOTES` (preços) |
| Tabela `credit_ledger` / `assinaturas` | Cadastro do webhook no dashboard AbacatePay (HTTPS + `?webhookSecret=`) |

### Notas de segurança da integração (OLLI)

- **Nunca** conceder crédito otimista no cliente — só o **webhook** (após pagamento confirmado) chama `lancarCreditos` com `ref = event.id`.
- Idempotência em **duas camadas**: `(origem,ref)` único no `credit_ledger` **e** `ref = log_…` do evento ⇒ reenvio da AbacatePay não credita duas vezes (409 → sucesso).
- Autenticidade do webhook: trate o **`?webhookSecret=`** (seu, secreto) como a barreira real; o HMAC de chave pública compartilhada é complementar (⚠️ §5). Confirme com o suporte se o `secret` do webhook entra no HMAC antes de confiar só nele.
- Todos os secrets ficam **no cofre do worker** (mesmo modelo de `STRIPE_SECRET_KEY`), nunca no app — e lembre que, conforme a memória do projeto, **todo push na `main` apaga os secrets do worker**: re-provisionar `ABACATEPAY_API_KEY` e `ABACATE_WEBHOOK_SECRET` após deploy.