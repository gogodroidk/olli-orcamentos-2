/**
 * Verificação Standard Webhooks (https://www.standardwebhooks.com), o mesmo
 * esquema do Svix: HMAC-SHA256 de `${id}.${timestamp}.${corpo}` com o segredo em
 * base64, assinatura `v1,<base64>` (várias separadas por espaço) e janela de
 * relógio para barrar replay.
 *
 * Usado pelo webhook da Resend (cabeçalhos `svix-*`, segredo `whsec_...`) e pelo
 * Send Email Hook do Supabase Auth (cabeçalhos `webhook-*`, segredo
 * `v1,whsec_...`). Puro: nenhuma rede, nenhum log, nunca lança.
 */

export const STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS = 300;

function textoSeguro(value, limit) {
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
 * Chaves HMAC a partir do segredo configurado. Aceita `whsec_<b64>` (Resend),
 * `v1,whsec_<b64>` (Supabase) e vários segredos separados por `|` — o formato
 * que o Supabase usa em `hook_send_email_secrets` para rotação sem janela.
 */
function chavesDoSegredo(secret) {
  if (typeof secret !== 'string') return [];
  return secret
    .split('|')
    .map((item) => item.trim())
    .map((item) => (item.startsWith('v1,') ? item.slice(3) : item))
    .map((item) => (item.startsWith('whsec_') ? item.slice('whsec_'.length) : item))
    .map(base64ToBytes)
    .filter((bytes) => bytes && bytes.length > 0);
}

/**
 * true só quando uma assinatura v1 confere com um dos segredos e o timestamp está
 * dentro da janela. Qualquer ausência, formato estranho ou erro é `false`.
 *
 * `prefixo` escolhe a família de cabeçalhos: 'svix' (Resend) ou 'webhook'
 * (Standard Webhooks puro, Supabase).
 */
export async function verificarStandardWebhook(
  rawBody,
  headers,
  secret,
  { prefixo = 'webhook', nowMs = Date.now(), clockSkewSeconds = STANDARD_WEBHOOK_CLOCK_SKEW_SECONDS } = {},
) {
  if (typeof rawBody !== 'string' || !secret) return false;

  const id = textoSeguro(header(headers, `${prefixo}-id`), 120);
  const timestamp = textoSeguro(header(headers, `${prefixo}-timestamp`), 32);
  const signatures = parseSignatures(header(headers, `${prefixo}-signature`));
  if (!id || !timestamp || !signatures.length) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > clockSkewSeconds) return false;

  const chaves = chavesDoSegredo(secret);
  if (!chaves.length) return false;

  try {
    const signedPayload = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
    for (const keyBytes of chaves) {
      const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = await crypto.subtle.sign('HMAC', key, signedPayload);
      const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
      if (signatures.some((signature) => compararConstante(expected, signature))) return true;
    }
    return false;
  } catch {
    return false;
  }
}
