-- OLLI Orçamentos — RESUMO DIÁRIO: "clientes sumidos" vira "CLIENTES PARA LEMBRAR".
--
-- Por quê: o e-mail das 7h (20260930120200) contava "clientes sem atendimento há 150
-- dias" — uma regra que o app e o painel deixaram de mostrar no mesmo dia: o cartão
-- virou "Clientes para lembrar" (pós-venda, `src/utils/posVenda.ts`): só serviço
-- CONCLUÍDO conta (orçamento aprovado/convertido, agendamento concluído, recibo não
-- estornado), o intervalo é o do OFÍCIO da empresa (ar-condicionado 6 meses, elétrica
-- 12, jardim 3…) e quem foi lembrado há menos de 30 dias não volta. O número que o
-- e-mail mostra TEM que bater com o que a tela mostra — então o e-mail passa a contar
-- exatamente essa lista, com a MESMA função (`resumirDinheiroParado` →
-- `listarClientesParaLembrarDasLinhas`, em `src/services/radarDinheiro.ts`).
--
-- O que muda aqui:
--   1. catálogo da outbox ganha `resumo_dinheiro.v2` (template_dados com
--      `clientesParaLembrar` no lugar de `clientesSumidos`); a v1 fica no catálogo só
--      para as linhas históricas;
--   2. `dados_resumo_dinheiro` devolve também o que a regra de pós-venda precisa:
--      `estornadoEm` do recibo, `lembrados` (extras_sync 'posvenda.lembrados') e
--      `verticais` (empresa.dados.verticais — só os ids do ofício);
--   3. `enqueue_resumo_dinheiro_email` lê `clientesParaLembrar` e grava a v2.
--
-- ORDEM DE PUBLICAÇÃO: é fail-closed nos dois sentidos — Worker novo com banco antigo
-- recebe a resposta sem `verticais`/`lembrados` e não envia (`dados_sem_posvenda`);
-- Worker antigo com banco novo manda `clientesSumidos` e o enqueue recusa
-- (`resumo_dados_invalidos`). Aplique esta migration e publique o Worker juntos, fora
-- da janela das 7h (uma linha v1 pendente, criada pelo Worker antigo, viraria
-- dead_letter no consumer novo).
--
-- Mesmas garantias de antes: service_role só, projeção mínima, sem PII (nada de nome,
-- telefone, endereço ou chave Pix), teto por tabela com `truncado`.

-- ─── 1. Catálogo da outbox: + resumo_dinheiro.v2 ────────────────────────────

alter table public.email_outbox drop constraint if exists email_outbox_template_catalogo_check;
alter table public.email_outbox
  add constraint email_outbox_template_catalogo_check
  check (
    (template, template_version, purpose) in (
      ('boas_vindas', 'boas_vindas.v1', 'account_onboarding'),
      ('lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder'),
      ('lembrete_assinatura', 'lembrete_assinatura.v1', 'billing_reminder'),
      ('resumo_dinheiro', 'resumo_dinheiro.v1', 'money_digest'),
      ('resumo_dinheiro', 'resumo_dinheiro.v2', 'money_digest')
    )
  );

-- ─── 2. As linhas de UMA conta, agora com o que o pós-venda precisa ─────────

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
  v_lem  jsonb;
  v_vert jsonb;
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
          'criadoEm', r.dados -> 'criadoEm',
          'estornadoEm', r.dados -> 'estornadoEm'
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

  -- Pós-venda: quem já foi lembrado (celular OU painel) não volta antes de 30 dias.
  select e.dados into v_lem
  from public.extras_sync e
  where e.user_id = p_user_id and e.chave = 'posvenda.lembrados';

  -- Ofício(s) da empresa: definem o intervalo de "clientes para lembrar". Só a lista
  -- de ids — nada de nome, CNPJ ou chave Pix sai daqui.
  select emp.dados -> 'verticais' into v_vert
  from public.empresa emp
  where emp.user_id = p_user_id
  limit 1;

  return pg_catalog.jsonb_build_object(
    'orcamentos', v_orc,
    'recibos', v_rec,
    'clientes', v_cli,
    'agendamentos', v_age,
    'osConcluidas', v_os,
    'adiados', case when pg_catalog.jsonb_typeof(v_adi) = 'object' then v_adi else '{}'::jsonb end,
    'lembrados', case when pg_catalog.jsonb_typeof(v_lem) = 'object' then v_lem else '{}'::jsonb end,
    'verticais', case when pg_catalog.jsonb_typeof(v_vert) = 'array' then v_vert else 'null'::jsonb end,
    'truncado', greatest(n_orc, n_rec, n_cli, n_age, n_os) > p_max_linhas
  );
end;
$$;

revoke all on function public.dados_resumo_dinheiro(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.dados_resumo_dinheiro(uuid, integer)
  to service_role;

-- ─── 3. Enfileirar UM resumo (v2: clientesParaLembrar) ──────────────────────

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
  v_lembrar bigint;
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
    v_lembrar := (p_template_dados ->> 'clientesParaLembrar')::bigint;
  exception when others then
    raise exception 'resumo_dados_invalidos';
  end;
  if v_cent is null or v_itens is null or v_parados is null or v_lembrar is null
     or v_cent < 0 or v_itens < 0 or v_parados < 0 or v_lembrar < 0
  then
    raise exception 'resumo_dados_invalidos';
  end if;
  if not ((v_cent > 0 and v_itens > 0) or v_parados > 0 or v_lembrar > 0) then
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
    'resumo_dinheiro.v2',
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
