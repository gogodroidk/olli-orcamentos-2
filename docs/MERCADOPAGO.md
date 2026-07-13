# OLLI × Mercado Pago — Estratégia e Integração

> **Decisão (jul/2026):** o Mercado Pago é o **gateway único** do OLLI — créditos por Pix **e** planos. O AbacatePay travou para novos usuários; o InfinitePay não estava disponível; o dono já tem conta no MP. Ver [PESQUISA_GATEWAY_PRECOS.md](PESQUISA_GATEWAY_PRECOS.md).
>
> Convenção: `[FATO]` = verificado na doc oficial do MP; `[HUMANO]` = passo que só o dono faz (painel/credencial); `[FALLBACK]` = Stripe permanece ativo até o MP validar.

---

## 1. O que já está pronto (código, testado)

Worker `worker/src/mercadopago.js` — **6 rotas**, verificado por 11 testes de lógica (inclusive x-signature real válida e adulterada→401):

| Rota | O que faz |
|---|---|
| `GET /mp/pacotes` | Catálogo de créditos (fonte única de preço; público) |
| `POST /mp/pix` | Cobrança Pix de **créditos** → QR + copia-e-cola |
| `POST /mp/plano/pix` | Cobrança Pix de um **período de plano** (avulso, N meses) |
| `POST /mp/plano/assinatura` | **Assinatura recorrente** (cartão, Preapproval) → `init_point` |
| `GET /mp/status?id=` | Status de um pagamento (polling de UX) |
| `POST /mp/webhook` | Evento pago/assinatura → credita / libera plano |

Cliente: `src/services/pixCreditos.ts` + `CreditosScreen` já apontam para `/mp/*` (créditos por Pix funcionam ponta a ponta assim que os secrets existirem).

**Invariantes preservados** (não mexer): crédito/plano **só no webhook** (nunca otimista no cliente); `ref` = id do pagamento MP → idempotência via `(origem,ref)` único no ledger e upsert por `user_id` nas assinaturas; catálogo de preço numa fonte única.

---

## 2. Contratos do MP usados (verificados na doc oficial)

### Pix (créditos e período de plano) — `POST /v1/payments`
- Header `Authorization: Bearer <MP_ACCESS_TOKEN>` + `X-Idempotency-Key`. `[FATO]`
- Body: `transaction_amount` (**REAIS decimais**, não centavos), `description`, `payment_method_id:"pix"`, `payer.email`, `external_reference`, `notification_url`, `date_of_expiration`.
- Resposta: `id`, `status` (`pending`→`approved`), e o QR em **`point_of_interaction.transaction_data.qr_code`** (copia-e-cola) + **`.qr_code_base64`** (PNG) + `.ticket_url`. `[FATO]`

### Assinatura recorrente — `POST /preapproval`
- **Só cartão** (Pix não recorre). Sem `card_token_id` + `status:"pending"` → o MP devolve **`init_point`** (checkout hospedado onde o usuário informa o cartão — o worker **nunca** toca em dado de cartão). `[FATO]`
- `auto_recurring`: `{ frequency:1, frequency_type:"months", transaction_amount, currency_id:"BRL" }`.

### Webhook — a defesa é a `x-signature`
1. O MP manda só o `id` do recurso (em `?data.id=` e/ou no corpo `data.id`), com `type` = `payment` | `subscription_preapproval` | `subscription_authorized_payment`. `[FATO]`
2. Validar **`x-signature`** (`ts=...,v1=<hmac>`): manifest **`id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;`**, HMAC-SHA256 (hex) com `MP_WEBHOOK_SECRET`, comparado a `v1` em tempo constante. `[FATO]`
3. **Confirmar** via `GET /v1/payments/{id}` (status `approved`) ou `GET /preapproval/{id}` (status `authorized`) — a notificação **não** é a fonte da verdade, o GET é. `[FATO]`

`external_reference` carrega o vínculo: `olli:cr:<userId>:<pedido>:<pacote>` (crédito) · `olli:pl:<userId>:<pedido>:<planoKey>` (plano por Pix) · `olli:as:<userId>:<planoKey>` (assinatura).

---

## 3. Passos para ir ao ar (HUMANO — só você faz)

1. **[HUMANO] Pegar o Access Token de PRODUÇÃO.** MP → *Seu negócio → Configurações → Credenciais → Credenciais de produção* → copiar o **Access Token** (`APP_USR-...`). Guardar no cofre como `MP_ACCESS_TOKEN`.
2. **[HUMANO] Configurar o webhook no painel do MP.** MP → *Suas integrações → (sua aplicação) → Webhooks/Notificações*:
   - **URL:** `https://diagnostico.olliorcamentos.online/mp/webhook`
   - **Eventos:** *Pagamentos* **e** *Assinaturas (planos e assinaturas)*.
   - Copiar a **"Assinatura secreta"** que o painel gera → cofre como `MP_WEBHOOK_SECRET`. (É o segredo do HMAC do `x-signature`.)
3. **[EU] Deploy do worker.** `cd worker && node reparar.mjs` — já restaura `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` do cofre (junto dos outros secrets). Rodar **depois** de você preencher o cofre.
4. **[EU/VOCÊ] Piloto em produção com valor baixo.** Comprar um pacote de crédito real (ou usar as **credenciais de teste** do MP primeiro) e confirmar: QR aparece, pagamento cai, webhook credita, saldo sobe. As credenciais de teste do MP simulam Pix aprovado sem dinheiro real. `[FATO]`

> Enquanto o cofre não tiver os dois valores, as rotas `/mp/*` respondem `503 mp_nao_configurado` (fail-safe: não cria cobrança sem token).

---

## 4. Planos: Pix-por-período × assinatura recorrente

O MP **não recorre por Pix** (só cartão, via Preapproval). Duas ofertas, ambas prontas no worker:

- **Assinatura recorrente (cartão):** `POST /mp/plano/assinatura {plano:'pro'|'empresa'}` → `init_point` → abre o checkout do MP (mesma UX do Stripe). Renova sozinho. Webhook `subscription_preapproval` → libera/`active`.
- **Plano por Pix (avulso, N meses):** `POST /mp/plano/pix {plano:'pro_anual'|...}` → QR. Paga uma vez, libera 1 ou 12 meses (anual −20%, igual ao Stripe). É o caminho **sem cartão**, ideal para o público MEI/CPF (a pesquisa mostrou que ele prefere pré-pago). Webhook `payment` → `upsertAssinatura` sem regredir nível/vigência.

**Cliente (próximo passo, worker já pronto):** na `PlanosScreen`, além do botão Stripe, chamar `/mp/plano/assinatura` (abre `init_point` com `Linking.openURL`) e/ou `/mp/plano/pix` (reusa a `CreditosScreen`-style de QR). Mesma tela de saldo/QR já existe.

---

## 5. Coexistência com o Stripe (migração em fases)

Stripe **continua ativo** — não se arranca um sistema de pagamento que funciona antes do substituto provar. `[FALLBACK]`

- **Fase 1 (agora):** créditos por Pix **no MP** (Stripe nunca cobrou crédito — sem conflito). ✅ pronto.
- **Fase 2:** planos por Pix/assinatura **no MP** como opção, Stripe ainda disponível. Ambos escrevem na **mesma** tabela `public.assinaturas` (upsert por `user_id`); o MP grava `stripe_subscription_id: null` (como o "Pro 12x" avulso da Stripe já faz), então os eventos de subscription da Stripe **não colidem** com as linhas do MP.
- **Fase 3 (cutover):** quando o MP provar estabilidade, esconder o Stripe da UI. O worker do Stripe pode ficar de pé (barato) como rede de segurança.

⚠️ **Gerenciar/cancelar** uma assinatura MP (Preapproval) exige guardar o `preapproval_id`. Hoje não há coluna para ele (a tabela é Stripe-nomeada). Para o **cancelamento in-app** de assinatura MP (Fase 2+), adicionar `mp_preapproval_id text` em `assinaturas` (migração simples) — não é preciso para créditos nem para o "plano por Pix".

---

## 6. Preços (decisão do dono — pendente)

Divergência real no repo (ver PESQUISA_GATEWAY_PRECOS.md §3): o código cobra **R$0,25–0,50/crédito** (margem provada 72–91%); o rascunho em `docs/ESTRATEGIA_SUPERIOR.md` é 2,5–3,3× mais barato (encosta no piso de custo). **Antes de comunicar preço,** decidir a tabela e alinhar o doc ao código. A pesquisa de preço com usuários (Van Westendorp + Gabor-Granger) está desenhada na §4 daquele doc. Planos: **não baixar** Pro (R$39)/Empresa (R$99); há espaço para subir o Empresa depois que multiusuário sair do "em breve".

Com o MP, a taxa de Pix é **0,49% (QR) a 0,99% (checkout)** `[FATO]` — some do lado da margem, mas ainda muito abaixo do custo por lead do GetNinjas (R$12–30). Preferir o canal **QR/`/v1/payments`** (0,49%) ao checkout hospedado quando possível.

---

## 7. Riscos

1. **Recorrência de plano é cartão** (Preapproval). Público CPF/MEI resiste a cartão → **empurrar o "plano por Pix" avulso** como padrão e deixar a assinatura de cartão como opção. `[FATO]`
2. **Retenção de saldo por antifraude** (padrão de PSP grande, relatos no Reclame Aqui). Mitigar: sacar com frequência, não acumular saldo na conta MP. `[FATO]`
3. **Webhook depende do `MP_WEBHOOK_SECRET` correto** — se o painel rotacionar a assinatura secreta, atualizar o cofre e redeployar, senão todo webhook cai em `401`. Monitorar.
4. **`transaction_amount` em reais, não centavos** — erro clássico. O código já converte (`amount/100`); qualquer novo valor de plano entra em reais.
5. **Cutover do Stripe** só depois do piloto MP passar em produção real.
```
