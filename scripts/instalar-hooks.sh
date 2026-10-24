#!/usr/bin/env bash
# Instala o pre-commit local (sqlfluff em modo aviso nas migrations .sql do commit).
# Sem dependência nova: grava .git/hooks/pre-commit (vale também em worktree).
# Uso: bash scripts/instalar-hooks.sh        # instala/atualiza
#      bash scripts/instalar-hooks.sh --ver  # só diz se está instalado (exit 0 sim, 1 não)
set -eu
cd "$(dirname "${BASH_SOURCE[0]}")/.."
HOOK="$(git rev-parse --git-path hooks/pre-commit)"
MARCA="# olli-sql-lint"

if [ "${1:-}" = "--ver" ]; then
  grep -qs "$MARCA" "$HOOK"
  exit $?
fi

if [ -e "$HOOK" ] && ! grep -q "$MARCA" "$HOOK"; then
  echo "[hooks] $HOOK já existe e não é nosso — não sobrescrevo. Acrescente manualmente:"
  echo "  bash scripts/sql-lint.sh --staged"
  exit 1
fi

mkdir -p "$(dirname "$HOOK")"
cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
# olli-sql-lint — gerado por scripts/instalar-hooks.sh. Aviso, nunca bloqueia.
cd "$(git rev-parse --show-toplevel)" || exit 0
bash scripts/sql-lint.sh --staged || true
exit 0
HOOKEOF
chmod +x "$HOOK"
echo "[hooks] pre-commit instalado em $HOOK"
