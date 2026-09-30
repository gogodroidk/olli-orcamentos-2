/**
 * Contrato puro entre a confirmação de e-mail e a outbox de boas-vindas.
 *
 * Este módulo apenas compõe regras já testadas. Não escuta autenticação, não
 * grava em banco, não renderiza e-mail e não chama provider. A camada futura
 * deve persistir evento + item de outbox na mesma transação e impor unicidade
 * para `idempotencyKey`.
 */

import { criarEventoBoasVindas, decidirWelcome } from './welcomeEvent.js';
import { criarItemEmailOutbox } from './emailOutbox.js';

export const WELCOME_OUTBOX_CONTRACT_VERSION = '2026-09-01.v1';

function confirmacaoDeclarada(confirmacao) {
  return confirmacao?.confirmado === true
    || confirmacao?.confirmed === true
    || !!(confirmacao?.confirmedAt || confirmacao?.confirmadoEm);
}

function resultadoImutavel(valor) {
  return Object.freeze({
    version: WELCOME_OUTBOX_CONTRACT_VERSION,
    ...valor,
  });
}

/**
 * Prepara a decisão pública e, quando elegível, evento + item de outbox.
 *
 * `estado.jaEnviado` e `estado.jaPendente` devem vir da persistência confiável
 * no adapter futuro. O tenant do payload continua deliberadamente ignorado por
 * `criarEventoBoasVindas`; somente `contexto.tenantId` entra no evento.
 */
export function prepararWelcomeOutbox(
  confirmacao = {},
  contexto = {},
  estado = {},
  { agora } = {},
) {
  const decisao = decidirWelcome({
    confirmado: confirmacaoDeclarada(confirmacao),
    jaEnviado: estado?.jaEnviado === true,
    jaPendente: estado?.jaPendente === true,
  });

  if (!decisao.enfileirar) {
    return resultadoImutavel({
      enfileirar: false,
      motivo: decisao.motivo,
    });
  }

  const evento = criarEventoBoasVindas(confirmacao, contexto);
  const item = criarItemEmailOutbox(evento, { agora });

  return resultadoImutavel({
    enfileirar: true,
    motivo: decisao.motivo,
    evento,
    item,
  });
}
