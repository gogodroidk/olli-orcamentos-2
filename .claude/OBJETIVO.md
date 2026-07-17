# OLLI — estado operacional

> Este arquivo é injetado em TODO chat pelo hook `objetivo-inject.mjs`.
> Ele existe para eu (Igor) nunca mais re-explicar o estado do projeto.
> **Atualize 2–5 linhas ao fim do dia.** Custa ~300 tokens injetados e mata ~2.000 de re-explicação por chat.

- **FASE:** Onda 0 (confiança). Nada de Onda 5 antes das Ondas 0–3.
  O gargalo do OLLI é **negócio/caixa, não engenharia** (~88–90% pronto, zero pagantes).

- **FONTE DE VERDADE DE ESTADO:** `docs/EXECUTION_LOG.md` + `docs/FOLLOWUPS.md`.
  O plano-mestre (`Entregas Claude\OLLI-Plano-Mestre\`) é **síntese**, não inventário.
  O bundle `C:\ollx\h` e o kit `olli-program` são **aspiracionais** — não use como estado.

- **PRÓXIMO ITEM:** a FILA zerou (16/07) e o **Plano-Mestre inteiro foi varrido** (17/07).
  Tudo em `claude/piloto-p0` (29 commits, **não pushado** — o merge é ato do dono).
  Ler o **RESUMO FINAL 2** em `docs/PILOTO/LEDGER.md`: tabela das 16 prioridades com o estado real.
  **Prontas:** 3,5,6,7,9,11,13,14,15 + as partes codáveis da 4. **Restam só as que exigem você**
  (ver bloqueios abaixo) e a 16, que o próprio plano manda congelar.
  Gate de verdade agora existe: `npm test` (134 asserts, 8 arquivos) + `npm run typecheck` (exit 0).

- **F0d — DECIDIDO em 17/07 (não é mais bloqueio):** grandfathering por flag. Org que já existia
  mantém Equipe; org NOVA precisa do Empresa. Motivo: sob incerteza escolhe-se o **reversível**
  (desfaz com 1 `UPDATE`; usuário cortado churna e não volta). Revogar:
  `update public.organizacoes set equipe_grandfathered = false;`. Detalhe no EXECUTION_LOG.

- **BLOQUEADO EM HUMANO (não tente, só reporte):**
  **3 migrations a rodar ANTES de publicar o worker** (`20260724_webhook_events`,
  `20260725_equipe_grandfathering`, `20260726_credit_ledger_imutavel` — fora de ordem: 500/503) ·
  `MP_WEBHOOK_SECRET` (o `MP_ACCESS_TOKEN` já está lá) ·
  **emulador `olli_phone`** — única prova que falta da Onda 0 (O0-1/O0-2/O0-3 codados e provados em
  lógica; os testes de login/troca de conta exigem digitar senha, que o piloto não faz) ·
  **decisão do O2-19** (numeração: 4 opções em FOLLOWUPS #31 — a "opção 4" tem furo, ver o item) ·
  **decisão do preço de CRÉDITO** (worker cobra R$0,25-0,498/cr; rascunho propõe R$0,10-0,15 — hoje
  não há tela de compra, então não há mentira publicada: decida ANTES de existir copy de crédito) ·
  chave do PostHog · chave do Resend + **verificar o domínio** (sem isso o e-mail falha calado) ·
  Stripe (Installments + 3 Prices) · TOTP admin · rotacionar senha da demo GR Tech ·
  contas Play/Apple + IAP iOS (não codado) · `pg_dump` baseline das 13 tabelas legadas.

- **DOMÍNIO:** decisão do dono, **não mexer** — ele compra o canônico depois e a troca é feita então.
  `astro.config.mjs` segue em `olliorcamentos.online` (17/07).

- **APRENDIDO EM 16/07 (não repita):**
  **A própria FILA estava velha.** 5 itens (O3-25..29) já tinham sido corrigidos por `e9a4efe`, e o DoD
  do O2-19 pedia uma coluna (`organizacao_id`) que **não existe** no schema. Confira no repo vivo se o
  item ainda é verdade ANTES de codar. Agora há gate de verdade: `npm test` (89 asserts, 5 arquivos) e
  `npm run typecheck` (exit 0 — vivia vermelho com 854 erros que não eram bugs, era o tsconfig raiz
  compilando o `webapp/` com o compilador do app).

- **ARMADILHAS (P0, não são sugestão):**
  1. **Erro nunca vira vazio** — todo gate de plano/permissão/vertical exige **3 estados** (carregando | erro | valor).
  2. **Copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types, Stripe live) — nunca de memória (já mentiu 5x).
  3. Wrangler: use `env -u CLOUDFLARE_API_TOKEN` — o token do `.env` é fraco e sabota o deploy.
  4. PowerShell não roda comando começando com dígito; MCP no Windows exige `setx` + reiniciar.

- **ROTEAMENTO (skill `roteador-de-modelos`):** braçal em lote → `swarm` (grátis) · braçal com tool-use → `haiku` ·
  análise → `sonnet` · **síntese, decisão e escrita sensível → Opus, nunca abaixo**. Fable só horizonte longo.

- **MODO:** execute sem me apresentar plano. Decisão de produto é minha; execução é sua.
  Item "exige humano" → marque BLOQUEADO e siga para o próximo. Não pare para confirmar passo técnico.
