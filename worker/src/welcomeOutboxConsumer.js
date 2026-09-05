import { EMAIL_OUTBOX_VERSION } from './emailOutbox.js';
import { renderizarEmailBoasVindas } from './welcomeEmailTemplate.js';
import { criarResendTransactionalAdapter } from './resendTransactionalAdapter.js';
import { aplicarResultadoResendNaOutbox } from './resendOutboxOutcomeContract.js';

export const WELCOME_OUTBOX_CONSUMER_VERSION = '2026-09-04.v1';

const SIMULATOR_RECIPIENT = 'delivered@resend.dev';
const MAX_RESPONSE_BYTES = 32 * 1024;
const DEFAULT_LEASE_SECONDS = 120;

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function idSeguro(valor, limite, codigo) {
  const id = texto(valor, limite);
  exigir(id.length > 0 && /^[a-zA-Z0-9._:-]+$/.test(id), codigo);
  return id;
}

function emailSeguro(valor, codigo) {
  const email = texto(valor, 254).toLowerCase();
  exigir(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), codigo);
  return email;
}

function isoSeguro(valor, codigo) {
  const data = new Date(valor);
  exigir(!Number.isNaN(data.getTime()), codigo);
  return data.toISOString();
}

function modoDispatch(env) {
  const modo = texto(env?.WELCOME_DISPATCH_MODE, 20).toLowerCase();
  return modo === 'simulator' || modo === 'production' ? modo : 'off';
}

function inteiroLimitado(valor, fallback, min, max) {
  const parsed = Number.parseInt(String(valor ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function sinalTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function lerJsonLimitado(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('resposta_grande'), { codigo: 'resposta_grande' });
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function validarConfig(env) {
  const supabaseUrl = texto(env?.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  const resendApiKey = texto(env?.RESEND_API_KEY, 512);
  const from = texto(env?.WELCOME_FROM || env?.RESEND_FROM, 320);
  const replyTo = texto(env?.WELCOME_REPLY_TO, 320);
  const appUrl = texto(env?.WELCOME_APP_URL, 2048);
  const supportUrl = texto(env?.WELCOME_SUPPORT_URL, 2048);
  const logoUrl = texto(env?.WELCOME_LOGO_URL, 2048);

  exigir(/^https:\/\/[^/]+/.test(supabaseUrl), 'supabase_url_invalida');
  exigir(serviceRoleKey.length >= 20, 'supabase_service_role_ausente');
  exigir(resendApiKey.length >= 8, 'resend_api_key_ausente');
  exigir(from && replyTo && appUrl && supportUrl && logoUrl, 'welcome_config_incompleta');
  return Object.freeze({
    supabaseUrl,
    serviceRoleKey,
    resendApiKey,
    from,
    replyTo,
    appUrl,
    supportUrl,
    logoUrl,
  });
}

async function chamarRpc(config, fetchImpl, nome, body) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: sinalTimeout(10_000),
  });
  const payload = await lerJsonLimitado(response);
  if (!response.ok) {
    throw Object.assign(new Error(`supabase_rpc_${response.status}`), {
      codigo: `supabase_rpc_${response.status}`,
    });
  }
  return payload;
}

function mapearClaim(row) {
  exigir(row && typeof row === 'object' && !Array.isArray(row), 'claim_invalido');
  const eventId = idSeguro(row.event_id, 160, 'claim_event_id_invalido');
  const idempotencyKey = idSeguro(row.idempotency_key, 240, 'claim_idempotency_invalida');
  const claimToken = idSeguro(row.claim_token, 64, 'claim_token_invalido');
  const recipient = emailSeguro(row.recipient, 'claim_recipient_invalido');
  const attempts = row.attempts;
  exigir(Number.isInteger(attempts) && attempts >= 1 && attempts <= 5, 'claim_attempts_invalido');
  exigir(row.status === 'sending', 'claim_status_invalido');
  exigir(row.provider_id === null && row.error_code === null, 'claim_resultado_invalido');

  return Object.freeze({
    claimToken,
    dispatchScope: row.dispatch_scope,
    claimedItem: Object.freeze({
      version: EMAIL_OUTBOX_VERSION,
      eventId,
      idempotencyKey,
      template: idSeguro(row.template, 80, 'claim_template_invalido'),
      templateVersion: idSeguro(row.template_version, 80, 'claim_template_version_invalida'),
      purpose: idSeguro(row.purpose, 100, 'claim_purpose_invalido'),
      recipient,
      attempts,
      status: 'sending',
      nextAttemptAt: isoSeguro(row.next_attempt_at, 'claim_next_attempt_invalido'),
      providerId: null,
      errorCode: null,
      createdAt: isoSeguro(row.created_at, 'claim_created_at_invalido'),
      updatedAt: isoSeguro(row.updated_at, 'claim_updated_at_invalido'),
    }),
  });
}

function mensagemDoTemplate(item, config) {
  const render = renderizarEmailBoasVindas({
    eventId: item.eventId,
    template: item.template,
    templateVersion: item.templateVersion,
    purpose: item.purpose,
    appUrl: config.appUrl,
    supportUrl: config.supportUrl,
    logoUrl: config.logoUrl,
  });
  return Object.freeze({
    eventId: render.eventId,
    template: render.template,
    templateVersion: render.templateVersion,
    purpose: render.purpose,
    kind: render.kind,
    subject: render.subject,
    html: render.html,
    text: render.text,
  });
}

async function liquidar(config, fetchImpl, claim, outcome, agora) {
  const payload = await chamarRpc(config, fetchImpl, 'settle_email_welcome_outbox', {
    p_idempotency_key: claim.claimedItem.idempotencyKey,
    p_claim_token: claim.claimToken,
    p_attempts: claim.claimedItem.attempts,
    p_status: outcome.status,
    p_provider_id: outcome.providerId,
    p_error_code: outcome.errorCode,
    p_now: agora,
  });
  exigir(Array.isArray(payload) && payload.length === 1 && payload[0]?.applied === true, 'settle_resposta_invalida');
}

async function liquidarFalhaInterna(config, fetchImpl, claim, codigo, agora) {
  await chamarRpc(config, fetchImpl, 'settle_email_welcome_outbox', {
    p_idempotency_key: claim.claimedItem.idempotencyKey,
    p_claim_token: claim.claimToken,
    p_attempts: claim.claimedItem.attempts,
    p_status: 'dead_letter',
    p_provider_id: null,
    p_error_code: idSeguro(codigo, 120, 'erro_interno_invalido'),
    p_now: agora,
  });
}

function criarTransporte(fetchImpl) {
  return async (request) => {
    const response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: sinalTimeout(10_000),
    });
    const body = await lerJsonLimitado(response);
    return Object.freeze({
      status: response.status,
      body: body && typeof body === 'object' && !Array.isArray(body) ? body : null,
    });
  };
}

/**
 * Processa uma rodada agendada. O modo simulator é uma barreira dupla:
 * o banco filtra dispatch_scope e o runtime aceita somente delivered@resend.dev.
 */
export async function processarWelcomeOutbox(env, dependencias = {}) {
  const mode = modoDispatch(env);
  if (mode === 'off') {
    return Object.freeze({ version: WELCOME_OUTBOX_CONSUMER_VERSION, mode, claimed: 0, sent: 0, failed: 0 });
  }

  const fetchImpl = dependencias.fetchImpl || fetch;
  const randomUUID = dependencias.randomUUID || (() => crypto.randomUUID());
  const now = dependencias.now || (() => new Date());
  exigir(typeof fetchImpl === 'function' && typeof randomUUID === 'function' && typeof now === 'function', 'dependencias_invalidas');

  const config = validarConfig(env);
  const batchLimit = mode === 'simulator'
    ? 1
    : inteiroLimitado(env?.WELCOME_BATCH_LIMIT, 2, 1, 10);
  const workerId = `welcome:${Date.now()}:${idSeguro(randomUUID(), 64, 'worker_uuid_invalido')}`;
  const claimNow = now().toISOString();
  const rows = await chamarRpc(config, fetchImpl, 'claim_email_welcome_outbox', {
    p_worker_id: workerId,
    p_dispatch_scope: mode,
    p_limit: batchLimit,
    p_lease_seconds: DEFAULT_LEASE_SECONDS,
    p_now: claimNow,
  });
  exigir(Array.isArray(rows), 'claim_resposta_invalida');

  const adapter = criarResendTransactionalAdapter({
    apiKey: config.resendApiKey,
    from: config.from,
    replyTo: config.replyTo,
    transport: criarTransporte(fetchImpl),
  });
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    let claim;
    let providerInvoked = false;
    try {
      claim = mapearClaim(row);
      exigir(claim.dispatchScope === mode, 'claim_scope_divergente');
      if (mode === 'simulator') {
        exigir(claim.claimedItem.recipient === SIMULATOR_RECIPIENT, 'simulator_recipient_rejected');
      }
      const message = mensagemDoTemplate(claim.claimedItem, config);
      providerInvoked = true;
      const result = await adapter.entregar({ claimedItem: claim.claimedItem, message });
      const settledAt = now().toISOString();
      const outcome = aplicarResultadoResendNaOutbox({
        claimedItem: claim.claimedItem,
        result,
        agora: settledAt,
      });
      await liquidar(config, fetchImpl, claim, outcome, settledAt);
      if (outcome.status === 'sent') sent += 1;
      else failed += 1;
    } catch (erro) {
      failed += 1;
      const detalhe = texto(erro?.codigo || erro?.message, 120).replace(/[^a-zA-Z0-9._:-]/g, '_') || 'consumer_error';
      const codigo = detalhe === 'simulator_recipient_rejected'
        ? 'simulator_recipient_rejected'
        : 'consumer_contract_error';
      if (claim && !providerInvoked) {
        try {
          await liquidarFalhaInterna(config, fetchImpl, claim, codigo, now().toISOString());
        } catch {
          // O lease preserva recuperação; não registrar destinatário, token ou body.
        }
      }
      console.error(JSON.stringify({ event: 'welcome_dispatch_failed', code: codigo, detail: detalhe, mode }));
    }
  }

  const summary = Object.freeze({
    version: WELCOME_OUTBOX_CONSUMER_VERSION,
    mode,
    claimed: rows.length,
    sent,
    failed,
  });
  if (rows.length > 0 || summary.failed > 0) {
    console.log(JSON.stringify({ event: 'welcome_dispatch_completed', ...summary }));
  }
  return summary;
}
