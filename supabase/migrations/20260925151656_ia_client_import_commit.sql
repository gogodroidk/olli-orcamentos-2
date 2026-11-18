-- OLLI Autopilot — commit transacional de candidatos de cliente revisados.
--
-- NO-OP DE PROPÓSITO (18/11/2026, ordem do TECH — CTO).
--
-- Motivo: esta migration tinha SQL inválido (`select pg_catalog.exists (select ...)`:
-- `exists` é palavra reservada, não função de pg_catalog → erro 42601 na linha 166),
-- NUNCA rodou em produção (não consta no histórico nem cria função/tabela lá) e
-- nenhum código do repositório chama `commit_ia_client_import` nem usa as tabelas
-- `ia_client_import_*` (a rota /ia/autopilot/clientes/commit não existe no Worker).
-- O recurso foi abandonado/ficou só no papel (docs/PESQUISAS/2026-09-25_*).
-- Aplicar de verdade criaria 2 tabelas e 2 funções sem uso em produção; por isso o
-- corpo virou no-op e o repositório volta a aplicar do zero sem erro.
--
-- O SQL original (429 linhas: 2 tabelas, RLS forçada, RPC commit_ia_client_import e
-- purge_expired_ia_client_imports) segue no histórico do git (commit 239633be). Se o
-- recurso voltar, crie uma migration NOVA com a versão corrigida (trocar
-- `pg_catalog.exists (` por `exists (`), com teste em PGlite — não reative esta.

select 1;
