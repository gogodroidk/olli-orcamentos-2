/**
 * Máquina de estados pura para a outbox de e-mail transacional.
 *
 * A persistência futura deve garantir unicidade de `idempotencyKey` e gravar o
 * evento junto da mudança de negócio. Este módulo não conhece banco, fila,
 * provider ou segredo; por isso pode ser testado offline.
 */

export const EMAIL_OUTBOX_VERSION = '2026-08-31.v1';
export const EMAIL_OUTBOX_MAX_ATTEMPTS = 5;
export const EMAIL_OUTBOX_STATES = Object.freeze(['pending', 'sending', 'sent', 'failed', 'dead_letter']);

const BACKOFF_MS = Object.freeze([60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000]);

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function emailSeguro(v) {
  const email = texto(v, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function iso(v, fallback = new Date().toISOString()) {
  const data = v instanceof Date ? v : new Date(v || fallback);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function congelar(item) {
  return Object.freeze({ ...item });
}

function erroSeguro(v) {
  return texto(v, 120).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'provider_error';
}

function transicaoPermitida(item, estados) {
  return item && estados.includes(item.status);
}

/** Cria um item sem corpo HTML, resposta do provider ou segredo. */
export function criarItemEmailOutbox(evento, { agora } = {}) {
  const eventId = texto(evento?.eventId, 160);
  const idempotencyKey = texto(evento?.idempotencyKey, 240);
  const destinatario = emailSeguro(evento?.recipient || evento?.para);
  const template = texto(evento?.template, 80);
  const templateVersion = texto(evento?.templateVersion, 80);
  const purpose = texto(evento?.purpose, 100);
  const createdAt = iso(agora);
  exigir(eventId, 'event_id_obrigatorio');
  exigir(idempotencyKey, 'idempotency_key_obrigatoria');
  exigir(destinatario, 'destinatario_invalido');
  exigir(template && templateVersion, 'template_obrigatorio');
  exigir(purpose, 'purpose_obrigatorio');
  exigir(createdAt, 'agora_invalido');
  return congelar({
    version: EMAIL_OUTBOX_VERSION,
    eventId,
    idempotencyKey,
    template,
    templateVersion,
    purpose,
    recipient: destinatario,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: createdAt,
    providerId: null,
    errorCode: null,
    createdAt,
    updatedAt: createdAt,
  });
}

/** Reserva uma tentativa somente quando a janela de retry já abriu. */
export function marcarEnviando(item, { agora } = {}) {
  exigir(transicaoPermitida(item, ['pending', 'failed']), 'transicao_invalida');
  const updatedAt = iso(agora);
  exigir(updatedAt, 'agora_invalido');
  const elegivelEm = new Date(item.nextAttemptAt).getTime();
  exigir(!Number.isNaN(elegivelEm) && new Date(updatedAt).getTime() >= elegivelEm, 'retry_ainda_nao_elegivel');
  exigir(Number.isInteger(item.attempts) && item.attempts < EMAIL_OUTBOX_MAX_ATTEMPTS, 'limite_tentativas');
  return congelar({ ...item, status: 'sending', attempts: item.attempts + 1, updatedAt });
}

export function marcarEnviado(item, { providerId, agora } = {}) {
  exigir(transicaoPermitida(item, ['sending']), 'transicao_invalida');
  const updatedAt = iso(agora);
  exigir(updatedAt, 'agora_invalido');
  return congelar({ ...item, status: 'sent', providerId: texto(providerId, 160) || null, errorCode: null, nextAttemptAt: null, updatedAt });
}

/** Falha sem guardar corpo/resposta; retry determinístico e dead-letter após o teto. */
export function marcarFalha(item, { codigo, agora, retentavel = true } = {}) {
  exigir(transicaoPermitida(item, ['sending']), 'transicao_invalida');
  const updatedAt = iso(agora);
  exigir(updatedAt, 'agora_invalido');
  const terminal = !retentavel || item.attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS;
  if (terminal) {
    return congelar({ ...item, status: 'dead_letter', errorCode: erroSeguro(codigo), nextAttemptAt: null, updatedAt });
  }
  const espera = BACKOFF_MS[Math.max(0, Math.min(item.attempts - 1, BACKOFF_MS.length - 1))];
  const nextAttemptAt = new Date(new Date(updatedAt).getTime() + espera).toISOString();
  return congelar({ ...item, status: 'failed', errorCode: erroSeguro(codigo), nextAttemptAt, updatedAt });
}

/** Estados terminais não podem ser reabertos silenciosamente. */
export function estadoTerminal(item) {
  return item?.status === 'sent' || item?.status === 'dead_letter';
}

