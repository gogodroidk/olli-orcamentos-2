import {
  ContractError,
  authorizeCommand,
  validateClient,
  validateCommand,
  validateCommandResult,
  validateLocation,
  validateMembership,
  validateOrganization,
} from '../../JANELA_2_1/contracts/tenancy-contract.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const TRUSTED_CONTEXT_KEYS = Object.freeze(['session_user_id']);
const MEMBERSHIP_STATUSES = new Set(['active', 'revoked']);
const DOMAIN_REJECTION_CODES = new Set([
  'authorization_denied',
  'authorization_revoked',
  'co_tenancy_violation',
  'expected_version_mismatch',
  'validation_failed',
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

function mapKey(...parts) {
  return parts.join('\u0000');
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
    organizations: cloneMap(source.organizations),
    memberships: cloneMap(source.memberships),
    clients: cloneMap(source.clients),
    locations: cloneMap(source.locations),
    ledger: cloneMap(source.ledger),
    commandIds: cloneMap(source.commandIds),
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
    throw new GatewayBoundaryError(
      'validation_failed',
      `${label} recusado pelo contrato.`,
    );
  }
}

function assertTrustedContext(value) {
  assertPlainObject(value, 'Contexto confiável');
  const keys = Object.keys(value).sort();
  if (
    keys.length !== TRUSTED_CONTEXT_KEYS.length
    || keys.some((key, index) => key !== TRUSTED_CONTEXT_KEYS[index])
    || typeof value.session_user_id !== 'string'
    || !IDENTIFIER.test(value.session_user_id)
  ) {
    throw new GatewayBoundaryError(
      'validation_failed',
      'Contexto confiável recusado pelo contrato.',
    );
  }
  return value.session_user_id;
}

function assertServerTimestamp(value) {
  const parsed = Date.parse(value);
  if (
    typeof value !== 'string'
    || !Number.isFinite(parsed)
    || new Date(parsed).toISOString() !== value
  ) {
    throw new GatewayBoundaryError(
      'validation_failed',
      'Relógio canônico inválido.',
    );
  }
  return value;
}

function canWrite(membership) {
  if (['owner', 'admin', 'manager'].includes(membership.role)) {
    return true;
  }
  return membership.role === 'technician'
    && membership.capabilities.includes('clients_locations.write');
}

function resultFor(command, {
  state,
  code,
  canonicalVersion = null,
  replayed = false,
}) {
  return validateCommandResult({
    command_id: command.command_id,
    idempotency_key: command.idempotency_key,
    organization_id: command.organization_id,
    aggregate_type: command.aggregate_type,
    aggregate_id: command.aggregate_id,
    state,
    code,
    canonical_version: canonicalVersion,
    replayed,
  });
}

function rejectedResult(command, code) {
  return resultFor(command, {
    state: 'rejected',
    code,
    canonicalVersion: null,
    replayed: false,
  });
}

function conflictResult(command, canonicalVersion) {
  return resultFor(command, {
    state: 'conflict',
    code: 'expected_version_mismatch',
    canonicalVersion,
    replayed: false,
  });
}

function appliedResult(command, canonicalVersion) {
  return resultFor(command, {
    state: 'acked',
    code: 'applied',
    canonicalVersion,
    replayed: false,
  });
}

function replayResult(command, entry) {
  if (entry.safe_result.state === 'acked') {
    return resultFor(command, {
      state: 'acked',
      code: 'idempotent_replay',
      canonicalVersion: entry.safe_result.canonical_version,
      replayed: true,
    });
  }
  return resultFor(command, {
    state: entry.safe_result.state,
    code: entry.safe_result.code,
    canonicalVersion: entry.safe_result.canonical_version,
    replayed: false,
  });
}

function baseAuthorization(state, command, sessionUserId) {
  const organizationEntry = state.organizations.get(
    command.organization_id,
  );
  if (
    !organizationEntry
    || organizationEntry.record.status !== 'active'
    || organizationEntry.v2_commands_enabled !== true
  ) {
    return { result: rejectedResult(command, 'authorization_denied') };
  }

  const membership = state.memberships.get(
    mapKey(command.organization_id, sessionUserId),
  );
  if (!membership) {
    return { result: rejectedResult(command, 'authorization_denied') };
  }

  const validatedMembership = validateMembership(membership);
  if (validatedMembership.status !== 'active') {
    return { result: rejectedResult(command, 'authorization_revoked') };
  }
  if (!canWrite(validatedMembership)) {
    return { result: rejectedResult(command, 'authorization_denied') };
  }

  return { membership: validatedMembership };
}

function canonicalContext(state, command, membership, sessionUserId) {
  const existingAggregate = command.aggregate_type === 'client'
    ? state.clients.get(command.aggregate_id) ?? null
    : state.locations.get(command.aggregate_id) ?? null;

  if (
    command.operation.startsWith('update_')
    && existingAggregate === null
  ) {
    return {
      result: rejectedResult(command, 'authorization_denied'),
      existingAggregate,
    };
  }

  let parentClient;
  if (command.operation === 'create_location') {
    parentClient = state.clients.get(command.payload.client_id) ?? null;
  }

  try {
    authorizeCommand(command, {
      session_user_id: sessionUserId,
      membership,
      existing_aggregate: existingAggregate,
      parent_client: parentClient,
    });
    return { existingAggregate, parentClient };
  } catch (error) {
    const rawCode = error instanceof ContractError
      ? error.code
      : 'validation_failed';
    const code = DOMAIN_REJECTION_CODES.has(rawCode)
      ? rawCode
      : 'validation_failed';

    if (
      code === 'expected_version_mismatch'
      && existingAggregate
      && Number.isInteger(existingAggregate.version)
      && existingAggregate.version > 0
    ) {
      return {
        result: conflictResult(command, existingAggregate.version),
        existingAggregate,
        parentClient,
      };
    }
    return {
      result: rejectedResult(command, code),
      existingAggregate,
      parentClient,
    };
  }
}

function applyCommand(
  state,
  command,
  existingAggregate,
  serverTimestamp,
) {
  if (command.operation === 'create_client') {
    const client = validateClient({
      organization_id: command.organization_id,
      client_id: command.aggregate_id,
      display_name: command.payload.display_name,
      status: command.payload.status,
      version: 1,
      updated_at: serverTimestamp,
    });
    state.clients.set(client.client_id, client);
    return client.version;
  }

  if (command.operation === 'update_client') {
    const client = validateClient({
      ...existingAggregate,
      ...command.payload,
      version: existingAggregate.version + 1,
      updated_at: serverTimestamp,
    });
    state.clients.set(client.client_id, client);
    return client.version;
  }

  if (command.operation === 'create_location') {
    const location = validateLocation({
      organization_id: command.organization_id,
      location_id: command.aggregate_id,
      client_id: command.payload.client_id,
      label: command.payload.label,
      status: command.payload.status,
      version: 1,
      updated_at: serverTimestamp,
    });
    state.locations.set(location.location_id, location);
    return location.version;
  }

  const location = validateLocation({
    ...existingAggregate,
    ...command.payload,
    version: existingAggregate.version + 1,
    updated_at: serverTimestamp,
  });
  state.locations.set(location.location_id, location);
  return location.version;
}

function recordLedger(
  state,
  command,
  commandHash,
  actorUserId,
  safeResult,
  serverTimestamp,
) {
  const key = mapKey(
    command.organization_id,
    command.idempotency_key,
  );
  if (
    state.ledger.has(key)
    || state.commandIds.has(command.command_id)
  ) {
    throw new GatewayBoundaryError(
      'validation_failed',
      'Identidade canônica do comando já reservada.',
    );
  }
  state.ledger.set(key, {
    command_id: command.command_id,
    organization_id: command.organization_id,
    idempotency_key: command.idempotency_key,
    command_hash: commandHash,
    actor_user_id: actorUserId,
    operation: command.operation,
    aggregate_type: command.aggregate_type,
    aggregate_id: command.aggregate_id,
    safe_result: structuredClone(safeResult),
    created_at: serverTimestamp,
  });
  state.commandIds.set(command.command_id, key);
}

export class GatewayBoundaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GatewayBoundaryError';
    this.code = code;
    this.safe_result = deepFreeze({
      state: 'rejected',
      code,
    });
  }
}

export class InMemoryGatewayStore {
  #state;
  #transactionOpen = false;

  constructor(seed) {
    assertPlainObject(seed, 'Seed');
    this.#state = {
      organizations: new Map(),
      memberships: new Map(),
      clients: new Map(),
      locations: new Map(),
      ledger: new Map(),
      commandIds: new Map(),
    };

    for (const source of seed.organizations ?? []) {
      const {
        v2_commands_enabled: commandsEnabled,
        ...organizationInput
      } = source;
      const organization = validateOrganization(organizationInput);
      if (
        typeof commandsEnabled !== 'boolean'
        || this.#state.organizations.has(organization.organization_id)
      ) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Seed de organização inválido.',
        );
      }
      this.#state.organizations.set(organization.organization_id, {
        record: organization,
        v2_commands_enabled: commandsEnabled,
      });
    }

    for (const source of seed.memberships ?? []) {
      const membership = validateMembership(source);
      const key = mapKey(
        membership.organization_id,
        membership.user_id,
      );
      if (this.#state.memberships.has(key)) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Seed de membership duplicado.',
        );
      }
      this.#state.memberships.set(key, membership);
    }

    for (const source of seed.clients ?? []) {
      const client = validateClient(source);
      if (this.#state.clients.has(client.client_id)) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Seed de cliente duplicado.',
        );
      }
      this.#state.clients.set(client.client_id, client);
    }

    for (const source of seed.locations ?? []) {
      const parentClient = this.#state.clients.get(source.client_id);
      const location = validateLocation(source, parentClient);
      if (this.#state.locations.has(location.location_id)) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Seed de local duplicado.',
        );
      }
      this.#state.locations.set(location.location_id, location);
    }
  }

  transaction(work) {
    if (this.#transactionOpen) {
      throw new GatewayBoundaryError(
        'validation_failed',
        'Transação aninhada recusada.',
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
        throw new GatewayBoundaryError(
          'validation_failed',
          'Transação assíncrona recusada pelo store local.',
        );
      }
      let safeResult;
      let committedState;
      try {
        safeResult = immutableClone(result);
        committedState = cloneState(draft);
      } catch (error) {
        if (error instanceof GatewayBoundaryError) {
          throw error;
        }
        throw new GatewayBoundaryError(
          'validation_failed',
          'Resultado transacional não serializável.',
        );
      }
      this.#state = committedState;
      return safeResult;
    } finally {
      this.#transactionOpen = false;
    }
  }

  inspectClient(clientId) {
    const value = this.#state.clients.get(clientId);
    return value ? immutableClone(value) : null;
  }

  inspectLocation(locationId) {
    const value = this.#state.locations.get(locationId);
    return value ? immutableClone(value) : null;
  }

  inspectLedger(organizationId, idempotencyKey) {
    const value = this.#state.ledger.get(
      mapKey(organizationId, idempotencyKey),
    );
    return value ? immutableClone(value) : null;
  }

  get ledgerSize() {
    return this.#state.ledger.size;
  }

  setMembershipStatus(
    organizationId,
    userId,
    status,
    updatedAt,
  ) {
    if (!MEMBERSHIP_STATUSES.has(status)) {
      throw new GatewayBoundaryError(
        'validation_failed',
        'Status de membership inválido.',
      );
    }
    return this.transaction((draft) => {
      const key = mapKey(organizationId, userId);
      const membership = draft.memberships.get(key);
      if (!membership) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Membership canônica ausente.',
        );
      }
      const next = validateMembership({
        ...membership,
        status,
        membership_version: membership.membership_version + 1,
        updated_at: updatedAt,
      });
      draft.memberships.set(key, next);
      return next;
    });
  }

  setOrganizationFlag(organizationId, enabled) {
    if (typeof enabled !== 'boolean') {
      throw new GatewayBoundaryError(
        'validation_failed',
        'Flag canônica inválida.',
      );
    }
    return this.transaction((draft) => {
      const organization = draft.organizations.get(organizationId);
      if (!organization) {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Organização canônica ausente.',
        );
      }
      organization.v2_commands_enabled = enabled;
      return {
        organization_id: organizationId,
        v2_commands_enabled: enabled,
      };
    });
  }

  snapshotCounts() {
    return deepFreeze({
      organizations: this.#state.organizations.size,
      memberships: this.#state.memberships.size,
      clients: this.#state.clients.size,
      locations: this.#state.locations.size,
      ledger: this.#state.ledger.size,
    });
  }
}

export function createIncrementAGateway({ store, clock }) {
  if (
    !(store instanceof InMemoryGatewayStore)
    || typeof clock !== 'function'
  ) {
    throw new GatewayBoundaryError(
      'validation_failed',
      'Dependências do gateway inválidas.',
    );
  }

  return deepFreeze({
    execute(untrustedCommand, trustedContext) {
      let validated;
      try {
        validated = validateCommand(untrustedCommand);
      } catch {
        throw new GatewayBoundaryError(
          'validation_failed',
          'Comando recusado pelo contrato de entrada.',
        );
      }
      const sessionUserId = assertTrustedContext(trustedContext);
      const { command, command_hash: commandHash } = validated;

      return store.transaction((state) => {
        const base = baseAuthorization(
          state,
          command,
          sessionUserId,
        );
        if (base.result) {
          return base.result;
        }

        const ledgerKey = mapKey(
          command.organization_id,
          command.idempotency_key,
        );
        const previous = state.ledger.get(ledgerKey);
        if (previous) {
          if (previous.actor_user_id !== sessionUserId) {
            return rejectedResult(
              command,
              'authorization_denied',
            );
          }
          if (previous.command_hash === commandHash) {
            return replayResult(command, previous);
          }
          return rejectedResult(
            command,
            'idempotency_key_reused',
          );
        }

        if (state.commandIds.has(command.command_id)) {
          return rejectedResult(
            command,
            'validation_failed',
          );
        }

        const domain = canonicalContext(
          state,
          command,
          base.membership,
          sessionUserId,
        );
        const serverTimestamp = assertServerTimestamp(clock());
        if (domain.result) {
          recordLedger(
            state,
            command,
            commandHash,
            sessionUserId,
            domain.result,
            serverTimestamp,
          );
          return domain.result;
        }

        const canonicalVersion = applyCommand(
          state,
          command,
          domain.existingAggregate,
          serverTimestamp,
        );
        const result = appliedResult(
          command,
          canonicalVersion,
        );
        recordLedger(
          state,
          command,
          commandHash,
          sessionUserId,
          result,
          serverTimestamp,
        );
        return result;
      });
    },
  });
}
