# Welcome transacional — persistência e simulador ativos

Esta janela aplicou a persistência transacional do welcome no projeto Supabase
**OLLI ORCAMENTOS** (`yiaeplqinnnnniyvwtls`) e publicou o consumer no Worker
`olli-diagnostico` em 4 de setembro de 2026. O runtime permanece restrito ao
simulador oficial do Resend; destinatários reais continuam bloqueados.

## Estado ativo no Supabase

- migration remota `20260904210942_email_welcome_outbox`;
- migration remota `20260904211038_email_welcome_tenant_indexes`;
- migration remota `20260904213759_email_welcome_dispatch_runtime`;
- tabelas `public.email_welcome_events` e `public.email_outbox` com RLS forçada
  e sem policies de cliente;
- grants de leitura, escrita e execução restritos ao `service_role`;
- enqueue idempotente, com uma ocorrência por usuário e versão de template;
- `public.claim_email_welcome_outbox(...)` como `SECURITY INVOKER`, usando
  `FOR UPDATE SKIP LOCKED`, token criptográfico, lease e teto de cinco tentativas;
- `public.settle_email_welcome_outbox(...)` como `SECURITY INVOKER`, com
  compare-and-set por idempotência, token e tentativa;
- retry derivado no banco em 1 min, 5 min, 30 min e 2 h; quinta tentativa ou
  erro não retentável termina em `dead_letter`;
- confirmações normais entram com `dispatch_scope=hold`;
- purge de PII terminal após 30 dias e remoção anonimizada após um ano.

As migrations canônicas estão em:

- `supabase/migrations/20260904205858_email_welcome_outbox.sql`;
- `supabase/migrations/20260904211012_email_welcome_tenant_indexes.sql`;
- `supabase/migrations/20260904212747_email_welcome_dispatch_runtime.sql`.

## Estado ativo no Worker

- versão `794daafb-bd92-4e10-8745-e28de6a6f4db`;
- cron `* * * * *`;
- `WELCOME_DISPATCH_MODE=simulator`;
- `WELCOME_BATCH_LIMIT=1`;
- único destinatário aceito pelo código: `delivered@resend.dev`;
- Resend chamado com a mesma chave estável de idempotência da outbox;
- resposta externa lida com teto de 32 KiB;
- logs estruturados sem destinatário, corpo, token ou segredo;
- falha de settle depois de uma chamada incerta ao provider deixa o lease
  expirar para recuperação idempotente, sem declarar sucesso falso.

As três superfícies do Worker foram comprovadas com HTTP 200:

- `https://olli-diagnostico.igoreluisa.workers.dev`;
- `https://diagnostico.olliorcamentos.online`;
- `https://link.olliorcamentos.online`.

O primeiro deploy revelou que os domínios configurados apenas no Dashboard
seriam removidos pelo Wrangler. A configuração canônica passou a declarar os
dois custom domains, `workers_dev=true` e previews desativados. O rollout final
restaurou as rotas e preservou a lista remota anterior de modelos de IA.

## Provas executadas

O canário transacional descartável do banco cobriu:

1. claim inicial;
2. falha retentável com backoff de um minuto;
3. recusa de claim antes do horário;
4. novo claim com outro token e tentativa incrementada;
5. rejeição do token antigo;
6. settle de sucesso;
7. `ROLLBACK` e resíduo zero.

O canário externo do runtime criou exatamente uma conta sintética e uma linha
`simulator`. O cron publicou `claimed=1`, `sent=1`, `failed=0`; o banco confirmou
`status=sent`, `attempts=1`, ID do provider presente, erro ausente e lease
liberado. Isso comprova aceitação pela API do Resend, não entrega em caixa. A
conta sintética foi removida depois da prova e Auth/eventos/outbox retornaram a
zero linhas sintéticas.

Os advisories `rls_enabled_no_policy` continuam intencionais, porque mantêm o
cliente fail-closed. Índices recém-criados podem aparecer como `unused_index`
antes de carga legítima.

## Limite e próximo gate

Não houve cliente, destinatário ou coorte real. Ativar `production` exige uma
autorização separada com coorte nominal, consentimento ou relação transacional,
supressão operacional, métricas de bounce/complaint, critérios de parada e
rollback para `hold`. O canário técnico não é aceite real.

## Supressão persistente — pacote local preparado

O pacote local agora inclui:

- `worker/src/emailSuppressionPersistenceContract.js`, que transforma estado e
  evento sintéticos em um plano atômico de CAS + append, ou em `no_op` para
  replay idêntico;
- `scripts/teste-email-suppression-persistence-contract.ts`, com isolamento por
  tenant/usuário, chaves exatas, fingerprint HMAC, clock, CAS, replay divergente,
  hard/soft bounce, complaint, unsubscribe, resubscribe e sucesso de entrega;
- `20260904_email_suppression.sql`, draft revisável com duas tabelas, RLS
  forçada, grants apenas ao `service_role`, RPC `SECURITY INVOKER`, retenção
  fail-closed e purge de escopo exato.

Esse SQL está deliberadamente fora de `supabase/migrations` e **não foi
aplicado**. Ele não recebe endereço bruto nem chave HMAC; a fingerprint deve ser
calculada em boundary confiável com segredo separado da service role. O estado
ativo não expira por tempo, porque apagar hard bounce/complaint poderia reativar
envio sem evidência nova. Exclusão de conta/organização remove o escopo por
cascade; um purge explícito exige tenant, usuário, fingerprint e revisão.

O consumer publicado ainda não usa esse pacote. A integração correta deve
ocorrer dentro da transação de claim, antes de incrementar `attempts`; conectar
o contrato depois do claim criaria janela TOCTOU e consumiria tentativa de uma
mensagem que deveria ser suprimida. Webhook Resend assinado, migration real,
rotação da fingerprint e integração do claim permanecem gates separados.

## Rollback operacional

1. definir `WELCOME_DISPATCH_MODE=off`;
2. remover ou pausar o Cron Trigger;
3. manter confirmações normais em `dispatch_scope=hold`;
4. preservar linhas e leases para auditoria/recuperação;
5. usar migration separada somente se houver autorização para remover funções
   ou colunas — nenhum `DROP` ou `TRUNCATE` faz parte do rollback imediato.

## Verificação

```text
npm run test:email-persistence-draft
npm run test:email-dispatch-runtime
npm run test:welcome-outbox-consumer
npm run test:email-suppression-persistence-contract
npm run test:transversal-readiness
npm run typecheck
cd worker && npm run check
npm test
```
