# Persistência de notificações — draft local

Este pacote materializa a próxima decisão de schema sem aplicar migration. Ele
compõe os contratos já verdes de inbox, journal de inbox, registry de aparelhos
e journal de entrega em sete tabelas fail-closed.

## O que o draft define

- escopos revisionados para inbox e entrega;
- itens in-app deduplicados por evento e retidos por no máximo 90 dias;
- operações com `operation_id`, hash e revisão únicos para futuro CAS/replay;
- aparelhos por tenant/usuário/device, somente com fingerprint HMAC do token;
- decisões/resultados por canal sem provider, destinatário ou conteúdo externo;
- RLS habilitada e forçada em todas as tabelas;
- grants de tabela, sequência e purge somente para `service_role`;
- purge paginado com `FOR UPDATE SKIP LOCKED` e limite máximo de mil linhas.

## Boundary de evidência

`20260904_notification_persistence.sql` está fora de `supabase/migrations` e
foi apenas parseado/inspecionado localmente. Não existem adapter, RPCs de
mutação, token bruto, VAPID, service worker, permissão de aparelho, envio ou
prova em produção. A migration real precisa manter CAS, append da operação e
mutação de item na mesma transação; gravar as tabelas em chamadas separadas
abriria replay parcial.

O conteúdo textual do inbox pode conter dado pessoal conforme o caso. Por isso,
o draft exige expiração em até 90 dias e a promoção depende de finalidade, base
legal, política de campos e aceite de retenção. O token necessário ao envio não
pertence a este schema; sua custódia cifrada é um boundary futuro separado.

## Verificação local

```text
npm run test:notification-persistence-draft
npm run test:notification-inbox-journal
npm run test:push-device-registry
npm run test:notification-delivery-journal
npm run test:transversal-readiness
```
