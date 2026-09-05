import { createHash } from 'node:crypto';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const ROLES = new Set(['owner', 'admin', 'manager', 'technician', 'viewer']);
const MEMBERSHIP_STATUS = new Set(['active', 'revoked']);
const CAPABILITIES = new Set(['clients_locations.read', 'clients_locations.write']);
const ENTITY_STATUS = new Set(['active', 'inactive']);
const ORGANIZATION_STATUS = new Set(['active', 'suspended']);
const MAX_PAYLOAD_BYTES = 16 * 1024;
const RFC3339_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const COMMAND_KEYS = [
  'command_id',
  'idempotency_key',
  'protocol_version',
  'schema_version',
  'organization_id',
  'aggregate_type',
  'aggregate_id',
  'expected_version',
  'operation',
  'payload',
  'created_at_local',
  'device_id',
];

const OPERATION_RULES = Object.freeze({
  create_client: Object.freeze({
    aggregateType: 'client',
    create: true,
    payloadKeys: ['display_name', 'status'],
    requiredPayloadKeys: ['display_name', 'status'],
  }),
  update_client: Object.freeze({
    aggregateType: 'client',
    create: false,
    payloadKeys: ['display_name', 'status'],
    requiredPayloadKeys: [],
  }),
  create_location: Object.freeze({
    aggregateType: 'location',
    create: true,
    payloadKeys: ['client_id', 'label', 'status'],
    requiredPayloadKeys: ['client_id', 'label', 'status'],
  }),
  update_location: Object.freeze({
    aggregateType: 'location',
    create: false,
    payloadKeys: ['label', 'status'],
    requiredPayloadKeys: [],
  }),
});

export class ContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

function invariant(condition, code, message) {
  if (!condition) throw new ContractError(code, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, label) {
  invariant(isPlainObject(value), 'validation_failed', `${label} deve ser objeto JSON simples`);
}

function assertExactKeys(value, allowed, required, label) {
  assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    invariant(allowedSet.has(key), 'validation_failed', `${label}.${key} não pertence ao contrato`);
  }
  for (const key of required) {
    invariant(Object.hasOwn(value, key), 'validation_failed', `${label}.${key} obrigatório`);
  }
}

function assertIdentifier(value, label) {
  invariant(typeof value === 'string' && IDENTIFIER.test(value), 'validation_failed', `${label} inválido`);
  return value;
}

function assertIsoDate(value, label) {
  invariant(typeof value === 'string' && RFC3339_UTC_MILLIS.test(value), 'validation_failed', `${label} deve ser RFC 3339 UTC com milissegundos`);
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed) && new Date(parsed).toISOString() === value, 'validation_failed', `${label} contém data calendária impossível`);
  return value;
}

function assertNonEmptyText(value, label, maxLength = 160) {
  invariant(typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength, 'validation_failed', `${label} inválido`);
  return value.trim();
}

function canonicalize(value, label = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'validation_failed', `${label} contém número não finito`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${label}[${index}]`));
  assertPlainObject(value, label);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    invariant(value[key] !== undefined, 'validation_failed', `${label}.${key} não pode ser undefined`);
    output[key] = canonicalize(value[key], `${label}.${key}`);
  }
  return output;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function immutableJson(value) {
  return deepFreeze(canonicalize(value));
}

function normalizedKey(value) {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
}

function rejectAuthoritySecretsAndBlobs(value, label = 'payload', parentKey = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectAuthoritySecretsAndBlobs(item, `${label}[${index}]`, parentKey));
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === 'string') {
      invariant(!/^data:/i.test(value), 'validation_failed', `${label} contém data URI/blob`);
      invariant(!/^https?:\/\//i.test(value), 'validation_failed', `${label} contém URL pública não permitida`);
      invariant(!(value.length > 256 && /^[A-Za-z0-9+/=_-]+$/.test(value)), 'validation_failed', `${label} parece bytes/base64 embutido`);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    invariant(
      !/(actor|userid|role|capabilit|owner|audience|organizationid|tenantid|token|secret|password|authorization|cookie|apikey|credential|session|servicekey|blob|base64|bytes|attachment|file)/.test(normalized),
      'validation_failed',
      `${label}.${key} é autoridade, segredo ou blob proibido`,
    );
    rejectAuthoritySecretsAndBlobs(child, `${label}.${key}`, key || parentKey);
  }
}

export function validateOrganization(input) {
  const keys = ['organization_id', 'display_name', 'status', 'version', 'created_at', 'updated_at'];
  assertExactKeys(input, keys, keys, 'organization');
  assertIdentifier(input.organization_id, 'organization.organization_id');
  assertNonEmptyText(input.display_name, 'organization.display_name');
  invariant(ORGANIZATION_STATUS.has(input.status), 'validation_failed', 'organization.status inválido');
  invariant(Number.isInteger(input.version) && input.version > 0, 'validation_failed', 'organization.version inválida');
  assertIsoDate(input.created_at, 'organization.created_at');
  assertIsoDate(input.updated_at, 'organization.updated_at');
  invariant(Date.parse(input.updated_at) >= Date.parse(input.created_at), 'validation_failed', 'organization.updated_at anterior a created_at');
  return immutableJson(input);
}

export function validateMembership(input) {
  const keys = ['organization_id', 'user_id', 'role', 'status', 'capabilities', 'membership_version', 'updated_at'];
  assertExactKeys(input, keys, keys, 'membership');
  assertIdentifier(input.organization_id, 'membership.organization_id');
  assertIdentifier(input.user_id, 'membership.user_id');
  invariant(ROLES.has(input.role), 'validation_failed', 'membership.role desconhecido');
  invariant(MEMBERSHIP_STATUS.has(input.status), 'validation_failed', 'membership.status inválido');
  invariant(Array.isArray(input.capabilities), 'validation_failed', 'membership.capabilities deve ser array');
  invariant(new Set(input.capabilities).size === input.capabilities.length, 'validation_failed', 'membership.capabilities duplicada');
  for (const capability of input.capabilities) invariant(CAPABILITIES.has(capability), 'validation_failed', `capability desconhecida: ${capability}`);
  invariant(Number.isInteger(input.membership_version) && input.membership_version > 0, 'validation_failed', 'membership.membership_version inválida');
  assertIsoDate(input.updated_at, 'membership.updated_at');
  return immutableJson(input);
}

export function validateClient(input) {
  const keys = ['organization_id', 'client_id', 'display_name', 'status', 'version', 'updated_at'];
  assertExactKeys(input, keys, keys, 'client');
  assertIdentifier(input.organization_id, 'client.organization_id');
  assertIdentifier(input.client_id, 'client.client_id');
  assertNonEmptyText(input.display_name, 'client.display_name');
  invariant(ENTITY_STATUS.has(input.status), 'validation_failed', 'client.status inválido');
  invariant(Number.isInteger(input.version) && input.version > 0, 'validation_failed', 'client.version inválida');
  assertIsoDate(input.updated_at, 'client.updated_at');
  return immutableJson(input);
}

export function validateLocation(input, parentClient) {
  const keys = ['organization_id', 'location_id', 'client_id', 'label', 'status', 'version', 'updated_at'];
  assertExactKeys(input, keys, keys, 'location');
  assertIdentifier(input.organization_id, 'location.organization_id');
  assertIdentifier(input.location_id, 'location.location_id');
  assertIdentifier(input.client_id, 'location.client_id');
  assertNonEmptyText(input.label, 'location.label');
  invariant(ENTITY_STATUS.has(input.status), 'validation_failed', 'location.status inválido');
  invariant(Number.isInteger(input.version) && input.version > 0, 'validation_failed', 'location.version inválida');
  assertIsoDate(input.updated_at, 'location.updated_at');

  if (parentClient !== undefined) {
    const client = validateClient(parentClient);
    invariant(client.organization_id === input.organization_id, 'co_tenancy_violation', 'local e cliente pertencem a organizações diferentes');
    invariant(client.client_id === input.client_id, 'co_tenancy_violation', 'local referencia outro cliente');
  }
  return immutableJson(input);
}

function validatePayload(command, rule) {
  assertExactKeys(command.payload, rule.payloadKeys, rule.requiredPayloadKeys, `${command.operation}.payload`);
  invariant(Object.keys(command.payload).length > 0, 'validation_failed', `${command.operation}.payload vazio`);
  rejectAuthoritySecretsAndBlobs(command.payload);
  invariant(Buffer.byteLength(canonicalJson(command.payload), 'utf8') <= MAX_PAYLOAD_BYTES, 'validation_failed', `payload excede ${MAX_PAYLOAD_BYTES} bytes`);

  if (Object.hasOwn(command.payload, 'display_name')) assertNonEmptyText(command.payload.display_name, 'payload.display_name');
  if (Object.hasOwn(command.payload, 'label')) assertNonEmptyText(command.payload.label, 'payload.label');
  if (Object.hasOwn(command.payload, 'client_id')) assertIdentifier(command.payload.client_id, 'payload.client_id');
  if (Object.hasOwn(command.payload, 'status')) invariant(ENTITY_STATUS.has(command.payload.status), 'validation_failed', 'payload.status inválido');
}

export function commandHash(input) {
  const command = validateCommand(input, { includeHash: false });
  const digestInput = {
    protocol_version: command.protocol_version,
    schema_version: command.schema_version,
    organization_id: command.organization_id,
    aggregate_type: command.aggregate_type,
    aggregate_id: command.aggregate_id,
    expected_version: command.expected_version,
    operation: command.operation,
    payload: command.payload,
  };
  return createHash('sha256').update(canonicalJson(digestInput), 'utf8').digest('hex');
}

export function validateCommand(input, options = {}) {
  assertExactKeys(input, COMMAND_KEYS, COMMAND_KEYS, 'command');
  assertIdentifier(input.command_id, 'command.command_id');
  assertIdentifier(input.idempotency_key, 'command.idempotency_key');
  invariant(input.protocol_version === 1, 'validation_failed', 'protocol_version deve ser 1');
  invariant(input.schema_version === 1, 'validation_failed', 'schema_version deve ser 1');
  assertIdentifier(input.organization_id, 'command.organization_id');
  assertIdentifier(input.aggregate_id, 'command.aggregate_id');
  assertIdentifier(input.device_id, 'command.device_id');
  assertIsoDate(input.created_at_local, 'command.created_at_local');
  invariant(Number.isInteger(input.expected_version) && input.expected_version >= 0, 'validation_failed', 'expected_version inválida');

  const rule = OPERATION_RULES[input.operation];
  invariant(rule, 'validation_failed', 'operation desconhecida');
  invariant(input.aggregate_type === rule.aggregateType, 'validation_failed', 'operation e aggregate_type divergem');
  if (rule.create) invariant(input.expected_version === 0, 'validation_failed', 'create exige expected_version=0');
  else invariant(input.expected_version > 0, 'validation_failed', 'update exige expected_version positivo');
  validatePayload(input, rule);

  const output = immutableJson(input);
  if (options.includeHash === false) return output;
  return Object.freeze({ command: output, command_hash: commandHash(output) });
}

function roleCanWrite(membership) {
  if (membership.role === 'owner' || membership.role === 'admin' || membership.role === 'manager') return true;
  return membership.role === 'technician' && membership.capabilities.includes('clients_locations.write');
}

export function authorizeCommand(input, context) {
  const { command, command_hash } = validateCommand(input);
  assertPlainObject(context, 'authorization_context');
  assertIdentifier(context.session_user_id, 'authorization_context.session_user_id');
  const membership = validateMembership(context.membership);

  invariant(membership.user_id === context.session_user_id, 'authorization_denied', 'sessão e membership divergem');
  invariant(membership.organization_id === command.organization_id, 'authorization_denied', 'membership não pertence ao tenant do comando');
  invariant(membership.status === 'active', 'authorization_revoked', 'membership revogada');
  invariant(roleCanWrite(membership), 'authorization_denied', 'papel/capability sem escrita de cliente/local');

  if (context.existing_aggregate !== undefined && context.existing_aggregate !== null) {
    const existing = command.aggregate_type === 'client'
      ? validateClient(context.existing_aggregate)
      : validateLocation(context.existing_aggregate);
    invariant(existing.organization_id === command.organization_id, 'co_tenancy_violation', 'recurso de outro tenant');
    const existingId = command.aggregate_type === 'client' ? existing.client_id : existing.location_id;
    invariant(existingId === command.aggregate_id, 'authorization_denied', 'aggregate_id não corresponde ao recurso canônico');
    invariant(existing.version === command.expected_version, 'expected_version_mismatch', 'versão canônica divergente');
  } else {
    invariant(command.expected_version === 0, 'expected_version_mismatch', 'update exige recurso canônico existente');
  }

  if (command.operation === 'create_location') {
    invariant(context.parent_client, 'co_tenancy_violation', 'create_location exige cliente canônico');
    const parentClient = validateClient(context.parent_client);
    invariant(parentClient.organization_id === command.organization_id, 'co_tenancy_violation', 'cliente de outro tenant');
    invariant(parentClient.client_id === command.payload.client_id, 'co_tenancy_violation', 'client_id não corresponde ao cliente canônico');
  }

  return Object.freeze({ command, command_hash, membership });
}

export function validateCommandResult(input) {
  const keys = [
    'command_id', 'idempotency_key', 'organization_id', 'aggregate_type', 'aggregate_id',
    'state', 'code', 'canonical_version', 'replayed',
  ];
  assertExactKeys(input, keys, keys, 'command_result');
  for (const key of ['command_id', 'idempotency_key', 'organization_id', 'aggregate_id']) assertIdentifier(input[key], `command_result.${key}`);
  invariant(input.aggregate_type === 'client' || input.aggregate_type === 'location', 'validation_failed', 'command_result.aggregate_type inválido');
  invariant(['acked', 'conflict', 'rejected'].includes(input.state), 'validation_failed', 'command_result.state inválido');
  invariant([
    'applied', 'idempotent_replay', 'idempotency_key_reused', 'expected_version_mismatch',
    'authorization_denied', 'authorization_revoked', 'co_tenancy_violation', 'validation_failed',
  ].includes(input.code), 'validation_failed', 'command_result.code inválido');
  invariant(input.canonical_version === null || (Number.isInteger(input.canonical_version) && input.canonical_version > 0), 'validation_failed', 'canonical_version inválida');
  invariant(typeof input.replayed === 'boolean', 'validation_failed', 'replayed deve ser boolean');

  if (input.state === 'acked') {
    invariant(input.code === 'applied' || input.code === 'idempotent_replay', 'validation_failed', 'acked exige applied ou idempotent_replay');
    invariant(Number.isInteger(input.canonical_version) && input.canonical_version > 0, 'validation_failed', 'acked exige canonical_version');
    invariant(input.replayed === (input.code === 'idempotent_replay'), 'validation_failed', 'replayed diverge do código acked');
  } else if (input.state === 'conflict') {
    invariant(input.code === 'expected_version_mismatch', 'validation_failed', 'conflict exige expected_version_mismatch');
    invariant(Number.isInteger(input.canonical_version) && input.canonical_version > 0, 'validation_failed', 'conflict exige versão canônica atual');
    invariant(input.replayed === false, 'validation_failed', 'conflict fixture não pode alegar replay');
  } else {
    invariant([
      'idempotency_key_reused', 'authorization_denied', 'authorization_revoked',
      'co_tenancy_violation', 'validation_failed',
    ].includes(input.code), 'validation_failed', 'rejected exige código de rejeição');
    invariant(input.canonical_version === null, 'validation_failed', 'rejected exige canonical_version=null');
    invariant(input.replayed === false, 'validation_failed', 'rejected fixture não pode alegar replay');
  }
  return immutableJson(input);
}

function resultFromCommand(command, overrides) {
  return validateCommandResult({
    command_id: command.command_id,
    idempotency_key: command.idempotency_key,
    organization_id: command.organization_id,
    aggregate_type: command.aggregate_type,
    aggregate_id: command.aggregate_id,
    state: 'acked',
    code: 'applied',
    canonical_version: command.expected_version + 1,
    replayed: false,
    ...overrides,
  });
}

export class FixtureIdempotencyLedger {
  #entries = new Map();

  observe(input) {
    const { command, command_hash } = validateCommand(input);
    const key = `${command.organization_id}\u0000${command.idempotency_key}`;
    const existing = this.#entries.get(key);
    if (!existing) {
      const result = resultFromCommand(command);
      this.#entries.set(key, Object.freeze({ command_hash, result }));
      return result;
    }
    if (existing.command_hash === command_hash) {
      return resultFromCommand(command, {
        state: existing.result.state,
        code: 'idempotent_replay',
        canonical_version: existing.result.canonical_version,
        replayed: true,
      });
    }
    return resultFromCommand(command, {
      state: 'rejected',
      code: 'idempotency_key_reused',
      canonical_version: null,
      replayed: false,
    });
  }

  get size() {
    return this.#entries.size;
  }
}

export const CONTRACT_CONSTANTS = Object.freeze({
  protocolVersion: 1,
  schemaVersion: 1,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  operations: Object.freeze(Object.keys(OPERATION_RULES)),
});
