import { createHash } from 'node:crypto';

import {
  validateClient,
  validateLocation,
  validateMembership,
} from '../../JANELA_2_1/contracts/tenancy-contract.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const AGGREGATE_TYPES = new Set(['client', 'location']);
const PHASES = new Set(['legacy', 'shadow', 'pilot_v2', 'paused']);
const WRITERS = new Set(['v1', 'v2']);
const SHADOW_STATUSES = new Set([
  'match',
  'missing_legacy',
  'missing_canonical',
  'both_missing',
  'version_mismatch',
  'field_mismatch',
]);
const REPORT_KEYS = Object.freeze([
  'report_version',
  'observed_at',
  'scope_digest',
  'aggregate_type',
  'status',
  'canonical_version',
  'legacy_version',
  'mismatched_fields',
]);
const SCOPE_KEYS = Object.freeze([
  'organization_id',
  'aggregate_type',
  'aggregate_id',
]);
const TRUSTED_CONTEXT_KEYS = Object.freeze(['session_user_id']);

const PROJECTION_FIELDS = Object.freeze({
  client: Object.freeze([
    'schema_version',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
    'aggregate_version',
    'display_name',
    'status',
    'updated_at',
  ]),
  location: Object.freeze([
    'schema_version',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
    'aggregate_version',
    'client_id',
    'label',
    'status',
    'updated_at',
  ]),
});

const COMPARED_FIELDS = Object.freeze({
  client: Object.freeze(['display_name', 'status', 'updated_at']),
  location: Object.freeze(['client_id', 'label', 'status', 'updated_at']),
});

export class ShadowBoundaryError extends Error {
  constructor(code, message = 'Operação recusada pelo contrato shadow.') {
    super(message);
    this.name = 'ShadowBoundaryError';
    this.code = code;
    this.safe_result = deepFreeze({ state: 'rejected', code });
  }
}

function invariant(condition, code = 'validation_failed', message) {
  if (!condition) throw new ShadowBoundaryError(code, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label = 'Entrada') {
  invariant(isPlainObject(value), 'validation_failed', `${label} recusada pelo contrato.`);
}

function assertExactKeys(value, expected, label = 'Entrada') {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  invariant(
    actual.length === required.length
      && actual.every((key, index) => key === required[index]),
    'validation_failed',
    `${label} recusada pelo contrato.`,
  );
}

function assertIdentifier(value, label = 'Identificador') {
  invariant(
    typeof value === 'string' && IDENTIFIER.test(value),
    'validation_failed',
    `${label} recusado pelo contrato.`,
  );
  return value;
}

function assertPositiveInteger(value, label = 'Versão') {
  invariant(
    Number.isSafeInteger(value) && value > 0,
    'validation_failed',
    `${label} recusada pelo contrato.`,
  );
  return value;
}

function assertNonNegativeInteger(value, label = 'Contador') {
  invariant(
    Number.isSafeInteger(value) && value >= 0,
    'validation_failed',
    `${label} recusado pelo contrato.`,
  );
  return value;
}

function assertTimestamp(value, label = 'Data') {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  invariant(
    Number.isFinite(parsed) && new Date(parsed).toISOString() === value,
    'validation_failed',
    `${label} recusada pelo contrato.`,
  );
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function mapKey(...parts) {
  return parts.join('\u0000');
}

function validateAggregateType(value) {
  invariant(
    AGGREGATE_TYPES.has(value),
    'validation_failed',
    'Tipo de agregado recusado pelo contrato.',
  );
  return value;
}

function validateScope(input) {
  assertExactKeys(input, SCOPE_KEYS, 'Escopo');
  const output = {
    organization_id: assertIdentifier(input.organization_id),
    aggregate_type: validateAggregateType(input.aggregate_type),
    aggregate_id: assertIdentifier(input.aggregate_id),
  };
  return immutableClone(output);
}

function scopeDigest(scope) {
  return digest({
    organization_id: scope.organization_id,
    aggregate_type: scope.aggregate_type,
    aggregate_id: scope.aggregate_id,
  });
}

function validateTrustedContext(input) {
  assertExactKeys(input, TRUSTED_CONTEXT_KEYS, 'Contexto confiável');
  return assertIdentifier(input.session_user_id, 'Sessão');
}

function validateCanonical(aggregateType, input, parentClient = null) {
  validateAggregateType(aggregateType);
  try {
    if (aggregateType === 'client') return validateClient(input);
    invariant(parentClient !== null, 'co_tenancy_violation');
    return validateLocation(input, validateClient(parentClient));
  } catch (error) {
    if (error instanceof ShadowBoundaryError) throw error;
    if (error?.code === 'co_tenancy_violation') {
      throw new ShadowBoundaryError('co_tenancy_violation');
    }
    throw new ShadowBoundaryError('validation_failed');
  }
}

function canonicalScope(aggregateType, canonical) {
  return validateScope({
    organization_id: canonical.organization_id,
    aggregate_type: aggregateType,
    aggregate_id: aggregateType === 'client'
      ? canonical.client_id
      : canonical.location_id,
  });
}

function assertSameScope(expected, actual) {
  invariant(
    expected.organization_id === actual.organization_id
      && expected.aggregate_type === actual.aggregate_type
      && expected.aggregate_id === actual.aggregate_id,
    'scope_mismatch',
    'Escopo divergente recusado.',
  );
}

export function projectV2ToLegacy(aggregateType, input, parentClient = null) {
  const canonical = validateCanonical(aggregateType, input, parentClient);
  if (aggregateType === 'client') {
    return immutableClone({
      schema_version: 1,
      organization_id: canonical.organization_id,
      aggregate_type: 'client',
      aggregate_id: canonical.client_id,
      aggregate_version: canonical.version,
      display_name: canonical.display_name,
      status: canonical.status,
      updated_at: canonical.updated_at,
    });
  }
  return immutableClone({
    schema_version: 1,
    organization_id: canonical.organization_id,
    aggregate_type: 'location',
    aggregate_id: canonical.location_id,
    aggregate_version: canonical.version,
    client_id: canonical.client_id,
    label: canonical.label,
    status: canonical.status,
    updated_at: canonical.updated_at,
  });
}

function validateLegacyProjection(input, parentClient = null) {
  assertPlainObject(input, 'Projeção legada');
  const aggregateType = validateAggregateType(input.aggregate_type);
  assertExactKeys(input, PROJECTION_FIELDS[aggregateType], 'Projeção legada');
  invariant(input.schema_version === 1, 'validation_failed');
  const scope = validateScope({
    organization_id: input.organization_id,
    aggregate_type: aggregateType,
    aggregate_id: input.aggregate_id,
  });
  const canonical = aggregateType === 'client'
    ? {
      organization_id: scope.organization_id,
      client_id: scope.aggregate_id,
      display_name: input.display_name,
      status: input.status,
      version: input.aggregate_version,
      updated_at: input.updated_at,
    }
    : {
      organization_id: scope.organization_id,
      location_id: scope.aggregate_id,
      client_id: input.client_id,
      label: input.label,
      status: input.status,
      version: input.aggregate_version,
      updated_at: input.updated_at,
    };
  validateCanonical(aggregateType, canonical, parentClient);
  return immutableClone(input);
}

export function createProjectionEvent(
  aggregateType,
  input,
  eventId,
  parentClient = null,
) {
  const projection = projectV2ToLegacy(aggregateType, input, parentClient);
  return immutableClone({
    event_version: 1,
    event_id: assertIdentifier(eventId, 'Evento'),
    organization_id: projection.organization_id,
    aggregate_type: projection.aggregate_type,
    aggregate_id: projection.aggregate_id,
    aggregate_version: projection.aggregate_version,
    projection_digest: digest(projection),
    projection,
  });
}

function validateProjectionEvent(input, parentClient = null) {
  const keys = [
    'event_version',
    'event_id',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
    'aggregate_version',
    'projection_digest',
    'projection',
  ];
  assertExactKeys(input, keys, 'Evento de projeção');
  invariant(input.event_version === 1, 'validation_failed');
  assertIdentifier(input.event_id, 'Evento');
  const scope = validateScope({
    organization_id: input.organization_id,
    aggregate_type: input.aggregate_type,
    aggregate_id: input.aggregate_id,
  });
  const version = assertPositiveInteger(input.aggregate_version);
  invariant(typeof input.projection_digest === 'string' && SHA256.test(input.projection_digest));
  const projection = validateLegacyProjection(input.projection, parentClient);
  assertSameScope(scope, validateScope({
    organization_id: projection.organization_id,
    aggregate_type: projection.aggregate_type,
    aggregate_id: projection.aggregate_id,
  }));
  invariant(projection.aggregate_version === version, 'scope_mismatch');
  invariant(digest(projection) === input.projection_digest, 'projection_digest_mismatch');
  return immutableClone({ ...input, projection });
}

function projectionOutcome(code, receivedVersion, projectedVersion, changed) {
  return immutableClone({
    state: code === 'projection_applied' ? 'applied' : 'ignored',
    code,
    received_version: receivedVersion,
    projected_version: projectedVersion,
    changed,
  });
}

export class InMemoryShadowProjectionStore {
  #entries = new Map();
  #eventFingerprints = new Map();
  #memberships = new Map();

  constructor({ memberships = [] } = {}) {
    invariant(Array.isArray(memberships), 'validation_failed');
    for (const source of memberships) {
      let membership;
      try {
        membership = validateMembership(source);
      } catch {
        throw new ShadowBoundaryError('validation_failed');
      }
      const key = mapKey(membership.organization_id, membership.user_id);
      invariant(!this.#memberships.has(key), 'validation_failed');
      this.#memberships.set(key, membership);
    }
  }

  apply(untrustedEvent, parentClient = null) {
    const event = validateProjectionEvent(untrustedEvent, parentClient);
    const key = mapKey(
      event.organization_id,
      event.aggregate_type,
      event.aggregate_id,
    );
    const current = this.#entries.get(key);
    const eventFingerprint = digest(event);
    const previousFingerprint = this.#eventFingerprints.get(event.event_id);
    if (previousFingerprint && previousFingerprint !== eventFingerprint) {
      return projectionOutcome(
        'projection_divergence',
        event.aggregate_version,
        current?.version ?? 0,
        false,
      );
    }
    if (!previousFingerprint) {
      this.#eventFingerprints.set(event.event_id, eventFingerprint);
    }
    if (event.aggregate_type === 'location') {
      const parent = this.#entries.get(mapKey(
        event.organization_id,
        'client',
        event.projection.client_id,
      ));
      invariant(parent, 'co_tenancy_violation');
    }
    if (!current) {
      if (event.aggregate_version !== 1) {
        return projectionOutcome(
          'projection_gap',
          event.aggregate_version,
          0,
          false,
        );
      }
      this.#entries.set(key, immutableClone({
        version: event.aggregate_version,
        digest: event.projection_digest,
        projection: event.projection,
      }));
      return projectionOutcome('projection_applied', 1, 1, true);
    }

    if (event.aggregate_version < current.version) {
      return projectionOutcome(
        'projection_stale',
        event.aggregate_version,
        current.version,
        false,
      );
    }
    if (event.aggregate_version === current.version) {
      return projectionOutcome(
        event.projection_digest === current.digest
          ? 'projection_replay'
          : 'projection_divergence',
        event.aggregate_version,
        current.version,
        false,
      );
    }
    if (event.aggregate_version !== current.version + 1) {
      return projectionOutcome(
        'projection_gap',
        event.aggregate_version,
        current.version,
        false,
      );
    }

    this.#entries.set(key, immutableClone({
      version: event.aggregate_version,
      digest: event.projection_digest,
      projection: event.projection,
    }));
    return projectionOutcome(
      'projection_applied',
      event.aggregate_version,
      event.aggregate_version,
      true,
    );
  }

  read(untrustedScope, trustedContext) {
    const scope = validateScope(untrustedScope);
    const sessionUserId = validateTrustedContext(trustedContext);
    const membership = this.#memberships.get(
      mapKey(scope.organization_id, sessionUserId),
    );
    if (
      !membership
      || membership.status !== 'active'
      || !membership.capabilities.includes('clients_locations.read')
    ) {
      return null;
    }
    const entry = this.#entries.get(mapKey(
      scope.organization_id,
      scope.aggregate_type,
      scope.aggregate_id,
    ));
    return entry ? immutableClone(entry.projection) : null;
  }

  compareForCutover(
    untrustedScope,
    canonical,
    observedAt,
    parentClient = null,
  ) {
    const scope = validateScope(untrustedScope);
    const entry = this.#entries.get(mapKey(
      scope.organization_id,
      scope.aggregate_type,
      scope.aggregate_id,
    ));
    return compareShadow({
      scope,
      canonical,
      legacy: entry?.projection ?? null,
      parent_client: parentClient,
      observed_at: observedAt,
    });
  }

  get size() {
    return this.#entries.size;
  }
}

function canonicalOutcome(code, receivedVersion, canonicalVersion, changed) {
  return immutableClone({
    state: code === 'canonical_applied' ? 'applied' : 'ignored',
    code,
    received_version: receivedVersion,
    canonical_version: canonicalVersion,
    changed,
  });
}

export class InMemoryCanonicalStore {
  #entries = new Map();

  constructor({ clients = [], locations = [] } = {}) {
    invariant(Array.isArray(clients) && Array.isArray(locations), 'validation_failed');
    for (const client of clients) {
      const outcome = this.apply('client', client);
      invariant(outcome.code === 'canonical_applied', 'validation_failed');
    }
    for (const location of locations) {
      const outcome = this.apply('location', location);
      invariant(outcome.code === 'canonical_applied', 'validation_failed');
    }
  }

  apply(aggregateType, input) {
    validateAggregateType(aggregateType);
    let canonical;
    if (aggregateType === 'client') {
      canonical = validateCanonical('client', input);
    } else {
      let location;
      try {
        location = validateLocation(input);
      } catch {
        throw new ShadowBoundaryError('validation_failed');
      }
      const parent = this.#entries.get(mapKey(
        location.organization_id,
        'client',
        location.client_id,
      ));
      invariant(parent, 'co_tenancy_violation');
      canonical = validateCanonical('location', location, parent.canonical);
    }

    const scope = canonicalScope(aggregateType, canonical);
    const key = mapKey(
      scope.organization_id,
      scope.aggregate_type,
      scope.aggregate_id,
    );
    const current = this.#entries.get(key);
    const canonicalDigest = digest(canonical);
    if (!current) {
      if (canonical.version !== 1) {
        return canonicalOutcome('canonical_gap', canonical.version, 0, false);
      }
      this.#entries.set(key, immutableClone({
        version: canonical.version,
        digest: canonicalDigest,
        canonical,
      }));
      return canonicalOutcome('canonical_applied', 1, 1, true);
    }
    if (canonical.version < current.version) {
      return canonicalOutcome(
        'canonical_stale',
        canonical.version,
        current.version,
        false,
      );
    }
    if (canonical.version === current.version) {
      return canonicalOutcome(
        canonicalDigest === current.digest
          ? 'canonical_replay'
          : 'canonical_divergence',
        canonical.version,
        current.version,
        false,
      );
    }
    if (canonical.version !== current.version + 1) {
      return canonicalOutcome(
        'canonical_gap',
        canonical.version,
        current.version,
        false,
      );
    }
    this.#entries.set(key, immutableClone({
      version: canonical.version,
      digest: canonicalDigest,
      canonical,
    }));
    return canonicalOutcome(
      'canonical_applied',
      canonical.version,
      canonical.version,
      true,
    );
  }

  compareCurrent(untrustedScope, projectionStore, observedAt) {
    invariant(
      projectionStore instanceof InMemoryShadowProjectionStore,
      'validation_failed',
    );
    const scope = validateScope(untrustedScope);
    const entry = this.#entries.get(mapKey(
      scope.organization_id,
      scope.aggregate_type,
      scope.aggregate_id,
    ));
    let parentClient = null;
    if (entry?.canonical && scope.aggregate_type === 'location') {
      const parent = this.#entries.get(mapKey(
        scope.organization_id,
        'client',
        entry.canonical.client_id,
      ));
      invariant(parent, 'co_tenancy_violation');
      parentClient = parent.canonical;
    }
    return projectionStore.compareForCutover(
      scope,
      entry?.canonical ?? null,
      observedAt,
      parentClient,
    );
  }

  get size() {
    return this.#entries.size;
  }
}

export function compareShadow({
  scope: untrustedScope,
  canonical,
  legacy,
  parent_client: parentClient = null,
  observed_at: observedAt,
}) {
  const scope = validateScope(untrustedScope);
  assertTimestamp(observedAt, 'Data de observação');
  let expected = null;
  let actual = null;

  if (canonical !== null) {
    const validCanonical = validateCanonical(
      scope.aggregate_type,
      canonical,
      parentClient,
    );
    assertSameScope(scope, canonicalScope(scope.aggregate_type, validCanonical));
    expected = projectV2ToLegacy(
      scope.aggregate_type,
      validCanonical,
      parentClient,
    );
  }
  if (legacy !== null) {
    actual = validateLegacyProjection(legacy, parentClient);
    assertSameScope(scope, validateScope({
      organization_id: actual.organization_id,
      aggregate_type: actual.aggregate_type,
      aggregate_id: actual.aggregate_id,
    }));
  }

  let status;
  let mismatchedFields = [];
  if (expected === null && actual === null) status = 'both_missing';
  else if (expected === null) status = 'missing_canonical';
  else if (actual === null) status = 'missing_legacy';
  else if (expected.aggregate_version !== actual.aggregate_version) {
    status = 'version_mismatch';
  } else {
    mismatchedFields = COMPARED_FIELDS[scope.aggregate_type]
      .filter((field) => expected[field] !== actual[field])
      .sort();
    status = mismatchedFields.length === 0 ? 'match' : 'field_mismatch';
  }

  return immutableClone({
    report_version: 1,
    observed_at: observedAt,
    scope_digest: scopeDigest(scope),
    aggregate_type: scope.aggregate_type,
    status,
    canonical_version: expected?.aggregate_version ?? null,
    legacy_version: actual?.aggregate_version ?? null,
    mismatched_fields: mismatchedFields,
  });
}

function validateShadowReport(input) {
  assertExactKeys(input, REPORT_KEYS, 'Relatório shadow');
  invariant(input.report_version === 1, 'validation_failed');
  assertTimestamp(input.observed_at);
  invariant(typeof input.scope_digest === 'string' && SHA256.test(input.scope_digest));
  validateAggregateType(input.aggregate_type);
  invariant(SHADOW_STATUSES.has(input.status), 'validation_failed');
  for (const value of [input.canonical_version, input.legacy_version]) {
    invariant(value === null || (Number.isSafeInteger(value) && value > 0));
  }
  invariant(
    Array.isArray(input.mismatched_fields)
      && input.mismatched_fields.every((field) => COMPARED_FIELDS[input.aggregate_type].includes(field))
      && new Set(input.mismatched_fields).size === input.mismatched_fields.length,
    'validation_failed',
  );
  return immutableClone(input);
}

export class InMemoryShadowMetrics {
  #total = 0;
  #byStatus = Object.fromEntries([...SHADOW_STATUSES].sort().map((status) => [status, 0]));
  #byAggregateType = { client: 0, location: 0 };

  observe(untrustedReport) {
    const report = validateShadowReport(untrustedReport);
    this.#total += 1;
    this.#byStatus[report.status] += 1;
    this.#byAggregateType[report.aggregate_type] += 1;
    return this.snapshot();
  }

  snapshot() {
    return immutableClone({
      total: this.#total,
      by_status: this.#byStatus,
      by_aggregate_type: this.#byAggregateType,
    });
  }
}

function activeWriter(phase) {
  if (phase === 'legacy' || phase === 'shadow') return 'v1';
  if (phase === 'pilot_v2') return 'v2';
  return null;
}

function validatePolicySeed(input) {
  const keys = [
    ...SCOPE_KEYS,
    'phase',
    'policy_version',
    'cutover_version',
    'last_gate_observed_at',
    'pending_outbox_count',
    'audit_event_count',
  ];
  assertExactKeys(input, keys, 'Política piloto');
  const scope = validateScope({
    organization_id: input.organization_id,
    aggregate_type: input.aggregate_type,
    aggregate_id: input.aggregate_id,
  });
  invariant(PHASES.has(input.phase), 'validation_failed');
  const policyVersion = assertPositiveInteger(input.policy_version, 'Versão da política');
  const pendingOutboxCount = assertNonNegativeInteger(input.pending_outbox_count);
  const auditEventCount = assertNonNegativeInteger(input.audit_event_count);
  invariant(
    input.cutover_version === null
      || (Number.isSafeInteger(input.cutover_version) && input.cutover_version > 0),
    'validation_failed',
  );
  invariant(
    input.last_gate_observed_at === null
      || assertTimestamp(input.last_gate_observed_at, 'Última evidência'),
    'validation_failed',
  );
  if (input.phase === 'legacy' || input.phase === 'shadow') {
    invariant(
      input.cutover_version === null && input.last_gate_observed_at === null,
      'validation_failed',
    );
  } else {
    invariant(
      input.cutover_version !== null && input.last_gate_observed_at !== null,
      'validation_failed',
    );
  }
  return immutableClone({
    ...scope,
    phase: input.phase,
    policy_version: policyVersion,
    cutover_version: input.cutover_version,
    last_gate_observed_at: input.last_gate_observed_at,
    pending_outbox_count: pendingOutboxCount,
    audit_event_count: auditEventCount,
  });
}

function policySnapshot(entry) {
  return immutableClone({
    scope_digest: scopeDigest(entry),
    aggregate_type: entry.aggregate_type,
    phase: entry.phase,
    active_writer: activeWriter(entry.phase),
    policy_version: entry.policy_version,
    cutover_version: entry.cutover_version,
    pending_outbox_count: entry.pending_outbox_count,
    audit_event_count: entry.audit_event_count,
  });
}

function transitionOutcome(state, code, entry) {
  return immutableClone({ state, code, policy: policySnapshot(entry) });
}

export class InMemoryPilotPolicyStore {
  #canonicalStore;
  #clock;
  #entries = new Map();
  #projectionStore;

  constructor({
    canonicalStore,
    clock,
    entries = [],
    projectionStore,
  } = {}) {
    invariant(
      Array.isArray(entries)
        && canonicalStore instanceof InMemoryCanonicalStore
        && projectionStore instanceof InMemoryShadowProjectionStore
        && typeof clock === 'function',
      'validation_failed',
    );
    this.#canonicalStore = canonicalStore;
    this.#clock = clock;
    this.#projectionStore = projectionStore;
    for (const source of entries) {
      const entry = validatePolicySeed(source);
      const key = mapKey(
        entry.organization_id,
        entry.aggregate_type,
        entry.aggregate_id,
      );
      invariant(!this.#entries.has(key), 'validation_failed');
      this.#entries.set(key, entry);
    }
  }

  #get(untrustedScope) {
    const scope = validateScope(untrustedScope);
    const key = mapKey(
      scope.organization_id,
      scope.aggregate_type,
      scope.aggregate_id,
    );
    const entry = this.#entries.get(key);
    invariant(entry, 'policy_not_found');
    return { key, entry };
  }

  #assertExpected(entry, expectedPolicyVersion) {
    assertPositiveInteger(expectedPolicyVersion, 'Versão esperada');
    invariant(
      entry.policy_version === expectedPolicyVersion,
      'policy_version_mismatch',
    );
  }

  #evaluateShadowGate(entry, untrustedScope) {
    let observedAt;
    try {
      observedAt = this.#clock();
    } catch {
      throw new ShadowBoundaryError('clock_failed');
    }
    assertTimestamp(observedAt, 'Evidência do gate');
    if (entry.last_gate_observed_at !== null) {
      invariant(
        Date.parse(observedAt) > Date.parse(entry.last_gate_observed_at),
        'gate_evidence_stale',
      );
    }
    const report = this.#canonicalStore.compareCurrent(
      untrustedScope,
      this.#projectionStore,
      observedAt,
    );
    invariant(
      report.scope_digest === scopeDigest(entry)
        && report.aggregate_type === entry.aggregate_type
        && report.status === 'match'
        && report.canonical_version !== null
        && report.canonical_version === report.legacy_version,
      'cutover_gate_failed',
    );
    return { observedAt, report };
  }

  #commit(
    key,
    entry,
    phase,
    cutoverVersion = entry.cutover_version,
    lastGateObservedAt = entry.last_gate_observed_at,
  ) {
    const next = immutableClone({
      ...entry,
      phase,
      policy_version: entry.policy_version + 1,
      cutover_version: cutoverVersion,
      last_gate_observed_at: lastGateObservedAt,
      audit_event_count: entry.audit_event_count + 1,
    });
    this.#entries.set(key, next);
    return next;
  }

  snapshot(untrustedScope) {
    return policySnapshot(this.#get(untrustedScope).entry);
  }

  authorizeWrite(untrustedScope, writer) {
    invariant(WRITERS.has(writer), 'validation_failed');
    const { entry } = this.#get(untrustedScope);
    const active = activeWriter(entry.phase);
    let allowed = writer === active;
    let code = allowed ? 'writer_allowed' : 'writer_not_active';
    if (!allowed && writer === 'v2' && entry.phase === 'shadow') {
      code = 'shadow_observe_only';
    } else if (!allowed && writer === 'v1' && (entry.phase === 'pilot_v2' || entry.phase === 'paused')) {
      code = 'upgrade_required';
    } else if (!allowed && writer === 'v2' && entry.phase === 'paused') {
      code = 'kill_switch_active';
    }
    return immutableClone({
      allowed,
      code,
      writer,
      policy: policySnapshot(entry),
    });
  }

  enableShadow(untrustedScope, expectedPolicyVersion) {
    const { key, entry } = this.#get(untrustedScope);
    this.#assertExpected(entry, expectedPolicyVersion);
    invariant(entry.phase === 'legacy', 'invalid_transition');
    return transitionOutcome(
      'applied',
      'shadow_enabled',
      this.#commit(key, entry, 'shadow', null),
    );
  }

  cutoverToV2(untrustedScope, untrustedGate) {
    const gateKeys = ['expected_policy_version'];
    assertExactKeys(untrustedGate, gateKeys, 'Gate de cutover');
    const { key, entry } = this.#get(untrustedScope);
    this.#assertExpected(entry, untrustedGate.expected_policy_version);
    invariant(entry.phase === 'shadow', 'invalid_transition');
    invariant(entry.pending_outbox_count === 0, 'cutover_pending_outbox');
    const { observedAt, report } = this.#evaluateShadowGate(entry, untrustedScope);
    return immutableClone({
      state: 'applied',
      code: 'pilot_v2_enabled',
      shadow_report: report,
      policy: policySnapshot(this.#commit(
        key,
        entry,
        'pilot_v2',
        report.canonical_version,
        observedAt,
      )),
    });
  }

  activateKillSwitch(untrustedScope, expectedPolicyVersion) {
    const { key, entry } = this.#get(untrustedScope);
    this.#assertExpected(entry, expectedPolicyVersion);
    invariant(entry.phase === 'pilot_v2', 'invalid_transition');
    return transitionOutcome(
      'applied',
      'pilot_v2_paused',
      this.#commit(key, entry, 'paused'),
    );
  }

  resumeV2(untrustedScope, untrustedGate) {
    const gateKeys = ['expected_policy_version'];
    assertExactKeys(untrustedGate, gateKeys, 'Gate de retomada');
    const { key, entry } = this.#get(untrustedScope);
    this.#assertExpected(entry, untrustedGate.expected_policy_version);
    invariant(entry.phase === 'paused', 'invalid_transition');
    invariant(entry.pending_outbox_count === 0, 'resume_pending_outbox');
    const { observedAt, report } = this.#evaluateShadowGate(entry, untrustedScope);
    return immutableClone({
      state: 'applied',
      code: 'pilot_v2_resumed',
      shadow_report: report,
      policy: policySnapshot(this.#commit(
        key,
        entry,
        'pilot_v2',
        report.canonical_version,
        observedAt,
      )),
    });
  }

  rollbackToLegacy(untrustedScope, expectedPolicyVersion) {
    const { key, entry } = this.#get(untrustedScope);
    this.#assertExpected(entry, expectedPolicyVersion);
    if (entry.phase === 'legacy') {
      return transitionOutcome('noop', 'already_legacy', entry);
    }
    if (entry.phase === 'shadow') {
      return transitionOutcome(
        'applied',
        'shadow_rolled_back',
        this.#commit(key, entry, 'legacy', null),
      );
    }
    return transitionOutcome('blocked', 'reconciliation_required', entry);
  }
}

export const SHADOW_CONSTANTS = deepFreeze({
  reportVersion: 1,
  eventVersion: 1,
  projectionSchemaVersion: 1,
  aggregateTypes: [...AGGREGATE_TYPES].sort(),
  phases: [...PHASES].sort(),
  shadowStatuses: [...SHADOW_STATUSES].sort(),
});
