-- Validação pós-staging dos CHECKs financeiros adicionados em
-- 20260911120000_financial_integrity_guards. A consulta de pré-validação
-- encontrou zero linhas legadas incompatíveis; agora o contrato passa a valer
-- também para o acervo existente.
ALTER TABLE public.orcamentos
  VALIDATE CONSTRAINT orcamentos_status_valido_ck;
ALTER TABLE public.orcamentos
  VALIDATE CONSTRAINT orcamentos_valores_nao_negativos_ck;
ALTER TABLE public.ordens_servico
  VALIDATE CONSTRAINT ordens_servico_status_valido_ck;
ALTER TABLE public.ordens_servico
  VALIDATE CONSTRAINT ordens_servico_valor_nao_negativo_ck;
ALTER TABLE public.recibos
  VALIDATE CONSTRAINT recibos_valor_positivo_ck;
