# E-mail de Ativação com Autopilot — Versão de Teste A/B

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Objetivo:** Aumentar taxa de ativação (primeiro orçamento) dos 47/60 contas que nunca orçaram  
**Hipótese:** O gancho "cole uma conversa, ganhe orçamento pronto em 2 min" via Autopilot converte melhor que "cadastre cliente, adicione serviços, gere orçamento" genérico  
**Base:** Autopilot já existe no app (Grátis ilimitado), gera prévia de orçamento a partir de conversa/PDF/print — fonte: `src/screens/AutopilotScreen.tsx`, `src/services/iaAutopilot.ts`

---

## Template A (Controle — atual `activation_day_3`)

**Assunto:** Seu primeiro orçamento na OLLI Orçamentos  
**Preview:** Sua conta está pronta. Falta só o primeiro orçamento.  
**Título:** Vamos fazer o primeiro orçamento?  
**Corpo:** Sua conta na OLLI Orçamentos está pronta, mas ainda não tem nenhum orçamento. Dá para começar agora:  
1. cadastre o cliente;  
2. adicione os serviços e os valores;  
3. gere o orçamento e envie ao cliente.  
**CTA:** "Criar meu primeiro orçamento" → `/` (home do app)

---

## Template B (Variante — Autopilot como gancho)

**Assunto:** Transforme uma conversa em orçamento em 2 minutos  
**Preview:** Cole o print do WhatsApp → a OLLI monta o orçamento para você  
**Título:** Tem uma conversa de serviço no WhatsApp?  
**Corpo:**  
Você já tem o que precisa: o cliente pediu, você explicou, combinou o valor.  
Agora **cole essa conversa no Autopilot** e a OLLI devolve:  
- cliente cadastrado (nome, telefone, endereço)  
- serviços e produtos com preço sugerido  
- orçamento rascunho pronto para revisar e enviar  

**No plano Grátis:** orçamentos ilimitados, sem cartão, sem cota mensal.  
**O selo "Feito com OLLI" sai no PDF/link/recibo** — no Pro some (R$ 39/mês).  

**Passos (2 minutos):**  
1. Abra o Autopilot no app (ícone do robô)  
2. Cole o print/PDF/texto da conversa  
3. Toque em "Preparar prévia" → revise → "Abrir orçamento rascunho" → envie  

**CTA:** "Testar o Autopilot agora" → deep link `olli://autopilot` (ou `/autopilot` no painel web)  
**Depois:** Se travou, responda este e-mail — a gente olha junto.

---

## Template C (Variante — "Dinheiro parado" para contas com atividade)

**Assunto:** R$ X parados há Y dias — um orçamento resolve  
**Preview:** Seu último atendimento vira orçamento com 1 colagem  
**Título:** Esse serviço já foi feito. Falta só o orçamento.  
**Corpo:**  
Seu cliente já aprovou, o serviço já saiu. O dinheiro está **parado** porque o orçamento não foi enviado.  
O Autopilot pega a conversa que você já teve e monta o orçamento em segundos.  
- Sem digitar cliente do zero  
- Sem pesquisar preço — a OLLI sugere baseado no seu histórico  
- PDF, link e WhatsApp prontos para o cliente pagar no Pix  

**CTA:** "Transformar conversa em orçamento" → `olli://autopilot`  
**Depois:** Se o cliente já pagou, marque como recebido no app — o radar para de cobrar.

---

## Métricas de Sucesso (A/B/C)

| Métrica | Baseline (controle) | Alvo Variante B | Alvo Variante C |
|---------|---------------------|-----------------|-----------------|
| Open rate | ~42% (bench SaaS) | ≥45% | ≥50% |
| Click-to-Autopilot | N/A (novo CTA) | ≥8% | ≥12% |
| Primeiro orçamento em 48h | ~5% (estimado) | ≥12% | ≥15% |
| Ativação D+7 (orçamento criado) | ~11% (Free tier bench) | ≥23% (elite) | ≥25% |

---

## Implementação Técnica (para o dono/dev)

1. **Novo template no worker:** `emailLembretesTemplate.js` → adicionar `conteudoAtivacaoAutopilot(dados, appUrl)`
2. **Nova janela no policy:** `emailLembretesPolicy.js` → `JANELAS.add('activation_day_3_autopilot')`
3. **Segmentação:** só contas com `orcamentos === 0` E `atividade_recente === true` (login nos últimos 7 dias) recebem Variante B/C
4. **Deep link:** `olli://autopilot` já existe no `AppNavigator` → `AutopilotScreen`
5. **A/B test:** 50/50 no `selecionarPedidos` — `idempotencyKey` inclui variante

---

## Copy Derivada da Fonte (checklist)

- [x] "orçamentos ilimitados, sem cota mensal" → `FRASE_GRATIS` (`planosBase.ts:191`)
- [x] "selo 'Feito com OLLI'" → `NOTA_SELO_GRATIS` (`planosBase.ts:188`)
- [x] "R$ 39/mês" → `PRECO_PRO.mensalCentavos` (`precosPlanos.ts:70`)
- [x] "Autopilot gera prévia de orçamento" → `prepararPreviaAutopilot` (`iaAutopilot.ts`)
- [x] "sem cartão" → Grátis não pede cartão (regra de negócio confirmada)
- [x] "pagar no Pix no link" → `link_pagamento` benefício (`planosBase.ts:74`)

---

## Próximo Passo (aprovação do Igor)

> **Igor:** Se aprova, o dev cria a Variante B no worker (2h), deploya, e a gente roda 7 dias nos 8 "dinheiro parado" + 20% da base inativa. Métrica: primeiro orçamento em 48h ≥ 12%.