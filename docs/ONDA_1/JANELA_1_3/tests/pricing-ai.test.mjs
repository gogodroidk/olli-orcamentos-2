import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_NOW,
  FIXTURE_ORG_A,
  FIXTURE_PRICING_INPUT,
  FIXTURE_PUBLIC_CATALOG,
} from '../fixtures/synthetic.mjs';
import {
  FixtureAiProvider,
  assertProviderContract,
  assertProviderPayloadSafe,
  buildProviderPayload,
  decideSuggestion,
} from '../spikes/ai/suggestion-envelope.mjs';
import {
  assertPublicPricingSafe,
  calculateExplainedPrice,
} from '../spikes/pricing/explained-pricing.mjs';

test('preço explicado é determinístico e mantém custo e margem na visão privada', () => {
  const result = calculateExplainedPrice(FIXTURE_PRICING_INPUT);

  assert.equal(result.status, 'calculated');
  assert.equal(result.public.suggestedTotalCents, 45500);
  assert.equal(result.public.suggestedUnitPriceCents, 22750);
  assert.equal(result.private.totalCostCents, 28875);
  assert.equal(Object.hasOwn(result.public, 'calculationHash'), false);
  assert.equal(result.public.methodVersion, 'explained-price-v1');
  assert.equal(assertPublicPricingSafe(result.public), true);
  assert.equal(JSON.stringify(result.public).includes(FIXTURE_ORG_A), false);
  assert.equal(JSON.stringify(result.public).includes('3000 bps'), false);
});

test('custo ausente continua null e obriga precificação manual', () => {
  const input = structuredClone(FIXTURE_PRICING_INPUT);
  input.directCosts[0].unitCostCents = null;
  const result = calculateExplainedPrice(input);

  assert.equal(result.status, 'manual_required');
  assert.equal(result.public.suggestedUnitPriceCents, null);
  assert.equal(result.public.suggestedTotalCents, null);
  assert.equal(assertPublicPricingSafe(result.public), true);
  assert.deepEqual(result.private.missingCostRefs, ['catalog:product-fixture-1:v1']);
});

test('fonte de custo de outra organização é rejeitada', () => {
  const input = structuredClone(FIXTURE_PRICING_INPUT);
  input.labor.source.organizationId = 'org-fixture-b';
  assert.throws(() => calculateExplainedPrice(input), /cruza tenant/);
});

test('IA recebe somente catálogo/preço públicos e exige decisão humana', () => {
  const price = calculateExplainedPrice(FIXTURE_PRICING_INPUT);
  const payload = buildProviderPayload({
    requestId: 'request-ai-fixture-1',
    serviceCode: 'hvac_preventive_cleaning',
    quantity: 2,
    publicCatalog: FIXTURE_PUBLIC_CATALOG,
    publicPricing: price.public,
  });
  const provider = new FixtureAiProvider();
  const envelope = provider.suggestQuoteItem({
    suggestionId: 'suggestion-fixture-1',
    requestId: 'request-ai-fixture-1',
    generatedAt: FIXTURE_NOW,
    payload,
  });

  assert.equal(assertProviderPayloadSafe(payload), true);
  assert.equal(assertProviderContract(payload), true);
  assert.equal(envelope.proposal.amountCents, 22500);
  assert.equal(envelope.confidence, 'high');
  assert.equal(envelope.requiresHumanApproval, true);
  assert.equal(envelope.decision, null);
  assert.equal(JSON.stringify(payload).toLowerCase().includes('grossmargin'), false);
  assert.equal(Object.hasOwn(payload, 'description'), false);
  assert.equal(Object.hasOwn(payload.publicCatalog[0], 'label'), false);
  assert.equal(Object.hasOwn(payload.publicPricing, 'explanation'), false);

  const edited = decideSuggestion(envelope, {
    decision: 'edited',
    actorId: 'user-owner-a',
    at: '2026-08-27T12:01:00.000Z',
    editedAmountCents: price.public.suggestedUnitPriceCents,
    reason: 'adotado cálculo determinístico interno revisado',
  });
  assert.equal(edited.applied, true);
  assert.equal(edited.domainDraft.amountCents, 22750);
  assert.throws(() => decideSuggestion(edited.envelope, {
    decision: 'accepted',
    actorId: 'user-owner-a',
    at: '2026-08-27T12:02:00.000Z',
  }), /já decidida/);
});

test('IA sem fonte não inventa preço e payload privado é bloqueado', () => {
  const price = calculateExplainedPrice(FIXTURE_PRICING_INPUT);
  const provider = new FixtureAiProvider();
  const payload = buildProviderPayload({
    requestId: 'request-ai-fixture-2',
    serviceCode: 'unclassified',
    quantity: 1,
    publicCatalog: FIXTURE_PUBLIC_CATALOG,
    publicPricing: price.public,
  });
  const envelope = provider.suggestQuoteItem({
    suggestionId: 'suggestion-fixture-2',
    requestId: 'request-ai-fixture-2',
    generatedAt: FIXTURE_NOW,
    payload,
  });

  assert.equal(envelope.proposal.amountCents, null);
  assert.equal(envelope.proposal.basis, 'manual_required');
  assert.throws(() => decideSuggestion(envelope, {
    decision: 'accepted',
    actorId: 'user-owner-a',
    at: '2026-08-27T12:02:00.000Z',
  }), /preço ausente/);
  assert.throws(() => assertProviderPayloadSafe({
    description: 'fixture',
    private: { totalCostCents: 12345 },
  }), /proibida/);
  assert.throws(() => assertProviderPayloadSafe({
    description: 'Contato do cliente: client@example.test',
  }), /e-mail\/PII/);
  assert.throws(() => assertProviderPayloadSafe({
    description: 'fixture',
    customerEmailAddress: 'valor-redigido',
  }), /classificação privada/);
});

test('contrato do provider rejeita campos extras mesmo quando o nome parece inofensivo', () => {
  const price = calculateExplainedPrice(FIXTURE_PRICING_INPUT);
  const unsafePublicPricing = { ...price.public, commercialPolicyValue: 3000 };
  assert.throws(() => buildProviderPayload({
    requestId: 'request-ai-fixture-extra',
    serviceCode: 'hvac_preventive_cleaning',
    quantity: 2,
    publicCatalog: FIXTURE_PUBLIC_CATALOG,
    publicPricing: unsafePublicPricing,
  }), /não pertence ao contrato público/);

  assert.throws(() => buildProviderPayload({
    requestId: 'request-ai-fixture-free-text',
    serviceCode: 'hvac_preventive_cleaning',
    description: 'Atender Maria na Rua das Flores, 100, sala 2',
    quantity: 2,
    publicCatalog: FIXTURE_PUBLIC_CATALOG,
    publicPricing: price.public,
  }), /providerInput\.description não pertence ao contrato público/);
});
