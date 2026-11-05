-- Z-53 — anti-abuso do trial (3 e-mails, 1 pessoa).
--
-- Spec de 03/11/2026 (z-53-spec-anti-abuso.md), com a contagem do Z-105:
-- a caixa normalizada é o sinal. Três ou mais contas na mesma caixa viram
-- marca de revisão. A marca guarda só o SHA-256 da caixa, a quantidade e dois
-- booleanos. Não grava e-mail, não grava IP, não apaga conta e não tira plano.
--
-- Bloqueio automático: só o teste NOVO, e só de conta sem assinatura ativa
-- (active/trialing com vigência futura, ou override de admin na mesma régua
-- do plano pago). Quem já paga não entra. O primeiro teste do grupo começa.
-- O seguinte, em conta sem assinatura, não começa. Teste já ativo segue ativo.
--
-- IP de sessão não bloqueia. Se duas contas da mesma caixa dividem um IP, a
-- marca ganha ip_reforca = true. Sem a coluna auth.sessions.ip, o flag fica
-- falso e nada é recusado por isso.
--
-- Normalização: minúsculas, sem o texto depois do '+'. No Gmail (gmail.com e
-- googlemail.com, a mesma caixa) também sem pontos. O corte do Grátis não é
-- ligado aqui. Não aplicar em produção sem ordem: este arquivo só entra no git.
--
-- Rollback (não roda sozinho): dropar o trigger, dropar as funções e a tabela
-- desta migration e recriar public.iniciar_trial_pro com o corpo de
-- 20260905053000_cota_orcamentos_trial_pro.sql.

create or replace function public.normalizar_caixa_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null then null
    when lower(pg_catalog.btrim(p_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+$' then null
    else (
      select case
        when local_sem_tag = '' then null
        when dominio = 'gmail.com' and replace(local_sem_tag, '.', '') = '' then null
        when dominio = 'gmail.com' then replace(local_sem_tag, '.', '') || '@gmail.com'
        else local_sem_tag || '@' || dominio
      end
      from (
        select
          split_part(split_part(lower(pg_catalog.btrim(p_email)), '@', 1), '+', 1) as local_sem_tag,
          case
            when split_part(lower(pg_catalog.btrim(p_email)), '@', 2) = 'googlemail.com' then 'gmail.com'
            else split_part(lower(pg_catalog.btrim(p_email)), '@', 2)
          end as dominio
      ) n
    )
  end;
$$;

comment on function public.normalizar_caixa_email(text) is
  'Caixa comparável: sem +tag; Gmail/googlemail também sem pontos. Não guarda o e-mail.';

create or replace function public.caixa_email_hash(p_normalizada text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_hash text;
  v_sql text;
begin
  if to_regprocedure('extensions.digest(bytea, text)') is not null then
    v_sql := 'select encode(extensions.digest(pg_catalog.convert_to($1, ''UTF8''), ''sha256''), ''hex'')';
  elsif to_regprocedure('public.digest(bytea, text)') is not null then
    v_sql := 'select encode(public.digest(pg_catalog.convert_to($1, ''UTF8''), ''sha256''), ''hex'')';
  else
    raise exception 'pgcrypto_ausente';
  end if;
  execute v_sql into v_hash using p_normalizada;
  return v_hash;
end;
$$;

comment on function public.caixa_email_hash(text) is
  'SHA-256 da caixa já normalizada. A tabela de revisão guarda este hash, não o e-mail.';

create table if not exists public.marcas_revisao_caixa (
  caixa_hash text primary key check (caixa_hash ~ '^[0-9a-f]{64}$'),
  qtd_contas integer not null check (qtd_contas >= 3),
  tem_assinatura_ativa boolean not null,
  ip_reforca boolean not null default false,
  bloqueio_trial boolean not null,
  atualizada_em timestamptz not null default pg_catalog.now()
);

comment on table public.marcas_revisao_caixa is
  'Z-53: 3+ contas na mesma caixa normalizada. Só hash, contagem e flags. Sem e-mail e sem IP.';

comment on column public.marcas_revisao_caixa.bloqueio_trial is
  'true quando um teste novo de conta sem assinatura ativa neste grupo não deve começar.';

comment on column public.marcas_revisao_caixa.ip_reforca is
  'true quando duas contas da caixa dividem IP de sessão. O IP em si não é gravado e não bloqueia.';

alter table public.marcas_revisao_caixa enable row level security;
alter table public.marcas_revisao_caixa force row level security;
revoke all on table public.marcas_revisao_caixa from public, anon, authenticated;
grant select, insert, update on table public.marcas_revisao_caixa to service_role;

create or replace function public.avaliar_caixa_trial(p_user_id uuid, p_vai_iniciar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_norm text;
  v_hash text;
  v_qtd integer;
  v_outros_iniciados integer;
  v_iniciados_grupo integer;
  v_assinatura_ativa boolean;
  v_grupo_tem_assinatura boolean;
  v_ip_reforca boolean := false;
  v_tem_coluna_ip boolean;
  v_bloquear boolean;
  v_marca_bloqueio boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('marcada', false, 'bloquear', false);
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = p_user_id
    and u.deleted_at is null;

  v_norm := public.normalizar_caixa_email(v_email);
  if v_norm is null then
    return jsonb_build_object('marcada', false, 'bloquear', false);
  end if;

  v_hash := public.caixa_email_hash(v_norm);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_hash, 0));

  select count(*) into v_qtd
  from auth.users u
  where u.deleted_at is null
    and public.normalizar_caixa_email(u.email) = v_norm;

  if v_qtd < 3 then
    return jsonb_build_object('marcada', false, 'bloquear', false, 'qtd', v_qtd);
  end if;

  select exists (
    select 1 from public.assinaturas a
    where a.user_id = p_user_id
      and (
        (a.status in ('active', 'trialing')
          and a.current_period_end is not null
          and a.current_period_end > pg_catalog.now()
          and a.plano in ('pro', 'empresa'))
        or (a.admin_override_ativo is true
          and (a.admin_override_ate is null or a.admin_override_ate >= pg_catalog.now())
          and a.admin_plano_override in ('pro', 'empresa'))
      )
  ) into v_assinatura_ativa;

  select exists (
    select 1
    from auth.users u
    join public.assinaturas a on a.user_id = u.id
    where u.deleted_at is null
      and public.normalizar_caixa_email(u.email) = v_norm
      and (
        (a.status in ('active', 'trialing')
          and a.current_period_end is not null
          and a.current_period_end > pg_catalog.now()
          and a.plano in ('pro', 'empresa'))
        or (a.admin_override_ativo is true
          and (a.admin_override_ate is null or a.admin_override_ate >= pg_catalog.now())
          and a.admin_plano_override in ('pro', 'empresa'))
      )
  ) into v_grupo_tem_assinatura;

  select count(*) into v_outros_iniciados
  from public.trials_comerciais t
  join auth.users u on u.id = t.owner_user_id
  where u.deleted_at is null
    and u.id <> p_user_id
    and public.normalizar_caixa_email(u.email) = v_norm
    and t.estado in ('active', 'ended', 'converted', 'revoked');

  select count(*) into v_iniciados_grupo
  from public.trials_comerciais t
  join auth.users u on u.id = t.owner_user_id
  where u.deleted_at is null
    and public.normalizar_caixa_email(u.email) = v_norm
    and t.estado in ('active', 'ended', 'converted', 'revoked');

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'sessions' and column_name = 'ip'
  ) into v_tem_coluna_ip;

  if v_tem_coluna_ip then
    execute $ip$
      select exists (
        select 1
        from auth.sessions s1
        join auth.sessions s2
          on s1.ip is not null and s1.ip = s2.ip and s1.user_id <> s2.user_id
        join auth.users u1 on u1.id = s1.user_id and u1.deleted_at is null
        join auth.users u2 on u2.id = s2.user_id and u2.deleted_at is null
        where public.normalizar_caixa_email(u1.email) = $1
          and public.normalizar_caixa_email(u2.email) = $1
      )
    $ip$ into v_ip_reforca using v_norm;
  end if;

  v_bloquear := (not v_assinatura_ativa) and v_outros_iniciados >= 1;
  v_marca_bloqueio := v_iniciados_grupo >= 1 or (p_vai_iniciar and not v_bloquear);

  insert into public.marcas_revisao_caixa as m (
    caixa_hash, qtd_contas, tem_assinatura_ativa, ip_reforca, bloqueio_trial, atualizada_em
  ) values (
    v_hash, v_qtd, v_grupo_tem_assinatura, v_ip_reforca, v_marca_bloqueio, pg_catalog.now()
  )
  on conflict (caixa_hash) do update set
    qtd_contas = excluded.qtd_contas,
    tem_assinatura_ativa = excluded.tem_assinatura_ativa,
    ip_reforca = excluded.ip_reforca,
    bloqueio_trial = excluded.bloqueio_trial,
    atualizada_em = pg_catalog.now();

  return jsonb_build_object(
    'marcada', true,
    'bloquear', v_bloquear,
    'qtd', v_qtd,
    'ip_reforca', v_ip_reforca
  );
end;
$$;

revoke all on function public.normalizar_caixa_email(text) from public, anon, authenticated;
revoke all on function public.caixa_email_hash(text) from public, anon, authenticated;
revoke all on function public.avaliar_caixa_trial(uuid, boolean) from public, anon, authenticated;
grant execute on function public.avaliar_caixa_trial(uuid, boolean) to service_role;

comment on function public.avaliar_caixa_trial(uuid, boolean) is
  'Z-53: marca a caixa (hash) quando há 3+ contas. Bloqueia só teste novo de quem não tem assinatura ativa.';

create or replace function public.trials_comerciais_anti_abuso_caixa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if new.estado is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'active' then
    return new;
  end if;

  v := public.avaliar_caixa_trial(new.owner_user_id, true);
  if coalesce((v ->> 'bloquear')::boolean, false) then
    if tg_op = 'UPDATE' then
      new.estado := old.estado;
      new.gatilho := old.gatilho;
      new.iniciado_em := old.iniciado_em;
      new.termina_em := old.termina_em;
      new.inicio_automatico := old.inicio_automatico;
      new.atualizado_em := old.atualizado_em;
    else
      new.estado := 'eligible';
      new.iniciado_em := null;
      new.termina_em := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.trials_comerciais_anti_abuso_caixa() from public, anon, authenticated;

drop trigger if exists trials_comerciais_anti_abuso_caixa on public.trials_comerciais;
create trigger trials_comerciais_anti_abuso_caixa
  before insert or update on public.trials_comerciais
  for each row
  execute function public.trials_comerciais_anti_abuso_caixa();

create or replace function public.iniciar_trial_pro(p_gatilho text default 'pro_attempt')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contexto record;
  v_trial public.trials_comerciais%rowtype;
begin
  if auth.uid() is null then raise exception 'sessao_obrigatoria'; end if;
  if p_gatilho not in ('first_pdf', 'first_link', 'first_whatsapp', 'quota_limit', 'pro_attempt', 'ai_limit', 'radar_return') then
    raise exception 'gatilho_invalido';
  end if;
  select * into strict v_contexto from public.contexto_comercial_atual();
  if auth.uid() <> v_contexto.owner_user_id then raise exception 'somente_owner_inicia_trial'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_contexto.tenant_id::text || ':trial', 0));

  select * into v_trial from public.trials_comerciais t where t.tenant_id = v_contexto.tenant_id for update;
  if not found then raise exception 'trial_nao_elegivel'; end if;
  if v_trial.estado = 'active' and v_trial.termina_em > now() then
    return jsonb_build_object('iniciado', false, 'replay', true, 'termina_em', v_trial.termina_em);
  end if;
  if v_trial.estado <> 'eligible' then raise exception 'trial_ja_consumido'; end if;

  update public.trials_comerciais
  set estado = 'active', gatilho = p_gatilho, iniciado_em = now(),
      termina_em = now() + interval '14 days', atualizado_em = now()
  where tenant_id = v_contexto.tenant_id
  returning * into v_trial;

  if v_trial.estado is distinct from 'active' then
    return jsonb_build_object(
      'iniciado', false,
      'replay', false,
      'motivo', 'revisao_caixa',
      'requires_card', false,
      'auto_renews', false,
      'data_disposition', 'preserve'
    );
  end if;

  return jsonb_build_object(
    'iniciado', true, 'replay', false, 'termina_em', v_trial.termina_em,
    'trial_dias', 14, 'requires_card', false, 'auto_renews', false,
    'data_disposition', 'preserve'
  );
end;
$$;

revoke all on function public.iniciar_trial_pro(text) from public, anon;
grant execute on function public.iniciar_trial_pro(text) to authenticated;

comment on function public.iniciar_trial_pro(text) is
  'Inicia o teste Pro de 14 dias. Z-53: caixa com 3+ contas e outro teste já iniciado devolve motivo revisao_caixa, sem consumir este teste.';

do $$
declare
  r record;
begin
  if to_regprocedure('public.avaliar_caixa_trial(uuid, boolean)') is null then
    return;
  end if;
  for r in
    select u.id
    from auth.users u
    where u.deleted_at is null
      and u.email is not null
  loop
    perform public.avaliar_caixa_trial(r.id, false);
  end loop;
end;
$$;
