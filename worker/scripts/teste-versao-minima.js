// Versão mínima do app Android (D-1326): helper do worker + rota pública.
//     node scripts/teste-versao-minima.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { metodosDaRota } from '../src/util.js';
import { versaoMinimaAndroid } from '../src/versaoMinima.js';

const play = (minima, atual = '30') => versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: minima, APP_VERSAO_PLAY_ATUAL: atual });
assert.equal(versaoMinimaAndroid({}), 0, 'vars ausentes = desligada');
assert.equal(versaoMinimaAndroid(undefined), 0);
assert.equal(play(''), 0, 'mínima vazia = desligada');
assert.equal(play('26'), 26);
assert.equal(play(' 26 '), 26);
assert.equal(play('30', '30'), 30, 'mínima igual ao último build publicado vale');
for (const lixo of ['-1', '26.5', 'abc', '1e3', '9999999', 26]) {
  assert.equal(play(lixo), 0, `valor estranho (${lixo}) não tranca ninguém`);
}
// trava de configuração (LIVRE #259 P2): mínima acima do que a Play entrega trancaria todo mundo
assert.equal(versaoMinimaAndroid({ APP_VERSAO_MINIMA_ANDROID: '26' }), 0, 'sem APP_VERSAO_PLAY_ATUAL: desligada');
assert.equal(play('31', '30'), 0, 'mínima acima do último build da Play: desligada');
assert.equal(play('26', 'lixo'), 0, 'Play atual inválida: desligada');

const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const rota = index.indexOf("url.pathname === '/app/versao-minima'");
assert.ok(rota > 0, 'rota GET /app/versao-minima existe');
assert.ok(rota < index.indexOf('const metodosAceitos = metodosDaRota'), 'rota responde antes do 404/405 genérico');
assert.match(index.slice(rota, rota + 300), /android: versaoMinimaAndroid\(env\)/, 'rota devolve o helper');

// o index.js inteiro precisa continuar válido (um import mal posto já quebrou o build uma vez)
execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../src/index.js', import.meta.url))]);
assert.equal(metodosDaRota('/app/versao-minima'), 'GET', 'tabela de rotas conhece a rota (405 certo para outro verbo)');

console.log('teste-versao-minima: OK');
