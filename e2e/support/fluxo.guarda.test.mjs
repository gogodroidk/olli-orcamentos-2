import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exigirAmbienteSeguro } from './fluxo.mjs';

describe('guarda: nenhum cadastro de teste em produção', () => {
  for (const ok of ['http://127.0.0.1:4187', 'http://localhost:3000', 'https://staging.olliorcamentos.online'])
    it(`libera ${ok}`, () => assert.doesNotThrow(() => exigirAmbienteSeguro(ok)));
  for (const ruim of ['https://app.olliorcamentos.online', 'https://olliorcamentos.online', 'https://exemplo.com'])
    it(`bloqueia ${ruim}`, () => assert.throws(() => exigirAmbienteSeguro(ruim), /bloqueado|só em loopback/));
});
