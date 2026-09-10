# Auditoria de segurança — 2026-09-10

## Resultado da rodada

- OSV Scanner 2.4.0: **0 vulnerabilidades** nos locks do app (`package-lock.json`), Worker (`worker/package-lock.json`) e painel (`webapp/pnpm-lock.yaml`). Foram corrigidos `sharp` 0.35.2 → 0.35.4 e `js-yaml` 4.3.1 → 4.3.2.
- Gitleaks 8.30.1: 9 achados históricos, todos classificados como chave pública Supabase anon/JWT ou fixture pública. Não apareceu service-role key, Stripe secret, Resend key, Cloudflare token ou credencial privada no escopo atual. O histórico não foi reescrito automaticamente.
- Supabase staging: `db lint` ainda aponta quatro problemas preexistentes nas RPCs de cota/IA (`nullif(text, unknown)`, constraint `ia_cota_global_diaria_pk` ausente e variável não lida). Eles permanecem pendentes para uma migration própria; esta rodada não mascarou nem alterou produção.
- Worker staging: smoke remoto passou health, CORS, method gates, shell administrativo e `sideEffects: none`.

## Controles confirmados no código

- IA operacional usa escopos/campos allowlisted, tenant resolvido no servidor, RBAC, diff, token de confirmação, auditoria e rollback.
- Ações destrutivas em massa são recusadas pelo chat; upload e futura ingestão devem continuar isolados e limitados.
- Produção continua `acceptedReal=false`; não há promoção automática, secrets de produção nem cobrança real nesta rodada.

## Ações futuras obrigatórias

1. Abrir migration/issue para corrigir as quatro RPCs de cota/IA no staging e repetir advisors.
2. Revisar a origem histórica das chaves anon/JWT e remover `.env` antigo do histórico somente com decisão explícita e plano de rotação.
3. Reexecutar Gitleaks/OSV no gate de release e anexar os relatórios ao artefato da versão.
4. Antes de produção, repetir RLS/tenant, IA, upload, rate/cost limit, backup/rollback e smoke pós-deploy.
