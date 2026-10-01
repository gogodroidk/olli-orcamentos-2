-- ============================================================================
-- OLLI — Agenda: EXCEÇÕES POR OCORRÊNCIA da série + OS ligada à visita (item 2.8)
-- ----------------------------------------------------------------------------
-- O QUE MUDA em `agendamentos`
--   1) `excecoes jsonb` — o que mudou numa ÚNICA ocorrência de uma série recorrente
--      (migration 20260930130500 criou a recorrência, mas editar/cancelar só valia
--      para a série inteira). Chave = dia ORIGINAL da ocorrência ('YYYY-MM-DD', fuso
--      do Brasil); valor = { cancelada?, inicio?, fim?, status?, titulo?, observacao?,
--      responsavelId?, responsavelNome? }. Quem projeta e aplica é
--      `src/utils/contratoRecorrente.ts:expandirRecorrencia` (app, painel, testes).
--      Default '{}' = série sem exceção (a verdade de toda linha anterior).
--   2) `ordem_servico_id text` — a OS desta visita. Quando a OS é CONCLUÍDA, a visita
--      ligada vira `concluido` (trigger abaixo; o app faz o mesmo no SQLite local para
--      funcionar offline). As visitas geradas por contrato recorrente já se ligam à OS
--      pelo id determinístico (`os_cv_<x>` ↔ `ag_cv_<x>`) e também são cobertas.
--
-- POR QUE TRIGGER: a OS é concluída no celular do técnico, no painel e (no futuro) por
--   automação. Se cada cliente tivesse de lembrar de fechar a visita, um deles
--   esqueceria e a agenda diria "agendado" para sempre. SECURITY DEFINER porque o
--   técnico pode concluir a OS sem ter UPDATE na agenda do dono; o trigger só toca a
--   visita do MESMO tenant (`user_id = new.user_id`) e só no sentido agendado→concluído.
--
-- Série recorrente ligada à OS: o trigger NÃO mexe (concluir a série inteira seria
--   errado); o app conclui só a ocorrência do dia via exceção (`visitaConcluidaPelaOS`).
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do APK/painel novos. Sem ela o app
--   continua funcionando: o push detecta a coluna inexistente, reenvia sem as duas
--   colunas e o pull preserva as exceções locais (cloudSync, COLUNAS_AGENDA_EXCECOES);
--   só não há exceção/OS ligada entre aparelhos até aplicar.
--
-- IDEMPOTENTE: add column if not exists; constraint, índice, função e trigger
--   recriados por nome. SEGREDOS: zero.
-- ============================================================================

begin;

-- Pré-requisito: a recorrência (20260930130500). O trigger lê `recorrencia`; sem a
-- coluna ele quebraria a conclusão de TODA OS em produção — melhor falhar aqui.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'agendamentos' and column_name = 'recorrencia'
  ) then
    raise exception 'Aplique 20260930130500_contrato_recorrente_ativo.sql antes desta migration.';
  end if;
end $$;

alter table public.agendamentos
  add column if not exists excecoes        jsonb not null default '{}'::jsonb,
  add column if not exists ordem_servico_id text;

comment on column public.agendamentos.excecoes is
  'Exceções por ocorrência da série: {"YYYY-MM-DD": {cancelada?, inicio?, fim?, status?, titulo?, observacao?, responsavelId?, responsavelNome?}}. Chave = dia original (Brasília).';
comment on column public.agendamentos.ordem_servico_id is
  'OS desta visita (ordens_servico.id). OS concluída → visita concluída (trigger agendamentos_concluir_pela_os).';

alter table public.agendamentos drop constraint if exists agendamentos_excecoes_ck;
alter table public.agendamentos add constraint agendamentos_excecoes_ck
  check (jsonb_typeof(excecoes) = 'object');

create index if not exists agendamentos_ordem_servico_idx
  on public.agendamentos (ordem_servico_id) where ordem_servico_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- OS concluída → visita ligada concluída
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.concluir_visita_da_os()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'concluida' or new.excluido_em is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'concluida' then
    return new; -- já estava concluída: nada a propagar
  end if;

  update public.agendamentos a
     set status = 'concluido',
         atualizado_em = now()
   where a.user_id = new.user_id
     and a.excluido_em is null
     and a.status = 'agendado'
     and a.recorrencia is null
     and (
       a.ordem_servico_id = new.id
       or (new.id like 'os\_cv\_%' and a.id = 'ag_cv_' || substr(new.id, 7))
     );
  return new;
end;
$$;

revoke all on function public.concluir_visita_da_os() from public, anon, authenticated;

drop trigger if exists agendamentos_concluir_pela_os on public.ordens_servico;
create trigger agendamentos_concluir_pela_os
  after insert or update of status on public.ordens_servico
  for each row execute function public.concluir_visita_da_os();

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema='public' and table_name='agendamentos'
--      and column_name in ('excecoes','ordem_servico_id');                 -- 2 linhas
--   select tgname from pg_trigger where tgname = 'agendamentos_concluir_pela_os'; -- 1
--
-- A execução (CHECK do objeto, trigger concluindo a visita avulsa e a do contrato,
-- série intocada, outro tenant intocado) roda em Postgres embutido (PGlite) em
-- scripts/teste-agenda-excecoes.ts, a cada `npm test`.
-- ============================================================================
