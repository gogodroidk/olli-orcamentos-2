import {
  MONETIZATION_EVENT_VERSION,
  TRIAL_STATES,
} from './monetizationEvents.js';

/**
 * Reconciliação pura de acesso comercial do OLLI Orçamentos.
 *
 * Este módulo não cobra, não escolhe provider, não persiste estado e não
 * concede entitlement em produção. Ele apenas decide, a partir de contratos
 * sintéticos, qual fonte autoritativa pode justificar o acesso e quando uma
 * divergência precisa ser reconciliada pelo servidor.
 */

export const MONETIZATION_ENTITLEMENT_VERSION = '2026-09-01.v1';
export const ENTITLEMENT_PLANS = Object.freeze(['free', 'pro', 'empresa']);
export const ENTITLEMENT_STATUSES = Object.freeze([
  'active',
  'past_due',
  'cancelled',
  'unknown',
]);

const SNAPSHOT_AUTHORITY = 'server_entitlement_snapshot';
const TRIAL_AUTHORITY = 'server_trial_ledger';
const CLIENT_AUTHORITY = 'client_cache';
const PAYMENT_TYPES = Object.freeze([
  'payment.checkout_started',
  'payment.approved',
  'payment.cancelled',
  'subscription.renewed',
]);
const PAYMENT_PROVIDERS = Object.freeze(['stripe', 'mercado_pago', 'unknown']);
const PAYMENT_PLANS = Object.freeze([
  'pro_monthly',
  'pro_annual',
  'pro_12x',
  'empresa_monthly',
  'empresa_annual',
]);

const SNAPSHOT_KEYS = Object.freeze([
  'authority',
  'tenantId',
  'revision',
  'plan',
  'status',
  'effectiveAt',
  'validUntil',
]);
const TRIAL_LEDGER_KEYS = Object.freeze(['authority', 'revision', 'state']);
const TRIAL_STATE_KEYS = Object.freeze([
  'version',
  'tenantId',
  'state',
  'trialId',
  'trigger',
  'eligibleAt',
  'startedAt',
  'endsAt',
  'endedAt',
  'convertedAt',
]);
const PAYMENT_EVENT_KEYS = Object.freeze([
  'version',
  'eventId',
  'idempotencyKey',
  'type',
  'tenantId',
  'actorKey',
  'variant',
  'occurredAt',
  'metadata',
]);
const CLIENT_CLAIM_KEYS = Object.freeze([
  'authority',
  'tenantId',
  'entitlementRevision',
  'plan',
  'capturedAt',
  'validUntil',
]);

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

function inteiroNaoNegativo(v, codigo) {
  exigir(Number.isSafeInteger(v) && v >= 0, codigo);
  return v;
}

function instante(v, codigo) {
  exigir(typeof v === 'string' || v instanceof Date, codigo);
  const data = v instanceof Date ? v : new Date(v);
  exigir(!Number.isNaN(data.getTime()), codigo);
  return Object.freeze({ iso: data.toISOString(), ms: data.getTime() });
}

function instanteOpcional(v, codigo) {
  if (v === null) return null;
  return instante(v, codigo);
}

function validarSnapshot(snapshot) {
  chavesExatas(snapshot, SNAPSHOT_KEYS, 'snapshot_campos_invalidos');
  exigir(snapshot.authority === SNAPSHOT_AUTHORITY, 'snapshot_nao_autoritativo');
  const tenantId = idSeguro(snapshot.tenantId, 'snapshot_tenant_invalido');
  const revision = inteiroNaoNegativo(snapshot.revision, 'snapshot_revision_invalida');
  exigir(ENTITLEMENT_PLANS.includes(snapshot.plan), 'snapshot_plano_invalido');
  exigir(ENTITLEMENT_STATUSES.includes(snapshot.status), 'snapshot_status_invalido');
  const effectiveAt = instante(snapshot.effectiveAt, 'snapshot_effective_at_invalido');
  const validUntil = instante(snapshot.validUntil, 'snapshot_valid_until_invalido');
  exigir(effectiveAt.ms < validUntil.ms, 'snapshot_janela_invalida');
  return Object.freeze({
    tenantId,
    revision,
    plan: snapshot.plan,
    status: snapshot.status,
    effectiveAt,
    validUntil,
  });
}

function validarEstadoTrial(state) {
  chavesExatas(state, TRIAL_STATE_KEYS, 'trial_estado_campos_invalidos');
  exigir(state.version === MONETIZATION_EVENT_VERSION, 'trial_versao_invalida');
  const tenantId = idSeguro(state.tenantId, 'trial_tenant_invalido');
  exigir(TRIAL_STATES.includes(state.state), 'trial_estado_invalido');
  const eligibleAt = instanteOpcional(state.eligibleAt, 'trial_eligible_at_invalido');
  const startedAt = instanteOpcional(state.startedAt, 'trial_started_at_invalido');
  const endsAt = instanteOpcional(state.endsAt, 'trial_ends_at_invalido');
  const endedAt = instanteOpcional(state.endedAt, 'trial_ended_at_invalido');
  const convertedAt = instanteOpcional(state.convertedAt, 'trial_converted_at_invalido');

  if (state.state === 'active') {
    idSeguro(state.trialId, 'trial_id_invalido');
    exigir(startedAt && endsAt && startedAt.ms < endsAt.ms, 'trial_janela_invalida');
    exigir(endedAt === null && convertedAt === null, 'trial_ativo_terminal_invalido');
  }
  if (state.state === 'converted') {
    idSeguro(state.trialId, 'trial_id_invalido');
    exigir(startedAt && endsAt && endedAt && convertedAt, 'trial_convertido_incompleto');
  }
  if (state.state === 'ended') {
    idSeguro(state.trialId, 'trial_id_invalido');
    exigir(startedAt && endsAt && endedAt, 'trial_encerrado_incompleto');
  }

  return Object.freeze({
    tenantId,
    state: state.state,
    trialId: state.trialId,
    eligibleAt,
    startedAt,
    endsAt,
    endedAt,
    convertedAt,
  });
}

function validarTrialLedger(ledger) {
  if (ledger === null || ledger === undefined) return null;
  chavesExatas(ledger, TRIAL_LEDGER_KEYS, 'trial_ledger_campos_invalidos');
  exigir(ledger.authority === TRIAL_AUTHORITY, 'trial_ledger_nao_autoritativo');
  const revision = inteiroNaoNegativo(ledger.revision, 'trial_ledger_revision_invalida');
  return Object.freeze({ revision, state: validarEstadoTrial(ledger.state) });
}

function validarEventoPagamento(evento) {
  if (evento === null || evento === undefined) return null;
  chavesExatas(evento, PAYMENT_EVENT_KEYS, 'payment_event_campos_invalidos');
  exigir(evento.version === MONETIZATION_EVENT_VERSION, 'payment_event_versao_invalida');
  exigir(PAYMENT_TYPES.includes(evento.type), 'payment_event_tipo_invalido');
  const tenantId = idSeguro(evento.tenantId, 'payment_event_tenant_invalido');
  idSeguro(evento.eventId, 'payment_event_id_invalido');
  exigir(evento.idempotencyKey === evento.eventId, 'payment_event_idempotencia_invalida');
  const occurredAt = instante(evento.occurredAt, 'payment_event_occurred_at_invalido');
  objeto(evento.metadata, 'payment_event_metadata_invalida');
  const metadataKeys = Object.keys(evento.metadata).sort();
  const expectedKeys = evento.type === 'subscription.renewed'
    ? ['cycle', 'plan', 'provider']
    : ['plan', 'provider'];
  exigir(
    metadataKeys.length === expectedKeys.length &&
      metadataKeys.every((chave, i) => chave === expectedKeys[i]),
    'payment_event_metadata_invalida',
  );
  exigir(PAYMENT_PROVIDERS.includes(evento.metadata.provider), 'payment_event_provider_invalido');
  exigir(PAYMENT_PLANS.includes(evento.metadata.plan), 'payment_event_plano_invalido');
  if (evento.type === 'subscription.renewed') {
    exigir(Number.isSafeInteger(evento.metadata.cycle) && evento.metadata.cycle > 0, 'payment_event_cycle_invalido');
  }
  return Object.freeze({ tenantId, type: evento.type, occurredAt });
}

function validarClientClaim(claim) {
  if (claim === null || claim === undefined) return null;
  chavesExatas(claim, CLIENT_CLAIM_KEYS, 'client_claim_campos_invalidos');
  exigir(claim.authority === CLIENT_AUTHORITY, 'client_claim_fonte_invalida');
  const tenantId = idSeguro(claim.tenantId, 'client_claim_tenant_invalido');
  const entitlementRevision = inteiroNaoNegativo(
    claim.entitlementRevision,
    'client_claim_revision_invalida',
  );
  exigir(ENTITLEMENT_PLANS.includes(claim.plan), 'client_claim_plano_invalido');
  const capturedAt = instante(claim.capturedAt, 'client_claim_captured_at_invalido');
  const validUntil = instante(claim.validUntil, 'client_claim_valid_until_invalido');
  exigir(capturedAt.ms < validUntil.ms, 'client_claim_janela_invalida');
  return Object.freeze({ tenantId, entitlementRevision, plan: claim.plan, capturedAt, validUntil });
}

function nivelPlano(plan) {
  return ENTITLEMENT_PLANS.indexOf(plan);
}

function resultado({
  tenantId,
  snapshotRevision,
  effectivePlan = 'free',
  source = 'safe_fallback',
  reason,
  temporary = false,
  validUntil = null,
  reconcileRequired = false,
  clientClaimDisposition = 'not_provided',
  paymentSignalObserved = false,
}) {
  return Object.freeze({
    version: MONETIZATION_ENTITLEMENT_VERSION,
    tenantId,
    snapshotRevision,
    effectivePlan,
    canUseProFeatures: effectivePlan === 'pro' || effectivePlan === 'empresa',
    canUseEmpresaFeatures: effectivePlan === 'empresa',
    source,
    reason,
    temporary,
    validUntil,
    reconcileRequired,
    clientClaimDisposition,
    paymentSignalObserved,
    dataDisposition: 'preserve',
  });
}

function claimDisposition(claim, snapshot, now) {
  if (!claim) return 'not_provided';
  if (claim.validUntil.ms <= now.ms) return 'expired';
  if (claim.entitlementRevision > snapshot.revision) return 'ahead_reconcile';
  if (nivelPlano(claim.plan) > nivelPlano(snapshot.plan)) return 'ignored_upgrade';
  return 'matched_or_lower';
}

/**
 * Reconciliador determinístico. `tenantId` representa o contexto autenticado;
 * os demais registros são validados e comparados contra esse escopo.
 */
export function reconciliarEntitlementMonetizacao({
  tenantId,
  now,
  entitlementSnapshot,
  trialLedger = null,
  paymentEvent = null,
  clientClaim = null,
} = {}) {
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const clock = instante(now, 'agora_invalido');
  const snapshot = validarSnapshot(entitlementSnapshot);
  const trial = validarTrialLedger(trialLedger);
  const payment = validarEventoPagamento(paymentEvent);
  const claim = validarClientClaim(clientClaim);
  const paymentSignalObserved = payment !== null;

  const safe = (reason, extras = {}) => resultado({
    tenantId: trustedTenant,
    snapshotRevision: snapshot.revision,
    reason,
    reconcileRequired: true,
    paymentSignalObserved,
    ...extras,
  });

  if (snapshot.tenantId !== trustedTenant) return safe('snapshot_tenant_mismatch');
  if (trial && trial.state.tenantId !== trustedTenant) return safe('trial_tenant_mismatch');
  if (payment && payment.tenantId !== trustedTenant) return safe('payment_tenant_mismatch');
  if (claim && claim.tenantId !== trustedTenant) return safe('client_claim_tenant_mismatch');
  if (payment && payment.occurredAt.ms > clock.ms) return safe('payment_from_future');
  if (claim && claim.capturedAt.ms > clock.ms) return safe('client_claim_from_future');

  const disposition = claimDisposition(claim, snapshot, clock);
  if (disposition === 'ahead_reconcile') {
    return safe('client_revision_ahead', { clientClaimDisposition: disposition });
  }

  const common = {
    tenantId: trustedTenant,
    snapshotRevision: snapshot.revision,
    clientClaimDisposition: disposition,
    paymentSignalObserved,
  };

  if (clock.ms < snapshot.effectiveAt.ms) {
    return safe('snapshot_not_effective', { clientClaimDisposition: disposition });
  }
  if (clock.ms >= snapshot.validUntil.ms) {
    return safe('snapshot_expired', { clientClaimDisposition: disposition });
  }
  if (snapshot.status === 'unknown') {
    return safe('snapshot_status_unknown', { clientClaimDisposition: disposition });
  }
  if (snapshot.plan === 'free' && snapshot.status !== 'active') {
    return safe('snapshot_free_status_inconsistent', { clientClaimDisposition: disposition });
  }
  if (snapshot.status === 'past_due') {
    return safe('payment_past_due_requires_policy', { clientClaimDisposition: disposition });
  }

  const paidActive = snapshot.status === 'active' && snapshot.plan !== 'free';
  const trialActive = Boolean(
    trial &&
      trial.state.state === 'active' &&
      trial.state.startedAt &&
      trial.state.endsAt &&
      trial.state.startedAt.ms <= clock.ms &&
      clock.ms < trial.state.endsAt.ms,
  );

  if (trial && trial.state.state === 'active' && trial.state.startedAt.ms > clock.ms) {
    return safe('trial_from_future', { clientClaimDisposition: disposition });
  }

  if (payment?.type === 'payment.cancelled' && paidActive) {
    return resultado({
      ...common,
      effectivePlan: snapshot.plan,
      source: SNAPSHOT_AUTHORITY,
      reason: 'cancellation_pending_entitlement',
      validUntil: snapshot.validUntil.iso,
      reconcileRequired: true,
    });
  }

  if (paidActive) {
    return resultado({
      ...common,
      effectivePlan: snapshot.plan,
      source: SNAPSHOT_AUTHORITY,
      reason: trialActive ? 'paid_entitlement_trial_overlap' : 'paid_entitlement_active',
      validUntil: snapshot.validUntil.iso,
      reconcileRequired: trialActive,
    });
  }

  if (payment && ['payment.approved', 'subscription.renewed'].includes(payment.type)) {
    if (trialActive) {
      return resultado({
        ...common,
        effectivePlan: 'pro',
        source: TRIAL_AUTHORITY,
        reason: 'payment_pending_entitlement_trial_active',
        temporary: true,
        validUntil: trial.state.endsAt.iso,
        reconcileRequired: true,
      });
    }
    return safe('payment_pending_entitlement', { clientClaimDisposition: disposition });
  }

  if (snapshot.status === 'cancelled') {
    return resultado({
      ...common,
      reason: 'subscription_cancelled',
      validUntil: snapshot.validUntil.iso,
    });
  }

  if (trial?.state.state === 'converted') {
    return safe('converted_trial_without_entitlement', { clientClaimDisposition: disposition });
  }

  if (trial?.state.state === 'active' && !trialActive) {
    return safe('trial_expired_requires_ledger_close', { clientClaimDisposition: disposition });
  }

  if (trialActive) {
    return resultado({
      ...common,
      effectivePlan: 'pro',
      source: TRIAL_AUTHORITY,
      reason: 'authoritative_trial_active',
      temporary: true,
      validUntil: trial.state.endsAt.iso,
    });
  }

  return resultado({
    ...common,
    reason: disposition === 'ignored_upgrade' ? 'client_upgrade_ignored' : 'free_entitlement_active',
    validUntil: snapshot.validUntil.iso,
  });
}
