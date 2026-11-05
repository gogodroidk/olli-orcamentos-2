> **NÃO EXECUTAR. NÃO ENVIAR ESTE TEXTO.**
> Rascunho antigo. Não rode o SQL daqui (a tabela `indicacoes` deste checklist não é a migration) e não mande o WhatsApp que promete crédito. O que vale é `docs/HANDOFF_INDICACAO.md` e o arquivo `supabase/migrations/20261010100000_indicacoes.sql` (não aplicar nesta etapa). A recompensa fica desligada (`INDICACAO_CREDITOS = 0`). O cartão que o usuário vê está em `src/utils/indicacaoTexto.ts` e, com 0, não promete crédito.

# Checklist de Execução — Indicação Mínima (Spec CPO 07/10)

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Base:** `Entregas Claude/OLLI/2026-10-07-trabalho/SPEC-INDICACAO.md` (Marina/CPO)  
**Objetivo:** Entregar em ~4 dias de CTO — reaproveita tudo que já existe, zero tabelas novas de crédito, zero meses Pro inventados.

---

## O Que JÁ EXISTE (Verificado no Repo)

| Item | Arquivo/Local | Status |
|------|---------------|--------|
| `credit_ledger` com `origem='referral'` | `worker/src/creditos.ts:65` | ✅ Pronto |
| Idempotência por (`origem`, `ref`) | Mesmo arquivo | ✅ Pronto |
| Selo "Feito com OLLI" clicável + UTM | `src/utils/marcaOlli.ts` | ✅ Pronto |
| Atribuição por cookie `olli_attr` | Worker auth/login flow | ✅ Pronto |
| `funil_exclusoes` + view ativação | Migration `20260930120100_funil_receita.sql` | ✅ Pronto |
| `Celebracao` + Share WhatsApp | `src/components/Celebracao.tsx` | ✅ Pronto |

---

## 4 Dias de CTO — Checklist Técnico

### DIA 1: Tabela `indicacoes` + Código Curto

```sql
-- Migration: 20261007_indicacoes.sql
CREATE TABLE public.indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(12) UNIQUE NOT NULL,           -- ex: "OLLI-JOAO3"
  indicador_id UUID REFERENCES auth.users(id) NOT NULL,
  indicado_id UUID REFERENCES auth.users(id) UNIQUE,  -- preenchido no cadastro
  estado VARCHAR(20) DEFAULT 'link_gerado',     -- link_gerado → cadastrou → orcou → recompensado
  criado_em TIMESTAMPTZ DEFAULT now(),
  cadastrou_em TIMESTAMPTZ,
  orcou_em TIMESTAMPTZ,
  recompensado_em TIMESTAMPTZ
);

CREATE INDEX idx_indicacoes_indicador ON public.indicacoes(indicador_id);
CREATE INDEX idx_indicacoes_codigo ON public.indicacoes(codigo);
CREATE INDEX idx_indicacoes_indicado ON public.indicacoes(indicado_id);

-- RLS: indicador vê só suas indicações; service_role (worker) escreve tudo
ALTER TABLE public.indicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicador_le_suas" ON public.indicacoes
  FOR SELECT USING (indicador_id = auth.uid());
```

**Entregável:** Migration aplicada + `indicacoes.ts` (tipos + helpers `gerarCodigo()`, `buscarPorCodigo()`)

---

### DIA 2: Cartão "Indique Colegas" — 2 Momentos

**Momento A:** Após "Conseguiu enviar? sim" (Celebracao)
**Momento B:** Quando cliente aprova/paga pelo link `/o/<token>` (webhook `orcamento_aprovado`)

```tsx
// src/components/IndicacaoCard.tsx
interface Props { momento: 'apos_envio' | 'apos_aprovacao' }

export function IndicacaoCard({ momento }: Props) {
  const { codigo, carregando } = useMeuCodigoIndicacao(); // hook novo
  const link = `https://olliorcamentos.online/?ref=${codigo}`;
  const msgWhats = `Oi! Uso o OLLI pra fazer orçamento rápido. Se você também orça, testa aí: ${link} (ganho crédito quando você faz o 1º).`;

  return (
    <View style={styles.card}>
      <Text style={styles.titulo}>Colega que orça igual a você?</Text>
      <Text style={styles.sub}>Mande seu link: quando ele fizer o 1º orçamento, você ganha {X}.</Text>
      <View style={styles.botoes}>
        <Button onPress={() => Share.share({ message: msgWhats })}>WhatsApp</Button>
        <Button onPress={() => Clipboard.setString(link)}>Copiar link</Button>
        <Button onPress={() => mostrarQR(link)}>QR Code</Button>
      </View>
    </View>
  );
}
```

**Eventos (analytics):**
- `indicacao_cartao_visto` (mount)
- `indicacao_compartilhada` (click WhatsApp/copiar/QR) — inclui `momento`

---

### DIA 3: Link `?ref=` + Atribuição no Cadastro

**Landing (`web/`) + Painel (`webapp/`) + App (`src/`):**

```js
// Em TODOS os entry points de cadastro (web, webapp, app):
function capturarRef() {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref && /^OLLI-[A-Z0-9]{4,8}$/.test(ref)) {
    // Cookie 30 dias + localStorage fallback
    document.cookie = `olli_attr=ref:${ref}; max-age=2592000; path=/; SameSite=Lax`;
    localStorage.setItem('olli_attr', `ref:${ref}`);
  }
}
// Chamar ANTES de qualquer redirect de auth
```

**Worker `authEmailHook.js` / `auth_funil_eventos`:**
- No `signup_completed`: ler `olli_attr` do cookie/header
- Se `ref:CODIGO` → `indicacoes.ts:buscarPorCodigo(codigo)` → atualiza `indicado_id = user_id`, `estado = 'cadastrou'`, `cadastrou_em = now()`
- Grava `auth_funil_eventos` com `evento='cadastro_por_indicacao', ref=codigo`

---

### DIA 4: Recompensa no 1º Orçamento (Worker)

**Gatilho:** `orcamento_criado` (já existe em `user_activity_log` + webhook)

```js
// worker/src/indicationReward.js
export async function processarRecompensaIndicacao({ orcamentoId, userId, valor }) {
  // 1. Buscar indicação onde indicado_id = userId E estado = 'cadastrou'
  const { data: ind } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('indicado_id', userId)
    .eq('estado', 'cadastrou')
    .single();
  
  if (!ind) return; // não veio por indicação
  
  // 2. Validações anti-fraude
  if (ind.indicador_id === userId) return; // auto-indicação
  if (valor <= 0) return; // orçamento sem valor
  if (await estaEmFunilExclusoes(ind.indicador_id)) return; // conta excluída
  
  // 3. Checar teto: 5 recompensas por indicador
  const { count } = await supabase
    .from('credit_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', ind.indicador_id)
    .eq('origem', 'referral');
  
  if (count >= 5) return; // teto atingido
  
  // 4. Creditar AMBOS (idempotência por (origem, ref) já existe em creditos.ts)
  const ref = ind.id; // UUID da indicação = ref único
  const X = await decidirQuantidadeCreditosIA(); // Igor define lendo creditos.ts
  
  await Promise.all([
    creditarIA(ind.indicador_id, X, 'referral', ref),
    creditarIA(userId, X, 'referral', ref), // indicado também ganha (double-sided)
  ]);
  
  // 5. Atualizar estado
  await supabase
    .from('indicacoes')
    .update({ estado: 'recompensado', orcou_em: new Date().toISOString(), recompensado_em: new Date().toISOString() })
    .eq('id', ind.id);
  
  // 6. Eventos
  await registrarEvento('indicado_primeiro_orcamento', { indicacao_id: ind.id, indicador_id: ind.indicador_id, indicado_id: userId });
  await registrarEvento('recompensa_creditada', { indicacao_id: ind.id, creditos: X });
}
```

**X (Quantidade de Créditos IA):**
- Igor decide lendo `creditos.ts` (pesos de cada ação)
- Sugestão: 10 créditos IA cada lado (equivalente a ~3 diagnósticos por voz)
- **Não é mês de Pro grátis** — Pro é venda, não brinde (regra do CPO)

---

## Regras de Negócio (Não Negociáveis)

| Regra | Implementação |
|-------|---------------|
| Recompensa só no 1º orçamento do indicado | `estado` vai `cadastrou` → `orcou` → `recompensado` (uma vez) |
| Indicado ≠ Indicador | Check `indicador_id !== userId` |
| Orçamento com cliente + valor > 0 | Check `valor > 0` e `cliente_id` existe |
| Fora de `funil_exclusoes` | `estaEmFunilExclusoes(indicador_id)` |
| Teto 5 recompensas/indicador | Count `credit_ledger` `origem='referral'` |
| Teto 1 recompensa/indicado | `indicado_id` UNIQUE na tabela |
| Double-sided (ambos ganham) | `creditarIA` para `indicador_id` E `userId` |

---

## Medição (Eventos, Sem Dado Pessoal)

| Evento | Quando | Campos |
|--------|--------|--------|
| `indicacao_cartao_visto` | Mount do card | `momento`, `indicador_id` |
| `indicacao_compartilhada` | Click WhatsApp/copiar/QR | `momento`, `canal` |
| `cadastro_por_indicacao` | Signup com `ref` válido | `indicacao_id`, `indicado_id` |
| `indicado_primeiro_orcamento` | Worker processa recompensa | `indicacao_id`, `valor` |
| `recompensa_creditada` | Crédito efetivado no ledger | `indicacao_id`, `creditos` |

**Critério de continuação (14 dias):**
- ≥10 `indicacao_cartao_visto`
- ≥3 `indicacao_compartilhada`
- ≥1 `indicado_primeiro_orcamento`
- **Cortar se 0 `indicacao_compartilhada`**

---

## LEGAL (Revisar Antes de Ligar)

1. **Recompensa = crédito de uso do próprio serviço** (IA), não dinheiro nem comissão por venda
2. **Termo curto** no app: quem ganha, quando, teto (5/1), direito de alterar/encerrar
3. **LGPD:** Só link/QR/WhatsApp compartilhado PELO PRÓPRIO PRESTADOR; sem upload de contatos; mensagem pronta assinada por ele; indicado consente no cadastro como todos
4. **Anti-spam WhatsApp:** OLLI não envia em massa; quem envia é a pessoa, 1 a 1
5. **Pergunta p/ LEGAL:** Tributação/classificação do crédito (bônus x desconto). Risco fraude (contas falsas): coberto por regra do 1º orçamento real + teto

---

## O Que FICA DE FORA (Escopo Mínimo)

- ❌ Cash / Pix / comissão por venda
- ❌ Tiers / "Embaixador" / gamificação
- ❌ Mês de Pro grátis (Pro = venda)
- ❌ Fiador OLLI grátis no 1º orçamento
- ❌ Onboarding VIP
- ❌ Indicação de cliente final (B2C)
- ❌ Dashboard complexo de indicações (só vê no painel se quiser depois)

---

## Próximo Passo Imediato

> **CTO/Igor:** Aprova esse checklist? Se sim, CTO inicia Dia 1 (migration + tipos) na branch `claude/indicacao-minima`. MKT prepara copy do card (momentos A/B) e mensagem WhatsApp padrão.