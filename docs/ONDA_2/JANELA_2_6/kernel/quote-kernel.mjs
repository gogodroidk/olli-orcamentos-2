import { createHash } from 'node:crypto';

export const HASH_ALGORITHM = 'olli-document-sha256-v2';
export const QUOTE_SCHEMA = 'quote@1';
export const POLICY_VERSION = 'quote-acceptance@1';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const PUBLIC_KEYS = new Set(['quoteId', 'title', 'issuedAt', 'expiresAt', 'issuer', 'recipient', 'items', 'totals', 'terms']);

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, allowed, label) {
  invariant(plain(value), `${label} deve ser objeto simples`);
  for (const key of Object.keys(value)) invariant(allowed.includes(key), `${label}.${key} não é permitido`);
}

function id(value, label) {
  invariant(typeof value === 'string' && ID.test(value), `${label} inválido`);
  return value;
}

function text(value, label, { optional = false, nullable = false, max = 4000 } = {}) {
  if (optional && value === undefined) return undefined;
  if (nullable && value === null) return null;
  invariant(typeof value === 'string' && value.normalize('NFC').trim().length > 0 && value.length <= max, `${label} inválido`);
  return value.normalize('NFC');
}

function utc(value, label) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), `${label} deve usar UTC com milissegundos`);
  const parsed = new Date(value);
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} inválida`);
  return value;
}

function cents(value, label) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} deve ser centavos inteiros não negativos`);
  return value;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function emptyMap() {
  return Object.create(null);
}

function mapWith(entries, key, value) {
  const copy = Object.assign(emptyMap(), entries);
  copy[key] = value;
  return copy;
}

function own(entries, key) {
  return Object.hasOwn(entries, key);
}

export function canonicalize(value, path = '$') {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    invariant(Number.isFinite(value) && !Object.is(value, -0), `${path} contém número inválido`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  invariant(plain(value), `${path} deve conter somente JSON simples`);
  const normalizedKeys = Object.keys(value).map((key) => ({ original: key, normalized: key.normalize('NFC') }));
  const seen = new Set();
  for (const key of normalizedKeys) {
    invariant(!seen.has(key.normalized), `${path} contém chaves NFC ambíguas`);
    seen.add(key.normalized);
  }
  const result = {};
  for (const { original, normalized } of normalizedKeys.sort((a, b) => (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0))) {
    const key = original;
    invariant(value[key] !== undefined, `${path}.${key} não pode ser undefined`);
    result[normalized] = canonicalize(value[key], `${path}.${key}`);
  }
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}

function evidenceRefs(input) {
  invariant(Array.isArray(input), 'evidenceRefs deve ser array');
  const normalized = input.map((entry, index) => {
    exactKeys(entry, ['evidenceRefId', 'digestAlgorithm', 'digestSha256', 'mimeType', 'sizeBytes'], `evidenceRefs[${index}]`);
    id(entry.evidenceRefId, `evidenceRefs[${index}].evidenceRefId`);
    invariant(entry.digestAlgorithm === 'sha256', 'evidenceRefs.digestAlgorithm deve ser sha256');
    invariant(typeof entry.digestSha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.digestSha256), 'evidenceRefs.digestSha256 inválido');
    text(entry.mimeType, 'evidenceRefs.mimeType', { max: 128 });
    invariant(Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes > 0, 'evidenceRefs.sizeBytes inválido');
    return { ...entry };
  });
  const byCodePoint = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
  const sorted = [...normalized].sort((a, b) => byCodePoint(a.evidenceRefId, b.evidenceRefId) || byCodePoint(a.digestSha256, b.digestSha256));
  invariant(new Set(sorted.map((ref) => ref.evidenceRefId)).size === sorted.length, 'evidenceRefs duplicada');
  return sorted;
}

function publicSnapshot(draft) {
  exactKeys(draft, ['quoteId', 'title', 'issuedAt', 'expiresAt', 'issuer', 'recipient', 'items', 'totals', 'terms', 'private'], 'draft');
  id(draft.quoteId, 'draft.quoteId');
  text(draft.title, 'draft.title');
  utc(draft.issuedAt, 'draft.issuedAt');
  utc(draft.expiresAt, 'draft.expiresAt');
  invariant(draft.expiresAt >= draft.issuedAt, 'draft.expiresAt não pode preceder issuedAt');
  exactKeys(draft.issuer, ['displayName', 'documentNumber'], 'draft.issuer');
  text(draft.issuer.displayName, 'draft.issuer.displayName');
  text(draft.issuer.documentNumber, 'draft.issuer.documentNumber', { optional: true, nullable: true, max: 32 });
  exactKeys(draft.recipient, ['name', 'email'], 'draft.recipient');
  text(draft.recipient.name, 'draft.recipient.name');
  text(draft.recipient.email, 'draft.recipient.email', { optional: true, nullable: true, max: 254 });
  invariant(Array.isArray(draft.items) && draft.items.length > 0, 'draft.items obrigatório');
  const items = draft.items.map((item, index) => {
    exactKeys(item, ['description', 'quantity', 'unitPriceCents', 'totalCents'], `draft.items[${index}]`);
    text(item.description, `draft.items[${index}].description`, { max: 1000 });
    invariant(Number.isSafeInteger(item.quantity) && item.quantity > 0, 'quantity deve ser inteiro positivo');
    cents(item.unitPriceCents, 'unitPriceCents');
    cents(item.totalCents, 'totalCents');
    invariant(item.totalCents === item.quantity * item.unitPriceCents, 'totalCents divergente');
    return { ...item };
  });
  exactKeys(draft.totals, ['currency', 'totalCents'], 'draft.totals');
  invariant(draft.totals.currency === 'BRL', 'somente BRL é suportado no quote@1');
  cents(draft.totals.totalCents, 'draft.totals.totalCents');
  invariant(draft.totals.totalCents === items.reduce((sum, item) => sum + item.totalCents, 0), 'total do orçamento divergente');
  text(draft.terms, 'draft.terms', { optional: true, nullable: true, max: 8000 });
  if (draft.private !== undefined) {
    exactKeys(draft.private, ['costCents', 'marginCents', 'overheadCents', 'score', 'discountRule', 'note', 'secret', 'modelPrompt'], 'draft.private');
  }
  const snapshot = { quoteId: draft.quoteId, title: draft.title, issuedAt: draft.issuedAt, expiresAt: draft.expiresAt, issuer: draft.issuer, recipient: draft.recipient, items, totals: draft.totals };
  if (draft.terms !== undefined) snapshot.terms = draft.terms;
  return canonicalize(snapshot);
}

export function createDraft({ tenantId, draftId, quote }) {
  id(tenantId, 'tenantId');
  id(draftId, 'draftId');
  const snapshot = publicSnapshot(quote);
  return freeze({ tenantId, draftId, quote: canonicalize(quote), publicPreview: snapshot, status: 'draft' });
}

export function documentEnvelope({ tenantId, documentVersionId, snapshot, evidenceRefs: refs, supersedesDocumentVersionId = null }) {
  id(tenantId, 'tenantId');
  id(documentVersionId, 'documentVersionId');
  if (supersedesDocumentVersionId !== null) id(supersedesDocumentVersionId, 'supersedesDocumentVersionId');
  const safeSnapshot = publicSnapshot(snapshot);
  const normalizedRefs = evidenceRefs(refs);
  const envelope = {
    hashAlgorithm: HASH_ALGORITHM,
    tenantId,
    documentVersionId,
    schemaCode: QUOTE_SCHEMA,
    schemaVersion: 1,
    acceptancePolicyVersion: POLICY_VERSION,
    supersedesDocumentVersionId,
    snapshot: safeSnapshot,
    evidenceRefs: normalizedRefs,
  };
  return freeze(canonicalize(envelope));
}

function contextOk(context, draft) {
  exactKeys(context, ['tenantId', 'actorId', 'capabilities', 'commandId', 'documentVersionId', 'eventId', 'now', 'evidenceRefs'], 'context');
  invariant(context.tenantId === draft.tenantId, 'cross-tenant publication denied');
  id(context.actorId, 'context.actorId'); id(context.commandId, 'context.commandId'); id(context.documentVersionId, 'context.documentVersionId'); id(context.eventId, 'context.eventId'); utc(context.now, 'context.now');
  invariant(Array.isArray(context.capabilities) && context.capabilities.includes('quote.publish'), 'capability quote.publish obrigatória');
}

export function emptyState() {
  return freeze({ drafts: emptyMap(), versions: emptyMap(), events: [], idempotency: emptyMap() });
}

export function withDraft(state, draft) {
  invariant(state && plain(state.drafts), 'state inválido');
  invariant(!own(state.drafts, draft.draftId), 'draft duplicado');
  return freeze({ ...state, drafts: mapWith(state.drafts, draft.draftId, draft) });
}

export function publishQuote(state, { draftId, context, supersedesDocumentVersionId = null }) {
  id(draftId, 'draftId');
  const draft = own(state.drafts, draftId) ? state.drafts[draftId] : undefined;
  invariant(draft, 'draft inexistente ou não publicável');
  contextOk(context, draft);
  const intent = sha256({ draftId, tenantId: context.tenantId, actorId: context.actorId, documentVersionId: context.documentVersionId, eventId: context.eventId, evidenceRefs: context.evidenceRefs, supersedesDocumentVersionId });
  const tenantIdempotency = own(state.idempotency, context.tenantId) ? state.idempotency[context.tenantId] : emptyMap();
  const replay = own(tenantIdempotency, context.commandId) ? tenantIdempotency[context.commandId] : undefined;
  if (replay) {
    invariant(replay.intent === intent, 'commandId reutilizado com intenção divergente');
    return freeze({ state, result: replay.result, replayed: true });
  }
  invariant(draft.status === 'draft', 'draft inexistente ou não publicável');
  invariant(!own(state.versions, context.documentVersionId), 'documentVersionId já existe');
  invariant(!state.events.some((event) => event.tenantId === context.tenantId && event.eventId === context.eventId), 'eventId já existe neste tenant');
  if (supersedesDocumentVersionId !== null) {
    const previous = own(state.versions, supersedesDocumentVersionId) ? state.versions[supersedesDocumentVersionId] : undefined;
    invariant(previous && previous.tenantId === context.tenantId, 'retificação deve referenciar versão do mesmo tenant');
    invariant(previous.envelope.snapshot.quoteId === draft.quote.quoteId, 'retificação deve preservar o aggregate quoteId');
  }
  const envelope = documentEnvelope({ tenantId: context.tenantId, documentVersionId: context.documentVersionId, snapshot: draft.quote, evidenceRefs: context.evidenceRefs, supersedesDocumentVersionId });
  const canonicalHash = sha256(envelope);
  const version = freeze({ documentVersionId: context.documentVersionId, tenantId: context.tenantId, draftId, schemaCode: QUOTE_SCHEMA, schemaVersion: 1, acceptancePolicyVersion: POLICY_VERSION, status: 'awaiting_acceptance', canonicalHash, envelope, publishedAt: context.now, supersedesDocumentVersionId });
  const event = freeze({ eventId: context.eventId, type: 'document_version_published', tenantId: context.tenantId, actorId: context.actorId, documentVersionId: version.documentVersionId, canonicalHash, at: context.now });
  const result = freeze({ documentVersionId: version.documentVersionId, canonicalHash, status: version.status });
  const next = freeze({
    ...state,
    drafts: mapWith(state.drafts, draftId, freeze({ ...draft, status: 'published' })),
    versions: mapWith(state.versions, version.documentVersionId, version),
    events: [...state.events, event],
    idempotency: mapWith(state.idempotency, context.tenantId, mapWith(tenantIdempotency, context.commandId, freeze({ intent, result }))),
  });
  return freeze({ state: next, result, replayed: false });
}

export function verifyVersion(version) {
  invariant(version && version.schemaCode === QUOTE_SCHEMA, 'versão inválida');
  id(version.tenantId, 'version.tenantId');
  const reconstructed = documentEnvelope({
    tenantId: version.tenantId,
    documentVersionId: version.documentVersionId,
    snapshot: version.envelope?.snapshot,
    evidenceRefs: version.envelope?.evidenceRefs,
    supersedesDocumentVersionId: version.supersedesDocumentVersionId,
  });
  invariant(canonicalJson(version.envelope) === canonicalJson(reconstructed), 'envelope documental inválido');
  invariant(version.tenantId === version.envelope.tenantId, 'tenant documental divergente');
  invariant(version.schemaVersion === reconstructed.schemaVersion && version.acceptancePolicyVersion === reconstructed.acceptancePolicyVersion, 'metadados documentais divergentes');
  invariant(version.supersedesDocumentVersionId === version.envelope.supersedesDocumentVersionId, 'ligação de retificação divergente');
  invariant(version.canonicalHash === sha256(version.envelope), 'hash documental divergente');
  return true;
}

export function startRectification(state, { previousDocumentVersionId, draft }) {
  const previous = own(state.versions, previousDocumentVersionId) ? state.versions[previousDocumentVersionId] : undefined;
  invariant(previous && verifyVersion(previous), 'versão anterior inválida');
  invariant(draft.tenantId === previous.tenantId, 'retificação cross-tenant negada');
  return withDraft(state, draft);
}

export function publicVersion(version) {
  verifyVersion(version);
  for (const key of Object.keys(version.envelope.snapshot)) invariant(PUBLIC_KEYS.has(key), 'snapshot público inválido');
  return freeze({ documentVersionId: version.documentVersionId, canonicalHash: version.canonicalHash, schemaCode: version.schemaCode, schemaVersion: version.schemaVersion, acceptancePolicyVersion: version.acceptancePolicyVersion, snapshot: version.envelope.snapshot, evidenceRefs: version.envelope.evidenceRefs });
}
