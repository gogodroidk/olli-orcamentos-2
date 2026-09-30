import { avaliarEntregaEmail } from './emailSuppressionPolicy.js';
import { marcarEnviando } from './emailOutbox.js';

/**
 * Composição pura entre supressão e reserva da outbox do OLLI Orçamentos.
 *
 * O binding precisa ser produzido por um adapter confiável usando o tenant e a
 * fingerprint HMAC corretos. Este módulo não calcula HMAC, não lê segredo, não
 * persiste, não chama provider e não envia e-mail.
 */

export const EMAIL_SUPPRESSION_OUTBOX_VERSION = '2026-09-01.v1';

const BINDING_KEYS = Object.freeze([
  'authority',
  'tenantId',
  'recipientFingerprint',
  'eventId',
  'idempotencyKey',
]);
const CONTEXT_KEYS = Object.freeze([
  'tenantId',
  'recipientFingerprint',
  'kind',
  'now',
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

function idSeguro(v, codigo, limite = 512) {
  exigir(
    typeof v === 'string' &&
      v.length > 0 &&
      v.length <= limite &&
      /^[a-zA-Z0-9._:-]+$/.test(v),
    codigo,
  );
  return v;
}

function fingerprintSeguro(v, codigo = 'recipient_fingerprint_invalido') {
  exigir(typeof v === 'string' && /^[a-fA-F0-9]{64}$/.test(v), codigo);
  return v.toLowerCase();
}

function validarBinding(binding) {
  chavesExatas(binding, BINDING_KEYS, 'binding_campos_invalidos');
  exigir(binding.authority === 'trusted_delivery_binding', 'binding_nao_autoritativo');
  return Object.freeze({
    tenantId: idSeguro(binding.tenantId, 'binding_tenant_invalido', 160),
    recipientFingerprint: fingerprintSeguro(binding.recipientFingerprint, 'binding_recipient_invalido'),
    eventId: idSeguro(binding.eventId, 'binding_event_id_invalido'),
    idempotencyKey: idSeguro(binding.idempotencyKey, 'binding_idempotency_key_invalida'),
  });
}

function validarContexto(context) {
  chavesExatas(context, CONTEXT_KEYS, 'contexto_campos_invalidos');
  return Object.freeze({
    tenantId: idSeguro(context.tenantId, 'tenant_obrigatorio', 160),
    recipientFingerprint: fingerprintSeguro(context.recipientFingerprint),
    kind: context.kind,
    now: context.now,
  });
}

function resultado(valor) {
  return Object.freeze({
    version: EMAIL_SUPPRESSION_OUTBOX_VERSION,
    ...valor,
  });
}

/**
 * Avalia supressão antes de reservar a tentativa. Resultado negado nunca inclui
 * o item da outbox; resultado autorizado inclui o `claimedItem` interno para o
 * adapter persistir antes de qualquer chamada externa.
 */
export function reservarEmailComSupressao({
  suppressionState,
  outboxItem,
  binding,
  context,
} = {}) {
  objeto(suppressionState, 'suppression_state_invalido');
  objeto(outboxItem, 'outbox_item_invalido');
  const trustedBinding = validarBinding(binding);
  const trustedContext = validarContexto(context);

  exigir(trustedBinding.tenantId === trustedContext.tenantId, 'binding_tenant_divergente');
  exigir(
    trustedBinding.recipientFingerprint === trustedContext.recipientFingerprint,
    'binding_recipient_divergente',
  );
  exigir(outboxItem.eventId === trustedBinding.eventId, 'outbox_event_divergente');
  exigir(
    outboxItem.idempotencyKey === trustedBinding.idempotencyKey,
    'outbox_idempotency_divergente',
  );

  const suppression = avaliarEntregaEmail(suppressionState, {
    tenantId: trustedContext.tenantId,
    recipientFingerprint: trustedContext.recipientFingerprint,
    kind: trustedContext.kind,
    now: trustedContext.now,
  });

  if (!suppression.allowed) {
    return resultado({
      reserve: false,
      reason: suppression.reason,
      eventId: trustedBinding.eventId,
      idempotencyKey: trustedBinding.idempotencyKey,
      suppressionRevision: suppression.stateRevision,
      outboxStatus: outboxItem.status,
      attempts: outboxItem.attempts,
    });
  }

  const claimedItem = marcarEnviando(outboxItem, { agora: trustedContext.now });
  return resultado({
    reserve: true,
    reason: 'reserved',
    eventId: trustedBinding.eventId,
    idempotencyKey: trustedBinding.idempotencyKey,
    suppressionRevision: suppression.stateRevision,
    outboxStatus: claimedItem.status,
    attempts: claimedItem.attempts,
    claimedItem,
  });
}
