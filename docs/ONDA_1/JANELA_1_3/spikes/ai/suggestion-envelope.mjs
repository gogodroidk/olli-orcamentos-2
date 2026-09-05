import {
  assertIdentifier,
  assertIsoDate,
  immutableJson,
  invariant,
  isPlainObject,
  sha256Hex,
} from '../shared/canonical.mjs';

const CONFIDENCE = new Set(['high', 'medium', 'low']);
const BASIS = new Set(['company_catalog_sale', 'deterministic_private_calculation', 'manual_required']);
const DECISIONS = new Set(['accepted', 'edited', 'rejected']);
const SERVICE_CODES = new Set(['hvac_preventive_cleaning', 'unclassified']);
const FORBIDDEN_PROVIDER_KEYS = new Set([
  'cost', 'costcents', 'unitcostcents', 'totalcostcents', 'margin', 'grossmargin',
  'cpf', 'cnpj', 'email', 'phone', 'telefone', 'address', 'endereco',
  'signature', 'assinatura', 'token', 'secret', 'password', 'authorization', 'cookie',
  'organizationid', 'tenantid', 'actoruserid',
]);
const FORBIDDEN_PROVIDER_KEY_PARTS = [
  'cost', 'margin', 'markup', 'profit', 'purchase', 'acquisition', 'wholesale',
  'internal', 'private', 'cpf', 'cnpj', 'email', 'phone', 'telefone', 'address',
  'endereco', 'signature', 'assinatura', 'token', 'secret', 'password',
  'authorization', 'cookie', 'apikey', 'credential', 'session', 'organization',
  'tenant', 'actoruser',
];
const BUILD_PROVIDER_INPUT_KEYS = ['publicCatalog', 'publicPricing', 'quantity', 'requestId', 'serviceCode'];
const PROVIDER_TOP_LEVEL_KEYS = ['requestId', 'serviceCode', 'quantity', 'publicCatalog', 'publicPricing'];
const CATALOG_KEYS = ['currency', 'serviceCode', 'unitPriceCents', 'version'];
const PUBLIC_PRICING_INPUT_KEYS = [
  'assumptions', 'basis', 'currency', 'explanation', 'methodVersion', 'quantity',
  'requiresHumanApproval', 'suggestedTotalCents', 'suggestedUnitPriceCents', 'uncertainty',
];
const PROVIDER_PRICING_KEYS = [
  'basis', 'currency', 'methodVersion', 'quantity', 'requiresHumanApproval',
  'suggestedTotalCents', 'suggestedUnitPriceCents',
];

function normalizedKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assertExactKeys(value, allowed, path) {
  invariant(isPlainObject(value), `${path} deve ser objeto`);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) invariant(allowedSet.has(key), `${path}.${key} não pertence ao contrato público`);
}

function assertNoObviousPii(value, path) {
  if (typeof value !== 'string') return;
  invariant(!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value), `${path} contém e-mail/PII`);
  const digits = value.replace(/\D/g, '');
  invariant(!(digits.length === 11 || digits.length === 14), `${path} contém possível CPF/CNPJ`);
}

function walkProviderPayload(value, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkProviderPayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    if (typeof value === 'string') {
      invariant(!value.startsWith('private://'), `${path} contém referência privada`);
      invariant(!value.startsWith('data:'), `${path} contém blob embutido`);
      assertNoObviousPii(value, path);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizedKey(key);
    invariant(!FORBIDDEN_PROVIDER_KEYS.has(normalized), `${path}.${key} é campo proibido para IA`);
    invariant(!FORBIDDEN_PROVIDER_KEY_PARTS.some((part) => normalized.includes(part)), `${path}.${key} contém classificação privada proibida para IA`);
    walkProviderPayload(child, `${path}.${key}`);
  }
}

export function assertProviderPayloadSafe(payload) {
  invariant(isPlainObject(payload), 'payload de provider deve ser objeto');
  walkProviderPayload(payload);
  return true;
}

export function buildProviderPayload(input) {
  assertExactKeys(input, BUILD_PROVIDER_INPUT_KEYS, 'providerInput');
  const { requestId, serviceCode, quantity, publicCatalog, publicPricing } = input;
  assertIdentifier(requestId, 'provider.requestId');
  invariant(SERVICE_CODES.has(serviceCode), 'serviceCode não pertence à taxonomia pública permitida');
  invariant(Number.isFinite(quantity) && quantity > 0, 'quantity inválida');
  invariant(Array.isArray(publicCatalog), 'publicCatalog inválido');
  invariant(isPlainObject(publicPricing), 'publicPricing inválido');
  assertExactKeys(publicPricing, PUBLIC_PRICING_INPUT_KEYS, 'publicPricing');

  const sanitizedPricing = {
    currency: publicPricing.currency,
    quantity: publicPricing.quantity,
    suggestedUnitPriceCents: publicPricing.suggestedUnitPriceCents,
    suggestedTotalCents: publicPricing.suggestedTotalCents,
    basis: publicPricing.basis,
    requiresHumanApproval: publicPricing.requiresHumanApproval,
    ...(publicPricing.methodVersion ? { methodVersion: publicPricing.methodVersion } : {}),
  };

  const payload = immutableJson({
    requestId,
    serviceCode,
    quantity,
    publicCatalog: publicCatalog.map((item) => ({
      serviceCode: item.serviceCode,
      unitPriceCents: item.unitPriceCents,
      currency: item.currency,
      version: item.version,
    })),
    publicPricing: sanitizedPricing,
  });
  assertProviderContract(payload);
  return payload;
}

export function assertProviderContract(payload) {
  assertProviderPayloadSafe(payload);
  assertExactKeys(payload, PROVIDER_TOP_LEVEL_KEYS, 'providerPayload');
  assertIdentifier(payload.requestId, 'providerPayload.requestId');
  invariant(SERVICE_CODES.has(payload.serviceCode), 'providerPayload.serviceCode inválido');
  invariant(Number.isFinite(payload.quantity) && payload.quantity > 0, 'providerPayload.quantity inválida');
  invariant(Array.isArray(payload.publicCatalog), 'providerPayload.publicCatalog inválido');
  for (const [index, item] of payload.publicCatalog.entries()) {
    assertExactKeys(item, CATALOG_KEYS, `providerPayload.publicCatalog[${index}]`);
    invariant(SERVICE_CODES.has(item.serviceCode) && item.serviceCode !== 'unclassified', `providerPayload.publicCatalog[${index}].serviceCode inválido`);
    invariant(item.currency === 'BRL', `providerPayload.publicCatalog[${index}].currency inválida`);
    invariant(Number.isInteger(item.unitPriceCents) && item.unitPriceCents > 0, `providerPayload.publicCatalog[${index}].unitPriceCents inválido`);
    invariant(Number.isInteger(item.version) && item.version > 0, `providerPayload.publicCatalog[${index}].version inválida`);
  }
  assertExactKeys(payload.publicPricing, PROVIDER_PRICING_KEYS, 'providerPayload.publicPricing');
  invariant(payload.publicPricing.requiresHumanApproval === true, 'preço público deve exigir aprovação humana');
  return true;
}

export function createSuggestionEnvelope({
  id,
  requestId,
  kind = 'quote_item_price',
  generatedAt,
  provider,
  publicInput,
  proposedAmountCents,
  currency = 'BRL',
  basis,
  sourceRefs,
  assumptions,
  confidence,
  uncertainty,
}) {
  assertIdentifier(id, 'suggestion.id');
  assertIdentifier(requestId, 'suggestion.requestId');
  assertIsoDate(generatedAt, 'suggestion.generatedAt');
  invariant(kind === 'quote_item_price', 'kind não suportado no spike');
  invariant(isPlainObject(provider), 'provider obrigatório');
  invariant(provider.name === 'fixture' && provider.model === 'deterministic-fixture-v1', 'somente provider de fixture permitido');
  assertProviderContract(publicInput);
  invariant(currency === 'BRL', 'somente BRL no spike');
  invariant(BASIS.has(basis), 'basis inválida');
  invariant(CONFIDENCE.has(confidence), 'confidence inválida');
  invariant(Array.isArray(sourceRefs), 'sourceRefs inválido');
  invariant(Array.isArray(assumptions), 'assumptions inválido');
  invariant(typeof uncertainty === 'string' && uncertainty.trim().length > 0, 'uncertainty obrigatória');

  if (proposedAmountCents === null) {
    invariant(basis === 'manual_required', 'valor nulo exige manual_required');
    invariant(sourceRefs.length === 0, 'valor manual não pode fingir fonte de preço');
  } else {
    invariant(Number.isInteger(proposedAmountCents) && proposedAmountCents > 0, 'preço sugerido deve ser centavos positivos');
    invariant(basis !== 'manual_required', 'preço numérico não pode usar manual_required');
    invariant(sourceRefs.length > 0, 'preço numérico exige fonte');
    for (const ref of sourceRefs) invariant(typeof ref === 'string' && /^(catalog|calculation):/.test(ref), `fonte de preço inválida: ${ref}`);
  }

  return immutableJson({
    id,
    requestId,
    kind,
    generatedAt,
    provider,
    publicInputHash: sha256Hex(publicInput),
    proposal: {
      amountCents: proposedAmountCents,
      currency,
      basis,
      sourceRefs,
    },
    assumptions,
    confidence,
    uncertainty,
    requiresHumanApproval: true,
    decision: null,
  });
}

export class FixtureAiProvider {
  constructor() {
    this.name = 'fixture';
    this.model = 'deterministic-fixture-v1';
  }

  suggestQuoteItem({ suggestionId, requestId, generatedAt, payload }) {
    assertProviderContract(payload);
    const match = payload.publicCatalog.find((item) => item.serviceCode === payload.serviceCode);
    if (!match) {
      return createSuggestionEnvelope({
        id: suggestionId,
        requestId,
        generatedAt,
        provider: { name: this.name, model: this.model, source: 'fixture' },
        publicInput: payload,
        proposedAmountCents: null,
        basis: 'manual_required',
        sourceRefs: [],
        assumptions: ['nenhuma correspondência exata no catálogo público da empresa'],
        confidence: 'low',
        uncertainty: 'O provider de fixture não encontrou preço verificável e não inventou um valor.',
      });
    }
    return createSuggestionEnvelope({
      id: suggestionId,
      requestId,
      generatedAt,
      provider: { name: this.name, model: this.model, source: 'fixture' },
      publicInput: payload,
      proposedAmountCents: match.unitPriceCents,
      basis: 'company_catalog_sale',
      sourceRefs: [`catalog:${match.serviceCode}:v${match.version}`],
      assumptions: ['correspondência exata com código versionado do catálogo público da empresa'],
      confidence: 'high',
      uncertainty: 'O preço do catálogo não confirma escopo, condição do local, materiais extras ou aceite do cliente.',
    });
  }
}

export function decideSuggestion(envelope, { decision, actorId, at, editedAmountCents = null, reason = '' }) {
  invariant(envelope.requiresHumanApproval === true, 'envelope sem gate humano');
  invariant(envelope.decision === null, 'sugestão já decidida');
  invariant(DECISIONS.has(decision), 'decisão inválida');
  assertIdentifier(actorId, 'decision.actorId');
  assertIsoDate(at, 'decision.at');

  let finalAmountCents = null;
  if (decision === 'accepted') {
    invariant(Number.isInteger(envelope.proposal.amountCents) && envelope.proposal.amountCents > 0, 'não é possível aceitar preço ausente');
    finalAmountCents = envelope.proposal.amountCents;
  }
  if (decision === 'edited') {
    invariant(Number.isInteger(editedAmountCents) && editedAmountCents > 0, 'edição exige preço positivo em centavos');
    invariant(typeof reason === 'string' && reason.trim().length > 0, 'edição exige justificativa');
    finalAmountCents = editedAmountCents;
  }
  if (decision === 'rejected') {
    invariant(typeof reason === 'string' && reason.trim().length > 0, 'rejeição exige justificativa');
  }

  const decisionRecord = immutableJson({
    state: decision,
    actorId,
    at,
    finalAmountCents,
    reason,
    proposalHash: sha256Hex(envelope.proposal),
  });
  return immutableJson({
    envelope: { ...envelope, decision: decisionRecord },
    applied: decision !== 'rejected',
    domainDraft: decision === 'rejected'
      ? null
      : {
          amountCents: finalAmountCents,
          currency: envelope.proposal.currency,
          sourceSuggestionId: envelope.id,
          sourceDecisionHash: sha256Hex(decisionRecord),
        },
  });
}
