/**
 * Data de emissão na lista de orçamentos do painel (06/10/2026): o orçamento criado no painel
 * guarda `2026-10-06T00:00:00+00:00` e a lista mostrava esse texto cru em vez de 06/10/2026.
 *
 *     node scripts/teste-data-lista-iso.ts
 */
import assert from 'node:assert/strict';
import { ymdParaBr } from '../webapp/src/olli/datas.ts';

let checks = 0;
const eq = (atual: unknown, esperado: unknown, msg: string) => {
  assert.equal(atual, esperado, `FALHA: ${msg}`);
  checks++;
};

eq(ymdParaBr('2026-10-06'), '06/10/2026', 'data simples continua funcionando');
eq(ymdParaBr('2026-10-06T00:00:00+00:00'), '06/10/2026', 'ISO com hora e offset vira DD/MM/AAAA');
eq(ymdParaBr('2026-10-06T23:59:59-03:00'), '06/10/2026', 'o dia é o do texto, sem deslocar pelo fuso');
eq(ymdParaBr('2026-10-06T00:00:00.000Z'), '06/10/2026', 'ISO com Z');
eq(ymdParaBr('2026-10-06 00:00:00'), '06/10/2026', 'ISO com ESPAÇO no lugar do T também vira DD/MM/AAAA');
eq(ymdParaBr('2026-10-06 00:00:00+00'), '06/10/2026', 'formato do Postgres (espaço e offset)');
eq(ymdParaBr('texto solto'), 'texto solto', 'o que não é data fica como veio (não inventa)');
eq(ymdParaBr('2026-1-6'), '2026-1-6', 'data malformada não é reescrita');

console.log(`PASSOU: ${checks} verificações — data da lista em DD/MM/AAAA.`);
