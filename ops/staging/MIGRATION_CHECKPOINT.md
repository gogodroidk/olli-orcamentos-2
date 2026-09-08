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
- These executions were manual SQL Editor statements. The authenticated Supabase
  CLI fetched the remote history into a temporary directory, proved that the
  34 generated remote entries correspond to the baseline plus the first 33 local
  migrations, and then repaired exactly the eight later manually-applied versions
  as `applied` in **staging only**. A second `migration list` now reports 42 remote
  entries (baseline + 41 local files); no SQL was re-executed and production was
  untouched.
- The staging Worker `olli-diagnostico-staging` was deployed without production
  routes. Because the staging-only Supabase service-role and Resend test
  secrets are not provisioned, `WELCOME_DISPATCH_MODE=off` is now explicit
  (fail-closed); its public health endpoint returned HTTP 200. No secret was
  entered and no real e-mail, payment or customer data was used.
- Public smoke proof: `npm run staging:smoke` passed health `200`, CORS
  preflight `204`, method gates for Resend and IA actions (`405`) and the
  noindex admin shell (`200`). The smoke only uses the `workers.dev` URL and
  has no side effects.
- Supabase CLI advisors were rerun read-only on `2026-09-08T06:47:02-03:00`.
  The security warnings are the seven intentional public business RPCs that
  still need `SECURITY DEFINER` to perform invite/organization/trial/quota
  transitions; the live definitions all use `search_path=''`, check `auth.uid()`
  and grant execution to `authenticated` (never `anon`/`public`). The private RLS
  helper migration is separate and keeps its public wrappers invoker-only. The
  remaining advisor warnings about permissive policies/duplicate indexes stay
  as review items; no blind DROP or policy rewrite was executed.
- GitHub promotion proof: draft PR **#42** is open from `codex/piloto-p0` to
  `main`; workflow run `34075474398` completed with `quality-and-builds` and
  `staging-promotion` successful, while `production-promotion` was skipped.
- Revalidation after the security/dependency fixes: CI `34091959004` and
  promotion quality run `34091958991` both completed successfully; no
  production job was executed.
- The previous simulator setting produced scheduled configuration errors while
  secrets were absent; the off-mode redeploy removes that false-green state.
  Enabling the simulator remains a staging secret gate, not a production gate.
- Current staging Worker version label: `8b90528d`, deployed by the Cloudflare Git
  Build from commit `c91e3446bf5dc4e5c66077d1fdfbdc451ddf74f17`. It remains staging-only,
  `WELCOME_DISPATCH_MODE=off`, and passed the same public smoke contract.
- O procedimento reproduzível para secrets de teste e canário está em
  `ops/staging/SECRETS_AND_CANARY_RUNBOOK.md`; nenhum valor é armazenado nele.
- Cloudflare Git Build está conectado ao repositório
  `gogodroidk/olli-orcamentos-2`, branch `codex/piloto-p0`, com previews
  desligados e deploy restrito ao `--env staging`. O primeiro build automático
  foi concluído com sucesso; não há promoção para produção.

## Safety decision

The connector was reconnected through the already-authenticated OLLI dashboard
session. Staging runtime and migration history are now reconciled, but this
checkpoint is still not a production acceptance: staging secrets,
Resend/Stripe/WhatsApp/fiscal OAuth gates, independent security review and
human approval remain required before any promotion.

This is a staging-only checkpoint. It is not production acceptance and does not
authorize promotion or real recipients.
