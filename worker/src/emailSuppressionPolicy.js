import { createHash } from 'node:crypto';

/**
 * Política pura de supressão do OLLI Orçamentos.
 *
 * O estado usa somente fingerprint sintética do destinatário. Não recebe
 * endereço de e-mail, não chama provider, não persiste e não envia mensagens.
 */

export const EMAIL_SUPPRESSION_VERSION = '2026-09-01.v1';
export const EMAIL_SUPPRESSION_EVENT_TYPES = Object.freeze([
  'hard_bounce',
  'soft_bounce',
  'complaint',
  'unsubscribe',
  'resubscribe',
  'delivery_succeeded',
]);
export const EMAIL_MESSAGE_KINDS = Object.freeze([
  'security',
  'operational',
  'education',
  'engagement',
]);
export const EMAIL_SOFT_BOUNCE_LIMIT = 3;
export const EMAIL_SOFT_BOUNCE_SUPPRESSION_DAYS = 7;

const EVENT_KEYS = Object.freeze(['eventId', 'type', 'occurredAt', 'consentVersion']);
const STATE_KEYS = Object.freeze([
  'version',
  'tenantId',
  'recipientFingerprint',
  'revision',
  'hardBounce',
  'complaint',
  'unsubscribed',
  'educationalOptIn',
  'consentVersion',
  'softBounceCount',
  'temporarilySuppressedUntil',
  'processedEvents',
  'updatedAt',
]);
const PROCESSED_EVENT_KEYS = Object.freeze(['eventId', 'eventHash']);

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

function fingerprintSeguro(v, codigo = 'recipient_fingerprint_invalido') {
  exigir(typeof v === 'string' && /^[a-fA-F0-9]{64}$/.test(v), codigo);
  return v.toLowerCase();
}

function instante(v, codigo) {
  exigir(typeof v === 'string' || v instanceof Date, codigo);
  const data = v instanceof Date ? v : new Date(v);
  exigir(!Number.isNaN(data.getTime()), codigo);
  return Object.freeze({ iso: data.toISOString(), ms: data.getTime() });
}

function congelarEstado(state) {
  return Object.freeze({
    ...state,
    processedEvents: Object.freeze(
      state.processedEvents.map((evento) => Object.freeze({ ...evento })),
    ),
  });
}

function hashEvento(evento) {
  return createHash('sha256').update(JSON.stringify({
    eventId: evento.eventId,
    type: evento.type,
    occurredAt: evento.occurredAt,
    consentVersion: evento.consentVersion,
  })).digest('hex');
}

function adicionarDias(iso, dias) {
  const data = new Date(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString();
}

function validarEvento(evento) {
  chavesExatas(evento, EVENT_KEYS, 'evento_campos_invalidos');
  const eventId = idSeguro(evento.eventId, 'event_id_invalido');
  exigir(EMAIL_SUPPRESSION_EVENT_TYPES.includes(evento.type), 'evento_tipo_invalido');
  const occurredAt = instante(evento.occurredAt, 'evento_occurred_at_invalido');
  if (evento.type === 'resubscribe') {
    idSeguro(evento.consentVersion, 'consent_version_obrigatoria');
  } else {
    exigir(evento.consentVersion === null, 'consent_version_nao_permitida');
  }
  return Object.freeze({
    eventId,
    type: evento.type,
    occurredAt,
    consentVersion: evento.consentVersion,
  });
}

function validarEstado(state) {
  chavesExatas(state, STATE_KEYS, 'estado_campos_invalidos');
  exigir(state.version === EMAIL_SUPPRESSION_VERSION, 'estado_versao_invalida');
  idSeguro(state.tenantId, 'estado_tenant_invalido');
  fingerprintSeguro(state.recipientFingerprint, 'estado_recipient_fingerprint_invalido');
  exigir(Number.isSafeInteger(state.revision) && state.revision >= 0, 'estado_revision_invalida');
  exigir(typeof state.hardBounce === 'boolean', 'estado_hard_bounce_invalido');
  exigir(typeof state.complaint === 'boolean', 'estado_complaint_invalido');
  exigir(typeof state.unsubscribed === 'boolean', 'estado_unsubscribed_invalido');
  exigir(typeof state.educationalOptIn === 'boolean', 'estado_opt_in_invalido');
  exigir(Number.isSafeInteger(state.softBounceCount) && state.softBounceCount >= 0, 'estado_soft_bounce_invalido');
  instante(state.updatedAt, 'estado_updated_at_invalido');
  if (state.temporarilySuppressedUntil !== null) {
    instante(state.temporarilySuppressedUntil, 'estado_suppressed_until_invalido');
  }
  exigir(Array.isArray(state.processedEvents), 'estado_processed_events_invalido');
  const eventIds = new Set();
  for (const evento of state.processedEvents) {
    chavesExatas(evento, PROCESSED_EVENT_KEYS, 'estado_processed_event_invalido');
    idSeguro(evento.eventId, 'estado_processed_event_id_invalido');
    exigir(/^[a-f0-9]{64}$/.test(evento.eventHash), 'estado_processed_event_hash_invalido');
    exigir(!eventIds.has(evento.eventId), 'estado_processed_event_duplicado');
    eventIds.add(evento.eventId);
  }
}

export function criarEstadoSupressaoEmail({
  tenantId,
  recipientFingerprint,
  createdAt,
} = {}) {
  const created = instante(createdAt, 'created_at_invalido');
  return congelarEstado({
    version: EMAIL_SUPPRESSION_VERSION,
    tenantId: idSeguro(tenantId, 'tenant_obrigatorio'),
    recipientFingerprint: fingerprintSeguro(recipientFingerprint),
    revision: 0,
    hardBounce: false,
    complaint: false,
    unsubscribed: false,
    educationalOptIn: false,
    consentVersion: null,
    softBounceCount: 0,
    temporarilySuppressedUntil: null,
    processedEvents: [],
    updatedAt: created.iso,
  });
}

/**
 * Aplica evento com revisão otimista. Replay idêntico é inofensivo; o mesmo
 * eventId com conteúdo diferente falha fechado.
 */
export function aplicarEventoSupressaoEmail(
  state,
  evento,
  { tenantId, recipientFingerprint, expectedRevision, now } = {},
) {
  validarEstado(state);
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const trustedRecipient = fingerprintSeguro(recipientFingerprint);
  exigir(state.tenantId === trustedTenant, 'tenant_divergente');
  exigir(state.recipientFingerprint === trustedRecipient, 'recipient_divergente');
  const clock = instante(now, 'agora_invalido');
  const validEvent = validarEvento(evento);
  exigir(validEvent.occurredAt.ms <= clock.ms, 'evento_futuro');

  const eventHash = hashEvento({
    eventId: validEvent.eventId,
    type: validEvent.type,
    occurredAt: validEvent.occurredAt.iso,
    consentVersion: validEvent.consentVersion,
  });
  const previous = state.processedEvents.find((item) => item.eventId === validEvent.eventId);
  if (previous) {
    exigir(previous.eventHash === eventHash, 'evento_replay_divergente');
    return Object.freeze({ applied: false, replayed: true, state });
  }

  exigir(Number.isSafeInteger(expectedRevision) && expectedRevision === state.revision, 'revision_divergente');
  const updated = instante(state.updatedAt, 'estado_updated_at_invalido');
  exigir(validEvent.occurredAt.ms >= updated.ms, 'clock_regressivo');

  const next = {
    ...state,
    revision: state.revision + 1,
    processedEvents: [
      ...state.processedEvents,
      { eventId: validEvent.eventId, eventHash },
    ],
    updatedAt: validEvent.occurredAt.iso,
  };

  if (validEvent.type === 'hard_bounce') {
    next.hardBounce = true;
    next.temporarilySuppressedUntil = null;
  } else if (validEvent.type === 'complaint') {
    next.complaint = true;
    next.unsubscribed = true;
    next.educationalOptIn = false;
  } else if (validEvent.type === 'unsubscribe') {
    next.unsubscribed = true;
    next.educationalOptIn = false;
  } else if (validEvent.type === 'resubscribe') {
    next.unsubscribed = false;
    next.educationalOptIn = true;
    next.consentVersion = validEvent.consentVersion;
  } else if (validEvent.type === 'soft_bounce') {
    next.softBounceCount = state.softBounceCount + 1;
    if (next.softBounceCount >= EMAIL_SOFT_BOUNCE_LIMIT) {
      next.temporarilySuppressedUntil = adicionarDias(
        validEvent.occurredAt.iso,
        EMAIL_SOFT_BOUNCE_SUPPRESSION_DAYS,
      );
    }
  } else if (validEvent.type === 'delivery_succeeded') {
    next.softBounceCount = 0;
    next.temporarilySuppressedUntil = null;
  }

  return Object.freeze({ applied: true, replayed: false, state: congelarEstado(next) });
}

/** Avalia uma entrega sem mutar o estado e sem conhecer o endereço real. */
export function avaliarEntregaEmail(
  state,
  { tenantId, recipientFingerprint, kind, now } = {},
) {
  validarEstado(state);
  const trustedTenant = idSeguro(tenantId, 'tenant_obrigatorio');
  const trustedRecipient = fingerprintSeguro(recipientFingerprint);
  exigir(state.tenantId === trustedTenant, 'tenant_divergente');
  exigir(state.recipientFingerprint === trustedRecipient, 'recipient_divergente');
  exigir(EMAIL_MESSAGE_KINDS.includes(kind), 'message_kind_invalido');
  const clock = instante(now, 'agora_invalido');

  let allowed = true;
  let reason = 'allowed';
  if (state.hardBounce) {
    allowed = false;
    reason = 'hard_bounce';
  } else if (
    state.temporarilySuppressedUntil !== null &&
    clock.ms < new Date(state.temporarilySuppressedUntil).getTime()
  ) {
    allowed = false;
    reason = 'soft_bounce_suppression';
  } else if (state.complaint && kind !== 'security') {
    allowed = false;
    reason = 'complaint';
  } else if ((kind === 'education' || kind === 'engagement') && state.unsubscribed) {
    allowed = false;
    reason = 'unsubscribed';
  } else if ((kind === 'education' || kind === 'engagement') && !state.educationalOptIn) {
    allowed = false;
    reason = 'consent_required';
  }

  return Object.freeze({
    version: EMAIL_SUPPRESSION_VERSION,
    tenantId: trustedTenant,
    recipientFingerprint: trustedRecipient,
    kind,
    allowed,
    reason,
    evaluatedAt: clock.iso,
    stateRevision: state.revision,
  });
}
