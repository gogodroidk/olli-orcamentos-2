import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FIXTURE_NOW,
  FIXTURE_ORG_A,
  FIXTURE_ORG_B,
  FIXTURE_OUTSIDER_B,
  FIXTURE_OWNER_A,
  FIXTURE_TECH_A,
} from '../fixtures/synthetic.mjs';
import {
  countServerEvents,
  drainCommand,
  enqueueCommand,
  getCommand,
  getLocalAggregate,
  getProjectionV1,
  getServerAggregate,
  openSpikeDatabase,
  rebuildProjectionV1,
  recoverInterruptedCommands,
  seedMembership,
  seedServerAggregate,
  setMembership,
  transactLocalMutationAndEnqueue,
} from '../spikes/outbox/sqlite-outbox.mjs';

function command(overrides = {}) {
  return {
    commandId: 'command-fixture-1',
    idempotencyKey: 'idempotency-fixture-1', // gitleaks:allow -- chave sintética, não é credencial
    protocolVersion: 1,
    schemaVersion: 1,
    organizationId: FIXTURE_ORG_A,
    actorUserId: FIXTURE_TECH_A,
    deviceId: 'device-fixture-1',
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
    operation: 'create',
    expectedVersion: 0,
    payload: { label: 'cliente sintético', status: 'active' },
    createdAtLocal: FIXTURE_NOW,
    ...overrides,
  };
}

function activeMembership(db, userId = FIXTURE_TECH_A) {
  seedMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId,
    role: userId === FIXTURE_OWNER_A ? 'owner' : 'technician',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  });
  if (userId !== FIXTURE_OWNER_A) {
    seedMembership(db, {
      organizationId: FIXTURE_ORG_A,
      userId: FIXTURE_OWNER_A,
      role: 'owner',
      status: 'active',
      membershipVersion: 1,
      updatedAt: FIXTURE_NOW,
    });
  }
}

test('mutação local e outbox são atômicas e sobrevivem a fechar/reabrir', () => {
  const directory = mkdtempSync(join(tmpdir(), 'olli-outbox-fixture-'));
  const filename = join(directory, 'spike.sqlite');
  try {
    let db = openSpikeDatabase(filename);
    activeMembership(db);
    transactLocalMutationAndEnqueue(db, {
      localAggregate: {
        organizationId: FIXTURE_ORG_A,
        aggregateType: 'client',
        aggregateId: 'client-fixture-1',
        version: 1,
        payload: { label: 'cliente sintético', status: 'active' },
        updatedAt: FIXTURE_NOW,
      },
      command: command(),
    });
    db.close();

    db = openSpikeDatabase(filename);
    assert.equal(getLocalAggregate(db, {
      organizationId: FIXTURE_ORG_A,
      aggregateType: 'client',
      aggregateId: 'client-fixture-1',
    }).version, 1);
    assert.equal(getCommand(db, {
      organizationId: FIXTURE_ORG_A,
      commandId: 'command-fixture-1',
    }).state, 'pending');
    const result = drainCommand(db, 'command-fixture-1', {
      sessionUserId: FIXTURE_TECH_A,
      processedAt: '2026-08-27T12:01:00.000Z',
    });
    assert.equal(result.state, 'acked');
    assert.equal(getServerAggregate(db, {
      sessionUserId: FIXTURE_OWNER_A,
      organizationId: FIXTURE_ORG_A,
      aggregateType: 'client',
      aggregateId: 'client-fixture-1',
    }).version, 1);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('mesma chave e mesmo comando reaplicado confirma sem duplicar efeito', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  enqueueCommand(db, command());
  const first = drainCommand(db, 'command-fixture-1', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:01:00.000Z',
  });
  enqueueCommand(db, command({
    commandId: 'command-fixture-1-retry',
    deviceId: 'device-fixture-2',
    createdAtLocal: '2026-08-27T12:02:00.000Z',
  }));
  const retry = drainCommand(db, 'command-fixture-1-retry', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:03:00.000Z',
  });

  assert.equal(first.code, 'applied');
  assert.equal(retry.code, 'idempotent_replay');
  assert.equal(retry.canonicalVersion, 1);
  assert.equal(countServerEvents(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  }), 1);
  db.close();
});

test('mesma chave com payload diferente é rejeitada sem mutar o servidor', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  enqueueCommand(db, command());
  drainCommand(db, 'command-fixture-1', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:01:00.000Z',
  });
  enqueueCommand(db, command({
    commandId: 'command-fixture-key-reuse',
    payload: { label: 'payload diferente', status: 'active' },
    createdAtLocal: '2026-08-27T12:02:00.000Z',
  }));
  const result = drainCommand(db, 'command-fixture-key-reuse', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:03:00.000Z',
  });

  assert.equal(result.state, 'rejected');
  assert.equal(result.code, 'idempotency_key_reused');
  assert.equal(getServerAggregate(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  }).payload.label, 'cliente sintético');
  assert.equal(countServerEvents(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  }), 1);
  db.close();
});

test('permissão revogada depois do enqueue impede aplicação', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  enqueueCommand(db, command());
  setMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_TECH_A,
    role: 'technician',
    status: 'revoked',
    membershipVersion: 2,
    updatedAt: '2026-08-27T12:01:00.000Z',
  });
  const result = drainCommand(db, 'command-fixture-1', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:02:00.000Z',
  });

  assert.equal(result.state, 'rejected');
  assert.equal(result.code, 'authorization_revoked');
  assert.equal(getServerAggregate(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  }), null);
  db.close();
});

test('papel ativo sem permissão é negado e papel desconhecido falha fechado', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  seedMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: 'user-viewer-a',
    role: 'viewer',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  });
  enqueueCommand(db, command({
    commandId: 'command-viewer-denied',
    idempotencyKey: 'idempotency-viewer-denied',
    actorUserId: 'user-viewer-a',
  }));
  const denied = drainCommand(db, 'command-viewer-denied', {
    sessionUserId: 'user-viewer-a',
    processedAt: '2026-08-27T12:01:00.000Z',
  });

  assert.equal(denied.state, 'rejected');
  assert.equal(denied.code, 'role_not_authorized');
  assert.equal(getServerAggregate(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  }), null);
  assert.throws(() => seedMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: 'user-unknown-role',
    role: 'superuser',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  }), /role desconhecido/);
  db.close();
});

test('versão de membership não regride nem muda autorização na mesma versão', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  assert.throws(() => setMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_TECH_A,
    role: 'technician',
    status: 'revoked',
    membershipVersion: 1,
    updatedAt: '2026-08-27T12:01:00.000Z',
  }), /mesma membership.version/);
  setMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_TECH_A,
    role: 'technician',
    status: 'revoked',
    membershipVersion: 2,
    updatedAt: '2026-08-27T12:02:00.000Z',
  });
  assert.throws(() => setMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_TECH_A,
    role: 'technician',
    status: 'active',
    membershipVersion: 1,
    updatedAt: '2026-08-27T12:03:00.000Z',
  }), /não pode regredir/);
  db.close();
});

test('conflito de versão é explícito e não faz last-write-wins', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  seedServerAggregate(db, {
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'site',
    aggregateId: 'site-fixture-1',
    version: 2,
    payload: { label: 'versão canônica 2' },
    updatedBy: FIXTURE_OWNER_A,
    updatedAt: FIXTURE_NOW,
  });
  enqueueCommand(db, command({
    commandId: 'command-conflict-1',
    idempotencyKey: 'idempotency-conflict-1',
    aggregateType: 'site',
    aggregateId: 'site-fixture-1',
    operation: 'update',
    expectedVersion: 1,
    payload: { label: 'tentativa offline obsoleta' },
  }));
  const result = drainCommand(db, 'command-conflict-1', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:01:00.000Z',
  });

  assert.equal(result.state, 'conflict');
  assert.equal(result.canonicalVersion, 2);
  assert.equal(getServerAggregate(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'site',
    aggregateId: 'site-fixture-1',
  }).payload.label, 'versão canônica 2');

  enqueueCommand(db, command({
    commandId: 'command-conflict-retry',
    idempotencyKey: 'idempotency-conflict-1',
    aggregateType: 'site',
    aggregateId: 'site-fixture-1',
    operation: 'update',
    expectedVersion: 1,
    payload: { label: 'tentativa offline obsoleta' },
    createdAtLocal: '2026-08-27T12:02:00.000Z',
  }));
  const retriedConflict = drainCommand(db, 'command-conflict-retry', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:03:00.000Z',
  });
  assert.equal(retriedConflict.state, 'conflict');
  assert.equal(retriedConflict.code, 'expected_version_mismatch');
  assert.equal(retriedConflict.replayed, true);
  db.close();
});

test('crash após commit é recuperado por idempotência sem segunda mutação', () => {
  const directory = mkdtempSync(join(tmpdir(), 'olli-outbox-crash-fixture-'));
  const filename = join(directory, 'spike.sqlite');
  try {
    let db = openSpikeDatabase(filename);
    activeMembership(db);
    enqueueCommand(db, command());
    assert.throws(() => drainCommand(db, 'command-fixture-1', {
      sessionUserId: FIXTURE_TECH_A,
      processedAt: '2026-08-27T12:01:00.000Z',
      simulateCrashAfterServerCommit: true,
    }), /SIMULATED_CRASH_AFTER_SERVER_COMMIT/);
    assert.equal(getCommand(db, {
      organizationId: FIXTURE_ORG_A,
      commandId: 'command-fixture-1',
    }).state, 'sending');
    db.close();

    db = openSpikeDatabase(filename);
    assert.equal(recoverInterruptedCommands(db, {
      organizationId: FIXTURE_ORG_A,
      recoveredAt: '2026-08-27T12:02:00.000Z',
    }), 1);
    const retry = drainCommand(db, 'command-fixture-1', {
      sessionUserId: FIXTURE_TECH_A,
      processedAt: '2026-08-27T12:03:00.000Z',
    });
    assert.equal(retry.code, 'idempotent_replay');
    assert.equal(countServerEvents(db, {
      sessionUserId: FIXTURE_OWNER_A,
      organizationId: FIXTURE_ORG_A,
      aggregateType: 'client',
      aggregateId: 'client-fixture-1',
    }), 1);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('consultas são particionadas e replay da projeção V1 não rebaixa versão', () => {
  const db = openSpikeDatabase();
  activeMembership(db);
  enqueueCommand(db, command());
  drainCommand(db, 'command-fixture-1', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:01:00.000Z',
  });

  seedMembership(db, {
    organizationId: FIXTURE_ORG_B,
    userId: FIXTURE_OUTSIDER_B,
    role: 'owner',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  });
  seedServerAggregate(db, {
    organizationId: FIXTURE_ORG_B,
    aggregateType: 'client',
    aggregateId: 'client-fixture-b',
    version: 1,
    payload: { label: 'cliente somente da organização B', status: 'active' },
    updatedBy: FIXTURE_OUTSIDER_B,
    updatedAt: FIXTURE_NOW,
  });
  assert.throws(() => getServerAggregate(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_B,
    aggregateType: 'client',
    aggregateId: 'client-fixture-b',
  }), /read_not_authorized/);
  assert.equal(getServerAggregate(db, {
    sessionUserId: FIXTURE_OUTSIDER_B,
    organizationId: FIXTURE_ORG_B,
    aggregateType: 'client',
    aggregateId: 'client-fixture-b',
  }).payload.label, 'cliente somente da organização B');
  assert.equal(getCommand(db, {
    organizationId: FIXTURE_ORG_B,
    commandId: 'command-fixture-1',
  }), null);

  enqueueCommand(db, command({
    commandId: 'command-fixture-update-2',
    idempotencyKey: 'idempotency-fixture-update-2',
    operation: 'update',
    expectedVersion: 1,
    payload: { label: 'cliente sintético versão 2', status: 'active' },
    createdAtLocal: '2026-08-27T12:02:00.000Z',
  }));
  drainCommand(db, 'command-fixture-update-2', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:03:00.000Z',
  });

  assert.equal(rebuildProjectionV1(db, { sessionUserId: FIXTURE_OWNER_A, organizationId: FIXTURE_ORG_A }), 2);
  assert.equal(rebuildProjectionV1(db, { sessionUserId: FIXTURE_OWNER_A, organizationId: FIXTURE_ORG_A }), 2);
  const projection = getProjectionV1(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-fixture-1',
  });
  assert.equal(projection.version, 2);
  assert.equal(projection.payload.label, 'cliente sintético versão 2');
  db.close();
});

test('payload excessivo, segredo, blob e referência pública são barrados antes da fila', () => {
  const db = openSpikeDatabase();
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-secret',
    idempotencyKey: 'idempotency-secret',
    payload: { apiToken: 'fixture-do-not-store' },
  })), /campo sensível proibido/);
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-blob',
    idempotencyKey: 'idempotency-blob',
    payload: { attachmentUri: 'data:image/png;base64,fixture' },
  })), /blob embutido/);
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-public-uri',
    idempotencyKey: 'idempotency-public-uri',
    payload: { attachmentUri: 'https://example.invalid/file' },
  })), /referência privada/);
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-large',
    idempotencyKey: 'idempotency-large',
    payload: { text: 'x'.repeat(70 * 1024) },
  })), /excede 65536 bytes/);
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-private-field',
    idempotencyKey: 'idempotency-private-field',
    payload: { label: 'cliente sintético', status: 'active', privateCostCents: 12345 },
  })), /não pertence ao schema de transporte/);
  assert.throws(() => enqueueCommand(db, command({
    commandId: 'command-invalid-pair',
    idempotencyKey: 'idempotency-invalid-pair',
    aggregateType: 'document',
    aggregateId: 'document-invalid-pair',
    operation: 'update',
    expectedVersion: 1,
  })), /par aggregateType\/operation não permitido/);
  db.close();
});

test('payload local divergente do comando aborta as duas gravações', () => {
  const db = openSpikeDatabase();
  assert.throws(() => transactLocalMutationAndEnqueue(db, {
    localAggregate: {
      organizationId: FIXTURE_ORG_A,
      aggregateType: 'client',
      aggregateId: 'client-divergent',
      version: 1,
      payload: { label: 'valor apenas local', status: 'active' },
      updatedAt: FIXTURE_NOW,
    },
    command: command({
      commandId: 'command-divergent',
      idempotencyKey: 'idempotency-divergent',
      aggregateId: 'client-divergent',
      payload: { label: 'valor diferente na fila', status: 'active' },
    }),
  }), /payload local deve ser idêntico/);
  assert.equal(getLocalAggregate(db, {
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'client',
    aggregateId: 'client-divergent',
  }), null);
  assert.equal(getCommand(db, {
    organizationId: FIXTURE_ORG_A,
    commandId: 'command-divergent',
  }), null);
  db.close();
});
