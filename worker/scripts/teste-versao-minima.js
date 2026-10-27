// Versão mínima do app Android (D-1326): helper do worker + rota pública.
//     node scripts/teste-versao-minima.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { metodosDaRota } from '../src/util.js';
import { versaoMinimaAndroid } from '../src/versaoMinima.js';

assert.equal(versaoMinimaAndroid({}), 0, 'var ausente = desligada');
assert.equal(versaoMinimaAndroid(undefined), 0);
assert.equal(versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: '' }), 0, 'vazia = desligada');
assert.equal(versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: '26' }), 26);
assert.equal(versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: ' 26 ' }), 26);
for (const lixo of ['-1', '26.5', 'abc', '1e3', '9999999', 26]) {
  assert.equal(versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: lixo }), 0, `valor estranho (${lixo}) não tranca ninguém`);
}

const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const rota = index.indexOf("url.pathname === '/app/versao-minima'");
assert.ok(rota > 0, 'rota GET /app/versao-minima existe');
assert.ok(rota < index.indexOf('const metodosAceitos = metodosDaRota'), 'rota responde antes do 404/405 genérico');
assert.match(index.slice(rota, rota + 300), /android: versaoMinimaAndroid\(env\)/, 'rota devolve o helper');

// o index.js inteiro precisa continuar válido (um import mal posto já quebrou o build uma vez)
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/index.js', import.meta.url))]);
assert.equal(metodosDaRota('/app/versao-minima'), 'GET', 'tabela de rotas conhece a rota (405 certo para outro verbo)');

console.log('teste-versao-minima: OK');
