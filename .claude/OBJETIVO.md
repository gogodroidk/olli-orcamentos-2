# OLLI — estado operacional

> Este arquivo é injetado em TODO chat pelo hook `objetivo-inject.mjs`.
> Ele existe para eu (Igor) nunca mais re-explicar o estado do projeto.
> **Atualize 2–5 linhas ao fim do dia.** Custa ~300 tokens injetados e mata ~2.000 de re-explicação por chat.

- **FASE:** Onda 0 (confiança). Nada de Onda 5 antes das Ondas 0–3.
  O gargalo do OLLI é **negócio/caixa, não engenharia** (~88–90% pronto, zero pagantes).

- **FONTE DE VERDADE DE ESTADO:** `docs/EXECUTION_LOG.md` + `docs/FOLLOWUPS.md`.
  O plano-mestre (`Entregas Claude\OLLI-Plano-Mestre\`) é **síntese**, não inventário.
  O bundle `C:\ollx\h` e o kit `olli-program` são **aspiracionais** — não use como estado.

- **PRÓXIMO ITEM:** ver `docs/PILOTO/FILA.md` (primeiro `[AUTO]` sem estado terminal no LEDGER).

- **BLOQUEADO EM HUMANO (não tente, só reporte):**
  `MP_WEBHOOK_SECRET` no worker (o `MP_ACCESS_TOKEN` JÁ está lá — 16/07) · decisão F0d (grandfathering do paywall) ·
  Stripe (Installments + 3 Prices) ·
  TOTP admin · rotacionar senha da demo GR Tech.

- **ARMADILHAS (P0, não são sugestão):**
  1. **Erro nunca vira vazio** — todo gate de plano/permissão/vertical exige **3 estados** (carregando | erro | valor).
  2. **Copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types, Stripe live) — nunca de memória (já mentiu 5x).
  3. Wrangler: use `env -u CLOUDFLARE_API_TOKEN` — o token do `.env` é fraco e sabota o deploy.
  4. PowerShell não roda comando começando com dígito; MCP no Windows exige `setx` + reiniciar.

- **ROTEAMENTO (skill `roteador-de-modelos`):** braçal em lote → `swarm` (grátis) · braçal com tool-use → `haiku` ·
  análise → `sonnet` · **síntese, decisão e escrita sensível → Opus, nunca abaixo**. Fable só horizonte longo.

- **MODO:** execute sem me apresentar plano. Decisão de produto é minha; execução é sua.
  Item "exige humano" → marque BLOQUEADO e siga para o próximo. Não pare para confirmar passo técnico.
