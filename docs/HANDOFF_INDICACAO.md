# HANDOFF — indicação "colega indica colega" (Fase 2 do programa "indicou, os dois ganham 1 mês de Pro")

Branch `claude/indicacao-mes-pro` (rebase do #195 na main, sem force-push). Migration `20261010100000_indicacoes.sql`
NÃO aplicada; nada publicado; recompensa DESLIGADA por flag. Último a mexer: BUILD — Indicação (Claude).

## O que mudou em relação ao #195
- Recompensa: de "10 créditos de IA" para **1 mês de Pro nos dois lados**, concedido pelo mesmo mecanismo auditado do crédito de
  troca (`assinaturas.admin_plano_override` + `admin_override_ate`): sem dinheiro, intransferível, não toca no gateway, nunca
  rebaixa nível nem encurta vigência, soma sobre concessão vigente.
- UMA fonte para valor e tetos: `src/services/limitesComerciais.ts` (`INDICACAO_MESES_PRO`, `INDICACAO_TETO_PREMIADAS`,
  `INDICACAO_TETO_DIARIO`). Copy lê daí (nunca digita); worker espelha; SQL recebe por parâmetro; teste de paridade em
  `scripts/teste-indicacoes-sql.ts`.
- Flag: o worker só liga com `INDICACAO_RECOMPENSA_ATIVA='1'` (valor exato). Sem ela: banco não decide nada, app não promete nada.
- Só premia depois do indicado ENVIAR orçamento real, com e-mail confirmado dos dois lados e teto diário global
  (pendente, volta a valer; não vira "sem recompensa").

## Para ligar (nada disso foi feito)
1. Parecer/gate do líder do andar (CPO) sobre "mês de Pro" (o parecer de 21/10 avisa que muda a análise; Paulo desligado).
2. Pergunta ao contador sobre a contabilização do mês grátis (custo em caixa hoje = 0).
3. Patch da política de privacidade ("se você veio por indicação, guardamos quem indicou para conceder o mês").
4. Aplicar a migration pelo roteiro (staging primeiro, versão anterior anotada, smoke) e só então setar a flag.
5. TTL de 7 dias na vaga `cadastrou` (pendência antiga abaixo) e aviso ao indicado no teto.

## Pendências antigas (re-revisão LIVRE do #195, não implementadas de propósito)
- **TTL de 7 dias na vaga `cadastrou`:** hoje `cadastrou` + `recompensado` contam no teto do vínculo; quem nunca orça ocupa a vaga.
  Regra: `cadastrou` só conta se `cadastrou_em > now() - interval '7 days'`. Cobrir em `scripts/teste-indicacoes-sql.ts`.
- **Avisar o indicado** que esbarra no teto/vaga expirada (hoje `/indicacao/vincular` devolve `teto_indicador` e a captura do
  `?ref` só apaga o código). Texto sem prometer recompensa que não vem.
