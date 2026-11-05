#!/usr/bin/env bash
# Prova do gate MF-07: a fiação existe e código ruim é barrado.
# Não entra no npm test (é shell). O gate cheio chama este arquivo.
# Exit 0 = passou; 1 = falhou.
set -u

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 2

falhas=0
ok() { echo "  ok   $1"; }
falha() { echo "  FALHA $1" >&2; falhas=$((falhas + 1)); }

exigir() {
  if [ -f "$1" ]; then
    ok "$1 existe"
  else
    falha "$1 ausente"
  fi
}

exigir .pre-commit-config.yaml
exigir .semgrep.yml
exigir ruff.toml
exigir pyrightconfig.json
exigir scripts/gate-codigo-limpo.sh
exigir .githooks/pre-commit

for id in ruff-check pyright biome-check semgrep; do
  if grep -q "id: ${id}" .pre-commit-config.yaml; then
    ok "hook ${id}"
  else
    falha "hook ${id} ausente na config do pre-commit"
  fi
done

if grep -q 'gate-codigo-limpo.sh' .github/workflows/ci.yml; then
  ok "ci.yml chama o gate"
else
  falha "ci.yml não chama o gate"
fi

if grep -q 'gate-codigo-limpo.sh' scripts/ci-local.sh; then
  ok "ci-local chama o gate"
else
  falha "ci-local não chama o gate"
fi

if grep -q 'gate-codigo-limpo.sh' .githooks/pre-commit; then
  ok "hook versionado chama o gate"
else
  falha "hook versionado não chama o gate"
fi

if grep -q 'gitleaks' .githooks/pre-commit && grep -q 'sql-lint.sh' .githooks/pre-commit; then
  ok "hook versionado mantém segredo e sql em aviso"
else
  falha "hook versionado perdeu gitleaks ou sql-lint"
fi

# O ramo "gitleaks ausente" antigo dava exit 0 e engolia o resto do hook.
if grep -q 'exit 0' .githooks/pre-commit; then
  falha "hook versionado ainda tem exit 0 (pode pular o gate)"
else
  ok "hook versionado não sai 0 antes do gate"
fi

if grep -q 'olli-sql-lint' .githooks/pre-commit; then
  ok "marca do sql-lint presente"
else
  falha "marca olli-sql-lint ausente (o ci-local deixa de reconhecer o hook)"
fi

if bash scripts/instalar-hooks.sh --ver; then
  ok "instalar-hooks --ver"
else
  falha "instalar-hooks --ver não reconhece o hook"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/ruim.py" <<'PY'
def soma(a: int, b: int) -> int:
    return eval("a + b") + inexistente
PY

cat > "$tmp/limpo.py" <<'PY'
def soma(a: int, b: int) -> int:
    return a + b
PY

esperar_falha() {
  local nome="$1"
  shift
  if "$@"; then
    falha "${nome} deixou passar código ruim"
  else
    ok "${nome} barra código ruim"
  fi
}

esperar_ok() {
  local nome="$1"
  shift
  if "$@"; then
    ok "${nome} aceita código limpo"
  else
    falha "${nome} reprovou código limpo"
  fi
}

esperar_falha ruff bash scripts/gate-codigo-limpo.sh --sem-prova --so ruff "$tmp/ruim.py"
esperar_ok ruff bash scripts/gate-codigo-limpo.sh --sem-prova --so ruff "$tmp/limpo.py"
esperar_falha pyright bash scripts/gate-codigo-limpo.sh --sem-prova --so pyright "$tmp/ruim.py"
esperar_ok pyright bash scripts/gate-codigo-limpo.sh --sem-prova --so pyright "$tmp/limpo.py"
esperar_falha semgrep bash scripts/gate-codigo-limpo.sh --sem-prova --so semgrep "$tmp/ruim.py"
esperar_ok semgrep bash scripts/gate-codigo-limpo.sh --sem-prova --so semgrep "$tmp/limpo.py"

echo
if [ "$falhas" -eq 0 ]; then
  echo "PASSOU: prova do gate de código limpo"
  exit 0
fi
echo "FALHOU: ${falhas} falha(s) na prova do gate" >&2
exit 1
