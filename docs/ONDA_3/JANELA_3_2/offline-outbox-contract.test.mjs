import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_CONSTANTS,
  OfflineOutboxError,
  applyTombstoneTransaction,
  claim,
  createState,
  enqueue,
  resolveReplica,
  retentionDecision,
  settleFailure,
  settleGatewayResult,
} from './offline-outbox-contract.mjs';

const T0 = '2026-08-30T12:00:00.000Z';
const T1 = '2026-08-30T12:00:01.000Z';
const T2 = '2026-08-30T12:00:02.000Z';

function context(device_id = 'device-a', organization_id = 'org-1') {
  return {
    session_user_id: 'user-1',
    organization_id,
    device_id,
    membership_status: 'active',
    can_write: true,
  };
}

function command({ command_id = 'cmd-1', device_id = 'device-a', organization_id = 'org-1', aggregate_id = 'client-1', display_name = 'Cliente', created_at_local = T0 } = {}) {
  return {
    command_id,
    idempotency_key: `idem-${command_id}`,
    protocol_version: 1,
    schema_version: 1,
    organization_id,
    aggregate_type: 'client',
    aggregate_id,
    expected_version: 0,
    operation: 'create_client',
    payload: { display_name, status: 'active' },
    created_at_local,
    device_id,
  };
}

function clock(now = T0, device_time = now, logical_time = 1) {
  return { now, device_time, logical_time };
}

function enqueued(overrides = {}, ctx = context(), clk = clock()) {
  return enqueue(
    createState(),
    { item_id: overrides.item_id ?? 'item-1', command: command(overrides.command) },
    ctx,
    clk,
  );
}

test('declara todos os estados J2.4 e mantém saída allowlistada', () => {
  assert.deepEqual(CONTRACT_CONSTANTS.states, [
    'pending', 'claimed', 'retry_wait', 'acked', 'conflict', 'rejected',
    'reconcile_required', 'dead_letter',
  ]);
  const first = enqueued();
  assert.equal(first.result.item.state, 'pending');
  assert.equal(first.result.item.origin_device_id, 'device-a');
  assert.equal(Object.hasOwn(first.result.item, 'session_user_id'), false);
  assert.equal(Object.isFrozen(first.state), true);
  assert.equal(typeof first.state.items.set, 'undefined');
  const leaked = first.state.items.get('item-1');
  leaked.state = 'acked';
  assert.equal(first.state.items.get('item-1').state, 'pending');
  assert.equal(Object.hasOwn(leaked, 'command'), false, 'view pública não expõe payload do comando');
  assert.equal(Object.hasOwn(leaked, 'enqueued_by_user_id'), false, 'view pública não expõe ator interno');
  assert.deepEqual([...first.state.items.entries()][0][1], first.state.items.get('item-1'));
});

test('tenant e dispositivo vêm do contexto confiável, não do payload', () => {
  assert.throws(
    () => enqueued({ command: { organization_id: 'org-2' } }),
    (error) => error instanceof OfflineOutboxError && error.code === 'co_tenancy_violation',
  );
  assert.throws(
    () => enqueue(createState(), { item_id: 'item-future', command: command({ command_id: 'cmd-future', created_at_local: '2030-01-01T00:00:00.000Z' }) }, context(), clock()),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
  assert.throws(
    () => enqueue(createState(), { item_id: 'item-1', command: command({ device_id: 'device-b' }) }, context('device-a'), clock()),
    (error) => error instanceof OfflineOutboxError && error.code === 'authorization_denied',
  );
});

test('idempotência aceita replay idêntico e rejeita replay divergente', () => {
  const first = enqueued();
  const replay = enqueue(
    first.state,
    { item_id: 'item-1', command: command() },
    context(),
    clock(T1),
  );
  assert.equal(replay.result.enqueue_status, 'duplicate');
  assert.throws(
    () => enqueue(
      first.state,
      { item_id: 'item-1', command: command({ command_id: 'cmd-2', display_name: 'Outro' }) },
      context(),
      clock(T1),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
  const samePayloadDifferentCommand = command({ command_id: 'cmd-3' });
  samePayloadDifferentCommand.idempotency_key = 'idem-cmd-1';
  assert.throws(
    () => enqueue(first.state, { item_id: 'item-1', command: samePayloadDifferentCommand }, context(), clock(T1)),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
  const sharedKey = command({ command_id: 'cmd-shared-a' });
  sharedKey.idempotency_key = 'idem-shared';
  const firstShared = enqueue(createState(), { item_id: 'item-shared-a', command: sharedKey }, context(), clock());
  const divergentShared = command({ command_id: 'cmd-shared-b', display_name: 'Outro' });
  divergentShared.idempotency_key = 'idem-shared';
  assert.throws(
    () => enqueue(firstShared.state, { item_id: 'item-shared-b', command: divergentShared }, context(), clock(T1)),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
});

test('identidade do envelope não colide quando ids contêm separador', () => {
  const firstCommand = command({ command_id: 'aa' });
  firstCommand.idempotency_key = 'bb:cc';
  const first = enqueue(createState(), { item_id: 'collision-item', command: firstCommand }, context(), clock());
  const divergentCommand = command({ command_id: 'aa:bb' });
  divergentCommand.idempotency_key = 'cc';
  assert.throws(
    () => enqueue(first.state, { item_id: 'collision-item', command: divergentCommand }, context(), clock(T1)),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
});

test('índices internos são isolados por organização para ids iguais', () => {
  const orgOne = enqueued({ item_id: 'shared-item', command: { command_id: 'shared-command' } }, context('device-a', 'org-1'));
  const orgTwo = enqueue(
    orgOne.state,
    { item_id: 'shared-item', command: command({ command_id: 'shared-command', organization_id: 'org-2' }) },
    context('device-a', 'org-2'),
    clock(T1),
  );
  assert.equal(orgTwo.result.enqueue_status, 'enqueued');
  assert.equal(orgTwo.state.items.size, 1, 'view pública fica restrita ao tenant do contexto');
  assert.equal(orgTwo.state.commandIds.size, 1);
  assert.equal(orgTwo.state.idempotencyKeys.size, 1);
  assert.equal([...orgTwo.state.items.entries()][0][1].organization_id, 'org-2');
  assert.equal(orgTwo.state.items.get('shared-item').organization_id, 'org-2');
  assert.equal(orgTwo.state.items.get('org-1\u0000shared-item'), undefined, 'view não pode atravessar o tenant do contexto');
  const orgOneReplay = enqueue(
    orgTwo.state,
    { item_id: 'shared-item', command: command({ command_id: 'shared-command', organization_id: 'org-1' }) },
    context('device-a', 'org-1'),
    clock(T1),
  );
  assert.equal(orgOneReplay.result.enqueue_status, 'duplicate');
  assert.equal(orgOneReplay.state.items.size, 1);
});

test('claim e settle produzem acked, conflict e rejected sem efeito parcial', () => {
  const first = enqueued();
  const claimed = claim(first.state, { lease_id: 'lease-a' }, context(), clock(T1));
  assert.equal(claimed.result.state, 'claimed');
  assert.throws(
    () => settleGatewayResult(
      claimed.state,
      {
        item_id: 'item-1', lease_id: 'lease-a',
        result: {
          command_id: 'cmd-1', idempotency_key: 'idem-cmd-1', organization_id: 'org-1',
          aggregate_type: 'client', aggregate_id: 'client-1', state: 'acked', code: 'applied',
          canonical_version: 1, replayed: false,
        },
      },
      context('device-b'),
      clock(T2),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'lease_conflict',
  );
  assert.throws(
    () => settleFailure(
      claimed.state,
      { item_id: 'item-1', lease_id: 'lease-a', failure: { kind: 'transient', code: 'transport_unavailable' } },
      context('device-b'),
      clock(T2),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'lease_conflict',
  );
  const acked = settleGatewayResult(
    claimed.state,
    {
      item_id: 'item-1',
      lease_id: 'lease-a',
      result: {
        command_id: 'cmd-1', idempotency_key: 'idem-cmd-1', organization_id: 'org-1',
        aggregate_type: 'client', aggregate_id: 'client-1', state: 'acked', code: 'applied',
        canonical_version: 1, replayed: false,
      },
    },
    context(),
    clock(T2),
  );
  assert.equal(acked.result.state, 'acked');
  assert.equal(claim(acked.state, { lease_id: 'lease-b' }, context(), clock(T2)).result, null);

  const conflictSource = enqueued({ item_id: 'item-2', command: { command_id: 'cmd-2', aggregate_id: 'client-2' } });
  const conflictClaim = claim(conflictSource.state, { lease_id: 'lease-c' }, context(), clock(T1));
  const conflict = settleGatewayResult(
    conflictClaim.state,
    {
      item_id: 'item-2', lease_id: 'lease-c', result: {
        command_id: 'cmd-2', idempotency_key: 'idem-cmd-2', organization_id: 'org-1',
        aggregate_type: 'client', aggregate_id: 'client-2', state: 'conflict', code: 'expected_version_mismatch',
        canonical_version: 2, replayed: false,
      },
    },
    context(),
    clock(T2),
  );
  assert.equal(conflict.result.state, 'conflict');
});

test('o mesmo lease_id não pode reclamar dois itens ativos', () => {
  const first = enqueued({ item_id: 'lease-item-a', command: { command_id: 'lease-cmd-a', aggregate_id: 'client-a' } });
  const second = enqueue(first.state, { item_id: 'lease-item-b', command: command({ command_id: 'lease-cmd-b', aggregate_id: 'client-b' }) }, context(), clock(T1));
  const claimed = claim(second.state, { lease_id: 'lease-same' }, context(), clock(T1));
  assert.equal(claimed.result.item_id, 'lease-item-a');
  assert.throws(
    () => claim(claimed.state, { lease_id: 'lease-same' }, context(), clock(T1)),
    (error) => error instanceof OfflineOutboxError && error.code === 'lease_conflict',
  );
});

test('retry respeita limite e termina em dead_letter; resultado incerto exige reconciliação', () => {
  const first = enqueued({ item_id: 'item-3', command: { command_id: 'cmd-3', aggregate_id: 'client-3' } });
  const claimed = claim(first.state, { lease_id: 'lease-d' }, context(), clock(T1), { maxAttempts: 1, backoffBaseMs: 1 });
  const retry = settleFailure(claimed.state, { item_id: 'item-3', lease_id: 'lease-d', failure: { kind: 'transient', code: 'transport_unavailable' } }, context(), clock(T2), { maxAttempts: 1, backoffBaseMs: 1 });
  const dead = claim(retry.state, { lease_id: 'lease-e' }, context(), clock('2026-08-30T12:00:04.000Z'), { maxAttempts: 1, backoffBaseMs: 1 });
  assert.equal(dead.result, null);
  assert.equal(retry.state.items.get('item-3').state, 'dead_letter');

  const uncertain = enqueued({ item_id: 'item-4', command: { command_id: 'cmd-4', aggregate_id: 'client-4' } });
  const uncertainClaim = claim(uncertain.state, { lease_id: 'lease-f' }, context(), clock(T1), { maxAttempts: 1 });
  const wait = settleFailure(uncertainClaim.state, { item_id: 'item-4', lease_id: 'lease-f', failure: { kind: 'transient', code: 'transport_timeout' } }, context(), clock(T2), { maxAttempts: 1, backoffBaseMs: 1 });
  const probe = claim(wait.state, { lease_id: 'lease-g' }, context(), clock('2026-08-30T12:00:04.000Z'), { maxAttempts: 1, backoffBaseMs: 1 });
  const reconciled = settleFailure(probe.state, { item_id: 'item-4', lease_id: 'lease-g', failure: { kind: 'unclassified', code: 'unclassified_failure' } }, context(), clock('2026-08-30T12:00:05.000Z'), { maxAttempts: 1 });
  assert.equal(reconciled.result.state, 'reconcile_required');
});

test('falha não classificada agenda exatamente uma sonda antes de reconciliar', () => {
  const first = enqueued({ item_id: 'unclassified-item', command: { command_id: 'unclassified-command', aggregate_id: 'client-uncertain' } });
  const claimed = claim(first.state, { lease_id: 'lease-unclassified-a' }, context(), clock(T1), { maxAttempts: 3 });
  const waiting = settleFailure(
    claimed.state,
    { item_id: 'unclassified-item', lease_id: 'lease-unclassified-a', failure: { kind: 'unclassified', code: 'unclassified_failure' } },
    context(),
    clock(T1),
    { maxAttempts: 3 },
  );
  assert.equal(waiting.result.state, 'retry_wait');
  assert.equal(waiting.result.outcome_uncertain, true);
  assert.equal(waiting.result.reconciliation_probe_used, false);
  assert.equal(waiting.result.attempt_count, 3);

  const probe = claim(
    waiting.state,
    { lease_id: 'lease-unclassified-probe' },
    context(),
    clock(T1),
    { maxAttempts: 3 },
  );
  assert.equal(probe.result.state, 'claimed');
  assert.equal(probe.result.reconciliation_probe_used, true);
  const reconciled = settleFailure(
    probe.state,
    { item_id: 'unclassified-item', lease_id: 'lease-unclassified-probe', failure: { kind: 'unclassified', code: 'unclassified_failure' } },
    context(),
    clock(T2),
    { maxAttempts: 3 },
  );
  assert.equal(reconciled.result.state, 'reconcile_required');
  assert.equal(claim(reconciled.state, { lease_id: 'lease-unclassified-extra' }, context(), clock(T2), { maxAttempts: 3 }).result, null);
});

test('liquidação terminal limpa incerteza e dispositivo da lease', () => {
  const first = enqueued({ item_id: 'reclaimed-item', command: { command_id: 'reclaimed-command', aggregate_id: 'client-reclaimed' } });
  const initialClaim = claim(first.state, { lease_id: 'lease-reclaimed-a' }, context(), clock(T0), { leaseDurationMs: 1 });
  const reclaimed = claim(initialClaim.state, { lease_id: 'lease-reclaimed-b' }, context('device-b'), clock(T1), { leaseDurationMs: 1_000 });
  assert.equal(reclaimed.result.outcome_uncertain, true);
  assert.equal(reclaimed.result.claimed_by_device_id, 'device-b');
  const settled = settleGatewayResult(
    reclaimed.state,
    {
      item_id: 'reclaimed-item',
      lease_id: 'lease-reclaimed-b',
      result: {
        command_id: 'reclaimed-command', idempotency_key: 'idem-reclaimed-command', organization_id: 'org-1',
        aggregate_type: 'client', aggregate_id: 'client-reclaimed', state: 'acked', code: 'applied',
        canonical_version: 1, replayed: false,
      },
    },
    context('device-b'),
    clock(T1),
  );
  assert.equal(settled.result.state, 'acked');
  assert.equal(settled.result.outcome_uncertain, false);
  assert.equal(settled.result.claimed_by_device_id, null);
  assert.equal(settled.result.lease_id, null);
});

test('lease expirada após a sonda termina em reconciliação sem dispositivo reclamante', () => {
  const first = enqueued({ item_id: 'expired-probe-item', command: { command_id: 'expired-probe-command', aggregate_id: 'client-expired' } });
  const initial = claim(first.state, { lease_id: 'lease-expired-a' }, context(), clock(T0), { leaseDurationMs: 1, maxAttempts: 1 });
  const probe = claim(
    initial.state,
    { lease_id: 'lease-expired-probe' },
    context('device-b'),
    clock(T1),
    { leaseDurationMs: 1, maxAttempts: 1 },
  );
  assert.equal(probe.result.reconciliation_probe_used, true);
  const terminal = claim(
    probe.state,
    { lease_id: 'lease-expired-final' },
    context(),
    clock(T2),
    { leaseDurationMs: 1, maxAttempts: 1 },
  );
  assert.equal(terminal.result, null);
  const view = terminal.state.items.get('expired-probe-item');
  assert.equal(view.state, 'reconcile_required');
  assert.equal(view.outcome_uncertain, true);
  assert.equal(view.claimed_by_device_id, null);
  assert.equal(view.lease_id, null);
});

test('liquidação rejeita relógio anterior ao estado persistido', () => {
  const first = enqueued({ item_id: 'clock-regression-item', command: { command_id: 'clock-regression-command', aggregate_id: 'client-clock' } });
  const claimed = claim(first.state, { lease_id: 'lease-clock-regression' }, context(), clock(T1), { leaseDurationMs: 30_000 });
  assert.throws(
    () => settleFailure(
      claimed.state,
      { item_id: 'clock-regression-item', lease_id: 'lease-clock-regression', failure: { kind: 'transient', code: 'transport_unavailable' } },
      context(),
      clock(T0),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
  assert.throws(
    () => settleGatewayResult(
      claimed.state,
      {
        item_id: 'clock-regression-item', lease_id: 'lease-clock-regression',
        result: {
          command_id: 'clock-regression-command', idempotency_key: 'idem-clock-regression-command', organization_id: 'org-1',
          aggregate_type: 'client', aggregate_id: 'client-clock', state: 'acked', code: 'applied',
          canonical_version: 1, replayed: false,
        },
      },
      context(),
      clock(T0),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
});

test('claim rejeita relógio anterior ao estado pendente', () => {
  const futureState = enqueued(
    { item_id: 'claim-clock-regression-item', command: { command_id: 'claim-clock-regression-command' } },
    context(),
    clock(T1),
  );
  assert.throws(
    () => claim(
      futureState.state,
      { lease_id: 'lease-claim-clock-regression' },
      context(),
      clock(T0),
    ),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
});

test('clock skew excedente falha fechado e empate divergente não escolhe silenciosamente', () => {
  assert.throws(
    () => enqueued({}, context(), clock(T0, '2026-08-30T12:10:00.000Z')),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
  const conflict = resolveReplica({
    left: { organization_id: 'org-1', device_id: 'device-a', logical_version: 2, updated_at: T1, payload_hash: 'hash-a' },
    right: { organization_id: 'org-1', device_id: 'device-b', logical_version: 2, updated_at: T1, payload_hash: 'hash-b' },
  }, context());
  assert.deepEqual(conflict, { decision: 'conflict', reason: 'equal_timestamp_divergent_payload' });
  const skew = resolveReplica({
    left: { organization_id: 'org-1', device_id: 'device-a', logical_version: 2, updated_at: T0, payload_hash: 'hash-a' },
    right: { organization_id: 'org-1', device_id: 'device-b', logical_version: 2, updated_at: '2026-08-30T12:10:00.000Z', payload_hash: 'hash-b' },
  }, context());
  assert.equal(skew.decision, 'reconcile_required');
  assert.throws(
    () => resolveReplica({
      left: { organization_id: 'org-1', device_id: 'device-a', logical_version: 2, updated_at: T1, payload_hash: 'hash-a' },
      right: { organization_id: 'org-1', device_id: 'device-b', logical_version: 2, updated_at: T1, payload_hash: 'hash-b' },
    }, context('device-a', 'org-2')),
    (error) => error instanceof OfflineOutboxError && error.code === 'co_tenancy_violation',
  );
  assert.throws(
    () => resolveReplica({
      left: { organization_id: 'org-1', device_id: 'device-a', logical_version: 2, updated_at: T1, payload_hash: 'hash-a' },
      right: { organization_id: 'org-1', device_id: 'device-b', logical_version: 2, updated_at: T1, payload_hash: 'hash-b' },
    }),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
});

test('tombstone é atômico na fixture: crash não deixa exclusão parcial', () => {
  const base = createState();
  const crashed = applyTombstoneTransaction(base, {
    tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: T1, simulate_crash: true,
  }, context(), clock(T1));
  assert.equal(crashed.committed, false);
  assert.equal(crashed.state.tombstones.size, 0);
  const committed = applyTombstoneTransaction(base, {
    tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: T1, simulate_crash: false,
  }, context(), clock(T1));
  assert.equal(committed.committed, true);
  assert.equal(committed.state.tombstones.size, 1);
  const otherTenant = applyTombstoneTransaction(committed.state, {
    tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: T1, simulate_crash: false,
  }, context('device-a', 'org-2'), clock(T1));
  assert.equal(otherTenant.event, 'tombstone_committed');
  assert.equal(otherTenant.state.tombstones.size, 1, 'view pública fica restrita ao tenant do contexto');
  assert.equal([...otherTenant.state.tombstones.entries()][0][1].organization_id, 'org-2');
  const replay = applyTombstoneTransaction(committed.state, {
    tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: T1, simulate_crash: false,
  }, context('device-b'), clock(T2));
  assert.equal(replay.event, 'tombstone_duplicate');
  const originalReplay = applyTombstoneTransaction(otherTenant.state, {
    tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: T1, simulate_crash: false,
  }, context(), clock(T1));
  assert.equal(originalReplay.event, 'tombstone_duplicate');
  assert.throws(
    () => applyTombstoneTransaction(committed.state, {
      tombstone_id: 'tomb-1', aggregate_type: 'client', aggregate_id: 'client-2', deleted_at: T1, simulate_crash: false,
    }, context(), clock(T2)),
    (error) => error instanceof OfflineOutboxError && error.code === 'validation_failed',
  );
  assert.throws(
    () => applyTombstoneTransaction(base, {
      tombstone_id: 'tomb-future', aggregate_type: 'client', aggregate_id: 'client-1', deleted_at: '2030-01-01T00:00:00.000Z', simulate_crash: false,
    }, context(), clock(T1)),
    (error) => error instanceof OfflineOutboxError && error.code === 'clock_skew',
  );
});

test('retenção acima de 90 dias exige reconciliação antes de podar tombstone', () => {
  assert.deepEqual(retentionDecision({ last_seen_at: '2026-08-01T00:00:00.000Z', now: '2026-08-30T00:00:00.000Z' }), { decision: 'retain', reason: 'within_retention_window' });
  assert.deepEqual(retentionDecision({ last_seen_at: '2026-05-01T00:00:00.000Z', now: '2026-08-30T00:00:00.000Z' }), { decision: 'reconcile_required', reason: 'offline_device_over_90d' });
});
