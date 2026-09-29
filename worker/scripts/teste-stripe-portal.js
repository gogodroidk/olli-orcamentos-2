import assert from 'node:assert/strict';
import { handlePortal, handleStripeStatus } from '../src/stripe.js';

const chamadas = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  chamadas.push({ url, method: init.method || 'GET' });
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1', email: 'cliente@example.com' }), { status: 200 });
  if (url.includes('/rest/v1/assinaturas?user_id=')) return new Response(JSON.stringify([{
    user_id: 'user-1', plano: 'pro', status: 'active', stripe_customer_id: null,
    stripe_subscription_id: 'sub_1', current_period_end: '2026-10-01T00:00:00.000Z',
  }]), { status: 200 });
  if (url.endsWith('/subscriptions/sub_1')) return new Response(JSON.stringify({ id: 'sub_1', customer: 'cus_1' }), { status: 200 });
  if (url.includes('/rest/v1/assinaturas?on_conflict=user_id')) return new Response('', { status: 201 });
  if (url.endsWith('/billing_portal/sessions')) return new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session-test' }), { status: 200 });
  throw new Error(`fetch inesperado: ${url}`);
};

try {
  const resposta = await handlePortal(
    {
      method: 'POST',
      headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer token-test' : null },
    },
    {
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_RL: { limit: async () => ({ success: true }) },
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    },
  );
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { ok: true, url: 'https://billing.stripe.com/p/session-test' });
  assert.ok(chamadas.some(({ url }) => url.endsWith('/subscriptions/sub_1')), 'deve recuperar o customer pela subscription');
  assert.ok(chamadas.some(({ url }) => url.endsWith('/billing_portal/sessions')), 'deve abrir o portal após recuperar o customer');

  chamadas.length = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    chamadas.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    if (url.includes('/rest/v1/assinaturas?user_id=')) return new Response(JSON.stringify([{
      user_id: 'user-1', plano: 'empresa', status: 'active', stripe_customer_id: 'comp_manual',
      stripe_subscription_id: null, current_period_end: '2099-12-31T00:00:00.000Z',
    }]), { status: 200 });
    throw new Error(`placeholder administrativo não pode chegar à Stripe: ${url}`);
  };
  const administrativo = await handlePortal(
    { method: 'POST', headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer token-test' : null } },
    {
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_RL: { limit: async () => ({ success: true }) },
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    },
  );
  assert.equal(administrativo.status, 409);
  assert.deepEqual(await administrativo.json(), { ok: false, erro: 'assinatura_nao_stripe' });
  assert.equal(chamadas.some(({ url }) => url.includes('api.stripe.com')), false, 'placeholder não pode chamar a API Stripe');
  const statusAdministrativo = await handleStripeStatus(
    { method: 'GET', headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer token-test' : null } },
    {
      STRIPE_RL: { limit: async () => ({ success: true }) },
      SUPABASE_URL: 'https://supabase.example.test',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    },
  );
  assert.deepEqual(await statusAdministrativo.json(), { ok: true, gerenciavel: false, origem: 'administrativa' });
  console.log('PASSOU: portal Stripe recupera customer legado e recusa concessão administrativa.');
} finally {
  globalThis.fetch = originalFetch;
}
