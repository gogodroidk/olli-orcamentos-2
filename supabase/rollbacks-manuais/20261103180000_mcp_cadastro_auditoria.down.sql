-- ROLLBACK MANUAL. Nenhum código lê/grava esta tabela em main (conferido por grep). Pare o adaptador MCP antes.
-- Tabela é append-only: o trigger bloqueia DELETE; o DROP TABLE não dispara trigger de linha.
begin;
drop table if exists public.mcp_cadastro_auditoria;
drop function if exists public.purge_mcp_cadastro_auditoria(timestamptz);
drop function if exists public.mcp_cadastro_auditoria_campos_ok();
drop function if exists public.mcp_cadastro_auditoria_imutavel();
commit;
