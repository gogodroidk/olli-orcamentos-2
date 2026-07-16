# PROTOCOLO DO PILOTO — lido a cada iteração. Não improvise fora dele.

## 0. Regra suprema
**PERGUNTAR É PROIBIDO.** O chat está sozinho. Na dúvida entre interpretar e travar:
**trave o item** (`BLOQUEADO-*`) com o motivo e **siga para o próximo**.
Nunca pare o loop para esperar humano.

## 1. Seleção do item
1. Leia `docs/PILOTO/LEDGER.md` inteiro.
2. Item com `INICIO` sem `FIM` = a sessão anterior morreu no meio. **Retome esse item** — mas antes de
   refazer qualquer coisa, verifique com `git log --oneline -10` e `git diff` o que já existe.
3. Senão: primeiro item `[AUTO]` de `docs/PILOTO/FILA.md` (ordem do arquivo = prioridade) sem
   `FIM ... DONE` nem `FIM ... BLOQUEADO-*` no ledger.
4. Itens `[HUMANO]`: registre `FIM BLOQUEADO-HUMANO` e pule. **Jamais** tente, simule ou contorne.
5. Registre **antes** de trabalhar: `| <ISO> | <id> | INICIO | iteração N |`

## 2. Roteamento por custo (obrigatório — skill `roteador-de-modelos`)
- **Braçal em lote** (varrer N arquivos, extrair padrão, gerar rascunho descartável): `swarm` (grátis).
  **Guarda de cota:** leia `CONFIG CLAUDE/swarm/quota.json` antes; se `count >= 38`, swarm está
  proibido nesta iteração — use subagente `haiku`. Máximo 8 chamadas swarm por item.
- **Braçal com tool-use** (ler repo, rodar lint/teste, codemod já especificado): subagente `haiku`.
- **Análise média** (mapear fluxo, revisar diff, comparar): subagente `sonnet`.
- **Código final, decisão, escrita sensível, síntese:** **INLINE — você (Opus). Nunca delegue.**
- **Workflow** só quando o item tem 3+ frentes paralelas independentes. É braço, nunca cérebro.

## 3. Execução
- Cumpra o **DoD escrito na FILA**. DoD não verificado = item **não** está DONE.
- **Prova é contra o mundo**, nunca opinião de outro modelo: exit code, HTTP status, token real.
  O swarm é braço — ele **não vota** em "está funcionando".
- Regras transversais inegociáveis:
  - **3 estados** (carregando | erro | valor) em QUALQUER gate de plano/permissão/vertical.
    Erro **nunca** vira vazio.
  - **Copy/preço/feature só derivada da fonte** (`PLANOS_BASE`, types, Stripe live) — nunca de memória.

## 4. Registro e commit
- Um commit por item em `claude/piloto-p0`: `piloto(p0): <id> <resumo curto>`.
- **NUNCA** `git push`. **NUNCA** `wrangler deploy` do worker. **NUNCA** tocar em secrets.
- Registre o fim (append-only, nunca edite linha existente):
  - `| <ISO> | <id> | FIM DONE | <hash> + evidência do DoD |`
  - `| <ISO> | <id> | FIM BLOQUEADO-HUMANO | o que o dono precisa fazer |`
  - `| <ISO> | <id> | FIM BLOQUEADO-TECNICO | o que falta e por quê |`
  - `| <ISO> | <id> | FIM TRAVADO | falhou 2x: motivo |`

## 5. Parada (3 gatilhos)
- Todos os itens com estado terminal, **ou**
- O mesmo item falhou 2x → `TRAVADO`, **ou**
- `.claude/HALT` existe (freio de mão do dono).

Ao parar:
1. Append no ledger: `RESUMO FINAL` + contagem DONE/BLOQUEADO/TRAVADO + lista do que espera o dono.
2. Dispare `PushNotification` ("Fila P0 do OLLI — X done, Y bloqueados").
3. Emita EXATAMENTE: `<promise>FILA_P0_VAZIA</promise>`
