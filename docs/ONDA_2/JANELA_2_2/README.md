# Onda 2 — Janela 2.2: migration draft e laboratório PostgreSQL

Data: **2026-08-28**  
Estado: **DRAFT LOCAL — execução PostgreSQL ainda não realizada**

## Resultado pretendido

Este pacote traduz os contratos da Janela 2.1 para uma migration PostgreSQL aditiva e um laboratório descartável:

```text
organização
  → membership atual derivada da sessão
  → cliente
  → local com co-tenancy
  → ledger de comando por organização
  → RLS e privilégios fail-closed
```

Ele não altera `supabase/migrations/**`, não se conecta a Supabase e não integra o runtime. A migration assume um ambiente compatível com Supabase/Postgres que já possua o papel `authenticated` e a função `auth.uid()`. O bootstrap em `harness/` primeiro recusa banco fora do padrão `olli_*` ou servidor fora de loopback e só então simula esses dois elementos mínimos em um banco local descartável.

## Níveis de evidência

1. **DRAFT_STATIC_VERIFIED**: estrutura e controles mínimos foram verificados offline pelo validador local.
2. **HARNESS_PREPARED**: o executor fail-closed e os testes SQL estão prontos para um Postgres local.
3. **POSTGRES_EXECUTION_NOT_RUN**: enquanto `psql`/Postgres local não existirem, nenhuma alegação de sintaxe, RLS ou transação executada é permitida.

SQLite não substitui o terceiro nível porque não reproduz RLS, grants, `auth.uid()`, tipos e concorrência PostgreSQL.

## Artefatos

- `sql/001_increment_a_up.sql`: expansão aditiva, constraints, índices, helper de autorização endurecido, RLS e grants mínimos;
- `sql/001_increment_a_rollback.sql`: rollback compensatório que bloqueia o caminho V2 e preserva dados/trilha;
- `harness/000_bootstrap_local.sql`: papel `authenticated` e stub local de `auth.uid()`;
- `harness/010_fixtures.sql`: duas organizações e atores exclusivamente sintéticos;
- `harness/020_assertions.sql`: testes de isolamento, revogação, privilégios, co-tenancy, versão e idempotência;
- `harness/030_rollback_assertions.sql`: prova de que o rollback preserva dados e mantém RLS;
- `scripts/validate-static.mjs`: barreira offline contra regressões estruturais;
- `scripts/validate-postgres-syntax.py`: parser gramatical PostgreSQL offline via `pglast`, quando disponível no workspace;
- `scripts/run-local-postgres.mjs`: executor que aceita somente loopback e banco `olli_*`;
- `tests/*.test.mjs`: testes do validador e do guardrail do harness.

## Decisões estreitas

- IDs canônicos do perfil SQL são UUIDs; os schemas J2.1 continuam strings opacas, das quais UUID é um subconjunto aceito.
- `organization_id` é a fronteira de tenant em todas as tabelas operacionais.
- A FK composta de `locations` impede referência a cliente de outra organização.
- A membership é consultada pelo banco a cada decisão; papel/capability enviados pelo cliente não autorizam.
- Leitura direta autenticada é restrita por RLS. Escritas diretas não recebem grant e também possuem policies deny-all; o gateway/RPC transacional futuro será o único escritor.
- O ledger guarda hash, metadados e resultado seguro, não o payload integral.
- O helper `has_capability` usa `SECURITY INVOKER`: ele lê somente a própria membership permitida pela policy simples de `user_id = auth.uid()`, evitando dependência de owner com `BYPASSRLS` e recursão em `organizations`. Ele também fixa `search_path`, qualifica objetos, retorna apenas booleano, revoga `PUBLIC` e concede execução mínima.
- `expected_version` e a chave idempotente possuem constraints estruturais, mas comparação da versão canônica, replay do mesmo hash e rejeição semântica de hash divergente pertencem ao gateway/RPC transacional da próxima janela. Este draft não chama essas garantias de locking/replay executados.
- A migration é one-shot. Policies existentes fazem uma reaplicação falhar visivelmente; retomada após rollback exige migration forward revisada, nunca drop automático de policy.
- O rollback nunca desliga RLS, amplia grants ou apaga comandos/dados. Os revokes bloqueiam o acesso desta fatia; `v2_commands_enabled=false` registra o estado e só vira kill switch completo quando o gateway futuro também o aplicar.

## Validação offline

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 test
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run validate
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run validate:sql-syntax
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_2 run plan
```

## Execução PostgreSQL local futura

Somente em banco descartável local cujo nome comece por `olli_`:

```powershell
node C:\OLLI_REL\docs\ONDA_2\JANELA_2_2\scripts\run-local-postgres.mjs --database-url postgresql://127.0.0.1:5432/olli_ephemeral
```

O executor não lê `.env`, não aceita host remoto, não imprime a URL, remove variáveis herdadas `PG*` antes de montar o ambiente local e não instala `psql`. O próprio SQL de bootstrap repete o guardrail de prefixo/loopback. A execução cria/usa objetos apenas dentro do banco local informado; o próprio banco deve ser descartado externamente após o ensaio.

## Não-objetivos e gates

- sem migration aplicada, Supabase remoto, produção, Storage ou service role;
- sem catálogo/backfill do legado real;
- sem dado real, segredo, token, sessão ou identidade de cliente;
- sem gateway/RPC de aplicação nesta janela;
- sem declarar conformidade PostgreSQL enquanto o recibo do harness não existir;
- qualquer promoção para `supabase/migrations/**` exige revisão, banco efêmero verde e autorização separada.
