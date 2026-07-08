# RLS_MATRIX — testes de isolamento (gate de saída da Onda 2)

> A migration `supabase/migrations/20260707_multitenant.sql` NÃO fecha a onda sozinha.
> Esta matriz precisa rodar VERDE com JWTs reais (role `authenticated` — o role
> `postgres` ignora RLS e não prova nada). Blocos T1–T7 prontos no fim da migration.
>
> Atores: **A** = dono da Org1 · **B** = técnico da Org1 · **C** = usuário sem org ·
> **D** = dono da Org2 · **G** = gestor da Org1 · **F** = "financeiro" (hoje = gestor).

## Matriz

| # | Cenário (mestre §10.5) | Ação | Esperado | Bloco |
| --- | --- | --- | --- | --- |
| 1 | Dono sozinho não regride | A sem org lê/escreve os próprios dados | tudo funciona igual a antes | T1 |
| 2 | Usuário A não acessa empresa B | C (e D) `select` em orcamentos/clientes/empresa de A | 0 linhas | T2 |
| 3 | Membro vê dados do owner | B aceita convite → `select` orcamentos de A | linhas de A visíveis | T3 |
| 4 | Técnico escreve em nome do owner | B `insert` orçamento com `user_id=A, criado_por=B` | sucesso | T4 |
| 5 | Técnico não forja autoria | B `insert` com `user_id=A, criado_por=A` (ou null) | **negado** | T4 |
| 6 | Técnico não altera cadastro base | B `update/insert` em `empresa`, `clientes`, `servicos`, `produtos`, `recibos` de A | **negado** (escrita conservadora) | T7 |
| 7 | Desativação corta acesso na hora | A seta `ativo=false` em B → B `select` dados de A | 0 linhas | T5 |
| 8 | Convite expirado não concede acesso | B chama `aceitar_convite(token expirado)` | `erro:convite_expirado`, sem membership | T6 |
| 9 | Convite reusado | segundo `aceitar_convite(mesmo token)` por outro user | `erro:convite_ja_usado` | T6 |
| 10 | Técnico não gerencia membros/convites | B `insert` em `organizacao_membros`/`convites` | **negado** (só owner/admin) | novo |
| 11 | Papel owner é intocável | admin tenta `update/delete` na linha `owner` de `organizacao_membros` | **negado** | novo |
| 12 | Técnico não vê acessos/localizações alheias | B `select` `acessos_equipe`/`localizacoes_equipe` de G | só as próprias linhas | novo |
| 13 | Gestão vê acessos/localizações | G `select` nas duas tabelas | linhas de toda a org | novo |
| 14 | Membro só grava a PRÓPRIA posição | B `insert/upsert` localização com `user_id=G` | **negado** | novo |
| 15 | Log de acesso é append-only | B `update/delete` em `acessos_equipe` | **negado** | novo |
| 16 | Cross-org de membro | B (Org1) `select` dados de D (Org2) | 0 linhas | novo |
| 17 | Escalonamento via convite | B (técnico) cria convite com papel `admin` | **negado** (só gestão convida) | novo |
| 18 | Financeiro não modifica permissões | F `update` papel de membro | **negado** (só owner/admin) | novo |
| 19 | Técnico não altera assinatura | B chama checkout/portal do Stripe da conta de A | negado no worker (JWT ≠ owner) — teste no worker, não no SQL | worker |
| 20 | Anônimo | `anon` `select` em qualquer tabela nova | 0 linhas / negado | novo |

## Itens do mestre adiados COM DECISÃO (não são buracos esquecidos)

- "Técnico não vê margens": hoje não existe campo custo/margem separado no
  orçamento — vira teste quando o financeiro operacional entrar (coluna + policy de coluna ou view).
- "Gerente acessa apenas filiais permitidas": filiais são Camada 3; sem tabela, sem teste.
- Papel `financeiro` dedicado: hoje mapeado em `gestor`; ganha papel próprio na onda do financeiro.

## Como rodar

1. Criar 4 contas reais no Supabase de teste (A, B, C, D) + org via `criar_organizacao`.
2. No SQL editor: `set role authenticated; set request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';` por ator.
3. Rodar T1–T7 da migration + os casos "novo" acima (adicionar como T8–T14 no mesmo arquivo).
4. Colar o resultado (contagens/erros) em `EXECUTION_LOG.md` como evidência.
5. Repetir a matriz inteira a cada migration futura que toque policy (regressão de RLS é o pior bug possível do produto).
