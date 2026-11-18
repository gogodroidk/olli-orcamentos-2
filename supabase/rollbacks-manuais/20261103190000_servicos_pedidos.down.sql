-- ROLLBACK MANUAL. ATENÇÃO: apaga pedidos de diagnóstico (LGPD: contém nome do negócio e WhatsApp). Exporte antes se houver linhas.
-- Antes, desligar SERVICOS_RETENCAO_MODE e o POST de /servicos/ (worker/src/pedidoDiagnostico.js).
begin;
drop function if exists public.servicos_pedidos_retencao_limpar(timestamptz);
drop table if exists public.servicos_pedidos;
commit;
