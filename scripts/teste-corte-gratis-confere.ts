/** Gate do corte do Grátis: a comparação copy × banco e o SQL gerado. node scripts/teste-corte-gratis-confere.ts */
import assert from 'node:assert/strict';
import { corteConfere, emBrasilia, sqlDoCorte } from './corte-gratis-confere.ts';
import { CORTE_GRATIS_DATA } from '../src/services/planosBase.ts';

let ok = 0;
const caso = (n: string) => {
  ok++;
  console.log(`  ok  ${n}`);
};

// A constante real pode ser null (hoje) ou D+1 (dia do corte): o gate vale nos dois estados, então este teste NÃO a fixa.
assert.ok(CORTE_GRATIS_DATA === null || /^\d{4}-\d{2}-\d{2}$/.test(CORTE_GRATIS_DATA), 'a constante é null ou AAAA-MM-DD');
caso('a constante da copy é null ou AAAA-MM-DD');

assert.equal(emBrasilia('2026-10-26T03:00:00Z'), '2026-10-26 00:00:00');
assert.equal(emBrasilia('2026-10-26 00:00:00-03'), '2026-10-26 00:00:00');
assert.equal(emBrasilia('2026-10-25T23:59:59-03:00'), '2026-10-25 23:59:59');
assert.equal(emBrasilia('lixo'), null);
caso('emBrasilia converte UTC e offsets para o relógio de Brasília');

// desligado
assert.equal(corteConfere(null, null).ok, true);
assert.equal(corteConfere('', null).ok, true);
assert.equal(corteConfere('2026-10-26 00:00:00-03', null).ok, false, 'banco com corte e copy ilimitado: não publica');
// ligado
const D1 = '2026-10-26';
assert.equal(corteConfere('2026-10-26 00:00:00-03', D1).ok, true);
assert.equal(corteConfere('2026-10-26T03:00:00+00:00', D1).ok, true, 'mesmo instante em UTC');
assert.equal(corteConfere('2026-10-26 03:00:00+00', D1).ok, true, 'formato do Postgres');
assert.equal(corteConfere('2026-10-26 00:00:00+00', D1).ok, false, 'UTC meia-noite = 21h do dia anterior em Brasília');
assert.equal(corteConfere('2026-10-27 00:00:00-03', D1).ok, false, 'um dia depois');
assert.equal(corteConfere('2026-10-26 12:00:00-03', D1).ok, false, 'meio-dia (ex.: now() do dia) não é 00:00');
assert.equal(corteConfere(null, D1).ok, false, 'copy anuncia e o banco está sem corte');
assert.equal(corteConfere('2026-10-26 00:00:00-03', '26/10/2026').ok, false, 'constante em formato errado');
assert.equal(corteConfere('lixo', D1).ok, false);
caso('corteConfere: aceita só D 00:00 em Brasília; recusa UTC meia-noite, outro dia, meio-dia, null e lixo');

{
  const s = sqlDoCorte(D1);
  assert.match(s.atualizar, /timestamptz '2026-10-26 00:00:00-03'/);
  assert.match(s.conferir, /at time zone 'America\/Sao_Paulo'\) = timestamp '2026-10-26 00:00:00'/);
  assert.match(sqlDoCorte(null).atualizar, /corte = null/);
  assert.throws(() => sqlDoCorte('26/10/2026'));
  caso('SQL gerado: UPDATE com -03 explícito e SELECT de conferência em Brasília; desligar = null');
}

console.log(`\nteste-corte-gratis-confere: ${ok} casos OK`);
