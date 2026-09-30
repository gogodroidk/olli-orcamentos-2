# OLLI — estado operacional

> Este arquivo é injetado em TODO chat pelo hook `objetivo-inject.mjs`.
> Ele existe para eu (Igor) nunca mais re-explicar o estado do projeto.
> **Atualize 2–5 linhas ao fim do dia.** Custa ~300 tokens injetados e mata ~2.000 de re-explicação por chat.

- **FASE (30/09/2026):** Onda A da auditoria de 29/09 **concluída e no ar**. Próximo = **Onda B: conversão
  e receita** (ativação até o 1º orçamento, primeiros pagantes). Nada de módulo novo (Onda D) antes de
  5–10 prestadores ativos e o 1º Pix pago. O gargalo é **negócio/caixa, não engenharia**:
  60 contas, 0 pagantes, 47 nunca criaram orçamento.

- **FONTE DE VERDADE:** relatório `Entregas Claude\OLLI\2026-09-29-auditoria-ecossistema\RELATORIO-MESTRE.md`
  (notas por área, top 15, plano em ondas, decisões pendentes) + `docs/ESTADO-2026-09-30.md` (o que está no ar).

- **FLUXO DE CÓDIGO (novo, 30/09):** a `main` é a verdade e **produção só sai de commit mesclado na main**.
  Trabalho = branch `claude/<tarefa>` ou `codex/<tarefa>` → PR → CI verde → merge → deploy.
  `C:\OLLI_REL` está no branch `codex/base-main` (= main 3f3326a), limpo. A automação do Codex
  "meta de perfeição" está **PAUSADA**; ao religar, ela deve seguir este fluxo (nunca mais árvore suja em produção).
  Repo `gogodroidk/olli-orcamentos-2` é **privado** desde 29/09.

- **NO AR (30/09):** IA com cadeia paga barata (gpt-4.1-nano → gemini-2.5-flash-lite → mistral-small, teto
  de preço por request e teto diário) · Pix do plano via AbacatePay (produção, webhook ok, cobrança consumida
  uma vez só) · lembretes de assinatura no app/painel · **e-mail real ligado** (boas-vindas + lembretes de
  ativação e de assinatura, com descadastro) · funil do login Google medido (`auth_funil_eventos`) ·
  Sentry em app/painel/worker · landing sem bastidores e com Pix.

- **PENDENTE COM O DONO:** GitHub Pro (proteção da main em repo privado) · Supabase Pro (bloqueio de senha
  vazada) · limite de crédito da chave OpenRouter · trocar `gemini-2.5-flash-lite` antes de **20/10/2026**
  (sai do catálogo) · novo APK/AAB com Pix, lembretes e login Google (testar no emulador `olli_phone`) ·
  primeiro Pix real · preço/limite do grátis · webhook da Resend assinando bounced/complained.

- **DOMÍNIO:** decisão do dono, **não mexer** — ele compra o canônico depois e a troca é feita então.

- **ARMADILHAS (P0, não são sugestão):**
  1. **Erro nunca vira vazio** — todo gate de plano/permissão/vertical exige **3 estados** (carregando | erro | valor).
  2. **Copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types, Stripe live) — nunca de memória (já mentiu 5x).
  3. Antes de publicar: conferir que o que vai ao ar é o commit mesclado (diff do bundle contra produção se houver dúvida).
  4. Modelos `:free` do OpenRouter NÃO servem com `data_collection:'deny'` (LGPD) — use a allowlist paga.
  5. PowerShell não roda comando começando com dígito; MCP no Windows exige `setx` + reiniciar.

- **ROTEAMENTO (skill `roteador-de-modelos`):** braçal em lote → `swarm` (grátis) · braçal com tool-use → `haiku` ·
  análise → `sonnet` · **síntese, decisão e escrita sensível → Opus, nunca abaixo**. Fable só horizonte longo.

- **MODO:** execute sem me apresentar plano. Decisão de produto é minha; execução é sua.
  Item "exige humano" → marque BLOQUEADO e siga para o próximo. Não pare para confirmar passo técnico.
