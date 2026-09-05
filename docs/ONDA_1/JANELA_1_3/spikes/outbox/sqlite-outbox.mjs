import { DatabaseSync } from 'node:sqlite';

import {
  assertIdentifier,
  assertIsoDate,
  canonicalJson,
  immutableJson,
  invariant,
  isPlainObject,
  jsonByteLength,
  sha256Hex,
} from '../shared/canonical.mjs';

const PROTOCOL_VERSION = 1;
const SCHEMA_VERSION = 1;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const AGGREGATE_TYPES = new Set(['client', 'site', 'document']);
const OPERATIONS = new Set(['create', 'update', 'register_document']);
const MEMBERSHIP_ROLES = new Set(['owner', 'admin', 'technician', 'viewer']);
const ALLOWED_COMMAND_PAIRS = new Set([
  'client:create', 'client:update',
  'site:create', 'site:update',
  'document:register_document',
]);
const STATES = new Set(['pending', 'sending', 'acked', 'conflict', 'rejected']);
const TERMINAL_STATES = new Set(['acked', 'conflict', 'rejected']);

function normalizeKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validatePayloadTree(value, path = '$', parentKey = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validatePayloadTree(item, `${path}[${index}]`, parentKey));
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === 'string') {
      invariant(!value.startsWith('data:'), `${path} contém blob embutido`);
      if (/(uri|attachmentref|anexoref)$/.test(normalizeKey(parentKey))) {
        invariant(/^(private|fixture|external):\/\//.test(value), `${path} deve ser referência privada, fixture ou externa`);
      }
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    invariant(!/(token|secret|password|authorization|cookie|apikey|credential|session)/.test(normalized), `${path}.${key} é campo sensível proibido`);
    validatePayloadTree(child, `${path}.${key}`, key);
  }
}

function validatePayload(payload) {
  invariant(isPlainObject(payload), 'command.payload deve ser objeto JSON');
  validatePayloadTree(payload);
  invariant(jsonByteLength(payload) <= MAX_PAYLOAD_BYTES, `command.payload excede ${MAX_PAYLOAD_BYTES} bytes`);
  return immutableJson(payload);
}

function assertExactKeys(value, allowed, path) {
  invariant(isPlainObject(value), `${path} deve ser objeto`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) invariant(allowedSet.has(key), `${path}.${key} não pertence ao schema de transporte`);
}

function rejectPrivateDocumentFields(value, path = 'document.payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectPrivateDocumentFields(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    invariant(!/(cost|margin|markup|profit|internal(source|policy)|organizationid|tenantid)/.test(normalized), `${path}.${key} é campo privado proibido no documento público`);
    rejectPrivateDocumentFields(child, `${path}.${key}`);
  }
}

function validatePublicDocumentPayload(payload) {
  assertExactKeys(payload, [
    'documentId', 'documentHash', 'schemaId', 'schemaVersion', 'title',
    'payload', 'evidence', 'signatures', 'trust',
  ], 'document');
  assertIdentifier(payload.documentId, 'document.documentId');
  invariant(typeof payload.documentHash === 'string' && /^[a-f0-9]{64}$/.test(payload.documentHash), 'document.documentHash inválido');
  assertIdentifier(payload.schemaId, 'document.schemaId');
  invariant(Number.isInteger(payload.schemaVersion) && payload.schemaVersion > 0, 'document.schemaVersion inválida');
  invariant(typeof payload.title === 'string' && payload.title.trim().length > 0, 'document.title obrigatório');
  invariant(isPlainObject(payload.payload), 'document.payload inválido');
  rejectPrivateDocumentFields(payload.payload);

  invariant(Array.isArray(payload.evidence), 'document.evidence inválido');
  for (const [index, item] of payload.evidence.entries()) {
    assertExactKeys(item, ['capturedAt', 'id', 'kind', 'sha256', 'sourceLabel'], `document.evidence[${index}]`);
    assertIdentifier(item.id, `document.evidence[${index}].id`);
    invariant(typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256), `document.evidence[${index}].sha256 inválido`);
    assertIsoDate(item.capturedAt, `document.evidence[${index}].capturedAt`);
  }

  invariant(Array.isArray(payload.signatures), 'document.signatures inválido');
  for (const [index, item] of payload.signatures.entries()) {
    assertExactKeys(item, ['action', 'at', 'documentHash', 'id', 'level', 'role'], `document.signatures[${index}]`);
    assertIdentifier(item.id, `document.signatures[${index}].id`);
    invariant(item.documentHash === payload.documentHash, `document.signatures[${index}] referencia outro hash`);
    assertIsoDate(item.at, `document.signatures[${index}].at`);
  }

  assertExactKeys(payload.trust, [
    'artEmittedByOlli', 'automatedConformity', 'drawnMarkIsQualifiedSignature',
    'replacesResponsibleProfessional',
  ], 'document.trust');
  for (const value of Object.values(payload.trust)) invariant(value === false, 'document.trust não pode declarar garantia automática');
}

function validateAggregatePayload(aggregateType, operation, payload) {
  invariant(ALLOWED_COMMAND_PAIRS.has(`${aggregateType}:${operation}`), 'par aggregateType/operation não permitido');
  if (aggregateType === 'client' || aggregateType === 'site') {
    assertExactKeys(payload, ['label', 'status'], aggregateType);
    invariant(typeof payload.label === 'string' && payload.label.trim().length > 0, `${aggregateType}.label obrigatório`);
    if (Object.hasOwn(payload, 'status')) invariant(payload.status === 'active' || payload.status === 'inactive', `${aggregateType}.status inválido`);
  } else {
    validatePublicDocumentPayload(payload);
  }
  return payload;
}

function validateCommand(input) {
  invariant(isPlainObject(input), 'comando inválido');
  assertIdentifier(input.commandId, 'command.commandId');
  assertIdentifier(input.idempotencyKey, 'command.idempotencyKey');
  invariant(input.protocolVersion === PROTOCOL_VERSION, `protocolVersion deve ser ${PROTOCOL_VERSION}`);
  invariant(input.schemaVersion === SCHEMA_VERSION, `schemaVersion deve ser ${SCHEMA_VERSION}`);
  assertIdentifier(input.organizationId, 'command.organizationId');
  assertIdentifier(input.actorUserId, 'command.actorUserId');
  assertIdentifier(input.deviceId, 'command.deviceId');
  invariant(AGGREGATE_TYPES.has(input.aggregateType), 'command.aggregateType não suportado');
  assertIdentifier(input.aggregateId, 'command.aggregateId');
  invariant(OPERATIONS.has(input.operation), 'command.operation não suportada');
  invariant(ALLOWED_COMMAND_PAIRS.has(`${input.aggregateType}:${input.operation}`), 'par aggregateType/operation não permitido');
  invariant(Number.isInteger(input.expectedVersion) && input.expectedVersion >= 0, 'command.expectedVersion inválida');
  assertIsoDate(input.createdAtLocal, 'command.createdAtLocal');
  const payload = validatePayload(input.payload);
  validateAggregatePayload(input.aggregateType, input.operation, payload);

  if (input.operation === 'create' || input.operation === 'register_document') {
    invariant(input.expectedVersion === 0, `${input.operation} exige expectedVersion 0`);
  }

  const commandHash = sha256Hex({
    protocolVersion: input.protocolVersion,
    schemaVersion: input.schemaVersion,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    operation: input.operation,
    expectedVersion: input.expectedVersion,
    payload,
  });

  return immutableJson({ ...input, payload, commandHash });
}

function runTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // A falha original é mais útil; rollback aqui é somente melhor esforço.
    }
    throw error;
  }
}

function parseJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

function commandFromRow(row) {
  if (!row) return null;
  invariant(STATES.has(row.state), `estado persistido inválido: ${row.state}`);
  return immutableJson({
    commandId: row.command_id,
    idempotencyKey: row.idempotency_key,
    protocolVersion: row.protocol_version,
    schemaVersion: row.schema_version,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    deviceId: row.device_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    operation: row.operation,
    expectedVersion: row.expected_version,
    payload: parseJson(row.payload_json),
    commandHash: row.command_hash,
    createdAtLocal: row.created_at_local,
    state: row.state,
    attempts: row.attempts,
    lastErrorCode: row.last_error_code,
    canonicalVersion: row.canonical_version,
    result: parseJson(row.result_json),
    updatedAt: row.updated_at,
  });
}

function aggregateFromRow(row) {
  if (!row) return null;
  return immutableJson({
    organizationId: row.organization_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    version: row.version ?? row.canonical_version,
    payload: parseJson(row.payload_json),
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at,
    sourceCommandId: row.source_command_id ?? null,
  });
}

function membershipByIdentity(db, organizationId, userId) {
  return db.prepare(`
    SELECT * FROM server_memberships WHERE organization_id = ? AND user_id = ?
  `).get(organizationId, userId);
}

function requireActiveMembership(db, organizationId, userId, message = 'read_not_authorized') {
  const membership = membershipByIdentity(db, organizationId, userId);
  invariant(membership && membership.status === 'active', message);
  invariant(MEMBERSHIP_ROLES.has(membership.role), 'membership_role_unknown');
  return membership;
}

function canApplyCommand(role, command) {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'technician') {
    return new Set([
      'client:create', 'client:update',
      'site:create', 'site:update',
      'document:register_document',
    ]).has(`${command.aggregateType}:${command.operation}`);
  }
  return false;
}

function rawServerAggregate(db, { organizationId, aggregateType, aggregateId }) {
  return aggregateFromRow(db.prepare(`
    SELECT * FROM server_aggregates
     WHERE organization_id = ? AND aggregate_type = ? AND aggregate_id = ?
  `).get(organizationId, aggregateType, aggregateId));
}

function rawCommandById(db, commandId) {
  return db.prepare('SELECT * FROM outbox_commands WHERE command_id = ?').get(commandId);
}

function updateLocalResult(db, commandId, result, at) {
  db.prepare(`
    UPDATE outbox_commands
       SET state = ?, last_error_code = ?, canonical_version = ?, result_json = ?, updated_at = ?
     WHERE command_id = ?
  `).run(
    result.state,
    result.state === 'acked' ? null : result.code,
    result.canonicalVersion ?? null,
    canonicalJson(result),
    at,
    commandId,
  );
}

function resultFor(command, state, code, extra = {}) {
  return immutableJson({
    state,
    code,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    organizationId: command.organizationId,
    aggregateType: command.aggregateType,
    aggregateId: command.aggregateId,
    ...extra,
  });
}

function applyProjectionV1(db, event) {
  db.prepare(`
    INSERT INTO server_projection_v1 (
      organization_id, aggregate_type, aggregate_id, canonical_version,
      payload_json, source_command_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, aggregate_type, aggregate_id) DO UPDATE SET
      canonical_version = excluded.canonical_version,
      payload_json = excluded.payload_json,
      source_command_id = excluded.source_command_id,
      updated_at = excluded.updated_at
    WHERE excluded.canonical_version > server_projection_v1.canonical_version
  `).run(
    event.organizationId,
    event.aggregateType,
    event.aggregateId,
    event.canonicalVersion,
    canonicalJson(event.payload),
    event.sourceCommandId,
    event.at,
  );
}

export function openSpikeDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS local_aggregates (
      organization_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, aggregate_type, aggregate_id)
    );

    CREATE TABLE IF NOT EXISTS outbox_commands (
      command_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      protocol_version INTEGER NOT NULL,
      schema_version INTEGER NOT NULL,
      organization_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      expected_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      command_hash TEXT NOT NULL,
      created_at_local TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'sending', 'acked', 'conflict', 'rejected')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      canonical_version INTEGER,
      result_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS outbox_commands_drain_idx
      ON outbox_commands (organization_id, state, created_at_local, command_id);

    CREATE TABLE IF NOT EXISTS server_memberships (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      membership_version INTEGER NOT NULL CHECK (membership_version > 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS server_aggregates (
      organization_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      payload_json TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, aggregate_type, aggregate_id)
    );

    CREATE TABLE IF NOT EXISTS server_idempotency (
      organization_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      command_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS server_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      canonical_version INTEGER NOT NULL CHECK (canonical_version > 0),
      payload_json TEXT NOT NULL,
      source_command_id TEXT NOT NULL UNIQUE,
      event_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (organization_id, aggregate_type, aggregate_id, canonical_version)
    );

    CREATE TABLE IF NOT EXISTS server_projection_v1 (
      organization_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      canonical_version INTEGER NOT NULL CHECK (canonical_version > 0),
      payload_json TEXT NOT NULL,
      source_command_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, aggregate_type, aggregate_id)
    );
  `);
  return db;
}

export function seedMembership(db, { organizationId, userId, role = 'technician', status = 'active', membershipVersion = 1, updatedAt }) {
  assertIdentifier(organizationId, 'membership.organizationId');
  assertIdentifier(userId, 'membership.userId');
  invariant(MEMBERSHIP_ROLES.has(role), 'membership.role desconhecido');
  invariant(status === 'active' || status === 'revoked', 'membership.status inválido');
  invariant(Number.isInteger(membershipVersion) && membershipVersion > 0, 'membership.version inválida');
  assertIsoDate(updatedAt, 'membership.updatedAt');
  runTransaction(db, () => {
    const current = membershipByIdentity(db, organizationId, userId);
    if (current) {
      invariant(membershipVersion >= current.membership_version, 'membership.version não pode regredir');
      if (membershipVersion === current.membership_version) {
        invariant(current.role === role && current.status === status, 'mesma membership.version não pode alterar autorização');
        return;
      }
    }
    db.prepare(`
      INSERT INTO server_memberships (organization_id, user_id, role, status, membership_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        role = excluded.role,
        status = excluded.status,
        membership_version = excluded.membership_version,
        updated_at = excluded.updated_at
    `).run(organizationId, userId, role, status, membershipVersion, updatedAt);
  });
}

export const setMembership = seedMembership;

export function seedServerAggregate(db, { organizationId, aggregateType, aggregateId, version, payload, updatedBy, updatedAt }) {
  assertIdentifier(organizationId, 'aggregate.organizationId');
  invariant(AGGREGATE_TYPES.has(aggregateType), 'aggregate.aggregateType inválido');
  assertIdentifier(aggregateId, 'aggregate.aggregateId');
  invariant(Number.isInteger(version) && version > 0, 'aggregate.version inválida');
  assertIdentifier(updatedBy, 'aggregate.updatedBy');
  assertIsoDate(updatedAt, 'aggregate.updatedAt');
  const validPayload = validatePayload(payload);
  validateAggregatePayload(
    aggregateType,
    aggregateType === 'document' ? 'register_document' : version === 1 ? 'create' : 'update',
    validPayload,
  );
  db.prepare(`
    INSERT INTO server_aggregates (
      organization_id, aggregate_type, aggregate_id, version, payload_json, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, aggregate_type, aggregate_id) DO UPDATE SET
      version = excluded.version,
      payload_json = excluded.payload_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(organizationId, aggregateType, aggregateId, version, canonicalJson(validPayload), updatedBy, updatedAt);
}

function insertPendingCommand(db, command) {
  db.prepare(`
    INSERT INTO outbox_commands (
      command_id, idempotency_key, protocol_version, schema_version,
      organization_id, actor_user_id, device_id, aggregate_type, aggregate_id,
      operation, expected_version, payload_json, command_hash, created_at_local,
      state, attempts, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
  `).run(
    command.commandId,
    command.idempotencyKey,
    command.protocolVersion,
    command.schemaVersion,
    command.organizationId,
    command.actorUserId,
    command.deviceId,
    command.aggregateType,
    command.aggregateId,
    command.operation,
    command.expectedVersion,
    canonicalJson(command.payload),
    command.commandHash,
    command.createdAtLocal,
    command.createdAtLocal,
  );
}

export function enqueueCommand(db, input) {
  const command = validateCommand(input);
  insertPendingCommand(db, command);
  return getCommand(db, { organizationId: command.organizationId, commandId: command.commandId });
}

export function transactLocalMutationAndEnqueue(db, { localAggregate, command: commandInput }) {
  invariant(isPlainObject(localAggregate), 'localAggregate inválido');
  const command = validateCommand(commandInput);
  invariant(localAggregate.organizationId === command.organizationId, 'mutação local cruza tenant do comando');
  invariant(localAggregate.aggregateType === command.aggregateType, 'aggregateType local diverge do comando');
  invariant(localAggregate.aggregateId === command.aggregateId, 'aggregateId local diverge do comando');
  invariant(localAggregate.version === command.expectedVersion + 1, 'versão local deve avançar exatamente expectedVersion + 1');
  assertIsoDate(localAggregate.updatedAt, 'localAggregate.updatedAt');
  const payload = validatePayload(localAggregate.payload);
  validateAggregatePayload(command.aggregateType, command.operation, payload);
  invariant(canonicalJson(payload) === canonicalJson(command.payload), 'payload local deve ser idêntico ao payload enfileirado');

  runTransaction(db, () => {
    const current = db.prepare(`
      SELECT version FROM local_aggregates
       WHERE organization_id = ? AND aggregate_type = ? AND aggregate_id = ?
    `).get(command.organizationId, command.aggregateType, command.aggregateId);
    if (command.expectedVersion === 0) invariant(!current, 'aggregate local já existe para criação');
    else invariant(current?.version === command.expectedVersion, 'versão local divergiu antes da transação');

    db.prepare(`
      INSERT INTO local_aggregates (
        organization_id, aggregate_type, aggregate_id, version, payload_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (organization_id, aggregate_type, aggregate_id) DO UPDATE SET
        version = excluded.version,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run(
      command.organizationId,
      command.aggregateType,
      command.aggregateId,
      localAggregate.version,
      canonicalJson(payload),
      localAggregate.updatedAt,
    );
    insertPendingCommand(db, command);
  });

  return immutableJson({
    localAggregate: getLocalAggregate(db, {
      organizationId: command.organizationId,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
    }),
    command: getCommand(db, { organizationId: command.organizationId, commandId: command.commandId }),
  });
}

export function getLocalAggregate(db, { organizationId, aggregateType, aggregateId }) {
  assertIdentifier(organizationId, 'query.organizationId');
  invariant(AGGREGATE_TYPES.has(aggregateType), 'query.aggregateType inválido');
  assertIdentifier(aggregateId, 'query.aggregateId');
  return aggregateFromRow(db.prepare(`
    SELECT * FROM local_aggregates
     WHERE organization_id = ? AND aggregate_type = ? AND aggregate_id = ?
  `).get(organizationId, aggregateType, aggregateId));
}

export function getCommand(db, { organizationId, commandId }) {
  assertIdentifier(organizationId, 'query.organizationId');
  assertIdentifier(commandId, 'query.commandId');
  return commandFromRow(db.prepare(`
    SELECT * FROM outbox_commands WHERE organization_id = ? AND command_id = ?
  `).get(organizationId, commandId));
}

export function listCommands(db, { organizationId, state = null }) {
  assertIdentifier(organizationId, 'query.organizationId');
  if (state !== null) invariant(STATES.has(state), 'query.state inválido');
  const rows = state === null
    ? db.prepare(`
        SELECT * FROM outbox_commands
         WHERE organization_id = ? ORDER BY created_at_local, command_id
      `).all(organizationId)
    : db.prepare(`
        SELECT * FROM outbox_commands
         WHERE organization_id = ? AND state = ? ORDER BY created_at_local, command_id
      `).all(organizationId, state);
  return immutableJson(rows.map(commandFromRow));
}

export function getServerAggregate(db, { sessionUserId, organizationId, aggregateType, aggregateId }) {
  assertIdentifier(sessionUserId, 'query.sessionUserId');
  assertIdentifier(organizationId, 'query.organizationId');
  invariant(AGGREGATE_TYPES.has(aggregateType), 'query.aggregateType inválido');
  assertIdentifier(aggregateId, 'query.aggregateId');
  requireActiveMembership(db, organizationId, sessionUserId);
  return rawServerAggregate(db, { organizationId, aggregateType, aggregateId });
}

export function getProjectionV1(db, { sessionUserId, organizationId, aggregateType, aggregateId }) {
  assertIdentifier(sessionUserId, 'query.sessionUserId');
  assertIdentifier(organizationId, 'query.organizationId');
  invariant(AGGREGATE_TYPES.has(aggregateType), 'query.aggregateType inválido');
  assertIdentifier(aggregateId, 'query.aggregateId');
  requireActiveMembership(db, organizationId, sessionUserId);
  return aggregateFromRow(db.prepare(`
    SELECT * FROM server_projection_v1
     WHERE organization_id = ? AND aggregate_type = ? AND aggregate_id = ?
  `).get(organizationId, aggregateType, aggregateId));
}

export function countServerEvents(db, { sessionUserId, organizationId, aggregateType, aggregateId }) {
  assertIdentifier(sessionUserId, 'query.sessionUserId');
  assertIdentifier(organizationId, 'query.organizationId');
  invariant(AGGREGATE_TYPES.has(aggregateType), 'query.aggregateType inválido');
  assertIdentifier(aggregateId, 'query.aggregateId');
  requireActiveMembership(db, organizationId, sessionUserId);
  return db.prepare(`
    SELECT COUNT(*) AS total FROM server_events
     WHERE organization_id = ? AND aggregate_type = ? AND aggregate_id = ?
  `).get(organizationId, aggregateType, aggregateId).total;
}

export function recoverInterruptedCommands(db, { organizationId, recoveredAt }) {
  assertIdentifier(organizationId, 'recover.organizationId');
  assertIsoDate(recoveredAt, 'recover.recoveredAt');
  const result = db.prepare(`
    UPDATE outbox_commands
       SET state = 'pending', last_error_code = 'interrupted_before_local_ack', updated_at = ?
     WHERE organization_id = ? AND state = 'sending'
  `).run(recoveredAt, organizationId);
  return Number(result.changes);
}

export function rebuildProjectionV1(db, { sessionUserId, organizationId }) {
  assertIdentifier(sessionUserId, 'projection.sessionUserId');
  assertIdentifier(organizationId, 'projection.organizationId');
  return runTransaction(db, () => {
    const membership = requireActiveMembership(db, organizationId, sessionUserId, 'projection_not_authorized');
    invariant(membership.role === 'owner' || membership.role === 'admin', 'projection_not_authorized');
    db.prepare('DELETE FROM server_projection_v1 WHERE organization_id = ?').run(organizationId);
    const events = db.prepare(`
      SELECT * FROM server_events
       WHERE organization_id = ? ORDER BY sequence ASC
    `).all(organizationId);
    for (const row of events) {
      applyProjectionV1(db, {
        organizationId: row.organization_id,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        canonicalVersion: row.canonical_version,
        payload: parseJson(row.payload_json),
        sourceCommandId: row.source_command_id,
        at: row.created_at,
      });
    }
    return events.length;
  });
}

export function drainCommand(db, commandId, { sessionUserId, processedAt, simulateCrashAfterServerCommit = false }) {
  assertIdentifier(commandId, 'drain.commandId');
  assertIdentifier(sessionUserId, 'drain.sessionUserId');
  assertIsoDate(processedAt, 'drain.processedAt');
  const initialRow = rawCommandById(db, commandId);
  invariant(initialRow, 'comando não encontrado');
  const initial = commandFromRow(initialRow);
  if (TERMINAL_STATES.has(initial.state)) return initial.result;
  invariant(initial.state === 'pending', 'comando sending precisa ser recuperado antes de repetir');

  const claim = db.prepare(`
    UPDATE outbox_commands
       SET state = 'sending', attempts = attempts + 1, last_error_code = NULL, updated_at = ?
     WHERE command_id = ? AND state = 'pending'
  `).run(processedAt, commandId);
  invariant(Number(claim.changes) === 1, 'comando já foi reivindicado por outro consumer');

  const command = commandFromRow(rawCommandById(db, commandId));
  if (command.actorUserId !== sessionUserId) {
    const rejected = resultFor(command, 'rejected', 'session_actor_mismatch');
    updateLocalResult(db, commandId, rejected, processedAt);
    return rejected;
  }

  const serverOutcome = runTransaction(db, () => {
    const membership = membershipByIdentity(db, command.organizationId, sessionUserId);
    if (!membership || membership.status !== 'active') {
      return resultFor(command, 'rejected', 'authorization_revoked');
    }
    if (!MEMBERSHIP_ROLES.has(membership.role) || !canApplyCommand(membership.role, command)) {
      return resultFor(command, 'rejected', 'role_not_authorized');
    }

    const prior = db.prepare(`
      SELECT * FROM server_idempotency WHERE organization_id = ? AND idempotency_key = ?
    `).get(command.organizationId, command.idempotencyKey);
    if (prior) {
      if (prior.command_hash !== command.commandHash) {
        return resultFor(command, 'rejected', 'idempotency_key_reused');
      }
      const stored = parseJson(prior.result_json);
      if (stored.state !== 'acked') {
        return resultFor(command, stored.state, stored.code, {
          expectedVersion: stored.expectedVersion ?? command.expectedVersion,
          canonicalVersion: stored.canonicalVersion ?? null,
          canonicalAggregate: stored.canonicalAggregate ?? null,
          replayed: true,
        });
      }
      return resultFor(command, 'acked', 'idempotent_replay', {
        canonicalVersion: stored.canonicalVersion,
        aggregate: stored.aggregate,
        replayed: true,
      });
    }

    const current = rawServerAggregate(db, {
      organizationId: command.organizationId,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
    });
    const creation = command.operation === 'create' || command.operation === 'register_document';
    const versionMatches = creation
      ? current === null && command.expectedVersion === 0
      : current !== null && current.version === command.expectedVersion;
    if (!versionMatches) {
      const conflict = resultFor(command, 'conflict', 'expected_version_mismatch', {
        expectedVersion: command.expectedVersion,
        canonicalVersion: current?.version ?? null,
        canonicalAggregate: current?.payload ?? null,
      });
      db.prepare(`
        INSERT INTO server_idempotency (
          organization_id, idempotency_key, command_hash, result_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(command.organizationId, command.idempotencyKey, command.commandHash, canonicalJson(conflict), processedAt);
      return conflict;
    }

    const canonicalVersion = command.expectedVersion + 1;
    const applied = resultFor(command, 'acked', 'applied', {
      canonicalVersion,
      aggregate: command.payload,
      replayed: false,
    });

    db.prepare(`
      INSERT INTO server_aggregates (
        organization_id, aggregate_type, aggregate_id, version, payload_json, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (organization_id, aggregate_type, aggregate_id) DO UPDATE SET
        version = excluded.version,
        payload_json = excluded.payload_json,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).run(
      command.organizationId,
      command.aggregateType,
      command.aggregateId,
      canonicalVersion,
      canonicalJson(command.payload),
      sessionUserId,
      processedAt,
    );

    db.prepare(`
      INSERT INTO server_events (
        organization_id, aggregate_type, aggregate_id, canonical_version,
        payload_json, source_command_id, event_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      command.organizationId,
      command.aggregateType,
      command.aggregateId,
      canonicalVersion,
      canonicalJson(command.payload),
      command.commandId,
      sha256Hex({
        organizationId: command.organizationId,
        aggregateType: command.aggregateType,
        aggregateId: command.aggregateId,
        canonicalVersion,
        payload: command.payload,
        sourceCommandId: command.commandId,
      }),
      processedAt,
    );

    db.prepare(`
      INSERT INTO server_idempotency (
        organization_id, idempotency_key, command_hash, result_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(command.organizationId, command.idempotencyKey, command.commandHash, canonicalJson(applied), processedAt);

    applyProjectionV1(db, {
      organizationId: command.organizationId,
      aggregateType: command.aggregateType,
      aggregateId: command.aggregateId,
      canonicalVersion,
      payload: command.payload,
      sourceCommandId: command.commandId,
      at: processedAt,
    });
    return applied;
  });

  if (simulateCrashAfterServerCommit && serverOutcome.code === 'applied') {
    throw new Error('SIMULATED_CRASH_AFTER_SERVER_COMMIT');
  }

  updateLocalResult(db, commandId, serverOutcome, processedAt);
  return serverOutcome;
}

export const OUTBOX_SPIKE_LIMITS = immutableJson({
  protocolVersion: PROTOCOL_VERSION,
  schemaVersion: SCHEMA_VERSION,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  membershipRoles: [...MEMBERSHIP_ROLES],
  allowedCommandPairs: [...ALLOWED_COMMAND_PAIRS],
});
