import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

export const RESEND_WEBHOOK_VERSION = '2026-09-05.v1';
export const RESEND_WEBHOOK_MAX_BODY_BYTES = 262144;
export const RESEND_WEBHOOK_CLOCK_SKEW_SECONDS = 300;

const EVENT_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
  'email.opened',
  'email.clicked',
  'email.received',
]);

const AUDIT_STATUS_BY_EVENT = Object.freeze({
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.received': 'received',
});

function textoSeguro(value, limit = 160) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\r\n]/.test(value)
    ? value
    : null;
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function compararConstante(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function header(headers, name) {
  return headers?.get(name) || headers?.get(name.toLowerCase()) || '';
}

function parseSignatures(value) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split(','))
    .filter(([version, signature]) => version === 'v1' && Boolean(signature))
    .map(([, signature]) => signature);
}

/**
 * Valida a assinatura Svix usada pelos webhooks do Resend.
 * O secret deve ser o valor `whsec_...` copiado do endpoint, nunca um token do app.
 */
export async function verificarAssinaturaResend(
  rawBody,
  headers,
  secret,
  { nowMs = Date.now(), clockSkewSeconds = RESEND_WEBHOOK_CLOCK_SKEW_SECONDS } = {},
) {
  if (typeof rawBody !== 'string' || !secret) return false;

  const svixId = textoSeguro(header(headers, 'svix-id'), 120);
  const timestamp = textoSeguro(header(headers, 'svix-timestamp'), 32);
  const signatures = parseSignatures(header(headers, 'svix-signature'));
  if (!svixId || !timestamp || !signatures.length) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > clockSkewSeconds) return false;

  const encodedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = base64ToBytes(encodedSecret);
  if (!keyBytes?.length) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signedPayload = `${svixId}.${timestamp}.${rawBody}`;
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signatures.some((signature) => compararConstante(expected, signature));
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const SAFE_AUDIT_TAG_KEYS = new Set(['tenant_id', 'template', 'purpose', 'source']);

function safeTagKeys(tags) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return [];
  return Object.keys(tags)
    .filter((tag) => SAFE_AUDIT_TAG_KEYS.has(tag))
    .slice(0, 20);
}

/**
 * Reduz o evento ao mínimo necessário para auditoria/idempotência.
 * Destinatário, remetente, assunto e corpo nunca atravessam esta fronteira.
 */
export function normalizarEventoResend(event, svixId) {
  const payload = safeObject(event);
  const data = safeObject(payload.data);
  const type = textoSeguro(payload.type, 80);
  if (!type || !EVENT_TYPES.has(type)) {
    throw Object.assign(new Error('resend_event_type_unsupported'), { codigo: 'resend_event_type_unsupported' });
  }

  const normalized = {
    version: RESEND_WEBHOOK_VERSION,
    eventId: textoSeguro(svixId, 120),
    type,
    status: AUDIT_STATUS_BY_EVENT[type],
    createdAt: textoSeguro(payload.created_at, 64),
    emailId: textoSeguro(data.email_id, 160),
    tagKeys: safeTagKeys(data.tags),
  };
  if (!normalized.eventId) {
    throw Object.assign(new Error('resend_event_id_missing'), { codigo: 'resend_event_id_missing' });
  }
  return Object.freeze(normalized);
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function payloadBytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Endpoint público do Resend: assinatura primeiro, idempotência no banco antes
 * de aceitar o evento e nenhuma PII do envelope armazenada na trilha.
 */
export async function handleResendWebhook(request, env) {
  if (request.method !== 'POST') {
    return response({ ok: false, erro: 'metodo_nao_suportado' }, 405);
  }
  if (!env?.RESEND_WEBHOOK_SECRET) {
    return response({ ok: false, erro: 'webhook_nao_configurado' }, 503);
  }

  const rawBody = await request.text();
  if (payloadBytes(rawBody) > RESEND_WEBHOOK_MAX_BODY_BYTES) {
    return response({ ok: false, erro: 'payload_grande' }, 413);
  }
  const valido = await verificarAssinaturaResend(rawBody, request.headers, env.RESEND_WEBHOOK_SECRET);
  if (!valido) return response({ ok: false, erro: 'assinatura_invalida' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return response({ ok: false, erro: 'payload_invalido' }, 400);
  }

  const svixId = header(request.headers, 'svix-id');
  let normalized;
  try {
    normalized = normalizarEventoResend(event, svixId);
  } catch (error) {
    return response({ ok: false, erro: error?.codigo || 'evento_invalido' }, 400);
  }

  const claim = await reivindicarEvento(env, {
    origem: 'resend',
    eventId: normalized.eventId,
    tipo: normalized.type,
    payload: normalized,
  });
  if (claim.duplicado) return response({ ok: true, duplicado: true });
  if (!claim.ok) return response({ ok: false, erro: 'idempotencia_indisponivel' }, 500);

  try {
    await marcarEvento(env, { origem: 'resend', eventId: normalized.eventId, status: 'processado' });
    return response({ ok: true, tipo: normalized.type });
  } catch (error) {
    await marcarEvento(env, {
      origem: 'resend',
      eventId: normalized.eventId,
      status: 'falhou',
      erro: error?.message || 'resend_webhook_failed',
    });
    return response({ ok: false, erro: 'falha_interna' }, 500);
  }
}
