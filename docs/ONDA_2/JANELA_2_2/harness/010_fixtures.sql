-- Fixtures exclusivamente sintéticas.

begin;

insert into olli_v2.organizations (
  id,
  display_name,
  status,
  version,
  v2_commands_enabled
)
values
  (
    '00000000-0000-4000-8000-00000000000a',
    'Organização Sintética A',
    'active',
    1,
    true
  ),
  (
    '00000000-0000-4000-8000-00000000000b',
    'Organização Sintética B',
    'active',
    1,
    true
  );

insert into olli_v2.organization_memberships (
  id,
  organization_id,
  user_id,
  role,
  status,
  capabilities,
  version
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-000000000001',
    'owner',
    'active',
    array[
      'clients_locations.read',
      'clients_locations.write'
    ]::text[],
    1
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-000000000002',
    'technician',
    'active',
    array[
      'clients_locations.read',
      'clients_locations.write'
    ]::text[],
    1
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-000000000003',
    'viewer',
    'active',
    array[]::text[],
    1
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-000000000004',
    'manager',
    'revoked',
    array[
      'clients_locations.read',
      'clients_locations.write'
    ]::text[],
    2
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-00000000000a',
    '20000000-0000-4000-8000-000000000005',
    'manager',
    'active',
    array[
      'clients_locations.read',
      'clients_locations.write'
    ]::text[],
    1
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-00000000000b',
    '20000000-0000-4000-8000-000000000005',
    'viewer',
    'active',
    array[]::text[],
    1
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-00000000000b',
    '20000000-0000-4000-8000-000000000006',
    'owner',
    'active',
    array[
      'clients_locations.read',
      'clients_locations.write'
    ]::text[],
    1
  );

insert into olli_v2.clients (
  id,
  organization_id,
  display_name,
  status,
  version
)
values
  (
    '30000000-0000-4000-8000-00000000000a',
    '00000000-0000-4000-8000-00000000000a',
    'Cliente Sintético A',
    'active',
    1
  ),
  (
    '30000000-0000-4000-8000-00000000000b',
    '00000000-0000-4000-8000-00000000000b',
    'Cliente Sintético B',
    'active',
    1
  );

insert into olli_v2.locations (
  id,
  organization_id,
  client_id,
  label,
  status,
  version
)
values
  (
    '40000000-0000-4000-8000-00000000000a',
    '00000000-0000-4000-8000-00000000000a',
    '30000000-0000-4000-8000-00000000000a',
    'Local Sintético A',
    'active',
    1
  ),
  (
    '40000000-0000-4000-8000-00000000000b',
    '00000000-0000-4000-8000-00000000000b',
    '30000000-0000-4000-8000-00000000000b',
    'Local Sintético B',
    'active',
    1
  );

commit;
