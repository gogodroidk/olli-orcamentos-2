# E-mail de Boas-Vindas do Founder (Igor) — Template de Ativação Day 0

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Base:** Benchmark SaaS (1Capture 2024, CostPocket 2024) — founder emails batem **60%+ open rate** vs 42% média  
**Fonte OLLI:** `welcomeEmailTemplate.js` (worker) + `planosBase.ts` + `precosPlanos.ts`  
**Objetivo:** Converter signup → primeiro orçamento no Dia 0 (TTFV < 10 min com Autopilot)

---

## Template (Derivado da Fonte — Zero Invenção)

**De:** Igor • OLLI Orçamentos <igor@olliorcamentos.online>  
**Assunto:** Bem-vindo à OLLI — eu construí isso para você  
**Preview:** Seu primeiro orçamento sai em 2 minutos. Vamos lá?

---

**Corpo (HTML + Texto):**

```
Oi, {primeiro_nome},

Sou o Igor, fundador da OLLI Orçamentos.

Criei a OLLI porque eu mesmo era prestador — técnico de ar-condicionado — e perdia horas fazendo orçamento no papel, WhatsApp, planilha... O cliente sumia, o papel rasgava, o Pix não chegava.

Hoje, 69 contas usam a OLLI para fechar serviço. Zero pagantes ainda (estamos no começo), mas 352 clientes cadastrados e R$ 35,9 mil em orçamentos aprovados.

**Seu próximo passo (2 minutos):**

1. Abra o app → toque no ícone do **robô (Autopilot)**
2. Cole um print de WhatsApp, PDF ou digite a conversa
3. Toque "Preparar prévia" → a OLLI monta: cliente + serviços + preço + orçamento rascunho
4. Revise → "Enviar ao cliente" (PDF, link, WhatsApp — o cliente paga no Pix no link)

**No plano Grátis (para sempre):**
- Orçamentos ilimitados (PDF, link, WhatsApp, sem cota mensal)
- Rascunhos, recibos, clientes, agenda, diagnóstico por código de erro
- IA de diagnóstico e voz: 3 usos por mês
- O PDF/link/recibo leva um selo discreto "Feito com OLLI"

**Se quiser tirar o selo e ganhar follow-up automático, link com pagamento, aviso de chuva, termômetro do orçamento, IA ilimitada, relatórios, metas, radar de clientes...** → Pro por R$ 39/mês (Pix, não renova sozinho).

---

**Eu leio todas as respostas deste e-mail.** Se travou em alguma parte, responda aqui — eu ou meu time olhamos junto.

Bora fazer o primeiro orçamento?

Igor  
Fundador, OLLI Orçamentos  
igor@olliorcamentos.online

---

*Você recebe este e-mail porque criou uma conta na OLLI Orçamentos. [Parar de receber e-mails do fundador]({unsubscribe_url}) — mas vai perder as dicas que mando só por aqui.*
```

---

## Variáveis Dinâmicas (do `welcomeEmailTemplate.js`)

| Variável | Fonte | Exemplo |
|----------|-------|---------|
| `{primeiro_nome}` | `user.raw_user_meta_data?.full_name` split | "João" |
| `{unsubscribe_url}` | `emailDescadastro.js` assinado | `https://olliorcamentos.online/unsub/abc123` |
| `{app_url}` | `APP_URL` env | `https://app.olliorcamentos.online` |

---

## Implementação (para o dev)

1. **Novo template no worker:** `welcomeEmailTemplate.js` → adicionar `conteudoFounder(dados, appUrl)`
2. **Trigger:** `auth_funil_eventos` evento `signup_completed` → enfileira imediato (delay 5 min)
3. **Segmentação:** TODOS os signups (não só Grátis) — inclusive trial Pro
4. **Tracking:** UTM `source=founder_welcome&medium=email&campaign=activation_d0`
5. **A/B test futuro:** vs template atual (genérico) — métrica: open rate + primeiro orçamento 24h

---

## Métricas de Sucesso (Benchmarks)

| Métrica | Atual (genérico) | Alvo Founder | Benchmark Elite |
|---------|------------------|--------------|-----------------|
| Open rate | ~42% | **≥60%** | 60–70% (1Capture) |
| Click → Autopilot | N/A | **≥15%** | — |
| 1º orçamento 24h | ~5% | **≥15%** | — |
| Resposta direta (reply) | ~0% | **≥5%** | Founder involvement = 156% conv (Amplitude) |

---

## Checklist Copy Derivada da Fonte

- [x] "orçamentos ilimitados, sem cota mensal" → `FRASE_GRATIS` (`planosBase.ts:191`)
- [x] "selo discreto 'Feito com OLLI'" → `NOTA_SELO_GRATIS` (`planosBase.ts:188`)
- [x] "R$ 39/mês (Pix, não renova sozinho)" → `PRECO_PRO.mensalCentavos` + regra trial (`limitesComerciais.ts`)
- [x] "follow-up automático, link com pagamento, aviso de chuva, termômetro..." → `frasePro()` (`planosBase.ts:278`)
- [x] "IA ilimitada, relatórios, metas, radar" → `BULLETS_PRO` bullets 7–8 (`planosBase.ts:220`)
- [x] "Autopilot monta cliente + serviços + preço" → `prepararPreviaAutopilot` (`iaAutopilot.ts`)
- [x] "cliente paga no Pix no link" → `link_pagamento` benefício (`planosBase.ts:74`)

---

## Próximo Passo (Aprovação Igor)

> **Igor:** Se aprova o tom (pessoal, direto, sem marketingês), o dev adiciona no `welcomeEmailTemplate.js` (1h), deploya, e a gente mede open rate nos próximos 20 signups. Se ≥60%, vira padrão; se <50%, a gente itera.