/**
 * Contrato puro da central de notificações dentro do OLLI.
 *
 * Esta fatia não grava em banco, pede permissão nem envia push/e-mail. Ela
 * mantém a regra de inbox testável: evento deduplicado por usuário/tenant,
 * texto plain-text limitado, leitura/dispensa idempotentes e isolamento por
 * contexto confiável.
 */

export const NOTIFICATION_INBOX_VERSION = '2026-08-31.v1';
export const NOTIFICATION_INBOX_STATES = Object.freeze(['unread', 'read', 'dismissed']);
export const NOTIFICATION_KINDS = Object.freeze(['security', 'operational', 'education', 'engagement']);
export const NOTIFICATION_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'critical']);

function texto(value, limite) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

function idSeguro(value) {
  return texto(value, 180).replace(/[^a-zA-Z0-9._:-]/g, '-');
}

function isoSeguro(value, fallback) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function exigir(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.codigo = code;
    throw error;
  }
}

function clone(item) {
  return Object.freeze({ ...item });
}

function contextoSeguro(contexto = {}) {
  const userId = idSeguro(contexto.userId);
  const tenantId = idSeguro(contexto.tenantId) || null;
  exigir(userId, 'contexto_usuario_obrigatorio');
  return { userId, tenantId };
}

function chaveEvento(item) {
  return JSON.stringify([item.tenantId || null, item.userId, item.eventId]);
}

function idDeterministico({ tenantId, userId, eventId }) {
  return [tenantId || 'user', userId, eventId]
    .map((part) => encodeURIComponent(part))
    .join(':');
}

/** Cria uma notificação in-app sem aceitar identidade de tenant do payload. */
export function criarNotificacao(input = {}, { contexto = {}, agora } = {}) {
  const ctx = contextoSeguro(contexto);
  const eventId = idSeguro(input.eventId || input.event_id);
  const payloadUserId = idSeguro(input.userId || input.user_id);
  const payloadTenantId = idSeguro(input.tenantId || input.tenant_id) || null;
  const kind = texto(input.kind, 30);
  const priority = texto(input.priority || 'normal', 20);
  const title = texto(input.title || input.titulo, 160);
  const body = texto(input.body || input.mensagem, 1200);
  const createdAt = isoSeguro(input.createdAt || input.created_at, agora);
  const expiresAt = input.expiresAt || input.expires_at
    ? isoSeguro(input.expiresAt || input.expires_at)
    : null;
  const actionUrl = texto(input.actionUrl || input.action_url, 500);

  exigir(eventId, 'event_id_obrigatorio');
  exigir(!payloadUserId || payloadUserId === ctx.userId, 'usuario_contexto_divergente');
  exigir(!payloadTenantId || payloadTenantId === ctx.tenantId, 'tenant_contexto_divergente');
  exigir(NOTIFICATION_KINDS.includes(kind), 'kind_invalido');
  exigir(NOTIFICATION_PRIORITIES.includes(priority), 'priority_invalida');
  exigir(title && body, 'conteudo_obrigatorio');
  exigir(createdAt, 'created_at_invalido');
  exigir(!actionUrl || /^https:\/\//i.test(actionUrl), 'action_url_invalida');

  if (expiresAt) {
    exigir(new Date(expiresAt).getTime() > new Date(createdAt).getTime(), 'expires_at_invalido');
  }

  return clone({
    version: NOTIFICATION_INBOX_VERSION,
    notificationId: idDeterministico({ tenantId: ctx.tenantId, userId: ctx.userId, eventId }),
    eventId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    channel: 'in_app',
    kind,
    priority,
    title,
    body,
    actionUrl: actionUrl || null,
    status: 'unread',
    createdAt,
    expiresAt,
    readAt: null,
    dismissedAt: null,
  });
}

/** Insere sem mutar a lista; o mesmo evento no mesmo escopo é idempotente. */
export function inserirNotificacao(lista, item) {
  exigir(item && item.notificationId && item.eventId, 'notificacao_invalida');
  const atual = Array.isArray(lista) ? lista : [];
  const duplicada = atual.some((existente) => chaveEvento(existente) === chaveEvento(item));
  const copia = atual.map(clone);
  if (duplicada) return Object.freeze({ lista: copia, inserida: false, motivo: 'evento_duplicado' });
  return Object.freeze({ lista: [...copia, clone(item)], inserida: true, motivo: 'inserida' });
}

function pertence(item, ctx) {
  return item?.userId === ctx.userId && (item?.tenantId || null) === ctx.tenantId;
}

/** Lista somente o inbox do contexto; itens expirados ficam fora da projeção. */
export function listarNotificacoes(lista, { contexto = {}, status, limite = 50, agora } = {}) {
  const ctx = contextoSeguro(contexto);
  const instante = new Date(isoSeguro(agora, new Date().toISOString())).getTime();
  const limiteSeguro = Number.isInteger(limite) ? Math.max(1, Math.min(limite, 100)) : 50;
  return (Array.isArray(lista) ? lista : [])
    .filter((item) => pertence(item, ctx))
    .filter((item) => !status || item.status === status)
    .filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > instante)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limiteSeguro)
    .map(clone);
}

function alterarEstado(lista, notificationId, { contexto = {}, agora, destino } = {}) {
  const ctx = contextoSeguro(contexto);
  const id = idSeguro(notificationId);
  const updatedAt = isoSeguro(agora);
  exigir(updatedAt, 'agora_invalido');
  let alterada = false;
  const copia = (Array.isArray(lista) ? lista : []).map((item) => {
    if (item.notificationId !== id || !pertence(item, ctx)) return clone(item);
    if (destino === 'read' && (item.status === 'read' || item.status === 'dismissed')) return clone(item);
    if (destino === 'dismissed' && item.status === 'dismissed') return clone(item);
    alterada = true;
    if (destino === 'read') return clone({ ...item, status: 'read', readAt: updatedAt, updatedAt });
    return clone({ ...item, status: 'dismissed', dismissedAt: updatedAt, updatedAt });
  });
  return Object.freeze({ lista: copia, alterada, motivo: alterada ? 'atualizada' : 'nao_encontrada' });
}

export function marcarLida(lista, notificationId, opcoes = {}) {
  return alterarEstado(lista, notificationId, { ...opcoes, destino: 'read' });
}

export function dispensarNotificacao(lista, notificationId, opcoes = {}) {
  return alterarEstado(lista, notificationId, { ...opcoes, destino: 'dismissed' });
}

export function estadoTerminal(item) {
  return item?.status === 'dismissed';
}
