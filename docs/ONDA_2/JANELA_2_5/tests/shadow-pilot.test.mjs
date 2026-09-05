import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InMemoryCanonicalStore,
  InMemoryPilotPolicyStore,
  InMemoryShadowProjectionStore,
  ShadowBoundaryError,
  compareShadow,
  createProjectionEvent,
  projectV2ToLegacy,
} from '../shadow/increment-a-shadow-pilot.mjs';

import {
  FIXTURE_CLIENT_A,
  FIXTURE_CLIENT_B,
  FIXTURE_LOCATION_A,
  FIXTURE_ORG_A,
  FIXTURE_SCOPE_CLIENT_A,
  FIXTURE_SCOPE_CLIENT_B,
  FIXTURE_SCOPE_LOCATION_A,
  SHADOW_OBSERVED_AT,
  clientVersion,
  createShadowPilotFixture,
  locationVersion,
  trustedSession,
} from '../fixtures/shadow-pilot-fixture.mjs';

function eventForClient(version, eventId, name) {
  return createProjectionEvent(
    'client',
    clientVersion(version, name),
    eventId,
  );
}

function prepareClientCutover(fixture, version = 1) {
  const canonical = version === 1 ? FIXTURE_CLIENT_A : clientVersion(version);
  fixture.projectionStore.apply(createProjectionEvent(
    'client',
    canonical,
    `event-cutover-client-v${version}`,
  ));
  fixture.policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
}

function prepareLocationCutover(fixture) {
  fixture.projectionStore.apply(createProjectionEvent(
    'client',
    FIXTURE_CLIENT_A,
    'event-cutover-parent-client-v1',
  ));
  fixture.projectionStore.apply(createProjectionEvent(
    'location',
    FIXTURE_LOCATION_A,
    'event-cutover-location-v1',
    FIXTURE_CLIENT_A,
  ), FIXTURE_CLIENT_A);
  fixture.policyStore.enableShadow(FIXTURE_SCOPE_LOCATION_A, 1);
}

function cutoverGate({ expectedPolicyVersion = 2 } = {}) {
  return {
    expected_policy_version: expectedPolicyVersion,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => (
    error instanceof ShadowBoundaryError && error.code === code
  ));
}

test('projeção de cliente é determinística, allowlistada e imutável', () => {
  const first = projectV2ToLegacy('client', FIXTURE_CLIENT_A);
  const second = projectV2ToLegacy('client', structuredClone(FIXTURE_CLIENT_A));
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    'schema_version',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
    'aggregate_version',
    'display_name',
    'status',
    'updated_at',
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.equal('cost' in first, false);
  assert.equal('margin' in first, false);
  assert.throws(() => { first.status = 'inactive'; }, TypeError);
});

test('projeção de local mantém somente identidade compatível e campos públicos', () => {
  const projection = projectV2ToLegacy(
    'location',
    FIXTURE_LOCATION_A,
    FIXTURE_CLIENT_A,
  );
  assert.deepEqual(Object.keys(projection), [
    'schema_version',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
    'aggregate_version',
    'client_id',
    'label',
    'status',
    'updated_at',
  ]);
  assert.equal(projection.aggregate_id, FIXTURE_LOCATION_A.location_id);
  assert.equal(projection.client_id, FIXTURE_LOCATION_A.client_id);
});

test('projeção de local exige cliente-pai co-tenant validado', () => {
  expectCode(
    () => projectV2ToLegacy('location', FIXTURE_LOCATION_A),
    'co_tenancy_violation',
  );
  expectCode(
    () => projectV2ToLegacy(
      'location',
      { ...FIXTURE_LOCATION_A, client_id: FIXTURE_CLIENT_B.client_id },
      FIXTURE_CLIENT_A,
    ),
    'co_tenancy_violation',
  );
});

test('projeção rejeita campo extra em vez de transportar dado privado', () => {
  expectCode(
    () => projectV2ToLegacy('client', { ...FIXTURE_CLIENT_A, cost: 900 }),
    'validation_failed',
  );
});

test('store canônico aplica somente versão contígua e distingue replay, stale e divergência', () => {
  const emptyStore = new InMemoryCanonicalStore();
  assert.equal(
    emptyStore.apply('client', clientVersion(2)).code,
    'canonical_gap',
  );
  assert.equal(emptyStore.size, 0);

  const canonicalStore = new InMemoryCanonicalStore({
    clients: [FIXTURE_CLIENT_A],
  });
  assert.equal(
    canonicalStore.apply('client', FIXTURE_CLIENT_A).code,
    'canonical_replay',
  );
  assert.equal(canonicalStore.apply('client', {
    ...FIXTURE_CLIENT_A,
    display_name: 'Cliente Sintético Divergente',
  }).code, 'canonical_divergence');
  assert.equal(
    canonicalStore.apply('client', clientVersion(3)).code,
    'canonical_gap',
  );
  assert.equal(
    canonicalStore.apply('client', clientVersion(2)).code,
    'canonical_applied',
  );
  assert.equal(
    canonicalStore.apply('client', FIXTURE_CLIENT_A).code,
    'canonical_stale',
  );
  assert.equal(canonicalStore.size, 1);
});

test('store canônico de location exige pai interno e ordena a versão do agregado', () => {
  const withoutParent = new InMemoryCanonicalStore();
  expectCode(
    () => withoutParent.apply('location', {
      ...FIXTURE_LOCATION_A,
      campo_inesperado: true,
    }),
    'validation_failed',
  );
  expectCode(
    () => withoutParent.apply('location', FIXTURE_LOCATION_A),
    'co_tenancy_violation',
  );

  const canonicalStore = new InMemoryCanonicalStore({
    clients: [FIXTURE_CLIENT_A],
    locations: [FIXTURE_LOCATION_A],
  });
  assert.equal(
    canonicalStore.apply('location', locationVersion(2)).code,
    'canonical_applied',
  );
  assert.equal(canonicalStore.size, 2);
});

test('primeiro evento precisa começar na versão um', () => {
  const { projectionStore } = createShadowPilotFixture();
  const outcome = projectionStore.apply(eventForClient(2, 'event-gap-first'));
  assert.deepEqual(outcome, {
    state: 'ignored',
    code: 'projection_gap',
    received_version: 2,
    projected_version: 0,
    changed: false,
  });
  assert.equal(projectionStore.size, 0);
});

test('store de projeção recusa membership malformada no boundary', () => {
  expectCode(
    () => new InMemoryShadowProjectionStore({ memberships: [{}] }),
    'validation_failed',
  );
});

test('evento versão um cria projeção e replay idêntico não duplica', () => {
  const { projectionStore } = createShadowPilotFixture();
  const event = eventForClient(1, 'event-client-a-v1');
  const applied = projectionStore.apply(event);
  const replay = projectionStore.apply(event);
  assert.equal(applied.code, 'projection_applied');
  assert.equal(applied.changed, true);
  assert.equal(replay.code, 'projection_replay');
  assert.equal(replay.changed, false);
  assert.equal(projectionStore.size, 1);
});

test('event_id não pode ser reutilizado para outra versão ou conteúdo', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  projectionStore.apply(eventForClient(1, 'event-stable-id'));
  const outcome = projectionStore.apply(eventForClient(2, 'event-stable-id'));
  assert.equal(outcome.code, 'projection_divergence');
  assert.equal(outcome.changed, false);
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.ownerA).aggregate_version,
    1,
  );
});

test('evento de local exige pai projetado no mesmo tenant', () => {
  const { projectionStore } = createShadowPilotFixture();
  const event = createProjectionEvent(
    'location',
    FIXTURE_LOCATION_A,
    'event-location-a-v1',
    FIXTURE_CLIENT_A,
  );
  expectCode(
    () => projectionStore.apply(event, FIXTURE_CLIENT_A),
    'co_tenancy_violation',
  );
  projectionStore.apply(createProjectionEvent(
    'client',
    FIXTURE_CLIENT_A,
    'event-client-parent-a-v1',
  ));
  assert.equal(
    projectionStore.apply(event, FIXTURE_CLIENT_A).code,
    'projection_applied',
  );
});

test('versão seguinte é aplicada e evento anterior vira stale sem regressão', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  const v1 = eventForClient(1, 'event-client-a-v1');
  const v2 = eventForClient(2, 'event-client-a-v2');
  projectionStore.apply(v1);
  assert.equal(projectionStore.apply(v2).code, 'projection_applied');
  assert.equal(projectionStore.apply(v1).code, 'projection_stale');
  const current = projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.ownerA);
  assert.equal(current.aggregate_version, 2);
});

test('gap depois de versão aplicada é reportado e não aplicado', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  projectionStore.apply(eventForClient(1, 'event-client-a-v1'));
  const outcome = projectionStore.apply(eventForClient(3, 'event-client-a-v3'));
  assert.equal(outcome.code, 'projection_gap');
  assert.equal(outcome.projected_version, 1);
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.ownerA).aggregate_version,
    1,
  );
});

test('mesma versão com conteúdo diferente gera divergência e não repara', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  projectionStore.apply(eventForClient(1, 'event-client-a-v1', 'Nome Sintético Um'));
  const divergent = eventForClient(1, 'event-client-a-v1b', 'Nome Sintético Dois');
  const outcome = projectionStore.apply(divergent);
  assert.equal(outcome.code, 'projection_divergence');
  assert.equal(outcome.changed, false);
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.ownerA).display_name,
    'Nome Sintético Um',
  );
});

test('evento com digest adulterado falha fechado', () => {
  const { projectionStore } = createShadowPilotFixture();
  const event = eventForClient(1, 'event-client-a-v1');
  expectCode(
    () => projectionStore.apply({ ...event, projection_digest: '0'.repeat(64) }),
    'projection_digest_mismatch',
  );
  assert.equal(projectionStore.size, 0);
});

test('evento não pode misturar organização, agregado ou versão', () => {
  const { projectionStore } = createShadowPilotFixture();
  const event = eventForClient(1, 'event-client-a-v1');
  expectCode(
    () => projectionStore.apply({ ...event, organization_id: FIXTURE_CLIENT_B.organization_id }),
    'scope_mismatch',
  );
  expectCode(
    () => projectionStore.apply({ ...event, aggregate_version: 2 }),
    'scope_mismatch',
  );
});

test('leitura da projeção exige membership ativa com capacidade de leitura', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  projectionStore.apply(eventForClient(1, 'event-client-a-v1'));
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.ownerA).aggregate_id,
    FIXTURE_CLIENT_A.client_id,
  );
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.viewerA).aggregate_id,
    FIXTURE_CLIENT_A.client_id,
  );
  assert.equal(projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.revokedA), null);
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, trustedSession('user-sem-membership')),
    null,
  );
});

test('usuário multiempresa lê somente a partição solicitada e autorizada', () => {
  const { projectionStore, sessions } = createShadowPilotFixture();
  projectionStore.apply(eventForClient(1, 'event-client-a-v1'));
  projectionStore.apply(createProjectionEvent('client', FIXTURE_CLIENT_B, 'event-client-b-v1'));
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_A, sessions.multi).organization_id,
    FIXTURE_SCOPE_CLIENT_A.organization_id,
  );
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_B, sessions.multi).organization_id,
    FIXTURE_SCOPE_CLIENT_B.organization_id,
  );
  assert.equal(
    projectionStore.read(FIXTURE_SCOPE_CLIENT_B, sessions.ownerA),
    null,
  );
});

test('contexto confiável rejeita papel ou organização fornecidos pelo chamador', () => {
  const { projectionStore } = createShadowPilotFixture();
  expectCode(
    () => projectionStore.read(FIXTURE_SCOPE_CLIENT_A, {
      session_user_id: 'user-owner-fixture-a',
      role: 'owner',
    }),
    'validation_failed',
  );
});

test('comparação match gera relatório sanitizado e não altera entradas', () => {
  const canonical = structuredClone(FIXTURE_CLIENT_A);
  const legacy = structuredClone(projectV2ToLegacy('client', canonical));
  const before = structuredClone(legacy);
  const report = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical,
    legacy,
    observed_at: SHADOW_OBSERVED_AT,
  });
  assert.equal(report.status, 'match');
  assert.equal(report.scope_digest.length, 64);
  assert.deepEqual(report.mismatched_fields, []);
  assert.deepEqual(legacy, before);
  assert.equal(Object.isFrozen(report), true);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(FIXTURE_ORG_A), false);
  assert.equal(serialized.includes(FIXTURE_CLIENT_A.client_id), false);
  assert.equal(serialized.includes(FIXTURE_CLIENT_A.display_name), false);
});

test('comparação distingue V1 ausente, V2 ausente e ambos ausentes', () => {
  const legacy = projectV2ToLegacy('client', FIXTURE_CLIENT_A);
  assert.equal(compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: FIXTURE_CLIENT_A,
    legacy: null,
    observed_at: SHADOW_OBSERVED_AT,
  }).status, 'missing_legacy');
  assert.equal(compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: null,
    legacy,
    observed_at: SHADOW_OBSERVED_AT,
  }).status, 'missing_canonical');
  assert.equal(compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: null,
    legacy: null,
    observed_at: SHADOW_OBSERVED_AT,
  }).status, 'both_missing');
});

test('comparação reporta somente nomes allowlistados dos campos divergentes', () => {
  const legacy = {
    ...projectV2ToLegacy('client', FIXTURE_CLIENT_A),
    display_name: 'Nome Sintético Divergente',
    status: 'inactive',
  };
  const report = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: FIXTURE_CLIENT_A,
    legacy,
    observed_at: SHADOW_OBSERVED_AT,
  });
  assert.equal(report.status, 'field_mismatch');
  assert.deepEqual(report.mismatched_fields, ['display_name', 'status']);
  assert.equal(JSON.stringify(report).includes('Nome Sintético Divergente'), false);
});

test('versão divergente tem estado próprio sem comparar valores como reparo', () => {
  const legacy = {
    ...projectV2ToLegacy('client', FIXTURE_CLIENT_A),
    aggregate_version: 2,
  };
  const report = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: FIXTURE_CLIENT_A,
    legacy,
    observed_at: SHADOW_OBSERVED_AT,
  });
  assert.equal(report.status, 'version_mismatch');
  assert.equal(report.canonical_version, 1);
  assert.equal(report.legacy_version, 2);
  assert.deepEqual(report.mismatched_fields, []);
});

test('comparação falha fechado para projeção de outro tenant', () => {
  expectCode(
    () => compareShadow({
      scope: FIXTURE_SCOPE_CLIENT_A,
      canonical: FIXTURE_CLIENT_A,
      legacy: projectV2ToLegacy('client', FIXTURE_CLIENT_B),
      observed_at: SHADOW_OBSERVED_AT,
    }),
    'scope_mismatch',
  );
});

test('métricas agregam contagens sem reter relatório ou identificador', () => {
  const { metrics } = createShadowPilotFixture();
  const match = compareShadow({
    scope: FIXTURE_SCOPE_CLIENT_A,
    canonical: FIXTURE_CLIENT_A,
    legacy: projectV2ToLegacy('client', FIXTURE_CLIENT_A),
    observed_at: SHADOW_OBSERVED_AT,
  });
  const missing = compareShadow({
    scope: FIXTURE_SCOPE_LOCATION_A,
    canonical: FIXTURE_LOCATION_A,
    legacy: null,
    parent_client: FIXTURE_CLIENT_A,
    observed_at: SHADOW_OBSERVED_AT,
  });
  metrics.observe(match);
  const snapshot = metrics.observe(missing);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.by_status.match, 1);
  assert.equal(snapshot.by_status.missing_legacy, 1);
  assert.deepEqual(snapshot.by_aggregate_type, { client: 1, location: 1 });
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(match.scope_digest), false);
  assert.equal(serialized.includes('observed_at'), false);
});

test('fase legacy possui somente V1 como writer', () => {
  const { policyStore } = createShadowPilotFixture();
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v1').allowed, true);
  const denied = policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v2');
  assert.equal(denied.allowed, false);
  assert.equal(denied.code, 'writer_not_active');
  assert.equal(denied.policy.active_writer, 'v1');
});

test('shadow observa V2 mas mantém V1 como único writer', () => {
  const { policyStore } = createShadowPilotFixture();
  const transition = policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  assert.equal(transition.code, 'shadow_enabled');
  assert.equal(transition.policy.phase, 'shadow');
  assert.equal(transition.policy.active_writer, 'v1');
  assert.equal(
    policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v2').code,
    'shadow_observe_only',
  );
});

test('cutover exige projeção interna atual e não aceita match autoatestado', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate()),
    'cutover_gate_failed',
  );
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('cutover falha fechado quando a fonte canônica interna não possui o agregado', () => {
  const projectionStore = new InMemoryShadowProjectionStore();
  projectionStore.apply(createProjectionEvent(
    'client',
    FIXTURE_CLIENT_A,
    'event-cutover-without-canonical-v1',
  ));
  const policyStore = new InMemoryPilotPolicyStore({
    canonicalStore: new InMemoryCanonicalStore(),
    clock: () => SHADOW_OBSERVED_AT,
    projectionStore,
    entries: [{
      ...FIXTURE_SCOPE_CLIENT_A,
      phase: 'legacy',
      policy_version: 1,
      cutover_version: null,
      last_gate_observed_at: null,
      pending_outbox_count: 0,
      audit_event_count: 0,
    }],
  });
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate()),
    'cutover_gate_failed',
  );
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('falha do relógio interno bloqueia o cutover sem mutar a política', () => {
  const fixture = createShadowPilotFixture({
    clock: () => { throw new Error('falha sintética'); },
  });
  prepareClientCutover(fixture);
  const before = fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => fixture.policyStore.cutoverToV2(
      FIXTURE_SCOPE_CLIENT_A,
      cutoverGate(),
    ),
    'clock_failed',
  );
  assert.deepEqual(fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('gate legado fabricado é rejeitado e não altera a fase', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(() => policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, {
    expected_policy_version: 2,
    canonical_version: 999,
    projection_version: 999,
    shadow_status: 'match',
  }), 'validation_failed');
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('gate recusa canônico e timestamp fornecidos pelo próprio chamador', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  const before = fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(() => fixture.policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, {
    expected_policy_version: 2,
    canonical: FIXTURE_CLIENT_A,
    observed_at: SHADOW_OBSERVED_AT,
  }), 'validation_failed');
  assert.deepEqual(fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('cutover rejeita divergência entre versões canônica e projetada', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  fixture.canonicalStore.apply('client', clientVersion(2));
  const before = fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => fixture.policyStore.cutoverToV2(
      FIXTURE_SCOPE_CLIENT_A,
      cutoverGate(),
    ),
    'cutover_gate_failed',
  );
  assert.deepEqual(fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('cutover torna V2 writer único e bloqueia V1 com upgrade_required', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  const { policyStore } = fixture;
  const cutover = policyStore.cutoverToV2(
    FIXTURE_SCOPE_CLIENT_A,
    cutoverGate(),
  );
  assert.equal(cutover.policy.phase, 'pilot_v2');
  assert.equal(cutover.policy.active_writer, 'v2');
  assert.equal(cutover.shadow_report.status, 'match');
  assert.equal(cutover.shadow_report.canonical_version, 1);
  assert.equal(cutover.shadow_report.legacy_version, 1);
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v2').allowed, true);
  const legacy = policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v1');
  assert.equal(legacy.allowed, false);
  assert.equal(legacy.code, 'upgrade_required');
});

test('cutover é NO-GO enquanto houver pendência de outbox', () => {
  const fixture = createShadowPilotFixture({
    clientPolicy: { pending_outbox_count: 2 },
  });
  prepareClientCutover(fixture);
  const before = fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => fixture.policyStore.cutoverToV2(
      FIXTURE_SCOPE_CLIENT_A,
      cutoverGate(),
    ),
    'cutover_pending_outbox',
  );
  assert.deepEqual(fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('kill switch pausa V2 sem promover V1 nem apagar outbox/trilha', () => {
  const { policyStore } = createShadowPilotFixture({
    clientPolicy: {
      phase: 'pilot_v2',
      policy_version: 3,
      cutover_version: 1,
      last_gate_observed_at: SHADOW_OBSERVED_AT,
      pending_outbox_count: 2,
      audit_event_count: 6,
    },
  });
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  const paused = policyStore.activateKillSwitch(FIXTURE_SCOPE_CLIENT_A, 3);
  assert.equal(paused.policy.phase, 'paused');
  assert.equal(paused.policy.active_writer, null);
  assert.equal(paused.policy.pending_outbox_count, before.pending_outbox_count);
  assert.equal(paused.policy.audit_event_count, before.audit_event_count + 1);
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v2').code, 'kill_switch_active');
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v1').code, 'upgrade_required');
});

test('retomada pós-kill-switch é explícita e volta somente ao V2', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  const { policyStore } = fixture;
  policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate());
  policyStore.activateKillSwitch(FIXTURE_SCOPE_CLIENT_A, 3);
  const resumed = policyStore.resumeV2(
    FIXTURE_SCOPE_CLIENT_A,
    cutoverGate({ expectedPolicyVersion: 4 }),
  );
  assert.equal(resumed.code, 'pilot_v2_resumed');
  assert.equal(resumed.shadow_report.status, 'match');
  assert.equal(resumed.policy.active_writer, 'v2');
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v1').code, 'upgrade_required');
});

test('retomada após kill switch revalida shadow e não aceita evidência antiga', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  const { canonicalStore, policyStore, projectionStore } = fixture;
  policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate());
  policyStore.activateKillSwitch(FIXTURE_SCOPE_CLIENT_A, 3);
  canonicalStore.apply('client', clientVersion(2));
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => policyStore.resumeV2(
      FIXTURE_SCOPE_CLIENT_A,
      cutoverGate({ expectedPolicyVersion: 4 }),
    ),
    'cutover_gate_failed',
  );
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
  projectionStore.apply(eventForClient(2, 'event-client-after-pause-v2'));
  const resumed = policyStore.resumeV2(
    FIXTURE_SCOPE_CLIENT_A,
    cutoverGate({ expectedPolicyVersion: 4 }),
  );
  assert.equal(resumed.policy.cutover_version, 2);
});

test('retomada recusa reutilização do mesmo instante de evidência', () => {
  const fixture = createShadowPilotFixture({
    clock: () => SHADOW_OBSERVED_AT,
  });
  prepareClientCutover(fixture);
  fixture.policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate());
  fixture.policyStore.activateKillSwitch(FIXTURE_SCOPE_CLIENT_A, 3);
  const before = fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  expectCode(
    () => fixture.policyStore.resumeV2(
      FIXTURE_SCOPE_CLIENT_A,
      cutoverGate({ expectedPolicyVersion: 4 }),
    ),
    'gate_evidence_stale',
  );
  assert.deepEqual(fixture.policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('location percorre shadow, cutover, kill switch e retomada com pai interno', () => {
  const fixture = createShadowPilotFixture();
  prepareLocationCutover(fixture);
  const cutover = fixture.policyStore.cutoverToV2(
    FIXTURE_SCOPE_LOCATION_A,
    cutoverGate(),
  );
  assert.equal(cutover.shadow_report.aggregate_type, 'location');
  assert.equal(cutover.shadow_report.status, 'match');
  assert.equal(cutover.policy.active_writer, 'v2');
  fixture.policyStore.activateKillSwitch(FIXTURE_SCOPE_LOCATION_A, 3);
  const resumed = fixture.policyStore.resumeV2(
    FIXTURE_SCOPE_LOCATION_A,
    cutoverGate({ expectedPolicyVersion: 4 }),
  );
  assert.equal(resumed.policy.active_writer, 'v2');
  assert.equal(resumed.shadow_report.aggregate_type, 'location');
});

test('location também não faz cutover com outbox pendente', () => {
  const fixture = createShadowPilotFixture({
    locationPolicy: { pending_outbox_count: 1 },
  });
  prepareLocationCutover(fixture);
  expectCode(
    () => fixture.policyStore.cutoverToV2(
      FIXTURE_SCOPE_LOCATION_A,
      cutoverGate(),
    ),
    'cutover_pending_outbox',
  );
});

test('rollback lógico antes do cutover volta shadow para legacy', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  const rollback = policyStore.rollbackToLegacy(FIXTURE_SCOPE_CLIENT_A, 2);
  assert.equal(rollback.state, 'applied');
  assert.equal(rollback.code, 'shadow_rolled_back');
  assert.equal(rollback.policy.active_writer, 'v1');
  assert.equal(rollback.policy.cutover_version, null);
});

test('rollback em legacy é noop e não incrementa a versão da política', () => {
  const { policyStore } = createShadowPilotFixture();
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  const rollback = policyStore.rollbackToLegacy(FIXTURE_SCOPE_CLIENT_A, 1);
  assert.equal(rollback.state, 'noop');
  assert.equal(rollback.code, 'already_legacy');
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
});

test('rollback depois do cutover exige reconciliação e não reativa V1', () => {
  const fixture = createShadowPilotFixture();
  prepareClientCutover(fixture);
  const { policyStore } = fixture;
  policyStore.cutoverToV2(FIXTURE_SCOPE_CLIENT_A, cutoverGate());
  const before = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  const rollback = policyStore.rollbackToLegacy(FIXTURE_SCOPE_CLIENT_A, 3);
  assert.equal(rollback.state, 'blocked');
  assert.equal(rollback.code, 'reconciliation_required');
  assert.deepEqual(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A), before);
  assert.equal(policyStore.authorizeWrite(FIXTURE_SCOPE_CLIENT_A, 'v1').allowed, false);
});

test('política é isolada por organização e por agregado', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  assert.equal(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A).phase, 'shadow');
  assert.equal(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_B).phase, 'legacy');
  assert.equal(policyStore.snapshot(FIXTURE_SCOPE_LOCATION_A).phase, 'legacy');
});

test('versão de política impede dois operadores concorrentes', () => {
  const { policyStore } = createShadowPilotFixture();
  policyStore.enableShadow(FIXTURE_SCOPE_CLIENT_A, 1);
  expectCode(
    () => policyStore.rollbackToLegacy(FIXTURE_SCOPE_CLIENT_A, 1),
    'policy_version_mismatch',
  );
  assert.equal(policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A).phase, 'shadow');
});

test('snapshot de política é sanitizado, imutável e não expõe escopo bruto', () => {
  const { policyStore } = createShadowPilotFixture();
  const snapshot = policyStore.snapshot(FIXTURE_SCOPE_CLIENT_A);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.scope_digest.length, 64);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(FIXTURE_ORG_A), false);
  assert.equal(serialized.includes(FIXTURE_CLIENT_A.client_id), false);
  assert.throws(() => { snapshot.phase = 'pilot_v2'; }, TypeError);
});

test('seed cortado exige versão de cutover e estados pré-cutover proíbem-na', () => {
  const base = {
    ...FIXTURE_SCOPE_CLIENT_A,
    policy_version: 1,
    last_gate_observed_at: null,
    pending_outbox_count: 0,
    audit_event_count: 0,
  };
  expectCode(() => new InMemoryPilotPolicyStore({
    canonicalStore: new InMemoryCanonicalStore(),
    clock: () => SHADOW_OBSERVED_AT,
    projectionStore: new InMemoryShadowProjectionStore(),
    entries: [{ ...base, phase: 'pilot_v2', cutover_version: null }],
  }), 'validation_failed');
  expectCode(() => new InMemoryPilotPolicyStore({
    canonicalStore: new InMemoryCanonicalStore(),
    clock: () => SHADOW_OBSERVED_AT,
    projectionStore: new InMemoryShadowProjectionStore(),
    entries: [{ ...base, phase: 'legacy', cutover_version: 1 }],
  }), 'validation_failed');
});
