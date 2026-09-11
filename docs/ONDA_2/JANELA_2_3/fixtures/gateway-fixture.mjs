import {
  InMemoryGatewayStore,
  createIncrementAGateway,
} from '../gateway/increment-a-gateway.mjs';

import {
  FIXTURE_CLIENT_A,
  FIXTURE_CLIENT_B,
  FIXTURE_LOCATION_A,
  FIXTURE_LOCATION_B,
  FIXTURE_MEMBERSHIP_MANAGER_A,
  FIXTURE_MEMBERSHIP_MULTI_A,
  FIXTURE_MEMBERSHIP_MULTI_B,
  FIXTURE_MEMBERSHIP_OUTSIDER_B,
  FIXTURE_MEMBERSHIP_OWNER_A,
  FIXTURE_MEMBERSHIP_REVOKED_A,
  FIXTURE_MEMBERSHIP_TECH_A,
  FIXTURE_MEMBERSHIP_TECH_LIMITED_A,
  FIXTURE_MEMBERSHIP_VIEWER_A,
  FIXTURE_ORGANIZATION_A,
  FIXTURE_ORGANIZATION_B,
} from '../../JANELA_2_1/fixtures/synthetic.mjs';

export * from '../../JANELA_2_1/fixtures/synthetic.mjs';

const SERVER_TIME_BASE = Date.parse('2026-08-28T22:00:00.000Z');

export function trustedSession(sessionUserId) {
  return { session_user_id: sessionUserId };
}

export function createGatewayFixture() {
  let tick = 0;
  const store = new InMemoryGatewayStore({
    organizations: [
      {
        ...FIXTURE_ORGANIZATION_A,
        v2_commands_enabled: true,
      },
      {
        ...FIXTURE_ORGANIZATION_B,
        v2_commands_enabled: true,
      },
    ],
    memberships: [
      FIXTURE_MEMBERSHIP_OWNER_A,
      FIXTURE_MEMBERSHIP_MANAGER_A,
      FIXTURE_MEMBERSHIP_TECH_A,
      FIXTURE_MEMBERSHIP_TECH_LIMITED_A,
      FIXTURE_MEMBERSHIP_VIEWER_A,
      FIXTURE_MEMBERSHIP_REVOKED_A,
      FIXTURE_MEMBERSHIP_MULTI_A,
      FIXTURE_MEMBERSHIP_MULTI_B,
      FIXTURE_MEMBERSHIP_OUTSIDER_B,
    ],
    clients: [
      FIXTURE_CLIENT_A,
      FIXTURE_CLIENT_B,
    ],
    locations: [
      FIXTURE_LOCATION_A,
      FIXTURE_LOCATION_B,
    ],
  });
  const gateway = createIncrementAGateway({
    store,
    clock() {
      const value = new Date(
        SERVER_TIME_BASE + tick * 1000,
      ).toISOString();
      tick += 1;
      return value;
    },
  });
  return { gateway, store };
}
