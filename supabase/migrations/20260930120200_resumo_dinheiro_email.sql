-- OLLI Orçamentos — RESUMO DIÁRIO "DINHEIRO PARADO" por e-mail (hábito das 7h).
--
-- O que é: um e-mail curto, entre 7h e 8h de Brasília, dizendo quanto o prestador
-- tem a receber (orçamento ganho com saldo), quantas propostas estão paradas há 3
-- dias ou mais e quantos clientes já atendidos sumiram há 150 dias ou mais — com
-- um botão para o painel. A CONTA é feita no Worker, em JS, com a MESMA função do
-- painel (`src/services/radarDinheiro.ts`); o banco só entrega as linhas mínimas e
-- reconfere, sob trava, o que não pode falhar nem com dois Workers em paralelo.
--
-- Mesmo desenho do lembrete de assinatura (20260929200000), sem exceção:
--   * modelo fechado no catálogo da outbox, parâmetros mínimos em `template_dados`
--     (só números e a data — nunca nome de cliente, telefone, HTML ou segredo, ≤ 1 KB);
--   * idempotência por conta + dia de Brasília (`resumo:dinheiro:<conta>:<AAAA-MM-DD>`);
--   * supressão respeitada (hard bounce/reclamação sempre bloqueiam; descadastro de
--     lembretes também, até a pessoa religar o resumo DEPOIS dele — ver §3);
--   * link de descadastro assinado no corpo e no List-Unsubscribe (escopo próprio,
--     `resumo`, que desliga só o resumo);
--   * tetos: 1 por dia, no máximo N por 7 dias (padrão 3), intervalo mínimo entre
--     dois resumos e teto diário global — todos passados pelo Worker e conferidos aqui.
--
-- CONSENTIMENTO (LGPD) — decisão: OPT-OUT para quem já trabalha no OLLI.
--   Base: legítimo interesse (LGPD art. 7º, IX) — é um aviso sobre os PRÓPRIOS dados
--   de trabalho da conta (orçamentos que ela mesma aprovou), não marketing de terceiro.
--   Freios que tornam o opt-out prudente (inclusive para a reputação do domínio):
--     1. só sai quando há algo acionável — conta sem nada parado nunca recebe;
--     2. só para quem é dono da conta/empresa (membro de equipe alheia não recebe);
--     3. no máximo 3 por semana no início, nunca no domingo, nunca 2 no mesmo dia;
--     4. "Parar de receber o resumo" em todo e-mail (1 clique, RFC 8058) e o botão
--        "Receber resumo diário por e-mail" no app e no painel;
--     5. quem já pediu para parar de receber lembretes NÃO recebe o resumo por padrão.
--   Contas novas sem orçamento nunca entram (não há o que resumir).
--
-- Desligar sem deploy:
--   update private.email_dispatch_config set dispatch_scope = 'hold' where canal = 'resumo_dinheiro';
--   (linhas novas nascem presas; nada sai) — e/ou EMAIL_RESUMO_MODE="off" no Worker.

-- ─── 1. Catálogo da outbox: + resumo_dinheiro ───────────────────────────────

alter table public.email_outbox drop constraint if exists email_outbox_template_catalogo_check;
alter table public.email_outbox
  add constraint email_outbox_template_catalogo_check
  check (
    (template, template_version, purpose) in (
      ('boas_vindas', 'boas_vindas.v1', 'account_onboarding'),
      ('lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder'),
      ('lembrete_assinatura', 'lembrete_assinatura.v1', 'billing_reminder'),
      ('resumo_dinheiro', 'resumo_dinheiro.v1', 'money_digest')
    )
  );

create index if not exists email_outbox_purpose_created_idx
  on public.email_outbox (purpose, created_at desc);

-- ─── 2. Canal próprio de dispatch (dá para prender só o resumo) ─────────────

alter table private.email_dispatch_config drop constraint if exists email_dispatch_config_canal_check;
alter table private.email_dispatch_config
  add constraint email_dispatch_config_canal_check
  check (canal in ('boas_vindas', 'lembretes', 'resumo_dinheiro'));

insert into private.email_dispatch_config (canal, dispatch_scope)
values ('resumo_dinheiro', 'production')
on conflict (canal) do nothing;

create or replace function private.email_outbox_scope_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text;
begin
  if new.dispatch_scope is distinct from 'hold' then
    return new;
  end if;
  select c.dispatch_scope
    into v_scope
  from private.email_dispatch_config c
  where c.canal = case
    when new.template = 'boas_vindas' then 'boas_vindas'
    when new.template = 'resumo_dinheiro' then 'resumo_dinheiro'
    else 'lembretes'
  end;
  new.dispatch_scope := coalesce(v_scope, 'hold');
  return new;
end;
$$;

revoke all on function private.email_outbox_scope_inicial()
  from public, anon, authenticated, service_role;

-- ─── 3. Preferência por conta ───────────────────────────────────────────────
--
-- Sem linha = padrão (ligado, salvo descadastro de lembretes). A linha guarda a
-- ÚLTIMA palavra da pessoa e de onde ela veio. Escrita só por RPC.

create table if not exists public.email_preferencias (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  resumo_dinheiro  boolean not null,
  origem           text not null check (origem in ('app', 'painel', 'link_email', 'one_click')),
  atualizado_em    timestamptz not null default pg_catalog.now()
);

alter table public.email_preferencias enable row level security;
alter table public.email_preferencias force row level security;
revoke all on table public.email_preferencias from public, anon, authenticated;
grant select on table public.email_preferencias to authenticated;
grant select, insert, update, delete on table public.email_preferencias to service_role;

drop policy if exists email_preferencias_propria on public.email_preferencias;
create policy email_preferencias_propria
  on public.email_preferencias
  as permissive for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.email_preferencias is
  'Preferências de e-mail por conta (resumo diário do dinheiro parado). Só user_id, sem endereço.';

-- Estado EFETIVO do resumo para uma conta. Regra única, usada pela tela, pela
-- seleção e pelo enqueue:
--   hard_bounce/complaint → desligado, sempre;
--   linha de preferência  → vale ela, MAS um descadastro de lembretes mais novo que
--                           um "ligar" vence (a última palavra da pessoa);
--   sem linha             → ligado, a menos que exista descadastro de lembretes;
--   só o dono da conta/empresa é elegível (membro de equipe alheia não recebe).
create or replace function private.resumo_dinheiro_estado(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pref        public.email_preferencias;
  v_bloqueio    text;
  v_descad_em   timestamptz;
  v_orgs_dono   bigint;
  v_membro      bigint;
  v_ativo       boolean;
begin
  select s.motivo
    into v_bloqueio
  from public.email_supressoes s
  where s.user_id = p_user_id and s.motivo in ('hard_bounce', 'complaint')
  order by s.criado_em desc
  limit 1;

  select s.criado_em
    into v_descad_em
  from public.email_supressoes s
  where s.user_id = p_user_id and s.motivo = 'descadastro';

  select * into v_pref from public.email_preferencias p where p.user_id = p_user_id;

  select pg_catalog.count(*) into v_orgs_dono from public.organizacoes o where o.owner_user_id = p_user_id;
  select pg_catalog.count(*) into v_membro
  from public.organizacao_membros m where m.user_id = p_user_id and m.ativo;

  if v_bloqueio is not null then
    v_ativo := false;
  elsif v_pref.user_id is not null then
    v_ativo := v_pref.resumo_dinheiro
      and (v_descad_em is null or v_descad_em < v_pref.atualizado_em);
    if v_pref.resumo_dinheiro and not v_ativo then
      v_bloqueio := 'descadastro';
    end if;
  else
    v_ativo := v_descad_em is null;
    if not v_ativo then
      v_bloqueio := 'descadastro';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ativo', v_ativo,
    'padrao', v_pref.user_id is null,
    'bloqueio', v_bloqueio,
    'elegivel', (v_orgs_dono >= 1 or v_membro = 0)
  );
end;
$$;

revoke all on function private.resumo_dinheiro_estado(uuid)
  from public, anon, authenticated, service_role;

-- Tela (app e painel): lê o próprio estado.
create or replace function public.meu_resumo_dinheiro_email()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem_sessao';
  end if;
  return private.resumo_dinheiro_estado(v_uid);
end;
$$;

revoke all on function public.meu_resumo_dinheiro_email() from public, anon;
grant execute on function public.meu_resumo_dinheiro_email() to authenticated;

-- Grava a preferência e, ao desligar, cancela o resumo ainda não enviado.
create or replace function private.gravar_resumo_dinheiro(p_user_id uuid, p_ativo boolean, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_preferencias (user_id, resumo_dinheiro, origem, atualizado_em)
  values (p_user_id, p_ativo, p_origem, pg_catalog.clock_timestamp())
  on conflict (user_id) do update
    set resumo_dinheiro = excluded.resumo_dinheiro,
        origem = excluded.origem,
        atualizado_em = excluded.atualizado_em;

  if not p_ativo then
    update public.email_outbox o
       set status = 'dead_letter',
           error_code = 'suprimido_antes_do_envio',
           next_attempt_at = null,
           updated_at = pg_catalog.now()
     where o.user_id = p_user_id
       and o.template = 'resumo_dinheiro'
       and o.status in ('pending', 'failed');
  end if;
end;
$$;

revoke all on function private.gravar_resumo_dinheiro(uuid, boolean, text)
  from public, anon, authenticated, service_role;

-- Tela (app e painel): liga/desliga o próprio resumo.
create or replace function public.definir_resumo_dinheiro_email(p_ativo boolean, p_origem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem_sessao';
  end if;
  if p_ativo is null or p_origem is null or p_origem not in ('app', 'painel') then
    raise exception 'resumo_argumentos_invalidos';
  end if;
  perform private.gravar_resumo_dinheiro(v_uid, p_ativo, p_origem);
  return private.resumo_dinheiro_estado(v_uid);
end;
$$;

revoke all on function public.definir_resumo_dinheiro_email(boolean, text) from public, anon;
grant execute on function public.definir_resumo_dinheiro_email(boolean, text) to authenticated;

-- Link "Parar de receber o resumo" (rota assinada do Worker): só DESLIGA.
create or replace function public.desligar_resumo_dinheiro_email_servico(p_user_id uuid, p_origem text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_origem is null or p_origem not in ('link_email', 'one_click') then
    raise exception 'resumo_argumentos_invalidos';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return pg_catalog.jsonb_build_object('registrado', false);
  end if;
  perform private.gravar_resumo_dinheiro(p_user_id, false, p_origem);
  return pg_catalog.jsonb_build_object('registrado', true);
end;
$$;

revoke all on function public.desligar_resumo_dinheiro_email_servico(uuid, text)
  from public, anon, authenticated;
grant execute on function public.desligar_resumo_dinheiro_email_servico(uuid, text)
  to service_role;

-- Descadastro de lembretes REPETIDO também é a última palavra da pessoa.
--
-- `resumo_dinheiro_estado` compara a data do descadastro com a do "ligar o resumo".
-- Na 20260929200000, `registrar_supressao_email` grava com `on conflict do nothing`:
-- quem descadastrou (T1), religou o resumo no app (T2) e clicou de novo em "Parar de
-- receber lembretes" num e-mail antigo (T3) ficava com o descadastro em T1 < T2 — a
-- página dizia "você deixará de receber … o resumo diário" e o resumo continuava
-- saindo. Aqui o descadastro renova a data a cada pedido (bounce/reclamação seguem
-- como estavam: bloqueiam tudo de qualquer jeito). Mesmo corpo da função original,
-- só muda o `on conflict`.
create or replace function public.registrar_supressao_email(
  p_user_id uuid,
  p_motivo  text,
  p_origem  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelados bigint := 0;
begin
  if p_user_id is null
     or p_motivo is null or p_motivo not in ('descadastro', 'hard_bounce', 'complaint')
     or p_origem is null or p_origem not in ('link_email', 'one_click', 'resend_webhook')
  then
    raise exception 'supressao_argumentos_invalidos';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return pg_catalog.jsonb_build_object('registrado', false, 'cancelados', 0);
  end if;

  insert into public.email_supressoes (user_id, motivo, origem, criado_em)
  values (p_user_id, p_motivo, p_origem, pg_catalog.clock_timestamp())
  on conflict (user_id, motivo) do update
    set criado_em = excluded.criado_em,
        origem = excluded.origem
    where public.email_supressoes.motivo = 'descadastro';

  -- Descadastro cancela só lembretes (e o resumo); bounce/reclamação cancelam tudo.
  update public.email_outbox o
     set status = 'dead_letter',
         error_code = 'suprimido_antes_do_envio',
         next_attempt_at = null,
         updated_at = pg_catalog.now()
   where o.user_id = p_user_id
     and o.status in ('pending', 'failed')
     and (p_motivo <> 'descadastro' or o.template <> 'boas_vindas');
  get diagnostics v_cancelados = row_count;

  return pg_catalog.jsonb_build_object('registrado', true, 'cancelados', v_cancelados);
end;
$$;

revoke all on function public.registrar_supressao_email(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_supressao_email(uuid, text, text)
  to service_role;

-- ─── 4. Candidatos (pré-filtro barato; a conta é do Worker) ─────────────────
--
-- Devolve só ids. Fora: conta indisponível, resumo desligado/bloqueado, quem não é
-- dono, quem já recebeu hoje (dia de Brasília), quem bateu o teto semanal ou o
-- intervalo mínimo, e quem não tem NENHUMA linha que algum radar leia.
--
-- RODADAS: a janela das 7h tem `p_rodadas` rodadas (o Worker roda uma a cada 10 min)
-- e cada conta cai em UMA delas por dia (hash de conta + dia). Assim cada rodada
-- avalia um pedaço fixo — uma conta sem nada acionável não é reavaliada a cada rodada
-- tomando o lugar das outras — e o sorteio muda de um dia para o outro.
-- Dentro da rodada, quem recebeu há mais tempo vem primeiro.

create or replace function public.listar_candidatos_resumo_dinheiro(
  p_now                 timestamptz default pg_catalog.now(),
  p_max_semana          integer default 3,
  p_intervalo_min_horas integer default 44,
  p_rodada              integer default 0,
  p_rodadas             integer default 1,
  p_limit               integer default 50
)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_dia text;
begin
  if p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 day'
     or p_max_semana is null or p_max_semana < 1 or p_max_semana > 7
     or p_intervalo_min_horas is null or p_intervalo_min_horas < 20 or p_intervalo_min_horas > 168
     or p_rodadas is null or p_rodadas < 1 or p_rodadas > 12
     or p_rodada is null or p_rodada < 0 or p_rodada >= p_rodadas
     or p_limit is null or p_limit < 1 or p_limit > 200
  then
    raise exception 'resumo_candidatos_argumentos_invalidos';
  end if;

  v_dia := pg_catalog.to_char(p_now at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  return query
  with usuarios as (
    select u.id
    from auth.users u
    where u.email is not null
      and pg_catalog.btrim(u.email) <> ''
      and u.email_confirmed_at is not null
      and u.email_confirmed_at <= p_now
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= p_now)
      and coalesce(u.is_anonymous, false) = false
      and not exists (
        select 1 from public.email_supressoes s
        where s.user_id = u.id and s.motivo in ('hard_bounce', 'complaint')
      )
  ), com_trabalho as (
    select us.id
    from usuarios us
    where exists (
        select 1 from public.orcamentos o
        where o.user_id = us.id
          and o.excluido_em is null
          and pg_catalog.lower(pg_catalog.btrim(o.status)) in (
            'aprovado', 'convertido', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura'
          )
      )
      or exists (
        select 1 from public.recibos r where r.user_id = us.id and r.excluido_em is null
      )
      or exists (
        select 1 from public.agendamentos a
        where a.user_id = us.id
          and a.excluido_em is null
          and pg_catalog.lower(pg_catalog.btrim(a.status)) = 'concluido'
      )
  ), historico as (
    select
      c.id,
      (
        select pg_catalog.count(*) from public.email_outbox o
        where o.user_id = c.id and o.purpose = 'money_digest'
          and o.created_at > p_now - interval '7 days'
      ) as na_semana,
      (
        select pg_catalog.max(o.created_at) from public.email_outbox o
        where o.user_id = c.id and o.purpose = 'money_digest'
      ) as ultimo
    from com_trabalho c
  )
  select h.id
  from historico h
  where (pg_catalog.hashtext(h.id::text || ':' || v_dia)::bigint % p_rodadas + p_rodadas) % p_rodadas = p_rodada
    and h.na_semana < p_max_semana
    and (h.ultimo is null or h.ultimo <= p_now - pg_catalog.make_interval(hours => p_intervalo_min_horas))
    and not exists (
      select 1 from public.email_outbox o
      where o.idempotency_key = 'resumo:dinheiro:' || h.id::text || ':' || v_dia
    )
    and (private.resumo_dinheiro_estado(h.id) ->> 'ativo')::boolean
    and (private.resumo_dinheiro_estado(h.id) ->> 'elegivel')::boolean
  order by h.ultimo asc nulls first, h.id
  limit p_limit;
end;
$$;

revoke all on function public.listar_candidatos_resumo_dinheiro(timestamptz, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.listar_candidatos_resumo_dinheiro(timestamptz, integer, integer, integer, integer, integer)
  to service_role;

-- ─── 5. As linhas de UMA conta (projeção mínima do que os radares leem) ─────
--
-- Mesmos filtros do painel (`useOlliList`: lixeira fora) e SÓ as colunas/campos do
-- blob que `src/services/radarDinheiro.ts` usa — nada de nome de cliente, telefone
-- ou endereço. Orçamentos com status que nenhum radar lê ficam fora (a comparação
-- é a mesma do JS: minúsculo, sem espaço). Acima do teto por tabela, `truncado`:
-- o Worker não manda número calculado em cima de meia lista.

create or replace function public.dados_resumo_dinheiro(
  p_user_id   uuid,
  p_max_linhas integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orc  jsonb;
  v_rec  jsonb;
  v_cli  jsonb;
  v_age  jsonb;
  v_os   jsonb;
  v_adi  jsonb;
  n_orc  bigint;
  n_rec  bigint;
  n_cli  bigint;
  n_age  bigint;
  n_os   bigint;
begin
  if p_user_id is null or p_max_linhas is null or p_max_linhas < 1 or p_max_linhas > 5000 then
    raise exception 'resumo_dados_argumentos_invalidos';
  end if;

  select pg_catalog.count(*),
         coalesce(pg_catalog.jsonb_agg(x.linha) filter (where x.n <= p_max_linhas), '[]'::jsonb)
    into n_orc, v_orc
  from (
    select
      pg_catalog.row_number() over (order by o.id) as n,
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'status', o.status,
        'cliente_id', o.cliente_id,
        'valor_total', o.valor_total,
        'subtotal', o.subtotal,
        'criado_em', o.criado_em,
        'atualizado_em', o.atualizado_em,
        'dados', pg_catalog.jsonb_build_object(
          'valorTotal', o.dados -> 'valorTotal',
          'subtotal', o.dados -> 'subtotal',
          'atualizadoEm', o.dados -> 'atualizadoEm',
          'criadoEm', o.dados -> 'criadoEm',
          'clienteId', o.dados -> 'clienteId'
        )
      ) as linha
    from public.orcamentos o
    where o.user_id = p_user_id
      and o.excluido_em is null
      and pg_catalog.lower(pg_catalog.btrim(o.status)) in (
        'aprovado', 'convertido', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura'
      )
  ) x;

  select pg_catalog.count(*),
         coalesce(pg_catalog.jsonb_agg(x.linha) filter (where x.n <= p_max_linhas), '[]'::jsonb)
    into n_rec, v_rec
  from (
    select
      pg_catalog.row_number() over (order by r.id) as n,
      pg_catalog.jsonb_build_object(
        'orcamento_id', r.orcamento_id,
        'cliente_id', r.cliente_id,
        'valor_recebido', r.valor_recebido,
        'criado_em', r.criado_em,
        'dados', pg_catalog.jsonb_build_object(
          'orcamentoId', r.dados -> 'orcamentoId',
          'valorRecebido', r.dados -> 'valorRecebido',
          'dataRecebimento', r.dados -> 'dataRecebimento',
          'clienteId', r.dados -> 'clienteId',
          'criadoEm', r.dados -> 'criadoEm'
        )
      ) as linha
    from public.recibos r
    where r.user_id = p_user_id and r.excluido_em is null
  ) x;

  select pg_catalog.count(*),
         coalesce(pg_catalog.jsonb_agg(x.id) filter (where x.n <= p_max_linhas), '[]'::jsonb)
    into n_cli, v_cli
  from (
    select c.id, pg_catalog.row_number() over (order by c.id) as n
    from public.clientes c
    where c.user_id = p_user_id and c.excluido_em is null
  ) x;

  select pg_catalog.count(*),
         coalesce(pg_catalog.jsonb_agg(x.linha) filter (where x.n <= p_max_linhas), '[]'::jsonb)
    into n_age, v_age
  from (
    select
      pg_catalog.row_number() over (order by a.id) as n,
      pg_catalog.jsonb_build_object('cliente_id', a.cliente_id, 'status', a.status, 'inicio', a.inicio, 'fim', a.fim) as linha
    from public.agendamentos a
    where a.user_id = p_user_id
      and a.excluido_em is null
      and pg_catalog.lower(pg_catalog.btrim(a.status)) = 'concluido'
  ) x;

  -- Igual ao painel: OS com status exatamente 'concluida' tira o orçamento do radar.
  select pg_catalog.count(*),
         coalesce(pg_catalog.jsonb_agg(x.orcamento_id) filter (where x.n <= p_max_linhas), '[]'::jsonb)
    into n_os, v_os
  from (
    select s.orcamento_id, pg_catalog.row_number() over (order by s.id) as n
    from public.ordens_servico s
    where s.user_id = p_user_id
      and s.excluido_em is null
      and s.status = 'concluida'
      and s.orcamento_id is not null
  ) x;

  select e.dados into v_adi
  from public.extras_sync e
  where e.user_id = p_user_id and e.chave = 'radar.snooze';

  return pg_catalog.jsonb_build_object(
    'orcamentos', v_orc,
    'recibos', v_rec,
    'clientes', v_cli,
    'agendamentos', v_age,
    'osConcluidas', v_os,
    'adiados', case when pg_catalog.jsonb_typeof(v_adi) = 'object' then v_adi else '{}'::jsonb end,
    'truncado', greatest(n_orc, n_rec, n_cli, n_age, n_os) > p_max_linhas
  );
end;
$$;

revoke all on function public.dados_resumo_dinheiro(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.dados_resumo_dinheiro(uuid, integer)
  to service_role;

-- ─── 6. Enfileirar UM resumo (tudo reconferido sob trava) ───────────────────

create or replace function public.enqueue_resumo_dinheiro_email(
  p_user_id             uuid,
  p_idempotency_key     text,
  p_template_dados      jsonb,
  p_max_semana          integer default 3,
  p_intervalo_min_horas integer default 44,
  p_teto_diario         integer default 100,
  p_now                 timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email   text;
  v_local   timestamp;
  v_dia     text;
  v_estado  jsonb;
  v_cent    bigint;
  v_itens   bigint;
  v_parados bigint;
  v_sumidos bigint;
begin
  if p_user_id is null
     or p_idempotency_key is null
     or p_template_dados is null
     or pg_catalog.jsonb_typeof(p_template_dados) <> 'object'
     or pg_catalog.pg_column_size(p_template_dados) > 1024
     or p_max_semana is null or p_max_semana < 1 or p_max_semana > 7
     or p_intervalo_min_horas is null or p_intervalo_min_horas < 20 or p_intervalo_min_horas > 168
     or p_teto_diario is null or p_teto_diario < 1 or p_teto_diario > 1000
     or p_now is null
     or p_now > pg_catalog.now() + interval '5 minutes'
     or p_now < pg_catalog.now() - interval '1 hour'
  then
    raise exception 'resumo_argumentos_invalidos';
  end if;

  -- Janela e dia no relógio de Brasília: 7h–8h, nunca domingo.
  v_local := p_now at time zone 'America/Sao_Paulo';
  v_dia := pg_catalog.to_char(v_local, 'YYYY-MM-DD');
  if pg_catalog.date_part('hour', v_local) <> 7 then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'fora_da_janela');
  end if;
  if pg_catalog.date_part('dow', v_local) = 0 then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'domingo');
  end if;

  -- A chave carrega a conta E o dia: não dá para gravar o resumo de A com a chave de B,
  -- nem o de hoje com a data de ontem.
  if p_idempotency_key <> 'resumo:dinheiro:' || p_user_id::text || ':' || v_dia
     or (p_template_dados ->> 'data') is distinct from v_dia
  then
    raise exception 'resumo_chave_divergente';
  end if;

  -- Só números inteiros não negativos; e só sai se houver algo acionável.
  begin
    v_cent := (p_template_dados ->> 'aReceberCentavos')::bigint;
    v_itens := (p_template_dados ->> 'aReceberItens')::bigint;
    v_parados := (p_template_dados ->> 'propostasParadas')::bigint;
    v_sumidos := (p_template_dados ->> 'clientesSumidos')::bigint;
  exception when others then
    raise exception 'resumo_dados_invalidos';
  end;
  if v_cent is null or v_itens is null or v_parados is null or v_sumidos is null
     or v_cent < 0 or v_itens < 0 or v_parados < 0 or v_sumidos < 0
  then
    raise exception 'resumo_dados_invalidos';
  end if;
  if not ((v_cent > 0 and v_itens > 0) or v_parados > 0 or v_sumidos > 0) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nada_acionavel');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('olli.email_resumo:' || p_user_id::text, 0)
  );

  if exists (select 1 from public.email_outbox o where o.idempotency_key = p_idempotency_key) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = p_user_id
    and u.email is not null
    and pg_catalog.btrim(u.email) <> ''
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= p_now)
    and coalesce(u.is_anonymous, false) = false;

  if v_email is null
     or v_email !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
     or pg_catalog.length(v_email) > 254
  then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'conta_indisponivel');
  end if;

  v_estado := private.resumo_dinheiro_estado(p_user_id);
  if not (v_estado ->> 'elegivel')::boolean then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'nao_e_dono');
  end if;
  if not (v_estado ->> 'ativo')::boolean then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'desligado');
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.user_id = p_user_id and o.purpose = 'money_digest'
      and o.created_at > p_now - interval '7 days'
  ) >= p_max_semana then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_semanal');
  end if;

  if exists (
    select 1 from public.email_outbox o
    where o.user_id = p_user_id and o.purpose = 'money_digest'
      and o.created_at > p_now - pg_catalog.make_interval(hours => p_intervalo_min_horas)
  ) then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'intervalo_minimo');
  end if;

  if (
    select pg_catalog.count(*) from public.email_outbox o
    where o.purpose = 'money_digest'
      and o.created_at > p_now - interval '24 hours'
  ) >= p_teto_diario then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'teto_diario');
  end if;

  insert into public.email_outbox (
    event_id, user_id, tenant_id, idempotency_key, template, template_version,
    purpose, recipient, next_attempt_at, template_dados
  ) values (
    p_idempotency_key,
    p_user_id,
    null,
    p_idempotency_key,
    'resumo_dinheiro',
    'resumo_dinheiro.v1',
    'money_digest',
    pg_catalog.lower(pg_catalog.btrim(v_email)),
    p_now,
    p_template_dados
  ) on conflict (idempotency_key) do nothing;

  if not found then
    return pg_catalog.jsonb_build_object('enfileirado', false, 'motivo', 'duplicado');
  end if;
  return pg_catalog.jsonb_build_object('enfileirado', true, 'motivo', 'enfileirado');
end;
$$;

revoke all on function public.enqueue_resumo_dinheiro_email(uuid, text, jsonb, integer, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_resumo_dinheiro_email(uuid, text, jsonb, integer, integer, integer, timestamptz)
  to service_role;

-- Rollback operacional (sem DROP):
--   update private.email_dispatch_config set dispatch_scope = 'hold' where canal = 'resumo_dinheiro';
--   update public.email_outbox set status = 'dead_letter', error_code = 'descartado_antes_do_envio',
--          next_attempt_at = null, updated_at = now()
--    where template = 'resumo_dinheiro' and status = 'pending' and attempts = 0;
--   e EMAIL_RESUMO_MODE = "off" no Worker.
