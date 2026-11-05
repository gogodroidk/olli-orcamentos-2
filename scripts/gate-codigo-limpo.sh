#!/usr/bin/env bash
# Gate de código limpo no Linux (MF-07 / Z-108).
#
# Roda, e reprova se qualquer um não passar:
#   ruff      lint + format do Python (versão cravada)
#   biome     catraca que já existe (npm run lint) — erro NOVO reprova, o antigo não
#   pyright   tipo do Python
#   semgrep   regras locais em .semgrep.yml (eval/exec)
#   pre-commit  .pre-commit-config.yaml válido, com os quatro hooks
#
# Fail-closed: ferramenta que não chega a rodar NÃO é "não achou nada".
# Sem o binário no PATH, usa uvx com a versão do template da casa.
# O Biome é o do package-lock (não o uvx): a catraca lê esse binário.
#
#   bash scripts/gate-codigo-limpo.sh                 # árvore inteira + prova
#   bash scripts/gate-codigo-limpo.sh --staged        # só o índice (hook)
#   bash scripts/gate-codigo-limpo.sh --so ruff arq.py
#   bash scripts/gate-codigo-limpo.sh --sem-prova
set -u

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 2

RUFF_VER=0.15.20
PYRIGHT_VER=1.1.411
SEMGREP_VER=1.168.0
PRECOMMIT_VER=4.6.0

MODO=cheio
SO=""
SEM_PROVA=0
ARQUIVOS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --staged) MODO=staged; shift ;;
    --sem-prova) SEM_PROVA=1; shift ;;
    --so)
      [ "$#" -ge 2 ] || { echo "Faltou o nome depois de --so" >&2; exit 2; }
      SO="$2"
      shift 2
      ;;
    --)
      shift
      ARQUIVOS+=("$@")
      break
      ;;
    -*)
      echo "Opção desconhecida: $1" >&2
      exit 2
      ;;
    *)
      ARQUIVOS+=("$1")
      shift
      ;;
  esac
done

case "$SO" in
  ""|ruff|pyright|biome|semgrep|pre-commit) ;;
  *) echo "--so aceita: ruff, pyright, biome, semgrep, pre-commit" >&2; exit 2 ;;
esac

# Prefere a versão cravada (uvx). PATH só se o uvx não existir.
executar() {
  local bin="$1" pacote="$2" ver="$3"
  shift 3
  if command -v uvx >/dev/null 2>&1; then
    uvx --from "${pacote}==${ver}" "$bin" "$@"
    return $?
  fi
  if command -v "$bin" >/dev/null 2>&1; then
    echo "[$bin] uvx ausente; usando o binário do PATH (versão não cravada)." >&2
    "$bin" "$@"
    return $?
  fi
  echo "[$bin] não rodou: sem uvx e sem binário no PATH. O gate reprova." >&2
  return 1
}

quero() {
  [ -z "$SO" ] || [ "$SO" = "$1" ]
}

listar_py_rastreado() {
  git ls-files -z '*.py'
}

# Imprime os caminhos do índice que o gate olha, um por linha.
listar_staged() {
  git diff --cached --name-only --diff-filter=ACMR
}

eh_py() {
  case "$1" in
    *.py) return 0 ;;
    *) return 1 ;;
  esac
}

eh_js() {
  case "$1" in
    *.js|*.jsx|*.mjs|*.cjs|*.ts|*.tsx) return 0 ;;
    *) return 1 ;;
  esac
}

# Separa ARQUIVOS (ou o índice, no modo staged) em dois grupos.
PYS=()
JSS=()
if [ "$MODO" = "staged" ] && [ "${#ARQUIVOS[@]}" -eq 0 ]; then
  while IFS= read -r caminho; do
    [ -n "$caminho" ] || continue
    if eh_py "$caminho"; then
      PYS+=("$caminho")
    elif eh_js "$caminho"; then
      JSS+=("$caminho")
    fi
  done < <(listar_staged)
elif [ "${#ARQUIVOS[@]}" -gt 0 ]; then
  for caminho in "${ARQUIVOS[@]}"; do
    if eh_py "$caminho"; then
      PYS+=("$caminho")
    elif eh_js "$caminho"; then
      JSS+=("$caminho")
    else
      # Caminho explícito sem extensão conhecida: entrega para a ferramenta pedida.
      PYS+=("$caminho")
      JSS+=("$caminho")
    fi
  done
fi

RC=0
marcar() {
  local nome="$1" codigo="$2"
  if [ "$codigo" -eq 0 ]; then
    echo "--- [$nome] ok"
  else
    echo "--- [$nome] FALHOU (exit $codigo)" >&2
    RC=1
  fi
}

rodar_ruff() {
  local -a alvos=()
  if [ "${#PYS[@]}" -gt 0 ]; then
    alvos=("${PYS[@]}")
  elif [ "$MODO" = "staged" ]; then
    echo "--- [ruff] sem Python no índice"
    return 0
  else
    while IFS= read -r -d '' caminho; do
      alvos+=("$caminho")
    done < <(listar_py_rastreado)
  fi
  if [ "${#alvos[@]}" -eq 0 ]; then
    executar ruff ruff "$RUFF_VER" version >/dev/null
    return $?
  fi
  executar ruff ruff "$RUFF_VER" check "${alvos[@]}" || return $?
  executar ruff ruff "$RUFF_VER" format --check "${alvos[@]}"
}

rodar_pyright() {
  local -a alvos=()
  if [ "${#PYS[@]}" -gt 0 ]; then
    alvos=("${PYS[@]}")
  elif [ "$MODO" = "staged" ]; then
    echo "--- [pyright] sem Python no índice"
    return 0
  fi
  # O pacote avisa que existe versão nova mesmo com o pin. O pin continua no uvx.
  export PYRIGHT_PYTHON_IGNORE_WARNINGS=1
  # Arquivo passado na linha de comando entra mesmo fora do include (prova em /tmp).
  if [ "${#alvos[@]}" -gt 0 ]; then
    executar pyright pyright "$PYRIGHT_VER" "${alvos[@]}"
    return $?
  fi
  executar pyright pyright "$PYRIGHT_VER"
}

rodar_biome() {
  if [ "$MODO" = "staged" ] && [ "${#JSS[@]}" -eq 0 ] && [ "${#ARQUIVOS[@]}" -eq 0 ]; then
    echo "--- [biome] sem JS/TS no índice"
    return 0
  fi
  # Catraca do repositório, não `biome check` arquivo a arquivo: erro antigo
  # no mesmo arquivo não pode travar o commit, erro novo trava.
  if [ ! -x "$RAIZ/node_modules/.bin/biome" ]; then
    echo "[biome] node_modules/.bin/biome ausente. Rode npm ci. O gate reprova." >&2
    return 1
  fi
  npm run lint
}

rodar_semgrep() {
  local -a alvos=()
  if [ "${#PYS[@]}" -gt 0 ] || [ "${#JSS[@]}" -gt 0 ]; then
    if [ "$MODO" = "staged" ] || [ "${#ARQUIVOS[@]}" -gt 0 ]; then
      [ "${#PYS[@]}" -gt 0 ] && alvos+=("${PYS[@]}")
      [ "${#JSS[@]}" -gt 0 ] && alvos+=("${JSS[@]}")
    fi
  elif [ "$MODO" = "staged" ]; then
    echo "--- [semgrep] sem código no índice"
    return 0
  fi
  if [ "${#alvos[@]}" -eq 0 ]; then
    local pasta
    for pasta in src scripts worker web webapp docs ops plugins; do
      [ -d "$RAIZ/$pasta" ] && alvos+=("$pasta")
    done
  fi
  if [ "${#alvos[@]}" -eq 0 ]; then
    echo "[semgrep] não achei pasta para varrer. O gate reprova." >&2
    return 1
  fi
  # Caminho absoluto fora do repo (a prova em /tmp): sem isso o semgrep,
  # rodando dentro do git, troca o alvo pelo arquivo rastreado.
  local fora=0 caminho
  for caminho in "${alvos[@]}"; do
    case "$caminho" in
      /*)
        case "$caminho" in
          "$RAIZ"/*) ;;
          *) fora=1 ;;
        esac
        ;;
    esac
  done
  if [ "$fora" -eq 1 ]; then
    SEMGREP_SEND_METRICS=off SEMGREP_ENABLE_VERSION_CHECK=0 \
      executar semgrep semgrep "$SEMGREP_VER" scan \
        --config "$RAIZ/.semgrep.yml" \
        --error \
        --metrics=off \
        --disable-version-check \
        --no-git-ignore \
        "${alvos[@]}"
    return $?
  fi
  SEMGREP_SEND_METRICS=off SEMGREP_ENABLE_VERSION_CHECK=0 \
    executar semgrep semgrep "$SEMGREP_VER" scan \
      --config "$RAIZ/.semgrep.yml" \
      --error \
      --metrics=off \
      --disable-version-check \
      --exclude node_modules \
      --exclude dist \
      --exclude android \
      --exclude _arquivo-antigo \
      --exclude .ci-local \
      --exclude web-build \
      "${alvos[@]}"
}

rodar_precommit() {
  local id falta=0
  if [ ! -f "$RAIZ/.pre-commit-config.yaml" ]; then
    echo "[pre-commit] falta .pre-commit-config.yaml. O gate reprova." >&2
    return 1
  fi
  for id in ruff-check pyright biome-check semgrep; do
    if ! grep -q "id: ${id}" "$RAIZ/.pre-commit-config.yaml"; then
      echo "[pre-commit] hook ausente: ${id}" >&2
      falta=1
    fi
  done
  [ "$falta" -eq 0 ] || return 1
  if [ "$MODO" = "staged" ]; then
    echo "--- [pre-commit] config presente (validate-config fica no gate cheio)"
    return 0
  fi
  executar pre-commit pre-commit "$PRECOMMIT_VER" validate-config
}

# Prova (código ruim tem de ser barrado) só no gate cheio, uma vez.
if [ "$MODO" = "cheio" ] && [ -z "$SO" ] && [ "$SEM_PROVA" -eq 0 ] && [ "${GATE_SEM_PROVA_INTERNA:-}" != "1" ]; then
  echo "=== prova: código ruim tem de ser barrado ==="
  GATE_SEM_PROVA_INTERNA=1 bash "$RAIZ/scripts/teste-gate-codigo-limpo.sh"
  marcar "prova" $?
fi

if quero ruff; then
  echo "=== ruff ${RUFF_VER} ==="
  rodar_ruff
  marcar "ruff" $?
fi
if quero pyright; then
  echo "=== pyright ${PYRIGHT_VER} ==="
  rodar_pyright
  marcar "pyright" $?
fi
if quero biome; then
  echo "=== biome (catraca) ==="
  rodar_biome
  marcar "biome" $?
fi
if quero semgrep; then
  echo "=== semgrep ${SEMGREP_VER} ==="
  rodar_semgrep
  marcar "semgrep" $?
fi
if quero pre-commit; then
  echo "=== pre-commit ${PRECOMMIT_VER} ==="
  rodar_precommit
  marcar "pre-commit" $?
fi

if [ "$RC" -eq 0 ]; then
  echo "GATE: VERDE"
else
  echo "GATE: VERMELHO" >&2
fi
exit "$RC"
