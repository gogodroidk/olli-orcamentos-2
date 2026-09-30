import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_DOCUMENT_SCHEMA,
  FIXTURE_EVIDENCE,
  FIXTURE_NOW,
  FIXTURE_ORG_A,
  FIXTURE_OWNER_A,
  FIXTURE_QUOTE_PAYLOAD,
} from '../fixtures/synthetic.mjs';
import {
  appendSignatureEvent,
  approveDocument,
  createDocumentDraft,
  createDocumentRevision,
  documentRenderContext,
  verifyDocumentHash,
} from '../spikes/documents/document-contract.mjs';

function draft(id = 'document-fixture-1') {
  return createDocumentDraft({
    id,
    organizationId: FIXTURE_ORG_A,
    schema: FIXTURE_DOCUMENT_SCHEMA,
    source: { type: 'quote', id: 'quote-fixture-1', version: 1 },
    payload: FIXTURE_QUOTE_PAYLOAD,
    evidence: FIXTURE_EVIDENCE,
    createdAt: FIXTURE_NOW,
  });
}

function approved(id = 'document-fixture-1') {
  return approveDocument(draft(id), {
    eventId: `approval-${id}`,
    actorId: FIXTURE_OWNER_A,
    at: '2026-08-27T12:05:00.000Z',
  });
}

test('hash canônico é estável e detecta adulteração', () => {
  const first = draft('document-fixture-1');
  const reorderedPayload = {
    currency: FIXTURE_QUOTE_PAYLOAD.currency,
    totalCents: FIXTURE_QUOTE_PAYLOAD.totalCents,
    unitPriceCents: FIXTURE_QUOTE_PAYLOAD.unitPriceCents,
    quantity: FIXTURE_QUOTE_PAYLOAD.quantity,
    serviceScope: FIXTURE_QUOTE_PAYLOAD.serviceScope,
    customerLabel: FIXTURE_QUOTE_PAYLOAD.customerLabel,
    pmocPlanVersionId: FIXTURE_QUOTE_PAYLOAD.pmocPlanVersionId,
  };
  const second = createDocumentDraft({
    id: 'document-fixture-2',
    organizationId: FIXTURE_ORG_A,
    schema: FIXTURE_DOCUMENT_SCHEMA,
    source: { version: 1, id: 'quote-fixture-1', type: 'quote' },
    payload: reorderedPayload,
    evidence: FIXTURE_EVIDENCE,
    createdAt: FIXTURE_NOW,
  });

  assert.equal(first.contentHash, second.contentHash);
  assert.equal(verifyDocumentHash(first), true);
  const adulterated = structuredClone(first);
  adulterated.payload.totalCents = 1;
  assert.equal(verifyDocumentHash(adulterated), false);
});

test('rubrica desenhada referencia o hash, mas não se apresenta como ICP-Brasil', () => {
  const base = approved();
  const signed = appendSignatureEvent(base, {
    id: 'signature-drawn-1',
    action: 'signed',
    role: 'client',
    level: 'drawn_mark',
    signerId: 'client-fixture-signer',
    at: '2026-08-27T12:10:00.000Z',
    documentHash: base.contentHash,
    evidenceRefs: ['evidence-signature-mark'],
  });
  const client = documentRenderContext(signed, { audience: 'client' });

  assert.equal(signed.status, 'signed');
  assert.equal(signed.signatureEvents[0].documentHash, signed.contentHash);
  assert.equal(client.evidence.some((item) => Object.hasOwn(item, 'uri')), false);
  assert.equal(client.trust.drawnMarkIsQualifiedSignature, false);
  assert.equal(client.trust.artEmittedByOlli, false);
});

test('assinatura qualificada sem provedor e certificado externos é rejeitada', () => {
  const base = approved();
  assert.throws(() => appendSignatureEvent(base, {
    id: 'signature-qualified-invalid',
    action: 'signed',
    role: 'client',
    level: 'qualified_external',
    signerId: 'client-fixture-signer',
    at: '2026-08-27T12:10:00.000Z',
    documentHash: base.contentHash,
    evidenceRefs: [],
  }), /provedor externo|certificado externo/);
});

test('schema sem papel obrigatório é rejeitado e recusa não assina', () => {
  const invalidSchema = structuredClone(FIXTURE_DOCUMENT_SCHEMA);
  invalidSchema.signaturePolicy.requiredRoles = [];
  assert.throws(() => createDocumentDraft({
    id: 'document-invalid-empty-roles',
    organizationId: FIXTURE_ORG_A,
    schema: invalidSchema,
    source: { type: 'quote', id: 'quote-fixture-1', version: 1 },
    payload: FIXTURE_QUOTE_PAYLOAD,
    evidence: FIXTURE_EVIDENCE,
    createdAt: FIXTURE_NOW,
  }), /ao menos um papel/);

  const base = approved('document-refused-fixture');
  const refused = appendSignatureEvent(base, {
    id: 'signature-refused-1',
    action: 'refused',
    role: 'client',
    level: 'acceptance',
    signerId: 'client-fixture-signer',
    at: '2026-08-27T12:10:00.000Z',
    documentHash: base.contentHash,
    evidenceRefs: [],
  });
  assert.equal(refused.status, 'approved');
  assert.equal(refused.signedAt, null);
});

test('retificação cria outra versão e preserva a versão assinada', () => {
  const base = approved();
  const signed = appendSignatureEvent(base, {
    id: 'signature-acceptance-1',
    action: 'signed',
    role: 'client',
    level: 'acceptance',
    signerId: 'client-fixture-signer',
    at: '2026-08-27T12:10:00.000Z',
    documentHash: base.contentHash,
    evidenceRefs: [],
    affirmation: 'Concordo com esta versão de fixture.',
    authenticationMethod: 'sessão autenticada de fixture',
  });
  const revisedPayload = { ...FIXTURE_QUOTE_PAYLOAD, totalCents: 46000, unitPriceCents: 23000 };
  const revision = createDocumentRevision(signed, {
    id: 'document-fixture-revision-2',
    payload: revisedPayload,
    evidence: FIXTURE_EVIDENCE,
    createdAt: '2026-08-27T12:20:00.000Z',
    reason: 'escopo e valor corrigidos na fixture',
    actorId: FIXTURE_OWNER_A,
    eventId: 'revision-event-1',
  });

  assert.equal(revision.previous.status, 'signed');
  assert.equal(revision.next.status, 'draft');
  assert.equal(revision.next.supersedesId, revision.previous.id);
  assert.notEqual(revision.next.contentHash, revision.previous.contentHash);
  assert.equal(verifyDocumentHash(revision.previous), true);
  assert.equal(verifyDocumentHash(revision.next), true);
});
