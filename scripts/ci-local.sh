#!/usr/bin/env bash
# CI LOCAL — reproduz .github/workflows/ci.yml na máquina, job por job.
#
# Para que serve: quando o GitHub Actions está sem cota (repo privado, sem
# faturamento), este script é o gate de merge. Mesmos jobs, mesmos comandos,
# mesma ordem de passos que o ci.yml. Ver docs/CI_LOCAL.md.
#
# Uso:
#   bash scripts/ci-local.sh                 # todos os jobs
#   bash scripts/ci-local.sh worker lint     # só os jobs citados
#   CI_LOCAL_SEM_INSTALAR=1 bash scripts/ci-local.sh   # pula npm ci / pnpm i
#
# Jobs (nomes iguais aos do ci.yml): segredos, dependencias, app-gate, painel, landing, worker, lint.
# O job lint inclui o gate de código limpo (MF-07): ruff, biome, pyright, semgrep, pre-commit.
# Extra só local: sql-aviso (sqlfluff nas migrations alteradas; não reprova, mas só mostra VERDE se rodou e
# não achou nada: achados = AVISO, sqlfluff ausente = NÃO RODOU).
# Sai com código != 0 se QUALQUER job falhar. Um job que falha não impede os
# outros de rodar (igual ao Actions, onde os jobs são independentes).
#
# Diferenças conscientes em relação ao Actions (e por quê):
#   - Não há checkout limpo: roda na árvore atual. Por isso o script avisa se
#     houver mudança não commitada — o hash registrado no PR só vale com a
#     árvore limpa.
#   - Os jobs rodam em sequência na MESMA árvore, então o `npm ci` da raiz é
#     feito uma vez só (o resultado é idêntico; o Actions repete por isolamento).
#   - pnpm vem por `corepack pnpm` (a versão cravada em webapp/package.json,
#     "packageManager"), sem `corepack enable`, que no Windows pede admin.
#   - Se node_modules for junction/symlink (disco cheio), a instalação daquele
#     diretório é PULADA: `npm ci` apagaria a pasta de destino da junction.

set -u

# UMA execução por vez na máquina toda (19/11/2026: 5 ci-local + build Android esgotaram a memória e atrasaram o
# WhatsApp dos clientes). Quem chega espera a vez; nada é pulado. Escape consciente: OLLI_CI_SEM_TRAVA=1.
# Lock do kernel (flock -o): o script roda por baixo do flock e a trava fica só com o processo do flock, que termina
# junto com o script; npm/vite/expo NÃO herdam o fd, então um órfão não segura a fila (P2 do LIVRE no #423).
# Saída 75 = esperou 60 min e NÃO rodou (não é "CI vermelho": o CI nem começou).
TRAVA_CI="${OLLI_CI_TRAVA:-/tmp/olli-ci-local.lock}"
if [ -z "${OLLI_CI_SEM_TRAVA:-}" ] && [ -z "${OLLI_CI_NA_TRAVA:-}" ] && command -v flock >/dev/null 2>&1; then
  if ! flock -n -o "$TRAVA_CI" true; then
    echo ">>> ci-local: outro ci-local está rodando nesta máquina; esperando a vez (até 60 min; sem a vez, saio com 75 sem rodar)..."
  fi
  OLLI_CI_NA_TRAVA=1 exec flock -o -w 3600 -E 75 "$TRAVA_CI" bash "${BASH_SOURCE[0]}" "$@"
fi
# Prioridade baixa de CPU e disco (herdada por npm/vite/tsc/expo): o WhatsApp dos clientes (Chatwoot/Evolution)
# roda nesta mesma máquina e tem de vencer qualquer build. Disco: classe normal, nível mais baixo (-c 2 -n 7), para o
# CI não ficar parado indefinidamente atrás de outro processo de disco.
renice -n 15 -p $$ >/dev/null 2>&1 || true
ionice -c 2 -n 7 -p $$ >/dev/null 2>&1 || true

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 2

export CI=true
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# O Actions não tem .env; o worker e o build não podem depender de segredo local.
export FORCE_COLOR=0

TODOS_JOBS=(segredos dependencias app-gate painel landing worker lint sql-aviso)
if [ "$#" -gt 0 ]; then
  JOBS=("$@")
else
  JOBS=("${TODOS_JOBS[@]}")
fi

for j in "${JOBS[@]}"; do
  case " ${TODOS_JOBS[*]} " in
    *" $j "*) ;;
    *) echo "Job desconhecido: $j (válidos: ${TODOS_JOBS[*]})" >&2; exit 2 ;;
  esac
done

LOG_DIR="${CI_LOCAL_LOG_DIR:-$RAIZ/.ci-local}"
mkdir -p "$LOG_DIR"

HASH="$(git rev-parse HEAD 2>/dev/null || echo desconhecido)"
SUJO="$(git status --porcelain --untracked-files=no 2>/dev/null)"
ARVORE0="$(git rev-parse 'HEAD^{tree}' 2>/dev/null)"  # árvore TESTADA (carimbo só se for a mesma no fim; P2-1 do LIVRE #426)
NAO_RASTREADO="$(git status --porcelain 2>/dev/null | grep '^??' || true)"

linha() { printf '%s\n' "=================================================================="; }

linha
echo "CI LOCAL — OLLI"
echo "commit testado: $HASH"
echo "node: $(node -v)  npm: $(npm -v)"
case "$(node -v)" in
  v22.*) ;;
  *) echo "AVISO: o Actions usa Node 22; aqui é $(node -v). Resultado ainda vale como gate, mas registre a versão no PR." ;;
esac
if [ -n "$SUJO" ]; then
  echo "AVISO: há mudanças NÃO commitadas em arquivos rastreados. O verde só vale para '$HASH' com a árvore limpa:"
  echo "$SUJO" | sed 's/^/  /'
fi
echo "jobs: ${JOBS[*]}"
echo "logs: $LOG_DIR"
linha

eh_link() {
  # junction do Windows aparece como symlink no Git Bash; o fallback via
  # `cmd dir` pega a junction quando o -L não pega.
  local d="$1"
  [ -L "$d" ] && return 0
  if command -v cmd >/dev/null 2>&1 && [ -d "$d" ]; then
    local pai nome
    pai="$(cd "$(dirname "$d")" && pwd -W 2>/dev/null || dirname "$d")"
    nome="$(basename "$d")"
    cmd //c "dir /AL \"$pai\"" 2>/dev/null | grep -q "<JUNCTION>.*[[:space:]]$nome[[:space:]]*\[" && return 0
  fi
  return 1
}

instalar_npm() {
  # $1 = diretório (relativo à raiz)
  local dir="$1"
  if [ "${CI_LOCAL_SEM_INSTALAR:-0}" = "1" ]; then
    echo "[instalar] $dir: pulado (CI_LOCAL_SEM_INSTALAR=1)"
    return 0
  fi
  if eh_link "$RAIZ/$dir/node_modules"; then
    echo "[instalar] $dir: node_modules é junction/symlink — npm ci PULADO para não apagar o destino"
    return 0
  fi
  echo "[instalar] $dir: npm ci"
  (cd "$RAIZ/$dir" && npm ci --no-audit --no-fund)
}

instalar_pnpm_webapp() {
  if [ "${CI_LOCAL_SEM_INSTALAR:-0}" = "1" ]; then
    echo "[instalar] webapp: pulado (CI_LOCAL_SEM_INSTALAR=1)"
    return 0
  fi
  if eh_link "$RAIZ/webapp/node_modules"; then
    echo "[instalar] webapp: node_modules é junction/symlink — pnpm i PULADO"
    return 0
  fi
  echo "[instalar] webapp: corepack pnpm i --frozen-lockfile"
  (cd "$RAIZ/webapp" && corepack pnpm i --frozen-lockfile)
}

RAIZ_INSTALADA=0
instalar_raiz_uma_vez() {
  if [ "$RAIZ_INSTALADA" = "1" ]; then
    echo "[instalar] raiz: já instalada neste ci-local"
    return 0
  fi
  instalar_npm "." || return 1
  RAIZ_INSTALADA=1
}

passo() {
  # $1 = nome do passo, $2 = diretório, resto = comando
  local nome="$1" dir="$2"
  shift 2
  echo
  echo "--- [$nome] ($dir) \$ $*"
  (cd "$RAIZ/$dir" && "$@")
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "--- [$nome] FALHOU (exit $rc)"
  fi
  return "$rc"
}

# ---------------------------------------------------------------------------
# Jobs — espelho 1:1 de .github/workflows/ci.yml
# ---------------------------------------------------------------------------

job_segredos() {
  # gitleaks no HISTÓRICO INTEIRO (não só no diff): segredo esquecido num commit
  # antigo continua vazado. Falsos-positivos triados ficam em .gitleaksignore (por
  # impressão digital). Achado real = ROTACIONAR o segredo; apagar do git não basta.
  # --redact: o valor nunca aparece no log. Sem o binário o job FALHA (gate fechado).
  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "gitleaks não instalado — instale (MIT): https://github.com/gitleaks/gitleaks/releases"
    return 1
  fi
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
    echo "clone raso: o gitleaks precisa do histórico inteiro (git fetch --unshallow)"
    return 1
  fi
  passo "Segredos no histórico (gitleaks $(gitleaks version))" . gitleaks git . --redact --no-banner --log-level warn --gitleaks-ignore-path .gitleaksignore
}

job_dependencias() {
  # Trivy (Apache-2.0): CVE das dependências pelos lockfiles (raiz, worker, web,
  # webapp), sem varrer node_modules. CRÍTICA sempre reprova; ALTA reprova se não
  # estiver na linha de base do .trivyignore — e cada linha de lá VENCE (exp:), então
  # o que ficou para depois volta a reprovar sozinho. Também gera o SBOM (CycloneDX)
  # em $LOG_DIR/sbom.cdx.json. Binário: `trivy` no PATH ou TRIVY_BIN; cache em
  # TRIVY_CACHE_DIR (o banco tem ~1 GB descompactado: use um disco com folga).
  local bin="${TRIVY_BIN:-trivy}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "trivy não instalado — instale (Apache-2.0): https://github.com/aquasecurity/trivy/releases"
    return 1
  fi
  local comuns=(--scanners vuln --skip-dirs "**/node_modules" --skip-dirs android --skip-dirs _arquivo-antigo --quiet)
  [ -n "${TRIVY_CACHE_DIR:-}" ] && comuns+=(--cache-dir "$TRIVY_CACHE_DIR")
  passo "CVE ALTA/CRÍTICA nas dependências (trivy)" . "$bin" fs . "${comuns[@]}"     --severity HIGH,CRITICAL --ignorefile .trivyignore --exit-code 1 || return 1
  passo "SBOM CycloneDX" . "$bin" fs . "${comuns[@]}" --format cyclonedx --output "$LOG_DIR/sbom.cdx.json"
}

job_app_gate() {
  instalar_raiz_uma_vez || return 1
  # Espelha o passo do ci.yml. Sem --with-deps aqui: a máquina local já tem as libs do
  # sistema, e o --with-deps pediria sudo. Com o navegador já baixado, é instantâneo.
  passo "Chromium do Playwright (teste do ErrorBoundary)" . npx playwright install chromium || return 1
  passo "Preflight completo" . npm run preflight
}

job_painel() {
  instalar_raiz_uma_vez || return 1
  instalar_npm web || return 1
  instalar_pnpm_webapp || return 1
  passo "Build" webapp corepack pnpm run build || return 1
  passo "Testes do painel" webapp corepack pnpm run test:importacao || return 1
  passo "Orçamento de bundle do painel" webapp corepack pnpm run test:bundle
}

job_landing() {
  instalar_raiz_uma_vez || return 1
  instalar_npm web || return 1
  passo "Astro check" web npx astro check || return 1
  passo "Build" web npm run build
}

job_worker() {
  instalar_npm worker || return 1
  passo "Gerar tipos dos bindings" worker npm run types || return 1
  passo "Conferir tipos dos bindings" worker npm run types:check || return 1
  passo "Testes do Worker" worker npm test || return 1
  passo "Validar bundle sem publicar" worker npm run check
}

job_lint() {
  instalar_raiz_uma_vez || return 1
  passo "Gate de código limpo (ruff, biome, pyright, semgrep, pre-commit)" . bash scripts/gate-codigo-limpo.sh
}

job_sql_aviso() {
  # Modo aviso: só migrations alteradas vs origin/main. Saída 10 = achados, 11 = não rodou
  # (o laço abaixo mostra como AVISO / NÃO RODOU, sem reprovar e sem fingir VERDE).
  if ! bash scripts/instalar-hooks.sh --ver; then
    echo "[sql-aviso] pre-commit NÃO instalado neste clone — rode: bash scripts/instalar-hooks.sh"
  fi
  bash scripts/sql-lint.sh origin/main
}

declare -A RESULTADO
declare -A DURACAO
FALHOU=0
AVISOS=0

for job in "${JOBS[@]}"; do
  echo
  linha
  echo "JOB: $job"
  linha
  inicio=$(date +%s)
  log="$LOG_DIR/$job.log"
  fn="job_${job//-/_}"
  # tee preserva a saída na tela e no log; PIPESTATUS pega o exit do job.
  "$fn" 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  fim=$(date +%s)
  DURACAO[$job]=$((fim - inicio))
  if [ "$rc" -eq 0 ]; then
    RESULTADO[$job]="VERDE"
  elif [ "$job" = "sql-aviso" ] && [ "$rc" -eq 10 ]; then
    RESULTADO[$job]="AVISO (achados do sqlfluff; não reprova)"
    AVISOS=1
  elif [ "$job" = "sql-aviso" ] && [ "$rc" -eq 11 ]; then
    RESULTADO[$job]="NÃO RODOU (sqlfluff ausente; não reprova)"
    AVISOS=1
  else
    RESULTADO[$job]="VERMELHO (exit $rc)"
    FALHOU=1
  fi
  echo ">>> $job: ${RESULTADO[$job]} em ${DURACAO[$job]}s (log: $log)"
done

echo
linha
echo "RESUMO DO CI LOCAL — commit $HASH"
for job in "${JOBS[@]}"; do
  printf '  %-9s %s (%ss)\n' "$job" "${RESULTADO[$job]}" "${DURACAO[$job]}"
done
if [ "$FALHOU" -eq 0 ]; then
  [ "$AVISOS" -eq 1 ] && echo "ATENÇÃO: há job em AVISO / NÃO RODOU acima — não é VERDE limpo; leia antes de registrar."
  if [ -n "$SUJO" ]; then
    echo "RESULTADO: VERDE — mas a árvore tinha mudança não commitada; commite e rode de novo antes de registrar no PR."
  else
    echo "RESULTADO: VERDE — registre no PR: \"ci-local.sh verde no commit $HASH\""
    # Carimbo para scripts/publicar.sh: só rodada COMPLETA (todos os jobs), árvore limpa. Chave = hash da ÁRVORE, então
    # um merge que não muda os arquivos (mesma árvore) herda o verde, e qualquer mudança exige CI de novo.
    # Só carimba se: rodada completa; sem arquivo não rastreado no começo (ele entraria no build sem estar no commit);
    # e a árvore do fim é a MESMA do começo, sem nada sujo (commit/edição durante o CI não herda o verde).
    if [ "${#JOBS[@]}" -eq "${#TODOS_JOBS[@]}" ] && [ -z "$NAO_RASTREADO" ] \
      && [ "$(git rev-parse 'HEAD^{tree}')" = "$ARVORE0" ] && [ -z "$(git status --porcelain)" ]; then
      CARIMBOS="${OLLI_CI_CARIMBOS:-$HOME/.local/state/olli-ci/verde}"
      mkdir -p "$CARIMBOS" && printf '%s %s\n' "$HASH" "$(date -u +%FT%TZ)" > "$CARIMBOS/$ARVORE0"
    elif [ "${#JOBS[@]}" -eq "${#TODOS_JOBS[@]}" ]; then
      echo "SEM CARIMBO de publicação: havia arquivo não rastreado ou a árvore mudou durante o CI."
    fi
  fi
else
  echo "RESULTADO: VERMELHO — não mescle."
fi
linha
exit "$FALHOU"
