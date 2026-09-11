import { createHash } from 'node:crypto';

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertIdentifier(value, field) {
  invariant(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(value), `${field} inválido`);
  return value;
}

export function assertIsoDate(value, field) {
  invariant(typeof value === 'string' && Number.isFinite(Date.parse(value)), `${field} deve ser ISO válido`);
  return value;
}

export function canonicalize(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `${path} contém número não finito`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  invariant(isPlainObject(value), `${path} deve conter somente JSON simples`);

  const output = {};
  for (const key of Object.keys(value).sort()) {
    invariant(value[key] !== undefined, `${path}.${key} não pode ser undefined`);
    output[key] = canonicalize(value[key], `${path}.${key}`);
  }
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value) {
  const source = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

export function jsonByteLength(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function immutableJson(value) {
  return deepFreeze(canonicalize(value));
}

export function assertSha256(value, field) {
  invariant(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), `${field} deve ser SHA-256 hexadecimal`);
  return value;
}

