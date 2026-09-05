/**
 * Adapter Resend transacional isolado e injetável.
 *
 * Este módulo não lê `env`, não escolhe remetente, não importa o runtime e não
 * possui transporte de rede próprio. A integração futura precisa fornecer um
 * transporte explícito depois dos gates de identidade, secret e canário.
 */

export const RESEND_TRANSACTIONAL_ADAPTER_VERSION = '2026-09-02.v2';
export const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

const CONFIG_KEYS = Object.freeze(['apiKey', 'from', 'replyTo', 'transport']);
const DELIVERY_KEYS = Object.freeze(['claimedItem', 'message']);
const OUTBOX_KEYS = Object.freeze([
  'version',
  'eventId',
  'idempotencyKey',
  'template',
  'templateVersion',
  'purpose',
  'recipient',
  'attempts',
  'status',
  'nextAttemptAt',
  'providerId',
  'errorCode',
  'createdAt',
  'updatedAt',
]);
const MESSAGE_KEYS = Object.freeze([
  'eventId',
  'template',
  'templateVersion',
  'purpose',
  'kind',
  'subject',
  'html',
  'text',
]);
const TRANSPORT_RESPONSE_KEYS = Object.freeze(['status', 'body']);

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(valor, codigo) {
  exigir(valor !== null && typeof valor === 'object' && !Array.isArray(valor), codigo);
  return valor;
}

function chavesExatas(valor, esperadas, codigo) {
  objeto(valor, codigo);
  const atuais = Object.keys(valor).sort();
  const alvo = [...esperadas].sort();
  exigir(atuais.length === alvo.length && atuais.every((chave, indice) => chave === alvo[indice]), codigo);
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function idSeguro(valor, limite, codigo) {
  const id = texto(valor);
  exigir(id.length > 0 && id.length <= limite && /^[a-zA-Z0-9._:-]+$/.test(id), codigo);
  return id;
}

function emailSeguro(valor, codigo) {
  const entrada = texto(valor).toLowerCase();
  exigir(entrada.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(entrada), codigo);
  return entrada;
}

function enderecoRemetenteSeguro(valor, codigo) {
  const entrada = texto(valor);
  exigir(entrada.length > 0 && entrada.length <= 320 && !/[\r\n]/.test(entrada), codigo);
  const comNome = entrada.match(/^([^<>]{1,120})\s*<([^<>]+)>$/);
  if (comNome) {
    exigir(comNome[1].trim().length > 0, codigo);
    emailSeguro(comNome[2], codigo);
    return entrada;
  }
  emailSeguro(entrada, codigo);
  return entrada;
}

function resultado(valor) {
  return Object.freeze(valor);
}

function falha(code, retryable) {
  return resultado({ ok: false, code, retryable });
}

function validarConfiguracao(config) {
  chavesExatas(config, CONFIG_KEYS, 'config_campos_invalidos');
  const apiKey = texto(config.apiKey);
  exigir(apiKey.length >= 8 && apiKey.length <= 512 && /^\S+$/.test(apiKey), 'api_key_invalida');
  const from = enderecoRemetenteSeguro(config.from, 'remetente_invalido');
  const replyTo = enderecoRemetenteSeguro(config.replyTo, 'reply_to_invalido');
  exigir(typeof config.transport === 'function', 'transporte_obrigatorio');
  return Object.freeze({ apiKey, from, replyTo, transport: config.transport });
}

function validarEntrega(delivery) {
  chavesExatas(delivery, DELIVERY_KEYS, 'delivery_campos_invalidos');
  chavesExatas(delivery.claimedItem, OUTBOX_KEYS, 'outbox_campos_invalidos');
  chavesExatas(delivery.message, MESSAGE_KEYS, 'message_campos_invalidos');

  const item = delivery.claimedItem;
  const message = delivery.message;
  exigir(item.status === 'sending', 'outbox_nao_reservada');
  exigir(Number.isInteger(item.attempts) && item.attempts >= 1, 'outbox_tentativa_invalida');
  exigir(item.providerId === null && item.errorCode === null, 'outbox_resultado_preexistente');

  const eventId = idSeguro(item.eventId, 160, 'event_id_invalido');
  const idempotencyKey = idSeguro(item.idempotencyKey, 240, 'idempotency_key_invalida');
  const recipient = emailSeguro(item.recipient, 'destinatario_invalido');
  const template = idSeguro(item.template, 80, 'template_invalido');
  const templateVersion = idSeguro(item.templateVersion, 80, 'template_version_invalida');
  const purpose = idSeguro(item.purpose, 100, 'purpose_invalido');

  exigir(message.eventId === eventId, 'message_event_divergente');
  exigir(message.template === template, 'message_template_divergente');
  exigir(message.templateVersion === templateVersion, 'message_template_version_divergente');
  exigir(message.purpose === purpose, 'message_purpose_divergente');
  exigir(message.kind === 'transactional', 'message_kind_invalido');

  const subject = texto(message.subject);
  exigir(subject.length > 0 && subject.length <= 180 && !/[\r\n]/.test(subject), 'subject_invalido');
  exigir(typeof message.html === 'string' && message.html.length > 0 && message.html.length <= 500_000, 'html_invalido');
  exigir(typeof message.text === 'string' && message.text.length > 0 && message.text.length <= 100_000, 'text_invalido');

  return Object.freeze({
    eventId,
    idempotencyKey,
    recipient,
    subject,
    html: message.html,
    text: message.text,
  });
}

function respostaValida(response) {
  try {
    chavesExatas(response, TRANSPORT_RESPONSE_KEYS, 'transport_response_invalida');
    exigir(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, 'transport_status_invalido');
    exigir(response.body === null || (typeof response.body === 'object' && !Array.isArray(response.body)), 'transport_body_invalido');
    return true;
  } catch {
    return false;
  }
}

function classificarResposta(response) {
  if (!respostaValida(response)) return falha('provider_response_invalid', true);
  const status = response.status;

  if (status >= 200 && status < 300) {
    const providerId = response.body && idSeguroOuVazio(response.body.id, 160);
    return providerId
      ? resultado({ ok: true, providerId, code: 'accepted', retryable: false })
      : falha('provider_response_invalid', true);
  }
  if (status === 408) return falha('provider_timeout', true);
  if (status === 429) return falha('provider_rate_limited', true);
  if (status >= 500) return falha('provider_unavailable', true);
  if (status === 401 || status === 403) return falha('provider_auth_rejected', false);
  if (status === 409) return classificarConflito(response.body);
  if (status >= 400 && status < 500) return falha('provider_request_rejected', false);
  return falha('provider_response_invalid', true);
}

function classificarConflito(body) {
  // A Resend diferencia conflitos terminais e transitórios pelo campo `name`.
  // Somente discriminadores conhecidos são lidos; mensagem e body bruto nunca
  // atravessam a fronteira pública do adapter.
  const name = body && typeof body.name === 'string' ? body.name : '';
  if (name === 'invalid_idempotent_request') {
    return falha('provider_idempotency_conflict', false);
  }
  if (name === 'concurrent_idempotent_requests') {
    return falha('provider_idempotency_in_progress', true);
  }
  if (name === 'resource_locked') {
    return falha('provider_resource_locked', true);
  }
  return falha('provider_conflict_unknown', true);
}

function idSeguroOuVazio(valor, limite) {
  const id = texto(valor);
  return id && id.length <= limite && /^[a-zA-Z0-9._:-]+$/.test(id) ? id : '';
}

function erroDeTimeout(erro) {
  return erro?.name === 'AbortError' || erro?.code === 'ETIMEDOUT' || erro?.code === 'TIMEOUT';
}

/**
 * Cria um adapter incapaz de escolher o próprio transporte.
 * O retorno nunca expõe destinatário, headers, body, erro bruto ou segredo.
 */
export function criarResendTransactionalAdapter(config = {}) {
  const trusted = validarConfiguracao(config);

  async function entregar(delivery = {}) {
    const command = validarEntrega(delivery);
    const request = Object.freeze({
      endpoint: RESEND_EMAILS_ENDPOINT,
      method: 'POST',
      headers: Object.freeze({
        Authorization: `Bearer ${trusted.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': command.idempotencyKey,
      }),
      body: JSON.stringify({
        from: trusted.from,
        to: [command.recipient],
        subject: command.subject,
        html: command.html,
        text: command.text,
        reply_to: trusted.replyTo,
      }),
    });

    try {
      return classificarResposta(await trusted.transport(request));
    } catch (erro) {
      return erroDeTimeout(erro)
        ? falha('transport_timeout', true)
        : falha('transport_error', true);
    }
  }

  return Object.freeze({
    version: RESEND_TRANSACTIONAL_ADAPTER_VERSION,
    entregar,
  });
}
