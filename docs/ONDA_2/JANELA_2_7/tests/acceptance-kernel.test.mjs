import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDraft, emptyState, publishQuote, startRectification, withDraft } from '../../JANELA_2_6/kernel/quote-kernel.mjs';
import { evidenceRefs, publishContext, quote } from '../../JANELA_2_6/fixtures/synthetic.mjs';
import { emptyAcceptanceState, recordAcceptance, recordRectification, recordRejection, renderFixture } from '../kernel/acceptance-kernel.mjs';
import { decisionContext, rectificationContext } from '../fixtures/synthetic.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function published() {
  const draft = createDraft({ tenantId: 'tenant.synthetic.001', draftId: 'draft.synthetic.001', quote: clone(quote) });
  const result = publishQuote(withDraft(emptyState(), draft), { draftId: draft.draftId, context: publishContext() });
  return { state: result.state, version: result.state.versions['document.version.synthetic.001'] };
}
function publishedFor({ tenantId, draftId, documentVersionId, commandId, eventId }) {
  const draft = createDraft({ tenantId, draftId, quote: clone(quote) });
  const result = publishQuote(withDraft(emptyState(), draft), { draftId, context: publishContext({ tenantId, commandId, documentVersionId, eventId }) });
  return result.state.versions[documentVersionId];
}
function rectified() {
  const first = published(); const revised = clone(quote); revised.title = 'Proposta retificada';
  const draft = createDraft({ tenantId: 'tenant.synthetic.001', draftId: 'draft.synthetic.002', quote: revised });
  const pending = startRectification(first.state, { previousDocumentVersionId: 'document.version.synthetic.001', draft });
  const result = publishQuote(pending, { draftId: draft.draftId, context: publishContext({ commandId: 'command.synthetic.002', documentVersionId: 'document.version.synthetic.002', eventId: 'event.synthetic.002', now: '2026-08-30T09:02:00.000Z', evidenceRefs }), supersedesDocumentVersionId: 'document.version.synthetic.001' });
  return { previous: first.version, next: result.state.versions['document.version.synthetic.002'] };
}

test('renderer fixture é determinístico e usa exclusivamente projeção pública congelada', () => {
  const { version } = published(); const first = renderFixture(version); const second = renderFixture(version);
  assert.equal(first.renderHash, second.renderHash); assert.equal(first.documentVersionId, version.documentVersionId); assert.equal(first.canonicalHash, version.canonicalHash);
  assert.equal(first.snapshot.private, undefined); assert.equal(JSON.stringify(first).includes('never-public'), false); assert.equal(Object.isFrozen(first), true);
});

test('aceite local vincula versão/hash, evento e replay sem duplicação', () => {
  const { version } = published(); const first = recordAcceptance(emptyAcceptanceState(), version, decisionContext());
  const replay = recordAcceptance(first.state, version, decisionContext());
  assert.equal(first.result.decision, 'accepted'); assert.equal(first.state.records[version.tenantId][version.documentVersionId].canonicalHash, version.canonicalHash); assert.equal(first.state.events.length, 1);
  assert.equal(replay.replayed, true); assert.equal(replay.state.events.length, 1);
  assert.throws(() => recordAcceptance(first.state, version, decisionContext({ eventId: 'event.decision.other.001' })), /intenção divergente/);
});

test('IDs válidos que coincidem com propriedades de Object não fabricam replay', () => {
  const { version } = published();
  for (const commandId of ['toString', 'constructor']) {
    const accepted = recordAcceptance(emptyAcceptanceState(), version, decisionContext({ commandId, eventId: `event.${commandId}.001` }));
    assert.equal(accepted.replayed, false); assert.equal(accepted.state.events.length, 1);
  }
});

test('recusa é terminal, exige motivo e não vira aceite', () => {
  const { version } = published();
  assert.throws(() => recordRejection(emptyAcceptanceState(), version, decisionContext(), {}), /reason inválido/);
  const rejected = recordRejection(emptyAcceptanceState(), version, decisionContext(), { reason: 'Prazo não atende.' });
  assert.equal(rejected.state.records[version.tenantId][version.documentVersionId].decision, 'rejected'); assert.equal(rejected.state.records[version.tenantId][version.documentVersionId].affirmed, false);
  assert.throws(() => recordAcceptance(rejected.state, version, decisionContext({ commandId: 'command.decision.002', eventId: 'event.decision.002' })), /documento já decidido/);
});

test('tenant, capability, prazo e hash adulterado falham sem efeito parcial', () => {
  const { version } = published(); const base = emptyAcceptanceState();
  assert.throws(() => recordAcceptance(base, version, decisionContext({ tenantId: 'tenant.synthetic.002' })), /cross-tenant/);
  assert.throws(() => recordAcceptance(base, version, decisionContext({ capabilities: [] })), /capability/);
  assert.throws(() => recordAcceptance(base, version, decisionContext({ now: '2026-09-07T09:00:00.000Z' })), /expirado/);
  const tampered = clone(version); tampered.canonicalHash = 'b'.repeat(64);
  assert.throws(() => recordAcceptance(base, tampered, decisionContext()), /hash documental divergente/);
  assert.equal(base.events.length, 0);
});

test('retificação preserva decisão anterior e bloqueia aceite posterior da versão substituída', () => {
  const { previous, next } = rectified(); const accepted = recordAcceptance(emptyAcceptanceState(), previous, decisionContext());
  const rectification = recordRectification(accepted.state, { previousVersion: previous, nextVersion: next, context: rectificationContext() });
  assert.equal(rectification.state.records[previous.tenantId][previous.documentVersionId].decision, 'accepted'); assert.equal(rectification.state.supersessions[previous.tenantId][previous.documentVersionId].documentVersionId, next.documentVersionId);
  const replay = recordAcceptance(rectification.state, previous, decisionContext());
  assert.equal(replay.replayed, true); assert.equal(replay.state.events.length, rectification.state.events.length);
  assert.throws(() => recordAcceptance(rectification.state, previous, decisionContext({ commandId: 'command.decision.after.001', eventId: 'event.decision.after.001', now: '2026-08-30T10:02:00.000Z' })), /documento foi retificado/);
  const nextAcceptance = recordAcceptance(rectification.state, next, decisionContext({ commandId: 'command.decision.next.001', eventId: 'event.decision.next.001', now: '2026-08-30T10:02:00.000Z' }));
  assert.equal(nextAcceptance.result.documentVersionId, next.documentVersionId);
});

test('sucessora exige retificação anterior e retificação rejeita decisão prévia da sucessora', () => {
  const { previous, next } = rectified(); const base = emptyAcceptanceState();
  assert.throws(() => recordAcceptance(base, next, decisionContext()), /retificação ainda não registrada/);
  assert.equal(base.events.length, 0);
  const withFutureDecision = { ...base, records: { [next.tenantId]: { [next.documentVersionId]: { decision: 'accepted' } } } };
  assert.throws(() => recordRectification(withFutureDecision, { previousVersion: previous, nextVersion: next, context: rectificationContext() }), /sucessora já decidida/);
  assert.equal(withFutureDecision.events.length, 0);
});

test('registros ficam isolados por tenant mesmo com documentVersionId coincidente', () => {
  const first = publishedFor({ tenantId: 'tenant.synthetic.101', draftId: 'draft.synthetic.101', documentVersionId: 'document.version.collision.001', commandId: 'command.synthetic.101', eventId: 'event.synthetic.101' });
  const second = publishedFor({ tenantId: 'tenant.synthetic.202', draftId: 'draft.synthetic.202', documentVersionId: 'document.version.collision.001', commandId: 'command.synthetic.202', eventId: 'event.synthetic.202' });
  const decidedFirst = recordAcceptance(emptyAcceptanceState(), first, decisionContext({ tenantId: first.tenantId, actorId: 'user.synthetic.101', commandId: 'command.decision.101', eventId: 'event.decision.101' }));
  const decidedSecond = recordAcceptance(decidedFirst.state, second, decisionContext({ tenantId: second.tenantId, actorId: 'user.synthetic.202', commandId: 'command.decision.202', eventId: 'event.decision.202' }));
  assert.notEqual(first.canonicalHash, second.canonicalHash); assert.equal(decidedSecond.state.records[first.tenantId][first.documentVersionId].tenantId, first.tenantId); assert.equal(decidedSecond.state.records[second.tenantId][second.documentVersionId].tenantId, second.tenantId);
});

test('retificação cross-tenant, vínculo inválido e replay divergente falham fechado', () => {
  const { previous, next } = rectified(); const state = emptyAcceptanceState();
  assert.throws(() => recordRectification(state, { previousVersion: previous, nextVersion: next, context: rectificationContext({ tenantId: 'tenant.synthetic.002' }) }), /cross-tenant/);
  const detached = clone(next); detached.supersedesDocumentVersionId = null;
  assert.throws(() => recordRectification(state, { previousVersion: previous, nextVersion: detached, context: rectificationContext() }), /envelope documental inválido|retificação não referencia/);
  const first = recordRectification(state, { previousVersion: previous, nextVersion: next, context: rectificationContext() });
  const replay = recordRectification(first.state, { previousVersion: previous, nextVersion: next, context: rectificationContext() });
  assert.equal(replay.replayed, true); assert.equal(replay.state, first.state); assert.equal(replay.state.events.length, 1);
  assert.throws(() => recordRectification(first.state, { previousVersion: previous, nextVersion: next, context: rectificationContext({ eventId: 'event.rectification.other.001' }) }), /intenção divergente/);
});

test('fronteira do núcleo permanece local e sem I/O ou runtime', async () => {
  const source = await readFile(new URL('../kernel/acceptance-kernel.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['node:fs', 'node:child_process', 'process.env', 'fetch(', 'http://', 'https://', 'supabase', 'worker/', 'src/']) assert.equal(source.includes(forbidden), false, `fronteira proibida: ${forbidden}`);
});
