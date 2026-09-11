"""Valida gramática PostgreSQL offline; não conecta nem executa SQL."""

from pathlib import Path
import sys

try:
    from pglast import parse_sql
except ImportError:
    print("PGLAST_PARSE=NOT_AVAILABLE", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parent.parent
FILES = (
    ROOT / "sql" / "001_increment_a_up.sql",
    ROOT / "sql" / "001_increment_a_rollback.sql",
    ROOT / "harness" / "000_bootstrap_local.sql",
    ROOT / "harness" / "010_fixtures.sql",
    ROOT / "harness" / "020_assertions.sql",
    ROOT / "harness" / "030_rollback_assertions.sql",
)


def without_psql_meta_commands(value: str) -> str:
    return "\n".join(
        line
        for line in value.splitlines()
        if not line.lstrip().startswith("\\")
    )


def main() -> int:
    for sql_path in FILES:
        sql = sql_path.read_text(encoding="utf-8")
        statements = parse_sql(without_psql_meta_commands(sql))
        relative_path = sql_path.relative_to(ROOT).as_posix()
        print(
            f"{relative_path}\tPARSE_OK\tstatements={len(statements)}"
        )

    print("PGLAST_PARSE=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
