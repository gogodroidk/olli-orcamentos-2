import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dataBrParaIsoSeguro } from '../src/utils/date.ts';
import { brParaIso } from '../webapp/src/olli/datas.ts';

assert.equal(dataBrParaIsoSeguro('10/07/2026'), '2026-07-10T12:00:00.000Z');
assert.equal(dataBrParaIsoSeguro('01/12/2026'), '2026-12-01T12:00:00.000Z');
assert.equal(dataBrParaIsoSeguro('31/02/2026'), null);
assert.equal(dataBrParaIsoSeguro(''), null);
assert.equal(dataBrParaIsoSeguro(undefined), null);

// Mobile e painel precisam escrever a mesma coluna-espelho.
assert.equal(brParaIso('10/07/2026'), dataBrParaIsoSeguro('10/07/2026'));
assert.equal(brParaIso('31/02/2026'), null);

const sync = readFileSync(new URL('../src/services/cloudSync.ts', import.meta.url), 'utf8');
assert.match(sync, /data_recebimento:\s*dataBrParaIsoSeguro\(r\.dataRecebimento\)/);
assert.doesNotMatch(sync, /data_recebimento:\s*r\.dataRecebimento\s*\?\?/);

console.log('teste-recibo-data: 9 verificações passaram');
