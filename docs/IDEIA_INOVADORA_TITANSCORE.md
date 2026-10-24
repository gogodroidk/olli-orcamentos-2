# Ideia Inovadora: TITANSCORE OLLI — Health Score do Prestador com Benchmark Público e Loop Viral de Orgulho (2026-10-22)

## Conceito
**"Seu TitanScore: 847/1000 — Top 15% da região"** — Score único, público, gamificado que resume a saúde do negócio do prestador (Fiador + volume + qualidade + adoção features). Prestador vê seu ranking vs pares anônimos, compartilha orgulhosamente, colegas veem → querem melhorar → adotam mais features OLLI → score sobe → loop viral de **orgulho profissional**, não incentivo financeiro.

## Por que NINGUÉM fez isso
- **NPS/CSAT:** Métricas de satisfação do CLIENTE, não saúde do negócio do PRESTADOR
- **Health scores internos (Gainsight, Totango):** Opacos, só CSM vê, não geram viral loop
- **ServiceTitan TitanAdvisor:** Existe mas é **privado** (só cliente + CSM vê). OLLI torna **PÚBLICO + ANÔNIMO + COMPARTILHÁVEL**
- **Credit scores (Serasa, Boa Vista):** Negativos (restrição), não positivos (capacidade)
- **OLLI único:** Dados proprietários (Fiador comportamental + volume real + qualidade orçamentos + adoção IA) → score POSITIVO que prestador QUER mostrar

## Conecta 5 Camadas num Loop Viral de Orgulho
```
L1 (Orçamento) → L3 (Fiador score comportamental) 
  → L0 (TitanScore = Fiador 40% + Volume 25% + Qualidade 20% + Adoção IA 15%)
  → L3 (Benchmark anônimo regional: "Top 15% SP-Capital HVAC")
  → L1 (Prestador compartilha badge "Top 15%" no WhatsApp/LinkedIn → colegas veem)
  → L0 (Colega quer melhorar score → adota Autopilot + Fiador + Indicação → volume ↑)
  → L5 (Dados de score → crédito de obra + capital de giro futuro)
  → L8 (Conta digital: score = creditworthiness real)
```

## Componentes do TitanScore (0-1000)

| Pilar | Peso | Métricas (dados OLLI já tem) |
|-------|------|------------------------------|
| **Fiador** (confiabilidade) | 40% | Score Fiador (0-100) × 4 = 0-400 pts |
| **Volume** (tração) | 25% | Orçamentos/mês (log scale) + Taxa aprovação + Ticket médio |
| **Qualidade** (execução) | 20% | % orçamentos convertidos + Tempo resposta + Sem cancelamentos |
| **Adoção IA** (modernidade) | 15% | Autopilot ativo + Diagnósticos voz/mês + Importação catálogo |

**Total:** 0-1000 pts

**Faixas:**
- 900-1000: **Lenda** (Top 1%) → Badge "🏆 Lenda OLLI"
- 750-899: **Especialista** (Top 10%) → Badge "⭐ Especialista"
- 600-749: **Profissional** (Top 30%) → Badge "✅ Profissional Verificado"
- 400-599: **Em Evolução** → Badge "📈 Em Evolução"
- <400: **Iniciante** → Sem badge público (privado para não desmotivar)

## Teste 2 Dias Manual (R$ 0, WhatsApp Igor)

### Setup (30 min)
- 5 prestadores Pro/Empresa ativos (perfis variados: alto/médio/baixo volume)
- Calcular TitanScore manual (planilha com dados Supabase exportados)
- Gerar 5 badges visuais simples (Canva/Figma: "Top 15% SP HVAC", "Profissional Verificado", etc.)

### Execução (2 dias)
**Dia 1:** Igor envia no WhatsApp individual:
> "Teste: Calculei seu **TitanScore OLLI** — saúde do seu negócio num número. Você: **742 pts (Profissional, Top 25% SP-Elétrica)**. Quer ver o benchmark detalhado e badge para compartilhar?"

**Dia 2:** Igor acompanha:
- Prestador pediu benchmark detalhado?
- Prestador pediu badge para compartilhar?
- Prestador perguntou "como subo pro próximo nível?"
- Prestador indicou colega espontaneamente?

### Métricas GO/NO-GO (Binárias — TODAS devem bater)
| Métrica | Target | Por que |
|---------|--------|---------|
| Pede benchmark detalhado | ≥60% (3/5) | Curiosidade genuína = engajamento |
| Pede badge p/ compartilhar | ≥40% (2/5) | Orgulho = viral loop orgânico |
| Pergunta "como melhoro?" | ≥40% (2/5) | Adoção features = revenue expansion |
| Indica colega espontâneo | ≥1/5 | Viral loop de orgulho funcionando |
| Não reclama/ignora | 100% | Score positivo não pune |

### GO = Build Mínimo (3 semanas)
1. `titanScore.ts` — Motor: cálculo diário (cron 03h), pesos configuráveis, histórico
2. `titanScoreBenchmark.ts` — Agregação anônima por região + especialidade (mín 10 prestadores)
3. `titanScoreBadge.ts` — Geração SVG/PNG dinâmica: "Top 15% SP-Capital HVAC" + QR para perfil público
4. Página pública `/score/<userId>` (opt-in) — mostra score, badge, badge histórico, comparação anônima
5. Integração painel Pro: Card "Meu TitanScore" + botão "Compartilhar badge" (WhatsApp/LinkedIn/Twitter)
6. Eventos: `titanscore_calculado`, `badge_compartilhado`, `benchmark_visualizado`

### NO-GO = Descarta, custo 2 dias MKT

## Diferenciais Competitivos (Moat)
1. **Score POSITIVO** (capacidade) vs scores negativos (restrição) — prestador QUER mostrar
2. **Dados proprietários OLLI** (Fiador comportamental + volume real + qualidade + IA) — impossível replicar
3. **Benchmark anônimo regional** — "Top 15% SP-Capital HVAC" = contexto significativo
4. **Viral loop de ORGULHO** (não dinheiro) — custo zero, auto-reforçador
5. **Gateway para crédito real** (L5→L8) — score = creditworthiness para Crédito de Obra, capital de giro, conta digital

## Riscos Mapeados
| Risco | Mitigação |
|-------|-----------|
| Prestador com score baixo se sente mal | Faixas <400 sem badge público; foco em "como melhorar" com ações concretas |
| Gamificação vicia métricas vanity | Pesos baseados em resultados reais (Fiador = recebimento real); auditar trimestral |
| Colega vê badge, acha que é "pay to win" | Transparência: "Score baseado em Fiador (recebimento real), volume, qualidade, IA" |
| LGPD: dados anônimos agregados | Agregação mínima 10 prestadores; opt-in para página pública; anonimização k-anonymity |

## Próximo se GO
- Igor aprova → CTO branch `claude/titanscore` → Dia 1: migration `titan_score` + `titan_score_historico` + cron cálculo
- Teste real com 20 prestadores (feature flag) 14 dias → medir viral coefficient orgânico (badge shares → cadastros)
- Decisão scale: se K-Factor orgânico (badge share → cadastro) ≥0.1 → rollout 100% Pro/Empresa