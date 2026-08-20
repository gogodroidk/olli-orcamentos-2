-- OLLI ADMIN — governança, plano manual sobreposto e trilha imutável.
--
-- Objetivos:
--   1. permitir que o dono conceda/revogue Pro ou Empresa sem adulterar os
--      identificadores e o estado reais da Stripe/Mercado Pago;
--   2. permitir administradores adicionais com função explícita;
--   3. registrar toda mutação administrativa sem prompt, senha, token ou
--      conteúdo de cliente;
--   4. remover EXECUTE público acidental de helpers internos.

-- A assinatura do gateway continua intocada. O plano efetivo é o maior entre
-- a assinatura vigente e este override enquanto ativo/não vencido.
alter table public.assinaturas
  alter column stripe_customer_id drop not null,
  alter column stripe_subscription_id drop not null;

alter table public.assinaturas
  add column if not exists admin_plano_override text,
  add column if not exists admin_override_ativo boolean not null default false,
  add column if not exists admin_override_ate timestamptz,
  add column if not exists admin_override_reason text,
  add column if not exists admin_override_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_override_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assinaturas_admin_plano_override_check'
      and conrelid = 'public.assinaturas'::regclass
  ) then
    alter table public.assinaturas
      add constraint assinaturas_admin_plano_override_check
      check (admin_plano_override is null or admin_plano_override in ('pro', 'empresa'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'assinaturas_admin_override_reason_check'
      and conrelid = 'public.assinaturas'::regclass
  ) then
    alter table public.assinaturas
      add constraint assinaturas_admin_override_reason_check
      check (admin_override_reason is null or char_length(admin_override_reason) between 3 and 500);
  end if;
end $$;

comment on column public.assinaturas.admin_plano_override is
  'Plano concedido manualmente pelo painel. Sobrepõe o gateway somente enquanto admin_override_ativo e não vencido.';
comment on column public.assinaturas.admin_override_ate is
  'NULL significa concessão manual sem data final; revogação continua explícita e auditada.';

create table if not exists public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel text not null check (papel in ('owner', 'admin', 'financeiro', 'suporte', 'leitura')),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.admin_memberships enable row level security;
alter table public.admin_memberships force row level security;
revoke all on table public.admin_memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_memberships to service_role;

comment on table public.admin_memberships is
  'Administradores adicionais do SaaS. Sem acesso direto pelo cliente; o Worker valida JWT e papel antes de usar service_role.';

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  acao text not null check (char_length(acao) between 3 and 100),
  -- Sem FK: ao excluir uma conta, o identificador alvo precisa continuar na
  -- trilha. Uma FK ON DELETE SET NULL destruiria justamente a correlação.
  target_user_id uuid,
  motivo text not null check (char_length(motivo) between 3 and 500),
  antes jsonb,
  depois jsonb,
  request_id text,
  criado_em timestamptz not null default now()
);

create index if not exists admin_audit_log_target_criado_idx
  on public.admin_audit_log (target_user_id, criado_em desc);
create index if not exists admin_audit_log_actor_criado_idx
  on public.admin_audit_log (actor_user_id, criado_em desc);
create unique index if not exists admin_audit_log_actor_request_uidx
  on public.admin_audit_log (actor_user_id, request_id)
  where request_id is not null;

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert on table public.admin_audit_log to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq to service_role;

create or replace function public.admin_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log e append-only';
end;
$$;

revoke all on function public.admin_audit_append_only() from public, anon, authenticated;
grant execute on function public.admin_audit_append_only() to service_role;

drop trigger if exists admin_audit_no_update on public.admin_audit_log;
create trigger admin_audit_no_update
  before update on public.admin_audit_log
  for each row execute function public.admin_audit_append_only();

drop trigger if exists admin_audit_no_delete on public.admin_audit_log;
create trigger admin_audit_no_delete
  before delete on public.admin_audit_log
  for each row execute function public.admin_audit_append_only();

comment on table public.admin_audit_log is
  'Trilha administrativa imutável. Nunca guardar senha, token, prompt ou conteúdo de cliente.';

create or replace function public.admin_set_plano_override(
  p_actor uuid,
  p_actor_role text,
  p_target uuid,
  p_plano text,
  p_ativo boolean,
  p_ate timestamptz,
  p_motivo text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
begin
  if p_actor is null or p_target is null then
    raise exception 'ator_alvo_obrigatorios';
  end if;
  if p_actor_role not in ('owner', 'admin', 'financeiro') then
    raise exception 'papel_sem_permissao';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 500 then
    raise exception 'motivo_invalido';
  end if;
  if p_request_id is null or char_length(p_request_id) not between 16 and 128 then
    raise exception 'request_id_invalido';
  end if;
  if p_ativo and p_plano not in ('pro', 'empresa') then
    raise exception 'plano_invalido';
  end if;
  if p_ativo and p_ate is not null and p_ate <= now() then
    raise exception 'vigencia_invalida';
  end if;
  if not exists (select 1 from auth.users where id = p_actor) then
    raise exception 'ator_inexistente';
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'alvo_inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text, 0));

  select depois into v_depois
  from public.admin_audit_log
  where actor_user_id = p_actor and request_id = p_request_id
  limit 1;
  if found then
    return v_depois;
  end if;

  select to_jsonb(a) into v_antes
  from public.assinaturas a
  where a.user_id = p_target;

  if p_ativo then
    insert into public.assinaturas (
      user_id, plano, status, stripe_customer_id, stripe_subscription_id,
      current_period_end, admin_plano_override, admin_override_ativo,
      admin_override_ate, admin_override_reason, admin_override_by,
      admin_override_at, atualizado_em
    ) values (
      p_target, p_plano, 'canceled', null, null,
      null, p_plano, true,
      p_ate, btrim(p_motivo), p_actor,
      now(), now()
    )
    on conflict (user_id) do update set
      admin_plano_override = excluded.admin_plano_override,
      admin_override_ativo = true,
      admin_override_ate = excluded.admin_override_ate,
      admin_override_reason = excluded.admin_override_reason,
      admin_override_by = excluded.admin_override_by,
      admin_override_at = excluded.admin_override_at,
      atualizado_em = now();
  else
    update public.assinaturas set
      admin_override_ativo = false,
      admin_override_reason = btrim(p_motivo),
      admin_override_by = p_actor,
      admin_override_at = now(),
      atualizado_em = now()
    where user_id = p_target;
  end if;

  select to_jsonb(a) into v_depois
  from public.assinaturas a
  where a.user_id = p_target;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, acao, target_user_id, motivo, antes, depois, request_id
  ) values (
    p_actor, p_actor_role,
    case when p_ativo then 'plano_manual_concedido' else 'plano_manual_revogado' end,
    p_target, btrim(p_motivo), v_antes, v_depois, p_request_id
  );

  return v_depois;
end;
$$;

revoke all on function public.admin_set_plano_override(uuid,text,uuid,text,boolean,timestamptz,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_set_plano_override(uuid,text,uuid,text,boolean,timestamptz,text,text)
  to service_role;

-- A concessão/revogação de acesso administrativo e a respectiva auditoria
-- precisam ser uma única transação. O Worker resolve o e-mail para um UUID
-- autenticado, mas somente esta RPC service_role efetiva a mudança.
create or replace function public.admin_set_membership(
  p_actor uuid,
  p_actor_role text,
  p_target uuid,
  p_papel text,
  p_ativo boolean,
  p_motivo text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
begin
  if p_actor is null or p_target is null then
    raise exception 'ator_alvo_obrigatorios';
  end if;
  if p_actor_role <> 'owner' then
    raise exception 'papel_sem_permissao';
  end if;
  if p_papel not in ('admin', 'financeiro', 'suporte', 'leitura') then
    raise exception 'papel_invalido';
  end if;
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 500 then
    raise exception 'motivo_invalido';
  end if;
  if p_request_id is null or char_length(p_request_id) not between 16 and 128 then
    raise exception 'request_id_invalido';
  end if;
  if not exists (select 1 from auth.users where id = p_actor) then
    raise exception 'ator_inexistente';
  end if;
  if not exists (select 1 from auth.users where id = p_target) then
    raise exception 'alvo_inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target::text, 0));

  select depois into v_depois
  from public.admin_audit_log
  where actor_user_id = p_actor and request_id = p_request_id
  limit 1;
  if found then
    return v_depois;
  end if;

  select to_jsonb(m) into v_antes
  from public.admin_memberships m
  where m.user_id = p_target;

  insert into public.admin_memberships (
    user_id, papel, ativo, criado_por, criado_em, atualizado_em
  ) values (
    p_target, p_papel, p_ativo, p_actor, now(), now()
  )
  on conflict (user_id) do update set
    papel = excluded.papel,
    ativo = excluded.ativo,
    atualizado_em = now();

  select to_jsonb(m) into v_depois
  from public.admin_memberships m
  where m.user_id = p_target;

  insert into public.admin_audit_log (
    actor_user_id, actor_role, acao, target_user_id, motivo, antes, depois, request_id
  ) values (
    p_actor, p_actor_role,
    case when p_ativo then 'admin_concedido' else 'admin_revogado' end,
    p_target, btrim(p_motivo), v_antes, v_depois, p_request_id
  );

  return v_depois;
end;
$$;

revoke all on function public.admin_set_membership(uuid,text,uuid,text,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.admin_set_membership(uuid,text,uuid,text,boolean,text,text)
  to service_role;

-- Helpers internos não são endpoints. O Postgres concede EXECUTE a PUBLIC por
-- padrão; estas revogações fecham essa superfície sem afetar os triggers/RLS.
revoke all on function public.credit_ledger_append_only() from public, anon, authenticated;
revoke all on function public.sincronizar_revogacao_publico() from public, anon, authenticated;
revoke all on function public.sync_profile_from_auth() from public, anon, authenticated;
revoke all on function public.bloquear_troca_membro() from public, anon, authenticated;
revoke all on function public.bloquear_troca_user_id() from public, anon, authenticated;
revoke all on function public.pmoc_bloquear_versao_congelada() from public, anon, authenticated;

-- perfil_visivel(uuid) é chamado pela policy profiles_visivel. Revogar seu
-- EXECUTE de authenticated faria a própria RLS falhar; fechamos apenas os
-- papéis que não participam dessa policy e preservamos o contrato explícito.
revoke all on function public.perfil_visivel(uuid) from public, anon;
grant execute on function public.perfil_visivel(uuid) to authenticated, service_role;

-- Rollback operacional (somente se o código antigo precisar voltar):
--   1. desative endpoints de mutação no Worker;
--   2. mantenha as tabelas de auditoria (não apagar evidência);
--   3. marque admin_override_ativo=false em todas as assinaturas;
--   4. o código antigo ignora as colunas extras de forma segura.
