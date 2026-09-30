# C8 — IA operacional segura

Data: **2026-09-05**

Revalidação: **2026-09-06** — Worker, painel e contratos foram recompilados e
testados novamente após a inclusão do webhook Resend.

## Estado

**DONE_LOCAL.** O assistente continua respondendo consultas e bloqueia pedidos de
apagar tudo, limpar a base ou resetar a conta antes da chamada ao Worker. Pedidos
de mudança usam uma geração estruturada separada: se faltar alvo único ou valor,
a IA pergunta e não grava nada. Quando a proposta é válida, o Worker resolve o
registro no tenant, revalida o papel, permite somente campos do domínio real e
persiste uma prévia mínima protegida por token de confirmação de uso único.

O painel mostra alvo, antes/depois e ações explícitas de confirmar ou cancelar.
Depois de aplicada, a mudança pode ser desfeita enquanto o registro não recebeu
outra edição. Compare-before bloqueia perda de atualização; o journal é append-only,
e o diff privado expira em até 30 dias. Prompt e conversa não são persistidos.

## Evidência

- `npm run test:c8-ia-segura` — passou.
- `npm run test:ia-actions` — passou (allowlist, tenant, confirmação, coluna
  espelho, auditoria e retenção).
- `npm test` no Worker — passou.
- `npm run typecheck`, build do painel e dry-run do Worker — passaram.
- O contrato puro `criarRascunhoAcaoIa`/`autorizarRascunhoAcaoIa` aplica RBAC por
  escopo, allowlist de campos, confirmação exata, plano de rollback e journal
  idempotente, sem tocar em banco ou API.
- `worker/src/iaActions.js` implementa o adaptador persistente; a migration
  `20260906021103_ia_actions_safe_runtime.sql` mantém tabelas service-role only,
  RLS forçado, eventos append-only e purge explícito.

## Revalidação de staging — 2026-09-07

A migration `20260906021103_ia_actions_safe_runtime.sql` foi aplicada no
`OLLI-STAGING` e o Worker staging está publicado. O código continua sem
produção ativa e o canário autenticado depende dos secrets de teste, da
reconciliação da migration history e do smoke RLS/Storage. As linhas históricas
que diziam “migration ainda não aplicada” não representam mais o runtime de
staging; elas continuam como registro do aceite local original.

## Próximo gate

Executar um canário autenticado com dado sintético, reconciliar a migration
history e provisionar secrets de teste continuam bloqueios externos do C11. Até
isso ocorrer, o código não está ativo em produção. Não há rota para excluir,
cobrar, enviar ou alterar senha/documento pelo chat.
