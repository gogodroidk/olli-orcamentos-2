/**
 * Contratos puros para medir o experimento de conversão do OLLI Orçamentos.
 *
 * Este módulo não envia eventos, não lê PII, não consulta provider, não grava
 * banco e não concede plano. A camada futura deve persistir os objetos com
 * idempotencyKey e resolver o tenant a partir do contexto autenticado.
 */

export const MONETIZATION_EVENT_VERSION = '2026-09-01.v1';
export const MONETIZATION_TRIAL_DAYS = 14;

export const MONETIZATION_EVENT_TYPES = Object.freeze([
  'signup.completed',
  'quote.created',
  'pdf.shared',
  'pro.preview.viewed',
  'pro.cta.clicked',
  'trial.eligible',
  'trial.started',
  'trial.ended',
  'payment.checkout_started',
  'payment.approved',
  'payment.cancelled',
  'subscription.renewed',
]);

export const MONETIZATION_VARIANTS = Object.freeze(['control', 'contextual_trial']);
export const TRIAL_STATES = Object.freeze(['unstarted', 'eligible', 'active', 'ended', 'converted', 'revoked']);
export const TRIAL_TRIGGERS = Object.freeze(['first_pdf', 'third_quote', 'pro_attempt', 'ai_limit', 'radar_return']);

const CHANNELS = Object.freeze(['facebook', 'whatsapp', 'organic', 'other']);
const DELIVERY = Object.freeze(['pdf', 'link', 'whatsapp']);
const FEATURES = Object.freeze(['brand', 'template', 'ai', 'radar', 'reports', 'goals']);
const PROVIDERS = Object.freeze(['stripe', 'mercado_pago', 'unknown']);
const PLANS = Object.freeze(['pro_monthly', 'pro_annual', 'pro_12x', 'empresa_monthly', 'empresa_annual']);

const METADATA_RULES = Object.freeze({
  'signup.completed': Object.freeze({ channel: 'channel' }),
  'quote.created': Object.freeze({ count: 'positiveInteger' }),
  'pdf.shared': Object.freeze({ delivery: 'delivery' }),
  'pro.preview.viewed': Object.freeze({ feature: 'feature' }),
  'pro.cta.clicked': Object.freeze({ feature: 'feature' }),
  'trial.eligible': Object.freeze({ trigger: 'trigger' }),
  'trial.started': Object.freeze({ trialId: 'id' }),
  'trial.ended': Object.freeze({ trialId: 'id', converted: 'boolean' }),
  'payment.checkout_started': Object.freeze({ provider: 'provider', plan: 'plan' }),
  'payment.approved': Object.freeze({ provider: 'provider', plan: 'plan' }),
  'payment.cancelled': Object.freeze({ provider: 'provider', plan: 'plan' }),
  'subscription.renewed': Object.freeze({ provider: 'provider', plan: 'plan', cycle: 'positiveInteger' }),
});

function texto(v, limite) {
  return typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').trim().slice(0, limite) : '';
}

function metadataCodigo(chave) {
  return 'metadata_' + chave + '_invalida';
}

function idSeguro(v, limite, codigo) {
  const id = texto(v, limite);
  if (!id || !/^[a-zA-Z0-9._:-]+$/.test(id)) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
  return id;
}

function isoSeguro(v, codigo) {
  const data = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(data.getTime())) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
  return data.toISOString();
}

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function valorMetadata(valor, regra, chave) {
  if (regra === 'id') return idSeguro(valor, 160, metadataCodigo(chave));
  if (regra === 'boolean') {
    exigir(typeof valor === 'boolean', metadataCodigo(chave));
    return valor;
  }
  if (regra === 'positiveInteger') {
    exigir(Number.isInteger(valor) && valor > 0, metadataCodigo(chave));
    return valor;
  }
  if (regra === 'channel') {
    exigir(CHANNELS.includes(valor), metadataCodigo(chave));
    return valor;
  }
  if (regra === 'delivery') {
    exigir(DELIVERY.includes(valor), metadataCodigo(chave));
    return valor;
  }
  if (regra === 'feature') {
    exigir(FEATURES.includes(valor), metadataCodigo(chave));
    return valor;
  }
  if (regra === 'provider') {
    exigir(PROVIDERS.includes(valor), metadataCodigo(chave));
    return valor;
  }
  if (regra === 'plan') {
    exigir(PLANS.includes(valor), metadataCodigo(chave));
    return valor;
  }
  if (regra === 'trigger') {
    exigir(TRIAL_TRIGGERS.includes(valor), metadataCodigo(chave));
    return valor;
  }
  const erro = new Error('regra_metadata_desconhecida');
  erro.codigo = erro.message;
  throw erro;
}

function normalizarMetadata(type, metadata = {}) {
  exigir(metadata && typeof metadata === 'object' && !Array.isArray(metadata), 'metadata_invalida');
  const regras = METADATA_RULES[type] || {};
  const chaves = Object.keys(metadata);
  exigir(chaves.every((chave) => Object.prototype.hasOwnProperty.call(regras, chave)), 'metadata_nao_permitida');
  const resultado = {};
  for (const chave of chaves) {
    resultado[chave] = valorMetadata(metadata[chave], regras[chave], chave);
  }
  return Object.freeze(resultado);
}

/**
 * Cria um evento sem PII. actorKey deve ser uma chave pseudonimizada pela
 * camada chamadora; e-mail, nome, telefone, texto de orçamento e HTML não são
 * aceitos como campos deste contrato.
 */
export function criarEventoMonetizacao({
  type,
  tenantId,
  actorKey,
  occurredAt,
  dedupeKey,
  variant = 'control',
  metadata = {},
} = {}) {
  exigir(MONETIZATION_EVENT_TYPES.includes(type), 'tipo_evento_invalido');
  exigir(MONETIZATION_VARIANTS.includes(variant), 'variante_invalida');
  const tenant = idSeguro(tenantId, 120, 'tenant_obrigatorio');
  const actor = idSeguro(actorKey, 160, 'actor_key_obrigatorio');
  const dedupe = idSeguro(dedupeKey, 160, 'dedupe_key_obrigatoria');
  const when = isoSeguro(occurredAt, 'occurred_at_invalido');
  const eventId = 'monetization:' + tenant + ':' + type + ':' + dedupe;
  return Object.freeze({
    version: MONETIZATION_EVENT_VERSION,
    eventId,
    idempotencyKey: eventId,
    type,
    tenantId: tenant,
    actorKey: actor,
    variant,
    occurredAt: when,
    metadata: normalizarMetadata(type, metadata),
  });
}

function clonarEstado(estado) {
  return Object.freeze({ ...estado });
}

export function criarEstadoTrial({ tenantId } = {}) {
  const tenant = idSeguro(tenantId, 120, 'tenant_obrigatorio');
  return clonarEstado({
    version: MONETIZATION_EVENT_VERSION,
    tenantId: tenant,
    state: 'unstarted',
    trialId: null,
    trigger: null,
    eligibleAt: null,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    convertedAt: null,
  });
}

function exigirTenant(estado, tenantId) {
  exigir(estado && typeof estado === 'object', 'estado_trial_invalido');
  exigir(TRIAL_STATES.includes(estado.state), 'estado_trial_invalido');
  const tenant = idSeguro(tenantId, 120, 'tenant_obrigatorio');
  exigir(estado.tenantId === tenant, 'tenant_trial_divergente');
}

/**
 * Um tenant só pode ganhar uma elegibilidade. O chamador persiste o retorno
 * junto do evento; esta função não muta o objeto recebido.
 */
export function tornarTrialElegivel(estado, { tenantId, trigger, occurredAt } = {}) {
  exigirTenant(estado, tenantId);
  exigir(TRIAL_TRIGGERS.includes(trigger), 'gatilho_trial_invalido');
  const when = isoSeguro(occurredAt, 'eligible_at_invalido');
  if (estado.state !== 'unstarted') {
    return Object.freeze({ eligible: false, reason: 'trial_ja_consumido', state: estado });
  }
  const next = clonarEstado({ ...estado, state: 'eligible', trigger, eligibleAt: when });
  return Object.freeze({ eligible: true, reason: 'marco_de_valor', state: next });
}

function adicionarDias(iso, dias) {
  const data = new Date(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString();
}

export function iniciarTrial(estado, { tenantId, trialId, startedAt } = {}) {
  exigirTenant(estado, tenantId);
  const id = idSeguro(trialId, 160, 'trial_id_obrigatorio');
  const when = isoSeguro(startedAt, 'started_at_invalido');
  if (estado.state === 'active' && estado.trialId === id) {
    return Object.freeze({ started: false, replayed: true, state: estado });
  }
  exigir(estado.state === 'eligible', 'trial_nao_elegivel');
  const next = clonarEstado({
    ...estado,
    state: 'active',
    trialId: id,
    startedAt: when,
    endsAt: adicionarDias(when, MONETIZATION_TRIAL_DAYS),
  });
  return Object.freeze({ started: true, replayed: false, state: next });
}

export function encerrarTrial(estado, { tenantId, endedAt, converted = false } = {}) {
  exigirTenant(estado, tenantId);
  const when = isoSeguro(endedAt, 'ended_at_invalido');
  if (estado.state === 'ended' || estado.state === 'converted') {
    return Object.freeze({ ended: false, replayed: true, state: estado });
  }
  exigir(estado.state === 'active', 'trial_nao_ativo');
  const next = clonarEstado({
    ...estado,
    state: converted ? 'converted' : 'ended',
    endedAt: when,
    convertedAt: converted ? when : null,
  });
  return Object.freeze({ ended: true, replayed: false, state: next });
}

export function trialAtivo(estado, agora = new Date().toISOString()) {
  exigir(estado && estado.state === 'active', 'trial_nao_ativo');
  const now = new Date(isoSeguro(agora, 'agora_invalido')).getTime();
  const ends = new Date(isoSeguro(estado.endsAt, 'ends_at_invalido')).getTime();
  return now < ends;
}
