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
// LIVRE P2: só no aparelho do dono/pessoal; recusa definitiva sai do laço
assert.match(sync.slice(sync.indexOf("contextoEquipe.status === 'pessoal'"), chamada), /contextoEquipe\.status === 'pessoal'/, 'membro e desconhecido não religam');
assert.ok(sync.lastIndexOf("contextoEquipe.status === 'pessoal'", chamada) > push, 'guarda do dono logo antes da chamada');
const negado = pag.lastIndexOf("ledger.status === 'negado'");
assert.ok(negado > 0 && /ledgerStatus: 'falhou'/.test(pag.slice(negado, negado + 400)), 'negado vira falhou (sai do filtro)');
console.log('teste-religar-pagamentos: OK');
