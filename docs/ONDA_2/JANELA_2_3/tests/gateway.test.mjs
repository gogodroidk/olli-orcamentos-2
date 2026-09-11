import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GatewayBoundaryError,
  createIncrementAGateway,
} from '../gateway/increment-a-gateway.mjs';
import {
  FIXTURE_CLIENT_A,
  FIXTURE_CREATE_CLIENT_COMMAND,
  FIXTURE_CREATE_LOCATION_COMMAND,
  FIXTURE_LOCATION_A,
  FIXTURE_MEMBERSHIP_OWNER_A,
  FIXTURE_ORG_A,
  FIXTURE_ORG_B,
  FIXTURE_UPDATE_CLIENT_COMMAND,
  FIXTURE_UPDATE_LOCATION_COMMAND,
  FIXTURE_USER_MULTI,
  FIXTURE_USER_OUTSIDER_B,
  FIXTURE_USER_TECH_A,
  FIXTURE_USER_TECH_LIMITED_A,
  FIXTURE_USER_VIEWER_A,
  createGatewayFixture,
  makeFixtureCommand,
  trustedSession,
} from '../fixtures/gateway-fixture.mjs';

function executeAs(gateway, command, userId) {
  return gateway.execute(command, trustedSession(userId));
}

function expectBoundaryError(work, code = 'validation_failed') {
  assert.throws(
    work,
    (error) => (
      error instanceof GatewayBoundaryError
      && error.code === code
      && error.safe_result.code === code
    ),
  );
}

test('create_client usa sessão/membership canônicas e persiste versão um', () => {
  const { gateway, store } = createGatewayFixture();
  const result = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.deepEqual(result, {
    command_id: FIXTURE_CREATE_CLIENT_COMMAND.command_id,
    idempotency_key: FIXTURE_CREATE_CLIENT_COMMAND.idempotency_key,
    organization_id: FIXTURE_ORG_A,
    aggregate_type: 'client',
    aggregate_id: FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
    state: 'acked',
    code: 'applied',
    canonical_version: 1,
    replayed: false,
  });
  const created = store.inspectClient(
    FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
  );
  assert.equal(created.version, 1);
  assert.equal(created.updated_at, '2026-08-28T22:00:00.000Z');
  assert.equal(store.ledgerSize, 1);
});

test('dois writers com expected_version igual geram um update e um conflito explícito', () => {
  const { gateway, store } = createGatewayFixture();
  const first = executeAs(
    gateway,
    FIXTURE_UPDATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const stale = executeAs(
    gateway,
    {
      ...FIXTURE_UPDATE_CLIENT_COMMAND,
      command_id: 'command-stale-writer-a',
      idempotency_key: 'idem-stale-writer-a',
      payload: { display_name: 'Writer Sintético Atrasado' },
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(first.code, 'applied');
  assert.equal(first.canonical_version, 2);
  assert.equal(stale.state, 'conflict');
  assert.equal(stale.code, 'expected_version_mismatch');
  assert.equal(stale.canonical_version, 2);
  const current = store.inspectClient(FIXTURE_CLIENT_A.client_id);
  assert.equal(current.version, 2);
  assert.equal(
    current.display_name,
    FIXTURE_UPDATE_CLIENT_COMMAND.payload.display_name,
  );
});

test('retry com mesmo hash devolve replay sem duplicar efeito', () => {
  const { gateway, store } = createGatewayFixture();
  const first = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const retry = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-retry-transport-a',
      device_id: 'device-retry-transport-a',
      created_at_local: '2026-08-28T22:30:00.000Z',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(first.code, 'applied');
  assert.equal(retry.code, 'idempotent_replay');
  assert.equal(retry.replayed, true);
  assert.equal(retry.canonical_version, 1);
  assert.equal(store.ledgerSize, 1);
  assert.equal(store.snapshotCounts().clients, 3);
});

test('mesmo command_id, chave e hash retorna replay sem novo efeito', () => {
  const { gateway, store } = createGatewayFixture();
  const first = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const exactRetry = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(first.code, 'applied');
  assert.equal(exactRetry.code, 'idempotent_replay');
  assert.equal(exactRetry.replayed, true);
  assert.equal(store.ledgerSize, 1);
  assert.equal(store.snapshotCounts().clients, 3);
});

test('command_id é globalmente único mesmo com outra chave idempotente', () => {
  const { gateway, store } = createGatewayFixture();
  const first = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const duplicateCommandId = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      idempotency_key: 'idem-command-id-global-duplicate',
      aggregate_id: 'client-command-id-global-duplicate',
      payload: {
        ...FIXTURE_CREATE_CLIENT_COMMAND.payload,
        display_name: 'Cliente Que Não Deve Existir',
      },
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(first.code, 'applied');
  assert.equal(duplicateCommandId.state, 'rejected');
  assert.equal(duplicateCommandId.code, 'validation_failed');
  assert.equal(
    store.inspectClient('client-command-id-global-duplicate'),
    null,
  );
  assert.equal(store.ledgerSize, 1);
});

test('command_id duplicado em outra organização também falha fechado', () => {
  const { gateway, store } = createGatewayFixture();
  executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const crossTenantDuplicate = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      organization_id: FIXTURE_ORG_B,
      idempotency_key: 'idem-command-id-cross-tenant-duplicate',
      aggregate_id: 'client-command-id-cross-tenant-duplicate',
    },
    FIXTURE_USER_OUTSIDER_B,
  );

  assert.equal(crossTenantDuplicate.state, 'rejected');
  assert.equal(crossTenantDuplicate.code, 'validation_failed');
  assert.equal(
    store.inspectClient('client-command-id-cross-tenant-duplicate'),
    null,
  );
  assert.equal(store.ledgerSize, 1);
});

test('replay é vinculado ao ator original dentro da organização', () => {
  for (const [firstActor, retryActor, suffix] of [
    [FIXTURE_MEMBERSHIP_OWNER_A.user_id, FIXTURE_USER_TECH_A, 'owner-tech'],
    [FIXTURE_USER_TECH_A, FIXTURE_MEMBERSHIP_OWNER_A.user_id, 'tech-owner'],
  ]) {
    const { gateway, store } = createGatewayFixture();
    const command = {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: `command-actor-bound-${suffix}`,
      idempotency_key: `idem-actor-bound-${suffix}`,
      aggregate_id: `client-actor-bound-${suffix}`,
    };
    const first = executeAs(gateway, command, firstActor);
    const crossActorRetry = executeAs(
      gateway,
      {
        ...command,
        command_id: `command-actor-bound-retry-${suffix}`,
        device_id: `device-actor-bound-retry-${suffix}`,
      },
      retryActor,
    );

    assert.equal(first.code, 'applied');
    assert.equal(crossActorRetry.state, 'rejected');
    assert.equal(crossActorRetry.code, 'authorization_denied');
    assert.equal(crossActorRetry.replayed, false);
    assert.equal(store.ledgerSize, 1);
  }
});

test('mesma chave com hash divergente rejeita e preserva o primeiro efeito', () => {
  const { gateway, store } = createGatewayFixture();
  executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const divergent = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-divergent-payload-a',
      payload: {
        ...FIXTURE_CREATE_CLIENT_COMMAND.payload,
        display_name: 'Payload Sintético Divergente',
      },
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(divergent.state, 'rejected');
  assert.equal(divergent.code, 'idempotency_key_reused');
  assert.equal(store.ledgerSize, 1);
  assert.equal(
    store.inspectClient(
      FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
    ).display_name,
    FIXTURE_CREATE_CLIENT_COMMAND.payload.display_name,
  );
});

test('namespace idempotente é por organização', () => {
  const { gateway, store } = createGatewayFixture();
  executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const tenantB = {
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: 'command-create-client-b-new',
    organization_id: FIXTURE_ORG_B,
    aggregate_id: 'client-fixture-b-new',
  };
  const result = executeAs(
    gateway,
    tenantB,
    FIXTURE_USER_OUTSIDER_B,
  );

  assert.equal(result.code, 'applied');
  assert.equal(result.organization_id, FIXTURE_ORG_B);
  assert.equal(store.ledgerSize, 2);
});

test('membership é reidratada no drain e revogação bloqueia comando já criado', () => {
  const { gateway, store } = createGatewayFixture();
  const queuedCommand = {
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: 'command-queued-before-revocation',
    idempotency_key: 'idem-queued-before-revocation',
    aggregate_id: 'client-queued-before-revocation',
  };
  store.setMembershipStatus(
    FIXTURE_ORG_A,
    FIXTURE_USER_TECH_A,
    'revoked',
    '2026-08-28T22:10:00.000Z',
  );
  const result = executeAs(
    gateway,
    queuedCommand,
    FIXTURE_USER_TECH_A,
  );

  assert.equal(result.code, 'authorization_revoked');
  assert.equal(result.state, 'rejected');
  assert.equal(
    store.inspectClient(queuedCommand.aggregate_id),
    null,
  );
  assert.equal(store.ledgerSize, 0);
});

test('replay também revalida membership atual antes de revelar resultado', () => {
  const { gateway, store } = createGatewayFixture();
  executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  store.setMembershipStatus(
    FIXTURE_ORG_A,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    'revoked',
    '2026-08-28T22:11:00.000Z',
  );
  const retry = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-retry-after-revocation',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  assert.equal(retry.code, 'authorization_revoked');
  assert.equal(retry.replayed, false);
  assert.equal(store.ledgerSize, 1);
});

test('viewer, técnico sem capability e outsider falham fechado sem reservar chave', () => {
  for (const userId of [
    FIXTURE_USER_VIEWER_A,
    FIXTURE_USER_TECH_LIMITED_A,
    FIXTURE_USER_OUTSIDER_B,
  ]) {
    const { gateway, store } = createGatewayFixture();
    const result = executeAs(
      gateway,
      FIXTURE_CREATE_CLIENT_COMMAND,
      userId,
    );
    assert.equal(result.code, 'authorization_denied');
    assert.equal(store.ledgerSize, 0);
    assert.equal(
      store.inspectClient(
        FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
      ),
      null,
    );
  }
});

test('usuário multiempresa recebe a permissão do tenant do comando, não de outra membership', () => {
  const { gateway, store } = createGatewayFixture();
  const allowed = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-multi-a',
      idempotency_key: 'idem-multi-a',
      aggregate_id: 'client-multi-a',
    },
    FIXTURE_USER_MULTI,
  );
  const denied = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-multi-b',
      idempotency_key: 'idem-multi-b',
      organization_id: FIXTURE_ORG_B,
      aggregate_id: 'client-multi-b',
    },
    FIXTURE_USER_MULTI,
  );

  assert.equal(allowed.code, 'applied');
  assert.equal(denied.code, 'authorization_denied');
  assert.equal(store.inspectClient('client-multi-b'), null);
});

test('create_location reidrata cliente canônico e bloqueia co-tenancy', () => {
  const { gateway, store } = createGatewayFixture();
  const crossTenant = {
    ...FIXTURE_CREATE_LOCATION_COMMAND,
    command_id: 'command-cross-tenant-location',
    idempotency_key: 'idem-cross-tenant-location',
    aggregate_id: 'location-cross-tenant',
    payload: {
      ...FIXTURE_CREATE_LOCATION_COMMAND.payload,
      client_id: 'client-fixture-b-1',
    },
  };
  const result = executeAs(
    gateway,
    crossTenant,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(result.code, 'co_tenancy_violation');
  assert.equal(result.state, 'rejected');
  assert.equal(store.inspectLocation(crossTenant.aggregate_id), null);
});

test('create_location válido cria versão um ligada ao cliente canônico', () => {
  const { gateway, store } = createGatewayFixture();
  const result = executeAs(
    gateway,
    FIXTURE_CREATE_LOCATION_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const location = store.inspectLocation(
    FIXTURE_CREATE_LOCATION_COMMAND.aggregate_id,
  );
  assert.equal(result.code, 'applied');
  assert.equal(result.canonical_version, 1);
  assert.equal(
    location.client_id,
    FIXTURE_CREATE_LOCATION_COMMAND.payload.client_id,
  );
  assert.equal(location.version, 1);
});

test('create de agregado já existente produz conflito sem sobrescrever', () => {
  const { gateway, store } = createGatewayFixture();
  const result = executeAs(
    gateway,
    {
      ...FIXTURE_CREATE_CLIENT_COMMAND,
      command_id: 'command-create-existing-client',
      idempotency_key: 'idem-create-existing-client',
      aggregate_id: FIXTURE_CLIENT_A.client_id,
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  assert.equal(result.state, 'conflict');
  assert.equal(result.canonical_version, 1);
  assert.deepEqual(
    store.inspectClient(FIXTURE_CLIENT_A.client_id),
    FIXTURE_CLIENT_A,
  );
});

test('update de agregado ausente usa rejeição anti-enumeração', () => {
  const { gateway, store } = createGatewayFixture();
  const result = executeAs(
    gateway,
    {
      ...FIXTURE_UPDATE_CLIENT_COMMAND,
      command_id: 'command-update-missing-client',
      idempotency_key: 'idem-update-missing-client',
      aggregate_id: 'client-missing-fixture',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  assert.equal(result.state, 'rejected');
  assert.equal(result.code, 'authorization_denied');
  assert.equal(result.canonical_version, null);
  assert.equal(store.inspectClient('client-missing-fixture'), null);
});

test('conflito persistido permanece determinístico após a versão avançar', () => {
  const { gateway, store } = createGatewayFixture();
  const futureVersion = {
    ...FIXTURE_UPDATE_CLIENT_COMMAND,
    command_id: 'command-future-version',
    idempotency_key: 'idem-future-version',
    expected_version: 2,
  };
  const firstConflict = executeAs(
    gateway,
    futureVersion,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const validUpdate = executeAs(
    gateway,
    {
      ...FIXTURE_UPDATE_CLIENT_COMMAND,
      command_id: 'command-valid-after-conflict',
      idempotency_key: 'idem-valid-after-conflict',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const replayedConflict = executeAs(
    gateway,
    {
      ...futureVersion,
      command_id: 'command-future-version-retry',
      device_id: 'device-future-version-retry',
    },
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(firstConflict.canonical_version, 1);
  assert.equal(validUpdate.canonical_version, 2);
  assert.equal(replayedConflict.state, 'conflict');
  assert.equal(replayedConflict.canonical_version, 1);
  assert.equal(replayedConflict.replayed, false);
  assert.equal(store.inspectClient(FIXTURE_CLIENT_A.client_id).version, 2);
});

test('update_location incrementa versão e preserva client_id canônico', () => {
  const { gateway, store } = createGatewayFixture();
  const result = executeAs(
    gateway,
    FIXTURE_UPDATE_LOCATION_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const location = store.inspectLocation(FIXTURE_LOCATION_A.location_id);

  assert.equal(result.canonical_version, 2);
  assert.equal(location.version, 2);
  assert.equal(
    location.client_id,
    FIXTURE_LOCATION_A.client_id,
  );
  assert.equal(
    location.label,
    FIXTURE_UPDATE_LOCATION_COMMAND.payload.label,
  );
});

test('kill switch server-side bloqueia novas escritas sem apagar estado', () => {
  const { gateway, store } = createGatewayFixture();
  const before = store.snapshotCounts();
  store.setOrganizationFlag(FIXTURE_ORG_A, false);
  const result = executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );

  assert.equal(result.code, 'authorization_denied');
  assert.equal(store.inspectClient(FIXTURE_CLIENT_A.client_id).version, 1);
  assert.equal(store.snapshotCounts().clients, before.clients);
  assert.equal(store.ledgerSize, 0);
});

test('falha dentro da transação não deixa mutação parcial', () => {
  const { store } = createGatewayFixture();
  const before = store.inspectClient(FIXTURE_CLIENT_A.client_id);
  assert.throws(
    () => store.transaction((draft) => {
      draft.clients.delete(FIXTURE_CLIENT_A.client_id);
      throw new Error('falha sintética após mutação do draft');
    }),
    /falha sintética/,
  );
  assert.deepEqual(
    store.inspectClient(FIXTURE_CLIENT_A.client_id),
    before,
  );
});

test('callback assíncrono é recusado antes do commit do store síncrono', () => {
  const { store } = createGatewayFixture();
  expectBoundaryError(() => store.transaction((draft) => {
    draft.clients.delete(FIXTURE_CLIENT_A.client_id);
    return Promise.resolve({ unsafe: true });
  }));
  assert.equal(
    store.inspectClient(FIXTURE_CLIENT_A.client_id).version,
    1,
  );
});

test('relógio canônico inválido interrompe a transação antes do efeito', () => {
  const { store } = createGatewayFixture();
  const gateway = createIncrementAGateway({
    store,
    clock: () => 'invalid-server-time',
  });
  expectBoundaryError(() => executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  ));
  assert.equal(
    store.inspectClient(
      FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
    ),
    null,
  );
  assert.equal(store.ledgerSize, 0);
});

test('contexto confiável rejeita role/membership fornecidos pelo chamador', () => {
  const { gateway, store } = createGatewayFixture();
  expectBoundaryError(() => gateway.execute(
    FIXTURE_CREATE_CLIENT_COMMAND,
    {
      session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
      role: 'owner',
    },
  ));
  assert.equal(store.ledgerSize, 0);
});

test('comando malformado vira erro seguro sem ecoar conteúdo', () => {
  const { gateway, store } = createGatewayFixture();
  const malformed = {
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    actor_user_id: 'attacker-controlled',
    payload: {
      display_name: 'Conteúdo Que Não Pode Vazar',
      status: 'active',
    },
  };
  try {
    gateway.execute(
      malformed,
      trustedSession(FIXTURE_MEMBERSHIP_OWNER_A.user_id),
    );
    assert.fail('comando malformado foi aceito');
  } catch (error) {
    assert.equal(error instanceof GatewayBoundaryError, true);
    assert.equal(error.code, 'validation_failed');
    assert.deepEqual(error.safe_result, {
      state: 'rejected',
      code: 'validation_failed',
    });
    assert.equal(
      error.message.includes('Conteúdo Que Não Pode Vazar'),
      false,
    );
    assert.equal(error.message.includes('attacker-controlled'), false);
  }
  assert.equal(store.ledgerSize, 0);
});

test('ledger persiste somente metadados e safe_result allowlistado', () => {
  const { gateway, store } = createGatewayFixture();
  executeAs(
    gateway,
    FIXTURE_CREATE_CLIENT_COMMAND,
    FIXTURE_MEMBERSHIP_OWNER_A.user_id,
  );
  const entry = store.inspectLedger(
    FIXTURE_ORG_A,
    FIXTURE_CREATE_CLIENT_COMMAND.idempotency_key,
  );
  assert.deepEqual(Object.keys(entry).sort(), [
    'actor_user_id',
    'aggregate_id',
    'aggregate_type',
    'command_hash',
    'command_id',
    'created_at',
    'idempotency_key',
    'operation',
    'organization_id',
    'safe_result',
  ]);
  assert.deepEqual(Object.keys(entry.safe_result).sort(), [
    'aggregate_id',
    'aggregate_type',
    'canonical_version',
    'code',
    'command_id',
    'idempotency_key',
    'organization_id',
    'replayed',
    'state',
  ]);
  const serialized = JSON.stringify(entry);
  for (const forbidden of [
    'payload',
    'display_name',
    'Novo Cliente Sintético',
    'device_id',
    'created_at_local',
    'password',
    'token',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('snapshots de inspeção não permitem alterar o estado canônico', () => {
  const { store } = createGatewayFixture();
  const snapshot = store.inspectClient(FIXTURE_CLIENT_A.client_id);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => {
    snapshot.version = 999;
  }, TypeError);
  assert.equal(
    store.inspectClient(FIXTURE_CLIENT_A.client_id).version,
    1,
  );
});
