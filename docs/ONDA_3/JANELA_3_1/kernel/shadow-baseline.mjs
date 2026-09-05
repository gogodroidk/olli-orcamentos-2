import { createHash } from 'node:crypto';

import { projectV2ToLegacy } from '../../../ONDA_2/JANELA_2_5/shadow/increment-a-shadow-pilot.mjs';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const RFC3339_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TYPES = new Set(['organization', 'client', 'location', 'equipment']);
const EQUIPMENT_KEYS = Object.freeze([
  'organization_id', 'equipment_id', 'client_id', 'location_id',
  'category', 'label', 'status', 'version', 'updated_at',
]);
const ORGANIZATION_KEYS = Object.freeze([
  'organization_id', 'display_name', 'status', 'version', 'created_at', 'updated_at',
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message) { throw new TypeError(message); }

function exactKeys(value, expected, label) {
  if (!plain(value)) fail(`${label} deve ser objeto simples.`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) fail(`${label} possui campos fora da allowlist.`);
  const actual = ownKeys.sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    fail(`${label} possui campos fora da allowlist.`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) fail(`${label} inválido.`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) fail(`${label} inválido.`);
  return value;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('version inválida.');
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !RFC3339_UTC_MILLIS.test(value)) {
    fail(`${label} deve ser RFC 3339 UTC com milissegundos.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${label} contém data calendária impossível.`);
  }
  return value;
}

function uniqueByScope(values, identityKey, label) {
  const seen = new Set();
  for (const value of values) {
    const scopedIdentity = `${value.organization_id}\u0000${value[identityKey]}`;
    if (seen.has(scopedIdentity)) fail(`${label} duplicado no escopo da organização.`);
    seen.add(scopedIdentity);
  }
}

function uniqueAggregateProjections(values) {
  const seen = new Set();
  for (const value of values) {
    const scopedIdentity = `${value.organization_id}\u0000${value.aggregate_type}\u0000${value.aggregate_id}`;
    if (seen.has(scopedIdentity)) fail('aggregate_id duplicado para o mesmo tipo e organização.');
    seen.add(scopedIdentity);
  }
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function validateOrganization(input) {
  exactKeys(input, ORGANIZATION_KEYS, 'Organização');
  id(input.organization_id, 'organization_id');
  text(input.display_name, 'display_name');
  if (!['active', 'inactive'].includes(input.status)) fail('status de organização inválido.');
  version(input.version);
  timestamp(input.created_at, 'created_at');
  timestamp(input.updated_at, 'updated_at');
  if (Date.parse(input.updated_at) < Date.parse(input.created_at)) {
    fail('updated_at de organização anterior a created_at.');
  }
  return deepFreeze({ ...input });
}

function validateEquipment(input) {
  exactKeys(input, EQUIPMENT_KEYS, 'Equipamento');
  id(input.organization_id, 'organization_id');
  id(input.equipment_id, 'equipment_id');
  id(input.client_id, 'client_id');
  id(input.location_id, 'location_id');
  text(input.category, 'category');
  text(input.label, 'label');
  if (!['active', 'inactive'].includes(input.status)) fail('status de equipamento inválido.');
  version(input.version);
  timestamp(input.updated_at, 'updated_at');
  return deepFreeze({ ...input });
}

function projectOrganization(input) {
  const organization = validateOrganization(input);
  return deepFreeze({
    schema_version: 1,
    organization_id: organization.organization_id,
    aggregate_type: 'organization',
    aggregate_id: organization.organization_id,
    aggregate_version: organization.version,
    display_name: organization.display_name,
    status: organization.status,
    updated_at: organization.updated_at,
  });
}

function projectEquipment(input, parents) {
  const equipment = validateEquipment(input);
  const client = parents.clients.get(equipment.client_id);
  const location = parents.locations.get(equipment.location_id);
  if (!client || client.organization_id !== equipment.organization_id) fail('equipamento fora do tenant do cliente.');
  if (!location || location.organization_id !== equipment.organization_id || location.client_id !== equipment.client_id) {
    fail('equipamento fora do local do cliente.');
  }
  return deepFreeze({
    schema_version: 1,
    organization_id: equipment.organization_id,
    aggregate_type: 'equipment',
    aggregate_id: equipment.equipment_id,
    aggregate_version: equipment.version,
    client_id: equipment.client_id,
    location_id: equipment.location_id,
    category: equipment.category,
    label: equipment.label,
    status: equipment.status,
    updated_at: equipment.updated_at,
  });
}

export function projectAggregate(type, input, parents = { clients: new Map(), locations: new Map() }) {
  if (!TYPES.has(type)) fail('tipo de agregado não permitido.');
  if (type === 'organization') return projectOrganization(input);
  if (type === 'equipment') return projectEquipment(input, parents);
  return deepFreeze(projectV2ToLegacy(type, input, type === 'location' ? parents.clients.get(input.client_id) : null));
}

export function createShadowBaseline({ organization, clients, locations, equipment }) {
  const org = validateOrganization(organization);
  if (!Array.isArray(clients) || !Array.isArray(locations) || !Array.isArray(equipment)) fail('coleções inválidas.');
  if (org.status !== 'active') fail('organização inativa não pode iniciar baseline.');
  const clientValues = clients.map((item) => {
    const value = projectV2ToLegacy('client', item);
    if (value.organization_id !== org.organization_id) fail('cliente fora do tenant.');
    return deepFreeze({ ...item });
  });
  uniqueByScope(clientValues, 'client_id', 'client_id');
  const clientMap = new Map(clientValues.map((item) => [item.client_id, item]));
  const locationValues = locations.map((item) => {
    const client = clientMap.get(item.client_id);
    if (!client || client.organization_id !== org.organization_id) fail('local fora do tenant do cliente.');
    projectV2ToLegacy('location', item, client);
    return deepFreeze({ ...item });
  });
  uniqueByScope(locationValues, 'location_id', 'location_id');
  const locationMap = new Map(locationValues.map((item) => [item.location_id, item]));
  const parents = { clients: clientMap, locations: locationMap };
  const equipmentValues = equipment.map(validateEquipment);
  uniqueByScope(equipmentValues, 'equipment_id', 'equipment_id');
  const projections = [
    projectOrganization(org),
    ...clientValues.map((item) => projectAggregate('client', item)),
    ...locationValues.map((item) => projectAggregate('location', item, parents)),
    ...equipmentValues.map((item) => projectEquipment(item, parents)),
  ];
  uniqueAggregateProjections(projections);
  const decisions = projections.map((projection) => deepFreeze({
    aggregate_type: projection.aggregate_type,
    aggregate_id: projection.aggregate_id,
    decision: 'projected_local_only',
    projection_digest: digest(projection),
  }));
  return deepFreeze({
    organization: org,
    clients: clientValues,
    locations: locationValues,
    equipment: equipmentValues,
    projections,
    decisions,
  });
}

export const SHADOW_CONTRACT_LIMITS = deepFreeze({
  state: 'local_synthetic_only',
  writes: 'none',
  network: false,
  runtime_imports: false,
  source_of_truth: 'fixture_input',
});
