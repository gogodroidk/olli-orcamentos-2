/**
 * Journal/reducer puro e persistível da central de notificações.
 *
 * O contrato modela a transação que um adapter futuro deverá executar:
 * optimistic revision + operationId único + estado tenant-bound. Não cria
 * tabela, não acessa banco e não envia mensagem.
 */

import { createHash } from 'node:crypto';
import {
  criarNotificacao,
  dispensarNotificacao,
  inserirNotificacao,
  listarNotificacoes,
  marcarLida,
} from './notificationInbox.js';

export const NOTIFICATION_INBOX_JOURNAL_VERSION = '2026-09-01.v1';
export const NOTIFICATION_INBOX_ACTIONS = Object.freeze(['insert', 'read', 'dismiss', 'purge_expired']);

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function id(v, limite = 180) {
  const valor = texto(v, limite);
  return /^[a-zA-Z0-9._:-]+$/.test(valor) ? valor : '';
}

function iso(v) {
  const data = v instanceof Date ? v : new Date(v || '');
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function contextoSeguro(contexto = {}) {
  const userId = id(contexto.userId, 120);
  const tenantId = id(contexto.tenantId, 120) || null;
  exigir(userId, 'contexto_usuario_obrigatorio');
  return { userId, tenantId };
}

function escopo({ userId, tenantId }) {
  return JSON.stringify([tenantId, userId]);
}

function canonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  return `{${Object.keys(valor).sort().map((chave) => `${JSON.stringify(chave)}:${canonico(valor[chave])}`).join(',')}}`;
}

function fingerprintComando(comando) {
  return createHash('sha256').update(canonico({
    action: comando.action,
    expectedRevision: comando.expectedRevision,
    payload: comando.payload || null,
  })).digest('hex');
}

function congelarItem(item) {
  return Object.freeze({ ...item });
}

function congelarEstado(estado) {
  const items = Object.freeze((estado.items || []).map(congelarItem));
  const appliedOperations = Object.freeze((estado.appliedOperations || []).map(congelarItem));
  return Object.freeze({ ...estado, items, appliedOperations });
}

function assertEstado(estado, contexto) {
  const ctx = contextoSeguro(contexto);
  exigir(estado?.version === NOTIFICATION_INBOX_JOURNAL_VERSION, 'estado_invalido');
  exigir(estado.scopeKey === escopo(ctx), 'escopo_divergente');
  exigir(Number.isInteger(estado.revision) && estado.revision >= 0, 'revision_invalida');
  exigir(Array.isArray(estado.items) && Array.isArray(estado.appliedOperations), 'estado_invalido');
  exigir(estado.items.every((item) => item?.userId === ctx.userId && (item?.tenantId || null) === ctx.tenantId), 'estado_contaminado');
  return ctx;
}

export function criarEstadoInbox(contexto = {}, { agora } = {}) {
  const ctx = contextoSeguro(contexto);
  const createdAt = iso(agora);
  exigir(createdAt, 'agora_invalido');
  return congelarEstado({
    version: NOTIFICATION_INBOX_JOURNAL_VERSION,
    scopeKey: escopo(ctx),
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    revision: 0,
    items: [],
    appliedOperations: [],
    createdAt,
    updatedAt: createdAt,
  });
}

function resultado(estado, aplicada, motivo) {
  return Object.freeze({ estado, aplicada, motivo, revision: estado.revision });
}

function assertRelogio(estado, agora) {
  exigir(Date.parse(agora) >= Date.parse(estado.updatedAt), 'clock_skew');
}

export function aplicarComandoInbox(estado, comando = {}, { contexto = {}, agora } = {}) {
  const ctx = assertEstado(estado, contexto);
  const operationId = id(comando.operationId);
  const action = texto(comando.action, 40);
  const updatedAt = iso(agora);
  exigir(operationId, 'operation_id_invalido');
  exigir(NOTIFICATION_INBOX_ACTIONS.includes(action), 'action_invalida');
  exigir(updatedAt, 'agora_invalido');

  const commandFingerprint = fingerprintComando(comando);
  const anterior = estado.appliedOperations.find((op) => op.operationId === operationId);
  if (anterior) {
    exigir(anterior.commandFingerprint === commandFingerprint, 'operation_replay_divergente');
    return resultado(estado, false, 'operacao_duplicada');
  }

  exigir(Number.isInteger(comando.expectedRevision) && comando.expectedRevision === estado.revision, 'revision_conflict');
  assertRelogio(estado, updatedAt);

  let items = estado.items;
  let motivo = 'aplicada';

  if (action === 'insert') {
    const item = criarNotificacao(comando.payload || {}, { contexto: ctx, agora: updatedAt });
    exigir(Date.parse(item.createdAt) <= Date.parse(updatedAt), 'created_at_futuro');
    exigir(!item.expiresAt || Date.parse(item.expiresAt) > Date.parse(updatedAt), 'notificacao_expirada');
    const insercao = inserirNotificacao(items, item);
    items = insercao.lista;
    motivo = insercao.motivo;
  } else if (action === 'read' || action === 'dismiss') {
    const notificationId = id(comando.payload?.notificationId);
    exigir(notificationId, 'notification_id_invalido');
    const alvo = items.find((item) => item.notificationId === notificationId && item.userId === ctx.userId && (item.tenantId || null) === ctx.tenantId);
    if (alvo) {
      exigir(Date.parse(updatedAt) >= Date.parse(alvo.updatedAt || alvo.createdAt), 'clock_skew');
    }
    const alteracao = action === 'read'
      ? marcarLida(items, notificationId, { contexto: ctx, agora: updatedAt })
      : dispensarNotificacao(items, notificationId, { contexto: ctx, agora: updatedAt });
    items = alteracao.lista;
    motivo = alteracao.motivo;
  } else {
    const antes = items.length;
    items = items.filter((item) => !item.expiresAt || Date.parse(item.expiresAt) > Date.parse(updatedAt));
    motivo = antes === items.length ? 'nenhum_expirado' : 'expirados_removidos';
  }

  const proximo = congelarEstado({
    ...estado,
    revision: estado.revision + 1,
    items,
    appliedOperations: [
      ...estado.appliedOperations,
      { operationId, commandFingerprint, appliedAt: updatedAt },
    ],
    updatedAt,
  });
  return resultado(proximo, true, motivo);
}

/** Projeção pública: não expõe scopeKey nem o journal de idempotência. */
export function projetarEstadoInbox(estado, { contexto = {}, status, limite = 50, agora } = {}) {
  assertEstado(estado, contexto);
  const items = Object.freeze(listarNotificacoes(estado.items, { contexto, status, limite, agora }).map(congelarItem));
  return Object.freeze({
    version: estado.version,
    revision: estado.revision,
    items,
  });
}
