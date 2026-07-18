# AUDITORIA DE RISCO — Onda 23 (18/07/2026)

> 6 auditores read-only (dinheiro · regras de loja · isolamento multi-tenant · contrato app↔painel ·
> erro-vira-vazio/offline · runtime no aparelho). Cada achado passou por **3 céticos com lentes
> distintas** (o código faz mesmo isso? / existe caminho real que produz a falha? / já existe defesa
> que o achado ignorou?), com regra de morrer se 2 refutassem.
> Run `wf_baf05f6c-56f` — 67 agentes. Saída bruta completa no output da task `wr5lkpdj8`.

## Ressalva honesta sobre o método
**20 achados, 0 refutados.** Painel que não mata nada é sinal amarelo, não selo de qualidade — pode
significar que os céticos foram complacentes. Por isso os 4 de maior consequência foram
**reconferidos à mão** antes de virar trabalho (ver abaixo). Os demais entram como hipótese forte,
não como fato provado.

### Reconferidos pessoalmente (leitura direta do código)
| Achado | Verificação | Veredito |
|---|---|---|
| Cobrança de IA é opt-in do cliente | `worker/src/creditos.js:137` — `if (confirmarCredito !== true …) return { bloqueado: false }` | **confirmado** |
| iOS sem gate de compra | `PlanosScreen.tsx` tem **0** ocorrências de `Platform`; nenhuma lib de IAP no `package.json` | **confirmado** |
| Backup do técnico leva base do dono | `decidirEscritaEquipe` é usado em `cloudSync.ts:641` mas **não** em `autoBackup.ts` | **confirmado** |
| Pull de empresa sem dono | `cloudSync.ts:1285` — `.select('*').maybeSingle()` sem `.eq('user_id', …)` | **confirmado** |

---

## VEREDITO

1. **O iPhone está bloqueado por política, não por engenharia.** Dois pontos independentes da
   Guideline 3.1.1: a tela de Créditos mostra QR de Pix dentro do app (a regra cita QR nominalmente)
   e o "Assinar" abre o Stripe no navegador (link-out). Nenhum é ajuste de metadado.
2. **Android não está bloqueado hoje, mas está fora da política** do Google Play Billing. Existe
   caminho legal (user choice billing, com o Brasil na lista), mas exige inscrição **e** a Billing
   Library — nenhuma das duas existe.
3. **O dinheiro está aberto em produção.** Conta grátis com JWT válido que simplesmente não mande
   `confirmarCredito` usa Gemini ilimitado. A conta é do dono.
4. **Dado de cliente vaza entre contas.** O backup automático do técnico grava a base inteira do
   dono sob o `user_id` dele — e ele leva isso ao ser desligado.
5. **O documento comercial não é confiável.** O app sobrescreve orçamento já **aprovado** sem
   congelar versão (o painel bloqueia a mesma edição), e app e painel usam contadores diferentes:
   dois orçamentos de clientes diferentes podem sair com o mesmo número.

---

## P0 — antes de qualquer envio

| # | Achado | Arquivo | Conserto |
|---|---|---|---|
| 1 | Cobrança de IA é opt-in do cliente | `worker/src/creditos.js:137` | Decisão 100% no servidor (cota em tabela + débito), sem flag vinda do corpo |
| 2 | iOS: crédito consumível vendido por Pix (QR na tela) | `src/screens/CreditosScreen.tsx:123` | Esconder a compra no iOS até existir StoreKit |
| 3 | iOS: "Assinar" abre Stripe no navegador (link-out) | `src/screens/PlanosScreen.tsx:247` | Idem — plano read-only no iPhone |
| 4 | Backup do técnico copia o banco do dono pro tenant dele | `src/services/autoBackup.ts:89` | Aplicar a guarda `decidirEscritaEquipe` que o `cloudSync` já usa |
| 5 | Empresa do dono gravada sob o `user_id` do técnico | `src/services/cloudSync.ts:1285` | Filtrar por dono; não empurrar `empresa` quando o contexto for membro |
| 6 | App sobrescreve orçamento aprovado (painel bloqueia) | `src/database/database.ts:1236` | Incluir `aprovado`/`convertido` na trava + esconder Editar |

## P1 — antes de escalar usuário

| # | Achado | Arquivo |
|---|---|---|
| 7 | Webhook de preapproval do MP pode apagar plano pago vigente | `worker/src/mercadopago.js:448` |
| 8 | Android: bem digital sem Play Billing | `src/services/pixCreditos.ts` |
| 9 | Sentry ligado, mas a política de privacidade diz que analytics não sai do aparelho | `App.tsx:58` vs `src/content/legal/privacidade.ts:140` |
| 10 | "Sair e manter dados" não limpa AsyncStorage: chat da OLLI fica pro próximo usuário | `src/screens/ContaScreen.tsx:421` |
| 11 | Checklist/snooze do usuário anterior enviados pra conta do próximo | `src/services/cloudSync.ts:1849` |
| 12 | Numeração colide entre painel (MAX) e app (contadores) | `webapp/src/olli/mutacoes.ts:90` vs `src/database/database.ts:1449` |

## P2 — dívida real, não bloqueia envio

| # | Achado | Arquivo |
|---|---|---|
| 13 | Excluir conta não cancela assinatura recorrente do MP — cartão segue sendo cobrado | `worker/src/conta.js:204` |
| 14 | `lancarCreditos` trata qualquer 409 como "já lançado" — crédito pago some calado | `worker/src/creditos.js:61` |
| 15 | IA generativa sem caminho de denúncia in-app (política de AI-Generated Content do Play) | `src/screens/OlliChatScreen.tsx` |
| 16 | Excluir conta não revoga o token do Sign in with Apple | `worker/src/conta.js:175` |

---

## BLOQUEIO DE LOJA — a seção que decide se o app entra

### iOS (App Store)
- **Código:** no build iOS não pode existir `criarCobrancaPix`, imagem do QR, texto copia-e-cola nem
  a frase "aponte a câmera do banco" (`CreditosScreen`), e nem o `Linking.openURL` do Stripe
  (`PlanosScreen`). O revisor chega nessas telas em minutos: `/planos` é rota pública e Créditos está
  linkado na Conta com o rótulo "Saldo e recarga por Pix".
- **Cuidado:** esconder não basta se a API continuar aberta — guarda de cliente não é segurança de
  servidor. Vale para a tela; a cobrança de verdade é o achado #1.
- **Também:** `privacidade.ts` limita o documento a "Android e versão web". Submetido como política do
  app iOS, ele não cobre o iOS.
- **`[DONO]` DECISÃO:** vender crédito/plano dentro do iPhone exige **In-App Purchase**, com a taxa
  da Apple (15–30%). As opções: (a) não vender no iOS — o app entra, o usuário compra fora, e o
  iPhone vira só uso; (b) implementar StoreKit e pagar a taxa; (c) adiar o iOS. **A Onda 24 está
  implementando a (a)**, que é a reversível — destrava a review sem casar com um modelo de cobrança.

### Android (Play)
Não bloqueia o envio hoje, mas está fora da política de pagamentos. Decisão de médio prazo:
Play Billing ou user choice billing.

---

## ORDEM DE ATAQUE (Onda 24, em execução)
1. **C1** — destravar a App Store (esconder compra no iOS + política de privacidade cobrindo iOS).
2. **C2** — vazamento entre contas (backup do técnico, pull da empresa, limpeza de sessão) + testes.
3. **C3** — integridade do documento (orçamento aprovado, numeração única).
4. **C4** — cobrança decidida no servidor, com **fail-open enquanto a migration não rodar** (assim o
   commit vai pra produção sem derrubar ninguém e a regra passa a valer sozinha quando o dono aplicar).
