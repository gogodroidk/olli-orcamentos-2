# Ideia Inovadora: Passaporte de Preço Anônimo (Benchmark Colaborativo)

**Data:** 2026-10-06  
**Autor:** MKT — CMO (LIVRE)  
**Ninguém propôs:** Conecta L2 (dados) → L1 (comissão/volume) → L5 (crédito) num loop de valor próprio

---

## Conceito

Prestador opt-in compartilha **preço médio real de OS por categoria/região** (dado que OLLI já tem no banco: orçamentos aprovados + recibos). OLLI agrega anonimizado (mínimo 10 prestadores/região/categoria) e devolve benchmark personalizado:

> "Seu preço médio de instalação de ar-condicionado 12.000 BTU em SP-Zona Sul: **R$ 1.450**. Média da região: **R$ 1.720**. Você está **16% abaixo** — subindo para a média, cada OS rende R$ 270 a mais."

**Monetização futura (quando volume existir):**
- Relatório mensal grátis no Pro; avulso R$ 29/mês no Grátis
- Dado alimenta scoring de crédito (L5): quem cobra certo = menor inadimplência = melhor taxa
- Dado viabiliza comissão por serviço (L1): volume real de transações = split viável

---

## Teste de 2 Dias (R$ 0, sem build)

### Dia 1: Preparação (manual)
1. Exportar do Supabase: `orcamentos` aprovados + `recibos` pagos dos últimos 90 dias → CSV com `prestador_id`, `categoria_servico` (derivado de `servicos`), `regiao` (CEP do cliente), `valor_total`
2. Agregar em Python/pandas: média, mediana, P25/P75 por `categoria_servico` + `regiao` (CEP prefixo 5 dígitos)
3. Filtrar grupos com **≥10 prestadores distintos** (anonimato)
4. Gerar 10 relatórios individuais (PDF simples) para 10 prestadores ativos (escolhidos: têm ≥5 OS nos 90d)

### Dia 2: Entrega + Medição
1. Enviar por WhatsApp/email pessoal (Igor aprova): "Relatório exclusivo: como seu preço compara com a região"
2. Incluir: benchmark + sugestão de ajuste + link para editar catálogo no app
3. **Métrica primária (2 dias):** % que abrem o relatório (tracking pixel no PDF ou link único)
4. **Métrica secundária (7 dias):** % que editam pelo menos 1 preço no catálogo após ver o benchmark
5. **Métrica terciária (30 dias):** variação do preço médio das OS novas vs baseline

---

## Critério de Sucesso (GO/NO-GO)

| Métrica | Threshold GO | Threshold NO-GO |
|---------|--------------|-----------------|
| Abertura relatório | ≥ 60% (6/10) | < 30% |
| Edita preço em 7d | ≥ 30% (3/10) | < 10% |
| Preço médio sobe ≥ 5% em 30d | Sim | Não |

Se **GO** → dev builda feature no app (página "Meu Benchmark" no painel Pro, opt-in LGPD claro)
Se **NO-GO** → descarta, custo = 2 dias do MKT

---

## Por Que Ninguém Propôs

- **Não é feature "sexy"** (não é IA, não é 3D, não é marketplace)
- **Exige volume de dados** que OLLI só tem agora (698 códigos erro + PMOC + 352 clientes + 20 OS aprovadas = primeira amostra viável)
- **Ponte L2→L5** (dados → crédito) é abstrata; times focam em L0/L1
- **LGPD assusta** — mas opt-in + agregação anônima + mínimo 10 = seguro

---

## Efeito Volante (se der certo)

```
Prestador vê benchmark → ajusta preço → fecha mais OS → mais volume no OLLI
                                    ↓
                            Mais dados de preço real → benchmark melhor
                                    ↓
                            Scoring de crédito melhor (L5) → taxa menor para prestador
                                    ↓
                            Prestador indica colega ("olha meu benchmark") → viral
```

---

## Riscos (e mitigação)

| Risco | Mitigação |
|-------|-----------|
| Prestador acha que OLLI "vigia" preço | Opt-in explícito, LGPD, dado anônimo agregado, benefício direto pro bolso |
| Concorrente copia | Dado é proprietário (OS reais no OLLI), efeito rede: mais prestadores = melhor benchmark |
| Preço sobe → cliente reclama | Benchmark mostra "preço justo de mercado", não "mais caro"; prestador justifica com qualidade |
| Volume insuficiente em regiões pequenas | Agregar por macro-região (estado) se <10 prestadores; mostrar "amostra limitada" |