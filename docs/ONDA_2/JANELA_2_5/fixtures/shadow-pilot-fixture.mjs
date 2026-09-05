import {
  InMemoryCanonicalStore,
  InMemoryPilotPolicyStore,
  InMemoryShadowMetrics,
  InMemoryShadowProjectionStore,
} from '../shadow/increment-a-shadow-pilot.mjs';

import {
  FIXTURE_CLIENT_A,
  FIXTURE_CLIENT_B,
  FIXTURE_LOCATION_A,
  FIXTURE_LOCATION_B,
  FIXTURE_MEMBERSHIP_MULTI_A,
  FIXTURE_MEMBERSHIP_MULTI_B,
  FIXTURE_MEMBERSHIP_OWNER_A,
  FIXTURE_MEMBERSHIP_REVOKED_A,
  FIXTURE_MEMBERSHIP_VIEWER_A,
  FIXTURE_ORG_A,
  FIXTURE_ORG_B,
  FIXTURE_USER_MULTI,
  FIXTURE_USER_OWNER_A,
  FIXTURE_USER_REVOKED_A,
  FIXTURE_USER_VIEWER_A,
} from '../../JANELA_2_1/fixtures/synthetic.mjs';

export * from '../../JANELA_2_1/fixtures/synthetic.mjs';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const SHADOW_OBSERVED_AT = '2026-08-29T13:00:00.000Z';

export const FIXTURE_SCOPE_CLIENT_A = deepFreeze({
  organization_id: FIXTURE_ORG_A,
  aggregate_type: 'client',
  aggregate_id: FIXTURE_CLIENT_A.client_id,
});

export const FIXTURE_SCOPE_CLIENT_B = deepFreeze({
  organization_id: FIXTURE_ORG_B,
  aggregate_type: 'client',
  aggregate_id: FIXTURE_CLIENT_B.client_id,
});

export const FIXTURE_SCOPE_LOCATION_A = deepFreeze({
  organization_id: FIXTURE_ORG_A,
  aggregate_type: 'location',
  aggregate_id: FIXTURE_LOCATION_A.location_id,
});

export const FIXTURE_SCOPE_LOCATION_B = deepFreeze({
  organization_id: FIXTURE_ORG_B,
  aggregate_type: 'location',
  aggregate_id: FIXTURE_LOCATION_B.location_id,
});

export function trustedSession(sessionUserId) {
  return { session_user_id: sessionUserId };
}

export function clientVersion(
  version,
  displayName = `Cliente Sintético Alfa V${version}`,
) {
  return {
    ...FIXTURE_CLIENT_A,
    display_name: displayName,
    version,
    updated_at: new Date(
      Date.parse(FIXTURE_CLIENT_A.updated_at) + (version - 1) * 1_000,
    ).toISOString(),
  };
}

export function locationVersion(
  version,
  label = `Local Sintético Alfa V${version}`,
) {
  return {
    ...FIXTURE_LOCATION_A,
    label,
    version,
    updated_at: new Date(
      Date.parse(FIXTURE_LOCATION_A.updated_at) + (version - 1) * 1_000,
    ).toISOString(),
  };
}

export function createShadowPilotFixture({
  clientPolicy = {},
  clock,
  locationPolicy = {},
} = {}) {
  const canonicalStore = new InMemoryCanonicalStore({
    clients: [FIXTURE_CLIENT_A, FIXTURE_CLIENT_B],
    locations: [FIXTURE_LOCATION_A, FIXTURE_LOCATION_B],
  });
  const projectionStore = new InMemoryShadowProjectionStore({
    memberships: [
      FIXTURE_MEMBERSHIP_OWNER_A,
      FIXTURE_MEMBERSHIP_VIEWER_A,
      FIXTURE_MEMBERSHIP_REVOKED_A,
      FIXTURE_MEMBERSHIP_MULTI_A,
      FIXTURE_MEMBERSHIP_MULTI_B,
    ],
  });
  const metrics = new InMemoryShadowMetrics();
  let observationSequence = 0;
  const internalClock = clock ?? (() => new Date(
    Date.parse(SHADOW_OBSERVED_AT) + observationSequence++ * 1_000,
  ).toISOString());
  const policyStore = new InMemoryPilotPolicyStore({
    canonicalStore,
    clock: internalClock,
    projectionStore,
    entries: [
      {
        ...FIXTURE_SCOPE_CLIENT_A,
        phase: 'legacy',
        policy_version: 1,
        cutover_version: null,
        last_gate_observed_at: null,
        pending_outbox_count: 0,
        audit_event_count: 4,
        ...clientPolicy,
      },
      {
        ...FIXTURE_SCOPE_LOCATION_A,
        phase: 'legacy',
        policy_version: 1,
        cutover_version: null,
        last_gate_observed_at: null,
        pending_outbox_count: 0,
        audit_event_count: 2,
        ...locationPolicy,
      },
      {
        ...FIXTURE_SCOPE_CLIENT_B,
        phase: 'legacy',
        policy_version: 1,
        cutover_version: null,
        last_gate_observed_at: null,
        pending_outbox_count: 0,
        audit_event_count: 1,
      },
    ],
  });
  return {
    canonicalStore,
    projectionStore,
    metrics,
    policyStore,
    sessions: deepFreeze({
      ownerA: trustedSession(FIXTURE_USER_OWNER_A),
      viewerA: trustedSession(FIXTURE_USER_VIEWER_A),
      revokedA: trustedSession(FIXTURE_USER_REVOKED_A),
      multi: trustedSession(FIXTURE_USER_MULTI),
    }),
  };
}
