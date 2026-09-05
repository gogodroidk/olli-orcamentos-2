# Continuar OLLI Orçamentos em um novo chat

Use estes arquivos como fonte de verdade da retomada:

1. `C:\OLLI_REL\docs\PILOTO\NEXT_PROMPT.md`
2. `C:\OLLI_REL\docs\PILOTO\RUN_STATE.json`
3. `C:\OLLI_REL\docs\PILOTO\TRANSVERSAL_READINESS.json`
4. `C:\OLLI_REL\docs\PILOTO\SUPABASE_BASELINE_20260904.md`

Repositório canônico: `C:\OLLI_REL`  
Marca única: **OLLI Orçamentos** (O-L-L-I).

## Estado atual

- A última fatia executada foi `supabase-live-schema-baseline-capture`.
- O Chrome e o SQL Editor foram usados somente em leitura de catálogo no projeto
  Supabase confirmado `OLLI ORCAMENTOS` (ref. `yiaeplqinnnnniyvwtls`).
- O baseline sanitizado documenta tabelas, colunas, triggers e o hook de perfil;
  não contém linhas de usuários, PII, segredos ou tokens.
- `RUN_STATE.status=blocked`, `program100Percent=false` e as duas automações
  (`piloto-olli-0-100-continuidade-controlada` e
  `olli-vigia-cont-nua-de-gates-e-retomada`) estão `PAUSED`.
- Não iniciar migration, trigger real, envio, cobrança, deploy ou publicação
  sem uma decisão humana registrada sobre retenção/purge, ownership, janela,
  rollback, composição do hook e smoke test sintético.

## Para retomar

O novo chat deve revalidar Git e ler os quatro arquivos acima. Só reabrir a fila
quando houver mudança material: o proprietário escolher o gate e fornecer o
contexto mínimo. Então registrar novo `run_id`/`handoff_id`, abrir uma única
allowlist, executar a fatia segura, provar o DoD e atualizar o handoff.

O handoff histórico completo continua em
`C:\OLLI_REL\docs\HANDOFF_NOVO_CHAT_2026-08-25.md`; ele é referência histórica,
não substitui o estado atual do diretório `docs\PILOTO`.
