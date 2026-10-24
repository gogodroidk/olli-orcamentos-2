# Ideia Inovadora: CRÉDITO DE OBRA — Parcelamento do Cliente Final via Score do Prestador (2026-10-21)

## Conceito
**"Parcele em 12x sem cartão, o técnico garante"** — Prestador OLLI (Pro/Empresa, Fiador ≥80) oferece parcelamento 2-12x ao cliente final no orçamento. OLLI adianta o valor ao prestador (menos taxa 2.5%), cliente paga para OLLI. Risco coberto pelo **Fiador do prestador** (score comportamental) + **pool de créditos IA do Círculo de Confiança**.

## Por que NINGUÉM fez isso
- **BNPL tradicional** (Klarna, Mercado Pago): score do CLIENTE, juros altos, prestador recebe à vista mas paga taxa 4-6%.
- **Crédito direto prestador**: risco 100% no prestador, sem escala, inadimplência mata.
- **OLLI único:** Score do PRESTADOR (Fiador ≥80 = histórico real: orçamento→aprovação→visita→OS→Pix) + mutualismo via Círculo de Confiança (pool créditos IA). Prestador recebe à vista, taxa menor (2.5%), cliente parcela sem burocracia.

## Conecta 5 Camadas num Loop Próprio
```
L1 (Orçamento) → L0 (Conversão + Parcelamento = +40% ticket) 
  → L5 (Crédito real: OLLI adianta, recebe parcelas, taxa 2.5%)
  → L3 (Fiador do prestador garante + Círculo rateia inadimplência)
  → L1 (Prestador com fluxo de caixa indica mais → volume ↑)
  → L8 (Conta digital OLLI: recebíveis + parcelas = banking)
```

## Teste 2 Dias Manual (R$ 0, WhatsApp Igor)

### Setup (30 min)
- 3 prestadores Pro/Empresa ativos (Fiador ≥80, ≥5 orçamentos/mês)
- 3 clientes reais com orçamento aprovado >R$ 2.000 (pendentes de fechamento)
- Simulação no WhatsApp Igor (não roda no app ainda)

### Execução (2 dias)
**Dia 1:** Igor envia para cada prestador:
> "Teste: Ofereça ao seu cliente 'Parcele em 6x sem juros via OLLI'. Você recebe à vista (menos 2.5%), cliente paga pro OLLI. Seu Fiador garante. Topa testar com 1 cliente hoje?"

**Dia 2:** Igor acompanha:
- Cliente aceitou parcelamento?
- Prestador recebeu simulação de adiantamento?
- Qual objeção surgiu?

### Métricas GO/NO-GO (Binárias — TODAS devem bater)
| Métrica | Target | Por que |
|---------|--------|---------|
| Prestador aceita oferecer | ≥66% (2/3) | Adesão voluntária = product-market fit |
| Cliente aceita parcelar | ≥50% (1-2/3) | Demanda real = receita |
| Ticket médio com parcelamento | +30% vs sem | Alavanca de receita |
| Inadimplência simulada 30d | <5% | Fiador + Círculo funcionam |
| Prestador indica colega | ≥1/3 | Loop viral orgânico |

### GO = Build Mínimo (2 semanas)
1. `creditoObra.ts` — Motor: simulação parcelas, taxa, adiantamento, webhook pagamento
2. Integração `FiadorScore` (já existe) + `CirculoConfianca` (pool créditos IA)
3. PDF orçamento com opção "Parcelar via OLLI" + QR Pix parcelado
4. Dashboard `/admin/credito-obra`: adiantamentos, recebíveis, inadimplência, taxa líquida

### NO-GO = Descarta, custo 2 dias MKT

## Diferenciais Competitivos (Moat)
1. **Score do lado da OFERTA** (prestador), não da demanda — dados proprietários OLLI (Fiador)
2. **Mutualismo via créditos IA** — zero capital próprio, alinhamento total
3. **Taxa 2.5% vs 4-6% BNPL** — prestador adere, cliente não vê juros
4. **Adiantamento D+1** — fluxo de caixa imediato = prestador fiel
5. **Dados de crédito reais** → futuro scoring para empréstimo capital de giro (L5→L8)

## Riscos Mapeados
| Risco | Mitigação |
|-------|-----------|
| Inadimplência cliente | Fiador ≥80 (histórico 95%+ recebimento) + Círculo rateia 80% |
| Fraude prestador+cliente | KYC no cadastro + validação OS assinada + visita confirmada |
| Capital OLLI para adiantar | Começa com teto R$ 5k/prestador/mês, escala com receita taxa |
| Regulação (BACEN) | Não é empréstimo — "antecipação de recebíveis" (Lei 13.988/2020), parceiro securitizador depois |

## Próximo se GO
- Igor aprova → CTO branch `claude/credito-obra` → Dia 1: migration `credito_obra` + `simulacaoParcelas` + integração `FiadorScore`
- Teste real com 5 prestadores (feature flag) 14 dias → métricas reais → decisão scale