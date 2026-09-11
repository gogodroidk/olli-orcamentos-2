import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  createShadowBaseline,
  projectAggregate,
  SHADOW_CONTRACT_LIMITS,
} from '../kernel/shadow-baseline.mjs';
import {
  FIXTURE_EQUIPMENT_A,
  FIXTURE_EQUIPMENT_B,
  createShadowBaselineFixture,
} from '../fixtures/synthetic.mjs';

test('projeta organização, cliente, local e equipamento com decisão determinística', () => {
  const result = createShadowBaseline(createShadowBaselineFixture());
  assert.equal(result.projections.length, 5);
  assert.deepEqual(result.decisions.map(({ aggregate_type }) => aggregate_type), [
    'organization', 'client', 'location', 'equipment', 'equipment',
  ]);
  assert.ok(result.decisions.every(({ decision, projection_digest }) => (
    decision === 'projected_local_only' && /^[a-f0-9]{64}$/.test(projection_digest)
  )));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(SHADOW_CONTRACT_LIMITS.writes, 'none');
  assert.equal(SHADOW_CONTRACT_LIMITS.network, false);
  assert.equal(new Set(result.projections.map(({ aggregate_type, aggregate_id }) => `${aggregate_type}:${aggregate_id}`)).size, result.projections.length);
  assert.equal(new Set(result.decisions.map(({ aggregate_type, aggregate_id }) => `${aggregate_type}:${aggregate_id}`)).size, result.decisions.length);
});

test('rejeita identidades duplicadas antes de produzir projeções ou decisões', () => {
  const fixture = createShadowBaselineFixture();
  assert.throws(() => createShadowBaseline({
    ...fixture,
    clients: [fixture.clients[0], { ...fixture.clients[0], display_name: 'Conflito sintético' }],
  }), /client_id duplicado/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    locations: [fixture.locations[0], { ...fixture.locations[0], label: 'Conflito sintético' }],
  }), /location_id duplicado/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [FIXTURE_EQUIPMENT_A, { ...FIXTURE_EQUIPMENT_A, version: 2, label: 'Conflito sintético' }],
  }), /equipment_id duplicado/);
});

test('exige timestamps UTC canônicos e cronologia válida', () => {
  const fixture = createShadowBaselineFixture();
  assert.throws(() => createShadowBaseline({
    ...fixture,
    organization: { ...fixture.organization, updated_at: '2026-08-30' },
  }), /RFC 3339 UTC com milissegundos/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [{ ...FIXTURE_EQUIPMENT_A, updated_at: '2026-08-30T12:00:00Z' }],
  }), /RFC 3339 UTC com milissegundos/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    organization: {
      ...fixture.organization,
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-30T00:00:00.000Z',
    },
  }), /anterior a created_at/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [{ ...FIXTURE_EQUIPMENT_A, updated_at: '2026-02-30T00:00:00.000Z' }],
  }), /data calendária impossível/);
});

test('rejeita equipamento que atravessa tenant ou local do cliente', () => {
  const fixture = createShadowBaselineFixture();
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [{ ...FIXTURE_EQUIPMENT_A, location_id: 'location-outro-tenant' }],
  }), /fora do local do cliente/);
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [{ ...FIXTURE_EQUIPMENT_B, organization_id: 'org-fixture-b' }],
  }), /tenant/);
});

test('projeção de equipamento é allowlistada e imutável', () => {
  const fixture = createShadowBaselineFixture();
  const baseline = createShadowBaseline(fixture);
  const equipment = baseline.projections.find((item) => item.aggregate_type === 'equipment');
  assert.deepEqual(Object.keys(equipment).sort(), [
    'aggregate_id', 'aggregate_type', 'aggregate_version', 'category',
    'client_id', 'label', 'location_id', 'organization_id', 'schema_version',
    'status', 'updated_at',
  ]);
  assert.equal(Object.isFrozen(equipment), true);
  assert.throws(() => { equipment.label = 'mutado'; }, TypeError);
});

test('fontes do contrato não importam runtime, sync, banco ou rede', async () => {
  const [kernel, fixture] = await Promise.all([
    readFile(new URL('../kernel/shadow-baseline.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../fixtures/synthetic.mjs', import.meta.url), 'utf8'),
  ]);
  const source = `${kernel}\n${fixture}`;
  assert.doesNotMatch(source, /database|cloudSync|supabase|fetch\(|axios|https?:/i);
});

test('projeções repetidas geram a mesma trilha sem ler estado externo', () => {
  const fixture = createShadowBaselineFixture();
  const first = createShadowBaseline(fixture);
  const second = createShadowBaseline(fixture);
  assert.deepEqual(first.decisions, second.decisions);
  assert.equal(projectAggregate('equipment', FIXTURE_EQUIPMENT_A, {
    clients: new Map([[fixture.clients[0].client_id, fixture.clients[0]]]),
    locations: new Map([[fixture.locations[0].location_id, fixture.locations[0]]]),
  }).aggregate_id, FIXTURE_EQUIPMENT_A.equipment_id);
});

test('rejeita propriedades Symbol e não congela objetos de entrada', () => {
  const fixture = createShadowBaselineFixture();
  const mutableClient = { ...fixture.clients[0] };
  const mutableLocation = { ...fixture.locations[0] };
  const mutableEquipment = { ...FIXTURE_EQUIPMENT_A };
  createShadowBaseline({
    organization: { ...fixture.organization },
    clients: [mutableClient],
    locations: [mutableLocation],
    equipment: [mutableEquipment],
  });
  assert.equal(Object.isFrozen(mutableClient), false);
  assert.equal(Object.isFrozen(mutableLocation), false);
  assert.equal(Object.isFrozen(mutableEquipment), false);

  const equipmentWithSymbol = { ...FIXTURE_EQUIPMENT_A };
  equipmentWithSymbol[Symbol('fora-da-allowlist')] = 'não permitido';
  assert.throws(() => createShadowBaseline({
    ...fixture,
    equipment: [equipmentWithSymbol],
  }), /fora da allowlist/);
});
