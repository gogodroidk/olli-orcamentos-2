# OLLI staging migration checkpoint — 2026-09-06 (reconectado)

## Checkpoint

- Project: `OLLI-STAGING`
- Ref: `sbpkutknpywezeagioon`
- Region: `sa-east-1`
- Production project untouched: `yiaeplqinnnnniyvwtls`
- Schema-only baseline: applied successfully (`staging_schema_baseline_20260906`)
- Baseline contents: metadata-derived 47 public tables, RLS enabled, 22 unique
  support indexes and 52 non-self foreign keys; no rows, secrets or provider
  payloads.
- Ordered repository migrations applied successfully: **41/41**.
- The first blocked migration (`20260904205858_email_welcome_outbox.sql`) was
  recovered in the authenticated Supabase SQL Editor. The original script had
  already created the two tables before the connector scope error; a retry with
  idempotent trigger drops/recreates completed with `Success. No rows returned`.
- The seven migrations after it were then executed one by one in the same
  staging-only SQL Editor session. The final metadata query proved all expected
  tables, functions, private RLS helpers, buckets, policies, RLS flags, indexes
  and welcome triggers; counts were zero for the two welcome tables.
- These executions were manual SQL Editor statements. A read-only Supabase CLI
  check on 2026-09-08 found **41 local migration files** but **34 remote history
  entries**, whose latest versions are generated timestamps from
  `20260906192145` through `20260906192430`. The names do not map one-to-one to
  the local files, so no `migration repair` was run blindly. This remains a
  reconciliation gate for a future versioned CLI/CI promotion; it is not hidden
  as if the history were complete.
- The staging Worker `olli-diagnostico-staging` was deployed without production
  routes. Because the staging-only Supabase service-role and Resend test
  secrets are not provisioned, `WELCOME_DISPATCH_MODE=off` is now explicit
  (fail-closed); its public health endpoint returned HTTP 200. No secret was
  entered and no real e-mail, payment or customer data was used.
- Public smoke proof: `npm run staging:smoke` passed health `200`, CORS
  preflight `204`, method gates for Resend and IA actions (`405`) and the
  noindex admin shell (`200`). The smoke only uses the `workers.dev` URL and
  has no side effects.
- GitHub promotion proof: draft PR **#42** is open from `codex/piloto-p0` to
  `main`; workflow run `34075474398` completed with `quality-and-builds` and
  `staging-promotion` successful, while `production-promotion` was skipped.
- Revalidation after the security/dependency fixes: CI `34091959004` and
  promotion quality run `34091958991` both completed successfully; no
  production job was executed.
- The previous simulator setting produced scheduled configuration errors while
  secrets were absent; the off-mode redeploy removes that false-green state.
  Enabling the simulator remains a staging secret gate, not a production gate.
- Current staging Worker version label: `85ddf947`, deployed by the first
  Cloudflare Git Build (`81e53bff-2918-4581-a274-905dc91ee866`) from commit
  `9af14eddcac825e05b169941bcbbc289d8c6c8fe`. It remains staging-only,
  `WELCOME_DISPATCH_MODE=off`, and passed the same public smoke contract.
- O procedimento reproduzível para secrets de teste e canário está em
  `ops/staging/SECRETS_AND_CANARY_RUNBOOK.md`; nenhum valor é armazenado nele.
- Cloudflare Git Build está conectado ao repositório
  `gogodroidk/olli-orcamentos-2`, branch `codex/piloto-p0`, com previews
  desligados e deploy restrito ao `--env staging`. O primeiro build automático
  foi concluído com sucesso; não há promoção para produção.

## Safety decision

The connector was reconnected through the already-authenticated OLLI dashboard
session. Staging runtime is now provisioned, but this checkpoint is still not a
production acceptance: migration-history reconciliation, staging secrets,
Resend/Stripe/WhatsApp/fiscal OAuth gates, independent security review and
human approval remain required before any promotion.

This is a staging-only checkpoint. It is not production acceptance and does not
authorize promotion or real recipients.
