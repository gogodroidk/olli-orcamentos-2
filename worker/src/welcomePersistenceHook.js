/**
 * Adaptador puro do hook de confirmação de e-mail para a RPC transacional.
 *
 * Este módulo não conhece rede, Supabase, secrets ou provider. O runtime injeta
 * `enfileirar`, que deve chamar a RPC `enqueue_welcome_email` com service_role
 * somente no Worker. A saída é uma projeção sanitizada e imutável.
 */

import { criarEventoBoasVindas } from './welcomeEvent.js';

export const WELCOME_PERSISTENCE_HOOK_VERSION = '2026-09-04.v1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESULT_KEYS = Object.freeze([
  'eventId',
  'idempotencyKey',
  'eventInserted',
  'outboxInserted',
  'status',
]);

function erro(codigo) {
  const e = new Error(codigo);
  e.codigo = codigo;
  return e;
}

function exigir(condicao, codigo) {
  if (!condicao) throw erro(codigo);
}

function uuidSeguro(valor) {
  return typeof valor === 'string' && UUID_RE.test(valor.trim());
}

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function chavesExatas(valor, esperadas) {
  const chaves = Object.keys(valor).sort();
  return chaves.length === esperadas.length
    && chaves.every((chave, i) => chave === [...esperadas].sort()[i]);
}

function resultadoSanitizado(valor, evento) {
  exigir(valor && typeof valor === 'object' && !Array.isArray(valor), 'rpc_resultado_invalido');
  exigir(chavesExatas(valor, RESULT_KEYS), 'rpc_resultado_formato_invalido');
  exigir(valor.eventId === evento.eventId, 'rpc_resultado_evento_divergente');
  exigir(valor.idempotencyKey === evento.idempotencyKey, 'rpc_resultado_idempotencia_divergente');
  exigir(typeof valor.eventInserted === 'boolean', 'rpc_resultado_event_inserted_invalido');
  exigir(typeof valor.outboxInserted === 'boolean', 'rpc_resultado_outbox_inserted_invalido');
  exigir(valor.status === 'pending', 'rpc_resultado_status_invalido');

  return Object.freeze({
    version: WELCOME_PERSISTENCE_HOOK_VERSION,
    eventId: valor.eventId,
    idempotencyKey: valor.idempotencyKey,
    eventInserted: valor.eventInserted,
    outboxInserted: valor.outboxInserted,
    status: valor.status,
  });
}

/**
 * Persiste a confirmação sem bloquear o cadastro.
 *
 * A dependência injetada recebe apenas os campos da RPC. O tenant é lido do
 * contexto confiável; `confirmacao.tenantId` continua deliberadamente ignorado.
 */
export async function persistirWelcomeConfirmacao(
  confirmacao = {},
  contexto = {},
  { enfileirar } = {},
) {
  exigir(typeof enfileirar === 'function', 'dependencia_enfileirar_obrigatoria');

  const evento = criarEventoBoasVindas(confirmacao, contexto);
  exigir(uuidSeguro(evento.userId), 'usuario_uuid_invalido');
  exigir(evento.tenantId === null || uuidSeguro(evento.tenantId), 'tenant_uuid_invalido');

  const payload = Object.freeze({
    eventId: evento.eventId,
    userId: evento.userId,
    tenantId: evento.tenantId,
    idempotencyKey: evento.idempotencyKey,
    recipient: evento.recipient,
    confirmedAt: evento.confirmedAt,
    source: texto(evento.source, 80),
  });

  const resultado = await enfileirar(payload);
  return resultadoSanitizado(resultado, evento);
}

