import { createHash } from 'node:crypto';

/**
 * Journal puro de decisões/resultados por canal do OLLI Orçamentos.
 *
 * Não persiste, não envia, não conhece destinatário/token/provider e não
 * recebe conteúdo da notificação. Um adapter futuro poderá persistir o estado
 * somente depois dos gates de migration e ambiente.
 */

export const NOTIFICATION_DELIVERY_JOURNAL_VERSION = '2026-09-01.v1';

const CHANNELS = Object.freeze(['in_app', 'push', 'web_push', 'email']);
const KINDS = Object.freeze(['security', 'operational', 'education', 'engagement']);
const DECISION_REASONS = Object.freeze([
  'allowed',
  'channel_disabled',
  'quiet_hours',
  'daily_cap',
  'sunday_quiet',
  'invalid_preferences',
  'invalid_context',
  'already_delivered',
  'capability_unavailable',
  'channel_limit',
]);
const ENTRY_STATUSES = Object.freeze(['planned', 'skipped', 'delivered', 'failed']);
const STATE_KEYS = Object.freeze([
  'version',
  'tenantId',
  'actorKey',
  'createdAt',
  'revision',
  'lastRecordedAt',
  'entries',
  'operations',
]);
const CONTEXT_KEYS = Object.freeze(['tenantId', 'actorKey', 'expectedRevision', 'operationId', 'now']);
const PLAN_KEYS = Object.freeze(['version', 'eventId', 'kind', 'selectedChannels', 'decisions']);
const DECISION_KEYS = Object.freeze(['channel', 'selected', 'reason']);
const OUTCOME_KEYS = Object.freeze(['eventId', 'channel', 'status', 'failureCode']);
const ENTRY_KEYS = Object.freeze([
  'eventId',
  'kind',
  'channel',
  'selected',
  'decisionReason',
  'status',
  'decidedAt',
  'outcomeAt',
  'failureCode',
]);
const OPERATION_KEYS = Object.freeze(['operationId', 'commandHash', 'revision']);
const PROJECTION_KEYS = Object.freeze(['tenantId', 'actorKey', 'eventId']);

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(value, codigo) {
  exigir(value && typeof value === 'object' && !Array.isArray(value), codigo);
  return value;
}

function chavesExatas(value, keys, codigo) {
  const record = objeto(value, codigo);
  const atuais = Object.keys(record).sort();
  const esperadas = [...keys].sort();
  exigir(
    atuais.length === esperadas.length && atuais.every((key, index) => key === esperadas[index]),
    codigo,
  );
}

function idSeguro(value, codigo, max = 512) {
  exigir(
    typeof value === 'string'
      && value.length > 0
      && value.length <= max
      && /^[a-zA-Z0-9._:-]+$/.test(value),
    codigo,
  );
  return value;
}

function iso(value, codigo) {
  exigir(typeof value === 'string', codigo);
  const millis = Date.parse(value);
  exigir(Number.isFinite(millis) && new Date(millis).toISOString() === value, codigo);
  return value;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function congelar(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) congelar(nested);
  return Object.freeze(value);
}

function validarDecisao(decision) {
  chavesExatas(decision, DECISION_KEYS, 'decision_campos_invalidos');
  exigir(CHANNELS.includes(decision.channel), 'decision_channel_invalido');
  exigir(typeof decision.selected === 'boolean', 'decision_selected_invalido');
  exigir(DECISION_REASONS.includes(decision.reason), 'decision_reason_invalido');
  exigir(decision.selected === (decision.reason === 'allowed'), 'decision_inconsistente');
  return decision;
}

function validarPlano(plan) {
  chavesExatas(plan, PLAN_KEYS, 'plan_campos_invalidos');
  idSeguro(plan.version, 'plan_version_invalida');
  idSeguro(plan.eventId, 'plan_event_id_invalido');
  exigir(KINDS.includes(plan.kind), 'plan_kind_invalido');
  exigir(Array.isArray(plan.selectedChannels), 'plan_selected_channels_invalidos');
  exigir(plan.selectedChannels.every((channel) => CHANNELS.includes(channel)), 'plan_selected_channels_invalidos');
  exigir(new Set(plan.selectedChannels).size === plan.selectedChannels.length, 'plan_selected_channels_invalidos');
  exigir(Array.isArray(plan.decisions) && plan.decisions.length > 0 && plan.decisions.length <= CHANNELS.length, 'plan_decisions_invalidas');
  plan.decisions.forEach(validarDecisao);
  const decisionChannels = plan.decisions.map((decision) => decision.channel);
  exigir(new Set(decisionChannels).size === decisionChannels.length, 'plan_decisions_duplicadas');
  const selectedByDecisions = plan.decisions.filter((decision) => decision.selected).map((decision) => decision.channel);
  exigir(JSON.stringify(selectedByDecisions) === JSON.stringify(plan.selectedChannels), 'plan_selected_divergente');
  return plan;
}

function validarEntrada(entry) {
  chavesExatas(entry, ENTRY_KEYS, 'entry_campos_invalidos');
  idSeguro(entry.eventId, 'entry_event_id_invalido');
  exigir(KINDS.includes(entry.kind), 'entry_kind_invalido');
  exigir(CHANNELS.includes(entry.channel), 'entry_channel_invalido');
  exigir(typeof entry.selected === 'boolean', 'entry_selected_invalido');
  exigir(DECISION_REASONS.includes(entry.decisionReason), 'entry_reason_invalido');
  exigir(ENTRY_STATUSES.includes(entry.status), 'entry_status_invalido');
  iso(entry.decidedAt, 'entry_decided_at_invalido');
  exigir(entry.outcomeAt === null || iso(entry.outcomeAt, 'entry_outcome_at_invalido'), 'entry_outcome_at_invalido');
  exigir(entry.failureCode === null || idSeguro(entry.failureCode, 'entry_failure_code_invalido', 128), 'entry_failure_code_invalido');
  if (!entry.selected) {
    exigir(entry.status === 'skipped' && entry.outcomeAt === null && entry.failureCode === null, 'entry_skipped_inconsistente');
  } else if (entry.status === 'planned') {
    exigir(entry.decisionReason === 'allowed' && entry.outcomeAt === null && entry.failureCode === null, 'entry_planned_inconsistente');
  } else if (entry.status === 'delivered') {
    exigir(entry.outcomeAt !== null && entry.failureCode === null, 'entry_delivered_inconsistente');
  } else if (entry.status === 'failed') {
    exigir(entry.outcomeAt !== null && entry.failureCode !== null, 'entry_failed_inconsistente');
  }
  if (entry.outcomeAt !== null) {
    exigir(Date.parse(entry.outcomeAt) >= Date.parse(entry.decidedAt), 'entry_clock_regressivo');
  }
  return entry;
}

function validarOperacao(operation) {
  chavesExatas(operation, OPERATION_KEYS, 'operation_campos_invalidos');
  idSeguro(operation.operationId, 'operation_id_invalido');
  exigir(typeof operation.commandHash === 'string' && /^[a-f0-9]{64}$/.test(operation.commandHash), 'operation_hash_invalido');
  exigir(Number.isInteger(operation.revision) && operation.revision > 0, 'operation_revision_invalida');
  return operation;
}

function validarEstado(state) {
  chavesExatas(state, STATE_KEYS, 'state_campos_invalidos');
  exigir(state.version === NOTIFICATION_DELIVERY_JOURNAL_VERSION, 'state_version_invalida');
  idSeguro(state.tenantId, 'state_tenant_invalido', 256);
  idSeguro(state.actorKey, 'state_actor_invalido', 256);
  iso(state.createdAt, 'state_created_at_invalido');
  iso(state.lastRecordedAt, 'state_last_recorded_at_invalido');
  exigir(Date.parse(state.lastRecordedAt) >= Date.parse(state.createdAt), 'state_clock_invalido');
  exigir(Number.isInteger(state.revision) && state.revision >= 0, 'state_revision_invalida');
  exigir(Array.isArray(state.entries), 'state_entries_invalidas');
  exigir(Array.isArray(state.operations), 'state_operations_invalidas');
  state.entries.forEach(validarEntrada);
  state.operations.forEach(validarOperacao);
  exigir(state.operations.length === state.revision, 'state_revision_divergente');
  exigir(new Set(state.operations.map((item) => item.operationId)).size === state.operations.length, 'state_operations_duplicadas');
  exigir(new Set(state.entries.map((item) => `${item.eventId}:${item.channel}`)).size === state.entries.length, 'state_entries_duplicadas');
  exigir(state.operations.every((item, index) => item.revision === index + 1), 'state_operation_sequence_invalida');
  return state;
}

function validarContexto(state, context) {
  chavesExatas(context, CONTEXT_KEYS, 'context_campos_invalidos');
  const tenantId = idSeguro(context.tenantId, 'context_tenant_invalido', 256);
  const actorKey = idSeguro(context.actorKey, 'context_actor_invalido', 256);
  const operationId = idSeguro(context.operationId, 'context_operation_id_invalido');
  exigir(Number.isInteger(context.expectedRevision) && context.expectedRevision >= 0, 'context_revision_invalida');
  const now = iso(context.now, 'context_now_invalido');
  exigir(tenantId === state.tenantId, 'tenant_divergente');
  exigir(actorKey === state.actorKey, 'actor_divergente');
  exigir(Date.parse(now) >= Date.parse(state.lastRecordedAt), 'clock_regressivo');
  return { operationId, now };
}

function replayOuNovo(state, operationId, commandHash, expectedRevision) {
  const existing = state.operations.find((item) => item.operationId === operationId);
  if (existing) {
    exigir(existing.commandHash === commandHash, 'operation_replay_divergente');
    return { replay: true, operation: existing };
  }
  exigir(expectedRevision === state.revision, 'revision_divergente');
  return { replay: false, operation: null };
}

function resultado(state, operationId, idempotent) {
  return congelar({ state, operationId, idempotent });
}

export function criarEstadoJournalEntrega({ tenantId, actorKey, createdAt }) {
  const normalized = {
    version: NOTIFICATION_DELIVERY_JOURNAL_VERSION,
    tenantId: idSeguro(tenantId, 'tenant_invalido', 256),
    actorKey: idSeguro(actorKey, 'actor_invalido', 256),
    createdAt: iso(createdAt, 'created_at_invalido'),
    revision: 0,
    lastRecordedAt: createdAt,
    entries: [],
    operations: [],
  };
  return congelar(normalized);
}

export function registrarPlanoEntrega(state, plan, context) {
  validarEstado(state);
  validarPlano(plan);
  const trusted = validarContexto(state, context);
  const commandHash = hash({ type: 'record_plan', plan });
  const operation = replayOuNovo(state, trusted.operationId, commandHash, context.expectedRevision);
  if (operation.replay) return resultado(state, trusted.operationId, true);

  for (const decision of plan.decisions) {
    exigir(!state.entries.some((entry) => entry.eventId === plan.eventId && entry.channel === decision.channel), 'event_channel_ja_registrado');
  }
  const entries = plan.decisions.map((decision) => congelar({
    eventId: plan.eventId,
    kind: plan.kind,
    channel: decision.channel,
    selected: decision.selected,
    decisionReason: decision.reason,
    status: decision.selected ? 'planned' : 'skipped',
    decidedAt: trusted.now,
    outcomeAt: null,
    failureCode: null,
  }));
  const revision = state.revision + 1;
  const next = congelar({
    ...state,
    revision,
    lastRecordedAt: trusted.now,
    entries: [...state.entries, ...entries],
    operations: [...state.operations, congelar({ operationId: trusted.operationId, commandHash, revision })],
  });
  return resultado(next, trusted.operationId, false);
}

export function registrarResultadoEntrega(state, outcome, context) {
  validarEstado(state);
  chavesExatas(outcome, OUTCOME_KEYS, 'outcome_campos_invalidos');
  const eventId = idSeguro(outcome.eventId, 'outcome_event_id_invalido');
  exigir(CHANNELS.includes(outcome.channel), 'outcome_channel_invalido');
  exigir(outcome.status === 'delivered' || outcome.status === 'failed', 'outcome_status_invalido');
  if (outcome.status === 'delivered') {
    exigir(outcome.failureCode === null, 'outcome_failure_code_invalido');
  } else {
    idSeguro(outcome.failureCode, 'outcome_failure_code_invalido', 128);
  }
  const trusted = validarContexto(state, context);
  const normalizedOutcome = {
    eventId,
    channel: outcome.channel,
    status: outcome.status,
    failureCode: outcome.failureCode,
  };
  const commandHash = hash({ type: 'record_outcome', outcome: normalizedOutcome });
  const operation = replayOuNovo(state, trusted.operationId, commandHash, context.expectedRevision);
  if (operation.replay) return resultado(state, trusted.operationId, true);

  const index = state.entries.findIndex((entry) => entry.eventId === eventId && entry.channel === outcome.channel);
  exigir(index >= 0, 'canal_nao_planejado');
  const current = state.entries[index];
  exigir(current.selected, 'canal_nao_selecionado');
  exigir(current.status === 'planned', 'resultado_terminal');
  exigir(Date.parse(trusted.now) >= Date.parse(current.decidedAt), 'outcome_clock_regressivo');

  const updated = congelar({
    ...current,
    status: outcome.status,
    outcomeAt: trusted.now,
    failureCode: outcome.status === 'failed' ? outcome.failureCode : null,
  });
  const entries = [...state.entries];
  entries[index] = updated;
  const revision = state.revision + 1;
  const next = congelar({
    ...state,
    revision,
    lastRecordedAt: trusted.now,
    entries,
    operations: [...state.operations, congelar({ operationId: trusted.operationId, commandHash, revision })],
  });
  return resultado(next, trusted.operationId, false);
}

export function listarCanaisEntregues(state, projection) {
  validarEstado(state);
  chavesExatas(projection, PROJECTION_KEYS, 'projection_campos_invalidos');
  exigir(idSeguro(projection.tenantId, 'projection_tenant_invalido', 256) === state.tenantId, 'tenant_divergente');
  exigir(idSeguro(projection.actorKey, 'projection_actor_invalido', 256) === state.actorKey, 'actor_divergente');
  const eventId = idSeguro(projection.eventId, 'projection_event_id_invalido');
  return congelar(state.entries
    .filter((entry) => entry.eventId === eventId && entry.status === 'delivered')
    .map((entry) => entry.channel));
}

export function projetarJournalEntrega(state, { tenantId, actorKey } = {}) {
  validarEstado(state);
  exigir(idSeguro(tenantId, 'projection_tenant_invalido', 256) === state.tenantId, 'tenant_divergente');
  exigir(idSeguro(actorKey, 'projection_actor_invalido', 256) === state.actorKey, 'actor_divergente');
  return congelar({
    version: state.version,
    tenantId: state.tenantId,
    actorKey: state.actorKey,
    revision: state.revision,
    lastRecordedAt: state.lastRecordedAt,
    entries: state.entries.map((entry) => ({ ...entry })),
  });
}
