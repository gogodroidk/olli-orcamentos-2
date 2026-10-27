/**
 * Versão mínima do app (D-1326): decisão pura + consulta com falhas.
 *     node scripts/teste-versao-minima-app.ts
 */
import assert from 'node:assert/strict';
import { consultarVersaoMinima, decidirVersaoMinima, linksPlay } from '../src/services/versaoMinima.ts';

assert.equal(decidirVersaoMinima(24, { ok: true, android: 26 }), 'atualizar', 'vc24 abaixo de 26');
assert.equal(decidirVersaoMinima(26, { ok: true, android: 26 }), 'ok', 'igual passa');
assert.equal(decidirVersaoMinima(27, { ok: true, android: 26 }), 'ok');
assert.equal(decidirVersaoMinima(24, { ok: true, android: 0 }), 'ok', 'mínimo 0 = desligado');
assert.equal(decidirVersaoMinima(null, { android: 26 }), 'desconhecido', 'sem versionCode no app: não tranca');
assert.equal(decidirVersaoMinima(24, null), 'desconhecido');
assert.equal(decidirVersaoMinima(24, { android: '26' }), 'desconhecido', 'texto não vale');
assert.equal(decidirVersaoMinima(24, { android: -1 }), 'desconhecido');
assert.equal(decidirVersaoMinima(24, [26]), 'desconhecido');

const resposta = (corpo: unknown, ok = true) => (async () => ({ ok, json: async () => corpo })) as unknown as typeof fetch;
assert.equal(await consultarVersaoMinima('https://x', 24, resposta({ android: 26 })), 'atualizar');
assert.equal(await consultarVersaoMinima('https://x', 24, resposta({ android: 26 }, false)), 'desconhecido', 'HTTP de erro');
assert.equal(await consultarVersaoMinima('', 24, resposta({ android: 26 })), 'desconhecido', 'sem URL do worker');
const quebra = (async () => { throw new Error('rede'); }) as unknown as typeof fetch;
assert.equal(await consultarVersaoMinima('https://x', 24, quebra), 'desconhecido', 'rede caiu');
const lenta = ((_u: string, init?: { signal?: AbortSignal }) => new Promise((_r, rej) => {
  init?.signal?.addEventListener('abort', () => rej(new Error('abort')));
})) as unknown as typeof fetch;
assert.equal(await consultarVersaoMinima('https://x', 24, lenta, 20), 'desconhecido', 'prazo estoura');
let url = '';
await consultarVersaoMinima('https://w.dev', 24, (async (u: string) => { url = u; return { ok: true, json: async () => ({ android: 0 }) }; }) as unknown as typeof fetch);
assert.equal(url, 'https://w.dev/app/versao-minima');

assert.deepEqual(linksPlay('online.olliorcamentos.app'), {
  loja: 'market://details?id=online.olliorcamentos.app',
  web: 'https://play.google.com/store/apps/details?id=online.olliorcamentos.app',
});
console.log('teste-versao-minima-app: OK');
