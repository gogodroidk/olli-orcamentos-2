import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalJson, canonicalize, createDraft, documentEnvelope, emptyState, publicVersion,
  publishQuote, sha256, startRectification, verifyVersion, withDraft,
} from '../kernel/quote-kernel.mjs';
import { evidenceRefs, publishContext, quote } from '../fixtures/synthetic.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function draft(id = 'draft.synthetic.001', source = quote, tenantId = 'tenant.synthetic.001') {
  return createDraft({ tenantId, draftId: id, quote: clone(source) });
}
function stateWithDraft(id = 'draft.synthetic.001', source = quote) { return withDraft(emptyState(), draft(id, source)); }

test('canonicalização ordena chaves e normaliza Unicode NFC', () => {
  const decomposed = 'Cafe\u0301';
  assert.equal(canonicalJson({ z: decomposed, a: 1 }), canonicalJson({ a: 1, z: 'Café' }));
  assert.equal(sha256({ z: decomposed, a: 1 }), sha256({ a: 1, z: 'Café' }));
  assert.throws(() => canonicalize({ 'e\u0301': 1, é: 2 }), /chaves NFC ambíguas/);
  assert.throws(() => canonicalize({ é: 2, 'e\u0301': 1 }), /chaves NFC ambíguas/);
  assert.throws(() => canonicalize({ n: -0 }), /número inválido/);
  assert.throws(() => canonicalize({ n: Number.NaN }), /número inválido/);
});

test('envelope é determinístico e ordena evidenceRefs sem alterar arrays de domínio', () => {
  const reverse = [...evidenceRefs, { ...evidenceRefs[0], evidenceRefId: 'evidence.synthetic.000', digestSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }].reverse();
  const first = documentEnvelope({ tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.synthetic.001', snapshot: quote, evidenceRefs: reverse });
  const second = documentEnvelope({ tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.synthetic.001', snapshot: quote, evidenceRefs: [...reverse].reverse() });
  assert.equal(sha256(first), sha256(second));
  assert.equal(first.evidenceRefs[0].evidenceRefId, 'evidence.synthetic.000');
  assert.equal(first.snapshot.items[0].description, 'Visita técnica');
  const caseSensitive = documentEnvelope({
    tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.synthetic.case.001', snapshot: quote,
    evidenceRefs: [
      { ...evidenceRefs[0], evidenceRefId: 'evidence.a' },
      { ...evidenceRefs[0], evidenceRefId: 'evidence.B', digestSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    ],
  });
  assert.deepEqual(caseSensitive.evidenceRefs.map((ref) => ref.evidenceRefId), ['evidence.B', 'evidence.a']);
});

test('publicação congela snapshot allowlistado, hash e evento de modo atômico', () => {
  const result = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() });
  assert.equal(result.replayed, false);
  assert.equal(result.result.status, 'awaiting_acceptance');
  assert.equal(result.state.events.length, 1);
  const version = result.state.versions[result.result.documentVersionId];
  assert.equal(verifyVersion(version), true);
  assert.equal(Object.isFrozen(version), true);
  const delivered = publicVersion(version);
  assert.equal(delivered.snapshot.private, undefined);
  assert.equal(JSON.stringify(delivered).includes('never-public'), false);
  assert.equal(JSON.stringify(delivered).includes('costCents'), false);
});

test('falha de capability, tenant ou schema não deixa efeito parcial', () => {
  const base = stateWithDraft();
  assert.throws(() => publishQuote(base, { draftId: 'draft.synthetic.001', context: publishContext({ capabilities: [] }) }), /capability/);
  assert.equal(Object.keys(base.versions).length, 0);
  assert.throws(() => publishQuote(base, { draftId: 'draft.synthetic.001', context: publishContext({ tenantId: 'tenant.synthetic.002' }) }), /cross-tenant/);
  assert.equal(base.events.length, 0);
  const hostile = clone(quote); hostile.extra = true;
  assert.throws(() => createDraft({ tenantId: 'tenant.synthetic.001', draftId: 'draft.hostile.001', quote: hostile }), /não é permitido/);
});

test('replay idempotente não cria versão/evento e intenção divergente falha fechado', () => {
  const first = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() });
  const replay = publishQuote(first.state, { draftId: 'draft.synthetic.001', context: publishContext() });
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.events.length, 1);
  assert.throws(() => publishQuote(first.state, { draftId: 'draft.synthetic.001', context: publishContext({ evidenceRefs: [] }) }), /intenção divergente/);
  assert.throws(() => publishQuote(first.state, { draftId: 'draft.synthetic.001', context: publishContext({ eventId: 'event.synthetic.other.001' }) }), /intenção divergente/);
  assert.throws(() => publishQuote(first.state, { draftId: 'draft.synthetic.001', context: publishContext({ actorId: 'actor.synthetic.other.001' }) }), /intenção divergente/);
});

test('índices internos aceitam IDs válidos que coincidem com Object.prototype', () => {
  const prototypeContext = publishContext({
    tenantId: 'toString', commandId: 'constructor', documentVersionId: 'toString', eventId: 'event.prototype.001',
  });
  const first = publishQuote(withDraft(emptyState(), draft('constructor', quote, 'toString')), {
    draftId: 'constructor', context: prototypeContext,
  });
  assert.equal(first.replayed, false);
  assert.equal(Object.hasOwn(first.state.drafts, 'constructor'), true);
  assert.equal(Object.hasOwn(first.state.versions, 'toString'), true);
  assert.equal(first.state.idempotency.toString.constructor.result.documentVersionId, 'toString');
  const replay = publishQuote(first.state, { draftId: 'constructor', context: prototypeContext });
  assert.equal(replay.replayed, true);
  const versionNamedConstructor = publishQuote(withDraft(emptyState(), draft('draft.prototype.002')), {
    draftId: 'draft.prototype.002',
    context: publishContext({ commandId: 'command.prototype.002', documentVersionId: 'constructor', eventId: 'event.prototype.002' }),
  });
  assert.equal(versionNamedConstructor.replayed, false);
  assert.equal(Object.hasOwn(versionNamedConstructor.state.versions, 'constructor'), true);
});

test('alteração posterior do rascunho não altera snapshot publicado e adulteração é detectada', () => {
  const published = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() });
  const version = published.state.versions['document.version.synthetic.001'];
  const before = version.canonicalHash;
  const changed = clone(quote); changed.items[0].description = 'Item alterado';
  const later = withDraft(published.state, draft('draft.synthetic.002', changed));
  assert.equal(later.versions['document.version.synthetic.001'].canonicalHash, before);
  const tampered = clone(version); tampered.envelope.snapshot.title = 'fraude';
  assert.throws(() => verifyVersion(tampered), /hash documental divergente/);
});

test('retificação cria versão posterior ligada, sem reescrever a anterior', () => {
  const first = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() });
  const updated = clone(quote); updated.title = 'Proposta retificada';
  const rectificationDraft = draft('draft.synthetic.002', updated);
  const withRectification = startRectification(first.state, { previousDocumentVersionId: 'document.version.synthetic.001', draft: rectificationDraft });
  const second = publishQuote(withRectification, {
    draftId: 'draft.synthetic.002',
    context: publishContext({ commandId: 'command.synthetic.002', documentVersionId: 'document.version.synthetic.002', eventId: 'event.synthetic.002', now: '2026-08-30T09:02:00.000Z' }),
    supersedesDocumentVersionId: 'document.version.synthetic.001',
  });
  assert.equal(second.state.versions['document.version.synthetic.001'].canonicalHash, first.result.canonicalHash);
  assert.equal(second.state.versions['document.version.synthetic.002'].supersedesDocumentVersionId, 'document.version.synthetic.001');
  assert.notEqual(second.result.canonicalHash, first.result.canonicalHash);
  assert.equal(second.state.versions['document.version.synthetic.002'].envelope.supersedesDocumentVersionId, 'document.version.synthetic.001');
  const tamperedLink = clone(second.state.versions['document.version.synthetic.002']);
  tamperedLink.envelope.supersedesDocumentVersionId = null;
  assert.throws(() => verifyVersion(tamperedLink), /envelope documental inválido|ligação de retificação divergente|hash documental divergente/);
  const tamperedTenant = clone(second.state.versions['document.version.synthetic.002']);
  tamperedTenant.tenantId = 'tenant.synthetic.002';
  assert.throws(() => verifyVersion(tamperedTenant), /envelope documental inválido|tenant documental divergente/);
  const crossTenantDraft = draft('draft.synthetic.003', updated, 'tenant.synthetic.002');
  assert.throws(() => startRectification({ ...first.state, versions: { ...first.state.versions, 'document.version.synthetic.001': { ...first.state.versions['document.version.synthetic.001'], tenantId: 'tenant.synthetic.002' } } }, { previousDocumentVersionId: 'document.version.synthetic.001', draft: crossTenantDraft }), /envelope documental inválido|tenant documental divergente/);
});

test('retificação não pode atravessar aggregates/quotes mesmo no mesmo tenant', () => {
  const first = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() });
  const otherQuote = clone(quote); otherQuote.quoteId = 'quote.synthetic.002'; otherQuote.title = 'Outro orçamento';
  const next = withDraft(first.state, draft('draft.other.001', otherQuote));
  assert.throws(() => publishQuote(next, {
    draftId: 'draft.other.001',
    context: publishContext({ commandId: 'command.other.001', documentVersionId: 'document.version.other.001', eventId: 'event.other.001' }),
    supersedesDocumentVersionId: 'document.version.synthetic.001',
  }), /aggregate quoteId/);
});

test('idempotência e eventId isolam tenants sem colisão operacional', () => {
  const first = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext({ commandId: 'command.shared.001', eventId: 'event.shared.001' }) });
  const tenantBQuote = clone(quote); tenantBQuote.quoteId = 'quote.tenant-b.001'; tenantBQuote.title = 'Orçamento tenant B';
  const withB = withDraft(first.state, draft('draft.tenant-b.001', tenantBQuote, 'tenant.synthetic.002'));
  const second = publishQuote(withB, {
    draftId: 'draft.tenant-b.001',
    context: publishContext({ tenantId: 'tenant.synthetic.002', commandId: 'command.shared.001', eventId: 'event.shared.001', documentVersionId: 'document.version.tenant-b.001' }),
  });
  assert.equal(second.result.documentVersionId, 'document.version.tenant-b.001');
  const another = clone(quote); another.quoteId = 'quote.synthetic.003'; another.title = 'Terceiro orçamento';
  const sameTenant = withDraft(first.state, draft('draft.event-collision.001', another));
  assert.throws(() => publishQuote(sameTenant, {
    draftId: 'draft.event-collision.001',
    context: publishContext({ commandId: 'command.event-collision.001', documentVersionId: 'document.version.event-collision.001', eventId: 'event.shared.001' }),
  }), /eventId já existe/);
});

test('verifyVersion rejeita envelope rehasheado que viola o contrato normativo', () => {
  const version = publishQuote(stateWithDraft(), { draftId: 'draft.synthetic.001', context: publishContext() }).state.versions['document.version.synthetic.001'];
  const invalid = clone(version); invalid.envelope.hashAlgorithm = 'not-olli'; invalid.canonicalHash = sha256(invalid.envelope);
  assert.throws(() => verifyVersion(invalid), /envelope documental inválido/);
});

test('datas, centavos, referência de evidência e privado inválidos falham fechado', () => {
  const invalidDate = clone(quote); invalidDate.issuedAt = '2026-08-30T09:00:00Z';
  assert.throws(() => draft('draft.invalid.date', invalidDate), /UTC com milissegundos/);
  const invalidMoney = clone(quote); invalidMoney.items[0].unitPriceCents = 1.5;
  assert.throws(() => draft('draft.invalid.money', invalidMoney), /centavos inteiros/);
  const privateLeak = clone(quote); privateLeak.private.password = 'no';
  assert.throws(() => draft('draft.invalid.private', privateLeak), /não é permitido/);
  const badEvidence = [{ ...evidenceRefs[0], digestSha256: 'bad' }];
  assert.throws(() => documentEnvelope({ tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.invalid.001', snapshot: quote, evidenceRefs: badEvidence }), /digestSha256/);
});

test('nulos explícitos sobrevivem, ausentes são omitidos e referências não se repetem', () => {
  const nullable = clone(quote); nullable.terms = null; nullable.recipient.email = null; nullable.issuer.documentNumber = null;
  const version = publishQuote(stateWithDraft('draft.null.001', nullable), {
    draftId: 'draft.null.001', context: publishContext({ commandId: 'command.null.001', documentVersionId: 'document.version.null.001', eventId: 'event.null.001' }),
  }).state.versions['document.version.null.001'];
  assert.equal(version.envelope.snapshot.terms, null);
  assert.equal(version.envelope.snapshot.recipient.email, null);
  const absent = clone(quote); delete absent.terms; delete absent.recipient.email; delete absent.issuer.documentNumber;
  const envelope = documentEnvelope({ tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.absent.001', snapshot: absent, evidenceRefs });
  assert.equal(Object.hasOwn(envelope.snapshot, 'terms'), false);
  assert.equal(Object.hasOwn(envelope.snapshot.recipient, 'email'), false);
  assert.throws(() => documentEnvelope({ tenantId: 'tenant.synthetic.001', documentVersionId: 'document.version.duplicate.001', snapshot: quote, evidenceRefs: [evidenceRefs[0], { ...evidenceRefs[0], digestSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] }), /duplicada/);
});

test('estado e fronteira estática permanecem locais, sem rede, ambiente ou runtime', async () => {
  const source = await readFile(new URL('../kernel/quote-kernel.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['node:fs', 'node:child_process', 'process.env', 'fetch(', 'http://', 'https://', 'supabase', 'worker/']) {
    assert.equal(source.includes(forbidden), false, `fronteira proibida: ${forbidden}`);
  }
  const state = emptyState();
  assert.equal(Object.isFrozen(state), true);
  assert.throws(() => startRectification(state, { previousDocumentVersionId: 'document.missing.001', draft: draft('draft.orphan.001') }), /versão anterior inválida/);
});
