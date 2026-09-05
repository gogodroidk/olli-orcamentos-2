import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OutboxBoundaryError,
  OutboxTransientError,
} from '../outbox/increment-a-outbox.mjs';
import {
  FIXTURE_CREATE_CLIENT_COMMAND,
  FIXTURE_LEASE_ID,
  FIXTURE_MEMBERSHIP_OWNER_A,
  FIXTURE_ORG_A,
  FIXTURE_OUTBOX_ITEM_ID,
  FIXTURE_UPDATE_CLIENT_COMMAND,
  FIXTURE_USER_OUTSIDER_B,
  FIXTURE_USER_TECH_A,
  createOutboxFixture,
  enqueueFixture,
  trustedSession,
} from '../fixtures/outbox-fixture.mjs';

function commandFor(suffix, overrides = {}) {
  return {
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: `command-outbox-${suffix}`,
    idempotency_key: `idem-outbox-${suffix}`,
    aggregate_id: `client-outbox-${suffix}`,
    device_id: `device-outbox-${suffix}`,
    created_at_local: '2026-08-28T23:00:00.000Z',
    ...overrides,
  };
}

function expectBoundaryError(work, code = 'validation_failed') {
  assert.throws(
    work,
    (error) => (
      error instanceof OutboxBoundaryError
      && error.code === code
      && error.safe_result.code === code
    ),
  );
}

test('enqueue cria item pendente e expõe somente projeção segura', () => {
  const { store } = createOutboxFixture();
  const result = enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(result.enqueue_status, 'enqueued');
  assert.equal(result.item.state, 'pending');
  assert.equal(result.item.attempt_count, 0);
  assert.deepEqual(Object.keys(result.item).sort(), [
    'aggregate_id',
    'aggregate_type',
    'attempt_count',
    'available_at',
    'command_id',
    'created_at',
    'item_id',
    'last_error_code',
    'lease_expires_at',
    'organization_id',
    'result',
    'state',
    'updated_at',
  ]);
  const serialized = JSON.stringify(result.item);
  for (const forbidden of [
    'payload',
    'display_name',
    'enqueued_by_user_id',
    'device_id',
    'lease_id',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )), {
    total: 1,
    pending: 1,
    claimed: 0,
    retry_wait: 0,
    acked: 0,
    conflict: 0,
    rejected: 0,
    reconcile_required: 0,
    dead_letter: 0,
  });
});

test('enqueue repetido dez vezes é idempotente e não duplica registro', () => {
  const { store } = createOutboxFixture();
  let latest;
  for (let index = 0; index < 10; index += 1) {
    latest = enqueueFixture(
      store,
      FIXTURE_CREATE_CLIENT_COMMAND,
      FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    );
  }
  assert.equal(latest.enqueue_status, 'duplicate');
  assert.equal(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )).total, 1);
});

test('mesmo command_id em outro item retorna o registro original', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const duplicate = enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-item-alternate-identity',
  );
  assert.equal(duplicate.enqueue_status, 'duplicate');
  assert.equal(duplicate.item.item_id, FIXTURE_OUTBOX_ITEM_ID);
});

test('colisão divergente de item_id ou command_id falha fechado', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  expectBoundaryError(() => enqueueFixture(
    store,
    commandFor('different-command'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  ));
  expectBoundaryError(() => enqueueFixture(
    store,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      idempotency_key: 'idem-divergent-command-id',
      aggregate_id: 'client-divergent-command-id',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-item-divergent-command-id',
  ));
  assert.equal(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )).total, 1);
});

test('dedupe exige igualdade do envelope canônico completo', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  for (const [itemId, overrides] of [
    [FIXTURE_OUTBOX_ITEM_ID, {
      idempotency_key: 'idem-envelope-divergent-same-item',
    }],
    ['outbox-envelope-divergent-command', {
      idempotency_key: 'idem-envelope-divergent-command',
    }],
    [FIXTURE_OUTBOX_ITEM_ID, {
      device_id: 'device-envelope-divergent',
    }],
    [FIXTURE_OUTBOX_ITEM_ID, {
      created_at_local: '2026-08-28T23:00:01.000Z',
    }],
  ]) {
    expectBoundaryError(() => enqueueFixture(
      store,
      {
        ...FIXTURE_CREATE_CLIENT_COMMAND,
        ...overrides,
      },
      FIXTURE_MEMBERSHIP_OWNER_A.user_id,
      itemId,
    ));
  }

  const original = store.claimNext(
    { lease_id: 'lease-envelope-original' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(
    original.command.idempotency_key,
    FIXTURE_CREATE_CLIENT_COMMAND.idempotency_key,
  );
  assert.equal(
    original.command.device_id,
    FIXTURE_CREATE_CLIENT_COMMAND.device_id,
  );
  assert.equal(
    original.command.created_at_local,
    FIXTURE_CREATE_CLIENT_COMMAND.created_at_local,
  );
  assert.equal(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )).total, 1);
});

test('contexto extra e payload proibido são recusados antes da fila', () => {
  const { store } = createOutboxFixture();
  expectBoundaryError(() => store.enqueue(
    {
      item_id: FIXTURE_OUTBOX_ITEM_ID,
      command: FIXTURE_CREATE_CLIENT_COMMAND,
    },
    {
      session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
      role: 'owner',
    },
  ));
  expectBoundaryError(() => enqueueFixture(
    store,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      payload: {
        ...FIXTURE_CREATE_CLIENT_COMMAND.payload,
        display_name: 'https://fixture.invalid/nao-permitido',
      },
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  ));
  assert.equal(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )).total, 0);
});

test('inspeção, métricas e claim não misturam contas locais', () => {
  const { store } = createOutboxFixture();
  const ownerCommand = commandFor('partition-owner');
  const techCommand = commandFor('partition-tech');
  enqueueFixture(
    store,
    ownerCommand,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-partition-owner',
  );
  enqueueFixture(
    store,
    techCommand,
    FIXTURE_USER_TECH_A,
    'outbox-partition-tech',
  );

  assert.equal(store.inspect(
    'outbox-partition-owner',
    trustedSession(FIXTURE_USER_TECH_A),
  ), null);
  assert.equal(store.metrics(trustedSession(
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  )).total, 1);
  assert.equal(store.metrics(trustedSession(
    FIXTURE_USER_TECH_A,
  )).total, 1);
  const claimed = store.claimNext(
    { lease_id: 'lease-partition-owner' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(claimed.command.command_id, ownerCommand.command_id);
});

test('lease fresca impede claim concorrente do mesmo item', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const first = store.claimNext(
    { lease_id: FIXTURE_LEASE_ID },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  const second = store.claimNext(
    { lease_id: 'lease-fixture-b' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(first.item_id, FIXTURE_OUTBOX_ITEM_ID);
  assert.equal(second, null);
});

test('lease_id ativo não pode ser reutilizado em outro item', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    commandFor('lease-unique-a'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-lease-unique-a',
  );
  enqueueFixture(
    store,
    commandFor('lease-unique-b'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-lease-unique-b',
  );
  store.claimNext(
    { lease_id: 'lease-shared-active' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  expectBoundaryError(() => store.claimNext(
    { lease_id: 'lease-shared-active' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), 'lease_conflict');
});

test('namespace de lease é isolado por ator e não cria bloqueio cruzado', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    commandFor('lease-owner-scope'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-lease-owner-scope',
  );
  enqueueFixture(
    store,
    commandFor('lease-tech-scope'),
    FIXTURE_USER_TECH_A,
    'outbox-lease-tech-scope',
  );
  const ownerClaim = store.claimNext(
    { lease_id: 'lease-actor-scoped' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  const techClaim = store.claimNext(
    { lease_id: 'lease-actor-scoped' },
    trustedSession(FIXTURE_USER_TECH_A),
  );
  assert.equal(ownerClaim.item_id, 'outbox-lease-owner-scope');
  assert.equal(techClaim.item_id, 'outbox-lease-tech-scope');
});

test('lease vencida também impede settleFailure pelo token antigo', () => {
  const {
    clock,
    store,
  } = createOutboxFixture({ leaseDurationMs: 1_000 });
  enqueueFixture(
    store,
    commandFor('stale-failure-settle'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-stale-failure-settle',
  );
  const stale = store.claimNext(
    { lease_id: 'lease-stale-failure' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  clock.advance(1_001);
  const fresh = store.claimNext(
    { lease_id: 'lease-fresh-failure' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  expectBoundaryError(() => store.settleFailure(
    stale.item_id,
    stale.lease_id,
    { kind: 'transient', code: 'transport_timeout' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), 'lease_conflict');
  assert.equal(store.inspect(
    fresh.item_id,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).state, 'claimed');
});

test('lease vencida pode ser reclamada e lease antiga não conclui', () => {
  const {
    clock,
    gateway,
    store,
  } = createOutboxFixture({ leaseDurationMs: 1_000 });
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const staleClaim = store.claimNext(
    { lease_id: 'lease-stale' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  clock.advance(1_001);
  const freshClaim = store.claimNext(
    { lease_id: 'lease-fresh' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  const gatewayResult = gateway.execute(
    freshClaim.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  expectBoundaryError(() => store.settleGatewayResult(
    staleClaim.item_id,
    staleClaim.lease_id,
    gatewayResult,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), 'lease_conflict');
  const settled = store.settleGatewayResult(
    freshClaim.item_id,
    freshClaim.lease_id,
    gatewayResult,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(settled.state, 'acked');
  assert.equal(settled.attempt_count, 2);
});

test('drain aplica comando pelo gateway e encerra como acked', () => {
  const {
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const result = outbox.drainOne(
    { lease_id: FIXTURE_LEASE_ID },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'acked');
  assert.equal(result.result.code, 'applied');
  assert.equal(
    gatewayStore.inspectClient(
      FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
    ).version,
    1,
  );
  assert.equal(outbox.drainOne(
    { lease_id: 'lease-after-terminal' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), null);
});

test('crash pós-aplicação e pré-ack recupera por replay sem duplicar efeito', () => {
  const {
    clock,
    gateway,
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture({ leaseDurationMs: 1_000 });
  const command = commandFor('crash-after-apply');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-crash-after-apply',
  );
  const abandoned = store.claimNext(
    { lease_id: 'lease-before-crash' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  const firstResult = gateway.execute(
    abandoned.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(firstResult.code, 'applied');
  clock.advance(1_001);
  const recovered = outbox.drainOne(
    { lease_id: 'lease-after-crash' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(recovered.state, 'acked');
  assert.equal(recovered.result.code, 'idempotent_replay');
  assert.equal(gatewayStore.ledgerSize, 1);
  assert.equal(gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('última tentativa expirada recebe uma única sonda idempotente de reconciliação', () => {
  const {
    clock,
    gateway,
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture({
    leaseDurationMs: 1_000,
    maxAttempts: 1,
  });
  const command = commandFor('final-attempt-reconciliation');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-final-attempt-reconciliation',
  );
  const abandoned = store.claimNext(
    { lease_id: 'lease-final-attempt-before-crash' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(gateway.execute(
    abandoned.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).code, 'applied');
  clock.advance(1_001);

  const recovered = outbox.drainOne(
    { lease_id: 'lease-final-attempt-reconcile' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(recovered.state, 'acked');
  assert.equal(recovered.result.code, 'idempotent_replay');
  assert.equal(recovered.attempt_count, 1);
  assert.equal(gatewayStore.ledgerSize, 1);
  assert.equal(gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('segunda expiração após a sonda final encerra como reconciliação pendente', () => {
  const {
    clock,
    gateway,
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture({
    leaseDurationMs: 1_000,
    maxAttempts: 1,
  });
  const command = commandFor('final-probe-abandoned');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-final-probe-abandoned',
  );
  const first = store.claimNext(
    { lease_id: 'lease-final-probe-first' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(gateway.execute(
    first.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).code, 'applied');
  clock.advance(1_001);
  const probe = store.claimNext(
    { lease_id: 'lease-final-probe-only' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(probe.attempt_count, 1);
  assert.equal(gateway.execute(
    probe.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).code, 'idempotent_replay');
  clock.advance(1_001);

  assert.equal(outbox.drainOne(
    { lease_id: 'lease-final-probe-forbidden-repeat' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), null);
  const terminal = store.inspect(
    'outbox-final-probe-abandoned',
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(terminal.state, 'reconcile_required');
  assert.equal(
    terminal.last_error_code,
    'delivery_outcome_ambiguous',
  );
  assert.equal(gatewayStore.ledgerSize, 1);
  assert.equal(gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('revogação após aplicação sem ack exige reconciliação sem vazar recibo', () => {
  const {
    clock,
    gateway,
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture({ leaseDurationMs: 1_000 });
  const command = commandFor('revoked-after-unconfirmed-apply');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-revoked-after-unconfirmed-apply',
  );
  const abandoned = store.claimNext(
    { lease_id: 'lease-revoked-after-apply' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(gateway.execute(
    abandoned.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).code, 'applied');
  clock.advance(1_001);
  gatewayStore.setMembershipStatus(
    FIXTURE_ORG_A,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'revoked',
    '2026-08-28T23:00:02.000Z',
  );

  const ambiguous = outbox.drainOne(
    { lease_id: 'lease-revoked-reclaim' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(ambiguous.state, 'reconcile_required');
  assert.equal(ambiguous.result.code, 'authorization_revoked');
  assert.equal(ambiguous.result.canonical_version, null);
  assert.equal(
    ambiguous.last_error_code,
    'delivery_outcome_ambiguous',
  );
  assert.equal(gatewayStore.ledgerSize, 1);
  assert.equal(gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('kill switch após aplicação sem ack exige reconciliação manual', () => {
  const {
    clock,
    gateway,
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture({ leaseDurationMs: 1_000 });
  const command = commandFor('kill-switch-after-unconfirmed-apply');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-kill-switch-after-unconfirmed-apply',
  );
  const abandoned = store.claimNext(
    { lease_id: 'lease-kill-switch-after-apply' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(gateway.execute(
    abandoned.command,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).code, 'applied');
  clock.advance(1_001);
  gatewayStore.setOrganizationFlag(FIXTURE_ORG_A, false);

  const ambiguous = outbox.drainOne(
    { lease_id: 'lease-kill-switch-reclaim' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(ambiguous.state, 'reconcile_required');
  assert.equal(ambiguous.result.code, 'authorization_denied');
  assert.equal(
    ambiguous.last_error_code,
    'delivery_outcome_ambiguous',
  );
  assert.equal(gatewayStore.ledgerSize, 1);
  assert.equal(gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('revogação entre enqueue e drain encerra como rejected', () => {
  const {
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture();
  const command = commandFor('revoked-before-drain');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-revoked-before-drain',
  );
  gatewayStore.setMembershipStatus(
    FIXTURE_ORG_A,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'revoked',
    '2026-08-28T23:00:01.000Z',
  );
  const result = outbox.drainOne(
    { lease_id: 'lease-revoked-before-drain' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'rejected');
  assert.equal(result.result.code, 'authorization_revoked');
  assert.equal(gatewayStore.inspectClient(command.aggregate_id), null);
});

test('expected_version divergente encerra como conflict sem last-write-wins', () => {
  const { outbox, store } = createOutboxFixture();
  const conflictCommand = {
    ...FIXTURE_UPDATE_CLIENT_COMMAND,
    command_id: 'command-outbox-version-conflict',
    idempotency_key: 'idem-outbox-version-conflict',
    expected_version: 2,
  };
  enqueueFixture(
    store,
    conflictCommand,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-version-conflict',
  );
  const result = outbox.drainOne(
    { lease_id: 'lease-version-conflict' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'conflict');
  assert.equal(result.result.code, 'expected_version_mismatch');
  assert.equal(result.result.canonical_version, 1);
});

test('kill switch entre enqueue e drain encerra como rejected', () => {
  const {
    gatewayStore,
    outbox,
    store,
  } = createOutboxFixture();
  const command = commandFor('kill-switch');
  enqueueFixture(
    store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-kill-switch',
  );
  gatewayStore.setOrganizationFlag(FIXTURE_ORG_A, false);
  const result = outbox.drainOne(
    { lease_id: 'lease-kill-switch' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'rejected');
  assert.equal(result.result.code, 'authorization_denied');
});

test('resultado terminal é reprojetado por allowlist exata da outbox', () => {
  const expectedKeys = [
    'aggregate_id',
    'aggregate_type',
    'canonical_version',
    'code',
    'command_id',
    'idempotency_key',
    'organization_id',
    'replayed',
    'state',
  ];
  const scenarios = [
    {
      command: commandFor('safe-result-acked'),
      itemId: 'outbox-safe-result-acked',
      prepare() {},
    },
    {
      command: {
        ...FIXTURE_UPDATE_CLIENT_COMMAND,
        command_id: 'command-safe-result-conflict',
        idempotency_key: 'idem-safe-result-conflict',
        expected_version: 2,
      },
      itemId: 'outbox-safe-result-conflict',
      prepare() {},
    },
    {
      command: commandFor('safe-result-rejected'),
      itemId: 'outbox-safe-result-rejected',
      prepare(gatewayStore) {
        gatewayStore.setOrganizationFlag(FIXTURE_ORG_A, false);
      },
    },
  ];

  for (const [index, scenario] of scenarios.entries()) {
    const fixture = createOutboxFixture();
    enqueueFixture(
      fixture.store,
      scenario.command,
      FIXTURE_MEMBERSHIP_OWNER_A.user_id,
      scenario.itemId,
    );
    scenario.prepare(fixture.gatewayStore);
    const terminal = fixture.outbox.drainOne(
      { lease_id: `lease-safe-result-${index}` },
      trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
    );
    assert.deepEqual(Object.keys(terminal.result).sort(), expectedKeys);
    const serialized = JSON.stringify(terminal.result);
    for (const forbidden of [
      'payload',
      'display_name',
      'actor_user_id',
      'device_id',
      'lease_id',
      'message',
      'stack',
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  }
});

test('falha transitória respeita backoff e depois conclui', () => {
  let calls = 0;
  const fixture = createOutboxFixture({
    backoffBaseMs: 1_000,
    deliveryFactory(realGateway) {
      return {
        execute(command, context) {
          calls += 1;
          if (calls === 1) {
            throw new OutboxTransientError('transport_unavailable');
          }
          return realGateway.execute(command, context);
        },
      };
    },
  });
  const command = commandFor('transient-retry');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-transient-retry',
  );
  const waiting = fixture.outbox.drainOne(
    { lease_id: 'lease-transient-first' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(waiting.state, 'retry_wait');
  assert.equal(waiting.last_error_code, 'transport_unavailable');
  assert.equal(fixture.outbox.drainOne(
    { lease_id: 'lease-transient-too-early' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), null);
  fixture.clock.advance(1_000);
  const completed = fixture.outbox.drainOne(
    { lease_id: 'lease-transient-second' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(completed.state, 'acked');
  assert.equal(completed.attempt_count, 2);
  assert.equal(calls, 2);
});

test('timeout pós-aplicação na última tentativa usa sonda idempotente', () => {
  let calls = 0;
  const fixture = createOutboxFixture({
    maxAttempts: 1,
    backoffBaseMs: 100,
    deliveryFactory(realGateway) {
      return {
        execute(command, context) {
          calls += 1;
          const result = realGateway.execute(command, context);
          if (calls === 1) {
            throw new OutboxTransientError('transport_timeout');
          }
          return result;
        },
      };
    },
  });
  const command = commandFor('timeout-after-apply');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-timeout-after-apply',
  );

  const uncertain = fixture.outbox.drainOne(
    { lease_id: 'lease-timeout-after-apply' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(uncertain.state, 'retry_wait');
  assert.equal(uncertain.last_error_code, 'transport_timeout');
  assert.equal(fixture.gatewayStore.ledgerSize, 1);
  assert.equal(fixture.gatewayStore.inspectClient(command.aggregate_id).version, 1);
  fixture.clock.advance(100);

  const reconciled = fixture.outbox.drainOne(
    { lease_id: 'lease-timeout-reconciliation-probe' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(reconciled.state, 'acked');
  assert.equal(reconciled.result.code, 'idempotent_replay');
  assert.equal(reconciled.attempt_count, 1);
  assert.equal(fixture.gatewayStore.ledgerSize, 1);
  assert.equal(fixture.gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('timeout repetido na sonda final encerra como reconciliação pendente', () => {
  const fixture = createOutboxFixture({
    maxAttempts: 1,
    backoffBaseMs: 100,
    deliveryFactory(realGateway) {
      return {
        execute(command, context) {
          realGateway.execute(command, context);
          throw new OutboxTransientError('transport_timeout');
        },
      };
    },
  });
  const command = commandFor('timeout-repeated-after-apply');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-timeout-repeated-after-apply',
  );
  const waiting = fixture.outbox.drainOne(
    { lease_id: 'lease-timeout-repeated-first' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(waiting.state, 'retry_wait');
  fixture.clock.advance(100);

  const terminal = fixture.outbox.drainOne(
    { lease_id: 'lease-timeout-repeated-probe' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(terminal.state, 'reconcile_required');
  assert.equal(
    terminal.last_error_code,
    'delivery_outcome_ambiguous',
  );
  assert.equal(fixture.gatewayStore.ledgerSize, 1);
  assert.equal(fixture.gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('falhas transitórias atingem limite e vão para dead_letter', () => {
  const fixture = createOutboxFixture({
    maxAttempts: 3,
    backoffBaseMs: 100,
    deliveryFactory() {
      return {
        execute() {
          throw new OutboxTransientError('transport_unavailable');
        },
      };
    },
  });
  const command = commandFor('attempt-limit');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-attempt-limit',
  );
  const first = fixture.outbox.drainOne(
    { lease_id: 'lease-attempt-1' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  fixture.clock.advance(100);
  const second = fixture.outbox.drainOne(
    { lease_id: 'lease-attempt-2' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  fixture.clock.advance(200);
  const third = fixture.outbox.drainOne(
    { lease_id: 'lease-attempt-3' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(first.state, 'retry_wait');
  assert.equal(second.state, 'retry_wait');
  assert.equal(third.state, 'dead_letter');
  assert.equal(third.last_error_code, 'attempt_limit_reached');
  assert.equal(third.attempt_count, 3);
});

test('backoff exponencial respeita o teto configurado', () => {
  const fixture = createOutboxFixture({
    maxAttempts: 4,
    backoffBaseMs: 100,
    maxBackoffMs: 150,
    deliveryFactory() {
      return {
        execute() {
          throw new OutboxTransientError('rate_limited');
        },
      };
    },
  });
  enqueueFixture(
    fixture.store,
    commandFor('backoff-cap'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-backoff-cap',
  );
  const first = fixture.outbox.drainOne(
    { lease_id: 'lease-backoff-cap-1' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(
    Date.parse(first.available_at) - Date.parse(first.updated_at),
    100,
  );
  fixture.clock.advance(100);
  const second = fixture.outbox.drainOne(
    { lease_id: 'lease-backoff-cap-2' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(
    Date.parse(second.available_at) - Date.parse(second.updated_at),
    150,
  );
  fixture.clock.advance(150);
  const third = fixture.outbox.drainOne(
    { lease_id: 'lease-backoff-cap-3' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(
    Date.parse(third.available_at) - Date.parse(third.updated_at),
    150,
  );
});

test('erro desconhecido exige reconciliação sem retry infinito', () => {
  const fixture = createOutboxFixture({
    deliveryFactory() {
      return {
        execute() {
          throw new Error('Mensagem bruta que não pode persistir');
        },
      };
    },
  });
  const command = commandFor('unknown-failure');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-unknown-failure',
  );
  const result = fixture.outbox.drainOne(
    { lease_id: 'lease-unknown-failure' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'reconcile_required');
  assert.equal(result.last_error_code, 'delivery_outcome_ambiguous');
  assert.equal(JSON.stringify(result).includes('Mensagem bruta'), false);
  assert.equal(fixture.outbox.drainOne(
    { lease_id: 'lease-unknown-failure-again' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ), null);
});

test('gateway assíncrono é recusado como resultado ambíguo nesta fatia', () => {
  const fixture = createOutboxFixture({
    gateway: {
      execute() {
        return Promise.resolve({});
      },
    },
  });
  enqueueFixture(
    fixture.store,
    commandFor('async-gateway'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-async-gateway',
  );
  const result = fixture.outbox.drainOne(
    { lease_id: 'lease-async-gateway' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'reconcile_required');
  assert.equal(result.last_error_code, 'delivery_outcome_ambiguous');
});

test('rejeição do thenable recusado é consumida sem mensagem bruta', async () => {
  const unhandled = [];
  const listener = (reason) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', listener);
  try {
    const fixture = createOutboxFixture({
      gateway: {
        execute() {
          return Promise.reject(new Error(
            'synthetic-sensitive-rejection',
          ));
        },
      },
    });
    enqueueFixture(
      fixture.store,
      commandFor('async-rejection'),
      FIXTURE_MEMBERSHIP_OWNER_A.user_id,
      'outbox-async-rejection',
    );
    const result = fixture.outbox.drainOne(
      { lease_id: 'lease-async-rejection' },
      trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
    );
    assert.equal(result.state, 'reconcile_required');
    assert.equal(
      result.last_error_code,
      'delivery_outcome_ambiguous',
    );
    assert.equal(
      JSON.stringify(result).includes('synthetic-sensitive-rejection'),
      false,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', listener);
  }
});

test('erro desconhecido pós-aplicação não produz falso dead_letter', () => {
  const fixture = createOutboxFixture({
    deliveryFactory(realGateway) {
      return {
        execute(command, context) {
          realGateway.execute(command, context);
          throw new Error('Falha inesperada depois do commit');
        },
      };
    },
  });
  const command = commandFor('unknown-after-apply');
  enqueueFixture(
    fixture.store,
    command,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-unknown-after-apply',
  );
  const result = fixture.outbox.drainOne(
    { lease_id: 'lease-unknown-after-apply' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(result.state, 'reconcile_required');
  assert.equal(result.last_error_code, 'delivery_outcome_ambiguous');
  assert.equal(JSON.stringify(result).includes('Falha inesperada'), false);
  assert.equal(fixture.gatewayStore.ledgerSize, 1);
  assert.equal(fixture.gatewayStore.inspectClient(command.aggregate_id).version, 1);
});

test('resultado de outro comando não pode concluir a lease', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const claim = store.claimNext(
    { lease_id: 'lease-result-mismatch' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  expectBoundaryError(() => store.settleGatewayResult(
    claim.item_id,
    claim.lease_id,
    {
      command_id: 'command-other-result',
      idempotency_key: claim.command.idempotency_key,
      organization_id: claim.command.organization_id,
      aggregate_type: claim.command.aggregate_type,
      aggregate_id: claim.command.aggregate_id,
      state: 'acked',
      code: 'applied',
      canonical_version: 1,
      replayed: false,
    },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ));
  assert.equal(store.inspect(
    claim.item_id,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).state, 'claimed');
});

test('claims e snapshots são imutáveis', () => {
  const { store } = createOutboxFixture();
  enqueueFixture(
    store,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const claim = store.claimNext(
    { lease_id: 'lease-frozen-snapshot' },
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(Object.isFrozen(claim), true);
  assert.equal(Object.isFrozen(claim.command), true);
  assert.throws(() => {
    claim.command.organization_id = 'org-attacker';
  }, TypeError);
  const inspected = store.inspect(
    FIXTURE_OUTBOX_ITEM_ID,
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  );
  assert.equal(inspected.organization_id, FIXTURE_ORG_A);
});

test('membro de outra organização não vê nem drena item alheio', () => {
  const { outbox, store } = createOutboxFixture();
  enqueueFixture(
    store,
    commandFor('tenant-partition'),
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'outbox-tenant-partition',
  );
  assert.equal(store.inspect(
    'outbox-tenant-partition',
    trustedSession(FIXTURE_USER_OUTSIDER_B),
  ), null);
  assert.equal(outbox.drainOne(
    { lease_id: 'lease-tenant-partition' },
    trustedSession(FIXTURE_USER_OUTSIDER_B),
  ), null);
  assert.equal(store.inspect(
    'outbox-tenant-partition',
    trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
  ).state, 'pending');
});
