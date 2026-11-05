-- T-033: telemetria de jornada no banco próprio (plano: Entregas Claude/OLLI/telemetria-comunidade/TELEMETRIA.md).
-- SÓ ESQUEMA. Nada envia dado ainda: o app/painel só passam a chamar a RPC depois
-- de a política de privacidade ser atualizada (revisão do Dr. Paulo) e da feature flag.
-- Não armazena texto digitado, dados de cliente, valores, IP, senha nem token.

-- 1) Lista fechada de eventos aceitos. Nome fora daqui é descartado pela RPC.
--    A lista inicial é PROPOSTA: o Dr. Paulo valida antes de ligar o envio.
create table if not exists public.eventos_catalogo (
  nome       text primary key check (nome ~ '^[a-z][a-z0-9_]{1,47}$'),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

insert into public.eventos_catalogo (nome) values
  ('sessao_iniciada'), ('sessao_encerrada'), ('tela_vista'), ('acao'),
  ('erro_mostrado'), ('gate_visto'), ('orcamento_passo'), ('link_criado'),
  ('oficio_escolhido'), ('reco_mostrada'), ('reco_aceita'), ('reco_dispensada')
on conflict (nome) do nothing;

alter table public.eventos_catalogo enable row level security;
alter table public.eventos_catalogo force row level security;
revoke all on table public.eventos_catalogo from anon, authenticated;

-- 2) Jornada. Escrita só pela RPC; leitura só service_role (painel admin).
create table if not exists public.eventos_uso (
  id              uuid primary key,
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  organizacao_id  uuid,
  sessao          uuid not null,
  seq             integer not null check (seq >= 0),
  nome            text not null references public.eventos_catalogo (nome),
  tela            text check (tela is null or tela ~ '^[a-z0-9_/-]{1,64}$'),
  componente      text check (componente is null or componente ~ '^[a-z0-9_]{1,64}$'),
  plataforma      text not null default 'unknown'
                  check (plataforma in ('web', 'ios', 'android', 'desktop', 'unknown')),
  app_versao      text check (app_versao is null or length(app_versao) <= 32),
  ts_cliente      timestamptz not null,
  ts_servidor     timestamptz not null default now(),
  props           jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 512)
);

create index if not exists eventos_uso_usuario_ts_idx
  on public.eventos_uso (usuario_id, ts_servidor desc);
create index if not exists eventos_uso_nome_ts_idx
  on public.eventos_uso (nome, ts_servidor desc);

alter table public.eventos_uso enable row level security;
alter table public.eventos_uso force row level security;
revoke all on table public.eventos_uso from anon, authenticated;

-- 3) Consentimento por finalidade (comunidade, mensagens ativas) e opt-out da telemetria.
--    Linha mais recente por (usuario, finalidade) vale; revogar = revogado_em preenchido.
create table if not exists public.consentimentos (
  id              bigint generated always as identity primary key,
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  finalidade      text not null check (finalidade ~ '^[a-z][a-z0-9_]{1,47}$'),
  versao_texto    text not null check (length(versao_texto) between 1 and 32),
  concedido_em    timestamptz not null default now(),
  revogado_em     timestamptz,
  unique (usuario_id, finalidade, versao_texto)
);

alter table public.consentimentos enable row level security;
alter table public.consentimentos force row level security;
revoke all on table public.consentimentos from anon, authenticated;
grant select, insert, update (revogado_em) on table public.consentimentos to authenticated;

drop policy if exists consentimentos_select_own on public.consentimentos;
create policy consentimentos_select_own on public.consentimentos
  for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists consentimentos_insert_own on public.consentimentos;
create policy consentimentos_insert_own on public.consentimentos
  for insert to authenticated with check (usuario_id = (select auth.uid()));
drop policy if exists consentimentos_update_own on public.consentimentos;
create policy consentimentos_update_own on public.consentimentos
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- 4) RPC de lote. SECURITY DEFINER só para ler o catálogo e gravar na tabela fechada;
--    o usuário é SEMPRE auth.uid() (o cliente não escolhe), com teto de 100 por chamada
--    e 200 por usuário/dia. Retorna quantos foram gravados (reenvio não duplica: mesmo id).
--    Opt-out ('telemetria_uso' revogado) => descarta tudo e devolve 0.
create or replace function public.registrar_eventos_uso(p_eventos jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gravados integer := 0;
  v_hoje integer;
  v_cabem integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_eventos is null or jsonb_typeof(p_eventos) <> 'array' then
    raise exception 'eventos_invalidos';
  end if;
  if jsonb_array_length(p_eventos) > 100 then
    raise exception 'lote_grande';
  end if;

  -- opt-out valendo: não grava nada
  if exists (
    select 1 from public.consentimentos c
    where c.usuario_id = v_uid and c.finalidade = 'telemetria_uso'
      and c.revogado_em is not null
      and c.concedido_em = (
        select max(c2.concedido_em) from public.consentimentos c2
        where c2.usuario_id = v_uid and c2.finalidade = 'telemetria_uso')
  ) then
    return 0;
  end if;

  select count(*) into v_hoje from public.eventos_uso
   where usuario_id = v_uid and ts_servidor >= date_trunc('day', now());
  v_cabem := greatest(0, 200 - v_hoje);
  if v_cabem = 0 then
    return 0;
  end if;

  with entrada as (
    select
      (e->>'id')::uuid                      as id,
      (e->>'sessao')::uuid                  as sessao,
      (e->>'seq')::integer                  as seq,
      lower(trim(e->>'nome'))               as nome,
      nullif(lower(trim(e->>'tela')), '')       as tela,
      nullif(lower(trim(e->>'componente')), '') as componente,
      coalesce(nullif(lower(trim(e->>'plataforma')), ''), 'unknown') as plataforma,
      left(nullif(trim(e->>'app_versao'), ''), 32) as app_versao,
      (e->>'ts_cliente')::timestamptz       as ts_cliente,
      case when jsonb_typeof(e->'props') = 'object'
                and pg_column_size(e->'props') <= 512
           then e->'props' else '{}'::jsonb end as props
    from jsonb_array_elements(p_eventos) as e
    where jsonb_typeof(e) = 'object'
  ), validos as (
    select en.* from entrada en
    join public.eventos_catalogo cat on cat.nome = en.nome and cat.ativo
    where en.seq >= 0
      and (en.tela is null or en.tela ~ '^[a-z0-9_/-]{1,64}$')
      and (en.componente is null or en.componente ~ '^[a-z0-9_]{1,64}$')
    limit v_cabem
  ), ins as (
    insert into public.eventos_uso
      (id, usuario_id, sessao, seq, nome, tela, componente, plataforma, app_versao, ts_cliente, props)
    select id, v_uid, sessao, seq, nome, tela, componente,
           case when plataforma in ('web', 'ios', 'android', 'desktop') then plataforma else 'unknown' end,
           app_versao, ts_cliente, props
    from validos
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_gravados from ins;

  return v_gravados;
end;
$$;

revoke all on function public.registrar_eventos_uso(jsonb) from public, anon;
grant execute on function public.registrar_eventos_uso(jsonb) to authenticated;

comment on table public.eventos_uso is
  'Jornada de uso (T-033). Escrita só via registrar_eventos_uso; leitura só service_role. Retenção bruta 30-90 d.';
