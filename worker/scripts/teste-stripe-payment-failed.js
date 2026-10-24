// invoice.payment_failed: se a Stripe não devolve a subscription, o webhook NÃO pode
// responder 200 nem marcar 'processado' (erro nunca vira vazio) — senão a Stripe não reenvia.
import assert from 'node:assert/strict';
import { handleWebhook } from '../src/stripe.js';

const SECRET = 'whsec_teste';
const env = {
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_SECRET_KEY: 'sk_teste',
  SUPABASE_URL: 'https://sb.example',
  SUPABASE_SERVICE_ROLE_KEY: 'srv',
};

async function assinar(corpo) {
  const t = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${corpo}`)));
  return `t=${t},v1=${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function dispara(stripeStatus) {
  const corpo = JSON.stringify({
    id: 'evt_pf_1',
    type: 'invoice.payment_failed',
    data: { object: { subscription: 'sub_1' } },
  });
  const sig = await assinar(corpo);
  const marcas = [];
  let sbGravou = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.stripe.com')) {
      return new Response(JSON.stringify(stripeStatus === 200
        ? { id: 'sub_1', status: 'past_due', metadata: { user_id: 'u1' } }
        : { error: { message: 'boom' } }), { status: stripeStatus });
    }
    if (u.includes('/webhook_events') && init.method === 'POST') return new Response('[]', { status: 201 });
    if (u.includes('/webhook_events') && init.method === 'PATCH') {
      marcas.push(JSON.parse(init.body).status);
      return new Response(null, { status: 204 });
    }
    sbGravou = true;
    return new Response('[]', { status: 200 });
  };
  const req = new Request('https://x.example/stripe/webhook', {
    method: 'POST', body: corpo, headers: { 'Stripe-Signature': sig },
  });
  const res = await handleWebhook(req, env);
  return { status: res.status, marcas, sbGravou };
}

const falha = await dispara(500);
assert.equal(falha.status, 502, 'Stripe fora => 502 para a Stripe reenviar');
assert.ok(!falha.marcas.includes('processado'), 'não marca processado quando não sincronizou');

const ok = await dispara(200);
assert.equal(ok.status, 200);
assert.ok(ok.marcas.includes('processado'));

console.log('PASSOU: invoice.payment_failed — falha da Stripe vira 502 (não 200), sucesso segue 200');
