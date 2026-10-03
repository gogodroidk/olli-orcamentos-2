-- ============================================================================
-- OLLI — CONFIRMAÇÃO DE VÉSPERA com 1 toque do cliente (Onda I3, jogada 5)
-- ----------------------------------------------------------------------------
-- O QUE MUDA
--   1) `agendamentos_confirmacao` — um link público por VISITA (ocorrência), com
--      token opaco e aleatório, que o cliente abre em /v/<token> (worker) e responde
--      [Confirmo] ou [Preciso remarcar]. Tabela SEPARADA de `agendamentos` de
--      propósito: o sync offline-first da agenda não muda nada, e uma visita sem
--      pedido de confirmação simplesmente não tem linha aqui (a verdade de hoje).
--      Chave natural: (dono, agendamento_id, ocorrencia_dia) — a ocorrência de uma
--      série recorrente é o dia ORIGINAL dela ('YYYY-MM-DD'), o mesmo formato das
--      exceções da série.
--
--   2) `pedir_confirmacao_visita(...)` — o ÚNICO jeito de criar/renovar a linha.
--      SECURITY DEFINER: confere a sessão, o tenant (dono ou equipe ativa, pela
--      mesma `donos_visiveis()` das outras tabelas) e o PLANO (recurso do Pro, pela
--      mesma `plano_comercial_para_usuario` da cota). Idempotente: pedir de novo
--      para a mesma visita no mesmo horário devolve o MESMO token; se o horário
--      mudou (remarcada), gera token novo e volta para 'pendente' — o link antigo
--      morre na hora e a resposta antiga não vale para o horário novo.
--
-- LGPD / O QUE A PÁGINA PÚBLICA VÊ
--   Só o dia, a hora e o nome curto do serviço (≤ 80 chars), mais a marca do
--   prestador. Nada de nome, endereço, telefone ou valor do cliente. O token é a
--   única credencial (64 hex = 2 UUID v4, ~244 bits de acaso do CSPRNG do banco) e
--   EXPIRA 2 h depois do início da visita.
--
-- QUEM ESCREVE O QUÊ
--   - authenticated: NÃO insere/altera/apaga direto; cria pelo RPC e LÊ o status
--     (RLS por tenant). O token não é coluna legível pelo SELECT: só volta do RPC
--     para quem pediu (e quem pode pedir já pode gerar o link de novo).
--   - service_role (worker /v/<token>): lê pelo token e grava a resposta.
--   - anon: nada.
--
-- ORDEM DE PUBLICAÇÃO: aplicar ANTES (ou junto) do worker/APK novos. Sem ela:
--   - o app mostra "Confirmação de véspera ainda não disponível nesta conta" (nunca
--     "nenhuma confirmada") e a fila segue mandando só a mensagem, sem o link;
--   - o worker responde "link inválido" para qualquer /v/<token>.
--
-- IDEMPOTENTE: create table/index if not exists; policies recriadas por nome;
--   função create or replace. SEGREDOS: zero.
-- ============================================================================

begin;

create table if not exists public.agendamentos_confirmacao (
  id              uuid primary key default gen_random_uuid(),
  -- Dono da AGENDA (o tenant), não quem tocou no botão: técnico da equipe pede em
  -- nome do dono, igual às visitas que ele cria.
  user_id         uuid not null references auth.users (id) on delete cascade,
  agendamento_id  text not null check (char_length(agendamento_id) between 1 and 200),
  ocorrencia_dia  date not null,
  inicio          timestamptz not null,
  servico         text check (servico is null or char_length(servico) <= 80),
  token           text not null unique check (token ~ '^[a-f0-9]{64}$'),
  status          text not null default 'pendente' check (status in ('pendente', 'confirmada', 'remarcar')),
  respondido_em   timestamptz,
  expira_em       timestamptz not null,
  revogado_em     timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- 'pendente' ⇔ ainda sem resposta: nunca um "confirmada" sem hora de resposta.
  constraint agendamentos_confirmacao_resposta_ck
    check ((status = 'pendente') = (respondido_em is null)),
  constraint agendamentos_confirmacao_visita_uq
    unique (user_id, agendamento_id, ocorrencia_dia)
);

comment on table public.agendamentos_confirmacao is
  'Link público /v/<token> de confirmação de véspera por visita (ocorrência). Cria pelo RPC pedir_confirmacao_visita; o worker grava a resposta.';

-- Leitura do app: "as confirmações dos próximos dias" do tenant.
create index if not exists agendamentos_confirmacao_dia_idx
  on public.agendamentos_confirmacao (user_id, ocorrencia_dia);

alter table public.agendamentos_confirmacao enable row level security;

revoke all on table public.agendamentos_confirmacao from anon, public;
revoke all on table public.agendamentos_confirmacao from authenticated;
-- SELECT por coluna: o token fica de fora (volta só do RPC).
grant select (id, user_id, agendamento_id, ocorrencia_dia, inicio, servico, status,
              respondido_em, expira_em, revogado_em, criado_em, atualizado_em)
  on table public.agendamentos_confirmacao to authenticated;

do $$
declare
  tem_dv boolean := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
  expr text;
begin
  expr := case when tem_dv
               then 'user_id in (select public.donos_visiveis())'
               else 'user_id = (select auth.uid())' end;
  execute 'drop policy if exists agendamentos_confirmacao_select on public.agendamentos_confirmacao';
  execute format(
    'create policy agendamentos_confirmacao_select on public.agendamentos_confirmacao as permissive for select to authenticated using (%s)',
    expr
  );
  -- Sem INSERT/UPDATE/DELETE para authenticated: cria pelo RPC; responde pelo worker.
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: pedir (ou renovar) a confirmação de UMA visita
-- ────────────────────────────────────────────────────────────────────────────
-- Devolve jsonb { token, status, expira_em, respondido_em }. Erros com mensagem
-- estável para o app traduzir: sem_sessao, dados_incompletos, sem_acesso,
-- visita_passada, visita_distante, recurso_pro.
create or replace function public.pedir_confirmacao_visita(
  p_dono           uuid,
  p_agendamento_id text,
  p_dia            date,
  p_inicio         timestamptz,
  p_servico        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_servico text := nullif(btrim(left(coalesce(p_servico, ''), 80)), '');
  v_expira  timestamptz;
  v_plano   text;
  v_tem_dv  boolean;
  v_linha   public.agendamentos_confirmacao%rowtype;
  v_token   text;
begin
  if v_uid is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;
  if p_dono is null or p_agendamento_id is null or btrim(p_agendamento_id) = ''
     or char_length(p_agendamento_id) > 200 or p_dia is null or p_inicio is null then
    raise exception 'dados_incompletos' using errcode = '22023';
  end if;

  -- Tenant: o próprio dono ou um dono visível (equipe ativa).
  v_tem_dv := exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'donos_visiveis'
  );
  if p_dono <> v_uid then
    if not v_tem_dv then
      raise exception 'sem_acesso' using errcode = '42501';
    end if;
    if not exists (select 1 from public.donos_visiveis() d where d = p_dono) then
      raise exception 'sem_acesso' using errcode = '42501';
    end if;
  end if;

  -- Janela honesta: não pede confirmação de visita que já passou nem de uma que
  -- está a meses de distância (o link ficaria vivo tempo demais).
  if p_inicio < now() - interval '1 hour' then
    raise exception 'visita_passada' using errcode = '22023';
  end if;
  if p_inicio > now() + interval '60 days' then
    raise exception 'visita_distante' using errcode = '22023';
  end if;

  -- Recurso do Pro, decidido NO SERVIDOR (o app também mostra o muro, mas o muro
  -- da tela não é a regra).
  v_plano := public.plano_comercial_para_usuario(p_dono);
  if v_plano is null or v_plano not in ('pro', 'empresa') then
    raise exception 'recurso_pro' using errcode = '42501';
  end if;

  v_expira := p_inicio + interval '2 hours';

  select * into v_linha
    from public.agendamentos_confirmacao c
   where c.user_id = p_dono and c.agendamento_id = p_agendamento_id and c.ocorrencia_dia = p_dia
   for update;

  if found and v_linha.revogado_em is null and v_linha.inicio = p_inicio then
    -- Mesmo horário: reaproveita o link (reenviar não invalida o que o cliente já tem).
    update public.agendamentos_confirmacao c
       set servico = coalesce(v_servico, c.servico),
           expira_em = v_expira,
           atualizado_em = now()
     where c.id = v_linha.id
     returning * into v_linha;
  else
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    if found then
      -- Horário mudou (ou link revogado): token novo, resposta antiga descartada.
      update public.agendamentos_confirmacao c
         set token = v_token,
             inicio = p_inicio,
             servico = v_servico,
             status = 'pendente',
             respondido_em = null,
             revogado_em = null,
             expira_em = v_expira,
             atualizado_em = now()
       where c.id = v_linha.id
       returning * into v_linha;
    else
      insert into public.agendamentos_confirmacao
        (user_id, agendamento_id, ocorrencia_dia, inicio, servico, token, expira_em)
      values
        (p_dono, p_agendamento_id, p_dia, p_inicio, v_servico, v_token, v_expira)
      returning * into v_linha;
    end if;
  end if;

  return jsonb_build_object(
    'token', v_linha.token,
    'status', v_linha.status,
    'expira_em', v_linha.expira_em,
    'respondido_em', v_linha.respondido_em
  );
end;
$$;

revoke all on function public.pedir_confirmacao_visita(uuid, text, date, timestamptz, text) from public, anon;
grant execute on function public.pedir_confirmacao_visita(uuid, text, date, timestamptz, text) to authenticated;

commit;

-- ============================================================================
-- CONFERÊNCIA (depois de aplicar):
--   select relrowsecurity from pg_class where relname = 'agendamentos_confirmacao'; -- t
--   select has_column_privilege('authenticated', 'public.agendamentos_confirmacao', 'token', 'select'); -- f
--
-- A execução (idempotência, RLS por tenant, token fora do SELECT, mesmo token no
-- reenvio, token novo quando o horário muda, recusa sem Pro/sem acesso/visita
-- passada) roda em Postgres embutido (PGlite) em
-- scripts/teste-vespera-garantia-sql.ts, a cada `npm test`.
-- ============================================================================
