# HANDOFF — indicação "colega indica colega" (PR #195, branch `claude/indicacao`)

Estado: código + migration `20261010100000_indicacoes.sql` prontos, NÃO aplicada, NÃO mesclada. Recompensa desligada (`INDICACAO_CREDITOS=0`). Último a mexer: Claude, b59425d.

## Pendências ANTES de ligar a recompensa (`INDICACAO_CREDITOS > 0`)

1. **TTL de 7 dias na vaga `cadastrou`.** Hoje `indicacao_vincular` conta `cadastrou` + `recompensado` contra o teto de 5. Um indicado que cadastrou e nunca orçou ocupa a vaga para sempre: 30 dias depois ainda dá `teto_indicador`, e 5 contas sem orçamento (inclusive farmadas) travam o indicador. Regra a implementar: `cadastrou` só conta no teto se `cadastrou_em > now() - interval '7 days'`; passado o prazo a vaga é liberada (ou a linha vira `sem_recompensa`, motivo `expirou`). Cobrir em `scripts/teste-indicacoes-sql.ts` (vaga volta após 7 dias; recompensado nunca expira).
2. **Avisar o indicado.** Quem entra com o link e esbarra no teto, ou perde a vaga por TTL, precisa ver aviso claro no app/painel — hoje `/indicacao/vincular` devolve `status: teto_indicador` e a captura do `?ref` só apaga o código guardado, sem mensagem. Texto sem prometer recompensa que não vem. Também decidir se o indicador é avisado quando a vaga expira.

Origem: re-revisão LIVRE do #195 em b59425d. Não implementado de propósito.
