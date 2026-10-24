# Ideia Inovadora: "Clube do Orçamento" — Assinatura Compartilhada para Micro-Equipes Informais

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Transforma "indicação" em "co-assinatura" — 2-3 prestadores que já se indicam (mesmo bairro, especialidades complementares) dividem **1 conta Empresa (R$ 99)** com acesso full + Fiador compartilhado + split automático de indicações. Conecta L0 (pricing) → L1 (indicação) → L3 (rede) → L5 (crédito) num loop.

---

## Conceito

**Realidade:** Muitos prestadores autônomos trabalham "em dupla/trio" informalmente — eletricista + ar-cond, encanador + pintor, marido + mulher. Hoje cada um paga Pro separado (R$ 39×2 = R$ 78) ou um paga Empresa (R$ 99) e o outro usa login compartilhado (quebra auditoria, Fiador, entitlements).

**Clube do Orçamento:** 1 conta Empresa (R$ 99/mês) → **até 3 técnicos vinculados** (CPF/CNPJ próprios) → cada um tem:
- Login próprio, auditoria própria, Fiador próprio
- Orçamentos ilimitados, IA ilimitada, relatórios, metas, radar
- **Indicações internas contam double** (indica colega do Clube → ambos ganham crédito)
- **Split automático:** se um indica externo, crédito divide 50/50 entre sócios do Clube
- **Fiador compartilhado:** score do Clube = média dos sócios (mais robusto)

---

## Teste de 2 Dias (R$ 0, Manual, 3 Duplas = 6 Prestadores)

### Dia 1: Preparação (Igor no WhatsApp)
1. **Selecionar 3 duplas** que JÁ se indicam informalmente (verificar no `indicacoes` table se houver, ou perguntar no grupo de prestadores ativos):
   - Dupla 1: Ar-cond + Elétrica (mesmo bairro)
   - Dupla 2: Encanador + Pintor (trocam indicação constante)
   - Dupla 3: Marido (HVAC) + Mulher (Administrativa/Financeira)
2. **Proposta via WhatsApp pessoal:**
   > "Teste interno: **Clube do Orçamento**. Vocês dois pagam **R$ 99/mês JUNTOS** (hoje gastam R$ 78 em 2×Pro). Ganham: conta Empresa full (equipe, relatórios, metas, radar) + logins separados + Fiador compartilhado + indicações internas valem DOBRO. Topam testar 30 dias grátis? Responda 'CLUBE' + nome do sócio."

### Dia 2: Medição
1. **Métrica primária (2h):** % duplas que aceitam (target ≥66% = 2/3)
2. **Métrica secundária (24h):** Ambos criam login + primeiro orçamento cada (target 100%)
3. **Métrica terciária (7d):** Indicação interna (um indica o outro formalmente no app) + indicação externa conjunta (target ≥1 por dupla)

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Aceita teste (2h) | ≥66% (2/3 duplas) | <33% |
| Ambos ativos + 1º orçamento (24h) | 100% | <100% |
| Indicação interna + externa (7d) | ≥1/dupla | 0 |

**Se GO** → Dev builda: `clubeOrcamento.ts` (vincular até 3 CPFs a 1 tenant Empresa), billing R$ 99 único, entitlements herdados, Fiador média, indicação double-credit.  
**Se NO-GO** → Descarta, custo = 30 min Igor no WhatsApp.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Conta compartilhada quebra auditoria" | **Não é compartilhada** — 1 tenant, 3 users com CPF próprio, auditoria individual, Fiador individual |
| "Billing complexo" | **Stripe já suporta** — 1 subscription R$ 99, metadata `clube_membros: 3` |
| "Cannibaliza Pro individual" | **Só vale para duplas/trios que JÁ existem** — não atrai solo. Preço R$ 99/3 = R$ 33/cabeça vs R$ 39 Pro = desconto só pra quem já colabora |
| "Fiador compartilhado = risco moral" | **Média dos scores** + teto individual + transparência (cada um vê score do sócio) |
| "LGPD / trabalhista" | **Não é vínculo empregatício** — termo claro: "colaboração comercial autônoma, sem vínculo". LGPD: consentimento explícito no aceite |

---

## Efeito Volante (Se Der Certo)

```
Dupla forma Clube (R$ 99/2 = R$ 49,5 c/head) → usa Empresa full → indica mais colegas
                                    ↓
                            Indicação interna = double credit → acelera viral loop
                                    ↓
                            Fiador compartilhado = score mais alto → mais orçamentos aprovados
                                    ↓
                            Mais volume → split viável → crédito L5 mais barato
                                    ↓
                            Trio forma Clube → R$ 33/cabeça → atrai mais duplas
```

---

## Diferencial vs Concorrentes

| Feature | Jobber/ServiceTitan | Indicação Tradicional | **Clube do Orçamento OLLI** |
|---------|---------------------|----------------------|----------------------------|
| Multi-user pricing | Per-user ($29-199/user) | Cada um paga separado | **R$ 99 fixo até 3 users** |
| Auditoria | Por user | Quebrada (login compartilhado) | **Por CPF, individual** |
| Fiador/Score | Não tem | Não tem | **Compartilhado (média)** |
| Indicação interna | Não existe | Informal, sem tracking | **Double credit + tracking** |
| Split indicação externa | Não tem | Combinado offline | **Automático 50/50** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Um sócio para de pagar → outro fica na mão | Billing: **1 subscription, 1 dono (admin)**. Se cancela, Clube dissolve → cada um vira Pro individual (R$ 39) ou Grátis |
| Sócio "fantasma" (não usa, só paga menos) | Regra: **mínimo 1 orçamento/mês por sócio** senão Clube dissolve automático |
| Conflito entre sócios (cliente, preço, agenda) | Termo de adesão: "OLLI não medeia conflitos comerciais entre sócios" |
| Fraude: 3 estranhos formam Clube só pra pagar R$ 33 | Validação: **mesmo CEP prefixo (5 dígitos) + especialidades complementares + indicação mútua prévia** |
| Complexidade suporte | Começa manual (Igor aprova cada Clube) → automatiza quando ≥20 Clubes ativos |

---

## Próximo Passo Imediato

> **Igor:** Topa teste manual 2 dias com 3 duplas (6 prestadores) no WhatsApp? Se GO, dev especifica `clubeOrcamento.ts` na semana que vem.