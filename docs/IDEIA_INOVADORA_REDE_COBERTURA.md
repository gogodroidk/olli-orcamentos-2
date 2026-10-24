# Ideia Inovadora: Rede de Cobertura OLLI — "Indiquei, Cobri, Ganhamos Juntos"

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Transforma "indicação passiva" (link) em "cobertura ativa" (técnico cobre técnico) — usa geolocalização + especialidade + confiança (Fiador score) para criar marketplace interno de **substituição de mão de obra** com split automático. Conecta L3 (demanda) → L1 (ciclo comercial) → L0 (assinatura) → L4 (fornecedores) num loop.

---

## Conceito

**Problema real:** "Tem serviço demais, não dou conta / Tem serviço de menos, parado em casa"  
**Solução OLLI:** Rede de cobertura entre prestadores **já verificados** (têm Fiador score, usam Autopilot, pagam Pro/Empresa)

### Como Funciona

1. **Prestador A** (sobrecarregado) recebe orçamento aprovado mas **não consegue atender no prazo**
2. Abre no app: "Preciso de cobertura para [categoria] em [bairro/CEP] — [data/horário]"
3. **OLLI matcha** com Prestadores B, C, D da região que:
   - Têm a **especialidade** (categoria do serviço)
   - Têm **Fiador score ≥80** (confiáveis)
   - Têm **disponibilidade** (agenda OLLI livre)
   - São **Pro/Empresa ativos** (skin in the game)
4. **Prestador B aceita** → assume o orçamento (link `/o/<token>` transfere) → executa → recebe Pix
5. **Split automático:** Prestador B recebe 85%, Prestador A (indicador) recebe 10%, OLLI 5% (via futuro split Pix)
6. **Fiador OLLI cobre** se Prestador B não entregar (score ≥80 = risco baixo)

---

## Teste de 2 Dias (R$ 0, Manual, 6 Prestadores Ativos)

### Dia 1: Preparação (Igor + 3 Duplas)
1. **Selecionar 3 duplas** de prestadores ativos (Pro/Empresa) em regiões próximas:
   - Dupla 1: Ar-condicionado (Zona Sul SP)
   - Dupla 2: Elétrica (Centro SP)  
   - Dupla 3: Hidráulica (Zona Oeste SP)
2. **Verificar pré-requisitos:** Ambos têm Fiador score ≥80, agenda OLLI atualizada, Autopilot usado
3. **Cenário teste:** Prestador A de cada dupla "fica doente" no dia de visita agendada (simulado)

### Dia 2: Execução + Medição
1. **Igor dispara no grupo WhatsApp das duplas:** "Teste interno: [Nome A] não pode ir na visita de amanhã às 14h (ar-cond Zona Sul). Quem cobre? Quem aceitar leva 85%, [Nome A] fica 10%, OLLI 5%. Fiador garante. Responda 'EU CUBRO' + nome."
2. **Métrica primária (2h):** % de duplas onde B aceita em <30 min (target ≥66% = 2/3)
3. **Métrica secundária (24h):** Orçamento transferido + visita realizada + Pix recebido (target 100% das aceitas)
4. **Métrica terciária (7d):** NPS dos 2 prestadores pós-teste (target ≥8/10)

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Aceita cobertura <30 min | ≥66% (2/3 duplas) | <33% |
| Execução + Pix completo | 100% das aceitas | <100% |
| NPS pós-teste | ≥8/10 | <6/10 |

**Se GO** → Dev builda: `redeCoberturaEngine.js` (match geolocalização + especialidade + Fiador + agenda), transferência de orçamento (`/o/<token>`), split via Mercado Pago (já tem worker), notificação push/email.  
**Se NO-GO** → Descarta, custo = 2 dias MKT + tempo Igor no WhatsApp.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Marketplace de mão de obra é complexo" | **Não é marketplace aberto** — só entre prestadores JÁ VERIFICADOS (Fiador + Pro/Empresa + Autopilot). Risco controlado. |
| "Split de pagamento é regulado" | **Mercado Pago split já existe** (worker/mercadopago.js). OLLI não toca no dinheiro — só orquestra. |
| "Confiança entre estranhos" | **Não são estranhos** — são prestadores com histórico no OLLI (Fiador score, orçamentos, Pix, avaliações). |
| "Agenda não é confiável" | **Agenda OLLI é fonte de verdade** — já usada para "Hora de sair" e "Confirmação de véspera". |
| "Não tem volume" | **Começa com 6 prestadores ativos** — rede cresce orgânico com indicação (viral loop). |

---

## Efeito Volante (Se Der Certo)

```
Prestador A sobrecarregado → pede cobertura → Prestador B aceita → executa → split automático
                                    ↓
                            A ganha 10% sem trabalhar + mantém cliente feliz
                            B ganha 85% de serviço que não teria + constrói reputação
                            OLLI ganha 5% + retém AMBOS no Pro/Empresa
                                    ↓
                            Mais prestadores veem valor → entram na rede → liquidez sobe
                                    ↓
                            Cliente final: "OLLI sempre resolve" → mais orçamentos aprovados
                                    ↓
                            Volume → split viável → Fiador mais barato → crédito L5 viável
```

---

## Diferencial vs Concorrentes

| Feature | GetNinjas/Marketplace | Indicação Tradicional | **Rede Cobertura OLLI** |
|---------|----------------------|----------------------|-------------------------|
| Quem executa | Qualquer pro da plataforma | Amigo do indicador (informal) | **Pro verificado (Fiador ≥80)** |
| Garantia | Nenhuma / Proteção Ninja (R$ 1k) | Boca a boca | **Fiador OLLI (score comportamental)** |
| Split | Plataforma cobra lead | Zero / combinado offline | **Automático (85/10/5) via MP split** |
| Atrito | Alto (lead fria) | Baixo mas informal | **Zero (1 tap no app OLLI)** |
| Dado | Só lead | Zero | **Ciclo completo (quote→Pix)** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Prestador B executa mal → cliente reclama | Fiador OLLI cobre (score ≥80 = histórico bom). Avaliação pós-serviço obrigatória. |
| Prestador A "vende" lead pra B | Split fixo 85/10/5 — A ganha mais executando (100%) que repassando (10%). |
| Concorrência direta (A e B mesma região/especialidade) | Match prioriza **especialidades complementares** (ex: A=ar-cond, B=elétrica para mesma obra). |
| Volume insuficiente pra match | Começa manual (Igor no WhatsApp) → automatiza quando ≥20 prestadores ativos/região. |
| LGPD (compartilhar agenda/localização) | Opt-in explícito na tela "Rede de Cobertura". Só compartilha disponibilidade, não cliente final. |

---

## Próximo Passo Imediato

> **Igor:** Topa teste manual 2 dias com 3 duplas (6 prestadores) no WhatsApp? Se GO, dev especifica `redeCoberturaEngine.js` na semana que vem.