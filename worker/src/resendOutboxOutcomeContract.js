/**
 * Composição pura entre um resultado já sanitizado do adapter Resend e a
 * máquina de estados da outbox.
 *
 * O módulo não possui transporte, não conhece provider além dos códigos
 * allowlistados, não lê env/segredo e não retorna o item completo (que contém
 * o destinatário). A persistência futura pode aplicar a projeção sobre o item
 * reservado dentro da própria transação.
 */

import {
  EMAIL_OUTBOX_MAX_ATTEMPTS,
  EMAIL_OUTBOX_VERSION,
  marcarEnviado,
  marcarFalha,
} from './emailOutbox.js';

export const RESEND_OUTBOX_OUTCOME_VERSION = '2026-09-02.v1';

const ENVELOPE_KEYS = Object.freeze(['claimedItem', 'result', 'agora']);
const RESULT_SUCCESS_KEYS = Object.freeze(['code', 'ok', 'providerId', 'retryable']);
const RESULT_FAILURE_KEYS = Object.freeze(['code', 'ok', 'retryable']);
const OUTCOME_KEYS = Object.freeze([
  'applied',
  'errorCode',
  'nextAttemptAt',
  'providerId',
  'status',
  'attempts',
  'updatedAt',
  'version',
]);
const OUTBOX_KEYS = Object.freeze([
  'version',
  'eventId',
  'idempotencyKey',
  'template',
  'templateVersion',
  'purpose',
  'recipient',
  'attempts',
  'status',
  'nextAttemptAt',
  'providerId',
  'errorCode',
  'createdAt',
  'updatedAt',
]);
const RESULT_RETRYABILITY = Object.freeze({
  provider_timeout: true,
  provider_rate_limited: true,
  provider_unavailable: true,
  provider_auth_rejected: false,
  provider_idempotency_conflict: false,
  provider_idempotency_in_progress: true,
  provider_resource_locked: true,
  provider_conflict_unknown: true,
  provider_request_rejected: false,
  provider_response_invalid: true,
  transport_timeout: true,
  transport_error: true,
});
const RESULT_CODES = Object.freeze(['accepted', ...Object.keys(RESULT_RETRYABILITY)]);
const PREVIOUS_ERROR_CODES = Object.freeze(Object.keys(RESULT_RETRYABILITY));

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(valor, codigo) {
  exigir(valor !== null && typeof valor === 'object' && !Array.isArray(valor), codigo);
  return valor;
}

function chavesExatas(valor, esperadas, codigo) {
  objeto(valor, codigo);
  const atuais = Object.keys(valor).sort();
  const alvo = [...esperadas].sort();
  exigir(atuais.length === alvo.length && atuais.every((chave, indice) => chave === alvo[indice]), codigo);
}

function texto(valor, limite = 512) {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= limite && !/[\r\n]/.test(valor)
    ? valor
    : '';
}

function idSeguro(valor, codigo, limite = 240) {
  const id = texto(valor, limite);
  exigir(/^[a-zA-Z0-9._:-]+$/.test(id), codigo);
  return id;
}

function emailSeguro(valor, codigo) {
  const email = texto(valor, 254).toLowerCase();
  exigir(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), codigo);
  return email;
}

function isoSeguro(valor, codigo) {
  exigir(typeof valor === 'string' && valor.length > 0 && !/[\r\n]/.test(valor), codigo);
  const date = new Date(valor);
  exigir(!Number.isNaN(date.getTime()), codigo);
  return date.toISOString();
}

function validarEnvelope(envelope) {
  chavesExatas(envelope, ENVELOPE_KEYS, 'outcome_envelope_campos_invalidos');
  return Object.freeze({
    claimedItem: validarItem(envelope.claimedItem),
    result: validarResultado(envelope.result),
    agora: isoSeguro(envelope.agora, 'agora_invalido'),
  });
}

function validarItem(item) {
  chavesExatas(item, OUTBOX_KEYS, 'outbox_campos_invalidos');
  exigir(item.version === EMAIL_OUTBOX_VERSION, 'outbox_versao_invalida');
  exigir(item.status === 'sending', 'outbox_nao_reservada');
  exigir(Number.isInteger(item.attempts) && item.attempts >= 1 && item.attempts <= EMAIL_OUTBOX_MAX_ATTEMPTS, 'outbox_tentativa_invalida');
  exigir(item.providerId === null, 'outbox_resultado_preexistente');
  if (item.errorCode !== null) {
    exigir(PREVIOUS_ERROR_CODES.includes(item.errorCode), 'outbox_error_code_invalido');
  }
  idSeguro(item.eventId, 'event_id_invalido', 160);
  idSeguro(item.idempotencyKey, 'idempotency_key_invalida', 240);
  idSeguro(item.template, 'template_invalido', 80);
  idSeguro(item.templateVersion, 'template_version_invalida', 80);
  idSeguro(item.purpose, 'purpose_invalido', 100);
  emailSeguro(item.recipient, 'destinatario_invalido');
  isoSeguro(item.nextAttemptAt, 'next_attempt_at_invalido');
  isoSeguro(item.createdAt, 'created_at_invalido');
  isoSeguro(item.updatedAt, 'updated_at_invalido');
  return item;
}

function validarResultado(result) {
  objeto(result, 'resultado_invalido');
  if (result.ok === true) {
    chavesExatas(result, RESULT_SUCCESS_KEYS, 'resultado_sucesso_campos_invalidos');
    exigir(result.code === 'accepted', 'resultado_sucesso_codigo_invalido');
    exigir(result.retryable === false, 'resultado_sucesso_retry_invalido');
    return Object.freeze({
      ok: true,
      code: result.code,
      providerId: idSeguro(result.providerId, 'provider_id_invalido', 160),
      retryable: false,
    });
  }
  if (result.ok === false) {
    chavesExatas(result, RESULT_FAILURE_KEYS, 'resultado_falha_campos_invalidos');
    exigir(typeof result.retryable === 'boolean', 'resultado_retry_invalido');
    exigir(RESULT_CODES.includes(result.code) && result.code !== 'accepted', 'resultado_codigo_invalido');
    exigir(result.retryable === RESULT_RETRYABILITY[result.code], 'resultado_retry_inconsistente');
    return Object.freeze({ ok: false, code: result.code, retryable: result.retryable });
  }
  throw Object.assign(new Error('resultado_ok_invalido'), { codigo: 'resultado_ok_invalido' });
}

function projetar(next, result) {
  const outcome = {
    version: RESEND_OUTBOX_OUTCOME_VERSION,
    applied: true,
    status: next.status,
    attempts: next.attempts,
    nextAttemptAt: next.nextAttemptAt,
    providerId: next.providerId,
    errorCode: next.errorCode,
    updatedAt: next.updatedAt,
  };
  exigir(result.ok ? next.status === 'sent' : (next.status === 'failed' || next.status === 'dead_letter'), 'transicao_outbox_invalida');
  chavesExatas(outcome, OUTCOME_KEYS, 'outcome_projecao_invalida');
  return Object.freeze(outcome);
}

/**
 * Aplica uma única resposta sanitizada a um item `sending`.
 * Retorna somente a projeção de estado necessária para a persistência; o item
 * original e o destinatário nunca atravessam a fronteira pública do contrato.
 */
export function aplicarResultadoResendNaOutbox(envelope = {}) {
  const trusted = validarEnvelope(envelope);
  const next = trusted.result.ok
    ? marcarEnviado(trusted.claimedItem, {
      providerId: trusted.result.providerId,
      agora: trusted.agora,
    })
    : marcarFalha(trusted.claimedItem, {
      codigo: trusted.result.code,
      retentavel: trusted.result.retryable,
      agora: trusted.agora,
    });
  return projetar(next, trusted.result);
}
