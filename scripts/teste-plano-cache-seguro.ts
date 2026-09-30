import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLANO_CACHE_GRACA_MS,
  criarPlanoCache,
  interpretarPlanoCache,
  planoCacheValido,
} from '../src/services/planoCachePolicy.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const AGORA = Date.parse('2026-09-14T12:00:00.000Z');
const FUTURO = new Date(AGORA + 2 * 24 * 60 * 60 * 1000).toISOString();
const PASSADO = new Date(AGORA - 1).toISOString();

console.log('\nPlano OLLI — cache seguro por conta');

const proA = criarPlanoCache(A, {
  plano: 'pro',
  status: 'active',
  validoAte: FUTURO,
  origem: 'pagamento',
}, AGORA - 1_000);

assert.equal(planoCacheValido(proA, A, AGORA), true, 'a mesma conta mantém graça offline dentro da vigência');
assert.equal(planoCacheValido(proA, B, AGORA), false, 'outra conta nunca herda o Pro cacheado');
assert.equal(
  planoCacheValido({ ...proA, lidoEm: AGORA - PLANO_CACHE_GRACA_MS - 1 }, A, AGORA),
  false,
  'cache acima de sete dias expira',
);
assert.equal(planoCacheValido({ ...proA, validoAte: PASSADO }, A, AGORA), false, 'vigência paga expirada vence a graça');
assert.equal(planoCacheValido({ ...proA, validoAte: undefined }, A, AGORA), false, 'pagamento sem vigência falha fechado');
assert.equal(planoCacheValido({ ...proA, lidoEm: AGORA + 1 }, A, AGORA), false, 'relógio futuro falha fechado');

const roundTrip = interpretarPlanoCache(JSON.stringify(proA));
assert.deepEqual(roundTrip, proA, 'payload v2 estrito faz round-trip');
assert.equal(
  interpretarPlanoCache(JSON.stringify({ plano: 'pro', lidoEm: AGORA })),
  null,
  'cache legado sem ownerUserId é invalidado',
);
assert.equal(
  interpretarPlanoCache(JSON.stringify({ ...proA, token: 'nao-deveria-estar-aqui' })),
  null,
  'campo extra falha fechado e não amplia o formato persistido',
);

const storageKeys = readFileSync(new URL('../src/services/storageKeys.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
assert.match(storageKeys, /PLANO_CACHE_KEY[\s\S]*APP_DATA_STORAGE_KEYS[\s\S]*PLANO_CACHE_KEY/, 'logout remove o cache de plano');
assert.match(app, /event === 'SIGNED_OUT'[\s\S]*resetarPlano\(\)/, 'logout reseta o store de plano em memória');

console.log('PASSOU: dono, troca de conta, vigência, relógio, formato e logout validados.');
