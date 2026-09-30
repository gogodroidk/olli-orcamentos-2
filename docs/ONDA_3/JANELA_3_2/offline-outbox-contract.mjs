import {
  validateCommand,
  validateCommandResult,
} from '../../ONDA_2/JANELA_2_1/contracts/tenancy-contract.mjs';
import { createHash } from 'node:crypto';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const RFC3339_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAP_KEY_SEPARATOR = '\u0000';
const INTERNAL_MAPS = new WeakMap();
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const TERMINAL_STATES = new Set([
  'acked',
  'conflict',
  'rejected',
  'reconcile_required',
  'dead_letter',
]);
const TRANSIENT_CODES = new Set([
  'transport_timeout',
  'transport_unavailable',
  'rate_limited',
]);
const AMBIGUOUS_AUTHORIZATION_CODES = new Set([
  'authorization_denied',
  'authorization_revoked',
]);

function scopedKey(organizationId, identifier) {
  return `${organizationId}${MAP_KEY_SEPARATOR}${identifier}`;
}

export const OUTBOX_STATES = Object.freeze([
  'pending',
  'claimed',
  'retry_wait',
  'acked',
  'conflict',
  'rejected',
  'reconcile_required',
  'dead_letter',
]);

export class OfflineOutboxError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OfflineOutboxError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new OfflineOutboxError(code, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) fail('validation_failed', `${label} deve ser objeto JSON simples.`);
}

function assertExactKeys(value, expected, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('validation_failed', `${label} possui campos fora do contrato.`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail('validation_failed', `${label} inválido.`);
  return value;
}

function assertIso(value, label) {
  if (typeof value !== 'string' || !RFC3339_UTC_MILLIS.test(value)) fail('validation_failed', `${label} inválido.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail('validation_failed', `${label} inválido.`);
  return value;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function cloneState(state) {
  assertPlainObject(state, 'estado');
  if (!isMapLike(state.items) || !isMapLike(state.commandIds) || !isMapLike(state.idempotencyKeys) || !isMapLike(state.tombstones)) {
    fail('validation_failed', 'estado não pertence ao contrato.');
  }
  const entriesForClone = (mapLike) => {
    if (mapLike instanceof ReadonlyMapView) {
      const rawMap = INTERNAL_MAPS.get(mapLike);
      if (!rawMap) fail('validation_failed', 'view de estado não pertence ao contrato.');
      return rawMap.entries();
    }
    return mapLike.entries();
  };
  const itemEntries = [...entriesForClone(state.items)];
  const commandEntries = [...entriesForClone(state.commandIds)];
  const idempotencyEntries = [...entriesForClone(state.idempotencyKeys)];
  const tombstoneEntries = [...entriesForClone(state.tombstones)];
  return {
    items: new Map(itemEntries.map(([key, value]) => [key, structuredClone(value)])),
    commandIds: new Map(commandEntries),
    idempotencyKeys: new Map(idempotencyEntries),
    tombstones: new Map(tombstoneEntries.map(([key, value]) => [key, structuredClone(value)])),
  };
}

class ReadonlyMapView {
  #map;
  #organizationId;
  #project;

  constructor(map, organizationId, project = (value) => value) {
    this.#map = new Map(map);
    this.#organizationId = organizationId;
    this.#project = project;
    INTERNAL_MAPS.set(this, this.#map);
    Object.freeze(this);
  }

  #visiblePrefix() { return `${this.#organizationId}${MAP_KEY_SEPARATOR}`; }
  #visibleEntries() {
    const prefix = this.#visiblePrefix();
    return [...this.#map.entries()].filter(([key]) => typeof key === 'string' && key.startsWith(prefix));
  }
  #lookupKey(key) {
    if (typeof key !== 'string') return undefined;
    const candidate = key.startsWith(this.#visiblePrefix()) ? key : scopedKey(this.#organizationId, key);
    return this.#map.has(candidate) && candidate.startsWith(this.#visiblePrefix()) ? candidate : undefined;
  }

  get size() { return this.#visibleEntries().length; }
  get(key) {
    const value = this.#map.get(this.#lookupKey(key));
    return value === undefined ? undefined : structuredClone(this.#project(value));
  }
  has(key) { return this.#lookupKey(key) !== undefined; }
  entries() {
    return this.#visibleEntries()
      .map(([key, value]) => [key, structuredClone(this.#project(value))])[Symbol.iterator]();
  }
  [Symbol.iterator]() { return this.entries(); }
}

function isMapLike(value) {
  return value instanceof Map || value instanceof ReadonlyMapView;
}

function immutable(value) {
  return freeze(structuredClone(value));
}

function assertTrustedIdentity(context) {
  const keys = ['session_user_id', 'organization_id', 'device_id', 'membership_status', 'can_write'];
  assertExactKeys(context, keys, 'contexto confiável');
  assertIdentifier(context.session_user_id, 'session_user_id');
  assertIdentifier(context.organization_id, 'organization_id');
  assertIdentifier(context.device_id, 'device_id');
  if (context.membership_status !== 'active') fail('authorization_revoked', 'membership não está ativa.');
  if (typeof context.can_write !== 'boolean') fail('validation_failed', 'can_write inválido.');
  return context;
}

function assertTrustedContext(context) {
  const trusted = assertTrustedIdentity(context);
  if (trusted.can_write !== true) fail('authorization_denied', 'contexto não possui capability de escrita.');
  return trusted;
}

function validateClock(clock) {
  assertExactKeys(clock, ['now', 'device_time', 'logical_time'], 'relógio');
  assertIso(clock.now, 'now');
  assertIso(clock.device_time, 'device_time');
  if (!Number.isSafeInteger(clock.logical_time) || clock.logical_time < 0) fail('validation_failed', 'logical_time inválido.');
  const nowMs = Date.parse(clock.now);
  const deviceMs = Date.parse(clock.device_time);
  if (Math.abs(deviceMs - nowMs) > MAX_CLOCK_SKEW_MS) fail('clock_skew', 'relógio do dispositivo excede o skew permitido.');
  return { nowMs, deviceMs };
}

function commandFor(input, context, nowMs) {
  const validated = validateCommand(input);
  if (validated.command.organization_id !== context.organization_id) fail('co_tenancy_violation', 'comando pertence a outro tenant.');
  if (validated.command.device_id !== context.device_id) fail('authorization_denied', 'device_id não pertence ao contexto confiável.');
  if (Date.parse(validated.command.created_at_local) > nowMs) fail('clock_skew', 'comando criado no futuro em relação ao relógio confiável.');
  // A identidade do envelope precisa distinguir command_id/idempotency_key;
  // o hash de domínio J2.1 cobre o payload, não a identidade de replay.
  const envelopeIdentity = JSON.stringify({
    command_hash: validated.command_hash,
    command_id: validated.command.command_id,
    idempotency_key: validated.command.idempotency_key,
  });
  const envelopeHash = createHash('sha256').update(envelopeIdentity, 'utf8').digest('hex');
  return { ...validated, command_hash: envelopeHash };
}

function safeItem(record) {
  return immutable({
    item_id: record.item_id,
    command_id: record.command.command_id,
    command_hash: record.command_hash,
    organization_id: record.command.organization_id,
    aggregate_type: record.command.aggregate_type,
    aggregate_id: record.command.aggregate_id,
    origin_device_id: record.origin_device_id,
    claimed_by_device_id: record.claimed_by_device_id,
    state: record.state,
    attempt_count: record.attempt_count,
    available_at: record.available_at,
    lease_id: record.lease_id,
    lease_expires_at: record.lease_expires_at,
    last_error_code: record.last_error_code,
    outcome_uncertain: record.outcome_uncertain,
    reconciliation_probe_used: record.reconciliation_probe_used,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

function safeTombstone(tombstone) {
  return immutable({
    tombstone_id: tombstone.tombstone_id,
    organization_id: tombstone.organization_id,
    aggregate_type: tombstone.aggregate_type,
    aggregate_id: tombstone.aggregate_id,
    deleted_at: tombstone.deleted_at,
  });
}

function leasedRecord(draft, itemId, leaseId, context, nowMs) {
  const record = draft.items.get(scopedKey(context.organization_id, itemId));
  if (
    !record
    || record.enqueued_by_user_id !== context.session_user_id
    || record.command.organization_id !== context.organization_id
    || record.claimed_by_device_id !== context.device_id
    || record.state !== 'claimed'
    || record.lease_id !== leaseId
    || Date.parse(record.lease_expires_at) <= nowMs
  ) {
    fail('lease_conflict', 'lease ausente, vencida ou divergente.');
  }
  assertMonotonicClock(record, nowMs, 'liquidação');
  return record;
}

function assertMonotonicClock(record, nowMs, operation) {
  const persistedAtMs = Math.max(Date.parse(record.created_at), Date.parse(record.updated_at));
  if (nowMs < persistedAtMs) fail('clock_skew', `relógio de ${operation} retrocedeu em relação ao estado persistido.`);
}

export function createState() {
  return { items: new Map(), commandIds: new Map(), idempotencyKeys: new Map(), tombstones: new Map() };
}

export function enqueue(state, input, context, clock) {
  const trusted = assertTrustedContext(context);
  assertExactKeys(input, ['command', 'item_id'], 'enqueue');
  const itemId = assertIdentifier(input.item_id, 'item_id');
  const { nowMs } = validateClock(clock);
  const { command, command_hash: commandHash } = commandFor(input.command, trusted, nowMs);
  const draft = cloneState(state);
  const itemKey = scopedKey(trusted.organization_id, itemId);
  const existing = draft.items.get(itemKey);
  if (existing) {
    if (existing.enqueued_by_user_id !== trusted.session_user_id || existing.command_hash !== commandHash) {
      fail('validation_failed', 'item_id já utilizado com envelope divergente.');
    }
    return { state: immutableState(draft, trusted.organization_id), result: immutable({ enqueue_status: 'duplicate', item: safeItem(existing) }) };
  }
  const commandKey = scopedKey(trusted.organization_id, command.command_id);
  const existingItemId = draft.commandIds.get(commandKey);
  if (existingItemId) {
    const existingByCommand = draft.items.get(scopedKey(trusted.organization_id, existingItemId));
    if (!existingByCommand || existingByCommand.enqueued_by_user_id !== trusted.session_user_id || existingByCommand.command_hash !== commandHash) {
      fail('validation_failed', 'command_id já utilizado com envelope divergente.');
    }
    return { state: immutableState(draft, trusted.organization_id), result: immutable({ enqueue_status: 'duplicate', item: safeItem(existingByCommand) }) };
  }
  const idempotencyKey = `${command.organization_id}\u0000${command.idempotency_key}`;
  const existingByKeyId = draft.idempotencyKeys.get(idempotencyKey);
  if (existingByKeyId) {
    const existingByKey = draft.items.get(scopedKey(trusted.organization_id, existingByKeyId));
    if (!existingByKey || existingByKey.enqueued_by_user_id !== trusted.session_user_id || existingByKey.command_hash !== commandHash) {
      fail('validation_failed', 'idempotency_key já utilizado com envelope divergente.');
    }
    return { state: immutableState(draft, trusted.organization_id), result: immutable({ enqueue_status: 'duplicate', item: safeItem(existingByKey) }) };
  }
  const now = clock.now;
  const record = {
    item_id: itemId,
    command,
    command_hash: commandHash,
    enqueued_by_user_id: trusted.session_user_id,
    origin_device_id: trusted.device_id,
    claimed_by_device_id: null,
    state: 'pending',
    attempt_count: 0,
    available_at: now,
    lease_id: null,
    lease_expires_at: null,
    last_error_code: null,
    outcome_uncertain: false,
    reconciliation_probe_used: false,
    created_at: now,
    updated_at: now,
  };
  draft.items.set(itemKey, record);
  draft.commandIds.set(commandKey, itemId);
  draft.idempotencyKeys.set(idempotencyKey, itemId);
  return { state: immutableState(draft, trusted.organization_id), result: immutable({ enqueue_status: 'enqueued', item: safeItem(record) }) };
}

function immutableState(state, organizationId) {
  assertIdentifier(organizationId, 'organization_id');
  return Object.freeze({
    items: new ReadonlyMapView(state.items.entries(), organizationId, safeItem),
    commandIds: new ReadonlyMapView(state.commandIds.entries(), organizationId),
    idempotencyKeys: new ReadonlyMapView(state.idempotencyKeys.entries(), organizationId),
    tombstones: new ReadonlyMapView(state.tombstones.entries(), organizationId, safeTombstone),
  });
}

function isEligible(record, nowMs) {
  if (record.state === 'pending') return true;
  if (record.state === 'retry_wait') return Date.parse(record.available_at) <= nowMs;
  if (record.state === 'claimed') return Date.parse(record.lease_expires_at) <= nowMs;
  return false;
}

export function claim(state, input, context, clock, options = {}) {
  const trusted = assertTrustedContext(context);
  assertExactKeys(input, ['lease_id'], 'claim');
  const leaseId = assertIdentifier(input.lease_id, 'lease_id');
  const { nowMs } = validateClock(clock);
  const leaseDurationMs = options.leaseDurationMs ?? 30_000;
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) fail('validation_failed', 'configuração de lease inválida.');
  const draft = cloneState(state);
  for (const record of draft.items.values()) {
    if (record.enqueued_by_user_id === trusted.session_user_id && record.command.organization_id === trusted.organization_id) {
      assertMonotonicClock(record, nowMs, 'claim');
    }
    if (
      record.enqueued_by_user_id === trusted.session_user_id
      && record.command.organization_id === trusted.organization_id
      && record.state === 'claimed'
      && record.lease_id === leaseId
      && Date.parse(record.lease_expires_at) > nowMs
    ) {
      fail('lease_conflict', 'lease_id já está ativo em outro item.');
    }
  }
  const candidates = [...draft.items.values()]
    .filter((record) => record.enqueued_by_user_id === trusted.session_user_id && record.command.organization_id === trusted.organization_id && !TERMINAL_STATES.has(record.state) && isEligible(record, nowMs))
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.item_id.localeCompare(right.item_id));
  for (const record of candidates) {
    const reclaiming = record.state === 'claimed';
    if (reclaiming) record.outcome_uncertain = true;
    if (record.attempt_count >= maxAttempts) {
      if (record.outcome_uncertain && !record.reconciliation_probe_used) {
        record.reconciliation_probe_used = true;
      } else {
        record.state = record.outcome_uncertain ? 'reconcile_required' : 'dead_letter';
        record.available_at = null;
        record.lease_id = null;
        record.lease_expires_at = null;
        record.last_error_code = record.outcome_uncertain ? 'delivery_outcome_ambiguous' : 'attempt_limit_reached';
        record.claimed_by_device_id = null;
        record.updated_at = clock.now;
        continue;
      }
    } else {
      record.attempt_count += 1;
    }
    record.state = 'claimed';
    record.available_at = null;
    record.lease_id = leaseId;
    record.lease_expires_at = new Date(nowMs + leaseDurationMs).toISOString();
    record.claimed_by_device_id = trusted.device_id;
    record.updated_at = clock.now;
    return { state: immutableState(draft, trusted.organization_id), result: safeItem(record) };
  }
  return { state: immutableState(draft, trusted.organization_id), result: null };
}

export function settleGatewayResult(state, input, context, clock) {
  const trusted = assertTrustedContext(context);
  assertExactKeys(input, ['item_id', 'lease_id', 'result'], 'settleGatewayResult');
  const itemId = assertIdentifier(input.item_id, 'item_id');
  const leaseId = assertIdentifier(input.lease_id, 'lease_id');
  const result = validateCommandResult(input.result);
  const { nowMs } = validateClock(clock);
  const draft = cloneState(state);
  const record = leasedRecord(draft, itemId, leaseId, trusted, nowMs);
  for (const key of ['command_id', 'idempotency_key', 'organization_id', 'aggregate_type', 'aggregate_id']) {
    if (result[key] !== record.command[key]) fail('validation_failed', 'resultado diverge do comando reclamado.');
  }
  const ambiguous = record.outcome_uncertain && result.state === 'rejected' && AMBIGUOUS_AUTHORIZATION_CODES.has(result.code);
  record.state = ambiguous ? 'reconcile_required' : result.state;
  record.outcome_uncertain = ambiguous;
  record.last_error_code = ambiguous ? 'delivery_outcome_ambiguous' : null;
  record.available_at = null;
  record.lease_id = null;
  record.lease_expires_at = null;
  record.claimed_by_device_id = null;
  record.updated_at = clock.now;
  return { state: immutableState(draft, trusted.organization_id), result: safeItem(record) };
}

export function settleFailure(state, input, context, clock, options = {}) {
  const trusted = assertTrustedContext(context);
  assertExactKeys(input, ['item_id', 'lease_id', 'failure'], 'settleFailure');
  const itemId = assertIdentifier(input.item_id, 'item_id');
  const leaseId = assertIdentifier(input.lease_id, 'lease_id');
  assertPlainObject(input.failure, 'failure');
  const { nowMs } = validateClock(clock);
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffBaseMs = options.backoffBaseMs ?? 1_000;
  const maxBackoffMs = options.maxBackoffMs ?? 60_000;
  const draft = cloneState(state);
  const record = leasedRecord(draft, itemId, leaseId, trusted, nowMs);
  const transient = input.failure.kind === 'transient' && TRANSIENT_CODES.has(input.failure.code);
  const unclassified = input.failure.kind === 'unclassified' && input.failure.code === 'unclassified_failure';
  if (!transient && !unclassified) fail('validation_failed', 'failure fora da allowlist.');
  if (input.failure.code === 'transport_timeout' || unclassified) record.outcome_uncertain = true;
  record.lease_id = null;
  record.lease_expires_at = null;
  record.claimed_by_device_id = null;
  record.updated_at = clock.now;
  const probeRequired = unclassified && !record.reconciliation_probe_used;
  const retry = transient && (record.attempt_count < maxAttempts || (record.outcome_uncertain && !record.reconciliation_probe_used));
  if (probeRequired) {
    // A non-classified failure has no delivery proof. Consume the retry budget
    // and make exactly one immediately eligible claim the reconciliation probe.
    record.attempt_count = Math.max(record.attempt_count, maxAttempts);
    record.state = 'retry_wait';
    record.available_at = clock.now;
    record.last_error_code = input.failure.code;
  } else if (retry) {
    const exponent = Math.max(0, record.attempt_count - 1);
    record.state = 'retry_wait';
    record.available_at = new Date(nowMs + Math.min(maxBackoffMs, backoffBaseMs * (2 ** exponent))).toISOString();
    record.last_error_code = input.failure.code;
  } else if (record.outcome_uncertain) {
    record.state = 'reconcile_required';
    record.available_at = null;
    record.last_error_code = 'delivery_outcome_ambiguous';
  } else {
    record.state = 'dead_letter';
    record.available_at = null;
    record.last_error_code = transient ? 'attempt_limit_reached' : 'unclassified_failure';
  }
  return { state: immutableState(draft, trusted.organization_id), result: safeItem(record) };
}

export function applyTombstoneTransaction(state, input, context, clock) {
  const trusted = assertTrustedContext(context);
  assertExactKeys(input, ['tombstone_id', 'aggregate_type', 'aggregate_id', 'deleted_at', 'simulate_crash'], 'tombstone');
  const tombstoneId = assertIdentifier(input.tombstone_id, 'tombstone_id');
  const aggregateId = assertIdentifier(input.aggregate_id, 'aggregate_id');
  if (input.aggregate_type !== 'client' && input.aggregate_type !== 'location') fail('validation_failed', 'aggregate_type inválido.');
  assertIso(input.deleted_at, 'deleted_at');
  if (typeof input.simulate_crash !== 'boolean') fail('validation_failed', 'simulate_crash inválido.');
  const { nowMs } = validateClock(clock);
  if (Date.parse(input.deleted_at) > nowMs) fail('clock_skew', 'deleted_at está no futuro.');
  const draft = cloneState(state);
  const tombstone = {
    tombstone_id: tombstoneId,
    organization_id: trusted.organization_id,
    aggregate_type: input.aggregate_type,
    aggregate_id: aggregateId,
    deleted_at: input.deleted_at,
    device_id: trusted.device_id,
  };
  const tombstoneKey = scopedKey(trusted.organization_id, tombstoneId);
  const existing = draft.tombstones.get(tombstoneKey);
  if (existing) {
    const same = existing.organization_id === tombstone.organization_id
      && existing.aggregate_type === tombstone.aggregate_type
      && existing.aggregate_id === tombstone.aggregate_id
      && existing.deleted_at === tombstone.deleted_at;
    if (!same) fail('validation_failed', 'tombstone_id já utilizado com conteúdo divergente.');
    return { state: immutableState(draft, trusted.organization_id), committed: true, event: 'tombstone_duplicate', tombstone: immutable(existing) };
  }
  if (input.simulate_crash) {
    return { state: immutableState(draft, trusted.organization_id), committed: false, event: 'crash_before_commit' };
  }
  draft.tombstones.set(tombstoneKey, tombstone);
  return { state: immutableState(draft, trusted.organization_id), committed: true, event: 'tombstone_committed', tombstone: immutable(tombstone) };
}

export function retentionDecision(input) {
  assertExactKeys(input, ['last_seen_at', 'now'], 'retention');
  assertIso(input.last_seen_at, 'last_seen_at');
  assertIso(input.now, 'now');
  const ageMs = Date.parse(input.now) - Date.parse(input.last_seen_at);
  if (ageMs < 0) fail('clock_skew', 'last_seen_at está no futuro.');
  return ageMs > TOMBSTONE_RETENTION_MS
    ? Object.freeze({ decision: 'reconcile_required', reason: 'offline_device_over_90d' })
    : Object.freeze({ decision: 'retain', reason: 'within_retention_window' });
}

export function resolveReplica(input, context) {
  const trusted = assertTrustedIdentity(context);
  assertExactKeys(input, ['left', 'right'], 'replicas');
  for (const side of ['left', 'right']) {
    const replica = input[side];
    assertExactKeys(replica, ['organization_id', 'device_id', 'logical_version', 'updated_at', 'payload_hash'], `replica.${side}`);
    assertIdentifier(replica.organization_id, `replica.${side}.organization_id`);
    assertIdentifier(replica.device_id, `replica.${side}.device_id`);
    assertIdentifier(replica.payload_hash, `replica.${side}.payload_hash`);
    assertIso(replica.updated_at, `replica.${side}.updated_at`);
    if (!Number.isSafeInteger(replica.logical_version) || replica.logical_version < 0) fail('validation_failed', 'logical_version inválido.');
  }
  if (input.left.organization_id !== trusted.organization_id || input.right.organization_id !== trusted.organization_id) {
    fail('co_tenancy_violation', 'réplica não pertence ao tenant do contexto confiável.');
  }
  if (input.left.organization_id !== input.right.organization_id) fail('co_tenancy_violation', 'réplicas pertencem a tenants diferentes.');
  const skew = Math.abs(Date.parse(input.left.updated_at) - Date.parse(input.right.updated_at));
  if (skew > MAX_CLOCK_SKEW_MS) return Object.freeze({ decision: 'reconcile_required', reason: 'clock_skew_exceeded' });
  if (input.left.payload_hash === input.right.payload_hash) return Object.freeze({ decision: 'same' });
  if (input.left.logical_version !== input.right.logical_version) {
    return Object.freeze({ decision: 'choose', device_id: input.left.logical_version > input.right.logical_version ? input.left.device_id : input.right.device_id, reason: 'higher_logical_version' });
  }
  if (input.left.updated_at === input.right.updated_at) {
    return Object.freeze({ decision: 'conflict', reason: 'equal_timestamp_divergent_payload' });
  }
  return Object.freeze({ decision: 'choose', device_id: input.left.updated_at > input.right.updated_at ? input.left.device_id : input.right.device_id, reason: 'bounded_timestamp_tiebreak' });
}

export const CONTRACT_CONSTANTS = Object.freeze({
  maxClockSkewMs: MAX_CLOCK_SKEW_MS,
  tombstoneRetentionDays: 90,
  states: OUTBOX_STATES,
});
