import { invariant, publicVersion, sha256, verifyVersion } from '../../JANELA_2_6/kernel/quote-kernel.mjs';

export const RENDER_SCHEMA = 'quote-render-fixture@1';
export const ACCEPTANCE_SCHEMA = 'quote-acceptance-record@1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, allowed, label) {
  invariant(plain(value), `${label} deve ser objeto simples`);
  for (const key of Object.keys(value)) invariant(allowed.includes(key), `${label}.${key} não é permitido`);
}
function id(value, label) { invariant(typeof value === 'string' && ID.test(value), `${label} inválido`); return value; }
function utc(value, label) {
  invariant(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), `${label} deve usar UTC com milissegundos`);
  const parsed = new Date(value); invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} inválida`); return value;
}
function text(value, label, { optional = false, max = 1000 } = {}) {
  if (optional && value === undefined) return undefined;
  invariant(typeof value === 'string' && value.normalize('NFC').trim().length > 0 && value.length <= max, `${label} inválido`); return value.normalize('NFC');
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
function emptyMap() { return Object.create(null); }
function mapWith(entries, key, value) { const copy = Object.assign(emptyMap(), entries); copy[key] = value; return copy; }
function own(entries, key) { return Object.hasOwn(entries, key); }
function trustedContext(context, capability) {
  exactKeys(context, ['tenantId', 'actorId', 'capabilities', 'commandId', 'eventId', 'now'], 'context');
  id(context.tenantId, 'context.tenantId'); id(context.actorId, 'context.actorId'); id(context.commandId, 'context.commandId'); id(context.eventId, 'context.eventId'); utc(context.now, 'context.now');
  invariant(Array.isArray(context.capabilities) && context.capabilities.includes(capability), `capability ${capability} obrigatória`);
}
function versionForTenant(version, tenantId) {
  invariant(verifyVersion(version), 'versão documental inválida'); invariant(version.tenantId === tenantId, 'cross-tenant denied'); return publicVersion(version);
}

export function renderFixture(version) {
  const document = publicVersion(version);
  const fixture = freeze({ renderSchema: RENDER_SCHEMA, documentVersionId: document.documentVersionId, canonicalHash: document.canonicalHash, schemaCode: document.schemaCode, schemaVersion: document.schemaVersion, acceptancePolicyVersion: document.acceptancePolicyVersion, snapshot: document.snapshot, evidenceRefs: document.evidenceRefs });
  return freeze({ ...fixture, renderHash: sha256(fixture) });
}
export function emptyAcceptanceState() { return freeze({ records: emptyMap(), supersessions: emptyMap(), events: [], idempotency: emptyMap() }); }
function tenantEntries(index, tenantId) { return own(index, tenantId) ? index[tenantId] : emptyMap(); }
function intentFor(kind, version, context, extra = {}) {
  return sha256({ kind, tenantId: context.tenantId, actorId: context.actorId, commandId: context.commandId, eventId: context.eventId, documentVersionId: version.documentVersionId, canonicalHash: version.canonicalHash, ...extra });
}
function decide(state, version, context, kind, { reason } = {}) {
  trustedContext(context, 'document.decide'); const document = versionForTenant(version, context.tenantId);
  const normalizedReason = kind === 'rejected' ? text(reason, 'reason', { max: 1000 }) : undefined;
  const intent = intentFor(kind, version, context, normalizedReason === undefined ? {} : { reason: normalizedReason }); const commands = tenantEntries(state.idempotency, context.tenantId); const replay = own(commands, context.commandId) ? commands[context.commandId] : undefined;
  if (replay) { invariant(replay.intent === intent, 'commandId reutilizado com intenção divergente'); return freeze({ state, result: replay.result, replayed: true }); }
  const records = tenantEntries(state.records, context.tenantId); const supersessions = tenantEntries(state.supersessions, context.tenantId);
  invariant(version.status === 'awaiting_acceptance', 'versão não aguarda decisão'); invariant(document.snapshot.expiresAt >= context.now, 'documento expirado'); invariant(!own(supersessions, document.documentVersionId), 'documento foi retificado');
  if (version.supersedesDocumentVersionId) {
    const supersession = own(supersessions, version.supersedesDocumentVersionId) ? supersessions[version.supersedesDocumentVersionId] : undefined;
    invariant(supersession && supersession.documentVersionId === document.documentVersionId && supersession.canonicalHash === document.canonicalHash, 'retificação ainda não registrada');
  }
  invariant(!own(records, document.documentVersionId), 'documento já decidido'); invariant(!state.events.some((event) => event.tenantId === context.tenantId && event.eventId === context.eventId), 'eventId já existe neste tenant');
  const record = freeze({ acceptanceSchema: ACCEPTANCE_SCHEMA, decision: kind, documentVersionId: document.documentVersionId, canonicalHash: document.canonicalHash, tenantId: context.tenantId, actorId: context.actorId, method: 'simple_confirmation', affirmed: kind === 'accepted', ...(normalizedReason === undefined ? {} : { reason: normalizedReason }), decidedAt: context.now });
  const event = freeze({ eventId: context.eventId, type: `document_${kind}`, tenantId: context.tenantId, actorId: context.actorId, documentVersionId: document.documentVersionId, canonicalHash: document.canonicalHash, at: context.now });
  const result = freeze({ documentVersionId: document.documentVersionId, canonicalHash: document.canonicalHash, decision: kind });
  const next = freeze({ ...state, records: mapWith(state.records, context.tenantId, mapWith(records, document.documentVersionId, record)), events: [...state.events, event], idempotency: mapWith(state.idempotency, context.tenantId, mapWith(commands, context.commandId, freeze({ intent, result })) ) });
  return freeze({ state: next, result, replayed: false });
}
export function recordAcceptance(state, version, context) { return decide(state, version, context, 'accepted'); }
export function recordRejection(state, version, context, { reason } = {}) { return decide(state, version, context, 'rejected', { reason }); }
export function recordRectification(state, { previousVersion, nextVersion, context }) {
  trustedContext(context, 'document.rectify'); const previous = versionForTenant(previousVersion, context.tenantId); const next = versionForTenant(nextVersion, context.tenantId);
  invariant(nextVersion.supersedesDocumentVersionId === previous.documentVersionId, 'retificação não referencia versão anterior'); invariant(next.snapshot.quoteId === previous.snapshot.quoteId, 'retificação deve preservar aggregate quoteId');
  const intent = intentFor('rectified', nextVersion, context, { previousDocumentVersionId: previous.documentVersionId }); const commands = tenantEntries(state.idempotency, context.tenantId); const replay = own(commands, context.commandId) ? commands[context.commandId] : undefined;
  if (replay) { invariant(replay.intent === intent, 'commandId reutilizado com intenção divergente'); return freeze({ state, result: replay.result, replayed: true }); }
  const records = tenantEntries(state.records, context.tenantId); const supersessions = tenantEntries(state.supersessions, context.tenantId);
  invariant(nextVersion.status === 'awaiting_acceptance', 'sucessora não aguarda decisão'); invariant(!own(supersessions, previous.documentVersionId), 'versão anterior já foi retificada'); invariant(!own(records, next.documentVersionId), 'sucessora já decidida');
  invariant(!state.events.some((event) => event.tenantId === context.tenantId && event.eventId === context.eventId), 'eventId já existe neste tenant');
  const event = freeze({ eventId: context.eventId, type: 'document_rectified', tenantId: context.tenantId, actorId: context.actorId, previousDocumentVersionId: previous.documentVersionId, documentVersionId: next.documentVersionId, canonicalHash: next.canonicalHash, at: context.now });
  const result = freeze({ previousDocumentVersionId: previous.documentVersionId, documentVersionId: next.documentVersionId, canonicalHash: next.canonicalHash, decision: 'rectified' });
  const nextState = freeze({ ...state, supersessions: mapWith(state.supersessions, context.tenantId, mapWith(supersessions, previous.documentVersionId, freeze({ documentVersionId: next.documentVersionId, canonicalHash: next.canonicalHash, at: context.now }))), events: [...state.events, event], idempotency: mapWith(state.idempotency, context.tenantId, mapWith(commands, context.commandId, freeze({ intent, result }))) });
  return freeze({ state: nextState, result, replayed: false });
}
