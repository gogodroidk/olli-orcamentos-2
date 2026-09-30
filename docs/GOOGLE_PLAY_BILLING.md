# Assinatura pela Google Play (RevenueCat) — passo a passo

Estado em 30/09/2026: **código pronto e DESLIGADO**. O Android da Play hoje não vende nada
(regra da loja: bem digital só pelo Play Billing). Este documento é o que falta de **humano**
para ligar a venda de Pro e Empresa pela própria Google Play.

## Como funciona (resumo de 1 minuto)

```
App Android ──(SDK react-native-purchases, appUserID = id do Supabase)──▶ Google Play (cobra)
                                                                          │
                                                RevenueCat valida o recibo com o Google
                                                                          │
                     POST https://diagnostico.olliorcamentos.online/revenuecat/webhook
                     Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
                                                                          │
                                    worker/src/revenuecat.js ──▶ public.assinaturas
                                                                          │
                                  o app relê o plano do SERVIDOR (nunca libera sozinho)
```

- **Liga sozinho quando** o build Android tem `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` (chave pública
  `goog_…`) e não está no Expo Go. Sem isso, a tela de Planos fica exatamente como antes.
- **iOS continua sem compra.** A web continua vendendo por Stripe/Pix.
- **Preço:** o app mostra o preço que a **Play devolve** (cadastrado no Play Console). Nenhum
  número é digitado no app para a Play.
- Código: `src/services/playBillingRegras.ts` (catálogo único, usado pelo app e pelo worker),
  `src/services/playBilling.android.ts` (único arquivo que fala com o SDK),
  `worker/src/revenuecat.js` (webhook), migration `20260930120000_assinaturas_revenuecat.sql`.

## Catálogo — os IDs têm de ser EXATAMENTE estes

| Assinatura (Play Console) | Plano básico | Produto no RevenueCat | Entitlement | Plano OLLI |
|---|---|---|---|---|
| `olli_pro` | `mensal` (renova a cada 1 mês) | `olli_pro:mensal` | `pro` | Pro |
| `olli_pro` | `anual` (renova a cada 1 ano) | `olli_pro:anual` | `pro` | Pro |
| `olli_empresa` | `mensal` | `olli_empresa:mensal` | `empresa` | Empresa |
| `olli_empresa` | `anual` | `olli_empresa:anual` | `empresa` | Empresa |

Qualquer outro ID não libera plano (o worker registra ALARME). Para mudar o catálogo, mude
`ASSINATURA_PLAY_POR_PLANO` em `src/services/playBillingRegras.ts` — app e worker leem de lá.

---

## Ordem dos passos humanos

### 0. Pré-requisitos
- Conta de desenvolvedor da Play com **perfil de pagamentos (comerciante)** ativo
  (Play Console › Configuração › Perfil de pagamentos). Sem ele não dá para criar assinatura.
- O PR deste recurso **mesclado na `main`** (produção só sai da `main`).

### 1. Banco — aplicar a migration (antes de tudo que gera evento)
`supabase/migrations/20260930120000_assinaturas_revenuecat.sql` (Management API ou MCP).
Conferir:
```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='assinaturas' and column_name like 'revenuecat_%';
-- 4 linhas: revenuecat_evento_em, revenuecat_produto_id, revenuecat_transacao_id, revenuecat_vigencia_ate
```
Sem as colunas o webhook responde 503 (não decide às cegas) e o RevenueCat reenvia até 5 vezes.

### 2. Play Console — criar as assinaturas
1. É preciso que a Play conheça um AAB **com a permissão de faturamento**. Gere um build com o SDK
   (passo 7 — pode ser ainda sem a chave) e suba na faixa **Teste interno**. Só depois disso o
   menu de assinaturas libera.
2. Play Console › (app OLLI) › **Monetizar › Produtos › Assinaturas › Criar assinatura**:
   - ID `olli_pro`, nome "OLLI Pro".
   - Dentro dela, **Adicionar plano básico**: ID `mensal`, tipo *Renovação automática*, período
     *1 mês*; e ID `anual`, *Renovação automática*, *1 ano*.
   - Preço de cada plano básico: o **mesmo valor da web**, lido de `src/services/precosPlanos.ts`
     (`PRECO_PRO.mensalCentavos` e `PRECO_PRO.anualCentavos`, em centavos). Não copie de memória.
   - **Ative** os dois planos básicos.
3. Repita para `olli_empresa` (`PRECO_EMPRESA.mensalCentavos` / `PRECO_EMPRESA.anualCentavos`).
4. Em cada assinatura, deixe **Período de carência** ligado (o padrão da Play). O worker mantém o
   acesso durante a carência (evento `BILLING_ISSUE`) e só corta no `EXPIRATION`.
5. Não crie oferta de teste grátis/introdutória agora (dá para ligar depois; o worker já trata
   `period_type: TRIAL` como `trialing`).

### 3. Google Cloud + Play Console — conta de serviço para o RevenueCat
Segue o guia oficial "Creating Play Service Credentials" do RevenueCat. Em resumo:
1. No Google Cloud (projeto `olli-orcamentos`), **ativar** as APIs *Google Play Android Developer
   API* e *Cloud Pub/Sub API*.
2. IAM › Contas de serviço › **Criar** (ex.: `revenuecat-play`), papéis *Pub/Sub Editor* e
   *Monitoring Viewer*. Criar uma **chave JSON** e baixar. Guardar no cofre
   (`CONFIG CLAUDE\credenciais-locais.env` aponta para o arquivo; nunca no repo).
3. Play Console › **Usuários e permissões › Convidar novos usuários** › e-mail da conta de serviço,
   com acesso ao app OLLI e as permissões: *Ver informações do app e baixar relatórios em massa*,
   *Ver dados financeiros, pedidos e respostas a pesquisas de cancelamento*, *Gerenciar pedidos e
   assinaturas*.
4. A validação das credenciais pelo Google pode levar **até 36 horas**. Não é erro se o RevenueCat
   disser "credentials not valid yet" no primeiro dia.

### 4. RevenueCat — projeto, app e notificações
1. Criar conta em app.revenuecat.com (e-mail do dono) › **Novo projeto** "OLLI".
2. **Apps › + App › Google Play**: pacote `online.olliorcamentos.app`; subir o JSON do passo 3.
3. Na mesma tela, **Google Real-Time Developer Notifications › Connect to Google**: o RevenueCat
   gera um tópico Pub/Sub. Copiar o nome do tópico e colar em Play Console › **Monetizar ›
   Configuração da monetização › Notificações do desenvolvedor em tempo real** › *Enviar mensagem
   de teste* (tem de chegar no RevenueCat).
4. **Project settings › General › Restore behavior = "Keep with original App User ID"**.
   Obrigatório: com o padrão ("Transfer to new App User ID") uma mesma compra da Play poderia
   virar plano de duas contas OLLI. Com "Keep", restaurar em outra conta dá o erro
   `receipt_already_in_use`, que o app traduz para "esta assinatura já está ligada a outra conta
   OLLI". Se um evento `TRANSFER` chegar mesmo assim, o worker registra ALARME e não mexe em plano.

### 5. RevenueCat — produtos, entitlements e oferta
1. **Product catalog › Products › Import** (ou + New) os 4 produtos da tabela acima
   (`olli_pro:mensal`, `olli_pro:anual`, `olli_empresa:mensal`, `olli_empresa:anual`).
2. **Entitlements**: criar `pro` (anexar `olli_pro:mensal` e `olli_pro:anual`) e `empresa`
   (anexar `olli_empresa:mensal` e `olli_empresa:anual`).
3. **Offerings**: criar `default` e marcá-la como **Current**. Adicionar 4 pacotes, um por produto
   (identificador livre, ex.: `pro_mensal`, `pro_anual`, `empresa_mensal`, `empresa_anual`). O app
   escolhe pelo **produto**, não pelo nome do pacote; produto fora do catálogo é ignorado.

### 6. Chaves e webhook
1. **Chave pública do SDK** (RevenueCat › Project settings › API keys › *Google Play* — começa com
   `goog_`). É pública por natureza (vai dentro do app). Colocar em `eas.json`, no `env` dos
   perfis `preview` e `production`:
   `"EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY": "goog_..."`.
   **Nunca** use a *Secret API key* (`sk_…`) no app — o app a recusa e fica desligado.
2. **Segredo do webhook** (≥ 32 caracteres; menos que isso o worker fica desligado):
   ```bash
   openssl rand -hex 32            # guardar no cofre
   cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
   ```
3. **Deploy do worker a partir da `main`** (`cd worker && npm ci && env -u CLOUDFLARE_API_TOKEN npx wrangler deploy`).
   O deploy também provisiona o limitador `RCHOOK_RL` (teto por IP do webhook).
   Conferir que está desligado→ligado:
   `curl -s -X POST https://diagnostico.olliorcamentos.online/revenuecat/webhook` → `401`
   (sem o secret seria `503 {"erro":"revenuecat_desligado"}`).
4. RevenueCat › **Integrations › Webhooks › + Add**:
   - URL: `https://diagnostico.olliorcamentos.online/revenuecat/webhook`
   - **Authorization header value**: `Bearer <o segredo do passo 2>` (com o "Bearer " na frente).
   - Ambiente: *Production and Sandbox* (o worker ignora sandbox salvo no passo 8).
   - Eventos: todos.
   - **Send test event** → resposta `200 {"ok":true,"acao":"ignorar","motivo":"teste"}` e uma linha
     em `webhook_events` com `origem='revenuecat'`.

### 7. Build
`eas build -p android --profile production` (ou `preview` para o teste interno) com a chave no
`eas.json`. Testar o boot no emulador `olli_phone` antes de subir. Subir o AAB na faixa
**Teste interno**. Expo Go **não** serve: lá o SDK simula compras e o app se desliga de propósito.

### 8. Testar com licença de teste (sem cobrança real)
1. Play Console › **Configuração › Teste de licença**: adicionar as contas Gmail de teste, resposta
   `RESPOND_NORMALLY`. Essas contas também têm de estar na lista de testadores da faixa interna.
2. Ligar a aceitação de sandbox no worker **só durante o teste**:
   ```bash
   cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler secret put REVENUECAT_ACEITAR_SANDBOX   # valor: true
   ```
3. No aparelho (logado na conta Google de teste e numa conta OLLI de teste):
   - Planos › aba Mensal › **Assinar Pro — <preço da Play>/mês** → folha da Play mostra
     "cartão de teste" → comprar. Em segundos o app diz **Plano liberado**.
   - Conferir: `select plano,status,current_period_end,revenuecat_produto_id from public.assinaturas where user_id='<id>';`
     e `select tipo,status,erro from public.webhook_events where origem='revenuecat' order by id desc limit 10;`
   - Na licença de teste a assinatura mensal **renova a cada 5 minutos** (anual: 30 min), até 6
     renovações — cada uma chega como `RENEWAL` e empurra `current_period_end`.
   - Play Store › Pagamentos e assinaturas › cancelar → chega `CANCELLATION` (acesso continua até
     o fim do ciclo) e depois `EXPIRATION` → a conta volta ao Grátis.
   - Reembolso pelo Play Console (Gestão de pedidos › reembolsar) → `CANCELLATION` com
     `CUSTOMER_SUPPORT` → plano encerrado na hora.
   - Outro aparelho, mesma conta Google e mesma conta OLLI › **Restaurar compras da Google Play**.
   - Mesma conta Google, **outra** conta OLLI › restaurar → mensagem "já está ligada a outra conta".
   - Uma conta que já tem Pix/Stripe vigente: comprar pela Play não pode encurtar nem rebaixar o
     plano (o worker preserva o maior nível e a maior vigência).
4. **Desligar a aceitação de sandbox** ao terminar:
   `cd worker && env -u CLOUDFLARE_API_TOKEN npx wrangler secret delete REVENUECAT_ACEITAR_SANDBOX`.

### 9. Produção
Promover o AAB para a faixa de produção. Acompanhar os primeiros dias:
```sql
select tipo, status, erro, count(*) from public.webhook_events
 where origem='revenuecat' group by 1,2,3 order by 4 desc;
-- status 'falhou' com erro = ALARME (produto desconhecido, id anônimo, TRANSFER…): olhar um a um
```

---

## Regras que o worker aplica (para quem for reconciliar)

| Evento | O que acontece em `public.assinaturas` |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `SUBSCRIPTION_EXTENDED`, `REFUND_REVERSED` | concede o plano do produto até `expiration_at_ms` (`trialing` se `period_type=TRIAL`) |
| `CANCELLATION` (renovação desligada) | nada — o acesso segue até o fim do ciclo |
| `CANCELLATION` com `cancel_reason=CUSTOMER_SUPPORT` (reembolso) ou vigência vencida | `canceled`, vigência = agora |
| `EXPIRATION` | `canceled` na data da loja |
| `BILLING_ISSUE` com carência | estende a vigência até o fim da carência (`active`) |
| `PRODUCT_CHANGE`, `SUBSCRIPTION_PAUSED`, `TEMPORARY_ENTITLEMENT_GRANT`, outros | só trilha |
| `TRANSFER`, produto desconhecido, id anônimo, loja ≠ Play | **ALARME** no log + `webhook_events.status='falhou'` |
| `SANDBOX` sem `REVENUECAT_ACEITAR_SANDBOX=true` | ignorado |

- **Prova de vínculo:** encerramento só age se o `original_transaction_id` do evento for o gravado
  em `revenuecat_transacao_id`.
- **Outra origem:** se `current_period_end` > `revenuecat_vigencia_ate`, quem sustenta o plano é
  Stripe/Pix; o fim da Play não derruba nada. Na concessão sobre plano vigente de outra origem,
  fica o maior nível e a maior vigência. As colunas `stripe_*`/`mp_*` nunca são tocadas.
- **Fora de ordem:** evento com `event_timestamp_ms` mais velho que `revenuecat_evento_em` é ignorado.
- **Idempotência:** `webhook_events (origem='revenuecat', event_id=event.id)`.

## Limites conhecidos (próximos passos, não bloqueiam)
- Quem já é assinante não vê botão de compra na tela de Planos: **troca Pro → Empresa pela Play**
  ainda não é oferecida no app (hoje: cancelar na Play e assinar o outro).
- Quem tem **ao mesmo tempo** assinatura Stripe e Play numa conta: um evento tardio da Stripe para
  aquela assinatura pode sobrescrever a linha (a Stripe não conhece as colunas da Play). Raro — o
  Android não vende Stripe —, mas se aparecer, reconciliar à mão pelo `webhook_events`.
- A taxa da Google para assinaturas é de 15%; o preço na Play pode ser ajustado no Play Console sem
  novo build (o app mostra o que a loja devolver).

## Desligar (rollback)
- Parar de vender: build sem `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` (a tela volta a só informar).
- Parar de processar: desativar o webhook no RevenueCat ou apagar o secret
  (`wrangler secret delete REVENUECAT_WEBHOOK_SECRET` → rota responde 503 "desligado").
  Quem já assinou continua com o plano até a vigência gravada.
