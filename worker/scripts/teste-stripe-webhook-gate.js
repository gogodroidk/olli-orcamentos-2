import assert from 'node:assert/strict';
import { handleStripe } from '../src/stripe.js';

function streamRequest(state) {
  return {
    method: 'POST',
    headers: { get: (name) => name.toLowerCase() === 'cf-connecting-ip' ? '198.51.100.10' : null },
    body: { getReader() { state.reads += 1; throw new Error('body should not be read'); } },
  };
}

const url = new URL('https://staging.example/stripe/webhook');
const state = { reads: 0, keys: [] };
const envNegado = {
  STRIPE_RL: { limit: async ({ key }) => { state.keys.push(key); return { success: false }; } },
};
const negado = await handleStripe(streamRequest(state), envNegado, url);
assert.equal(negado.status, 429);
assert.deepEqual(await negado.json(), { erro: 'muitas_requisicoes' });
assert.equal(state.reads, 0, 'o corpo não pode ser lido antes do limite');
assert.deepEqual(state.keys, ['webhook:198.51.100.10']);

const estadoErro = { reads: 0 };
const limiterErro = await handleStripe(
  streamRequest(estadoErro),
  { STRIPE_RL: { limit: async () => { throw new Error('limiter indisponível'); } } },
  url,
);
assert.equal(limiterErro.status, 429);
assert.equal(estadoErro.reads, 0, 'limiter indisponível também falha antes do buffer');

console.log('PASSOU: gate de IP do webhook Stripe — 2 cenários, corpo não consumido');
