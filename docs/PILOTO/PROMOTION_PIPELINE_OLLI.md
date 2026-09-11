# Pipeline permanente de promoção OLLI

## Objetivo

Toda mudança do OLLI deve atravessar a mesma sequência versionada:

```text
local → CI/qualidade → Supabase staging → Worker staging → smoke staging
      → segurança/revisão → aprovação humana → Worker/web produção → saúde/rollback
```

O contrato machine-readable está em [`ops/olli-environments.json`](../../ops/olli-environments.json).
O workflow versionado está em [`.github/workflows/promotion.yml`](../../.github/workflows/promotion.yml).

## Ambientes permanentes

| Ambiente | Supabase | Cloudflare | E-mail | Billing | Aceite |
|---|---|---|---|---|---|
| local | fixtures/contratos | dry-run/local | simulator | fixture | `false` |
| staging | `sbpkutknpywezeagioon` | `olli-diagnostico-staging` | off até secrets de teste; depois simulator, destinatário real proibido | test | `false` |
| produção | `yiaeplqinnnnniyvwtls` | `olli-diagnostico` | hold/simulator até aprovação | live | `false` |

O staging foi criado em **6 de setembro de 2026** na região `sa-east-1`. O
baseline schema-only e as **41 migrations do repositório** foram aplicados no
runtime isolado. A migration de welcome precisou de um retry idempotente no SQL
Editor depois de uma perda de escopo do conector; a prova consolidada está em
`ops/staging/MIGRATION_CHECKPOINT.md`. O Worker `olli-diagnostico-staging` também
está publicado em `workers.dev`, sem rotas de produção e com dispatch de e-mail
em modo fail-closed (`off`) enquanto os secrets de teste não existirem. O smoke público (`npm run staging:smoke`) comprova health,
CORS, gates de método e o shell noindex do admin sem tocar em dados.

## Regras de promoção

1. Pull request e branch local executam qualidade, typecheck, testes, contraste,
   Doctor, builds e dry-run do Worker.
2. O alvo `staging` só pode ser disparado manualmente quando o baseline do
   Supabase está reconciliado e os secrets de staging existem.
3. O smoke público é um gate inicial; o smoke autenticado/RLS/Storage, landing
   e painel ainda exigem credenciais de teste e não são mascarados pelo job.
4. O environment `production` exige aprovação humana do GitHub antes do job de
   deploy.
5. A promoção carrega commit/artifact imutável, nunca “o estado atual” solto.
6. Falha de saúde interrompe a cadeia e aponta para o deployment anterior.
7. O workflow nunca transforma simulador em aceite real automaticamente.

A primeira execução manual do alvo `staging` foi comprovada no workflow
`34075474398`: qualidade e smoke passaram; o job de produção permaneceu `skipped`.

## Agentes especialistas

Os agentes permanentes ficam em `.claude/agents/`:

- `olli-orchestrator`: coordenação e ordem dos gates;
- `olli-supabase`: schema, Auth, RLS, Storage e migrations;
- `olli-cloudflare`: Workers, Wrangler, bindings, cron e rollback;
- `olli-resend`: templates, outbox, webhook, supressão e canário;
- `olli-billing`: Stripe/MP/Apple, entitlement e sandbox;
- `olli-security`: auth, tenant, secrets, Semgrep e Gitleaks;
- `olli-qa`: testes, browser, PWA, acessibilidade e smoke;
- `olli-release`: artifact, aprovação, promoção e rollback.

Todos os agentes têm escopo mínimo e não podem declarar produção pronta a partir
de prova local. Produção exige o environment approval do workflow.

## Estado atual e primeiro desbloqueio

O runtime do staging está comprovadamente provisionado, mas o gate de promoção
continua `not_ready` por dois motivos explícitos: as 41 statements foram
executadas manualmente e ainda precisam ser reconciliadas com o histórico
versionado da ferramenta; e os secrets externos de staging (OpenRouter,
Resend, Stripe e assinaturas de webhook) ainda não foram provisionados. O
próximo passo seguro é registrar a reconciliação em CI, preencher secrets de
teste por fluxo oficial e executar o smoke autenticado/RLS/Storage sem PII.
Nenhum `SELECT` de dados de clientes deve fazer parte desse processo.
