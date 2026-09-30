import {
  FIXTURE_CLIENT_A,
  FIXTURE_CLIENT_B,
  FIXTURE_LOCATION_A,
  FIXTURE_LOCATION_B,
  FIXTURE_NOW,
  FIXTURE_ORG_A,
  FIXTURE_ORGANIZATION_A,
} from '../../../ONDA_2/JANELA_2_1/fixtures/synthetic.mjs';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

export { FIXTURE_CLIENT_A, FIXTURE_CLIENT_B, FIXTURE_LOCATION_A, FIXTURE_LOCATION_B, FIXTURE_NOW, FIXTURE_ORG_A };
export const FIXTURE_EQUIPMENT_A = freeze({
  organization_id: FIXTURE_ORG_A,
  equipment_id: 'equipment-fixture-a-1',
  client_id: FIXTURE_CLIENT_A.client_id,
  location_id: FIXTURE_LOCATION_A.location_id,
  category: 'split',
  label: 'Evaporadora Sintética Alfa',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});
export const FIXTURE_EQUIPMENT_B = freeze({
  organization_id: FIXTURE_ORG_A,
  equipment_id: 'equipment-fixture-a-2',
  client_id: FIXTURE_CLIENT_A.client_id,
  location_id: FIXTURE_LOCATION_A.location_id,
  category: 'cassete',
  label: 'Condensadora Sintética Alfa',
  status: 'active',
  version: 1,
  updated_at: FIXTURE_NOW,
});

export function createShadowBaselineFixture() {
  return freeze({
    organization: FIXTURE_ORGANIZATION_A,
    clients: [FIXTURE_CLIENT_A],
    locations: [FIXTURE_LOCATION_A],
    equipment: [FIXTURE_EQUIPMENT_A, FIXTURE_EQUIPMENT_B],
  });
}
