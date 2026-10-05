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
| `app-gate` | `npm ci` na raiz + `npm run preflight` (typecheck, suíte inteira, lint, contraste, Doctor, config de release) |
| `painel` | `npm ci` na raiz e em `web/`, `pnpm i --frozen-lockfile` em `webapp/`, `pnpm run build`, `pnpm run test:importacao`, `pnpm run test:bundle` |
| `landing` | `npm ci` na raiz e em `web/`, `npx astro check`, `npm run build` |
| `worker` | `npm ci` em `worker/`, `npm run types`, `npm run types:check`, `npm test`, `npm run check` (bundle sem publicar) |
| `lint` | `npm ci` na raiz + `npm run lint` (Biome com catraca) |

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
