\set ON_ERROR_STOP on

create or replace function pg_temp.assert_equal(
  p_actual bigint,
  p_expected bigint,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if p_actual is distinct from p_expected then
    raise exception
      'ASSERT_EQUAL falhou: %; esperado=%, atual=%',
      p_message,
      p_expected,
      p_actual;
  end if;
end;
$function$;

select pg_temp.assert_equal(
  (select count(*) from olli_v2.organizations),
  2,
  'rollback deve preservar organizações'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.organization_memberships),
  7,
  'rollback deve preservar memberships'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  2,
  'rollback deve preservar clientes'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.locations),
  2,
  'rollback deve preservar locais'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.command_ledger),
  2,
  'rollback deve preservar ledger idempotente'
);
select pg_temp.assert_equal(
  (
    select count(*)
    from olli_v2.organizations
    where v2_commands_enabled
  ),
  0,
  'rollback deve bloquear novos comandos V2'
);
select pg_temp.assert_equal(
  (
    select count(*)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'olli_v2'
      and relation.relname in (
        'organizations',
        'organization_memberships',
        'clients',
        'locations',
        'command_ledger'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  5,
  'rollback não pode desabilitar RLS'
);
select pg_temp.assert_equal(
  (
    select case
      when pg_catalog.has_schema_privilege(
        'authenticated',
        'olli_v2',
        'USAGE'
      )
      then 1
      else 0
    end
  ),
  0,
  'rollback deve remover uso autenticado do schema V2'
);

select 'ROLLBACK_ASSERTIONS=PASS' as result;
