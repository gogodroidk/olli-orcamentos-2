# Ideia Inovadora: Fiador OLLI — Garantia de Recebimento Baseada em Comportamento Real

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Usa dado ÚNICO do OLLI (ciclo comercial completo: orçamento → aprovação → visita → recibo → Pix) para criar score de confiabilidade do CLIENTE FINAL e oferecer garantia de recebimento ao prestador. Conecta L1→L2→L5→L0→L3 num loop.

---

## Conceito

**O medo #1 do prestador:** "Fiz o serviço, o cliente sumiu, não recebi."  
**O ativo ÚNICO do OLLI:** Todo o ciclo comercial passa pela plataforma:
1. Orçamento enviado (link `/o/<token>`)
2. Cliente **aprovou** (clicou "Aceitar")
3. Confirmação de véspera (`/v/<token>`) — cliente confirmou presença
4. Ordem de serviço assinada na tela (checklist + fotos + assinatura)
5. Recibo gerado + **Pix recebido** (ou não)

**Fiador OLLI:** Score comportamental do cliente final → se score ≥ threshold, OLLI garante: "Se ele não pagar, a gente cobre (via parceiro seguradora). Você recebe no dia combinado."

**Monetização:**
- Incluído no **Pro** (R$ 39): garantia até R$ 2.000/orçamento
- Incluído no **Empresa** (R$ 99): garantia até R$ 10.000/orçamento
- Avulso no Grátis: 1.5% do valor do orçamento (mín R$ 15)
- Parceiro seguradora assume risco; OLLI recebe comissão de corretagem (15-20% do prêmio)

---

## Teste de 2 Dias (R$ 0, Manual, 10 Prestadores Ativos)

### Dia 1: Preparação
1. **Selecionar 10 prestadores** ativos (≥3 orçamentos aprovados nos 30d, variados: ar-cond, elétrica, hidráulica)
2. **Para cada um:** pegar último orçamento APROVADO + recibo (pago ou não)
3. **Calcular score manual** do cliente final (planilha):
   - Aprovou orçamento? (+20)
   - Confirmou visita véspera? (+25)
   - Assinou OS na tela? (+30)
   - Pagou Pix no link? (+25)
   - Histórico: pagou orçamentos anteriores no prazo? (+20 por pagamento)
   - **Score 0-100**. Threshold garantia: ≥70
4. **Criar 1 "Orçamento com Fiador"** por prestador (WhatsApp pessoal do Igor):
   > "Teste interno: seu próximo orçamento sai com **Garantia OLLI** (cobrimos se o cliente não pagar, até R$ 2.000). Score do cliente: 85/100. Quer testar?"

### Dia 2: Envio + Medição
1. Enviar proposta via WhatsApp (Igor aprova contato)
2. **Métrica primária (2 dias):** % que aceitam testar (≥70% = 7/10)
3. **Métrica secundária (7 dias):** Taxa de aprovação do orçamento COM Fiador vs últimos 5 orçamentos SEM Fiador (target: +15pp)
4. **Métrica terciária (30 dias):** % de recebimento efetivo (Pix no link ou fora) — target ≥95%

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Aceita testar (2d) | ≥70% (7/10) | <40% |
| Aprovação orçamento (+7d) | +15pp vs baseline | <5pp |
| Recebimento efetivo (+30d) | ≥95% | <85% |

**Se GO** → Dev builda: score automático no worker (`fiadorScore.js`), badge "Garantido pela OLLI" no PDF/link, integração parceiro seguradora (preparação jurídica paralela).  
**Se NO-GO** → Descarta, custo = 2 dias MKT + tempo do Igor no WhatsApp.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Não tem dado de pagamento" | **TEM**: recibo + Pix no link + webhook AbacatePay + `orcamento_eventos` migration |
| "Seguro é regulado, não pode" | **OLLI não emite seguro** — indica parceiro regulado (como Jobber/Celtic, HCP/Pipe, GetNinjas/Banco Pan). Comissão de corretagem = receita |
| "Score de cliente final é invasivo" | **Opt-in do prestador** por orçamento. Cliente final não vê score, só vê badge "Garantido". LGPD: legítimo interesse (execução de contrato) |
| "Risco de calote na OLLI" | **Parceiro assume 100% do risco**. OLLI só passa dado + ganha comissão. Capital zero próprio |

---

## Efeito Volante (Se Der Certo)

```
Prestador usa Fiador → mais orçamentos aprovados (cliente confia) → mais volume no OLLI
                                    ↓
                            Mais dados de comportamento (aprovação, visita, pagamento)
                                    ↓
                            Score mais preciso → prêmio menor no parceiro → margem maior OLLI
                                    ↓
                            Prestador indica colega ("nunca mais levei calote") → viral L3
                                    ↓
                            Volume → crédito L5 viável (recebíveis garantidos = collateral)
```

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Parceiro seguradora não topa | Começar com **capital de giro** (antecipação de recebíveis) via Pipe/Stripe Capital — mesmo modelo Jobber/HCP. Fiador = "antecipação garantida" |
| Prestador abusa (orçamento fake pra ganhar garantia) | Score exige **OS assinada + fotos + visita confirmada** — não dá pra falsificar sem fazer o serviço |
| Cliente final descobre e força pagamento | Badge diz "Garantido pela OLLI" — não "seguro". Cliente não sabe valor coberto. Termos: só aciona se prestador comprovar entrega (OS assinada) |
| Volume insuficiente pro parceiro | Piloto manual → 100 orçamentos/mês com Fiador = volume mínimo pro parceiro sentar na mesa |