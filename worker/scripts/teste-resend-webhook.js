import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  RESEND_WEBHOOK_CLOCK_SKEW_SECONDS,
  handleResendWebhook,
  motivoSupressaoResend,
  normalizarEventoResend,
  verificarAssinaturaResend,
} from '../src/resendWebhook.js';

const SECRET_BYTES = Buffer.from('resend-webhook-secret-test-only');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const NOW_MS = Date.now();
const NOW_SECONDS = Math.floor(NOW_MS / 1000);

function headersFor(rawBody, id = 'msg_olli_01', timestamp = String(NOW_SECONDS)) {
  const signed = `${id}.${timestamp}.${rawBody}`;
  const signature = createHmac('sha256', SECRET_BYTES).update(signed).digest('base64');
  return new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  });
}

const event = {
  type: 'email.delivered',
  created_at: '2026-09-05T16:00:00.000Z',
  data: {
    email_id: 're_olli_01',
    to: ['cliente@example.com'],
    from: 'nao-responda@olliorcamentos.online',
    subject: 'teste',
    tags: { tenant_id: 'tenant-01', template: 'welcome', campanha: 'nao-auditar' },
  },
};

const rawBody = JSON.stringify(event);
const headers = headersFor(rawBody);
assert.equal(
  await verificarAssinaturaResend(rawBody, headers, SECRET, { nowMs: NOW_MS }),
  true,
);
assert.equal(
  await verificarAssinaturaResend(rawBody, headers, SECRET, {
    nowMs: NOW_MS + (RESEND_WEBHOOK_CLOCK_SKEW_SECONDS + 1) * 1000,
  }),
  false,
);
assert.equal(
  await verificarAssinaturaResend(rawBody, headers, 'whsec_invalid', { nowMs: NOW_MS }),
  false,
);

const normalized = normalizarEventoResend(event, 'msg_olli_01');
assert.equal(normalized.type, 'email.delivered');
assert.equal(normalized.status, 'delivered');
assert.equal(normalized.emailId, 're_olli_01');
assert.deepEqual(normalized.tagKeys, ['tenant_id', 'template']);
assert.equal(Object.hasOwn(normalized, 'recipient'), false);

const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/webhook_events')) return new Response(null, { status: 201 });
  if (String(url).includes('/webhook_events?') && init.method === 'PATCH') return new Response(null, { status: 204 });
  throw new Error(`url_inesperada:${url}`);
};

try {
  const response = await handleResendWebhook(
    new Request('https://diagnostico.olliorcamentos.online/resend/webhook', {
      method: 'POST',
      headers,
      body: rawBody,
    }),
    {
      RESEND_WEBHOOK_SECRET: SECRET,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-only',
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, tipo: 'email.delivered' });
  assert.equal(calls.length, 2);
  const stored = JSON.parse(calls[0].init.body);
  assert.equal(stored.origem, 'resend');
  assert.equal(stored.payload.emailId, 're_olli_01');
  assert.equal(Object.hasOwn(stored.payload, 'recipient'), false);
} finally {
  globalThis.fetch = originalFetch;
}

const invalidResponse = await handleResendWebhook(
  new Request('https://diagnostico.olliorcamentos.online/resend/webhook', {
    method: 'POST',
    headers: new Headers({
      'svix-id': 'msg_olli_02',
      'svix-timestamp': String(NOW_SECONDS),
      'svix-signature': 'v1,invalid',
    }),
    body: rawBody,
  }),
  { RESEND_WEBHOOK_SECRET: SECRET },
);
assert.equal(invalidResponse.status, 400);

// ─── Supressão: bounce permanente, reclamação e suprimido tiram a conta da lista ───
assert.equal(motivoSupressaoResend({ type: 'email.bounced', data: { bounce: { type: 'Permanent' } } }), 'hard_bounce');
assert.equal(motivoSupressaoResend({ type: 'email.bounced', data: { bounce: { type: 'Transient' } } }), null);
assert.equal(motivoSupressaoResend({ type: 'email.bounced', data: {} }), null);
assert.equal(motivoSupressaoResend({ type: 'email.complained', data: {} }), 'complaint');
assert.equal(motivoSupressaoResend({ type: 'email.suppressed', data: {} }), 'hard_bounce');
assert.equal(motivoSupressaoResend({ type: 'email.delivered', data: {} }), null);

async function webhookCom(evento, id, rpcStatus = 200) {
  const raw = JSON.stringify(evento);
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    chamadas.push({ url: String(url), init });
    if (String(url).endsWith('/rpc/registrar_supressao_email_por_provider')) {
      return Response.json({ registrado: true, cancelados: 0 }, { status: rpcStatus });
    }
    if (String(url).endsWith('/webhook_events')) return new Response(null, { status: 201 });
    if (String(url).includes('/webhook_events?') && init.method === 'PATCH') return new Response(null, { status: 204 });
    throw new Error(`url_inesperada:${url}`);
  };
  const anterior = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const r = await handleResendWebhook(
      new Request('https://diagnostico.olliorcamentos.online/resend/webhook', { method: 'POST', headers: headersFor(raw, id), body: raw }),
      { RESEND_WEBHOOK_SECRET: SECRET, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-only' },
      { fetchImpl },
    );
    return { status: r.status, chamadas };
  } finally {
    globalThis.fetch = anterior;
  }
}

{
  const bounce = { type: 'email.bounced', created_at: event.created_at, data: { email_id: 're_olli_09', to: ['x@example.com'], bounce: { type: 'Permanent' } } };
  const r = await webhookCom(bounce, 'msg_olli_09');
  assert.equal(r.status, 200);
  const rpc = r.chamadas.find((c) => c.url.endsWith('/rpc/registrar_supressao_email_por_provider'));
  assert.deepEqual(JSON.parse(rpc.init.body), { p_provider_id: 're_olli_09', p_motivo: 'hard_bounce' });
  assert.equal(rpc.init.body.includes('x@example.com'), false);
}
{
  const temporario = { type: 'email.bounced', created_at: event.created_at, data: { email_id: 're_olli_10', bounce: { type: 'Transient' } } };
  const r = await webhookCom(temporario, 'msg_olli_10');
  assert.equal(r.status, 200);
  assert.equal(r.chamadas.some((c) => c.url.includes('/rpc/')), false);
}
{
  const reclamacao = { type: 'email.complained', created_at: event.created_at, data: { email_id: 're_olli_11' } };
  const r = await webhookCom(reclamacao, 'msg_olli_11', 500);
  // Supressão falhou: 500 para a Resend reenviar, e o evento NÃO fica processado.
  assert.equal(r.status, 500);
  const patch = r.chamadas.find((c) => c.init.method === 'PATCH');
  assert.equal(JSON.parse(patch.init.body).status, 'falhou');
}

console.log('PASSOU: webhook Resend — Svix, replay, idempotência, remoção de PII e supressão por bounce/reclamação');
