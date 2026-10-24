# Ideia Inovadora: "Indicação Embutida no Orçamento" — O Próprio Orçamento Vira Canal de Aquisição

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Transforma o **PDF/recibo/link do orçamento** (já enviado ao cliente final) em **ferramenta de indicação passiva** — o selo "Feito com OLLI" vira botão de indicação com `ref=` do prestador. Cliente final vê → clica → cadastra-se → prestador ganha crédito. **Zero esforço ativo do prestador**, escala com volume de orçamentos.

---

## Conceito

**Realidade:** Prestador envia 5-20 orçamentos/mês. Cada orçamento vai para um **cliente final** (proprietário, síndico, facility manager) que **conhece outros prestadores** ou **é prestador** (ex: síndico que também faz manutenção, dono de obra que contrata várias especialidades).

**Ativo OLLI:** Selo "Feito com OLLI" **já existe** no PDF, recibo e link `/o/<token>`. Tem UTM, é clicável, leva pro site.

**Inovação:** Adicionar **parâmetro `ref=CODIGO_PRESTADOR`** no selo → quando cliente final clica e cadastra, **prestador ganha crédito automaticamente**. Não precisa pedir indicação, não precisa compartilhar link — **o orçamento FAZ isso sozinho**.

### Fluxo Passivo

```
Prestador envia orçamento (PDF/WhatsApp/link)
                                    ↓
Cliente final abre → vê "Feito com OLLI" (com ref=OLLI-JOA3K7)
                                    ↓
Cliente final clica → cai no site/painel com olli_attr=ref:OLLI-JOA3K7
                                    ↓
Cliente final cadastra (é prestador ou indica um) → indicado_id preenchido
                                    ↓
Indicado faz 1º orçamento → Ambos ganham créditos IA (double-sided)
                                    ↓
Prestador original ganha crédito **sem ter feito nada ativo**
```

---

## Teste de 2 Dias (R$ 0, Manual, 5 Prestadores Ativos)

### Dia 1: Preparação (Igor + Dev 30 min)
1. **Selecionar 5 prestadores** ativos (≥5 orçamentos/mês, variados: ar-cond, elétrica, hidráulica, pintura, PMOC)
2. **Dev adiciona `?ref=` no selo** temporariamente (feature flag `indicacao_embutida=true` para esses 5 users)
   - No `marcaOlli.ts` / `seloOlli.tsx`: se user tem flag → selo link = `https://olliorcamentos.online/?ref=SEU_CODIGO`
3. **Gerar códigos** para os 5 (via `indicacoes-criar-ou-buscar`)

### Dia 2: Execução + Medição
1. **Prestadores enviam orçamentos normalmente** (não pedem indicação, não sabem do teste)
2. **Métrica primária (24h):** Cliques no selo com `ref=` (tracking via `auth_funil_eventos` evento `selo_clicado_ref`)
3. **Métrica secundária (48h):** Cadastros via `ref=` (evento `cadastro_por_indicacao_embutida`)
4. **Métrica terciária (7d):** 1º orçamento dos indicados → créditos creditados

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| CTR no selo (cliques/orçamentos enviados) | ≥2% | <0,5% |
| Cadastros via selo / cliques | ≥10% | <3% |
| 1º orçamento indicado / cadastros | ≥25% | <10% |
| Créditos creditados ao prestador original | ≥1 por prestador | 0 |

**Se GO** → Rollout 100% (feature flag on para todos Pro/Empresa) + gamificação no painel ("Seus orçamentos indicaram X colegas este mês").  
**Se NO-GO** → Remove flag, custo = 30 min dev + 2 dias observação.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Cliente final não é prestador" | **20-30% são**: síndicos, facility managers, donos de obra, engenheiros, outros prestadores que contratam |
| "Cannibaliza indicação ativa" | **Complementar**: ativa = prestador indica colega; passiva = orçamento indica para cliente final que vira prestador |
| "Tracking complexo" | **Já tem infra**: `olli_attr` cookie, `auth_funil_eventos`, `indicacoes` table, `credit_ledger` |
| "LGPD - cliente final não consentiu indicação" | **Não é indicação de cliente** - é **auto-cadastro** do cliente final que clica no selo e decide se cadastrar. Mesmo fluxo de signup orgânico. |
| "Baixa conversão" | **Volume compensa**: 69 contas × 10 orçamentos/mês = 690 impressões/mês. 2% CTR = 14 cliques. 10% cadastro = 1,4 cadastros. 25% 1º orçamento = 0,35 créditos/mês por prestador. **Escala linear com volume**. |

---

## Efeito Volante (Se Der Certo)

```
Mais orçamentos enviados → mais selos com ref= → mais cliques → mais cadastros passivos
                                    ↓
                            Mais prestadores ativos → mais orçamentos → loop
                                    ↓
                            Prestador vê no painel: "Seus orçamentos trouxeram 3 colegas este mês"
                                    ↓
                            Incentiva enviar MAIS orçamentos (ativação) → retenção ↑
                                    ↓
                            Volume ↑ → comissão/split viável → crédito L5 viável
```

---

## Diferencial vs Concorrentes

| Feature | ReferPro/Clicki (Cliente→Contractor) | **Indicação Embutida OLLI** |
|---------|--------------------------------------|----------------------------|
| Quem indica | Cliente final (ativo) | **Orçamento (passivo, automático)** |
| Esforço prestador | Pedir, compartilhar, lembrar | **Zero** (acontece no envio normal) |
| Escala | Linear com pedidos ativos | **Linear com volume de orçamentos** |
| Timing | Pós-job (2h) | **No envio do orçamento** (momento natural) |
| Tracking | CRM externo | **Nativo (selo + olli_attr + ledger)** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Cliente final acha que é "spam" no selo | Selo continua discreto; `ref=` invisível na URL; só tracking interno |
| Prestador não quer "vazar" seu código | Código não é segredo (já compartilha no cartão ativo); benefício > risco |
| Fraude: prestador clica no próprio selo | Anti-fraude: `indicador_id !== indicado_id` + `funil_exclusoes` + teto 5/1 |
| Baixa conversão inicial | Feature flag para testar; rollout gradual; launch boost (créditos 2x 30 dias) |
| Conflito com indicação ativa | **Complementares**: ativa = colega conhecido; passiva = rede expandida via clientes |

---

## Implementação Técnica (Já 90% Pronto)

1. **`marcaOlli.ts` / `SeloOlli.tsx`**: Adicionar `ref=` no link do selo se `user.temIndicacaoEmbutida`
2. **`capturarRef.ts`**: Já captura `?ref=` no cookie `olli_attr`
3. **`indicacaoSignup.ts`**: Já processa no signup
4. **`indicationReward.ts`**: Já credita no 1º orçamento
5. **Feature flag**: `indicacao_embutida` no user metadata (Pro/Empresa only)
6. **Evento novo**: `selo_clicado_ref` no `auth_funil_eventos` (para medir CTR)

---

## Próximo Passo Imediato

> **Igor/CTO:** Topa teste 2 dias com 5 prestadores? Dev gasta 30 min pra adicionar `ref=` no selo via feature flag. Se GO, rollout 100% na mesma PR da Indicação Mínima.