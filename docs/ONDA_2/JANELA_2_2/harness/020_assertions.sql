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

-- Owner A enxerga somente o tenant A.
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000001',
  true
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.organizations),
  1,
  'owner A deve enxergar uma organização'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  1,
  'owner A não pode enxergar cliente B'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.locations),
  1,
  'owner A não pode enxergar local B'
);
rollback;

-- Usuário multiempresa enxerga exatamente A e B, sem herdar escrita direta.
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000005',
  true
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.organizations),
  2,
  'usuário A+B deve enxergar duas organizações'
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  2,
  'usuário A+B deve enxergar clientes dos dois tenants'
);
do $negative_direct_write$
begin
  begin
    insert into olli_v2.clients (
      id,
      organization_id,
      display_name,
      status,
      version
    )
    values (
      '30000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-00000000000a',
      'Escrita Direta Proibida',
      'active',
      1
    );
    raise exception 'escrita direta autenticada foi aceita';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$negative_direct_write$;
rollback;

-- Viewer lê, mas não recebe escrita direta.
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000003',
  true
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  1,
  'viewer A deve ler o cliente A'
);
rollback;

-- Revogado e outsider falham fechado.
begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000004',
  true
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  0,
  'membership revogada não autoriza leitura'
);
rollback;

begin;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000099',
  true
);
select pg_temp.assert_equal(
  (select count(*) from olli_v2.clients),
  0,
  'outsider não autoriza leitura'
);
rollback;

-- Co-tenancy é constraint de banco, não convenção da aplicação.
begin;
do $negative_cross_tenant_location$
begin
  begin
    insert into olli_v2.locations (
      id,
      organization_id,
      client_id,
      label,
      status,
      version
    )
    values (
      '40000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-00000000000a',
      '30000000-0000-4000-8000-00000000000b',
      'Relação Cross-Tenant Proibida',
      'active',
      1
    );
    raise exception 'FK composta aceitou cliente de outro tenant';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$negative_cross_tenant_location$;
rollback;

-- create_* exige versão zero.
begin;
do $negative_create_version$
begin
  begin
    insert into olli_v2.command_ledger (
      command_id,
      organization_id,
      idempotency_key,
      protocol_version,
      schema_version,
      aggregate_type,
      aggregate_id,
      expected_version,
      operation,
      payload_hash,
      actor_user_id,
      state
    )
    values (
      '50000000-0000-4000-8000-000000000099',
      '00000000-0000-4000-8000-00000000000a',
      'idem.invalid.version',
      1,
      1,
      'client',
      '30000000-0000-4000-8000-000000000099',
      1,
      'create_client',
      repeat('a', 64),
      '20000000-0000-4000-8000-000000000001',
      'processing'
    );
    raise exception 'create_client aceitou expected_version diferente de zero';
  exception
    when check_violation then
      null;
  end;
end;
$negative_create_version$;
rollback;

-- O mesmo par organização/chave é único. Outro tenant tem namespace próprio.
insert into olli_v2.command_ledger (
  command_id,
  organization_id,
  idempotency_key,
  protocol_version,
  schema_version,
  aggregate_type,
  aggregate_id,
  expected_version,
  operation,
  payload_hash,
  actor_user_id,
  state,
  result_code,
  canonical_version,
  safe_result,
  completed_at
)
values (
  '50000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a',
  'idem.shared.001',
  1,
  1,
  'client',
  '30000000-0000-4000-8000-00000000000a',
  0,
  'create_client',
  repeat('a', 64),
  '20000000-0000-4000-8000-000000000001',
  'acked',
  'applied',
  1,
  '{"state":"acked","code":"applied"}'::jsonb,
  now()
);

do $negative_idempotency_reuse$
begin
  begin
    insert into olli_v2.command_ledger (
      command_id,
      organization_id,
      idempotency_key,
      protocol_version,
      schema_version,
      aggregate_type,
      aggregate_id,
      expected_version,
      operation,
      payload_hash,
      actor_user_id,
      state,
      result_code,
      completed_at
    )
    values (
      '50000000-0000-4000-8000-000000000098',
      '00000000-0000-4000-8000-00000000000a',
      'idem.shared.001',
      1,
      1,
      'client',
      '30000000-0000-4000-8000-000000000098',
      0,
      'create_client',
      repeat('b', 64),
      '20000000-0000-4000-8000-000000000001',
      'rejected',
      'idempotency_key_reused',
      now()
    );
    raise exception 'chave idempotente conflitante foi aceita';
  exception
    when unique_violation then
      null;
  end;
end;
$negative_idempotency_reuse$;

insert into olli_v2.command_ledger (
  command_id,
  organization_id,
  idempotency_key,
  protocol_version,
  schema_version,
  aggregate_type,
  aggregate_id,
  expected_version,
  operation,
  payload_hash,
  actor_user_id,
  state,
  result_code,
  canonical_version,
  safe_result,
  completed_at
)
values (
  '50000000-0000-4000-8000-00000000000b',
  '00000000-0000-4000-8000-00000000000b',
  'idem.shared.001',
  1,
  1,
  'client',
  '30000000-0000-4000-8000-00000000000b',
  0,
  'create_client',
  repeat('b', 64),
  '20000000-0000-4000-8000-000000000006',
  'acked',
  'applied',
  1,
  '{"state":"acked","code":"applied"}'::jsonb,
  now()
);

select pg_temp.assert_equal(
  (
    select count(*)
    from olli_v2.command_ledger
    where idempotency_key = 'idem.shared.001'
  ),
  2,
  'namespace idempotente deve ser por organização'
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
  'as cinco tabelas devem manter RLS habilitado e forçado'
);

select pg_temp.assert_equal(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'olli_v2'
  ),
  20,
  'cada tabela deve possuir policies explícitas para quatro operações'
);

select pg_temp.assert_equal(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'olli_v2'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ),
  0,
  'authenticated não pode receber escrita direta'
);

select 'POSTGRES_ASSERTIONS=PASS' as result;
