# Ideia Inovadora: "Orçamento Garantido por Pares" — Seguro Mutualista entre Prestadores

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Transforma a **rede de indicação** em **fundo mutualista de garantia** — prestadores que se indicam formam "Círculos de Confiança" (3-5 pessoas). Se um cliente não paga, o Círculo cobre (rateio automático via créditos IA). OLLI opera a infra, não assume risco. Conecta L1 (indicação) → L2 (score Fiador) → L5 (capital de giro) → L0 (retenção Pro/Empresa).

---

## Conceito

**Problema real:** "Fiz o serviço, cliente sumiu, não recebi." O Fiador OLLI (score do cliente) ajuda, mas **risco residual permanece no prestador**.

**Inovação:** **Círculo de Confiança** — 3-5 prestadores que:
1. **Se indicam mutuamente** (já confiam uns nos outros)
2. **Compartilham score Fiador** dos seus clientes (transparência)
3. **Criam fundo mutualista** via créditos IA (ex: cada um aporta 10 créditos/mês = 50 créditos no pool)
4. **Se um cliente não paga** (Fiador score ≥70 + OS assinada + 30d sem Pix), o pool cobre **até 80% do valor** (rateio igual entre membros)
5. **OLLI opera:** matching, regras, rateio automático via `credit_ledger` — **não assume risco, não toca dinheiro**

**Diferencial vs Fiador OLLI:** Fiador = seguro com parceiro externo (futuro). Círculo = **auto-seguro entre pares hoje**, sem parceiro, sem capital, usando créditos IA que já existem.

---

## Teste de 2 Dias (R$ 0, Manual, 2 Círculos = 8 Prestadores)

### Dia 1: Formação (Igor no WhatsApp)
1. **Selecionar 2 grupos de 4 prestadores** que JÁ se indicam (ver `indicacoes` table) e têm Fiador score médio ≥75:
   - Círculo A: Ar-cond (2) + Elétrica (1) + Hidráulica (1) — mesma região
   - Círculo B: Pintor (2) + Gesso (1) + PMOC (1) — mesma região
2. **Proposta via WhatsApp (Igor):**
   > "Teste interno: **Círculo de Confiança**. Vocês 4 formam um grupo. Cada um aporta **10 créditos IA/mês** (do ledger, não cash). Se um cliente de vocês não pagar (score Fiador ≥70 + OS assinada + 30d), o pool cobre 80% rateado entre os 4. OLLI faz o rateio automático. Topam testar 30 dias? Responda 'CÍRCULO' + nomes dos 3 colegas."

### Dia 2: Validação + Métricas
1. **Métrica primária (2h):** % grupos formados (target ≥50% = 1/2 grupos aceitam)
2. **Métrica secundária (24h):** Aporte inicial de créditos confirmado (target 100% dos membros)
3. **Métrica terciária (7d):** Primeiro evento de "cliente não pagou" simulado → rateio automático funciona (target: rateio em <1h, notificação a todos)

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Grupos formados (2h) | ≥50% (1/2) | 0% |
| Aporte créditos (24h) | 100% membros | <75% |
| Rateio automático teste (7d) | Funciona <1h | Falha |

**Se GO** → Dev builda: `circuloConfianca.ts` (matching por indicação mútua + Fiador score + região), pool de créditos, rateio automático via `credit_ledger`, notificações.  
**Se NO-GO** → Descarta, custo = 30 min Igor no WhatsApp.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Seguro mutualista é regulado" | **Não é seguro** — é **rateio de créditos IA** (ativo interno, não dinheiro). OLLI não garante pagamento, só opera rateio. |
| "Risco moral (prestador relaxa cobrança)" | **Fiador score ≥70 + OS assinada + 30d** = filtros fortes. Rateio = 80% (prestador ainda perde 20% → incentivo para cobrar). |
| "Precisa capital" | **Créditos IA = moeda interna** (já existe ledger, já tem gate `ia_ilimitada`). Custo zero caixa. |
| "Concorrência entre membros" | **Especialidades complementares** (matching evita concorrência direta). Regra: máx 1 por vertical por Círculo. |
| "Complexidade jurídica" | **Termos simples:** "Rateio voluntário de créditos IA entre prestadores que se confiam. OLLI não garante cobertura." LGPD: consentimento explícito no aceite. |

---

## Efeito Volante (Se Der Certo)

```
Prestadores formam Círculo → aportam créditos → proteção mútua → menos medo de calote
                                    ↓
                            Mais orçamentos aprovados (confiança) → mais volume
                                    ↓
                            Mais indicações mútuas → Círculos crescem → pool maior
                                    ↓
                            Retenção Pro/Empresa dispara (benefício único) → LTV ↑
                                    ↓
                            Volume → Fiador OLLI (parceiro externo) viável → Círculo vira "reinsurance"
```

---

## Diferencial vs Concorrentes

| Feature | Seguro Tradicional | Fiador OLLI (futuro) | **Círculo de Confiança** |
|---------|-------------------|---------------------|-------------------------|
| Capital | Próprio/Parceiro | Parceiro externo | **Créditos IA dos membros (R$ 0)** |
| Velocidade | Dias/semanas | Dias | **Rateio automático <1h** |
| Confiança | Contrato | Score algoritmo | **Relação real (já se indicam)** |
| Custo | Prêmio % | Comissão corretagem | **Zero (créditos IA = moeda interna)** |
| Incentivo | Nenhum | Nenhum | **Mutualismo: eu protejo você, você me protege** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Membro não aporta créditos | Autodésliga do Círculo após 2 meses sem aporte; notifica grupo |
| Fraude: cliente "fantasma" combinado | Fiador score ≥70 + OS assinada + fotos + assinatura + 30d = barreira alta |
| Círculo todo inadimplente | Teto: pool cobre máx 80% por evento; 1 evento/mês por Círculo |
| Conflito interno | OLLI não media; termos claros: "rateio automático, sem negociação" |
| Escalabilidade (matching) | Começa manual (Igor) → automatiza quando ≥20 Círculos ativos |

---

## Próximo Passo Imediato

> **Igor:** Topa teste 2 dias com 2 grupos (8 prestadores) no WhatsApp? Se GO, dev especifica `circuloConfianca.ts` na semana.