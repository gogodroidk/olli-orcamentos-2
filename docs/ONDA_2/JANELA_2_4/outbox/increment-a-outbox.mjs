import {
  validateCommand,
  validateCommandResult,
} from '../../JANELA_2_1/contracts/tenancy-contract.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const TRUSTED_CONTEXT_KEYS = Object.freeze(['session_user_id']);
const ENQUEUE_KEYS = Object.freeze(['command', 'item_id']);
const CLAIM_KEYS = Object.freeze(['lease_id']);
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
const AMBIGUOUS_TRANSIENT_CODES = new Set([
  'transport_timeout',
]);
const AMBIGUOUS_AUTHORIZATION_CODES = new Set([
  'authorization_denied',
  'authorization_revoked',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function cloneMap(source) {
  return new Map(
    [...source.entries()].map(([key, value]) => [
      key,
      structuredClone(value),
    ]),
  );
}

function cloneState(source) {
  return {
    items: cloneMap(source.items),
    commandIds: new Map(source.commandIds),
  };
}

function assertPlainObject(value, label) {
  const valid = value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (
      Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null
    );
  if (!valid) {
    throw new OutboxBoundaryError(
      'validation_failed',
      `${label} recusado pelo contrato.`,
    );
  }
}

function assertExactKeys(value, required, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new OutboxBoundaryError(
      'validation_failed',
      `${label} recusado pelo contrato.`,
    );
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new OutboxBoundaryError(
      'validation_failed',
      `${label} inválido.`,
    );
  }
  return value;
}

function assertTrustedContext(value) {
  assertExactKeys(value, TRUSTED_CONTEXT_KEYS, 'Contexto confiável');
  return assertIdentifier(value.session_user_id, 'session_user_id');
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string') {
    throw new OutboxBoundaryError(
      'validation_failed',
      `${label} inválido.`,
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new OutboxBoundaryError(
      'validation_failed',
      `${label} inválido.`,
    );
  }
  return value;
}

function timestampPlus(value, milliseconds) {
  const target = Date.parse(value) + milliseconds;
  if (!Number.isFinite(target)) {
    throw new OutboxBoundaryError(
      'validation_failed',
      'Timestamp calculado fora do intervalo permitido.',
    );
  }
  try {
    return new Date(target).toISOString();
  } catch {
    throw new OutboxBoundaryError(
      'validation_failed',
      'Timestamp calculado fora do intervalo permitido.',
    );
  }
}

function sameCommandEnvelope(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeGatewayResult(result) {
  if (result === null) return null;
  return {
    command_id: result.command_id,
    idempotency_key: result.idempotency_key,
    organization_id: result.organization_id,
    aggregate_type: result.aggregate_type,
    aggregate_id: result.aggregate_id,
    state: result.state,
    code: result.code,
    canonical_version: result.canonical_version,
    replayed: result.replayed,
  };
}

function safeItem(record) {
  return immutableClone({
    item_id: record.item_id,
    command_id: record.command.command_id,
    organization_id: record.command.organization_id,
    aggregate_type: record.command.aggregate_type,
    aggregate_id: record.command.aggregate_id,
    state: record.state,
    attempt_count: record.attempt_count,
    available_at: record.available_at,
    lease_expires_at: record.lease_expires_at,
    last_error_code: record.last_error_code,
    result: safeGatewayResult(record.result),
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

function claimedItem(record) {
  return immutableClone({
    item_id: record.item_id,
    lease_id: record.lease_id,
    lease_expires_at: record.lease_expires_at,
    attempt_count: record.attempt_count,
    enqueued_by_user_id: record.enqueued_by_user_id,
    command: record.command,
  });
}

function normalizeCommand(input) {
  try {
    return validateCommand(input);
  } catch {
    throw new OutboxBoundaryError(
      'validation_failed',
      'Comando recusado pelo contrato da outbox.',
    );
  }
}

function normalizeGatewayResult(input) {
  try {
    return validateCommandResult(input);
  } catch {
    throw new OutboxBoundaryError(
      'validation_failed',
      'Resultado do gateway recusado pela outbox.',
    );
  }
}

function assertResultMatchesCommand(result, command) {
  for (const key of [
    'command_id',
    'idempotency_key',
    'organization_id',
    'aggregate_type',
    'aggregate_id',
  ]) {
    if (result[key] !== command[key]) {
      throw new OutboxBoundaryError(
        'validation_failed',
        'Resultado do gateway diverge do comando reclamado.',
      );
    }
  }
}

function eligibleAt(record, nowMs) {
  if (record.state === 'pending') return true;
  if (record.state === 'retry_wait') {
    return Date.parse(record.available_at) <= nowMs;
  }
  if (record.state === 'claimed') {
    return Date.parse(record.lease_expires_at) <= nowMs;
  }
  return false;
}

export class OutboxBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OutboxBoundaryError';
    this.code = code;
    this.safe_result = deepFreeze({ code });
  }
}

export class OutboxTransientError extends Error {
  constructor(code) {
    if (!TRANSIENT_CODES.has(code)) {
      throw new OutboxBoundaryError(
        'validation_failed',
        'Código transitório não permitido.',
      );
    }
    super('Falha transitória normalizada.');
    this.name = 'OutboxTransientError';
    this.code = code;
  }
}

export class InMemoryOutboxStore {
  #state = {
    items: new Map(),
    commandIds: new Map(),
  };

  #transactionOpen = false;
  #clock;
  #leaseDurationMs;
  #maxAttempts;
  #backoffBaseMs;
  #maxBackoffMs;

  constructor({
    clock,
    leaseDurationMs = 30_000,
    maxAttempts = 3,
    backoffBaseMs = 1_000,
    maxBackoffMs = 60_000,
  }) {
    if (
      typeof clock !== 'function'
      || !Number.isSafeInteger(leaseDurationMs)
      || leaseDurationMs < 1
      || !Number.isSafeInteger(maxAttempts)
      || maxAttempts < 1
      || maxAttempts > 100
      || !Number.isSafeInteger(backoffBaseMs)
      || backoffBaseMs < 1
      || !Number.isSafeInteger(maxBackoffMs)
      || maxBackoffMs < backoffBaseMs
    ) {
      throw new OutboxBoundaryError(
        'validation_failed',
        'Configuração da outbox inválida.',
      );
    }
    this.#clock = clock;
    this.#leaseDurationMs = leaseDurationMs;
    this.#maxAttempts = maxAttempts;
    this.#backoffBaseMs = backoffBaseMs;
    this.#maxBackoffMs = maxBackoffMs;
  }

  #now() {
    return assertTimestamp(this.#clock(), 'Relógio da outbox');
  }

  #mutate(work) {
    if (this.#transactionOpen) {
      throw new OutboxBoundaryError(
        'validation_failed',
        'Mutação aninhada recusada.',
      );
    }
    this.#transactionOpen = true;
    const draft = cloneState(this.#state);
    try {
      const result = work(draft);
      if (
        result
        && typeof result === 'object'
        && typeof result.then === 'function'
      ) {
        throw new OutboxBoundaryError(
          'validation_failed',
          'Mutação assíncrona recusada pelo store local.',
        );
      }
      let committed;
      let safeResult;
      try {
        committed = cloneState(draft);
        safeResult = immutableClone(result);
      } catch {
        throw new OutboxBoundaryError(
          'validation_failed',
          'Mutação local não serializável.',
        );
      }
      this.#state = committed;
      return safeResult;
    } finally {
      this.#transactionOpen = false;
    }
  }

  #leasedRecord(draft, itemId, leaseId, sessionUserId, nowMs) {
    const record = draft.items.get(itemId);
    if (
      !record
      || record.enqueued_by_user_id !== sessionUserId
      || record.state !== 'claimed'
      || record.lease_id !== leaseId
      || Date.parse(record.lease_expires_at) <= nowMs
    ) {
      throw new OutboxBoundaryError(
        'lease_conflict',
        'Lease ausente, vencida ou divergente.',
      );
    }
    return record;
  }

  enqueue(input, trustedContext) {
    assertExactKeys(input, ENQUEUE_KEYS, 'Entrada de enqueue');
    const sessionUserId = assertTrustedContext(trustedContext);
    const itemId = assertIdentifier(input.item_id, 'item_id');
    const validated = normalizeCommand(input.command);
    const { command, command_hash: commandHash } = validated;
    const now = this.#now();

    return this.#mutate((draft) => {
      const existingByItem = draft.items.get(itemId);
      if (existingByItem) {
        if (
          existingByItem.enqueued_by_user_id !== sessionUserId
          || existingByItem.command.command_id !== command.command_id
          || existingByItem.command_hash !== commandHash
          || !sameCommandEnvelope(existingByItem.command, command)
        ) {
          throw new OutboxBoundaryError(
            'validation_failed',
            'Identidade local já utilizada.',
          );
        }
        return {
          enqueue_status: 'duplicate',
          item: safeItem(existingByItem),
        };
      }

      const existingItemId = draft.commandIds.get(command.command_id);
      if (existingItemId) {
        const existingByCommand = draft.items.get(existingItemId);
        if (
          !existingByCommand
          || existingByCommand.enqueued_by_user_id !== sessionUserId
          || existingByCommand.command_hash !== commandHash
          || !sameCommandEnvelope(existingByCommand.command, command)
        ) {
          throw new OutboxBoundaryError(
            'validation_failed',
            'command_id já utilizado.',
          );
        }
        return {
          enqueue_status: 'duplicate',
          item: safeItem(existingByCommand),
        };
      }

      const record = {
        item_id: itemId,
        command,
        command_hash: commandHash,
        enqueued_by_user_id: sessionUserId,
        state: 'pending',
        attempt_count: 0,
        available_at: now,
        lease_id: null,
        lease_expires_at: null,
        last_error_code: null,
        result: null,
        outcome_uncertain: false,
        reconciliation_probe_used: false,
        created_at: now,
        updated_at: now,
      };
      draft.items.set(itemId, record);
      draft.commandIds.set(command.command_id, itemId);
      return {
        enqueue_status: 'enqueued',
        item: safeItem(record),
      };
    });
  }

  claimNext(input, trustedContext) {
    assertExactKeys(input, CLAIM_KEYS, 'Entrada de claim');
    const sessionUserId = assertTrustedContext(trustedContext);
    const leaseId = assertIdentifier(input.lease_id, 'lease_id');
    const now = this.#now();
    const nowMs = Date.parse(now);

    return this.#mutate((draft) => {
      for (const record of draft.items.values()) {
        if (
          record.enqueued_by_user_id === sessionUserId
          &&
          record.state === 'claimed'
          && Date.parse(record.lease_expires_at) > nowMs
          && record.lease_id === leaseId
        ) {
          throw new OutboxBoundaryError(
            'lease_conflict',
            'lease_id já está ativo.',
          );
        }
      }

      const candidates = [...draft.items.values()]
        .filter((record) => (
          record.enqueued_by_user_id === sessionUserId
          && !TERMINAL_STATES.has(record.state)
          && eligibleAt(record, nowMs)
        ))
        .sort((left, right) => (
          left.created_at.localeCompare(right.created_at)
          || left.item_id.localeCompare(right.item_id)
        ));

      for (const record of candidates) {
        const reclaimingExpiredLease = record.state === 'claimed';
        if (reclaimingExpiredLease) {
          record.outcome_uncertain = true;
        }
        if (record.attempt_count >= this.#maxAttempts) {
          if (
            record.outcome_uncertain
            && !record.reconciliation_probe_used
          ) {
            record.reconciliation_probe_used = true;
            record.state = 'claimed';
            record.available_at = null;
            record.lease_id = leaseId;
            record.lease_expires_at = timestampPlus(
              now,
              this.#leaseDurationMs,
            );
            record.updated_at = now;
            return claimedItem(record);
          }
          record.state = (
            reclaimingExpiredLease
            || record.outcome_uncertain
          )
            ? 'reconcile_required'
            : 'dead_letter';
          record.available_at = null;
          record.lease_id = null;
          record.lease_expires_at = null;
          record.last_error_code = record.state === 'reconcile_required'
            ? 'delivery_outcome_ambiguous'
            : 'attempt_limit_reached';
          record.updated_at = now;
          continue;
        }
        record.state = 'claimed';
        record.attempt_count += 1;
        record.available_at = null;
        record.lease_id = leaseId;
        record.lease_expires_at = timestampPlus(
          now,
          this.#leaseDurationMs,
        );
        record.updated_at = now;
        return claimedItem(record);
      }
      return null;
    });
  }

  settleGatewayResult(
    itemId,
    leaseId,
    gatewayResult,
    trustedContext,
  ) {
    assertIdentifier(itemId, 'item_id');
    assertIdentifier(leaseId, 'lease_id');
    const sessionUserId = assertTrustedContext(trustedContext);
    const result = normalizeGatewayResult(gatewayResult);
    const now = this.#now();
    const nowMs = Date.parse(now);

    return this.#mutate((draft) => {
      const record = this.#leasedRecord(
        draft,
        itemId,
        leaseId,
        sessionUserId,
        nowMs,
      );
      assertResultMatchesCommand(result, record.command);
      const ambiguousAuthorization = record.outcome_uncertain
        && result.state === 'rejected'
        && AMBIGUOUS_AUTHORIZATION_CODES.has(result.code);
      record.state = ambiguousAuthorization
        ? 'reconcile_required'
        : result.state;
      record.available_at = null;
      record.lease_id = null;
      record.lease_expires_at = null;
      record.last_error_code = ambiguousAuthorization
        ? 'delivery_outcome_ambiguous'
        : null;
      record.result = result;
      record.updated_at = now;
      return safeItem(record);
    });
  }

  settleFailure(
    itemId,
    leaseId,
    failure,
    trustedContext,
  ) {
    assertIdentifier(itemId, 'item_id');
    assertIdentifier(leaseId, 'lease_id');
    const sessionUserId = assertTrustedContext(trustedContext);
    assertPlainObject(failure, 'Falha normalizada');
    const now = this.#now();
    const nowMs = Date.parse(now);

    return this.#mutate((draft) => {
      const record = this.#leasedRecord(
        draft,
        itemId,
        leaseId,
        sessionUserId,
        nowMs,
      );
      const transient = failure.kind === 'transient'
        && TRANSIENT_CODES.has(failure.code);
      const unclassified = failure.kind === 'unclassified'
        && failure.code === 'unclassified_failure';
      if (!transient && !unclassified) {
        throw new OutboxBoundaryError(
          'validation_failed',
          'Falha normalizada inválida.',
        );
      }

      record.lease_id = null;
      record.lease_expires_at = null;
      record.result = null;
      record.updated_at = now;
      if (
        transient
        && AMBIGUOUS_TRANSIENT_CODES.has(failure.code)
      ) {
        record.outcome_uncertain = true;
      }
      if (unclassified) {
        record.outcome_uncertain = true;
      }
      const shouldRetry = transient
        && (
          record.attempt_count < this.#maxAttempts
          || (
            record.outcome_uncertain
            && !record.reconciliation_probe_used
          )
        );
      if (shouldRetry) {
        const exponent = Math.max(0, record.attempt_count - 1);
        const delay = Math.min(
          this.#maxBackoffMs,
          this.#backoffBaseMs * (2 ** exponent),
        );
        record.state = 'retry_wait';
        record.available_at = timestampPlus(now, delay);
        record.last_error_code = failure.code;
      } else if (record.outcome_uncertain) {
        record.state = 'reconcile_required';
        record.available_at = null;
        record.last_error_code = 'delivery_outcome_ambiguous';
      } else {
        record.state = 'dead_letter';
        record.available_at = null;
        record.last_error_code = transient
          ? 'attempt_limit_reached'
          : 'unclassified_failure';
      }
      return safeItem(record);
    });
  }

  inspect(itemId, trustedContext) {
    assertIdentifier(itemId, 'item_id');
    const sessionUserId = assertTrustedContext(trustedContext);
    const record = this.#state.items.get(itemId);
    if (!record || record.enqueued_by_user_id !== sessionUserId) {
      return null;
    }
    return safeItem(record);
  }

  metrics(trustedContext) {
    const sessionUserId = assertTrustedContext(trustedContext);
    const counts = {
      pending: 0,
      claimed: 0,
      retry_wait: 0,
      acked: 0,
      conflict: 0,
      rejected: 0,
      reconcile_required: 0,
      dead_letter: 0,
    };
    for (const record of this.#state.items.values()) {
      if (record.enqueued_by_user_id === sessionUserId) {
        counts[record.state] += 1;
      }
    }
    return immutableClone({ total: Object.values(counts).reduce(
      (sum, value) => sum + value,
      0,
    ), ...counts });
  }
}

export function createIncrementAOutbox({ store, gateway }) {
  if (
    !(store instanceof InMemoryOutboxStore)
    || !gateway
    || typeof gateway.execute !== 'function'
  ) {
    throw new OutboxBoundaryError(
      'validation_failed',
      'Dependências do drainer inválidas.',
    );
  }

  return deepFreeze({
    drainOne(claimInput, trustedContext) {
      const sessionUserId = assertTrustedContext(trustedContext);
      const claim = store.claimNext(
        claimInput,
        { session_user_id: sessionUserId },
      );
      if (!claim) return null;

      try {
        const result = gateway.execute(
          claim.command,
          { session_user_id: claim.enqueued_by_user_id },
        );
        if (
          result
          && typeof result === 'object'
          && typeof result.then === 'function'
        ) {
          void Promise.resolve(result).catch(() => {});
          throw new Error('Async delivery is outside this local slice.');
        }
        return store.settleGatewayResult(
          claim.item_id,
          claim.lease_id,
          result,
          { session_user_id: sessionUserId },
        );
      } catch (error) {
        const failure = error instanceof OutboxTransientError
          ? { kind: 'transient', code: error.code }
          : { kind: 'unclassified', code: 'unclassified_failure' };
        return store.settleFailure(
          claim.item_id,
          claim.lease_id,
          failure,
          { session_user_id: sessionUserId },
        );
      }
    },
  });
}
