import { createHash } from 'node:crypto';
import {
  MONETIZATION_EVENT_TYPES,
  MONETIZATION_EVENT_VERSION,
  MONETIZATION_VARIANTS,
} from './monetizationEvents.js';

/**
 * Journal puro do experimento de conversão do OLLI Orçamentos.
 *
 * Não envia analytics, não concede plano e não armazena metadata do provider.
 * Cada journal pertence a um tenant + ator pseudonimizado + assignment fixo.
 */

export const MONETIZATION_JOURNAL_VERSION = '2026-09-01.v1';

const ASSIGNMENT_KEYS = Object.freeze(['authority', 'experimentId', 'variant']);
const EVENT_KEYS = Object.freeze([
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
const STATE_KEYS = Object.freeze([
  'version',
  'tenantId',
  'actorKey',
  'experimentId',
  'variant',
  'revision',
  'lastRecordedAt',
  'entries',
]);
const ENTRY_KEYS = Object.freeze([
  'eventId',
  'eventHash',
  'type',
  'occurredAt',
  'recordedAt',
  'metricValue',
]);

const CHANNELS = Object.freeze(['facebook', 'whatsapp', 'organic', 'other']);
const DELIVERY = Object.freeze(['pdf', 'link', 'whatsapp']);
const FEATURES = Object.freeze(['brand', 'template', 'ai', 'radar', 'reports', 'goals']);
const PROVIDERS = Object.freeze(['stripe', 'mercado_pago', 'unknown']);
const PAYMENT_PLANS = Object.freeze(['pro_monthly', 'pro_annual', 'pro_12x', 'empresa_monthly', 'empresa_annual']);
const TRIGGERS = Object.freeze(['first_pdf', 'third_quote', 'pro_attempt', 'ai_limit', 'radar_return']);

const METADATA_KEYS = Object.freeze({
  'signup.completed': Object.freeze(['channel']),
  'quote.created': Object.freeze(['count']),
  'pdf.shared': Object.freeze(['delivery']),
  'pro.preview.viewed': Object.freeze(['feature']),
  'pro.cta.clicked': Object.freeze(['feature']),
  'trial.eligible': Object.freeze(['trigger']),
  'trial.started': Object.freeze(['trialId']),
  'trial.ended': Object.freeze(['converted', 'trialId']),
  'payment.checkout_started': Object.freeze(['plan', 'provider']),
  'payment.approved': Object.freeze(['plan', 'provider']),
  'payment.cancelled': Object.freeze(['plan', 'provider']),
  'subscription.renewed': Object.freeze(['cycle', 'plan', 'provider']),
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

function idSeguro(v, codigo, limite = 200) {
  exigir(
    typeof v === 'string' &&
      v.length > 0 &&
      v.length <= limite &&
      /^[a-zA-Z0-9._:-]+$/.test(v),
    codigo,
  );
  return v;
}

function instante(v, codigo) {
  exigir(typeof v === 'string' || v instanceof Date, codigo);
  const data = v instanceof Date ? v : new Date(v);
  exigir(!Number.isNaN(data.getTime()), codigo);
  return Object.freeze({ iso: data.toISOString(), ms: data.getTime() });
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function hash(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function congelarEstado(state) {
  return Object.freeze({
    ...state,
    entries: Object.freeze(state.entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

function validarAssignment(assignment) {
  chavesExatas(assignment, ASSIGNMENT_KEYS, 'assignment_campos_invalidos');
  exigir(assignment.authority === 'server_experiment_assignment', 'assignment_nao_autoritativo');
  const experimentId = idSeguro(assignment.experimentId, 'experiment_id_invalido');
  exigir(MONETIZATION_VARIANTS.includes(assignment.variant), 'variant_invalida');
  return Object.freeze({ experimentId, variant: assignment.variant });
}

function validarMetadata(type, metadata) {
  const expected = METADATA_KEYS[type];
  chavesExatas(metadata, expected, 'evento_metadata_invalida');
  if ('channel' in metadata) exigir(CHANNELS.includes(metadata.channel), 'evento_metadata_invalida');
  if ('delivery' in metadata) exigir(DELIVERY.includes(metadata.delivery), 'evento_metadata_invalida');
  if ('feature' in metadata) exigir(FEATURES.includes(metadata.feature), 'evento_metadata_invalida');
  if ('trigger' in metadata) exigir(TRIGGERS.includes(metadata.trigger), 'evento_metadata_invalida');
  if ('provider' in metadata) exigir(PROVIDERS.includes(metadata.provider), 'evento_metadata_invalida');
  if ('plan' in metadata) exigir(PAYMENT_PLANS.includes(metadata.plan), 'evento_metadata_invalida');
  if ('count' in metadata) exigir(Number.isSafeInteger(metadata.count) && metadata.count > 0, 'evento_metadata_invalida');
  if ('cycle' in metadata) exigir(Number.isSafeInteger(metadata.cycle) && metadata.cycle > 0, 'evento_metadata_invalida');
  if ('converted' in metadata) exigir(typeof metadata.converted === 'boolean', 'evento_metadata_invalida');
  if ('trialId' in metadata) idSeguro(metadata.trialId, 'evento_metadata_invalida');
  return Object.freeze({ ...metadata });
}

function validarEvento(evento) {
  chavesExatas(evento, EVENT_KEYS, 'evento_campos_invalidos');
  exigir(evento.version === MONETIZATION_EVENT_VERSION, 'evento_versao_invalida');
  exigir(MONETIZATION_EVENT_TYPES.includes(evento.type), 'evento_tipo_invalido');
  const tenantId = idSeguro(evento.tenantId, 'evento_tenant_invalido');
  const actorKey = idSeguro(evento.actorKey, 'evento_actor_invalido');
  exigir(MONETIZATION_VARIANTS.includes(evento.variant), 'evento_variant_invalida');
  const eventId = idSeguro(evento.eventId, 'evento_id_invalido', 512);
  exigir(evento.idempotencyKey === eventId, 'evento_idempotencia_invalida');
  exigir(eventId.startsWith(`monetization:${tenantId}:${evento.type}:`), 'evento_id_incompativel');
  const occurredAt = instante(evento.occurredAt, 'evento_occurred_at_invalido');
  const metadata = validarMetadata(evento.type, evento.metadata);
  return Object.freeze({
    version: evento.version,
    eventId,
    idempotencyKey: eventId,
    type: evento.type,
    tenantId,
    actorKey,
    variant: evento.variant,
    occurredAt: occurredAt.iso,
    occurredAtMs: occurredAt.ms,
    metadata,
  });
}

function validarEstado(state) {
  chavesExatas(state, STATE_KEYS, 'estado_campos_invalidos');
  exigir(state.version === MONETIZATION_JOURNAL_VERSION, 'estado_versao_invalida');
  idSeguro(state.tenantId, 'estado_tenant_invalido');
  idSeguro(state.actorKey, 'estado_actor_invalido');
  idSeguro(state.experimentId, 'estado_experiment_id_invalido');
  exigir(MONETIZATION_VARIANTS.includes(state.variant), 'estado_variant_invalida');
  exigir(Number.isSafeInteger(state.revision) && state.revision >= 0, 'estado_revision_invalida');
  instante(state.lastRecordedAt, 'estado_last_recorded_at_invalido');
  exigir(Array.isArray(state.entries), 'estado_entries_invalido');
  const ids = new Set();
  for (const entry of state.entries) {
    chavesExatas(entry, ENTRY_KEYS, 'estado_entry_campos_invalidos');
    idSeguro(entry.eventId, 'estado_entry_id_invalido', 512);
    exigir(/^[a-f0-9]{64}$/.test(entry.eventHash), 'estado_entry_hash_invalido');
    exigir(MONETIZATION_EVENT_TYPES.includes(entry.type), 'estado_entry_tipo_invalido');
    instante(entry.occurredAt, 'estado_entry_occurred_at_invalido');
    instante(entry.recordedAt, 'estado_entry_recorded_at_invalido');
    exigir(entry.metricValue === null || (Number.isSafeInteger(entry.metricValue) && entry.metricValue > 0), 'estado_entry_metric_invalida');
    exigir(!ids.has(entry.eventId), 'estado_entry_duplicada');
    ids.add(entry.eventId);
  }
}

export function criarJournalExperimentoMonetizacao({
  tenantId,
  actorKey,
  assignment,
  createdAt,
} = {}) {
  const assigned = validarAssignment(assignment);
  const created = instante(createdAt, 'created_at_invalido');
  return congelarEstado({
    version: MONETIZATION_JOURNAL_VERSION,
    tenantId: idSeguro(tenantId, 'tenant_obrigatorio'),
    actorKey: idSeguro(actorKey, 'actor_key_obrigatorio'),
    experimentId: assigned.experimentId,
    variant: assigned.variant,
    revision: 0,
    lastRecordedAt: created.iso,
    entries: [],
  });
}

export function registrarEventoExperimentoMonetizacao(
  state,
  evento,
  { tenantId, actorKey, expectedRevision, recordedAt } = {},
) {
  validarEstado(state);
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const trustedActor = idSeguro(actorKey, 'actor_key_obrigatorio');
  exigir(state.tenantId === trustedTenant, 'tenant_divergente');
  exigir(state.actorKey === trustedActor, 'actor_divergente');
  const validEvent = validarEvento(evento);
  exigir(validEvent.tenantId === trustedTenant, 'evento_tenant_divergente');
  exigir(validEvent.actorKey === trustedActor, 'evento_actor_divergente');
  exigir(validEvent.variant === state.variant, 'evento_variant_divergente');
  const recorded = instante(recordedAt, 'recorded_at_invalido');
  exigir(validEvent.occurredAtMs <= recorded.ms, 'evento_futuro');

  const eventHash = hash({
    version: validEvent.version,
    eventId: validEvent.eventId,
    idempotencyKey: validEvent.idempotencyKey,
    type: validEvent.type,
    tenantId: validEvent.tenantId,
    actorKey: validEvent.actorKey,
    variant: validEvent.variant,
    occurredAt: validEvent.occurredAt,
    metadata: validEvent.metadata,
  });
  const previous = state.entries.find((entry) => entry.eventId === validEvent.eventId);
  if (previous) {
    exigir(previous.eventHash === eventHash, 'evento_replay_divergente');
    return Object.freeze({ appended: false, replayed: true, state });
  }

  exigir(Number.isSafeInteger(expectedRevision) && expectedRevision === state.revision, 'revision_divergente');
  const lastRecorded = instante(state.lastRecordedAt, 'estado_last_recorded_at_invalido');
  exigir(recorded.ms >= lastRecorded.ms, 'recorded_at_regressivo');
  const metricValue = validEvent.type === 'quote.created'
    ? validEvent.metadata.count
    : validEvent.type === 'subscription.renewed'
      ? validEvent.metadata.cycle
      : null;
  const entry = Object.freeze({
    eventId: validEvent.eventId,
    eventHash,
    type: validEvent.type,
    occurredAt: validEvent.occurredAt,
    recordedAt: recorded.iso,
    metricValue,
  });
  const next = congelarEstado({
    ...state,
    revision: state.revision + 1,
    lastRecordedAt: recorded.iso,
    entries: [...state.entries, entry],
  });
  return Object.freeze({ appended: true, replayed: false, state: next });
}

function contar(entries, type) {
  return entries.filter((entry) => entry.type === type).length;
}

function indice(entries, type) {
  return entries.findIndex((entry) => entry.type === type);
}

function ordemInvalida(entries, before, after) {
  const beforeIndex = indice(entries, before);
  const afterIndex = indice(entries, after);
  return afterIndex >= 0 && (beforeIndex < 0 || beforeIndex > afterIndex);
}

export function resumirJournalExperimentoMonetizacao(
  state,
  { tenantId, actorKey } = {},
) {
  validarEstado(state);
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const trustedActor = idSeguro(actorKey, 'actor_key_obrigatorio');
  exigir(state.tenantId === trustedTenant, 'tenant_divergente');
  exigir(state.actorKey === trustedActor, 'actor_divergente');

  const signals = Object.freeze({
    signups: contar(state.entries, 'signup.completed'),
    quoteEvents: contar(state.entries, 'quote.created'),
    pdfShares: contar(state.entries, 'pdf.shared'),
    previewViews: contar(state.entries, 'pro.preview.viewed'),
    ctaClicks: contar(state.entries, 'pro.cta.clicked'),
    trialEligible: contar(state.entries, 'trial.eligible'),
    trialsStarted: contar(state.entries, 'trial.started'),
    trialsEnded: contar(state.entries, 'trial.ended'),
    checkoutsStarted: contar(state.entries, 'payment.checkout_started'),
    paymentsApproved: contar(state.entries, 'payment.approved'),
    paymentsCancelled: contar(state.entries, 'payment.cancelled'),
    subscriptionsRenewed: contar(state.entries, 'subscription.renewed'),
  });
  const quoteCounts = state.entries
    .filter((entry) => entry.type === 'quote.created')
    .map((entry) => entry.metricValue);
  const anomalies = [];
  if (ordemInvalida(state.entries, 'pro.preview.viewed', 'pro.cta.clicked')) anomalies.push('cta_without_prior_preview');
  if (ordemInvalida(state.entries, 'trial.eligible', 'trial.started')) anomalies.push('trial_started_without_eligibility');
  if (ordemInvalida(state.entries, 'trial.started', 'trial.ended')) anomalies.push('trial_ended_without_start');
  if (ordemInvalida(state.entries, 'payment.checkout_started', 'payment.approved')) anomalies.push('payment_without_checkout');
  if (ordemInvalida(state.entries, 'payment.approved', 'subscription.renewed')) anomalies.push('renewal_without_payment');
  if (ordemInvalida(state.entries, 'payment.approved', 'payment.cancelled')) anomalies.push('cancellation_without_payment');
  if (quoteCounts.some((count, index) => index > 0 && count < quoteCounts[index - 1])) anomalies.push('quote_count_regression');

  return Object.freeze({
    version: MONETIZATION_JOURNAL_VERSION,
    tenantId: trustedTenant,
    actorKey: trustedActor,
    experimentId: state.experimentId,
    variant: state.variant,
    stateRevision: state.revision,
    signals,
    denominators: Object.freeze({
      ctaRate: signals.previewViews,
      trialStartRate: signals.trialEligible,
      trialToPaidRate: signals.trialsEnded,
      secondCycleRate: signals.paymentsApproved,
    }),
    latestQuoteCount: quoteCounts.length ? Math.max(...quoteCounts) : 0,
    anomalies: Object.freeze(anomalies),
    reconcileRequired: anomalies.length > 0,
    entitlementGranted: false,
    conversionValidated: false,
    evidenceBoundary: 'analytics_signal_only',
  });
}
