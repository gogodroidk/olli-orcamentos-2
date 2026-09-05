/**
 * Composição pura entre política de dados e auditoria administrativa.
 *
 * O chamador só recebe um plano de consulta allowlistado depois que a decisão
 * (permitida ou negada) foi anexada a uma cadeia de auditoria válida. Este
 * módulo não acessa service-role, rota, banco, dados de usuário ou rede.
 */

import {
  anexarEventoAuditoriaAdmin,
  criarEventoAcessoAdmin,
  verificarCadeiaAuditoriaAdmin,
} from './adminAccessAudit.js';
import { selectAdminDataset } from './adminDataPolicy.js';

export const ADMIN_AUDIT_POLICY_CONTRACT_VERSION = '2026-09-01.v1';

const REQUEST_KEYS = Object.freeze([
  'auditId',
  'correlationId',
  'targetFingerprint',
  'dataset',
  'purpose',
]);
const CONTEXT_KEYS = Object.freeze(['actorFingerprint', 'role', 'canAuditAdminData']);
const OPTION_KEYS = Object.freeze(['expectedRevision', 'agora']);
const STATE_KEYS = Object.freeze([
  'version',
  'actorFingerprint',
  'role',
  'revision',
  'lastHash',
  'entries',
  'createdAt',
  'updatedAt',
]);
const ENTRY_KEYS = Object.freeze([
  'version',
  'policyVersion',
  'auditId',
  'correlationId',
  'actorFingerprint',
  'targetFingerprint',
  'role',
  'dataset',
  'purpose',
  'outcome',
  'denialReason',
  'fieldCount',
  'fieldSetHash',
  'createdAt',
  'eventFingerprint',
  'previousHash',
  'entryHash',
]);

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objetoPlano(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function chavesExatas(valor, esperadas, codigo) {
  exigir(objetoPlano(valor), codigo);
  const recebidas = Object.keys(valor).sort();
  const lista = [...esperadas].sort();
  exigir(recebidas.length === lista.length && recebidas.every((chave, indice) => chave === lista[indice]), codigo);
}

function congelarProfundo(valor) {
  if (valor === null || typeof valor !== 'object' || Object.isFrozen(valor)) return valor;
  for (const item of Object.values(valor)) congelarProfundo(item);
  return Object.freeze(valor);
}

function validarEstadoAuditoria(estado) {
  chavesExatas(estado, STATE_KEYS, 'estado_auditoria_invalido');
  exigir(Array.isArray(estado.entries), 'estado_auditoria_invalido');
  for (const entry of estado.entries) chavesExatas(entry, ENTRY_KEYS, 'entrada_auditoria_invalida');
  exigir(verificarCadeiaAuditoriaAdmin(estado), 'cadeia_auditoria_invalida');
}

/**
 * Retorna o próximo estado auditável e uma decisão sanitizada.
 *
 * `decisao.planoConsulta` é nulo quando a política nega ou quando qualquer
 * pré-condição lança erro. O estado contém apenas fingerprints pseudonimizadas,
 * nunca dados consultados.
 */
export function comporConsultaAdminAuditada(
  request = {},
  contexto = {},
  estadoAuditoria,
  opcoes = {},
) {
  chavesExatas(request, REQUEST_KEYS, 'request_invalido');
  chavesExatas(contexto, CONTEXT_KEYS, 'contexto_invalido');
  chavesExatas(opcoes, OPTION_KEYS, 'opcoes_invalidas');
  validarEstadoAuditoria(estadoAuditoria);

  const evento = criarEventoAcessoAdmin(request, contexto, { agora: opcoes.agora });
  const append = anexarEventoAuditoriaAdmin(estadoAuditoria, evento, contexto, {
    expectedRevision: opcoes.expectedRevision,
  });
  exigir(verificarCadeiaAuditoriaAdmin(append.estado), 'cadeia_auditoria_invalida');

  const entry = append.estado.entries.find((item) => item.auditId === evento.auditId);
  exigir(entry && entry.outcome === evento.outcome, 'compromisso_auditoria_ausente');

  const permitido = evento.outcome === 'allowed';
  const select = permitido ? selectAdminDataset(contexto.role, evento.dataset) : '';
  exigir(!permitido || select, 'select_allowlist_ausente');

  const decisao = congelarProfundo({
    version: ADMIN_AUDIT_POLICY_CONTRACT_VERSION,
    allowed: permitido,
    reason: permitido ? 'allowed' : evento.denialReason,
    planoConsulta: permitido ? {
      dataset: evento.dataset,
      select,
      projectionRequired: evento.dataset === 'empresa',
    } : null,
    auditCommitment: {
      auditId: evento.auditId,
      correlationId: evento.correlationId,
      outcome: evento.outcome,
      revision: append.estado.revision,
      entryHash: entry.entryHash,
      appended: append.anexado,
      chainValid: true,
    },
  });

  return Object.freeze({
    estadoAuditoria: append.estado,
    decisao,
  });
}

