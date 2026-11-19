# Execução: Programa de Indicação "Técnico Indica Técnico" — Spec Completa para Dev

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Objetivo:** Maior impacto em DINHEIRO/CRESCIMENTO — viral loop de aquisição orgânica (CAC ~R$ 0)  
**Base:** Pesquisa AllBetter ($50/indicação), Jobber (3 meses grátis double-sided), ServiceTitan ($500/demo), ReferPro (3x conversão, 83% indicariam mas só 29% fazem)  
**Fonte OLLI:** `planosBase.ts` (R$ 39/99), `precosPlanos.ts`, `entitlements.ts` (organizações/equipe), `iaAutopilot.ts` (Autopilot = ativação)

---

## Conceito: "Indicação que Paga a Conta"

**Prestador indica outro prestador → ambos ganham CRÉDITO OLLI (meses de Pro grátis) + badge "Fiador OLLI" no orçamento indicado**

| Quem Indica (Veterano) | Quem Chega (Novo) | Gatilho de Pagamento |
|------------------------|-------------------|----------------------|
| 1 mês Pro grátis (R$ 39) | 1 mês Pro grátis (R$ 39) | Novo assina Pro pós-trial (14 dias) |
| +1 mês por cada 3 indicações ativas (tiered) | Onboarding VIP (Igor/equipe) | Novo cria 1º orçamento via Autopilot |
| Badge "Embaixador OLLI" no perfil | Fiador OLLI grátis no 1º orçamento | Score ≥70 no Fiador |

**Por que CRÉDITO (não cash):**
- R$ 0 caixa (custo = margem de 1 mês Pro = ~R$ 39)
- Retém o indicador (precisa estar ativo para usar crédito)
- Alinha incentivo: indicador quer que o novo USE o app (não só assine)
- Contábil: diferido como "marketing expense" não "cash outflow"

---

## Spec Técnica (Pronto para Dev)

### 1. Banco de Dados (Supabase)

```sql
-- Nova tabela: indicacoes
CREATE TABLE public.indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador_id UUID REFERENCES auth.users(id) NOT NULL,
  indicado_id UUID REFERENCES auth.users(id) UNIQUE, -- preenchido quando assina
  codigo VARCHAR(12) UNIQUE NOT NULL, -- ex: "OLLI-JOAO3"
  status VARCHAR(20) DEFAULT 'pendente', -- pendente, ativo, creditado, expirado
  criado_em TIMESTAMPTZ DEFAULT now(),
  ativado_em TIMESTAMPTZ,
  creditado_em TIMESTAMPTZ,
  tier_indicador INT DEFAULT 0, -- 0, 1, 2, 3+ (quantas ativas)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Nova tabela: creditos_olli
CREATE TABLE public.creditos_olli (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tipo VARCHAR(30) NOT NULL, -- 'indicacao_veterano', 'indicacao_novo', 'onboarding_vip'
  meses_pro INT NOT NULL, -- 1, 2, 3...
  origem_indicacao_id UUID REFERENCES public.indicacoes(id),
  status VARCHAR(20) DEFAULT 'disponivel', -- disponivel, aplicado, expirado
  criado_em TIMESTAMPTZ DEFAULT now(),
  aplicado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_indicacoes_indicador ON public.indicacoes(indicador_id);
CREATE INDEX idx_indicacoes_codigo ON public.indicacoes(codigo);
CREATE INDEX idx_creditos_user ON public.creditos_olli(user_id, status);
```

### 2. Worker: `indicationEngine.js` (Novo Arquivo)

```javascript
/**
 * Motor de Indicações - Lógica pura, testável, sem rede
 * Gatilhos: signup, trial_converted, first_quote_autopilot
 */

export const INDICACAO_REGRAS = Object.freeze({
  // Recompensas
  CREDITO_VETERANO_MESES: 1,
  CREDITO_NOVO_MESES: 1,
  CREDITO_TIER_3_MESES: 1, // a cada 3 ativas
  
  // Gatilhos
  GATILHO_ATIVACAO: 'trial_converted', // ou 'first_quote_autopilot' para Grátis
  GATILHO_EXPIRACAO_CODIGO_DIAS: 90,
  
  // Limites
  MAX_CREDITOS_ACUMULADOS_MESES: 12, // teto 1 ano grátis
});

export function gerarCodigoIndicacao(userId) {
  const base = userId.slice(0, 4).toUpperCase();
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `OLLI-${base}${random}`;
}

export function calcularRecompensaVeterano(tierAtual) {
  let meses = INDICACAO_REGRAS.CREDITO_VETERANO_MESES;
  if ((tierAtual + 1) % 3 === 0) meses += INDICACAO_REGRAS.CREDITO_TIER_3_MESES;
  return meses;
}

export function validarIndicacaoParaCredito(indicacao, eventoGatilho) {
  if (indicacao.status !== 'ativo') return { valido: false, motivo: 'status_invalido' };
  if (eventoGatilho !== INDICACAO_REGRAS.GATILHO_ATIVACAO) return { valido: false, motivo: 'gatilho_invalido' };
  const dias = (Date.now() - indicacao.ativado_em) / (1000 * 60 * 60 * 24);
  if (dias > INDICACAO_REGRAS.GATILHO_EXPIRACAO_CODIGO_DIAS) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

export function aplicarCredito(indicadorId, meses, tipo, origemId, agora = new Date()) {
  const expiraEm = new Date(agora);
  expiraEm.setMonth(expiraEm.getMonth() + 12); // expira em 1 ano
  return {
    user_id: indicadorId,
    tipo,
    meses_pro: meses,
    origem_indicacao_id: origemId,
    status: 'disponivel',
    criado_em: agora.toISOString(),
    expira_em: expiraEm.toISOString(),
  };
}
```

### 3. Integração com `planoEfetivo.ts` (Crédito Aplica no Checkout)

```javascript
// Em derivarPlanoEfetivo() - adicionar antes de retornar
async function aplicarCreditosSeExistir(userId, planoEfetivo) {
  if (planoEfetivo !== 'pro') return planoEfetivo; // só Pro usa crédito
  
  const { data: creditos } = await supabase
    .from('creditos_olli')
    .select('meses_pro')
    .eq('user_id', userId)
    .eq('status', 'disponivel')
    .gte('expira_em', new Date().toISOString());
  
  const totalMeses = creditos?.reduce((sum, c) => sum + c.meses_pro, 0) || 0;
  if (totalMeses > 0) {
    // Marcar créditos como aplicados
    await supabase
      .from('creditos_olli')
      .update({ status: 'aplicado', aplicado_em: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'disponivel');
    
    // Retornar plano com flag de crédito
    return { ...planoEfetivo, credito_meses: totalMeses, preco_efetivo: 0 };
  }
  return planoEfetivo;
}
```

### 4. Frontend: Página "Indique e Ganhe" (Painel Web + App)

**Rota:** `/indicacoes` (painel) / `IndicacoesScreen` (app)

**Componentes:**
- `MeuCodigoIndicacao` — mostra código + botão copiar + compartilhar (WhatsApp/Email/SMS)
- `DashboardIndicacoes` — lista indicados, status, créditos ganhos, próximo tier
- `ProgressoTier` — barra visual "2/3 para +1 mês grátis extra"

**Deep Link:** `olli://indicacao?codigo=OLLI-JOAO3` → abre app/store → preenche código no signup

### 5. Emails Automatizados (worker/emailIndicacaoTemplate.js)

| Trigger | Template | Para Quem |
|---------|----------|-----------|
| `indicacao_criada` | "Seu código está pronto: OLLI-JOAO3" | Indicador |
| `indicado_cadastrou` | "João indicou você! 1 mês Pro grátis para testar" | Indicado |
| `indicado_ativou` | "🎉 Seu indicado ativou! +1 mês Pro grátis creditado" | Indicador |
| `tier_atingido` | "3 indicações ativas! +1 mês EXTRA grátis" | Indicador |
| `credito_expirando` | "Seus créditos expiram em 7 dias — use no próximo Pix" | Indicador |

### 6. Fiador OLLI Integrado

- Novo indicado (Grátis) → 1º orçamento com **Fiador OLLI grátis** (score ≥70)
- Badge no PDF/link: "🛡️ Garantido pela OLLI — indicação de [Nome]"
- Se indicado assina Pro → Fiador vira benefício permanente do plano

---

## Métricas de Sucesso (Dashboard)

| Métrica | Baseline | Target 30d | Target 90d |
|---------|----------|------------|------------|
| % prestadores ativos com código gerado | 0% | 40% | 70% |
| Indicações por prestador ativo/mês | 0 | 0,5 | 1,2 |
| Taxa conversão indicado → Pro | 0% | 25% | 35% |
| CAC orgânico (indicação) | N/A | R$ 0 | R$ 0 |
| % novos signups via indicação | 0% | 20% | 40% |
| Retenção indicador (usa crédito) | N/A | 80% | 90% |

---

## Implementação em Fases (Sem Quebrar Nada)

### Fase 1 (Semana 1) — Core Mínimo
- [ ] Tabelas Supabase + RLS
- [ ] `indicationEngine.js` + testes unitários
- [ ] Geração código no signup (hook `auth_funil_eventos`)
- [ ] Página `/indicacoes` no painel (read-only: mostra código + status)

### Fase 2 (Semana 2) — Crédito + Checkout
- [ ] Integração `planoEfetivo.ts` + `precosPlanos.ts`
- [ ] Aplicação automática no checkout Pix (AbacatePay)
- [ ] Emails transacionais (4 templates)
- [ ] Deep link `olli://indicacao?codigo=`

### Fase 3 (Semana 3) — Viral Loop
- [ ] Compartilhamento nativo (WhatsApp/Email/SMS via Share API)
- [ ] Dashboard indicador com tier progress
- [ ] Fiador OLLI grátis no 1º orçamento do indicado
- [ ] Notificação push "Seu indicado criou 1º orçamento!"

### Fase 4 (Contínuo) — Otimização
- [ ] A/B test: cash R$ 50 vs crédito 1 mês (AllBetter style)
- [ ] Tiered rewards: 5 indicações = 1 ano grátis
- [ ] Gamificação: ranking mensal "Top Embaixadores"
- [ ] Integração CRM: indicador vê pipeline do indicado (com permissão)

---

## Prova de Conceito (Executável HOJE, R$ 0)

**Teste Manual 2 Dias (Igor + 5 Prestadores Ativos):**

1. **Dia 1:** Igor cria 5 códigos manuais (`OLLI-IGOR1` a `OLLI-IGOR5`) no Supabase
2. **Dia 1:** Igor envia WhatsApp pessoal para 5 prestadores ativos:
   > "Teste interno: indique um colega técnico. Se ele assinar Pro, VOCÊ ganha 1 mês grátis (R$ 39) + ELE ganha 1 mês grátis + Fiador OLLI no 1º orçamento. Código: OLLI-IGOR1. Quer testar?"
3. **Dia 2:** Medir:
   - % que pedem código para compartilhar (target ≥60%)
   - Quantos indicados cadastros nos 2 dias (target ≥3)
   - Quantos indicados criam 1º orçamento via Autopilot (target ≥2)

**GO/NO-GO:**
- GO: ≥60% pedem código + ≥3 cadastros → dev builda Fase 1
- NO-GO: descarta, custo = 30 min do Igor no WhatsApp

---

## Arquivos Criados (PROVA)

1. `docs/INDICACAO_TECNICO_INDICA_TECNICO_spec.md` (este arquivo)
2. `docs/EMAIL_BOAS_VINDAS_FOUNDER_v1.md` (pronto para deploy)
3. `docs/EMAIL_ATIVACAO_AUTOPILOT_v1.md` (pronto para A/B)
4. `docs/IDEIA_INOVADORA_FIADOR_OLLI.md` (teste manual aprovado)
5. `docs/IDEIA_INOVADORA_PASSAPORTE_PRECO.md` (teste manual aprovado)
6. `CONFIG CLAUDE/cerebro/claude-code/2026-10/APRENDIZADO_2026-10-06_saas_activation_benchmarks.md`
7. `CONFIG CLAUDE/cerebro/claude-code/2026-10/APRENDIZADO_2026-10-06_email_onboarding_behavioral.md`
8. `CONFIG CLAUDE/cerebro/claude-code/2026-10/APRENDIZADO_2026-10-06_referral_field_service_saas.md` (novo - salvo abaixo)

---

## Próximo Passo Imediato (Aprovação Igor)

> **Igor:** Aprova teste manual 2 dias (5 prestadores, WhatsApp seu)? Se GO, dev inicia Fase 1 na segunda. CAC orgânico = R$ 0, viral loop = crescimento composto.