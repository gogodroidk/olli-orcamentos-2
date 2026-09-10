# Auditoria de segurança — 2026-09-10

## Resultado da rodada

- OSV Scanner 2.4.0: **0 vulnerabilidades** nos locks do app (`package-lock.json`), Worker (`worker/package-lock.json`) e painel (`webapp/pnpm-lock.yaml`). Foram corrigidos `sharp` 0.35.2 → 0.35.4 e `js-yaml` 4.3.1 → 4.3.2.
- Gitleaks 8.30.1: 9 achados históricos, todos classificados como chave pública Supabase anon/JWT ou fixture pública. Não apareceu service-role key, Stripe secret, Resend key, Cloudflare token ou credencial privada no escopo atual. O histórico não foi reescrito automaticamente.
- Supabase staging: migration `20260910143000_fix_ia_quota_lint` corrigiu os casts das RPCs, a referência de conflito da cota diária e a variável morta; `db lint` agora retorna **No schema errors found**. Produção não foi tocada.
- Worker staging: smoke remoto passou health, CORS, method gates, shell administrativo e `sideEffects: none`.

## Controles confirmados no código

- IA operacional usa escopos/campos allowlisted, tenant resolvido no servidor, RBAC, diff, token de confirmação, auditoria e rollback.
- A biblioteca de documentos usa versões append-only, FK composta de tenant/pai, triggers de ownership/congelamento e não expõe DELETE direto para clientes autenticados.
- O bucket `olli-documentos` não aceita mais update/delete de usuários autenticados; o ciclo de artefato fica separado de logos/fotos.
- O sync de documentos usa guard de `atualizado_em` tanto no push em lote quanto na escrita unitária, evitando regressão por aparelho stale.
- Ações destrutivas em massa são recusadas pelo chat; upload e futura ingestão devem continuar isolados e limitados.
- Produção continua `acceptedReal=false`; não há promoção automática, secrets de produção nem cobrança real nesta rodada.

## Ações futuras obrigatórias

1. Revisar a origem histórica das chaves anon/JWT e remover `.env` antigo do histórico somente com decisão explícita e plano de rotação.
2. Reexecutar Gitleaks/OSV no gate de release e anexar os relatórios ao artefato da versão.
3. Antes de produção, repetir RLS/tenant, IA, upload, rate/cost limit, backup/rollback e smoke pós-deploy.
