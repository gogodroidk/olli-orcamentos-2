/**
 * Fixture puro do experimento comercial do OLLI Orçamentos.
 *
 * Não renderiza UI, não atribui variante no cliente, não inicia trial, não
 * cobra e não acessa provider. A camada futura recebe uma atribuição do
 * servidor e usa esta decisão apenas depois dos gates humanos/técnicos.
 */

export const MONETIZATION_OFFER_VERSION = '2026-09-01.v1';
export const MONETIZATION_OFFER_VARIANTS = Object.freeze([
  'control',
  'contextual_trial',
]);
export const MONETIZATION_OFFER_STAGES = Object.freeze([
  'signup',
  'onboarding',
  'first_quote',
  'quote_editing',
  'pdf_export',
  'whatsapp_share',
  'post_value',
  'pro_feature_attempt',
  'dashboard_return',
]);
export const MONETIZATION_OFFER_GATES = Object.freeze([
  'cashSandboxVerified',
  'signedWebhookVerified',
  'serverEntitlementVerified',
  'trialLedgerVerified',
  'downgradeVerified',
  'eventsVerified',
]);

const ASSIGNMENT_KEYS = Object.freeze(['authority', 'experimentId', 'variant']);
const ACTIVATION_KEYS = Object.freeze([
  'stage',
  'quotesCreated',
  'pdfsShared',
  'attemptedProFeature',
]);
const CORE_FLOW_STAGES = Object.freeze([
  'signup',
  'onboarding',
  'first_quote',
  'quote_editing',
  'pdf_export',
  'whatsapp_share',
]);

const COPY = Object.freeze({
  control: Object.freeze({
    headline: 'Conheça os recursos Pro',
    body: 'Veja recursos para ganhar tempo e apresentar seu trabalho com mais profissionalismo.',
    primaryAction: 'Ver recursos Pro',
    secondaryAction: 'Agora não',
    disclosure: 'Você pode continuar usando o plano gratuito normalmente.',
  }),
  contextual_trial: Object.freeze({
    headline: 'Experimente o Pro por 14 dias',
    body: 'Teste recursos profissionais depois de criar valor no OLLI Orçamentos.',
    primaryAction: 'Começar teste gratuito',
    secondaryAction: 'Continuar no gratuito',
    disclosure: 'São 14 dias, sem cartão e sem cobrança automática. Ao terminar, sua conta continua no gratuito e seus dados permanecem.',
  }),
});

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(v, codigo) {
  exigir(v && typeof v === 'object' && !Array.isArray(v), codigo);
  return v;
}

function chavesExatas(v, permitidas, codigo) {
  objeto(v, codigo);
  const atuais = Object.keys(v).sort();
  const esperadas = [...permitidas].sort();
  exigir(
    atuais.length === esperadas.length && atuais.every((chave, i) => chave === esperadas[i]),
    codigo,
  );
}

function idSeguro(v, codigo) {
  exigir(
    typeof v === 'string' &&
      v.length > 0 &&
      v.length <= 160 &&
      /^[a-zA-Z0-9._:-]+$/.test(v),
    codigo,
  );
  return v;
}

function validarAssignment(assignment) {
  chavesExatas(assignment, ASSIGNMENT_KEYS, 'assignment_campos_invalidos');
  exigir(assignment.authority === 'server_experiment_assignment', 'assignment_nao_autoritativo');
  const experimentId = idSeguro(assignment.experimentId, 'experiment_id_invalido');
  exigir(MONETIZATION_OFFER_VARIANTS.includes(assignment.variant), 'variant_invalida');
  return Object.freeze({ experimentId, variant: assignment.variant });
}

function validarActivation(activation) {
  chavesExatas(activation, ACTIVATION_KEYS, 'activation_campos_invalidos');
  exigir(MONETIZATION_OFFER_STAGES.includes(activation.stage), 'activation_stage_invalido');
  exigir(Number.isSafeInteger(activation.quotesCreated) && activation.quotesCreated >= 0, 'quotes_created_invalido');
  exigir(Number.isSafeInteger(activation.pdfsShared) && activation.pdfsShared >= 0, 'pdfs_shared_invalido');
  exigir(typeof activation.attemptedProFeature === 'boolean', 'attempted_pro_feature_invalido');
  return Object.freeze({ ...activation });
}

function validarReadiness(readiness) {
  chavesExatas(readiness, MONETIZATION_OFFER_GATES, 'readiness_campos_invalidos');
  for (const gate of MONETIZATION_OFFER_GATES) {
    exigir(typeof readiness[gate] === 'boolean', 'readiness_gate_invalido');
  }
  return Object.freeze({ ...readiness });
}

function marcoDeValor(activation) {
  if (activation.attemptedProFeature) return 'pro_feature_attempt';
  if (activation.pdfsShared >= 1) return 'first_pdf_shared';
  if (activation.quotesCreated >= 3) return 'third_quote_created';
  return null;
}

function freezeOferta(oferta) {
  return Object.freeze({
    ...oferta,
    missingGates: Object.freeze([...oferta.missingGates]),
    copy: Object.freeze({ ...oferta.copy }),
  });
}

/**
 * Produz uma decisão de apresentação. `tenantId` e `assignment` devem vir de
 * contexto confiável; nenhuma entrada aceita PII, HTML, preço ou provider.
 */
export function criarOfertaExperimento({
  tenantId,
  assignment,
  activation,
  readiness,
} = {}) {
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const assigned = validarAssignment(assignment);
  const activated = validarActivation(activation);
  const ready = validarReadiness(readiness);
  const missingGates = MONETIZATION_OFFER_GATES.filter((gate) => !ready[gate]);
  const milestone = marcoDeValor(activated);
  const coreFlowBlocked = CORE_FLOW_STAGES.includes(activated.stage);
  const copy = COPY[assigned.variant];

  let canRender = true;
  let reason = 'eligible';
  if (coreFlowBlocked) {
    canRender = false;
    reason = 'core_flow_protected';
  } else if (!milestone) {
    canRender = false;
    reason = 'activation_milestone_missing';
  } else if (assigned.variant === 'contextual_trial' && missingGates.length > 0) {
    canRender = false;
    reason = 'technical_gates_incomplete';
  }

  return freezeOferta({
    version: MONETIZATION_OFFER_VERSION,
    tenantId: trustedTenant,
    experimentId: assigned.experimentId,
    variant: assigned.variant,
    surface: assigned.variant === 'control' ? 'passive_pro_preview' : 'contextual_trial_opt_in',
    canRender,
    reason,
    milestone,
    coreFlowInterrupted: false,
    trialDays: assigned.variant === 'contextual_trial' ? 14 : 0,
    requiresCard: false,
    autoRenews: false,
    fallbackPlan: 'free',
    authoritativeEndDateRequiredAfterOptIn: assigned.variant === 'contextual_trial',
    missingGates,
    copy,
  });
}
