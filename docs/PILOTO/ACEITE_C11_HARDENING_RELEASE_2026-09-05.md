# Aceite local C11 — hardening e release

Data: **2026-09-06**  
Repositório: `C:\OLLI_REL`  
Branch: `Codex/piloto-p0`

Revalidação: **2026-09-06** — os comandos abaixo foram executados novamente após
a entrada das ações IA seguras e do webhook Resend.

## Addendum de revalidação — 2026-09-07

- Branch `codex/piloto-p0` publicada no GitHub; PR draft #42 aberto.
- CI e workflow manual de staging passaram; produção ficou `skipped`.
- Staging Supabase isolado recebeu baseline + 41 migrations manualmente; Worker
  staging está em `workers.dev`, sem rotas de produção, com dispatch `off`
  enquanto secrets de teste não existirem.
- Smoke público staging passou health 200, CORS 204, gates de método 405 e
  admin noindex 200. Isso não substitui smoke autenticado/RLS/Storage.
- Gitleaks no diretório atual não encontrou leaks; o histórico possui achados
  antigos documentados. A instalação global do Semgrep apresentou conflito de
  OpenTelemetry, então não é usada como prova independente nesta revalidação.

As afirmações anteriores de ausência de staging/push e de “migration somente
artefato” são históricas do aceite original; o checkpoint atual é
`ops/staging/MIGRATION_CHECKPOINT.md`.

## Resultado

`BLOCKED_EXTERNAL` — a base local está validada, mas release pública não é
declarada pronta enquanto faltarem revisão independente, dispositivos/coorte,
observabilidade/restore e autorização de publicação.

## Evidências executadas

- `npm run preflight` — passou (inclui `typecheck`, `npm test`, contraste,
  `expo-doctor@1.19.10` 20/20 e configuração de release); todos os testes do encadeamento raiz, inclusive os novos
  C3–C10, rodaram sem falhas.
- `npm run typecheck` — passou.
- `npm run build` em `webapp` — passou.
- `npm run build` em `web` — passou; 25 páginas estáticas geradas, incluindo a
  rota genérica de prestador de serviço.
- `npm run test:suite-completa` — passou.
- `npm run test:assets-app`, `test:pwa`, `test:religar-sync`,
  `test:tenant-escrita` e `test:isolamento-tenant` — passaram.
- Semgrep nos arquivos alterados — zero achados.
- Gitleaks no diff desta rodada — nenhum segredo novo. A varredura histórica
  ainda acusa 8 JWTs legados em commits anteriores; isso exige rotação/revogação
  externa e não foi mascarado nem resolvido reescrevendo o histórico.
- `git diff --check` — sem erro de whitespace; apenas avisos de normalização
  LF/CRLF do checkout Windows.
- `wrangler types --check`, `wrangler deploy --dry-run` e `test:resend-webhook` — passaram; a CI ganhou
  um job próprio do Worker sem publicação.
- `npm run test:ia-actions`, `npm run build` em `webapp` e `web`, `npm run check:ai-models`,
  `npm run check:contraste`, `npm run doctor`, `gitleaks` nos diretórios alterados e canary HTTP
  local (`200` health, `401` sem JWT, `405` método incorreto) — passaram em 2026-09-06.
- `npm run qa:web` passou em desktop e mobile após regenerar `webapp/public/mockServiceWorker.js`
  com a mesma versão do MSW instalada (`2.7.5`); nenhum `pageerror` ou warning ficou no navegador.
- `npm run qa:pwa` e `npm run test:pwa` passaram novamente após a correção do artefato MSW.
- Auditoria renderizada da landing em `/`, `/planos/`, `/para/eletricista/` e `/ajuda/`,
  em 390 px e 1280 px: `lang`, title, description, OG, H1 único, alt/dimensões das imagens,
  ausência de overflow e console limpo; todos os alvos interativos reais ficaram com área mínima
  de 44 px após o ajuste de navegação/rodapé. Os únicos elementos menores são `sr-only` intencionais.
- O seletor de orçamentos da emissão de recibos foi alinhado ao hook paginado
  compartilhado; `test:c5-orcamentos-financeiro` e o typecheck passaram após a
  alteração.
- O contrato local dos helpers de RLS (`test:rls-helpers-privados`) passou com
  47 verificações: implementações `SECURITY DEFINER` ficam em schema privado não
  exposto, wrappers públicos são `SECURITY INVOKER` e `anon/public` não recebem
  `EXECUTE`. O parser PostgreSQL `pglast` também reconheceu as 35 instruções da
  migration sem erro. A migration é somente um artefato versionado até existir
  staging.
- O Advisor de performance live foi consultado somente em leitura. A FK de cota
  por usuário ganhou índice reverso no SQL versionado local (`test:ia-quota`, 48
  verificações, agora 49 com a migration aditiva separada); índices “não usados”
  e policies permissivas múltiplas ficaram sem poda, pois o workload de produção
  ainda não foi validado.
- A política mínima de senha foi centralizada em `src/services/authPolicy.ts`:
  cadastro nativo, cadastro web, redefinição web e mensagens de erro agora usam
  8 caracteres, alinhados ao `supabase/config.toml`; `test:auth-policy` passou
  com 7 verificações.
- Inventário externo registrado em `INVENTARIO_EXTERNOS_2026-09-05.md`: conector
  Supabase agora revalidado no projeto correto, ausência de staging, Resend em
  simulador, migrations novas ainda não promovidas e Stripe sem reconciliação live
  completa permanecem gates explícitos. A tentativa de branch de staging foi
  bloqueada pelo plano do Supabase (Pro obrigatório); nenhum efeito remoto ficou
  pendente.
- O GitHub está autenticado, mas `main` remoto (21/08) não contém o checkout
  `Codex/piloto-p0` atual; por isso não houve push/commit nem conexão automática
  do Cloudflare ao Git, evitando deploy de código defasado.

## Revalidação externa — 2026-09-07

- Branch `codex/piloto-p0` publicada no GitHub e PR draft #42 aberto.
- CI e workflow manual de staging passaram; produção permaneceu `skipped`.
- Staging Supabase isolado recebeu baseline + 41 migrations manualmente; Worker
  staging está em `workers.dev`, sem rotas de produção, com dispatch `off` até
  secrets de teste existirem.
- Smoke público staging passou health 200, CORS 204, gates de método 405 e
  admin noindex 200. Isso não substitui smoke autenticado/RLS/Storage.
- Gitleaks no diretório atual e Semgrep isolado via `uvx` retornaram zero
  achados; o launcher global do Semgrep tem conflito de OpenTelemetry.

As afirmações anteriores de ausência de staging/push e de migration somente
local são históricas do aceite original; o checkpoint atual é
`ops/staging/MIGRATION_CHECKPOINT.md`.

## Limites que não foram simulados

- Nenhuma migration foi aplicada em produção e nenhum dado real foi escrito.
- Nenhum checkout/cobrança, envio de mensagem, OAuth, DNS ou publicação foi
  executado.
- Não há afirmação de revisão independente, restore real, canário ou aceite em
  aparelho físico; esses gates continuam na fila para execução autorizada.
- A revisão independente por agente não foi obtida nesta janela por limite de uso; a substituição local
  desta rodada é Semgrep, Gitleaks, suíte determinística, dry-run e revisão manual, sem promovê-la a aceite
  independente.
