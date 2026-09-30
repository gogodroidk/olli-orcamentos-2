-- ============================================================================
-- OLLI — Motor de CONTRATO RECORRENTE POR ATIVO (Onda D, ação 6 do plano-mestre)
-- ----------------------------------------------------------------------------
-- A resposta à sazonalidade: o prestador fecha "manutenção mensal da piscina do
-- condomínio" (ou do split, da caixa d'água, do jardim) UMA vez e o OLLI gera sozinho
-- cada visita — ordem de serviço + agendamento com técnico responsável — sem duplicar.
-- O PMOC vira um caso particular: mesmo vocabulário de periodicidade
-- (mensal/bimestral/trimestral/semestral/anual) e o plano PMOC continua ligado ao
-- contrato por `pmoc_plans.contract_id` (fundação 20260709).
--
-- O QUE MUDA
--   1) `service_contracts` (fundação PMOC, 0 linhas em 30/09) ganha o lado
--      RECORRENTE: periodicidade, horário, ativos atendidos, atividades por visita,
--      valor (por mês ou por visita), técnico responsável, endereço e lixeira.
--      Escrita passa a ser só da GESTÃO (dono/admin/gestor): contrato é dinheiro.
--   2) `contrato_visitas` (nova): o LIVRO-CAIXA da geração. A chave única
--      (tenant, contrato, mês) é o que torna a geração segura de repetir no celular,
--      no painel e no cron ao mesmo tempo. `ordem_criada_em` separa a reserva
--      CONFIRMADA (nunca reconstruída — se o prestador apagou a OS, foi decisão dele)
--      da reserva ÓRFÃ (o app caiu entre reservar e construir; a próxima execução
--      reconstrói com os mesmos ids).
--   3) `agendamentos` ganha técnico responsável (visão por técnico), regra de
--      recorrência (as ocorrências são projetadas pela agenda, não viram linhas) e
--      o vínculo com o contrato.
--
-- DINHEIRO: o OLLI não intermedeia. `valor` é o que o PRESTADOR cobra do cliente dele;
--   a cobrança sai pelo WhatsApp com o Pix do próprio prestador (mesma regra do
--   "cobrar com 1 toque"). Nenhuma coluna aqui representa pagamento recebido.
--
-- LEGAL: nada aqui declara conformidade com norma. `situacao` é OPERACIONAL.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do deploy do painel/worker e antes do
--   APK novo. Sem ela, a tela de contratos mostra "recurso ainda não ativado" (a
--   leitura de `periodicidade` falha com coluna inexistente) e o cron fica desligado.
--
-- IDEMPOTENTE: add column if not exists; constraints e policies recriadas por nome.
-- SEGREDOS: zero.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) service_contracts — o lado recorrente do contrato
-- ────────────────────────────────────────────────────────────────────────────
alter table public.service_contracts
  add column if not exists cliente_nome     text,
  add column if not exists endereco         text,
  add column if not exists periodicidade    text,
  add column if not exists horario_visita   text not null default '08:00',
  add column if not exists ativos           jsonb not null default '[]'::jsonb,
  add column if not exists atividades       jsonb not null default '[]'::jsonb,
  add column if not exists modo_cobranca    text not null default 'mensal',
  add column if not exists valor            numeric(12, 2) not null default 0,
  add column if not exists responsavel_id   uuid,
  add column if not exists responsavel_nome text,
  add column if not exists observacoes      text,
  add column if not exists excluido_em      timestamptz;

comment on column public.service_contracts.periodicidade is
  'Ciclo das visitas (mesmo vocabulário do PMOC). Nulo = contrato sem visitas recorrentes (cabeçalho jurídico antigo).';
comment on column public.service_contracts.ativos is
  'Ativos atendidos: [{id, nome, assetId?}] — assetId aponta para assets.id quando é equipamento do inventário.';
comment on column public.service_contracts.valor is
  'Quanto o PRESTADOR cobra do cliente dele (por mês ou por visita, ver modo_cobranca). O OLLI não recebe esse dinheiro.';

alter table public.service_contracts drop constraint if exists service_contracts_periodicidade_ck;
alter table public.service_contracts add constraint service_contracts_periodicidade_ck
  check (periodicidade is null or periodicidade in ('mensal', 'bimestral', 'trimestral', 'semestral', 'anual'));

alter table public.service_contracts drop constraint if exists service_contracts_horario_visita_ck;
alter table public.service_contracts add constraint service_contracts_horario_visita_ck
  check (horario_visita ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.service_contracts drop constraint if exists service_contracts_modo_cobranca_ck;
alter table public.service_contracts add constraint service_contracts_modo_cobranca_ck
  check (modo_cobranca in ('mensal', 'por_visita'));

alter table public.service_contracts drop constraint if exists service_contracts_valor_ck;
alter table public.service_contracts add constraint service_contracts_valor_ck
  check (valor >= 0);

alter table public.service_contracts drop constraint if exists service_contracts_listas_ck;
alter table public.service_contracts add constraint service_contracts_listas_ck
  check (jsonb_typeof(ativos) = 'array' and jsonb_typeof(atividades) = 'array');

alter table public.service_contracts drop constraint if exists service_contracts_vigencia_ck;
alter table public.service_contracts add constraint service_contracts_vigencia_ck
  check (data_fim is null or data_inicio is null or data_fim >= data_inicio);

-- Contrato que gera visita precisa de início (o dia vira a âncora do cronograma).
alter table public.service_contracts drop constraint if exists service_contracts_recorrente_inicio_ck;
alter table public.service_contracts add constraint service_contracts_recorrente_inicio_ck
  check (periodicidade is null or data_inicio is not null);

create index if not exists service_contracts_ativos_idx
  on public.service_contracts (user_id) where excluido_em is null;

-- Escrita só da GESTÃO. Leitura continua da equipe (o técnico vê de onde veio a
-- visita). DELETE já era gestão desde 20260911135510.
drop policy if exists service_contracts_insert on public.service_contracts;
create policy service_contracts_insert on public.service_contracts
  as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.organizacoes o
         where o.owner_user_id = service_contracts.user_id
           and public.eh_gestao(o.id)
      )
      and criado_por = (select auth.uid())
    )
  );

drop policy if exists service_contracts_update on public.service_contracts;
create policy service_contracts_update on public.service_contracts
  as permissive for update to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacoes o
       where o.owner_user_id = service_contracts.user_id
         and public.eh_gestao(o.id)
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacoes o
       where o.owner_user_id = service_contracts.user_id
         and public.eh_gestao(o.id)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2) contrato_visitas — livro-caixa da geração (idempotência mora AQUI)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.contrato_visitas (
  id               text primary key,          -- 'cv_<contrato>_<YYYY-MM>' (determinístico)
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_por       uuid default auth.uid(),
  contrato_id      text not null references public.service_contracts (id) on delete cascade,
  periodo          text not null,             -- mês da visita, 'YYYY-MM'
  data_prevista    date not null,             -- dia da visita no fuso do Brasil
  ordem_id         text not null,             -- ordens_servico.id ('os_cv_…')
  agendamento_id   text,                      -- agendamentos.id ('ag_cv_…')
  ordem_criada_em  timestamptz,               -- null = reserva ÓRFÃ (reconstruir)
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  excluido_em      timestamptz,
  constraint contrato_visitas_periodo_ck check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

comment on table public.contrato_visitas is
  'Uma linha por visita gerada de um contrato recorrente. A chave (user_id, contrato_id, periodo) impede visita dupla entre aparelhos.';

-- A CHAVE. user_id entra porque o isolamento é por tenant (mesma escolha de
-- pmoc_ordens_geradas_tenant_unica).
create unique index if not exists contrato_visitas_tenant_unica
  on public.contrato_visitas (user_id, contrato_id, periodo);
-- A visita só aponta para contrato do MESMO tenant. Sem isto, qualquer conta logada
-- que soubesse o id de um contrato (um técnico da equipe, um ex-membro) gravaria no
-- PRÓPRIO tenant (`user_id = auth.uid()` passa na policy) a reserva
-- 'cv_<contrato>_<mês>' — o id é global e determinístico —, e o gerador do dono veria
-- a colisão como "outro gerador já reservou": a visita daquele mês nunca nasceria.
-- A FK composta vale também para o service_role (cron), que ignora RLS.
create unique index if not exists service_contracts_id_user_unica
  on public.service_contracts (id, user_id);
alter table public.contrato_visitas drop constraint if exists contrato_visitas_contrato_mesmo_tenant_fk;
alter table public.contrato_visitas add constraint contrato_visitas_contrato_mesmo_tenant_fk
  foreign key (contrato_id, user_id) references public.service_contracts (id, user_id) on delete cascade;

create index if not exists contrato_visitas_contrato_idx on public.contrato_visitas (contrato_id, periodo);
create index if not exists contrato_visitas_ordem_idx on public.contrato_visitas (ordem_id);
create index if not exists contrato_visitas_ativos_idx
  on public.contrato_visitas (user_id) where excluido_em is null;

alter table public.contrato_visitas enable row level security;

revoke all on table public.contrato_visitas from public, anon;
grant select, insert, update, delete on table public.contrato_visitas to authenticated;
grant all on table public.contrato_visitas to service_role;

drop trigger if exists contrato_visitas_user_id_imutavel on public.contrato_visitas;
create trigger contrato_visitas_user_id_imutavel
  before update on public.contrato_visitas
  for each row execute function public.bloquear_troca_user_id();

-- Leitura: a equipe inteira (o técnico vê que a OS veio de um contrato).
drop policy if exists contrato_visitas_select on public.contrato_visitas;
create policy contrato_visitas_select on public.contrato_visitas
  as permissive for select to authenticated
  using (user_id in (select public.donos_visiveis()));

-- Escrita: só gestão (quem gera visitas é dono/admin/gestor ou o cron com service_role).
drop policy if exists contrato_visitas_insert on public.contrato_visitas;
create policy contrato_visitas_insert on public.contrato_visitas
  as permissive for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (
      exists (
        select 1 from public.organizacoes o
         where o.owner_user_id = contrato_visitas.user_id
           and public.eh_gestao(o.id)
      )
      and criado_por = (select auth.uid())
    )
  );

drop policy if exists contrato_visitas_update on public.contrato_visitas;
create policy contrato_visitas_update on public.contrato_visitas
  as permissive for update to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacoes o
       where o.owner_user_id = contrato_visitas.user_id
         and public.eh_gestao(o.id)
    )
  )
  with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacoes o
       where o.owner_user_id = contrato_visitas.user_id
         and public.eh_gestao(o.id)
    )
  );

drop policy if exists contrato_visitas_delete_gestao on public.contrato_visitas;
create policy contrato_visitas_delete_gestao on public.contrato_visitas
  as permissive for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.organizacoes o
       where o.owner_user_id = contrato_visitas.user_id
         and public.eh_gestao(o.id)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3) agendamentos — técnico responsável, recorrência e vínculo com o contrato
-- ────────────────────────────────────────────────────────────────────────────
alter table public.agendamentos
  add column if not exists responsavel_id   uuid,
  add column if not exists responsavel_nome text,
  add column if not exists recorrencia      text,
  add column if not exists recorrencia_ate  date,
  add column if not exists contrato_id      text;

comment on column public.agendamentos.responsavel_id is
  'Técnico da equipe que vai à visita (auth user id). Nulo = sem responsável.';
comment on column public.agendamentos.recorrencia is
  'Regra de repetição. As ocorrências futuras são PROJETADAS pela agenda; não viram linhas.';

alter table public.agendamentos drop constraint if exists agendamentos_recorrencia_ck;
alter table public.agendamentos add constraint agendamentos_recorrencia_ck
  check (recorrencia is null or recorrencia in
    ('semanal', 'quinzenal', 'mensal', 'bimestral', 'trimestral', 'semestral', 'anual'));

create index if not exists agendamentos_responsavel_idx
  on public.agendamentos (user_id, responsavel_id, inicio) where excluido_em is null;
create index if not exists agendamentos_contrato_idx
  on public.agendamentos (contrato_id) where contrato_id is not null;

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar, como service_role):
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='service_contracts'
--      and column_name in ('periodicidade','ativos','valor','responsavel_id','excluido_em');  -- 5 linhas
--   select count(*) from pg_policies where tablename='contrato_visitas';                  -- 4
--   select indexdef from pg_indexes where indexname='contrato_visitas_tenant_unica';      -- (user_id, contrato_id, periodo)
--   select column_name from information_schema.columns
--    where table_name='agendamentos' and column_name in ('responsavel_id','recorrencia','contrato_id'); -- 3
--
-- A execução (CHECKs, chave única, isolamento entre tenants, técnico sem escrita,
-- gestor escrevendo no tenant do dono) roda em Postgres embutido (PGlite) em
-- scripts/teste-contrato-recorrente-sql.ts, a cada `npm test`.
-- ============================================================================
