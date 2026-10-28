/**
 * Pagamento pendente / sem vínculo com o recibo é reprocessado no sync (28/10: a rotina não tinha chamador).
 *     node scripts/teste-religar-pagamentos.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sync = readFileSync(new URL('../src/services/cloudSync.ts', import.meta.url), 'utf8');
const pag = readFileSync(new URL('../src/services/pagamentos.ts', import.meta.url), 'utf8');
assert.match(pag, /export async function sincronizarPagamentosPendentes\(/, 'a rotina existe');
const push = sync.indexOf('await pushAllLocal(geracao);');
const chamada = sync.indexOf('m.sincronizarPagamentosPendentes()');
assert.ok(push > 0 && chamada > 0, 'o sync chama a rotina');
assert.ok(chamada > push, 'depois do pushAllLocal (o recibo já subiu)');
assert.match(sync.slice(chamada, chamada + 120), /\.catch\(\(\) => 0\)/, 'falha não derruba o sync');
// a rotina cobre os dois casos: ledger pendente e vínculo que faltou
assert.match(pag, /recibo\.ledgerStatus === 'pendente'/);
assert.match(pag, /recibo\.ledgerReciboVinculado !== true/);
console.log('teste-religar-pagamentos: OK');
