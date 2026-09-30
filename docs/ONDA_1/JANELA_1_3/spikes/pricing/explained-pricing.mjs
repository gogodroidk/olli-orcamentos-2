import {
  assertIdentifier,
  immutableJson,
  invariant,
  isPlainObject,
  sha256Hex,
} from '../shared/canonical.mjs';

const SOURCE_KINDS = new Set(['company_catalog', 'company_policy', 'company_manual']);

function assertMoney(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  invariant(Number.isInteger(value) && value >= 0, `${field} deve ser inteiro em centavos`);
  return value;
}

function assertRate(value, field) {
  invariant(Number.isInteger(value) && value >= 0 && value < 10_000, `${field} deve usar basis points entre 0 e 9999`);
  return value;
}

function validateSource(source, organizationId, field) {
  invariant(isPlainObject(source), `${field}.source obrigatória`);
  invariant(SOURCE_KINDS.has(source.kind), `${field}.source.kind não é fonte interna permitida`);
  invariant(source.organizationId === organizationId, `${field}.source cruza tenant`);
  invariant(typeof source.ref === 'string' && /^(catalog|policy|manual):/.test(source.ref), `${field}.source.ref inválida`);
  return immutableJson(source);
}

function ceilRatio(numerator, denominator) {
  return Math.ceil(numerator / denominator);
}

function roundUp(value, step) {
  return Math.ceil(value / step) * step;
}

function publicManualRequired(input, missing) {
  return immutableJson({
    status: 'manual_required',
    public: {
      currency: input.currency,
      quantity: input.quantity,
      suggestedUnitPriceCents: null,
      suggestedTotalCents: null,
      basis: 'manual_required',
      explanation: 'Existem custos internos ausentes. Defina o preço manualmente antes de criar o orçamento.',
      uncertainty: 'Não há base suficiente para calcular preço e margem sem inventar valores.',
      requiresHumanApproval: true,
    },
    private: {
      organizationId: input.organizationId,
      missingCostRefs: missing,
      ownCompanyDataOnly: true,
    },
  });
}

export function calculateExplainedPrice(input) {
  invariant(isPlainObject(input), 'entrada de preço inválida');
  assertIdentifier(input.organizationId, 'pricing.organizationId');
  invariant(input.currency === 'BRL', 'spike aceita somente BRL');
  invariant(Number.isInteger(input.quantity) && input.quantity > 0 && input.quantity <= 10_000, 'pricing.quantity inválida');
  invariant(Array.isArray(input.directCosts), 'pricing.directCosts inválido');

  const missing = [];
  let directTotalCents = 0;
  const costSources = [];
  for (const [index, cost] of input.directCosts.entries()) {
    invariant(isPlainObject(cost), `directCosts[${index}] inválido`);
    assertIdentifier(cost.id, `directCosts[${index}].id`);
    invariant(typeof cost.label === 'string' && cost.label.trim().length > 0, `directCosts[${index}].label obrigatório`);
    invariant(Number.isFinite(cost.quantity) && cost.quantity > 0, `directCosts[${index}].quantity inválida`);
    validateSource(cost.source, input.organizationId, `directCosts[${index}]`);
    if (cost.unitCostCents === null) {
      missing.push(cost.source.ref);
      continue;
    }
    assertMoney(cost.unitCostCents, `directCosts[${index}].unitCostCents`);
    directTotalCents += Math.round(cost.unitCostCents * cost.quantity);
    costSources.push(cost.source.ref);
  }

  invariant(isPlainObject(input.labor), 'pricing.labor obrigatório');
  invariant(Number.isFinite(input.labor.hours) && input.labor.hours > 0, 'labor.hours inválido');
  validateSource(input.labor.source, input.organizationId, 'labor');
  if (input.labor.hourlyCostCents === null) missing.push(input.labor.source.ref);
  else assertMoney(input.labor.hourlyCostCents, 'labor.hourlyCostCents');
  if (missing.length > 0) return publicManualRequired(input, [...new Set(missing)].sort());

  const laborTotalCents = Math.round(input.labor.hours * input.labor.hourlyCostCents);
  costSources.push(input.labor.source.ref);
  const travelCents = assertMoney(input.travelCents, 'pricing.travelCents');
  const overheadBps = assertRate(input.overheadBps, 'pricing.overheadBps');
  const contingencyBps = assertRate(input.contingencyBps, 'pricing.contingencyBps');
  const taxBps = assertRate(input.taxBps, 'pricing.taxBps');
  const targetMarginBps = assertRate(input.targetMarginBps, 'pricing.targetMarginBps');
  invariant(taxBps + targetMarginBps < 10_000, 'imposto + margem tornam o preço impossível');
  invariant(Number.isInteger(input.roundingStepCents) && input.roundingStepCents > 0, 'roundingStepCents inválido');

  const baseCostCents = directTotalCents + laborTotalCents + travelCents;
  const overheadCents = ceilRatio(baseCostCents * overheadBps, 10_000);
  const contingencyBase = baseCostCents + overheadCents;
  const contingencyCents = ceilRatio(contingencyBase * contingencyBps, 10_000);
  const totalCostCents = baseCostCents + overheadCents + contingencyCents;
  const minimumTotalCents = ceilRatio(totalCostCents * 10_000, 10_000 - taxBps - targetMarginBps);
  const suggestedTotalCents = roundUp(minimumTotalCents, input.roundingStepCents);
  const suggestedUnitPriceCents = ceilRatio(suggestedTotalCents, input.quantity);
  const taxEstimateCents = Math.round(suggestedTotalCents * taxBps / 10_000);
  const grossMarginCents = suggestedTotalCents - taxEstimateCents - totalCostCents;
  const grossMarginBps = Math.round(grossMarginCents * 10_000 / suggestedTotalCents);

  const assumptions = [
    'tributos estimados conforme política interna vigente',
    'política comercial interna de margem aplicada sem expor seu valor',
    'arredondamento comercial interno aplicado',
    'cálculo baseado exclusivamente em dados da própria empresa',
  ];
  const calculationInput = {
    organizationId: input.organizationId,
    currency: input.currency,
    quantity: input.quantity,
    directTotalCents,
    laborTotalCents,
    travelCents,
    overheadBps,
    contingencyBps,
    taxBps,
    targetMarginBps,
    roundingStepCents: input.roundingStepCents,
    costSources: [...new Set(costSources)].sort(),
  };

  return immutableJson({
    status: 'calculated',
    public: {
      currency: input.currency,
      quantity: input.quantity,
      suggestedUnitPriceCents,
      suggestedTotalCents,
      basis: 'own_company_costs',
      explanation: 'Preço calculado com custos e políticas internas cadastradas, impostos estimados, contingência e margem-alvo. Revise antes de usar.',
      uncertainty: 'O cálculo não conhece condição real do local, escopo adicional, mercado externo nem aceite do cliente.',
      assumptions,
      requiresHumanApproval: true,
      methodVersion: 'explained-price-v1',
    },
    private: {
      organizationId: input.organizationId,
      directTotalCents,
      laborTotalCents,
      travelCents,
      overheadCents,
      contingencyCents,
      totalCostCents,
      taxEstimateCents,
      grossMarginCents,
      grossMarginBps,
      costSources: [...new Set(costSources)].sort(),
      ownCompanyDataOnly: true,
      calculationHash: sha256Hex(calculationInput),
    },
  });
}

export function assertPublicPricingSafe(publicPricing) {
  invariant(isPlainObject(publicPricing), 'preço público inválido');
  const serialized = JSON.stringify(publicPricing).toLowerCase();
  for (const forbidden of ['totalcost', 'directtotal', 'labortotal', 'grossmargin', 'costsources', 'organizationid', 'calculationhash']) {
    invariant(!serialized.includes(forbidden), `preço público vazou campo privado: ${forbidden}`);
  }
  invariant(publicPricing.requiresHumanApproval === true, 'preço público deve exigir aprovação humana');
  if (publicPricing.basis === 'manual_required') {
    invariant(publicPricing.suggestedUnitPriceCents === null, 'preço ausente não pode virar zero');
    invariant(publicPricing.suggestedTotalCents === null, 'total ausente não pode virar zero');
  } else {
    assertMoney(publicPricing.suggestedUnitPriceCents, 'public.suggestedUnitPriceCents');
    assertMoney(publicPricing.suggestedTotalCents, 'public.suggestedTotalCents');
  }
  return true;
}
