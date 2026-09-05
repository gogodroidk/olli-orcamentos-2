import { immutableJson, sha256Hex } from '../spikes/shared/canonical.mjs';

export const FIXTURE_NOW = '2026-08-27T12:00:00.000Z';
export const FIXTURE_ORG_A = 'org-fixture-a';
export const FIXTURE_ORG_B = 'org-fixture-b';
export const FIXTURE_OWNER_A = 'user-owner-a';
export const FIXTURE_TECH_A = 'user-tech-a';
export const FIXTURE_OUTSIDER_B = 'user-outsider-b';

export const FIXTURE_DOCUMENT_SCHEMA = immutableJson({
  schemaId: 'olli.quote-service',
  version: 1,
  kind: 'quote',
  title: 'Proposta de serviço — fixture',
  fields: [
    { key: 'customerLabel', required: true, allowNotApplicable: false },
    { key: 'serviceScope', required: true, allowNotApplicable: false },
    { key: 'quantity', required: true, allowNotApplicable: false },
    { key: 'unitPriceCents', required: true, allowNotApplicable: false },
    { key: 'totalCents', required: true, allowNotApplicable: false },
    { key: 'currency', required: true, allowNotApplicable: false },
    { key: 'pmocPlanVersionId', required: false, allowNotApplicable: true },
  ],
  signaturePolicy: {
    requiredRoles: ['client'],
    allowedLevels: ['acceptance', 'drawn_mark', 'advanced_external', 'qualified_external'],
  },
  trustPolicy: {
    automatedConformity: false,
    emitsArt: false,
    replacesResponsibleProfessional: false,
  },
});

export const FIXTURE_QUOTE_PAYLOAD = immutableJson({
  customerLabel: 'cliente-fixture-a',
  serviceScope: 'Higienização preventiva de equipamento fixture',
  quantity: 2,
  unitPriceCents: 22500,
  totalCents: 45000,
  currency: 'BRL',
  pmocPlanVersionId: { notApplicable: true, reason: 'proposta avulsa de fixture' },
});

export const FIXTURE_EVIDENCE = immutableJson([
  {
    id: 'evidence-photo-before',
    kind: 'photo',
    uri: 'private://fixtures/photo-before',
    sha256: sha256Hex('fixture-photo-before-bytes'),
    capturedAt: FIXTURE_NOW,
    actorId: FIXTURE_TECH_A,
    sourceLabel: 'captura sintética antes do serviço',
  },
  {
    id: 'evidence-signature-mark',
    kind: 'signature_mark',
    uri: 'private://fixtures/signature-mark',
    sha256: sha256Hex('fixture-signature-mark-bytes'),
    capturedAt: '2026-08-27T12:10:00.000Z',
    actorId: 'client-fixture-signer',
    sourceLabel: 'rubrica desenhada de fixture; não ICP-Brasil',
  },
]);

export const FIXTURE_PRICING_INPUT = immutableJson({
  organizationId: FIXTURE_ORG_A,
  currency: 'BRL',
  quantity: 2,
  directCosts: [
    {
      id: 'cost-chemical',
      label: 'insumo de higienização',
      unitCostCents: 3500,
      quantity: 2,
      source: {
        kind: 'company_catalog',
        organizationId: FIXTURE_ORG_A,
        ref: 'catalog:product-fixture-1:v1',
      },
    },
  ],
  labor: {
    hours: 3,
    hourlyCostCents: 5000,
    source: {
      kind: 'company_policy',
      organizationId: FIXTURE_ORG_A,
      ref: 'policy:labor-fixture:v1',
    },
  },
  travelCents: 3000,
  overheadBps: 1000,
  contingencyBps: 500,
  taxBps: 600,
  targetMarginBps: 3000,
  roundingStepCents: 500,
});

export const FIXTURE_PUBLIC_CATALOG = immutableJson([
  {
    id: 'service-cleaning-fixture',
    serviceCode: 'hvac_preventive_cleaning',
    label: 'Higienização preventiva de equipamento fixture',
    unitPriceCents: 22500,
    currency: 'BRL',
    version: 1,
  },
]);
