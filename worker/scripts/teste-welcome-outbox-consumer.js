import assert from 'node:assert/strict';
import { processarWelcomeOutbox } from '../src/welcomeOutboxConsumer.js';

const NOW = '2026-09-04T21:30:00.000Z';
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  RESEND_API_KEY: 'resend-key-test-only',
  WELCOME_DISPATCH_MODE: 'simulator',
  WELCOME_BATCH_LIMIT: '1',
  WELCOME_FROM: 'OLLI Orçamentos <nao-responda@olliorcamentos.online>',
  WELCOME_REPLY_TO: 'contato@olliorcamentos.online',
  WELCOME_APP_URL: 'https://app.olliorcamentos.online',
  WELCOME_SUPPORT_URL: 'https://olliorcamentos.online/ajuda/',
  WELCOME_LOGO_URL: 'https://olliorcamentos.online/icon-192.png',
});

function claim(recipient = 'delivered@resend.dev') {
  return {
    event_id: 'auth.email_confirmed:00000000-0000-4000-8000-000000000041:1',
    idempotency_key: 'auth.email_confirmed:00000000-0000-4000-8000-000000000041:1',
    template: 'boas_vindas',
    template_version: 'boas_vindas.v1',
    purpose: 'account_onboarding',
    recipient,
    attempts: 1,
    status: 'sending',
    next_attempt_at: NOW,
    provider_id: null,
    error_code: null,
    created_at: NOW,
    updated_at: NOW,
    claim_token: '00000000-0000-4000-8000-000000000099',
    lease_expires_at: '2026-09-04T21:32:00.000Z',
    dispatch_scope: 'simulator',
  };
}

function deps(fetchImpl) {
  return {
    fetchImpl,
    randomUUID: () => '00000000-0000-4000-8000-000000000077',
    now: () => new Date(NOW),
  };
}

async function casoDesligado() {
  let calls = 0;
  const result = await processarWelcomeOutbox(
    { WELCOME_DISPATCH_MODE: 'off' },
    deps(async () => { calls += 1; throw new Error('rede_nao_deveria_ser_chamada'); }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(result, {
    version: '2026-09-04.v1', mode: 'off', claimed: 0, sent: 0, failed: 0,
  });
}

async function casoSucesso() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_dispatch_scope, 'simulator');
      assert.equal(body.p_limit, 1);
      assert.equal(body.p_lease_seconds, 120);
      return Response.json([claim()]);
    }
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.to, ['delivered@resend.dev']);
      assert.equal(body.reply_to, 'contato@olliorcamentos.online');
      assert.equal(init.headers['Idempotency-Key'], claim().idempotency_key);
      assert.match(body.html, /OLLI Orçamentos/);
      assert.match(body.text, /Sua conta está pronta/);
      return Response.json({ id: 'email_test_1' }, { status: 200 });
    }
    if (url.endsWith('/rpc/settle_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_attempts, 1);
      assert.equal(body.p_status, 'sent');
      assert.equal(body.p_provider_id, 'email_test_1');
      assert.equal(body.p_error_code, null);
      assert.equal(Object.hasOwn(body, 'p_next_attempt_at'), false);
      return Response.json([{ applied: true, status: 'sent', attempts: 1 }]);
    }
    throw new Error('url_inesperada');
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 3);
  assert.deepEqual(result, {
    version: '2026-09-04.v1', mode: 'simulator', claimed: 1, sent: 1, failed: 0,
  });
}

async function casoDestinatarioBloqueado() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      return Response.json([claim('pessoa@example.com')]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'));
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'dead_letter');
    assert.equal(body.p_error_code, 'simulator_recipient_rejected');
    assert.equal(body.p_attempts, 1);
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 2);
  assert.equal(calls.some((item) => item.url === 'https://api.resend.com/emails'), false);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
}

async function casoRetry() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) return Response.json([claim()]);
    if (url === 'https://api.resend.com/emails') {
      return Response.json({ name: 'rate_limit_exceeded' }, { status: 429 });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'failed');
    assert.equal(body.p_error_code, 'provider_rate_limited');
    assert.equal(Object.hasOwn(body, 'p_next_attempt_at'), false);
    return Response.json([{ applied: true, status: 'failed', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
}

const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};
try {
  await casoDesligado();
  await casoSucesso();
  await casoDestinatarioBloqueado();
  await casoRetry();
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log('PASSOU: consumer welcome — off, sucesso, bloqueio de destinatário e retry');
