#!/usr/bin/env bash
# sqlfluff em MODO AVISO, só sobre migrations .sql ALTERADAS (nunca os legados).
#
# Uso:
#   bash scripts/sql-lint.sh --staged        # arquivos no índice (pre-commit instalado por scripts/instalar-hooks.sh)
#   bash scripts/sql-lint.sh [base-ref]      # alterados desde o merge-base com base-ref
#                                            # (padrão: origin/main; sem ele, HEAD~1)
#
# Códigos de saída:
#   --staged (hook)  : SEMPRE 0 — aviso nunca bloqueia commit.
#   base-ref (CI)    : 0 = checou e limpo (ou nada a checar); 10 = checou e há achados;
#                      11 = NÃO rodou (sqlfluff ausente). Quem chama (ci-local) mostra 10/11
#                      como AVISO / NÃO RODOU, nunca como VERDE, mas também não reprova.
# Quando o ruído estiver baixo em PRs reais, tratar 10 como falha para virar gate.
# Binário: $SQLFLUFF_BIN, ou `sqlfluff` no PATH (instale em venv: python -m venv v && v/Scripts/pip install sqlfluff).
# Config: .sqlfluff na raiz (dialeto postgres, regras de layout/caixa desligadas).

set -u
MODO_STAGED=0
[ "${1:-}" = "--staged" ] && MODO_STAGED=1
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 0

SQLFLUFF="${SQLFLUFF_BIN:-sqlfluff}"
if ! command -v "$SQLFLUFF" >/dev/null 2>&1; then
  echo "[sql-lint] NÃO RODOU: sqlfluff não encontrado (defina SQLFLUFF_BIN ou instale em venv) — sem bloquear."
  [ "$MODO_STAGED" -eq 1 ] && exit 0
  exit 11
fi

if [ "$MODO_STAGED" -eq 1 ]; then
  ARQUIVOS="$(git diff --cached --name-only --diff-filter=AM -- 'supabase/migrations/*.sql')"
else
  BASE="${1:-origin/main}"
  if git rev-parse --verify -q "$BASE" >/dev/null; then
    REF="$(git merge-base "$BASE" HEAD 2>/dev/null || echo "$BASE")"
  else
    REF="HEAD~1"
  fi
  ARQUIVOS="$(git diff --name-only --diff-filter=AM "$REF" HEAD -- 'supabase/migrations/*.sql')"
fi

if [ -z "$ARQUIVOS" ]; then
  echo "[sql-lint] nenhuma migration .sql alterada — nada a checar."
  exit 0
fi

echo "[sql-lint] checando (aviso, não bloqueia):"
echo "$ARQUIVOS" | sed 's/^/  /'
# shellcheck disable=SC2086
"$SQLFLUFF" lint $ARQUIVOS
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "[sql-lint] AVISO: sqlfluff reportou achados (exit $rc). Modo aviso: seguindo."
  [ "$MODO_STAGED" -eq 1 ] && exit 0
  exit 10
fi
exit 0
