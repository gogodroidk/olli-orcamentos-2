-- COTA DIARIA DURAVEL PARA IA
--
-- Objetivo: impedir que varios isolates do Worker ultrapassem, em conjunto, os
-- tetos diarios dos provedores gratuitos. A reserva acontece ANTES do dispatch
-- ao provedor e fica consumida mesmo se o upstream falhar depois. Nao existe
-- release nesta v1: esse comportamento e deliberadamente conservador.
--
-- O desenho separa duas familias de custo:
--   * openrouter -> chamadas de texto/raciocinio via OpenRouter;
--   * whisper    -> transcricoes via Workers AI Whisper.
--
-- Concorrencia: a RPC trava sempre a linha GLOBAL antes da linha do USUARIO.
-- Essa ordem unica elimina o ciclo de locks que produziria deadlock. Contador e
-- reserva sao gravados na mesma transacao da RPC; uma excecao reverte tudo.
--
-- Seguranca: as tres tabelas tem RLS forcada e nenhuma policy. Nem anon, nem
-- authenticated, nem service_role recebem acesso direto. O unico caminho da
-- aplicacao e a RPC SECURITY DEFINER, cujo EXECUTE e concedido so a service_role.

create table if not exists public.ia_cota_global_diaria (
  dia date not null,
  familia text not null,
  usados integer not null default 0,
  atualizado_em timestamptz not null default now(),
  constraint ia_cota_global_diaria_pk primary key (dia, familia),
  constraint ia_cota_global_diaria_familia_ck
    check (familia in ('openrouter', 'whisper')),
  constraint ia_cota_global_diaria_usados_ck
    check (usados >= 0)
);

create table if not exists public.ia_cota_usuario_diaria (
  dia date not null,
  familia text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  usados integer not null default 0,
  atualizado_em timestamptz not null default now(),
  constraint ia_cota_usuario_diaria_pk primary key (dia, familia, user_id),
  constraint ia_cota_usuario_diaria_familia_ck
    check (familia in ('openrouter', 'whisper')),
  constraint ia_cota_usuario_diaria_usados_ck
    check (usados >= 0),
  constraint ia_cota_usuario_diaria_global_fk
    foreign key (dia, familia)
    references public.ia_cota_global_diaria (dia, familia)
);

create table if not exists public.ia_cota_reservas (
  dia date not null,
  familia text not null,
  user_id uuid not null,
  request_id text not null,
  unidades integer not null,
  limite_global integer not null,
  limite_usuario integer not null,
  usados_global_apos integer not null,
  usados_usuario_apos integer not null,
  consumida_em timestamptz not null default now(),
  constraint ia_cota_reservas_pk
    primary key (dia, familia, user_id, request_id),
  constraint ia_cota_reservas_familia_ck
    check (familia in ('openrouter', 'whisper')),
  constraint ia_cota_reservas_request_id_ck
    check (
      char_length(request_id) between 16 and 128
      and request_id ~ '^[A-Za-z0-9._:-]+$'
    ),
  constraint ia_cota_reservas_limites_ck
    check (
      limite_global between 1 and 1000000
      and limite_usuario between 1 and limite_global
      and unidades between 1 and limite_usuario
    ),
  constraint ia_cota_reservas_contadores_ck
    check (
      usados_global_apos between unidades and limite_global
      and usados_usuario_apos between unidades and limite_usuario
    ),
  constraint ia_cota_reservas_usuario_fk
    foreign key (dia, familia, user_id)
    references public.ia_cota_usuario_diaria (dia, familia, user_id)
    on delete cascade
);

-- Consulta operacional por familia/dia sem varrer reservas de outros dias. A
-- chave primaria ja cobre a consulta de idempotencia por usuario/request_id.
create index if not exists ia_cota_reservas_familia_dia_idx
  on public.ia_cota_reservas (familia, dia);

alter table public.ia_cota_global_diaria enable row level security;
alter table public.ia_cota_global_diaria force row level security;
alter table public.ia_cota_usuario_diaria enable row level security;
alter table public.ia_cota_usuario_diaria force row level security;
alter table public.ia_cota_reservas enable row level security;
alter table public.ia_cota_reservas force row level security;

-- Fail-closed inclusive para a service_role: ela pode executar a RPC, mas nao
-- manipular contadores/reservas diretamente. A funcao roda como o dono da
-- migration e usa nomes de schema totalmente qualificados.
revoke all on table public.ia_cota_global_diaria
  from public, anon, authenticated, service_role;
revoke all on table public.ia_cota_usuario_diaria
  from public, anon, authenticated, service_role;
revoke all on table public.ia_cota_reservas
  from public, anon, authenticated, service_role;

create or replace function public.reservar_cota_ia_diaria(
  p_user uuid,
  p_familia text,
  p_request_id text,
  p_limite_global integer,
  p_limite_usuario integer,
  p_unidades integer
)
returns table (
  estado text,
  dia date,
  usados_global integer,
  usados_usuario integer,
  limite_global integer,
  limite_usuario integer,
  unidades integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_familia text := pg_catalog.lower(pg_catalog.btrim(p_familia));
  v_request_id text := pg_catalog.btrim(p_request_id);
  v_usados_global integer;
  v_usados_usuario integer;
begin
  -- Entrada invalida nunca vira permissao. O Worker traduz qualquer erro da RPC
  -- em indisponivel/bloqueado (fail-closed).
  if p_user is null then
    raise exception 'p_user invalido' using errcode = '22023';
  end if;

  if v_familia is null or v_familia not in ('openrouter', 'whisper') then
    raise exception 'p_familia invalida' using errcode = '22023';
  end if;

  if v_request_id is null
     or pg_catalog.char_length(v_request_id) not between 16 and 128
     or v_request_id !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'p_request_id invalido' using errcode = '22023';
  end if;

  if p_limite_global is null
     or p_limite_usuario is null
     or p_unidades is null
     or p_limite_global not between 1 and 1000000
     or p_limite_usuario not between 1 and p_limite_global
     or p_unidades not between 1 and p_limite_usuario then
    raise exception 'limites invalidos' using errcode = '22023';
  end if;

  -- 1) cria e trava o contador GLOBAL. Todo chamador obedece esta ordem.
  insert into public.ia_cota_global_diaria (dia, familia)
  values (v_dia, v_familia)
  -- Os nomes das colunas tambem existem no RETURNS TABLE e, em PL/pgSQL,
  -- viram variaveis de saida. Referenciar a constraint pelo nome elimina a
  -- ambiguidade 42702 que o PostgREST encontrou no primeiro canario real.
  on conflict on constraint ia_cota_global_diaria_pk do nothing;

  select g.usados
    into v_usados_global
  from public.ia_cota_global_diaria as g
  where g.dia = v_dia and g.familia = v_familia
  for update;

  if not found then
    raise exception 'contador global indisponivel' using errcode = '55000';
  end if;

  -- 2) somente depois do global, cria e trava o contador do USUARIO.
  insert into public.ia_cota_usuario_diaria (dia, familia, user_id)
  values (v_dia, v_familia, p_user)
  on conflict on constraint ia_cota_usuario_diaria_pk do nothing;

  select u.usados
    into v_usados_usuario
  from public.ia_cota_usuario_diaria as u
  where u.dia = v_dia and u.familia = v_familia and u.user_id = p_user
  for update;

  if not found then
    raise exception 'contador de usuario indisponivel' using errcode = '55000';
  end if;

  -- Retry da mesma operacao, no mesmo dia UTC: nao consome de novo. O escopo
  -- inclui usuario e familia, portanto um hash igual em contas/provedores
  -- distintos nao compartilha reserva.
  if exists (
    select 1
    from public.ia_cota_reservas as r
    where r.dia = v_dia
      and r.familia = v_familia
      and r.user_id = p_user
      and r.request_id = v_request_id
  ) then
    return query select
      'ja_reservado'::text,
      v_dia,
      v_usados_global,
      v_usados_usuario,
      p_limite_global,
      p_limite_usuario,
      p_unidades;
    return;
  end if;

  -- Global tem precedencia diagnostica: se ambos acabaram, informa o teto que
  -- impede qualquer usuario desta familia.
  if v_usados_global > p_limite_global - p_unidades then
    return query select
      'limite_global'::text,
      v_dia,
      v_usados_global,
      v_usados_usuario,
      p_limite_global,
      p_limite_usuario,
      p_unidades;
    return;
  end if;

  if v_usados_usuario > p_limite_usuario - p_unidades then
    return query select
      'limite_usuario'::text,
      v_dia,
      v_usados_global,
      v_usados_usuario,
      p_limite_global,
      p_limite_usuario,
      p_unidades;
    return;
  end if;

  update public.ia_cota_global_diaria
  set usados = usados + p_unidades,
      atualizado_em = pg_catalog.clock_timestamp()
  where ia_cota_global_diaria.dia = v_dia
    and ia_cota_global_diaria.familia = v_familia
  returning usados into v_usados_global;

  update public.ia_cota_usuario_diaria
  set usados = usados + p_unidades,
      atualizado_em = pg_catalog.clock_timestamp()
  where ia_cota_usuario_diaria.dia = v_dia
    and ia_cota_usuario_diaria.familia = v_familia
    and ia_cota_usuario_diaria.user_id = p_user
  returning usados into v_usados_usuario;

  -- A reserva e o consumo sao a mesma operacao nesta v1. Se qualquer INSERT ou
  -- constraint falhar, o Postgres reverte tambem os dois UPDATEs acima.
  insert into public.ia_cota_reservas (
    dia,
    familia,
    user_id,
    request_id,
    unidades,
    limite_global,
    limite_usuario,
    usados_global_apos,
    usados_usuario_apos
  ) values (
    v_dia,
    v_familia,
    p_user,
    v_request_id,
    p_unidades,
    p_limite_global,
    p_limite_usuario,
    v_usados_global,
    v_usados_usuario
  );

  return query select
    'permitido'::text,
    v_dia,
    v_usados_global,
    v_usados_usuario,
    p_limite_global,
    p_limite_usuario,
    p_unidades;
end;
$$;

comment on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer) is
  'Reserva atomicamente unidades de cota diaria antes do dispatch. Para OpenRouter, use 1 por request; para Whisper, use neuronios inteiros estimados. Retorna permitido | ja_reservado | limite_global | limite_usuario. Locks sempre global -> usuario. A reserva nao e liberada nesta v1.';

revoke all on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- CORRECAO DA COTA COMERCIAL MENSAL
--
-- A versao de 20260727 contava linhas e depois inseria sem serializar requests
-- diferentes. Com um unico uso restante, duas chamadas simultaneas podiam ler
-- 2/3 e ambas gravar, chegando a 4/3. O advisory lock transacional abaixo usa
-- usuario + periodo + acao: serializa somente os pedidos que disputam a mesma
-- cota, sem bloquear contas independentes. Retry e insert continuam na mesma
-- transacao; a segunda chamada sempre enxerga a gravacao da primeira.

create or replace function public.consumir_cota_ia(
  p_user uuid,
  p_acao text,
  p_ref text,
  p_limite integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_janela constant interval := interval '10 minutes';
  v_periodo text := pg_catalog.to_char(
    (pg_catalog.now() at time zone 'utc'),
    'YYYY-MM'
  );
  v_acao text := pg_catalog.coalesce(pg_catalog.nullif(pg_catalog.btrim(p_acao), ''), 'voz_ia');
  v_limite integer := pg_catalog.greatest(pg_catalog.coalesce(p_limite, 0), 0);
  v_usados integer;
  v_agora timestamptz := pg_catalog.now();
  v_bucket timestamptz;
begin
  if p_user is null then
    return 'indisponivel';
  end if;

  -- O lock dura so ate o fim desta transacao. Colisoes do hash, embora muito
  -- improvaveis, apenas serializam contas extras; nunca misturam os seus dados.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user::text || ':' || v_periodo || ':' || v_acao,
      0
    )
  );

  if p_ref is not null and exists (
    select 1
    from public.ia_uso_gratis as u
    where u.user_id = p_user
      and u.acao = v_acao
      and u.ref = p_ref
      and u.criado_em > v_agora - v_janela
  ) then
    return 'ja_contada';
  end if;

  select pg_catalog.count(*)
    into v_usados
  from public.ia_uso_gratis as u
  where u.user_id = p_user
    and u.periodo = v_periodo
    and u.acao = v_acao;

  if v_usados >= v_limite then
    return 'esgotada';
  end if;

  v_bucket := pg_catalog.to_timestamp(
    (
      pg_catalog.floor(
        extract(epoch from v_agora) /
        extract(epoch from v_janela)
      ) * extract(epoch from v_janela)
    )::double precision
  );

  insert into public.ia_uso_gratis (user_id, periodo, acao, ref, janela)
  values (p_user, v_periodo, v_acao, p_ref, v_bucket)
  on conflict do nothing;

  return 'consumida';
end;
$$;

comment on function public.consumir_cota_ia(uuid, text, text, integer) is
  'Consome atomicamente 1 uso da cota mensal. Advisory xact lock por usuario/periodo/acao impede ultrapassar o limite sob concorrencia; retry do mesmo ref em 10 min nao conta duas vezes.';

revoke all on function public.consumir_cota_ia(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consumir_cota_ia(uuid, text, text, integer)
  to service_role;

-- ROLLBACK (somente se esta capacidade ainda nao tiver consumidores):
--   drop function if exists public.reservar_cota_ia_diaria(uuid, text, text, integer, integer, integer);
--   drop table if exists public.ia_cota_reservas;
--   drop table if exists public.ia_cota_usuario_diaria;
--   drop table if exists public.ia_cota_global_diaria;
-- As tabelas sao derrubadas por ultimo e na ordem das FKs. Esse rollback apaga a
-- trilha de reservas; preserve/exporte os dados antes de usa-lo em producao.

-- =============================================================================
-- P0: CONSUMO ATOMICO DE CREDITOS
--
-- O fluxo antigo fazia saldo_creditos() e depois INSERT no ledger em duas
-- requisicoes. Duas chamadas concorrentes podiam ler o mesmo saldo e ambas
-- debitar, deixando-o negativo. Esta RPC serializa todo consumo do mesmo usuario
-- e executa idempotencia -> saldo -> insert dentro de UMA transacao.
--
-- A idempotencia vem antes do saldo: o retry do ultimo credito ja consumido deve
-- voltar ja_consumido mesmo que o saldo atual seja zero. Depois do dispatch nao
-- existe estorno automatico; correcoes continuam sendo novos lancamentos de
-- ajuste, preservando o ledger append-only.

create or replace function public.consumir_creditos_atomico(
  p_user uuid,
  p_custo integer,
  p_ref text,
  p_descricao text
)
returns table (
  estado text,
  saldo bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := pg_catalog.btrim(p_ref);
  v_descricao text := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.btrim(p_descricao), ''),
    'consumo'
  );
  v_saldo bigint;
  v_ref_user uuid;
begin
  if p_user is null then
    raise exception 'p_user invalido' using errcode = '22023';
  end if;

  if p_custo is null or p_custo not between 1 and 1000000 then
    raise exception 'p_custo invalido' using errcode = '22023';
  end if;

  if v_ref is null or pg_catalog.char_length(v_ref) not between 1 and 512 then
    raise exception 'p_ref invalido' using errcode = '22023';
  end if;

  if pg_catalog.char_length(v_descricao) > 500 then
    raise exception 'p_descricao invalida' using errcode = '22023';
  end if;

  -- Lock transacional por usuario. Colisoes do hash apenas serializam usuarios
  -- extras; nao misturam dados. A ordem interna abaixo e sempre a mesma:
  -- idempotencia -> saldo -> insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('olli:creditos:' || p_user::text, 20260817)
  );

  select l.user_id
    into v_ref_user
  from public.credit_ledger as l
  where l.origem = 'consumo' and l.ref = v_ref
  limit 1;

  if found then
    -- O indice (origem,ref) e global. Uma colisao entre usuarios nao pode virar
    -- idempotencia e liberar trabalho na conta errada.
    if v_ref_user <> p_user then
      raise exception 'p_ref ja pertence a outro usuario' using errcode = '22023';
    end if;

    select pg_catalog.coalesce(pg_catalog.sum(l.delta), 0)::bigint
      into v_saldo
    from public.credit_ledger as l
    where l.user_id = p_user;

    return query select 'ja_consumido'::text, v_saldo;
    return;
  end if;

  select pg_catalog.coalesce(pg_catalog.sum(l.delta), 0)::bigint
    into v_saldo
  from public.credit_ledger as l
  where l.user_id = p_user;

  if v_saldo < p_custo then
    return query select 'sem_saldo'::text, v_saldo;
    return;
  end if;

  insert into public.credit_ledger (
    user_id,
    delta,
    origem,
    ref,
    descricao
  ) values (
    p_user,
    -p_custo,
    'consumo',
    v_ref,
    v_descricao
  );

  v_saldo := v_saldo - p_custo;
  return query select 'consumido'::text, v_saldo;
end;
$$;

comment on function public.consumir_creditos_atomico(uuid, integer, text, text) is
  'Consome creditos atomicamente sob advisory xact lock por usuario. Retorna consumido | ja_consumido | sem_saldo e o saldo apos a decisao. Idempotencia (consumo,ref) e verificada antes do saldo.';

revoke all on function public.consumir_creditos_atomico(uuid, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consumir_creditos_atomico(uuid, integer, text, text)
  to service_role;

-- ROLLBACK DESTA SECAO (nao altera nem apaga o ledger):
--   drop function if exists public.consumir_creditos_atomico(uuid, integer, text, text);
