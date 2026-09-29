-- Telemetria operacional mínima para o painel administrativo.
-- Não armazena prompt, resposta, senha, token, IP ou conteúdo de cliente.

create table if not exists public.user_activity_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  evento       text not null check (evento in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create'
  )),
  plataforma   text not null default 'unknown' check (plataforma in (
    'web', 'ios', 'android', 'desktop', 'unknown'
  )),
  criado_em    timestamptz not null default now()
);

create index if not exists user_activity_log_user_created_idx
  on public.user_activity_log (user_id, criado_em desc);

create index if not exists user_activity_log_event_created_idx
  on public.user_activity_log (evento, criado_em desc);

alter table public.user_activity_log enable row level security;

revoke all on table public.user_activity_log from anon, authenticated;
grant insert on table public.user_activity_log to authenticated;

drop policy if exists user_activity_log_insert_own on public.user_activity_log;
create policy user_activity_log_insert_own
  on public.user_activity_log
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create or replace function public.registrar_atividade_usuario(
  p_evento text,
  p_plataforma text default 'unknown'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  novo_id bigint;
  evento_normalizado text := lower(trim(coalesce(p_evento, '')));
  plataforma_normalizada text := lower(trim(coalesce(p_plataforma, 'unknown')));
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated';
  end if;

  if evento_normalizado not in (
    'login', 'app_open', 'ia_use', 'document_create', 'quote_create', 'client_create'
  ) then
    raise exception 'evento_invalido';
  end if;

  if plataforma_normalizada not in ('web', 'ios', 'android', 'desktop', 'unknown') then
    plataforma_normalizada := 'unknown';
  end if;

  insert into public.user_activity_log (user_id, evento, plataforma)
  values ((select auth.uid()), evento_normalizado, plataforma_normalizada)
  returning id into novo_id;

  return novo_id;
end;
$$;

revoke all on function public.registrar_atividade_usuario(text, text) from public, anon;
grant execute on function public.registrar_atividade_usuario(text, text) to authenticated;

