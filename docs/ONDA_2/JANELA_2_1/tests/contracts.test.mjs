import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ContractError,
  FixtureIdempotencyLedger,
  authorizeCommand,
  commandHash,
  validateClient,
  validateCommand,
  validateCommandResult,
  validateLocation,
  validateMembership,
  validateOrganization,
} from '../contracts/tenancy-contract.mjs';
import {
  FIXTURE_CLIENT_A,
  FIXTURE_CLIENT_B,
  FIXTURE_CREATE_CLIENT_COMMAND,
  FIXTURE_CREATE_LOCATION_COMMAND,
  FIXTURE_LOCATION_A,
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
  FIXTURE_ORG_A,
  FIXTURE_ORG_B,
  FIXTURE_UPDATE_CLIENT_COMMAND,
  FIXTURE_UPDATE_LOCATION_COMMAND,
  FIXTURE_USER_MULTI,
  makeFixtureCommand,
} from '../fixtures/synthetic.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function expectCode(work, code) {
  assert.throws(work, (error) => error instanceof ContractError && error.code === code);
}

test('seis schemas JSON 2020-12 são parseáveis, estritos e versionados', () => {
  const schemaDir = join(ROOT, 'schemas');
  const names = readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json')).sort();
  assert.deepEqual(names, [
    'client.schema.json',
    'command-envelope.schema.json',
    'command-result.schema.json',
    'location.schema.json',
    'membership.schema.json',
    'organization.schema.json',
  ]);

  for (const name of names) {
    const schema = JSON.parse(readFileSync(join(schemaDir, name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.match(schema.$id, /^urn:olli:schema:/);
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0);
  }

  const commandSchema = JSON.parse(readFileSync(join(schemaDir, 'command-envelope.schema.json'), 'utf8'));
  assert.equal(commandSchema.allOf.length, 4);
  assert.equal(commandSchema['x-olli-validation-policy'], 'urn:olli:validation-policy:increment-a-command:v1');
  assert.equal(Object.hasOwn(commandSchema.properties, 'actor_user_id'), false);
  assert.equal(Object.hasOwn(commandSchema.properties, 'role'), false);
  assert.equal(Object.hasOwn(commandSchema.properties, 'capabilities'), false);
});

test('datas exigem RFC 3339 UTC real, sem overflow ou timezone ausente', () => {
  for (const created_at_local of [
    '2026-02-30T00:00:00.000Z',
    '2026-13-01T00:00:00.000Z',
    '2026-08-28T21:30:00',
    '2026-08-28',
    '2026-08-28T24:00:00.000Z',
  ]) {
    expectCode(() => validateCommand({ ...FIXTURE_CREATE_CLIENT_COMMAND, created_at_local }), 'validation_failed');
  }
  assert.equal(validateCommand(FIXTURE_CREATE_CLIENT_COMMAND).command.created_at_local, '2026-08-28T21:30:00.000Z');
});

test('organização, membership, cliente e local sintéticos satisfazem contratos e ficam imutáveis', () => {
  assert.equal(validateOrganization(FIXTURE_ORGANIZATION_A).organization_id, FIXTURE_ORG_A);
  assert.equal(validateOrganization(FIXTURE_ORGANIZATION_B).organization_id, FIXTURE_ORG_B);
  assert.equal(validateMembership(FIXTURE_MEMBERSHIP_OWNER_A).role, 'owner');
  assert.equal(validateClient(FIXTURE_CLIENT_A).version, 1);
  const location = validateLocation(FIXTURE_LOCATION_A, FIXTURE_CLIENT_A);
  assert.equal(location.client_id, FIXTURE_CLIENT_A.client_id);
  assert.equal(Object.isFrozen(location), true);
});

test('local não pode referenciar cliente de outra organização ou outro ID', () => {
  expectCode(() => validateLocation(FIXTURE_LOCATION_A, FIXTURE_CLIENT_B), 'co_tenancy_violation');
  expectCode(() => validateLocation({ ...FIXTURE_LOCATION_A, client_id: 'client-fixture-a-other' }, FIXTURE_CLIENT_A), 'co_tenancy_violation');
});

test('quatro comandos mínimos válidos respeitam aggregate_type e expected_version', () => {
  const cases = [
    [FIXTURE_CREATE_CLIENT_COMMAND, 'client', 0],
    [FIXTURE_UPDATE_CLIENT_COMMAND, 'client', 1],
    [FIXTURE_CREATE_LOCATION_COMMAND, 'location', 0],
    [FIXTURE_UPDATE_LOCATION_COMMAND, 'location', 1],
  ];
  for (const [input, aggregateType, expectedVersion] of cases) {
    const validated = validateCommand(input);
    assert.equal(validated.command.aggregate_type, aggregateType);
    assert.equal(validated.command.expected_version, expectedVersion);
    assert.match(validated.command_hash, /^[a-f0-9]{64}$/);
  }
});

test('envelope/payload falham fechado para autoridade, campo desconhecido e operação divergente', () => {
  expectCode(() => validateCommand({ ...FIXTURE_CREATE_CLIENT_COMMAND, actor_user_id: 'attacker' }), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { ...FIXTURE_CREATE_CLIENT_COMMAND.payload, organization_id: FIXTURE_ORG_B } })), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { ...FIXTURE_CREATE_CLIENT_COMMAND.payload, role: 'owner' } })), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ aggregate_type: 'location' })), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ operation: 'delete_client' })), 'validation_failed');
});

test('create exige versão zero e update exige versão positiva/recurso canônico', () => {
  expectCode(() => validateCommand(makeFixtureCommand({ expected_version: 1 })), 'validation_failed');
  expectCode(() => validateCommand({ ...FIXTURE_UPDATE_CLIENT_COMMAND, expected_version: 0 }), 'validation_failed');
  expectCode(() => authorizeCommand(FIXTURE_UPDATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
  }), 'expected_version_mismatch');
  expectCode(() => authorizeCommand(FIXTURE_UPDATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
    existing_aggregate: { ...FIXTURE_CLIENT_A, version: 2 },
  }), 'expected_version_mismatch');
  assert.equal(authorizeCommand(FIXTURE_UPDATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
    existing_aggregate: FIXTURE_CLIENT_A,
  }).command.aggregate_id, FIXTURE_CLIENT_A.client_id);
});

test('autorização deriva sessão/membership atual e cobre papéis, capability e revogação', () => {
  for (const membership of [FIXTURE_MEMBERSHIP_OWNER_A, FIXTURE_MEMBERSHIP_MANAGER_A, FIXTURE_MEMBERSHIP_TECH_A]) {
    assert.equal(authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
      session_user_id: membership.user_id,
      membership,
    }).membership.user_id, membership.user_id);
  }

  for (const membership of [FIXTURE_MEMBERSHIP_TECH_LIMITED_A, FIXTURE_MEMBERSHIP_VIEWER_A]) {
    expectCode(() => authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
      session_user_id: membership.user_id,
      membership,
    }), 'authorization_denied');
  }
  expectCode(() => authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_REVOKED_A.user_id,
    membership: FIXTURE_MEMBERSHIP_REVOKED_A,
  }), 'authorization_revoked');
  expectCode(() => authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OUTSIDER_B.user_id,
    membership: FIXTURE_MEMBERSHIP_OUTSIDER_B,
  }), 'authorization_denied');
  expectCode(() => authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: { ...FIXTURE_MEMBERSHIP_OWNER_A, user_id: 'user-other-fixture' },
  }), 'authorization_denied');
});

test('usuário multiempresa usa membership do tenant original sem ganhar permissão por troca de contexto', () => {
  assert.equal(authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_USER_MULTI,
    membership: FIXTURE_MEMBERSHIP_MULTI_A,
  }).membership.organization_id, FIXTURE_ORG_A);
  expectCode(() => authorizeCommand(FIXTURE_CREATE_CLIENT_COMMAND, {
    session_user_id: FIXTURE_USER_MULTI,
    membership: FIXTURE_MEMBERSHIP_MULTI_B,
  }), 'authorization_denied');
});

test('create_location exige cliente canônico do mesmo tenant e ID', () => {
  assert.equal(authorizeCommand(FIXTURE_CREATE_LOCATION_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
    parent_client: FIXTURE_CLIENT_A,
  }).command.payload.client_id, FIXTURE_CLIENT_A.client_id);
  expectCode(() => authorizeCommand(FIXTURE_CREATE_LOCATION_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
    parent_client: FIXTURE_CLIENT_B,
  }), 'co_tenancy_violation');
  expectCode(() => authorizeCommand(FIXTURE_CREATE_LOCATION_COMMAND, {
    session_user_id: FIXTURE_MEMBERSHIP_OWNER_A.user_id,
    membership: FIXTURE_MEMBERSHIP_OWNER_A,
  }), 'co_tenancy_violation');
});

test('hash canônico ignora ordem/chave de transporte e muda com tenant ou payload', () => {
  const first = FIXTURE_CREATE_LOCATION_COMMAND;
  const reorderedPayload = {
    status: first.payload.status,
    label: first.payload.label,
    client_id: first.payload.client_id,
  };
  const retry = {
    ...first,
    command_id: 'command-fixture-retry-location-a',
    device_id: 'device-fixture-a-2',
    created_at_local: '2026-08-28T21:31:00.000Z',
    payload: reorderedPayload,
  };
  assert.equal(commandHash(first), commandHash(retry));
  assert.notEqual(commandHash(first), commandHash({ ...retry, organization_id: FIXTURE_ORG_B }));
  assert.notEqual(commandHash(first), commandHash({ ...retry, payload: { ...reorderedPayload, label: 'Outro Local Sintético' } }));
});

test('ledger idempotente reexecuta mesmo hash e rejeita reutilização divergente por tenant', () => {
  const ledger = new FixtureIdempotencyLedger();
  const first = ledger.observe(FIXTURE_CREATE_CLIENT_COMMAND);
  assert.equal(first.code, 'applied');
  assert.equal(ledger.size, 1);

  const replay = ledger.observe({
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: 'command-fixture-create-client-a-retry',
    device_id: 'device-fixture-a-2',
    created_at_local: '2026-08-28T21:31:00.000Z',
  });
  assert.equal(replay.code, 'idempotent_replay');
  assert.equal(replay.replayed, true);
  assert.equal(ledger.size, 1);

  const conflict = ledger.observe({
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: 'command-fixture-create-client-a-conflict',
    payload: { ...FIXTURE_CREATE_CLIENT_COMMAND.payload, display_name: 'Payload Sintético Divergente' },
  });
  assert.equal(conflict.code, 'idempotency_key_reused');
  assert.equal(conflict.state, 'rejected');
  assert.equal(ledger.size, 1);

  const otherTenant = ledger.observe({
    ...FIXTURE_CREATE_CLIENT_COMMAND,
    command_id: 'command-fixture-create-client-b',
    organization_id: FIXTURE_ORG_B,
    aggregate_id: 'client-fixture-b-new',
  });
  assert.equal(otherTenant.code, 'applied');
  assert.equal(ledger.size, 2);
});

test('resultado de comando rejeita combinações contraditórias de estado, código, versão e replay', () => {
  const base = {
    command_id: FIXTURE_CREATE_CLIENT_COMMAND.command_id,
    idempotency_key: FIXTURE_CREATE_CLIENT_COMMAND.idempotency_key,
    organization_id: FIXTURE_ORG_A,
    aggregate_type: 'client',
    aggregate_id: FIXTURE_CREATE_CLIENT_COMMAND.aggregate_id,
    state: 'acked',
    code: 'applied',
    canonical_version: 1,
    replayed: false,
  };
  assert.equal(validateCommandResult(base).state, 'acked');
  assert.equal(validateCommandResult({ ...base, code: 'idempotent_replay', replayed: true }).replayed, true);
  assert.equal(validateCommandResult({ ...base, state: 'conflict', code: 'expected_version_mismatch', canonical_version: 2 }).state, 'conflict');
  assert.equal(validateCommandResult({ ...base, state: 'rejected', code: 'authorization_denied', canonical_version: null }).state, 'rejected');

  expectCode(() => validateCommandResult({ ...base, state: 'acked', code: 'authorization_denied' }), 'validation_failed');
  expectCode(() => validateCommandResult({ ...base, code: 'idempotent_replay', replayed: false }), 'validation_failed');
  expectCode(() => validateCommandResult({ ...base, state: 'conflict', code: 'expected_version_mismatch', canonical_version: null }), 'validation_failed');
  expectCode(() => validateCommandResult({ ...base, state: 'rejected', code: 'validation_failed', canonical_version: 1 }), 'validation_failed');
});

test('segredo, data URI, URL pública, base64 longo e payload vazio são rejeitados', () => {
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { display_name: 'data:text/plain,fixture', status: 'active' } })), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { display_name: 'https://example.invalid/fixture', status: 'active' } })), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { display_name: 'A'.repeat(300), status: 'active' } })), 'validation_failed');
  expectCode(() => validateCommand({ ...FIXTURE_UPDATE_CLIENT_COMMAND, payload: {} }), 'validation_failed');
  expectCode(() => validateCommand(makeFixtureCommand({ payload: { display_name: 'Cliente Sintético', status: 'active', api_token: 'fixture' } })), 'validation_failed');
});
