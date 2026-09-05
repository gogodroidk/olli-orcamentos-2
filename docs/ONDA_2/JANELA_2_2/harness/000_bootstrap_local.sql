-- SOMENTE BANCO LOCAL DESCARTÁVEL.
-- Simula os pré-requisitos mínimos que Supabase fornece no ambiente alvo.

do $local_database_guard$
declare
  server_address inet := pg_catalog.inet_server_addr();
begin
  if pg_catalog.current_database() !~ '^olli_[A-Za-z0-9_]+$' then
    raise exception
      'Harness recusado: o banco deve começar com olli_.';
  end if;

  if (
    server_address is not null
    and not (
      server_address << inet '127.0.0.0/8'
      or server_address = inet '::1'
    )
  ) then
    raise exception
      'Harness recusado: o servidor PostgreSQL não é loopback.';
  end if;
end;
$local_database_guard$;

do $bootstrap$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'authenticated'
  ) then
    create role authenticated nologin noinherit;
  end if;
end;
$bootstrap$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $function$
  select nullif(
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid;
$function$;

revoke all on schema auth from public;
revoke all on function auth.uid() from public;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
