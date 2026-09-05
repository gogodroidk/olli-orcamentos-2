/**
 * Contrato puro da trilha de consultas administrativas.
 *
 * Registra somente metadados pseudonimizados e a decisão derivada da política.
 * Não acessa service-role, não consulta banco, não exporta dados e não autoriza
 * treinamento de IA.
 */

import { createHash } from 'node:crypto';
import {
  ADMIN_DATA_POLICY_VERSION,
  ADMIN_DATA_ROLES,
  ADMIN_DATASETS,
  camposAdmin,
  podeLerDadosAdmin,
} from './adminDataPolicy.js';

export const ADMIN_ACCESS_AUDIT_VERSION = '2026-09-01.v1';
export const ADMIN_ACCESS_PURPOSES = Object.freeze([
  'support_diagnosis',
  'billing_support',
  'security_review',
  'account_assistance',
]);
export const ADMIN_ACCESS_OUTCOMES = Object.freeze(['allowed', 'denied']);

const PURPOSE_ROLES = Object.freeze({
  support_diagnosis: Object.freeze(['suporte', 'admin', 'owner']),
  billing_support: Object.freeze(['financeiro', 'admin', 'owner']),
  security_review: Object.freeze(['admin', 'owner']),
  account_assistance: Object.freeze(['suporte', 'admin', 'owner']),
});

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function id(v, limite = 180) {
  const valor = texto(v, limite);
  return /^[a-zA-Z0-9._:-]+$/.test(valor) ? valor : '';
}

function hex64(v) {
  const valor = texto(v, 64).toLowerCase();
  return /^[a-f0-9]{64}$/.test(valor) ? valor : '';
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

function canonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  return `{${Object.keys(valor).sort().map((chave) => `${JSON.stringify(chave)}:${canonico(valor[chave])}`).join(',')}}`;
}

function sha256(valor) {
  return createHash('sha256').update(valor).digest('hex');
}

function congelar(item) {
  return Object.freeze({ ...item });
}

function contextoSeguro(contexto = {}) {
  const actorFingerprint = hex64(contexto.actorFingerprint);
  const role = texto(contexto.role, 30);
  exigir(contexto.canAuditAdminData === true, 'capability_auditoria_obrigatoria');
  exigir(actorFingerprint, 'actor_fingerprint_invalida');
  exigir(ADMIN_DATA_ROLES.includes(role), 'role_invalida');
  return { actorFingerprint, role };
}

function fingerprintEvento(evento) {
  return sha256(canonico(evento));
}

export function criarEventoAcessoAdmin(input = {}, contexto = {}, { agora } = {}) {
  const ctx = contextoSeguro(contexto);
  const auditId = id(input.auditId);
  const correlationId = id(input.correlationId);
  const targetFingerprint = hex64(input.targetFingerprint);
  const dataset = texto(input.dataset, 40);
  const purpose = texto(input.purpose, 50);
  const createdAt = iso(agora);
  exigir(auditId, 'audit_id_invalido');
  exigir(correlationId, 'correlation_id_invalido');
  exigir(targetFingerprint, 'target_fingerprint_invalida');
  exigir(ADMIN_DATASETS.includes(dataset), 'dataset_invalido');
  exigir(ADMIN_ACCESS_PURPOSES.includes(purpose), 'purpose_invalido');
  exigir(createdAt, 'agora_invalido');

  const purposeAllowed = PURPOSE_ROLES[purpose].includes(ctx.role);
  const datasetAllowed = podeLerDadosAdmin(ctx.role, dataset);
  const allowed = purposeAllowed && datasetAllowed;
  const fields = allowed ? camposAdmin(ctx.role, dataset).sort() : [];
  const denialReason = allowed ? null : (purposeAllowed ? 'dataset_not_allowed' : 'purpose_not_allowed');

  return congelar({
    version: ADMIN_ACCESS_AUDIT_VERSION,
    policyVersion: ADMIN_DATA_POLICY_VERSION,
    auditId,
    correlationId,
    actorFingerprint: ctx.actorFingerprint,
    targetFingerprint,
    role: ctx.role,
    dataset,
    purpose,
    outcome: allowed ? 'allowed' : 'denied',
    denialReason,
    fieldCount: fields.length,
    fieldSetHash: sha256(canonico(fields)),
    createdAt,
  });
}

function congelarEstado(estado) {
  return Object.freeze({
    ...estado,
    entries: Object.freeze((estado.entries || []).map(congelar)),
  });
}

export function criarEstadoAuditoriaAdmin(contexto = {}, { agora } = {}) {
  const ctx = contextoSeguro(contexto);
  const createdAt = iso(agora);
  exigir(createdAt, 'agora_invalido');
  return congelarEstado({
    version: ADMIN_ACCESS_AUDIT_VERSION,
    actorFingerprint: ctx.actorFingerprint,
    role: ctx.role,
    revision: 0,
    lastHash: '0'.repeat(64),
    entries: [],
    createdAt,
    updatedAt: createdAt,
  });
}

function assertEstado(estado, contexto) {
  const ctx = contextoSeguro(contexto);
  exigir(estado?.version === ADMIN_ACCESS_AUDIT_VERSION, 'estado_invalido');
  exigir(estado.actorFingerprint === ctx.actorFingerprint && estado.role === ctx.role, 'escopo_divergente');
  exigir(Number.isInteger(estado.revision) && estado.revision >= 0 && Array.isArray(estado.entries), 'estado_invalido');
  return ctx;
}

export function anexarEventoAuditoriaAdmin(estado, evento, contexto = {}, { expectedRevision } = {}) {
  const ctx = assertEstado(estado, contexto);
  exigir(evento?.version === ADMIN_ACCESS_AUDIT_VERSION, 'evento_invalido');
  exigir(evento.actorFingerprint === ctx.actorFingerprint && evento.role === ctx.role, 'evento_escopo_divergente');
  const eventFingerprint = fingerprintEvento(evento);
  const anterior = estado.entries.find((entry) => entry.auditId === evento.auditId);
  if (anterior) {
    exigir(anterior.eventFingerprint === eventFingerprint, 'audit_replay_divergente');
    return Object.freeze({ estado, anexado: false, motivo: 'audit_duplicado', revision: estado.revision });
  }
  exigir(Number.isInteger(expectedRevision) && expectedRevision === estado.revision, 'revision_conflict');
  exigir(Date.parse(evento.createdAt) >= Date.parse(estado.updatedAt), 'clock_skew');

  const previousHash = estado.lastHash;
  const entryHash = sha256(`${previousHash}:${eventFingerprint}`);
  const entry = congelar({ ...evento, eventFingerprint, previousHash, entryHash });
  const proximo = congelarEstado({
    ...estado,
    revision: estado.revision + 1,
    lastHash: entryHash,
    entries: [...estado.entries, entry],
    updatedAt: evento.createdAt,
  });
  return Object.freeze({ estado: proximo, anexado: true, motivo: 'anexado', revision: proximo.revision });
}

export function verificarCadeiaAuditoriaAdmin(estado) {
  if (!estado || !Array.isArray(estado.entries)) return false;
  let previousHash = '0'.repeat(64);
  for (const entry of estado.entries) {
    const evento = {};
    for (const [chave, valor] of Object.entries(entry)) {
      if (!['eventFingerprint', 'previousHash', 'entryHash'].includes(chave)) evento[chave] = valor;
    }
    const eventFingerprint = fingerprintEvento(evento);
    const entryHash = sha256(`${previousHash}:${eventFingerprint}`);
    if (entry.eventFingerprint !== eventFingerprint || entry.previousHash !== previousHash || entry.entryHash !== entryHash) return false;
    previousHash = entryHash;
  }
  return previousHash === estado.lastHash && estado.revision === estado.entries.length;
}

/** Projeção sem ator/alvo, campos consultados ou conteúdo do usuário. */
export function projetarAuditoriaAdmin(estado, { limite = 100 } = {}) {
  const limiteSeguro = Number.isInteger(limite) ? Math.max(1, Math.min(limite, 500)) : 100;
  const entries = estado.entries.slice(-limiteSeguro).map((entry) => congelar({
    auditId: entry.auditId,
    correlationId: entry.correlationId,
    role: entry.role,
    dataset: entry.dataset,
    purpose: entry.purpose,
    outcome: entry.outcome,
    denialReason: entry.denialReason,
    fieldCount: entry.fieldCount,
    policyVersion: entry.policyVersion,
    createdAt: entry.createdAt,
    entryHash: entry.entryHash,
  }));
  return Object.freeze({ version: estado.version, revision: estado.revision, chainValid: verificarCadeiaAuditoriaAdmin(estado), entries: Object.freeze(entries) });
}
