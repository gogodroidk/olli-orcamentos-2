# CI local (`scripts/ci-local.sh`)

## Quando usar

O repositório é privado e o GitHub Actions depende de cota/faturamento da conta.
Quando a cota acaba (ou a conta está sem faturamento), os checks do PR simplesmente
não rodam. O dono **não paga** o Actions, então nesse cenário o gate de merge passa a
ser o **CI local**:

```bash
bash scripts/ci-local.sh            # todos os jobs
bash scripts/ci-local.sh worker     # só um job (útil para iterar num erro)
```

Ele reproduz `.github/workflows/ci.yml` job por job, com os mesmos comandos:

| Job | O que roda (igual ao `ci.yml`) |
|---|---|
| `segredos` | `gitleaks git .` no **histórico inteiro**, com `--redact`; falsos-positivos triados em `.gitleaksignore` (impressão digital). Achado real = **rotacionar** o segredo (apagar do git não basta). Sem o binário o job falha. |
| `dependencias` | `trivy fs .` nos lockfiles: CRÍTICA sempre reprova; ALTA reprova se não estiver no `.trivyignore`, e cada linha lá **vence** (`exp:`). Gera o SBOM CycloneDX em `.ci-local/sbom.cdx.json`. Binário via `trivy` no PATH ou `TRIVY_BIN`; cache em `TRIVY_CACHE_DIR` (~1 GB). |
| `app-gate` | `npm ci` na raiz + `npm run preflight` (typecheck, suíte inteira, lint, contraste, Doctor, config de release) |
| `painel` | `npm ci` na raiz e em `web/`, `pnpm i --frozen-lockfile` em `webapp/`, `pnpm run build`, `pnpm run test:importacao`, `pnpm run test:bundle` |
| `landing` | `npm ci` na raiz e em `web/`, `npx astro check`, `npm run build` |
| `worker` | `npm ci` em `worker/`, `npm run types`, `npm run types:check`, `npm test`, `npm run check` (bundle sem publicar) |
| `lint` | `npm ci` na raiz + `bash scripts/gate-codigo-limpo.sh`. Biome com catraca (`npm run lint`), ruff 0.15.20, pyright 1.1.411, semgrep 1.168.0 (regras em `.semgrep.yml`) e `pre-commit validate-config`. Ferramenta que não roda reprova. |

O gate de código limpo (MF-07) mora no job `lint`. No commit, `.githooks/pre-commit` roda o mesmo script em `--staged` (só o que está no índice). Markdown sozinho não chama ruff/pyright/semgrep/biome. Ferramenta ausente reprova; não vale como verde.

A saída mostra cada job com cabeçalho próprio, grava um log por job em `.ci-local/<job>.log`
(ignorado pelo git) e termina com um **resumo** (VERDE/VERMELHO por job). O exit code é
diferente de 0 se qualquer job falhar.

## Regra de merge sem Actions

1. Commite tudo. O script avisa se a árvore tiver mudança não commitada: o verde só vale
   para o hash testado.
2. Rode `bash scripts/ci-local.sh` inteiro (não só um job).
3. Só mescle com **todos os jobs VERDES**.
4. Registre no corpo do PR a linha: `ci-local.sh verde no commit <hash>`, com o hash que o
   próprio script imprime no resumo, e a versão do Node usada.
5. Se o PR receber commit novo depois disso, rode de novo e atualize o hash.

## Diferenças conscientes em relação ao Actions

- **Sem checkout limpo**: roda na árvore atual. Daí a exigência de árvore limpa e hash no PR.
- **`npm ci` da raiz uma vez só** por execução (no Actions cada job repete por isolamento; o
  resultado é o mesmo).
- **pnpm via `corepack pnpm`** (versão cravada em `webapp/package.json`), sem `corepack enable`,
  que no Windows pede admin.
- **Node**: o Actions usa Node 22. Com outro Node o script avisa; o resultado vale como gate,
  mas registre a versão no PR.
- **Disco cheio**: se `node_modules` de um diretório for junction/symlink, o script **não**
  roda `npm ci` nele (apagaria o destino da junction) e usa o que já está lá. Para um gate
  fiel, prefira instalação real.
- `CI_LOCAL_SEM_INSTALAR=1` pula todas as instalações (só para iterar; não use no gate final).

## Minutos do Actions

O `ci.yml` roda em `pull_request` e em `push` **só na `main`**, para não executar duas vezes
por PR (push da branch + pull_request). O `promotion.yml` já limitava o `push` a
`staging`/`main` e mantém o `workflow_dispatch` manual de promoção.

## Estado do Actions (verificado em 05/10/2026)

**Travado por faturamento, não por código.** Todo run de `CI` e `OLLI Promotion Pipeline`
(push e pull_request) termina `failure` sem executar um passo sequer (`steps: 0`). A anotação
do check, lida pela API (`gh api repos/<repo>/actions/runs/<id>/jobs` → `check_run_url` →
`/annotations`), diz:

> The job was not started because recent account payments have failed or your spending limit
> needs to be increased. Please check the 'Billing & plans' section in your settings

Consequências:

- O ✗ vermelho em PR/commit **não significa que o código quebrou**. Significa que o job nem
  começou. Não investigue o código por causa dele.
- `staging-promotion` e `production-promotion` ficam `skipped`: **a promoção do
  `promotion.yml` não roda** enquanto o Actions estiver travado.
- O gate de merge é este script (seção "Regra de merge sem Actions"). Decisão do dono:
  **não pagar o Actions** (ver memória do projeto).
- Para religar um dia: regularizar *Billing & plans* da conta GitHub (ou subir o spending
  limit). Nada no repositório precisa mudar; o `ci.yml` já cobre os mesmos jobs.
- Aviso do próprio GitHub: o label `ubuntu-latest` migra para Ubuntu 26 em 19/10/2026.
  Quando o Actions voltar, reconferir `ci.yml` nesse runner.

### Armadilhas do gate local (aprendidas em 05/10/2026)

1. **Rode o job `painel` quando mexer em `src/` compartilhado com o `webapp/`.** O `app-gate`
   não pega erro do `tsc` do painel (`noUnusedLocals`): o #160 passou no `app-gate` e quebrou
   o build do painel com `TS6196` (corrigido no #161). Na dúvida, `bash scripts/ci-local.sh`
   inteiro, como a regra de merge manda.
2. **Checkout Windows com `autocrlf` (CRLF):** teste que lê arquivo-fonte com regex em `\n`
   falha só no Windows. Normalize ao ler: `.replace(/\r\n/g, '\n')`.
3. **Worktree nova ou `node_modules` pela metade:** `npm ci` falha com `ENOTEMPTY` se uma
   execução anterior foi interrompida. Apague `node_modules` e rode de novo. Não use
   `CI_LOCAL_SEM_INSTALAR=1` em worktree sem `node_modules` (dá VERMELHO em 1 s).
4. **Job `dependencias`:** exige o `trivy` no PATH ou em `TRIVY_BIN`. Os `.trivyignore` vencem
   em **31/10/2026**: antes disso, atualizar axios, undici, devalue e brace-expansion.
