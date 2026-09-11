-- Remove três índices UNIQUE legados que duplicavam exatamente os índices das
-- chaves primárias das cotas IA. As constraints *_pkey permanecem intactas;
-- rollback: recriar os índices *_pk com as mesmas colunas.

DROP INDEX IF EXISTS public.ia_cota_global_diaria_pk;
DROP INDEX IF EXISTS public.ia_cota_reservas_pk;
DROP INDEX IF EXISTS public.ia_cota_usuario_diaria_pk;
