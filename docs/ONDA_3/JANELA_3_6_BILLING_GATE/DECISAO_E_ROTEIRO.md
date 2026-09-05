# J3.6 — Decisão de billing e roteiro de lifecycle sandbox

Data de corte: 2026-09-04  
Status: `DONE_LOCAL_ONLY`  
Aceite de billing real: `false`

## Conclusão da reconciliação

O repositório já contém uma decisão comercial por trilho, mas a expressão “fonte da verdade” está sendo usada para duas coisas diferentes:

1. **origem do pagamento** — Stripe, Mercado Pago ou, futuramente, Apple IAP;
2. **entitlement efetivo** — o snapshot servidor que diz qual plano está ativo, até quando e em qual revisão.

O código atual não possui um único provider de cobrança:

| Canal/instrumento | Caminho atual | Estado local |
| --- | --- | --- |
| cartão no web | Stripe Checkout mensal/anual/12x | implementado e coberto localmente |
| cartão em Android fora da Play | Stripe, condicionado à política do canal | código e guardas locais; não aceito em loja |
| app distribuído pela Play | compra externa escondida | guardas locais aprovadas; billing da loja não está implementado |
| iOS | decisão D-16 aponta Apple IAP | compra externa escondida; StoreKit/reconciliação ainda não implementados |
| Pix de créditos | Mercado Pago | implementado e coberto localmente |
| Pix de período Pro/Empresa | Mercado Pago, pagamento avulso | implementado e coberto localmente |
| cartão recorrente Mercado Pago | venda nova removida | somente webhook/cancelamento de legado preservados |

A decisão D-03 registra “webhook Stripe” como fonte do plano, enquanto o runtime atual também permite que um Pix de período aprovado pelo Mercado Pago atualize `public.assinaturas`. Isso é uma divergência documental real, não uma falha que possa ser resolvida escondendo um dos caminhos.

## Arquitetura recomendada para aprovação

Adotar uma única **fonte autoritativa de entitlement**, e não necessariamente um único meio de pagamento:

```text
evento assinado/confirmado do provider
            ↓
adaptador idempotente por provider
            ↓
journal de billing imutável e tenant-bound
            ↓
reconciliador servidor com revisão monotônica
            ↓
snapshot autoritativo de entitlement
            ↓
clientes somente leem; nunca se auto-promovem
```

Regras propostas:

- `public.assinaturas` (ou seu sucessor versionado) é o snapshot de leitura, não o log histórico e não a prova de pagamento.
- Cada provider grava primeiro um evento normalizado e idempotente; o snapshot só muda pela reconciliação servidor.
- Checkout iniciado, retorno de sucesso no navegador, polling do cliente e cache local nunca concedem plano.
- Um pagamento isolado não amplia privilégio sem vínculo tenant/usuário, produto reconhecido, status autoritativo e política de vigência.
- Revisão de entitlement é monotônica; evento atrasado não rebaixa nem estende acesso indevidamente.
- Replay do mesmo evento produz a mesma decisão.
- Upgrade preserva o maior nível/vigência já pagos; cancelamento preserva o período quitado e agenda o downgrade.
- Identificadores de gateway ficam somente no backend e nas visões administrativas redigidas.
- Stripe fica como origem de cartão novo; Mercado Pago fica como origem de Pix e suporte de cancelamento legado; Apple IAP precisa de adapter próprio antes de venda no iOS.

Esta é a opção que melhor corresponde ao runtime já existente e ao reconciliador local. Ela ainda requer aceite do proprietário porque substitui a frase simplificada “Stripe é a fonte” por “o snapshot servidor reconciliado é a fonte; providers são origens de eventos”.

## Alternativa de simplificação

Se o proprietário exigir literalmente um único provider de plano na primeira release, a opção de menor mudança documental é **Stripe para planos no web/Android permitido**, desativando a venda nova de `/mp/plano/pix` e mantendo Mercado Pago apenas para créditos Pix e encerramento legado. Mesmo assim, Apple IAP continua necessário no iOS caso haja venda de funcionalidade digital dentro do app.

Essa alternativa reduz trilhos de plano, mas remove Pix avulso de Pro/Empresa. Não deve ser aplicada sem uma decisão comercial explícita e um plano de compatibilidade para pagamentos/vigências já existentes.

## Provas locais executadas

| Prova | Resultado |
| --- | --- |
| `test:roteamento-pagamentos` | `44/44`: venda nova de cartão MP ausente, Pix no MP, cartão na Stripe e legado preservado |
| `test:stripe-12x-idempotencia` | `5/5`: vigência determinística por evento e bordas de calendário |
| `test:webhook-mp-assinatura` | `24/24`: transições, vínculo, falha de leitura e preservação do período |
| `test:cobranca-ia-ponta-a-ponta` | `58/58`: cota, crédito, replay e falhas sem cobrança indevida |
| `test:monetization-entitlement-reconciliation` | `43/43`: snapshot servidor autoritativo, tenant, revisão e fail-closed |
| `test:planos-ios` | `25/25`: compra externa escondida nos builds nativos aplicáveis |
| `test:planos-fonte` | `31/31`, incluindo `7/7` mutações: preços e guards vêm da fonte local correta |

Total desta janela: `230/230` asserções aprovadas. São testes sintéticos/locais; não comprovam provider, assinatura real, conta sandbox, webhook público, segundo ciclo nem loja.

## Lifecycle sandbox obrigatório

Executar somente após autorização específica de conta sandbox, provider, usuário sintético e janela:

1. **Preflight** — confirmar modo sandbox/teste, produto/preço, retorno HTTPS, endpoint de webhook, segredo protegido, limite de gasto zero e usuário sintético sem dados reais.
2. **Checkout criado** — provar que apenas o provider/instrumento aprovado foi usado e que o simples retorno ao app não concedeu entitlement.
3. **Pagamento aprovado** — receber webhook com assinatura válida, reconsultar o provider quando a política exigir e persistir o evento antes de reconciliar.
4. **Replay** — reenviar o mesmo evento e comprovar zero duplicação de vigência, cobrança lógica, crédito ou revisão.
5. **Evento fora de ordem** — entregar evento antigo após um novo e comprovar que não há rebaixamento/extensão indevida.
6. **Renovação/segundo ciclo** — avançar o relógio do sandbox ou usar evento oficial do provider; provar nova vigência uma única vez.
7. **Falha de pagamento** — comprovar estado `past_due`/equivalente sem inventar acesso; aplicar somente a política de grace aprovada.
8. **Cancelamento** — cancelar no provider, manter o período quitado e agendar downgrade no fim da vigência.
9. **Downgrade** — comprovar retorno ao Grátis sem apagar orçamentos, clientes, PDFs, histórico ou dados pagos.
10. **Reembolso/disputa** — definir política explícita antes do teste; registrar evento e decisão auditável, sem deleção destrutiva.
11. **Reautenticação e posse** — outro usuário/tenant não consegue consultar status, portal, fatura nem entitlement do sintético.
12. **Fechamento** — remover o usuário/objetos sintéticos somente pelo roteiro aprovado, preservar evidência sanitizada e confirmar zero cobrança real.

## Evidência mínima de aceite

- IDs de eventos sanitizados ou hashes, sem segredo nem PII.
- Estado antes/depois do journal e do snapshot de entitlement.
- Assinatura do webhook validada e motivo explícito quando rejeitada.
- Contagem de efeitos para replay e evento fora de ordem.
- Vigência exata nos ciclos 1 e 2.
- Prova de cancelamento e downgrade com dados preservados.
- Plano de rollback e owner da operação.

## Gates que permanecem abertos

- `billing-source-of-truth`: aguarda o aceite de uma das duas formulações acima e a atualização formal das decisões conflitantes.
- `billing-sandbox-lifecycle`: aguarda conta/credenciais sandbox, provider escolhido e autorização para criar transações exclusivamente de teste.

Nenhuma credencial foi aberta, nenhum checkout foi criado, nenhum webhook externo foi chamado e nenhuma cobrança foi gerada nesta janela.
