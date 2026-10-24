# Ideia Inovadora: "Programa de Indicação Reversa" — Cliente Final Indica Prestador (B2C2B)

**Data:** 2026-10-07  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Inverte o fluxo tradicional — **cliente final satisfeito indica o prestador para OUTROS CLIENTES** (vizinhos, síndicos, facilities). O prestador ganha lead qualificado "quente" (confiança transferida). OLLI vira marketplace de confiança, não só ferramenta.

---

## Conceito

**Problema real:** Prestador faz um serviço impecável → cliente ama → cliente **não indica** porque "não lembra", "não sabe como", "não vale a pena".

**Inversão:** Cliente final vira **embaixador ativo** do prestador:
1. Cliente aprova orçamento / paga / recebe OS finalizada → **momento de felicidade**
2. OLLI dispara: "Gostou do [Prestador]? Indique para 3 vizinhos/colegas → você ganha R$ 50 em crédito, eles ganham 10% off no 1º serviço"
3. Cliente compartilha link único `olliorcamentos.online/indica/CODIGO_CLIENTE`
4. Vizinho clica → vê perfil do prestador (avaliações, fotos, especialidades) → solicita orçamento
4. Prestador recebe lead **pré-qualificado** (confiança do vizinho + necessidade real)
5. Se fechar → cliente ganha crédito, vizinho ganha desconto, prestador ganha job

**Diferencial vs indicação tradicional:**
| Tradicional | **Reversa (Cliente→Cliente)** |
|-------------|-------------------------------|
| Prestador pede indicação (awkward) | Cliente indica espontaneamente (orgulho) |
| Lead frio (amigo do amigo) | **Lead quente** (vizinho com mesmo problema) |
| Prestador "vende" indicação | **Cliente "presenteia" confiança** |
| Incentivo = cash/desconto | Incentivo = **status + reciprocidade** |

---

## Teste de 2 Dias (R$ 0, Manual, 3 Trios = 9 Pessoas)

### Dia 1: Preparação (Igor + 3 Clientes Finais Satisfeitos)
1. **Selecionar 3 clientes finais** que:
   - Aprovaram orçamento + pagaram + avaliaram 5 estrelas (últimos 30 dias)
   - São síndicos, donos de imóveis, ou moradores ativos em grupo de WhatsApp de condomínio
   - Têm vizinhos com mesmo equipamento (ar-cond, aquecedor, etc.)
2. **Proposta via WhatsApp (Igor):**
   > "Teste interno: Você amou o serviço do [Prestador]. Que tal indicar para 3 vizinhos? Cada um ganha 10% off no 1º serviço, você ganha R$ 50 em crédito OLLI por cada um que fechar. Link: `olliorcamentos.online/indica/SEU_CODIGO`. Topa testar? Responda 'INDICO'."

### Dia 2: Execução + Métricas
1. **Clientes compartilham** no grupo do condomínio/WhatsApp pessoal
2. **Métrica primária (24h):** % clientes que compartilharam (target ≥66% = 2/3)
3. **Métrica secundária (48h):** Vizinhos que clicaram + solicitaram orçamento (target ≥2 por cliente)
4. **Métrica terciária (7d):** Orçamentos fechados a partir da indicação (target ≥1 por trio)

---

## Critério GO/NO-GO

| Métrica | GO | NO-GO |
|---------|-----|-------|
| Cliente compartilha (24h) | ≥66% (2/3) | <33% |
| Vizinhos solicitam orçamento (48h) | ≥2/cliente | <1/cliente |
| Orçamentos fechados (7d) | ≥1/trio | 0 |

**Se GO** → Dev builda: `indicacaoReversa.ts` (link único por cliente, tracking UTM, crédito automático no `credit_ledger`, notificação push pro prestador "Novo lead quente do vizinho do [Cliente]").  
**Se NO-GO** → Descarta, custo = 30 min Igor no WhatsApp.

---

## Por Que Ninguém Propôs

| Barreira | Realidade OLLI |
|----------|----------------|
| "Cliente não indica" | **Já indica informalmente** — "Chama o João, ele resolveu meu ar" — só falta ferramenta + incentivo |
| "Incentivo cliente ≠ prestador" | **Alinhado:** Cliente ganha status + crédito; Prestador ganha lead quente; OLLI ganha volume |
| "LGPD - cliente expõe vizinho" | **Opt-in:** Cliente compartilha link público; Vizinho entra voluntariamente; Dados só ao solicitar orçamento |
| "Complexo de buildar" | **Reaproveita:** `credit_ledger`, `olli_attr`, `indicacoes` table, selo QR → só adicionar `tipo='cliente_final'` |
| "Concorrência (GetNinjas/Marketplace)" | **Não é marketplace** — é **ferramenta de confiança** para quem JÁ confia no prestador |

---

## Efeito Volante (Se Der Certo)

```
Cliente indica vizinho → Vizinho fecha → Cliente ganha crédito → Cliente indica mais
                                    ↓
                            Prestador recebe lead quente → Fecha mais → Mais clientes felizes
                                    ↓
                            Mais clientes indicam → Loop viral B2C2B → Volume ↑
                                    ↓
                            Volume → Split/comissão viável → Crédito L5 → Conta L8
```

---

## Diferencial vs Concorrentes

| Feature | GetNinjas/Marketplace | Indicação Tradicional | **Indicação Reversa OLLI** |
|---------|----------------------|----------------------|----------------------------|
| Quem indica | Prestador (awkward) | Prestador pede | **Cliente final (orgulho)** |
| Lead | Fria (busca genérica) | Morna (amigo) | **Quente (vizinho com mesmo problema)** |
| Confiança | Plataforma | Pessoal | **Transferida (vizinho confia no vizinho)** |
| Incentivo | Cash/desconto | Combinado offline | **Status + reciprocidade + crédito** |
| Atribuição | Último clique | Boca a boca | **Rastreável (link único por cliente)** |

---

## Riscos (e Mitigação)

| Risco | Mitigação |
|-------|-----------|
| Cliente indica "qualquer um" só pelo crédito | Validação: vizinho deve solicitar orçamento + prestador confirmar visita |
| Vizinho sente pressão do vizinho | Opt-in puro: link é público, vizinho decide sozinho |
| Prestador não atende bem o vizinho | Lead quente = prestador prioriza; avaliação pós-serviço obrigatória |
| Fraude: cliente cria contas fake de vizinho | Validação: orçamento só conta se tiver visita + OS assinada |
| LGPD | Dados do vizinho só coletados ao solicitar orçamento (consentimento no ato) |

---

## Próximo Passo Imediato

> **Igor:** Topa teste 2 dias com 3 clientes finais satisfeitos (síndicos/donos de imóvel) no WhatsApp? Se GO, dev especifica `indicacaoReversa.ts` na semana.