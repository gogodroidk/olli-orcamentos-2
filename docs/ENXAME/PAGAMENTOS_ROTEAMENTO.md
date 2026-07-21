# Roteamento de pagamentos — mapa do estado atual e plano de execução

> **Decisão do dono (textual, final):** *"deixe os pagamentos do CARTÃO no STRIPE, e os pagamentos PIX no MERCADO PAGO."*
> Tradução operacional: **cartão → Stripe. Pix → Mercado Pago. Nenhum outro arranjo.**

Documento de **cartografia**: levantado lendo o código, com `arquivo:linha`. Nada aqui foi
editado. É o mapa que os executores seguem.

**Data do levantamento:** 2026-07-20 · **Branch:** `claude/app-complete-analysis-optimization-9a1912`

---

## 0. Veredito em uma tela

| Pergunta | Resposta curta |
|---|---|
| Cartão está no Stripe? | **Sim, e só lá.** App e painel só chamam `/stripe/checkout`. |
| Pix está no Mercado Pago? | **Sim, e só lá.** O único Pix vendido hoje é o de créditos, via `/mp/pix`. |
| Existe venda por MP-cartão hoje? | **A rota existe (`/mp/plano/assinatura`), mas NENHUM cliente a chama.** Código escuro. |
| Existe assinatura viva por MP-cartão? | **Não confirmado — ver §6.** Todos os indícios de código dizem que não. **Rodar a query antes de mexer.** |
| AbacatePay está vivo? | **Não.** Zero chamadores. Só o roteador o importa. |
| Alguma rota está ambígua ou no provedor errado? | **Uma, latente e séria: ver RISCO 1 (§7).** O checkout 12x da Stripe está preparado para aceitar Pix. |

---

## 1. Todas as rotas de pagamento do worker

Despacho no roteador de topo: `worker/src/index.js:46-48` (imports) e:
`/stripe/*` → `index.js:749-751` · `/abacate/*` → `index.js:757-759` · `/mp/*` → `index.js:764-766`.
As três famílias ficam **antes** do gate de IA e cada módulo cuida do próprio método/CORS.

### 1.1 Stripe — `worker/src/stripe.js` · **CARTÃO**

| Rota | Handler | Roteado em | O que faz | Tipo |
|---|---|---|---|---|
| `POST /stripe/checkout` | `handleCheckout` :275 | :916-920 | Cria Checkout Session. Planos aceitos em `CONFIG_PLANO` :294-300 | **CARTÃO** |
| `POST /stripe/portal` | `handlePortal` :359 | :921-925 | Customer Portal: trocar plano, trocar cartão, **cancelar** | CARTÃO (gestão) |
| `GET /stripe/faturas` | `handleFaturas` :402 | :927-931 | Últimas 12 faturas do customer do JWT | leitura |
| `GET /stripe/metodo` | `handleMetodo` :452 | :932-936 | Bandeira + last4 do cartão padrão | leitura |
| `POST /stripe/webhook` | `handleWebhook` :697 | :937-941 | Sincroniza `public.assinaturas` | webhook |
| `GET /stripe/sucesso` | `renderSucesso` :878 | :906 | Página estática | página |
| `GET /stripe/cancelado` | `renderCancelado` :887 | :910 | Página estática | página |

**Produtos vendidos** (`CONFIG_PLANO`, stripe.js:294-300), todos com Price live em `worker/wrangler.jsonc:27-31`:

| `plano` no corpo | Price (env) | Modo Stripe | Natureza |
|---|---|---|---|
| `pro` | `STRIPE_PRICE_PRO` | `subscription` | cartão recorrente mensal |
| `pro_anual` | `STRIPE_PRICE_PRO_ANUAL` | `subscription` | cartão recorrente anual |
| `pro_12x` | `STRIPE_PRICE_PRO_12X` | **`payment`** | avulso parcelado 12x → 12 meses de acesso |
| `empresa` | `STRIPE_PRICE_EMPRESA` | `subscription` | cartão recorrente mensal |
| `empresa_anual` | `STRIPE_PRICE_EMPRESA_ANUAL` | `subscription` | cartão recorrente anual |

### 1.2 Mercado Pago — `worker/src/mercadopago.js`

| Rota | Handler | Roteado em | O que faz | Tipo | Tem chamador? |
|---|---|---|---|---|---|
| `GET /mp/pacotes` | `listarPacotes` :148 | :737 | Catálogo de créditos (`PACOTES` :41-45), público | catálogo | **Sim** (app) |
| `POST /mp/pix` | `criarPixCredito` :154 | :738 | Pix de **créditos** → QR + copia-e-cola | **PIX** | **Sim** (app) |
| `POST /mp/plano/pix` | `criarPixPlano` :178 | :739 | Pix de um **período de plano** (`PLANO_PIX` :48-53) | **PIX** | **NÃO** — dormente |
| `POST /mp/plano/assinatura` | `criarAssinatura` :247 | :740 | **Preapproval recorrente = CARTÃO** (`PLANO_ASSINATURA` :56-59) | **CARTÃO** ⚠️ | **NÃO** — dormente |
| `GET /mp/status` | `checarStatus` :356 | :741 | Polling de status; valida posse em :369-370 | leitura | **Sim** (app) |
| `POST /mp/webhook` | `webhook` :598 | :742 | Credita / ativa plano | webhook | MP |

Motor Pix comum: `criarPagamentoPix` :205 (`payment_method_id:'pix'`, valor em **reais**, expira em 60 min :218).

### 1.3 AbacatePay — `worker/src/abacate.js` · **terceiro provedor de Pix**

| Rota | Handler | Roteado em | O que faz | Tipo | Tem chamador? |
|---|---|---|---|---|---|
| `GET /abacate/pacotes` | :96 | :264 | Catálogo (`PACOTES` :40-44) | catálogo | **NÃO** |
| `POST /abacate/pix` | `criarPix` :104 | :265 | Pix de créditos (expira em 3600 s, :128) | PIX | **NÃO** |
| `GET /abacate/status` | :158 | :266 | Polling | leitura | **NÃO** |
| `POST /abacate/webhook` | :200 | :268 | Credita | webhook | **NÃO** |

---

## 2. O que o APP chama (`src/`)

Base única: `PAGAMENTOS_URL = DIAGNOSTICO_URL` (`src/config.ts:59`) — o worker é o mesmo do diagnóstico.

| Tela | Arquivo:linha | Rota | Provedor · Tipo |
|---|---|---|---|
| **Planos** (assinar) | `src/screens/PlanosScreen.tsx:312` | `POST /stripe/checkout` | **Stripe · CARTÃO** |
| ↳ resolve o id | `PlanosScreen.tsx:336-339` | envia `pro` / `pro_anual` / `empresa` / `empresa_anual` | — |
| ↳ 12x forçado | `PlanosScreen.tsx:401-405` | envia `pro_12x` (só o Pro tem avulso) | — |
| **Assinatura** (faturas) | `src/services/assinatura.ts:158` | `GET /stripe/faturas` | Stripe · leitura |
| **Assinatura** (cartão) | `src/services/assinatura.ts:179` | `GET /stripe/metodo` | Stripe · leitura |
| **Assinatura** (cancelar) | `src/services/assinatura.ts:193,201` (`abrirPortalAssinatura` :196) | `POST /stripe/portal` | Stripe · gestão |
| ↳ botão | `src/screens/AssinaturaScreen.tsx:319` "Gerenciar assinatura / Cancelar" | — | — |
| **Créditos** (catálogo) | `src/services/pixCreditos.ts:75` | `GET /mp/pacotes` | MP · catálogo |
| **Créditos** (comprar) | `src/services/pixCreditos.ts:91` | `POST /mp/pix` | **MP · PIX** |
| **Créditos** (polling) | `src/services/pixCreditos.ts:123` | `GET /mp/status` | MP · leitura |
| ↳ tela | `src/screens/CreditosScreen.tsx:93,121,142` | usa os três | — |

**O app oferece assinatura por MP-cartão hoje? NÃO.** Não há uma única referência a
`/mp/plano/assinatura` nem a `/mp/plano/pix` em `src/`. O app já está exatamente na
configuração que o dono pediu: **cartão no Stripe, Pix no MP.**

**Gate iOS:** `COMPRA_NO_APP = Platform.OS !== 'ios'` (`AssinaturaScreen.tsx:47`,
`ContaScreen.tsx:62`, `CreditosScreen.tsx:45`) — no iPhone a moldura de venda some
(Guideline 3.1.1). Não muda o roteamento; muda só quem vê o botão.

**Comentário obsoleto (não é chamada):** `src/navigation/AppNavigator.tsx:125` diz
*"recarga por Pix (AbacatePay)"* — a tela usa Mercado Pago desde a migração. Texto mentiroso, código certo.

---

## 3. O que o PAINEL chama (`webapp/src/`)

| Arquivo:linha | Rota | Provedor · Tipo |
|---|---|---|
| `webapp/src/pages/olli/planos/checkout.ts:125` (`iniciarCheckout` :112) | `POST /stripe/checkout` | **Stripe · CARTÃO** |

Tipo aceito: `PlanoCheckout = "pro" \| "pro_anual" \| "empresa" \| "empresa_anual"`
(`checkout.ts:41`). **O 12x fica de fora de propósito** — é o valor cheio do ano parcelado,
mais caro que o anual à vista (`checkout.ts:25-27`).

**O painel não chama MP nem Abacate.** Nenhum Pix de SaaS no painel.
Preços/Price IDs da landing: `web/src/data/planos.ts` (Stripe live, conferido 2026-07-19).

> ⚠️ **Não confundir dois "Pix" diferentes neste repo.** Todos os hits de `pix` em
> `webapp/src/pages/olli/inicio/radares.ts`, `meu-negocio/index.tsx:665`,
> `FormOrcamento.tsx:567` etc. são a **chave Pix do prestador para cobrar o cliente dele**
> (BR Code montado em `src/utils/pixBrCode.ts`). Isso **não passa por gateway nenhum** e
> **nada tem a ver** com esta decisão. Não mexer.

---

## 4. Os webhooks — o que cada um credita/ativa

### 4.1 `POST /stripe/webhook` — `stripe.js:697`

Autenticidade: HMAC-SHA256 do header `Stripe-Signature`, janela de 300 s (`verificarAssinatura` :499).
Idempotência **no banco** (`webhook_events`, índice único `(origem,event_id)`) via `reivindicarEvento` :731 —
"não sei" devolve **500** de propósito (:738) para a Stripe reenviar.

| Evento | Linha | Efeito |
|---|---|---|
| `checkout.session.completed` | :741 | Se `metadata.origem === '12x'` → `processar12x` :647 (12 meses, grava `stripe_subscription_id: null`); senão busca a subscription e chama `sincronizarSubscription` :553 |
| `checkout.session.async_payment_succeeded` | :784 | Libera o 12x pago por meio assíncrono |
| `customer.subscription.updated` | :789 | Sincroniza plano/status/vigência |
| `customer.subscription.deleted` | :792 | Força `status:'canceled'` |
| `invoice.payment_failed` | :795 | Marca `past_due` sem cortar acesso |

Escreve em `public.assinaturas`: `plano`, `status`, `stripe_customer_id`,
`stripe_subscription_id`, `current_period_end` (`upsertAssinatura` :149).
Guardas contra regressão de nível/vigência: :580-626 e :661-675.

### 4.2 `POST /mp/webhook` — `mercadopago.js:598`

Autenticidade em duas camadas (:618-632): (1) `x-signature` HMAC — **exigida só se
`MP_WEBHOOK_SECRET` existir**; (2) **GET-confirm** na API do MP, que é a barreira
autoritativa. Teto de amplificação por IP no caminho não assinado: `MPHOOK_RL` :655-661.

| `type` | Linha | Efeito |
|---|---|---|
| `payment` | :664-678 | `GET /v1/payments/{id}`; só `approved` (:667) concede. Lê `external_reference` = `olli:<cr\|pl>:<userId>:<pedido>:<key>` |
| ↳ `cr` (crédito) | :675 → `concederCredito` :408 | `lancarCreditos(origem:'pix', ref:'mp:<paymentId>')` — idempotente por `(origem,ref)` único |
| ↳ `pl` (plano Pix) | :676 → `concederPlanoPeriodo` :427 | Libera N meses; vigência **determinística a partir da data de aprovação** (anti-replay) |
| `subscription_preapproval` / `preapproval` | :681-721 | `GET /preapproval/{id}`; **só `authorized` concede** (:697). Grava `mp_preapproval_id` (:716) |
| ↳ qualquer outro status | :697 → `encerrarPreapproval` :569 | Só `cancelled` **e** com vínculo provado encerra; período pago em curso é mantido (:583-588) |
| `subscription_authorized_payment` | :727 | **NO-OP.** Ver RISCO 2 |

### 4.3 `POST /abacate/webhook` — `abacate.js:200`

Autenticidade: `?webhookSecret=` comparado em tempo constante (:203) + HMAC complementar
não bloqueante (:213). Evento `transparent.completed` / `checkout.completed` →
`lancarCreditos(origem:'pix', ref: evt.id)`.

> **Há assinatura recorrente por MP que precise do webhook para renovar/cancelar?**
> Pelo código, **nenhuma foi vendida** (a rota nunca esteve na UI). Mas o suporte a
> **cancelar** tem de continuar de pé de qualquer forma — ver §8-B.

---

## 5. AbacatePay — veredito

**Está morto.** Grafo de dependências completo:

- **Único import:** `worker/src/index.js:47` → `handleAbacate`, usado só em :757-759.
- **`worker/src/abacate.js` não é importado por mais ninguém** (diferente de `mercadopago.js`,
  que `conta.js:27` importa).
- **Zero chamadores em `src/` e em `webapp/src/`** — a busca por `abacate` nesses dois
  diretórios só retorna o comentário obsoleto de `AppNavigator.tsx:125`.
- Menção residual em `scripts/teste-rotas-metodo.ts:116` (lista `DELEGADAS`).
- `worker/.dry/index.js` é bundle gerado, não fonte.

**O que quebra se sair: nada.** O ledger de créditos é *append-only*; quem pagou por
Abacate no passado mantém o lançamento (`origem:'pix'`), porque remover o módulo não apaga
linha nenhuma. **Não há cobrança pendente possível:** a cobrança Abacate expira em
**3600 s** (`abacate.js:128`) e não há chamador há muito mais que isso — nenhum webhook
atrasado pode chegar para uma cobrança viva.

**VEREDITO: REMOVER** (não deixar dormente). Um terceiro provedor de Pix com rota pública,
secret próprio e binding de rate limit (`ABACATE_RL`, `wrangler.jsonc:53`) é superfície de
ataque e confusão para o próximo leitor, sem nenhum cliente. Deixá-lo dormente contraria a
regra "cada rota de pagamento tem UM dono claro".

*Impacto em gate:* remover `/abacate/` de `index.js` **não quebra** `teste-rotas-metodo.ts`
— o teste itera sobre os prefixos **encontrados em `index.js`** (:130-137); uma entrada a
mais em `DELEGADAS` é inerte. Ainda assim, limpar a linha :116 é higiene.

---

## 6. Assinatura por MP-cartão (preapproval) — existe alguma viva?

### O que o código prova

Três afirmações independentes no próprio repo dizem que **nenhuma foi vendida**:

1. `worker/src/mercadopago.js:723-727` — *"a assinatura por cartão (Preapproval) ainda NÃO
   está exposta na UI — nenhum preapproval é criado em produção."*
2. `worker/src/conta.js:456-457` — *"nenhuma assinatura recorrente do MP foi vendida antes
   desta migration: a rota /mp/plano/assinatura não está exposta na UI."*
3. **Verificação direta minha:** busca repo-wide por `plano/assinatura` fora do worker
   retorna **zero chamadores** em `src/` e `webapp/src/`.

### O que NÃO consegui provar

**Não tive acesso de leitura ao banco nesta sessão** (o MCP do Supabase respondeu
`Unauthorized`). Portanto **não confirmei** de qual provedor são as "2 assinaturas" que o
teste de fumaça reportou. Os testes em `scripts/` são todos **mockados** — não consultam
produção.

O schema tem as duas colunas: `stripe_subscription_id` (usada em `stripe.js:131`) e
`mp_preapproval_id` (`supabase/migrations/20260728_mp_preapproval_id.sql`).

### 🔴 QUERY OBRIGATÓRIA — rodar ANTES de qualquer edição

```sql
select
  count(*)                                           as total,
  count(*) filter (where stripe_subscription_id is not null) as por_stripe_sub,
  count(*) filter (where mp_preapproval_id       is not null) as por_mp_cartao,
  count(*) filter (where stripe_subscription_id is null
                     and mp_preapproval_id is null)  as avulso_12x_ou_pix
from public.assinaturas;

-- Se por_mp_cartao > 0, detalhar antes de tocar em qualquer coisa:
select user_id, plano, status, current_period_end, mp_preapproval_id
from public.assinaturas
where mp_preapproval_id is not null;
```

**Interpretação:**
- `por_mp_cartao = 0` → caminho livre: §8-A pode ser executado como escrito.
- `por_mp_cartao > 0` → **PARE.** Há cartão sendo cobrado pelo MP. Além de preservar tudo
  do §8-B, o RISCO 2 abaixo deixa de ser teórico e **tem de ser resolvido primeiro**.

---

## 7. Riscos encontrados (ordenados por dinheiro em jogo)

### 🔴 RISCO 1 — O checkout 12x da Stripe está preparado para vender Pix

`worker/src/stripe.js:329-343`. No ramo `mode=payment` (o `pro_12x`), o código **omite
`payment_method_types` de propósito**. O comentário :332-337 diz textualmente que o Pix

> *"entra SOZINHO assim que o dono ativar o Pix no dashboard da Stripe — sem mudar código"*

e que o caminho assíncrono do Pix **já está tratado** (`async_payment_succeeded` :784).

**Por que importa:** é exatamente a decisão do dono ao contrário. No dia em que alguém
ligar Pix no dashboard da Stripe — uma ação de painel, sem deploy, sem review — o OLLI
passa a **cobrar Pix pela Stripe**, com a taxa da Stripe, fora do Mercado Pago. Nenhum
alarme dispara. É a única violação real da decisão que existe no código hoje, e ela é
**silenciosa e ativável por fora do repositório**.

**Correção (§8-C4):** fixar `payment_method_types[0] = 'card'` no ramo `mode=payment`.

### 🟠 RISCO 2 — Renovação de assinatura MP-cartão é no-op (condicional)

`worker/src/mercadopago.js:723-727`: `subscription_authorized_payment` responde 200 e **não
faz nada**. É inofensivo **só enquanto não existir preapproval viva**.

Se existir uma: o MP cobra o cartão todo mês, mas `current_period_end` **nunca avança** —
ele foi gravado uma única vez em :700 (`next_payment_date`, ~1 mês). Passada a data, o app
trata a vigência vencida como grátis. **Cobra e não entrega.** Só a query do §6 diz se isso
está acontecendo agora.

### 🟠 RISCO 3 — `MP_WEBHOOK_SECRET` ausente em produção

Confirmado em `docs/ENXAME/BLOQUEIOS.md:174` e `docs/ENXAME/POS_DEPLOY.md:371`. Hoje
`/mp/webhook` aceita requisição sem `x-signature` e se apoia **só** no GET-confirm
(`mercadopago.js:626-632`). O desenho é defensável (o GET-confirm é autoritativo e o
`MPHOOK_RL` :655-661 limita amplificação), mas com o Pix como **único** caminho de Pix do
produto, fechar a camada de assinatura sobe de prioridade. **É passo humano** (registrar o
webhook no painel do MP e guardar o secret).

### 🟡 RISCO 4 — Armadilha de execução: `PLANO_ASSINATURA` tem dois consumidores

`worker/src/mercadopago.js:56-59` é lido por **duas** coisas:
- a **venda** — `criarAssinatura` :255 (vai sair);
- o **webhook** — :688, que resolve o plano a partir do `external_reference`.

**Apagar `PLANO_ASSINATURA` junto com a venda quebra o webhook de preapproval:** `cfg` vira
`undefined`, o handler cai em `sem_vinculo` (:689) e o **cancelamento de uma assinatura viva
deixa de ser processado**. É o erro mais provável desta tarefa. Ver §8-A3.

### 🟡 RISCO 5 — Documentação e comentários mentem (higiene)

- `docs/MERCADOPAGO.md:3` e `worker/src/index.js:761` afirmam que o MP é o **"gateway único"**
  — falso sob a decisão nova.
- `src/navigation/AppNavigator.tsx:125` credita a recarga ao **AbacatePay**.
- `worker/src/mercadopago.js:9-13` (cabeçalho) ainda anuncia `/mp/plano/assinatura`.

Memória do projeto já registra que "copy escrita de memória já mentiu 5x" — vale para
comentário de código também.

---

## 8. Plano de execução

> **Pré-requisito absoluto:** rodar a query do §6. Se `por_mp_cartao > 0`, tratar o RISCO 2
> antes de qualquer remoção.
> **Proibições que continuam valendo:** não rodar `git`, `wrangler deploy` nem `eas`; não
> alterar nada dentro da Stripe ou do Mercado Pago.

### (A) O que DESLIGAR — venda nova por MP-cartão

| # | Ação | Alvo |
|---|---|---|
| A1 | Remover a rota do despacho | `mercadopago.js:740` (`/mp/plano/assinatura`) |
| A2 | Remover do contrato de rotas | `mercadopago.js:64` — tirar `'/mp/plano/assinatura'` de `MP_ROUTES` |
| A3 | **NÃO tocar** em `PLANO_ASSINATURA` | `mercadopago.js:56-59` — o webhook depende (:688). **Ver RISCO 4** |
| A4 | Remover a função de venda | `criarAssinatura` :247-285 |
| A5 | Remover o helper exclusivo da venda | `guardarPreapprovalSeVazio` :294-315 (só :282 chama) |
| A6 | Atualizar o cabeçalho do módulo | `mercadopago.js:9-13` e o comentário `index.js:761` |

**Efeito de A1+A2:** um `POST /mp/plano/assinatura` passa a cair no `nao_encontrado` 404 de
`mercadopago.js:745`. Sem chamador, ninguém sente. Escolha deliberada de 404 (e não 410 ou
503): a rota deixa de existir, ponto — sem estado intermediário ambíguo.

**Sobre `/mp/plano/pix` (mercadopago.js:178,739):** **NÃO remover.** É Pix e está no MP —
**alinhado** à decisão. Só não tem UI. Deixar dormente é decisão de produto do dono
(expor ou não Pix para planos), não uma violação de roteamento. Fora do escopo desta onda.

### (B) O que PRESERVAR — quem já tem, e o cancelamento

**Regra:** desligar a **venda nova** ≠ arrancar o suporte ao que existe. Tudo abaixo fica
**intacto**, mesmo que a query do §6 diga `por_mp_cartao = 0` — porque "0 hoje" não é
"0 para sempre" enquanto o dado não for confirmado, e porque o custo de manter é zero.

| # | Preservar | Onde | Por quê |
|---|---|---|---|
| B1 | Ramo `preapproval` do webhook, inteiro | `mercadopago.js:681-721` | Sem ele, cancelar no MP não chega ao OLLI |
| B2 | `encerrarPreapproval` | `mercadopago.js:569-595` | É o cancelamento, com o guard que não tira plano sem prova |
| B3 | `cancelarPreapprovalMp` | `mercadopago.js:330-353` | **Exportada** e usada em `conta.js:460` |
| B4 | `lerPreapprovalGravado` | `mercadopago.js:525-541` | **Exportada** e usada em `conta.js:450` |
| B5 | `upsertAssinaturaComPreapproval` / `upsertAssinaturaComStatus` | :504 / :462 | Gravam o `mp_preapproval_id` que permite cancelar |
| B6 | `PLANO_ASSINATURA` | :56-59 | RISCO 4 |
| B7 | Bloco de exclusão de conta | `conta.js:445-462` | Fail-closed: não apaga usuário com cartão vivo |
| B8 | Coluna + índice | `supabase/migrations/20260728_mp_preapproval_id.sql` | Não reverter |
| B9 | Testes verdes | `scripts/teste-webhook-mp-assinatura.ts`, `scripts/teste-conta-excluir-mp.ts` | São a rede de segurança exata deste risco |

**Se a query do §6 achar preapproval viva**, acrescentar: implementar
`subscription_authorized_payment` (:727) para avançar `current_period_end` na renovação —
**ou** migrar aquele cliente para Stripe-cartão e cancelar a preapproval pelo painel do MP
(ação do dono, não minha).

### (C) O que APP / PAINEL precisam mudar

| # | Item | Situação | Ação |
|---|---|---|---|
| C1 | App — cartão | `PlanosScreen.tsx:312` já vai para `/stripe/checkout` | **Nada.** Já conforme |
| C2 | App — Pix de créditos | `pixCreditos.ts:75,91,123` já vão para `/mp/*` | **Nada.** Já conforme |
| C3 | Painel — cartão | `webapp/.../checkout.ts:125` já vai para `/stripe/checkout` | **Nada.** Já conforme |
| C4 | **Fechar a porta do Pix na Stripe** | `stripe.js:329-343` omite `payment_method_types` | **Fixar `payment_method_types[0]='card'`** no ramo `mode=payment`. Ver RISCO 1 |
| C5 | Higiene de comentário | `AppNavigator.tsx:125` diz "AbacatePay" | Corrigir para Mercado Pago |
| C6 | Higiene de docs | `docs/MERCADOPAGO.md:3`, `index.js:761` dizem "gateway único" | Reescrever para o arranjo Stripe-cartão / MP-Pix |

**O ponto que surpreende e precisa ficar dito:** *o app e o painel já estão certos.* A
decisão do dono não pede nenhuma mudança de destino de rota no cliente. O trabalho real
desta onda é **(A)** fechar uma porta de venda que nunca foi aberta, **(C4)** fechar uma
porta de Pix que a Stripe pode abrir sozinha, e **(§5)** remover um provedor morto.

### (D) Remoção do AbacatePay

| # | Ação | Alvo |
|---|---|---|
| D1 | Remover o despacho | `worker/src/index.js:757-759` + import :47 |
| D2 | Apagar o módulo | `worker/src/abacate.js` |
| D3 | Limpar a lista do teste | `scripts/teste-rotas-metodo.ts:116` — tirar `'/abacate/'` |
| D4 | Remover o binding | `worker/wrangler.jsonc:53` (`ABACATE_RL`) |
| D5 | **Não** revogar secrets nesta onda | `ABACATEPAY_API_KEY`, `ABACATE_WEBHOOK_SECRET` — ação de cofre, decisão do dono |
| D6 | Marcar `docs/ABACATEPAY.md` como histórico | não apagar (registro de por que saiu) |

---

## 9. Gates (rodar todos antes de considerar feito)

```bash
# 1. sintaxe de cada .js do worker
for f in worker/src/*.js; do node --check "$f" || echo "FALHOU: $f"; done

# 2. app
npm run typecheck        # exit 0

# 3. suíte
npm test                 # verde — atenção especial a:
                         #   scripts/teste-webhook-mp-assinatura.ts
                         #   scripts/teste-conta-excluir-mp.ts
                         #   scripts/teste-rotas-metodo.ts

# 4. painel
cd webapp && npx tsc --noEmit
```

**Prova manual adicional após (A):** confirmar que `MP_ROUTES` (`mercadopago.js:63-65`) e o
despacho (:737-742) listam exatamente o mesmo conjunto de rotas — se divergirem, uma rota
some no 404 sem intenção, que é justamente o que `teste-rotas-metodo.ts` existe para pegar.

---

## 10. Estado final desejado — um dono por rota

| Caminho de dinheiro | Provedor | Rota | Status após a onda |
|---|---|---|---|
| Plano mensal/anual no cartão | **Stripe** | `POST /stripe/checkout` | ativo |
| Plano 12x parcelado no cartão | **Stripe** | `POST /stripe/checkout` (`pro_12x`) | ativo, **pinado em cartão** (C4) |
| Cancelar / trocar cartão | **Stripe** | `POST /stripe/portal` | ativo |
| Créditos por Pix | **Mercado Pago** | `POST /mp/pix` | ativo |
| Plano por Pix | **Mercado Pago** | `POST /mp/plano/pix` | existe, dormente (decisão do dono) |
| Assinatura recorrente por cartão no MP | — | ~~`POST /mp/plano/assinatura`~~ | **removida** (A) |
| Cancelamento de preapproval legada | **Mercado Pago** | `POST /mp/webhook` + `conta.js` | **preservado** (B) |
| Pix pelo AbacatePay | — | ~~`/abacate/*`~~ | **removido** (D) |

Nenhuma rota ambígua. Nenhuma rota cobrando pelo provedor errado. Nenhum caminho de
cancelamento arrancado.
