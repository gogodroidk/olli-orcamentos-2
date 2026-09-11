# Onda 2 / Janela 2.2 — recibo local

Data: **2026-08-28**
Status: **DRAFT_STATIC_VERIFIED + HARNESS_PREPARED**
PostgreSQL real: **POSTGRES_EXECUTION_NOT_RUN**

## Evidência verificada

- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 test` -> `17/17` testes verdes;
- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run validate` -> validador estático `ok=true`, `checkedFiles=11`, `requiredTables=5`;
- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run validate:sql-syntax` -> `pglast` analisou os 6 arquivos SQL, totalizando 141 statements, e retornou `PGLAST_PARSE=PASS`;
- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run plan` -> plano determinístico com 6 arquivos, alvo local `localhost:5432/olli_ephemeral`, sem impressão de senha;
- `node --check` nos dois scripts e nos dois testes JavaScript -> `exit 0`.

## Ajuste aplicado nesta revisão

- O guardrail do executor está explicitamente testado para remover variáveis herdadas `PG*` antes do ensaio local, e o bootstrap SQL repete a negação de banco sem prefixo `olli_` ou servidor fora de loopback.
- A revisão independente de segurança não encontrou P0. O P1 de possível recursão/dependência de `BYPASSRLS` foi removido ao trocar o helper para `SECURITY INVOKER`, consultando somente a própria membership visível pela policy simples.
- Comparação atômica de `expected_version` e replay semântico por `payload_hash` não foram atribuídos ao schema: estão registrados em `GAPS_TO_GATEWAY.md` e são o objetivo da Janela 2.3.

## Limites ainda abertos

- `psql`, `pg_isready`, Docker/Podman e Supabase CLI continuam ausentes no host;
- a gramática PostgreSQL foi parseada, mas RLS em runtime, grants reais, concorrência, replay semântico e rollback executado ainda não foram comprovados;
- esta janela fecha como pacote local verificado e pronto para ensaio futuro, não como migration aprovada para `supabase/migrations/**`.
