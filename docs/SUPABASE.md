# Supabase

Projeto conectado: `OLLI ORCAMENTOS` (`yiaeplqinnnnniyvwtls`).

> **Atualizado 2026-07-12.** Este arquivo descrevia um app single-tenant de 10 tabelas
> (backup/restore de snapshot) que não existe mais. A fonte de verdade das policies é
> `docs/RLS_MATRIX.md` + `docs/multi-tenant.md`; a do schema são as migrations em
> `supabase/migrations/` (17 arquivos). Leia-as antes de afirmar qualquer coisa aqui —
> a regra do projeto é **copy derivada da fonte, nunca de memória**.

## Variáveis do app

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Use `.env.local` para desenvolvimento (ignorado pelo Git). Versione somente `.env.example`.
A `SUPABASE_SERVICE_ROLE_KEY` vive **só no worker Cloudflare** (secret), nunca no app.

## Arquitetura real (2026-07)

O app é **offline-first**: SQLite local é a fonte primária; o Supabase é o espelho na nuvem,
sincronizado por `src/services/cloudSync.ts` (LWW por `atualizado_em`, soft-delete via tombstones,
push com guard de timestamp). O app NÃO chama `.eq('user_id')` no pull — confia 100% na RLS para
escopar as linhas (por isso a RLS é o piso de segurança, não a UI).

### Multi-tenant (Modo Empresa) — a organização é uma CAMADA, não dona dos dados
Os dados do negócio continuam com `user_id` do **owner**; membros de uma org enxergam/escrevem via
`donos_visiveis()` na RLS. Tabelas: `organizacoes` (`owner_user_id` UNIQUE), `organizacao_membros`
(papéis owner/admin/gestor/tecnico), `convites` (token+expiração), `localizacoes_equipe`, `acessos_equipe`.
Detalhe completo em `docs/multi-tenant.md`. Migrations: `20260707_multitenant.sql` +
`20260708_multitenant_fixes.sql` + `20260718_rls_owner_backdoor.sql` (fecha o backdoor de owner — P0-2)
+ `20260719_clientes_insert_equipe.sql` (abre INSERT de `clientes` a membro ativo — P1-3). **Aplicadas.**

### Dados do negócio (legado, org-scoped por RLS)
`clientes`, `orcamentos`, `servicos`, `produtos`, `recibos`, `empresa`, `agendamentos`, `modelos`,
`depoimentos`, `contadores`, `backups`. SELECT ampliado para `donos_visiveis()`; escrita conservadora
(só do dono) exceto `orcamentos`/`agendamentos`/`clientes-INSERT` (equipe escreve carimbando `criado_por`).
⚠️ **Sem baseline versionado dessas 13 tabelas** — o schema delas só existe no banco de produção
(achado aberto da re-auditoria: gerar `pg_dump --schema-only` como migration `0000_baseline`).

### Portal do cliente + versões de orçamento
`eventos_orcamento_publico` (trilha append-only visualizado/aprovado/recusado, `ip_hash` salgado — LGPD),
`orcamento_versoes` (congelamento da proposta enviada). Migrations `20260708_portal_trilha.sql`,
`20260708_versoes.sql`, `20260716_publicos_revogacao.sql`.

### Ordens de Serviço (app do técnico)
`ordens_servico` no padrão multi-tenant (reusa `donos_visiveis()` + `criado_por` + `user_id` imutável +
check de 6 estados). Migration `20260710_ordens_servico.sql` (RLS 6/6 testada).

### PMOC (vertical HVAC — receita recorrente)
`assets` (equipamentos, com `fotos` jsonb via `20260711_assets_fotos.sql`), `asset_qr_tokens` (QR opaco
revogável), `qr_scan_events`, `service_contracts`, `pmoc_plans` + versões congeladas; Fase 2 somou
`pmoc_planos`, `pmoc_plano_versoes`, `pmoc_ordens_geradas` (idempotência por índice UNIQUE no banco).
Migrations `20260709_pmoc_fundacao.sql`, `20260715_pmoc_fase2.sql`. Porta pública `/q/<token>` no worker.

### Assinaturas (Stripe) e feedback
O plano é derivado do **webhook Stripe** (fonte da verdade — D-03), refletido em `assinaturas`.
`feedback` (`20260717_feedback_inbox.sql`): RLS insert-only-own, **sem policy de SELECT** → só o `/admin`
lê via service_role. Captura global de erro JS grava aqui também (`errorReport.ts`).

### Lixeira (soft-delete)
`excluido_em` em ~10 entidades (`20260713_lixeira.sql` + `20260714_atualizado_em.sql`): excluir = mandar
pra lixeira (retenção 30 dias, restaurar item a item, expurgo no boot). Tombstones no sync.

## Hardening aplicado

- `20260615160744_harden_rls_and_function_permissions.sql`: revoga `rls_auto_enable()` de anon/authenticated/public,
  policies `to authenticated`, `(select auth.uid())` (InitPlan) para evitar reavaliação por linha.
- `20260624000000_optimize_rls_initplan.sql`: mesmo padrão InitPlan nas demais.
- `revoke_anon_membros_perfil_20260711` (2026-07-11): a view `organizacao_membros_perfil` dava SELECT ao papel
  `anon` expondo `auth.users.email` → `anon` revogado (sobra a exposição `authenticated` intencional: equipe vê
  o e-mail uma da outra). Ver memória `olli-conta-demo-grtech`.

## Avisos / checklist antes de produção

- **Leaked Password Protection**: ativar no Supabase Auth (advisor).
- **MFA/aal2 no super-admin**: hoje o `/admin` (acesso a TODOS os tenants) tem 1 fator só — achado ABERTO
  (cadastrar TOTP + checar `aal2` em `requireAdmin`). Ver `KNOWN_BLOCKERS.md` B12.
- **Sign in with Apple**: provider habilitado (`external_apple_client_id = online.olliorcamentos.app`).
- Rodar `get_advisors` (security + performance) após qualquer DDL. Índices `*_user_id_idx` unused são
  esperados (banco novo) — não remover.
