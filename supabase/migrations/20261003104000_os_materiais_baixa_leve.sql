-- ============================================================================
-- OLLI — BAIXA LEVE DE MATERIAL POR OS (Onda I4 · Dinheiro e rotina)
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   `ordens_servico.materiais jsonb` — o que SAIU nesta OS (cobre, suporte, gás
--   R-410A…): lista de { id, nome, quantidade, unidade, custoUnitario?, produtoId? }.
--   Não é estoque (sem saldo, sem entrada): é o registro que alimenta o "Lucro
--   real da visita" no app.
--
--   NULL  = não informado (o app pede a baixa, nunca supõe "sem material");
--   '[]'  = "não usei material" (afirmação do técnico).
--
-- SEGURANÇA
--   Nenhuma policy nova: a coluna vive na mesma linha da OS e herda as policies
--   de `ordens_servico` (dono + equipe visível). O check só garante o formato
--   (array) — o conteúdo é validado no app (`src/utils/materiaisOS.ts`).
--
-- ORDEM DE PUBLICAÇÃO: pode ir antes ou depois do APK. Sem ela o app segue
--   funcionando: o push detecta a coluna inexistente, reenvia a OS sem ela e o
--   pull preserva a baixa local (cloudSync, `osSemColunaMateriais`).
--
-- IDEMPOTENTE: add column if not exists; constraint recriada por nome.
-- SEGREDOS: zero.
-- ============================================================================

begin;

alter table public.ordens_servico
  add column if not exists materiais jsonb;

comment on column public.ordens_servico.materiais is
  'Baixa leve de material/gás da OS (Onda I4). NULL = não informado; [] = não usou material. Alimenta o Lucro real da visita.';

alter table public.ordens_servico
  drop constraint if exists ordens_servico_materiais_array;
alter table public.ordens_servico
  add constraint ordens_servico_materiais_array
  check (materiais is null or jsonb_typeof(materiais) = 'array');

commit;
