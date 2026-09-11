/**
 * Contrato puro do ciclo de vida de aparelhos elegíveis a push.
 *
 * O token bruto não entra neste módulo. Um adapter futuro deve proteger o
 * token e fornecer apenas uma fingerprint HMAC-SHA-256 de 64 caracteres para
 * deduplicação/auditoria. Este arquivo não pede permissão, não persiste e não
 * envia push.
 */

export const PUSH_DEVICE_REGISTRY_VERSION = '2026-09-01.v1';
export const PUSH_DEVICE_PLATFORMS = Object.freeze(['android', 'ios', 'web']);
export const PUSH_DEVICE_STATES = Object.freeze(['active', 'revoked', 'invalid']);

const REVOCATION_REASONS = new Set(['user_revoked', 'logout', 'account_closed']);
const INVALIDATION_REASONS = new Set(['token_invalid', 'token_expired', 'provider_rejected']);

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function id(v, limite = 160) {
  const valor = texto(v, limite);
  return /^[a-zA-Z0-9._:-]+$/.test(valor) ? valor : '';
}

function iso(v, fallback) {
  const data = v instanceof Date ? v : new Date(v || fallback || '');
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

function contextoConfiavel(contexto = {}) {
  const userId = id(contexto.userId, 120);
  const tenantId = id(contexto.tenantId, 120);
  exigir(userId, 'contexto_usuario_obrigatorio');
  exigir(tenantId, 'contexto_tenant_obrigatorio');
  return { userId, tenantId };
}

function assertMesmoEscopo(registro, contexto) {
  const confiavel = contextoConfiavel(contexto);
  exigir(registro?.userId === confiavel.userId && registro?.tenantId === confiavel.tenantId, 'escopo_divergente');
  return confiavel;
}

function fingerprint(v) {
  const valor = texto(v, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(valor) ? valor : '';
}

function assertRelogioMonotono(registro, agora) {
  const updatedAt = Date.parse(registro.updatedAt);
  exigir(!Number.isNaN(updatedAt) && Date.parse(agora) >= updatedAt, 'clock_skew');
}

export function criarRegistroDispositivo(input = {}, contexto = {}, { agora } = {}) {
  const { userId, tenantId } = contextoConfiavel(contexto);
  const deviceId = id(input.deviceId);
  const platform = texto(input.platform, 20).toLowerCase();
  const tokenFingerprint = fingerprint(input.tokenFingerprint);
  const appVersion = texto(input.appVersion, 40);
  const deviceLabel = texto(input.deviceLabel, 80) || null;
  const createdAt = iso(agora);
  const consentAt = iso(input.consentAt);

  exigir(input.consentGranted === true, 'consentimento_obrigatorio');
  exigir(deviceId, 'device_id_invalido');
  exigir(PUSH_DEVICE_PLATFORMS.includes(platform), 'plataforma_invalida');
  exigir(tokenFingerprint, 'fingerprint_invalida');
  exigir(appVersion, 'app_version_obrigatoria');
  exigir(createdAt, 'agora_invalido');
  exigir(consentAt, 'consent_at_invalido');
  exigir(Date.parse(consentAt) <= Date.parse(createdAt), 'consent_at_futuro');
  if (input.userId) exigir(id(input.userId, 120) === userId, 'usuario_payload_divergente');

  return congelar({
    version: PUSH_DEVICE_REGISTRY_VERSION,
    deviceId,
    userId,
    tenantId,
    platform,
    appVersion,
    deviceLabel,
    tokenFingerprint,
    status: 'active',
    consentAt,
    createdAt,
    updatedAt: createdAt,
    lastSeenAt: createdAt,
    revokedAt: null,
    terminalReason: null,
  });
}

export function rotacionarFingerprint(registro, input = {}, contexto = {}, { agora } = {}) {
  assertMesmoEscopo(registro, contexto);
  exigir(registro.status === 'active', 'dispositivo_terminal');
  const tokenFingerprint = fingerprint(input.tokenFingerprint);
  const appVersion = texto(input.appVersion, 40) || registro.appVersion;
  const updatedAt = iso(agora);
  exigir(tokenFingerprint, 'fingerprint_invalida');
  exigir(updatedAt, 'agora_invalido');
  assertRelogioMonotono(registro, updatedAt);
  if (tokenFingerprint === registro.tokenFingerprint && appVersion === registro.appVersion) return registro;
  return congelar({ ...registro, tokenFingerprint, appVersion, updatedAt, lastSeenAt: updatedAt });
}

export function revogarDispositivo(registro, contexto = {}, { motivo = 'user_revoked', agora } = {}) {
  assertMesmoEscopo(registro, contexto);
  if (registro.status === 'revoked') return registro;
  exigir(registro.status === 'active', 'dispositivo_terminal');
  exigir(REVOCATION_REASONS.has(motivo), 'motivo_revogacao_invalido');
  const updatedAt = iso(agora);
  exigir(updatedAt, 'agora_invalido');
  assertRelogioMonotono(registro, updatedAt);
  return congelar({
    ...registro,
    status: 'revoked',
    revokedAt: updatedAt,
    terminalReason: motivo,
    updatedAt,
  });
}

export function marcarTokenInvalido(registro, contexto = {}, { motivo = 'token_invalid', agora } = {}) {
  assertMesmoEscopo(registro, contexto);
  exigir(contexto.canManageDelivery === true, 'capability_delivery_obrigatoria');
  if (registro.status === 'invalid') return registro;
  exigir(registro.status === 'active', 'dispositivo_terminal');
  exigir(INVALIDATION_REASONS.has(motivo), 'motivo_invalidacao_invalido');
  const updatedAt = iso(agora);
  exigir(updatedAt, 'agora_invalido');
  assertRelogioMonotono(registro, updatedAt);
  return congelar({
    ...registro,
    status: 'invalid',
    revokedAt: updatedAt,
    terminalReason: motivo,
    updatedAt,
  });
}

export function listarDispositivosAtivos(registros = [], contexto = {}) {
  const { userId, tenantId } = contextoConfiavel(contexto);
  exigir(Array.isArray(registros), 'registros_invalidos');
  const lista = registros
    .filter((item) => item?.status === 'active' && item.userId === userId && item.tenantId === tenantId)
    .map((item) => congelar({
      deviceId: item.deviceId,
      platform: item.platform,
      appVersion: item.appVersion,
      deviceLabel: item.deviceLabel,
      status: item.status,
      consentAt: item.consentAt,
      lastSeenAt: item.lastSeenAt,
    }));
  return Object.freeze(lista);
}
