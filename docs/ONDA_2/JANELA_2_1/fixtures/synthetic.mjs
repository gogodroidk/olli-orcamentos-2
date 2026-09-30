function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const FIXTURE_NOW = '2026-08-28T21:30:00.000Z';
export const FIXTURE_ORG_A = 'org-fixture-a';
export const FIXTURE_ORG_B = 'org-fixture-b';
export const FIXTURE_USER_OWNER_A = 'user-owner-fixture-a';
export const FIXTURE_USER_MANAGER_A = 'user-manager-fixture-a';
export const FIXTURE_USER_TECH_A = 'user-tech-fixture-a';
export const FIXTURE_USER_TECH_LIMITED_A = 'user-tech-limited-fixture-a';
export const FIXTURE_USER_VIEWER_A = 'user-viewer-fixture-a';
export const FIXTURE_USER_REVOKED_A = 'user-revoked-fixture-a';
export const FIXTURE_USER_MULTI = 'user-multi-fixture';
export const FIXTURE_USER_OUTSIDER_B = 'user-outsider-fixture-b';

export const FIXTURE_ORGANIZATION_A = deepFreeze({
  organization_id: FIXTURE_ORG_A,
  display_name: 'Empresa Sintética Alfa',
  status: 'active',
  version: 1,
  created_at: FIXTURE_NOW,
  updated_at: FIXTURE_NOW,
});

export const FIXTURE_ORGANIZATION_B = deepFreeze({
  organization_id: FIXTURE_ORG_B,
  display_name: 'Empresa Sintética Beta',
  status: 'active',
  version: 1,
  created_at: FIXTURE_NOW,
  updated_at: FIXTURE_NOW,
});

function membership({ organizationId, userId, role, status = 'active', capabilities = [] }) {
  return deepFreeze({
    organization_id: organizationId,
    user_id: userId,
    role,
    status,
    capabilities,
    membership_version: 1,
    updated_at: FIXTURE_NOW,
  });
}

export const FIXTURE_MEMBERSHIP_OWNER_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_OWNER_A,
  role: 'owner',
  capabilities: ['clients_locations.read', 'clients_locations.write'],
});

export const FIXTURE_MEMBERSHIP_MANAGER_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_MANAGER_A,
  role: 'manager',
  capabilities: ['clients_locations.read', 'clients_locations.write'],
});

export const FIXTURE_MEMBERSHIP_TECH_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_TECH_A,
  role: 'technician',
  capabilities: ['clients_locations.read', 'clients_locations.write'],
});

export const FIXTURE_MEMBERSHIP_TECH_LIMITED_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_TECH_LIMITED_A,
  role: 'technician',
  capabilities: ['clients_locations.read'],
});

export const FIXTURE_MEMBERSHIP_VIEWER_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_VIEWER_A,
  role: 'viewer',
  capabilities: ['clients_locations.read'],
});

export const FIXTURE_MEMBERSHIP_REVOKED_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_REVOKED_A,
  role: 'technician',
  status: 'revoked',
  capabilities: ['clients_locations.write'],
});

export const FIXTURE_MEMBERSHIP_MULTI_A = membership({
  organizationId: FIXTURE_ORG_A,
  userId: FIXTURE_USER_MULTI,
  role: 'manager',
  capabilities: ['clients_locations.read', 'clients_locations.write'],
});

export const FIXTURE_MEMBERSHIP_MULTI_B = membership({
  organizationId: FIXTURE_ORG_B,
  userId: FIXTURE_USER_MULTI,
  role: 'viewer',
  capabilities: ['clients_locations.read'],
});

export const FIXTURE_MEMBERSHIP_OUTSIDER_B = membership({
  organizationId: FIXTURE_ORG_B,
  userId: FIXTURE_USER_OUTSIDER_B,
  role: 'owner',
  capabilities: ['clients_locations.read', 'clients_locations.write'],
});

export const FIXTURE_CLIENT_A = deepFreeze({
  organization_id: FIXTURE_ORG_A,
  client_id: 'client-fixture-a-1',
  display_name: 'Cliente Sintético Alfa',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});

export const FIXTURE_CLIENT_B = deepFreeze({
  organization_id: FIXTURE_ORG_B,
  client_id: 'client-fixture-b-1',
  display_name: 'Cliente Sintético Beta',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});

export const FIXTURE_LOCATION_A = deepFreeze({
  organization_id: FIXTURE_ORG_A,
  location_id: 'location-fixture-a-1',
  client_id: FIXTURE_CLIENT_A.client_id,
  label: 'Local Sintético Alfa',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});

export const FIXTURE_LOCATION_B = deepFreeze({
  organization_id: FIXTURE_ORG_B,
  location_id: 'location-fixture-b-1',
  client_id: FIXTURE_CLIENT_B.client_id,
  label: 'Local Sintético Beta',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});

const BASE_COMMAND = deepFreeze({
  command_id: 'command-fixture-create-client-a',
  idempotency_key: 'idem-fixture-create-client-a',
  protocol_version: 1,
  schema_version: 1,
  organization_id: FIXTURE_ORG_A,
  aggregate_type: 'client',
  aggregate_id: 'client-fixture-a-new',
  expected_version: 0,
  operation: 'create_client',
  payload: {
    display_name: 'Novo Cliente Sintético',
    status: 'active',
  },
  created_at_local: FIXTURE_NOW,
  device_id: 'device-fixture-a-1',
});

export function makeFixtureCommand(overrides = {}) {
  return {
    ...BASE_COMMAND,
    ...overrides,
    payload: overrides.payload ? { ...overrides.payload } : { ...BASE_COMMAND.payload },
  };
}

export const FIXTURE_CREATE_CLIENT_COMMAND = deepFreeze(makeFixtureCommand());

export const FIXTURE_UPDATE_CLIENT_COMMAND = deepFreeze(makeFixtureCommand({
  command_id: 'command-fixture-update-client-a',
  idempotency_key: 'idem-fixture-update-client-a',
  aggregate_id: FIXTURE_CLIENT_A.client_id,
  expected_version: 1,
  operation: 'update_client',
  payload: { display_name: 'Cliente Sintético Alfa Revisado' },
}));

export const FIXTURE_CREATE_LOCATION_COMMAND = deepFreeze(makeFixtureCommand({
  command_id: 'command-fixture-create-location-a',
  idempotency_key: 'idem-fixture-create-location-a',
  aggregate_type: 'location',
  aggregate_id: 'location-fixture-a-new',
  operation: 'create_location',
  payload: {
    client_id: FIXTURE_CLIENT_A.client_id,
    label: 'Novo Local Sintético',
    status: 'active',
  },
}));

export const FIXTURE_UPDATE_LOCATION_COMMAND = deepFreeze(makeFixtureCommand({
  command_id: 'command-fixture-update-location-a',
  idempotency_key: 'idem-fixture-update-location-a',
  aggregate_type: 'location',
  aggregate_id: FIXTURE_LOCATION_A.location_id,
  expected_version: 1,
  operation: 'update_location',
  payload: { label: 'Local Sintético Alfa Revisado' },
}));
