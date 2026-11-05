#!/usr/bin/env bash
# Confere o pre-commit.
#
# Com core.hooksPath=.githooks o hook que vale é o versionado
# (.githooks/pre-commit: gitleaks + sql em aviso + gate de código limpo).
# Este script NÃO reescreve esse arquivo — senão apagaria o gitleaks.
#
# Em clone antigo, sem .githooks no hooksPath, grava o hook legado
# (sql em aviso + gate). Uso:
#   bash scripts/instalar-hooks.sh        # confere ou instala
#   bash scripts/instalar-hooks.sh --ver  # exit 0 se a marca está no hook
set -eu
cd "$(dirname "${BASH_SOURCE[0]}")/.."
HOOK="$(git rev-parse --git-path hooks/pre-commit)"
MARCA="# olli-sql-lint"

pasta_do_hook="$(basename "$(dirname "$HOOK")")"
if [ "$pasta_do_hook" = ".githooks" ]; then
  if [ "${1:-}" = "--ver" ]; then
    grep -qs "$MARCA" "$HOOK"
    exit $?
  fi
  if [ ! -f "$HOOK" ]; then
    echo "[hooks] falta .githooks/pre-commit" >&2
    exit 1
  fi
  if ! grep -q "$MARCA" "$HOOK" || ! grep -q "gate-codigo-limpo.sh" "$HOOK"; then
    echo "[hooks] .githooks/pre-commit incompleto (marca sql ou gate de código limpo)." >&2
    exit 1
  fi
  echo "[hooks] .githooks/pre-commit versionado. Nada a gravar."
  exit 0
fi

if [ "${1:-}" = "--ver" ]; then
  grep -qs "$MARCA" "$HOOK"
  exit $?
fi

if [ -e "$HOOK" ] && ! grep -q "$MARCA" "$HOOK"; then
  echo "[hooks] $HOOK já existe e não é nosso — não sobrescrevo. Acrescente manualmente:"
  echo "  bash scripts/sql-lint.sh --staged"
  echo "  bash scripts/gate-codigo-limpo.sh --staged"
  exit 1
fi

mkdir -p "$(dirname "$HOOK")"
cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
# olli-sql-lint — gerado por scripts/instalar-hooks.sh. Aviso, nunca bloqueia.
# olli-gate-codigo-limpo — bloqueia código frágil.
cd "$(git rev-parse --show-toplevel)" || exit 1
bash scripts/sql-lint.sh --staged || true
exec bash scripts/gate-codigo-limpo.sh --staged
HOOKEOF
chmod +x "$HOOK"
echo "[hooks] pre-commit instalado em $HOOK"
