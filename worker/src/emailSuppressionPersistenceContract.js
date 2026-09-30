import { createHash } from 'node:crypto';
import {
  EMAIL_SUPPRESSION_VERSION,
  aplicarEventoSupressaoEmail,
  criarEstadoSupressaoEmail,
} from './emailSuppressionPolicy.js';

/**
 * Contrato puro entre a política de supressão e uma futura persistência.
 *
 * Recebe apenas identidade autoritativa já pseudonimizada. Não calcula HMAC,
 * não aceita endereço de e-mail, não lê segredo, não toca banco e não chama
 * provider. O adapter persistente deve executar o plano aplicado em uma única
 * transação com compare-and-set da revisão e append do evento.
 */

export const EMAIL_SUPPRESSION_PERSISTENCE_VERSION = '2026-09-04.v1';

const INPUT_KEYS = Object.freeze([
  'binding',
  'event',
  'context',
  'persistedState',
  'persistedEvent',
]);
const BINDING_KEYS = Object.freeze([
  'authority',
  'tenantId',
  'userId',
  'recipientFingerprint',
  'fingerprintKeyId',
]);
const CONTEXT_KEYS = Object.freeze(['expectedRevision', 'now']);
const EVENT_KEYS = Object.freeze(['eventId', 'type', 'occurredAt', 'consentVersion']);
const PERSISTED_EVENT_KEYS = Object.freeze(['eventId', 'eventHash']);
const PERSISTED_STATE_KEYS = Object.freeze([
  'version',
  'tenantId',
  'userId',
  'recipientFingerprint',
  'fingerprintKeyId',
  'revision',
  'hardBounce',
  'complaint',
  'unsubscribed',
  'educationalOptIn',
  'consentVersion',
  'softBounceCount',
  'temporarilySuppressedUntil',
  'updatedAt',
]);

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(valor, codigo) {
  exigir(valor && typeof valor === 'object' && !Array.isArray(valor), codigo);
  return valor;
}

function chavesExatas(valor, esperadas, codigo) {
  objeto(valor, codigo);
  const atuais = Object.keys(valor).sort();
  const alvo = [...esperadas].sort();
  exigir(
    atuais.length === alvo.length && atuais.every((chave, indice) => chave === alvo[indice]),
    codigo,
  );
}

function uuid(valor, codigo) {
  exigir(
    typeof valor === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor),
    codigo,
  );
  return valor.toLowerCase();
}

function idSeguro(valor, codigo, limite = 160) {
  exigir(
    typeof valor === 'string' &&
      valor.length > 0 &&
      valor.length <= limite &&
      /^[a-zA-Z0-9._:-]+$/.test(valor),
    codigo,
  );
  return valor;
}

function fingerprint(valor, codigo) {
  exigir(typeof valor === 'string' && /^[a-f0-9]{64}$/i.test(valor), codigo);
  return valor.toLowerCase();
}

function instanteCanonico(valor, codigo) {
  exigir(typeof valor === 'string', codigo);
  exigir(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor), codigo);
  const data = new Date(valor);
  exigir(!Number.isNaN(data.getTime()) && data.toISOString() === valor, codigo);
  return valor;
}

function hashEvento(evento) {
  return createHash('sha256').update(JSON.stringify({
    eventId: evento.eventId,
    type: evento.type,
    occurredAt: evento.occurredAt,
    consentVersion: evento.consentVersion,
  })).digest('hex');
}

function validarBinding(binding) {
  chavesExatas(binding, BINDING_KEYS, 'binding_campos_invalidos');
  exigir(binding.authority === 'trusted_suppression_binding', 'binding_nao_autoritativo');
  return Object.freeze({
    tenantId: uuid(binding.tenantId, 'binding_tenant_invalido'),
    userId: uuid(binding.userId, 'binding_user_invalido'),
    recipientFingerprint: fingerprint(binding.recipientFingerprint, 'binding_fingerprint_invalido'),
    fingerprintKeyId: idSeguro(binding.fingerprintKeyId, 'binding_fingerprint_key_id_invalido', 80),
  });
}

function validarContexto(context) {
  chavesExatas(context, CONTEXT_KEYS, 'contexto_campos_invalidos');
  exigir(
    Number.isSafeInteger(context.expectedRevision) && context.expectedRevision >= 0,
    'expected_revision_invalida',
  );
  return Object.freeze({
    expectedRevision: context.expectedRevision,
    now: instanteCanonico(context.now, 'agora_invalido'),
  });
}

function validarEvento(evento) {
  chavesExatas(evento, EVENT_KEYS, 'evento_campos_invalidos');
  return Object.freeze({
    eventId: idSeguro(evento.eventId, 'event_id_invalido'),
    type: evento.type,
    occurredAt: instanteCanonico(evento.occurredAt, 'evento_occurred_at_invalido'),
    consentVersion: evento.consentVersion,
  });
}

function validarPersistedEvent(evento) {
  if (evento === null) return null;
  chavesExatas(evento, PERSISTED_EVENT_KEYS, 'persisted_event_campos_invalidos');
  return Object.freeze({
    eventId: idSeguro(evento.eventId, 'persisted_event_id_invalido'),
    eventHash: fingerprint(evento.eventHash, 'persisted_event_hash_invalido'),
  });
}

function validarPersistedState(state, binding) {
  if (state === null) return null;
  chavesExatas(state, PERSISTED_STATE_KEYS, 'persisted_state_campos_invalidos');
  exigir(state.version === EMAIL_SUPPRESSION_VERSION, 'persisted_state_versao_invalida');
  exigir(uuid(state.tenantId, 'persisted_state_tenant_invalido') === binding.tenantId, 'tenant_divergente');
  exigir(uuid(state.userId, 'persisted_state_user_invalido') === binding.userId, 'user_divergente');
  exigir(
    fingerprint(state.recipientFingerprint, 'persisted_state_fingerprint_invalido') === binding.recipientFingerprint,
    'recipient_divergente',
  );
  exigir(
    idSeguro(state.fingerprintKeyId, 'persisted_state_fingerprint_key_id_invalido', 80) === binding.fingerprintKeyId,
    'fingerprint_key_divergente',
  );
  return state;
}

function projetarEstado(policyState, binding) {
  return Object.freeze({
    version: policyState.version,
    tenantId: binding.tenantId,
    userId: binding.userId,
    recipientFingerprint: binding.recipientFingerprint,
    fingerprintKeyId: binding.fingerprintKeyId,
    revision: policyState.revision,
    hardBounce: policyState.hardBounce,
    complaint: policyState.complaint,
    unsubscribed: policyState.unsubscribed,
    educationalOptIn: policyState.educationalOptIn,
    consentVersion: policyState.consentVersion,
    softBounceCount: policyState.softBounceCount,
    temporarilySuppressedUntil: policyState.temporarilySuppressedUntil,
    updatedAt: policyState.updatedAt,
  });
}

/**
 * Produz um plano atômico para persistência ou um no-op de replay idêntico.
 */
export function prepararPersistenciaSupressaoEmail(input) {
  chavesExatas(input, INPUT_KEYS, 'entrada_campos_invalidos');
  const binding = validarBinding(input.binding);
  const context = validarContexto(input.context);
  const event = validarEvento(input.event);
  const persistedState = validarPersistedState(input.persistedState, binding);
  const persistedEvent = validarPersistedEvent(input.persistedEvent);

  exigir(persistedState !== null || persistedEvent === null, 'persisted_event_sem_estado');
  if (persistedEvent !== null) {
    exigir(persistedEvent.eventId === event.eventId, 'persisted_event_id_divergente');
  }

  const eventHash = hashEvento(event);
  const baseState = persistedState === null
    ? criarEstadoSupressaoEmail({
        tenantId: binding.tenantId,
        recipientFingerprint: binding.recipientFingerprint,
        createdAt: event.occurredAt,
      })
    : Object.freeze({
        version: persistedState.version,
        tenantId: persistedState.tenantId,
        recipientFingerprint: persistedState.recipientFingerprint,
        revision: persistedState.revision,
        hardBounce: persistedState.hardBounce,
        complaint: persistedState.complaint,
        unsubscribed: persistedState.unsubscribed,
        educationalOptIn: persistedState.educationalOptIn,
        consentVersion: persistedState.consentVersion,
        softBounceCount: persistedState.softBounceCount,
        temporarilySuppressedUntil: persistedState.temporarilySuppressedUntil,
        processedEvents: persistedEvent === null ? [] : [persistedEvent],
        updatedAt: instanteCanonico(persistedState.updatedAt, 'persisted_state_updated_at_invalido'),
      });

  const result = aplicarEventoSupressaoEmail(baseState, event, {
    tenantId: binding.tenantId,
    recipientFingerprint: binding.recipientFingerprint,
    expectedRevision: context.expectedRevision,
    now: context.now,
  });

  const scope = Object.freeze({ ...binding });
  const persistedEventProjection = Object.freeze({
    eventId: event.eventId,
    eventHash,
    type: event.type,
    occurredAt: event.occurredAt,
    consentVersion: event.consentVersion,
  });

  return Object.freeze({
    version: EMAIL_SUPPRESSION_PERSISTENCE_VERSION,
    applied: result.applied,
    replayed: result.replayed,
    writeMode: result.applied ? 'atomic_compare_and_set_and_event_append' : 'no_op',
    expectedRevision: context.expectedRevision,
    nextRevision: result.state.revision,
    scope,
    state: projetarEstado(result.state, binding),
    event: persistedEventProjection,
  });
}
