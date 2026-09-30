import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_DOCUMENT_SCHEMA,
  FIXTURE_EVIDENCE,
  FIXTURE_NOW,
  FIXTURE_ORG_A,
  FIXTURE_OWNER_A,
  FIXTURE_PRICING_INPUT,
  FIXTURE_PUBLIC_CATALOG,
  FIXTURE_TECH_A,
} from '../fixtures/synthetic.mjs';
import {
  FixtureAiProvider,
  buildProviderPayload,
  decideSuggestion,
} from '../spikes/ai/suggestion-envelope.mjs';
import {
  appendSignatureEvent,
  approveDocument,
  createDocumentDraft,
  documentRenderContext,
} from '../spikes/documents/document-contract.mjs';
import {
  drainCommand,
  getProjectionV1,
  openSpikeDatabase,
  seedMembership,
  transactLocalMutationAndEnqueue,
} from '../spikes/outbox/sqlite-outbox.mjs';
import { calculateExplainedPrice } from '../spikes/pricing/explained-pricing.mjs';

test('preço → IA revisada → documento assinado → outbox autorizada → projeção', () => {
  const pricing = calculateExplainedPrice(FIXTURE_PRICING_INPUT);
  const aiPayload = buildProviderPayload({
    requestId: 'request-e2e-fixture',
    serviceCode: 'hvac_preventive_cleaning',
    quantity: 2,
    publicCatalog: FIXTURE_PUBLIC_CATALOG,
    publicPricing: pricing.public,
  });
  const suggestion = new FixtureAiProvider().suggestQuoteItem({
    suggestionId: 'suggestion-e2e-fixture',
    requestId: 'request-e2e-fixture',
    generatedAt: FIXTURE_NOW,
    payload: aiPayload,
  });
  const decision = decideSuggestion(suggestion, {
    decision: 'edited',
    actorId: FIXTURE_OWNER_A,
    at: '2026-08-27T12:01:00.000Z',
    editedAmountCents: pricing.public.suggestedUnitPriceCents,
    reason: 'preço interno explicado foi revisado pelo responsável',
  });

  const draft = createDocumentDraft({
    id: 'document-e2e-fixture',
    organizationId: FIXTURE_ORG_A,
    schema: FIXTURE_DOCUMENT_SCHEMA,
    source: { type: 'quote', id: 'quote-e2e-fixture', version: 1 },
    payload: {
      customerLabel: 'cliente-fixture-e2e',
      serviceScope: 'Higienização preventiva de equipamento fixture',
      quantity: 2,
      unitPriceCents: decision.domainDraft.amountCents,
      totalCents: decision.domainDraft.amountCents * 2,
      currency: 'BRL',
      pmocPlanVersionId: { notApplicable: true, reason: 'proposta avulsa de fixture' },
    },
    evidence: FIXTURE_EVIDENCE,
    createdAt: '2026-08-27T12:02:00.000Z',
  });
  const approved = approveDocument(draft, {
    eventId: 'approval-e2e-fixture',
    actorId: FIXTURE_OWNER_A,
    at: '2026-08-27T12:03:00.000Z',
  });
  const signed = appendSignatureEvent(approved, {
    id: 'signature-e2e-fixture',
    action: 'signed',
    role: 'client',
    level: 'drawn_mark',
    signerId: 'client-fixture-signer',
    at: '2026-08-27T12:04:00.000Z',
    documentHash: approved.contentHash,
    evidenceRefs: ['evidence-signature-mark'],
  });
  const publicDocument = documentRenderContext(signed, { audience: 'client' });

  const db = openSpikeDatabase();
  seedMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_TECH_A,
    role: 'technician',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  });
  seedMembership(db, {
    organizationId: FIXTURE_ORG_A,
    userId: FIXTURE_OWNER_A,
    role: 'owner',
    status: 'active',
    membershipVersion: 1,
    updatedAt: FIXTURE_NOW,
  });
  transactLocalMutationAndEnqueue(db, {
    localAggregate: {
      organizationId: FIXTURE_ORG_A,
      aggregateType: 'document',
      aggregateId: signed.id,
      version: 1,
      payload: publicDocument,
      updatedAt: '2026-08-27T12:05:00.000Z',
    },
    command: {
      commandId: 'command-e2e-fixture',
      idempotencyKey: 'idempotency-e2e-fixture', // gitleaks:allow -- chave sintética, não é credencial
      protocolVersion: 1,
      schemaVersion: 1,
      organizationId: FIXTURE_ORG_A,
      actorUserId: FIXTURE_TECH_A,
      deviceId: 'device-e2e-fixture',
      aggregateType: 'document',
      aggregateId: signed.id,
      operation: 'register_document',
      expectedVersion: 0,
      payload: publicDocument,
      createdAtLocal: '2026-08-27T12:05:00.000Z',
    },
  });
  const result = drainCommand(db, 'command-e2e-fixture', {
    sessionUserId: FIXTURE_TECH_A,
    processedAt: '2026-08-27T12:06:00.000Z',
  });
  const projection = getProjectionV1(db, {
    sessionUserId: FIXTURE_OWNER_A,
    organizationId: FIXTURE_ORG_A,
    aggregateType: 'document',
    aggregateId: signed.id,
  });

  assert.equal(result.state, 'acked');
  assert.equal(projection.version, 1);
  assert.equal(projection.payload.documentHash, signed.contentHash);
  assert.equal(projection.payload.trust.drawnMarkIsQualifiedSignature, false);
  assert.equal(JSON.stringify(projection.payload).includes('private://'), false);
  const serializedAiPayload = JSON.stringify(aiPayload).toLowerCase();
  assert.equal(serializedAiPayload.includes('totalcostcents'), false);
  assert.equal(serializedAiPayload.includes('grossmargin'), false);
  assert.equal(serializedAiPayload.includes(FIXTURE_ORG_A), false);
  db.close();
});
