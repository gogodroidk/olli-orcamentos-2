> **NÃO EXECUTAR. NÃO ENVIAR ESTE TEXTO.**
> Rascunho antigo. Não rode o SQL daqui (ele lê `auth.users.email`) e não mande texto que prometa crédito. O que vale é `docs/HANDOFF_INDICACAO.md` e o arquivo `supabase/migrations/20261010100000_indicacoes.sql` (não aplicar nesta etapa). A recompensa fica desligada (`INDICACAO_CREDITOS = 0`). O cartão que o usuário vê está em `src/utils/indicacaoTexto.ts` e, com 0, não promete crédito.

# Plano de Execução: Teste Indicação Embutida no Orçamento (7 Dias)

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Status:** Infra pronta (92 testes passam), aguarda aprovação Igor para ativar flag  
**Objetivo:** Validar loop viral passivo (selo "Feito com OLLI" → `?ref=` → cadastro → 1º orçamento → créditos IA double-sided)

---

## 1. Pré-Requisitos (Já Entregues)

| Componente | Arquivo | Status |
|------------|---------|--------|
| Selo com `ref=` | `src/utils/marcaOlli.ts` | ✅ |
| PDF com `ref=` | `src/utils/pdfGenerator.ts` | ✅ |
| Handler `?ref=` universal | `web/src/utils/capturarRef.ts` | ✅ |
| Busca código indicação | `worker/src/link.js` → `buscarCodigoIndicacao` | ✅ |
| Passa `refCodigo` no selo do link | `worker/src/link.js` → `renderLinkPage` | ✅ |
| Testes automatizados | `scripts/teste-gratis-selo-paywall.ts` | ✅ 92 ok |

**Feature flag:** `indicacao_embutida` no `user_metadata` (Pro/Empresa only)

---

## 2. Desenho do Teste (A/B Simples)

### Grupos
| Grupo | Usuários | Flag | Tamanho |
|-------|----------|------|---------|
| **Tratamento** | 5 prestadores Pro/Empresa ativos (≥3 orçamentos/mês) | `indicacao_embutida=true` | 5 |
| **Controle** | 5 prestadores similares (matched por volume/vertical) | `indicacao_embutida=false` | 5 |

### Critério de Seleção (Supabase)
```sql
-- Prestadores ativos Pro/Empresa com ≥3 orçamentos nos últimos 30d
SELECT user_id, plano_efetivo, COUNT(*) as orcamentos_30d
FROM orcamentos o
JOIN user_plans up ON up.user_id = o.user_id
WHERE o.criado_em > now() - interval '30 days'
  AND up.plano_efetivo IN ('pro','empresa')
GROUP BY user_id, plano_efetivo
HAVING COUNT(*) >= 3
ORDER BY orcamentos_30d DESC
LIMIT 10; -- 5 tratamento + 5 controle
```

---

## 3. Métricas Primárias (7 Dias)

| Métrica | Definição | Target (Go) | Target (No-Go) |
|---------|-----------|-------------|----------------|
| **K-Factor** | Cadastros via ref= / Prestadores tratamento | ≥0.15 | <0.05 |
| **Cadastros via ref=** | `evento=cadastro_por_indicacao_embutida` | ≥3 | <1 |
| **Conversões (1º orçamento)** | `evento=indicado_primeiro_orcamento` | ≥1 | 0 |
| **CTR Selo** | Cliques / Impressões (por origem) | ≥2% | <0.5% |
| **Impressões/Prestador** | Orçamentos enviados × 3 origens (PDF/Link/Recibo) | ≥15/dia | — |

### Métricas Secundárias
- **Origem vencedora:** PDF vs Link `/o/` vs Recibo (qual converte mais)
- **Tempo até cadastro:** Média do `selo_clicado` → `cadastro_por_indicacao_embutida`
- **Double-sided creditado:** Ambos lados receberam créditos IA (`credit_ledger origem='referral'`)
- **Fraud check:** Zero alertas (>4 cadastros/hora mesmo indicador)

---

## 4. Dashboard de Acompanhamento (Tempo Real)

### Queries SQL (Supabase Dashboard `/admin/indicacoes`)

#### K-Factor Diário
```sql
WITH tratamento AS (
  SELECT user_id FROM user_metadata 
  WHERE indicacao_embutida = true
),
impressoes AS (
  SELECT DATE(criado_em) as dia, COUNT(*) as total
  FROM auth_funil_eventos
  WHERE evento = 'selo_renderizado'
    AND user_id IN (SELECT user_id FROM tratamento)
    AND criado_em > now() - interval '7 days'
  GROUP BY DATE(criado_em)
),
cliques AS (
  SELECT DATE(criado_em) as dia, COUNT(*) as total
  FROM auth_funil_eventos
  WHERE evento = 'selo_clicado'
    AND user_id IN (SELECT user_id FROM tratamento)
    AND criado_em > now() - interval '7 days'
  GROUP BY DATE(criado_em)
),
cadastros AS (
  SELECT DATE(criado_em) as dia, COUNT(*) as total
  FROM auth_funil_eventos
  WHERE evento = 'cadastro_por_indicacao_embutida'
    AND criado_em > now() - interval '7 days'
  GROUP BY DATE(criado_em)
),
conversoes AS (
  SELECT DATE(criado_em) as dia, COUNT(*) as total
  FROM auth_funil_eventos
  WHERE evento = 'indicado_primeiro_orcamento'
    AND criado_em > now() - interval '7 days'
  GROUP BY DATE(criado_em)
)
SELECT 
  COALESCE(i.dia, c.dia, ca.dia, co.dia) as dia,
  COALESCE(i.total, 0) as impressoes,
  COALESCE(c.total, 0) as cliques,
  COALESCE(ca.total, 0) as cadastros,
  COALESCE(co.total, 0) as conversoes,
  CASE WHEN COALESCE(ca.total, 0) > 0 
       THEN ROUND(ca.total::numeric / 5, 2) -- 5 prestadores tratamento
       ELSE 0 END as k_factor_diario
FROM impressoes i
FULL JOIN cliques c ON i.dia = c.dia
FULL JOIN cadastros ca ON COALESCE(i.dia, c.dia) = ca.dia
FULL JOIN conversoes co ON COALESCE(i.dia, c.dia, ca.dia) = co.dia
ORDER BY dia DESC;
```

#### Funil por Origem (PDF / Link / Recibo)
```sql
SELECT 
  motivo->>'origem' as origem,
  COUNT(*) FILTER (WHERE evento = 'selo_renderizado') as impressoes,
  COUNT(*) FILTER (WHERE evento = 'selo_clicado') as cliques,
  COUNT(*) FILTER (WHERE evento = 'cadastro_por_indicacao_embutida') as cadastros,
  COUNT(*) FILTER (WHERE evento = 'indicado_primeiro_orcamento') as conversoes,
  ROUND(100.0 * COUNT(*) FILTER (WHERE evento = 'selo_clicado') / 
        NULLIF(COUNT(*) FILTER (WHERE evento = 'selo_renderizado'), 0), 2) as ctr_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE evento = 'cadastro_por_indicacao_embutida') / 
        NULLIF(COUNT(*) FILTER (WHERE evento = 'selo_clicado'), 0), 2) as cadastro_por_clique_pct
FROM auth_funil_eventos
WHERE evento IN ('selo_renderizado','selo_clicado','cadastro_por_indicacao_embutida','indicado_primeiro_orcamento')
  AND criado_em > now() - interval '7 days'
  AND motivo->>'origem' IN ('pdf_orcamento','link_orcamento','recibo')
GROUP BY motivo->>'origem'
ORDER BY cadastros DESC;
```

#### Top Referrers (Prestadores que mais geram cadastros)
```sql
SELECT 
  i.indicador_id,
  u.email,
  COUNT(DISTINCT i.id) as indicacoes_criadas,
  COUNT(DISTINCT ca.indicacao_id) as cadastros_gerados,
  COUNT(DISTINCT co.indicacao_id) as conversoes_geradas,
  ROUND(COUNT(DISTINCT ca.indicacao_id)::numeric / GREATEST(COUNT(DISTINCT i.id), 1), 2) as k_factor_pessoal
FROM indicacoes i
LEFT JOIN auth.users u ON u.id = i.indicador_id
LEFT JOIN auth_funil_eventos ca ON ca.motivo->>'indicacao_id' = i.id::text 
  AND ca.evento = 'cadastro_por_indicacao_embutida'
LEFT JOIN auth_funil_eventos co ON co.motivo->>'indicacao_id' = i.id::text
  AND co.evento = 'indicado_primeiro_orcamento'
WHERE i.criado_em > now() - interval '7 days'
GROUP BY i.indicador_id, u.email
ORDER BY cadastros_gerados DESC;
```

---

## 5. Critério GO/NO-GO (Dia 7)

| Critério | GO (Rollout 100%) | NO-GO (Iterar/Descartar) |
|----------|-------------------|--------------------------|
| **K-Factor ≥0.15** | ✅ | ❌ |
| **Cadastros ≥3** | ✅ | ❌ |
| **Conversões ≥1** | ✅ | ❌ |
| **CTR Selo ≥2%** | ✅ | ❌ |
| **Zero Fraud** | ✅ | ❌ |

**Decisão:** Precisa de **TODOS** os critérios GO para rollout. Qualquer NO-GO = analisar origem perdedora, iterar, retestar.

---

## 6. Execução Passo a Passo

### D-1 (Hoje): Preparação
- [ ] Igor aprova teste → CTO ativa flag `indicacao_embutida=true` para 5 user_ids
- [ ] CTO ativa flag `indicacao_embutida=false` para 5 user_ids controle (matched)
- [ ] MKT valida no painel `/admin/indicacoes` que flags estão corretas

### D0: Lançamento
- [ ] Prestadores tratamento enviam orçamentos normalmente (selo já carrega `?ref=`)
- [ ] MKT monitora dashboard hora a hora nas primeiras 4h

### D1-D7: Acompanhamento Diário (9h)
- [ ] Atualizar dashboard `/admin/indicacoes` 
- [ ] Registrar métricas em planilha compartilhada
- [ ] Alertar se CTR <1% ou zero cadastros em 48h

### D7: Decisão
- [ ] Calcular métricas finais
- [ ] Aplicar critério GO/NO-GO
- [ ] Documentar learnings + origem vencedora
- [ ] Se GO: CTO agenda rollout 100% Pro/Empresa na sprint seguinte

---

## 7. Riscos e Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Pré-visualizador WhatsApp conta como clique | Alta | Infla CTR | `ehPreVisualizadorDeLink` já filtra no `link.js` |
| Cliente final não é prestador | Média | Baixa conversão | Métrica foca em cadastro + 1º orçamento (valida intenção) |
| Volume baixo (prestadores enviam poucos orçamentos) | Baixa | Métricas ruidosas | Seleção garante ≥3 orçamentos/mês |
| Bug no `ref=` tracking | Baixa | Dados inválidos | 92 testes passam; smoke test D0 |

---

## 8. Pós-Teste (Se GO)

| Ação | Responsável | Prazo |
|------|-------------|-------|
| Rollout flag 100% Pro/Empresa | CTO | Sprint seguinte |
| Dashboard `/admin/indicacoes` em produção | CTO | 1 semana |
| Gamificação no painel ("Seus orçamentos trouxeram X colegas") | MKT + CTO | 2 semanas |
| `?ref=` no recibo + `/v/<token>` (tl;dv style) | MKT + CTO | 2 semanas |
| Campanha launch "30 dias créditos 2x" | MKT | Rollout day |

---

## 9. Aprovação Necessária

> **Igor:** Aprova ativação do teste (5 tratamento + 5 controle, 7 dias)?  
> **CTO:** Confirma que flags podem ser ativadas via `user_metadata` hoje?

**Arquivos de apoio:**
- `docs/INDICACAO_EMBUTIDA_no_ORCAMENTO.md` (conceito)
- `docs/TESTE_INDICACAO_EMBUTIDA_plano_execucao.md` (este arquivo)
- `CONFIG CLAUDE/cerebro/claude-code/2026-10/APRENDIZADO_2026-10-07_viral_coefficient_dashboard.md` (benchmarks)