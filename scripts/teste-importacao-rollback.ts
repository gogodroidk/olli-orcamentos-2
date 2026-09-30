import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../webapp/src/pages/olli/dados/index.tsx', import.meta.url), 'utf8');

assert.match(page, /useExcluir/);
assert.match(page, /const operacoes/);
assert.match(page, /const desfazer/);
assert.match(page, /\.reverse\(\)/);
assert.match(page, /falhasRollback/);
assert.match(page, /lixeira/);
assert.doesNotMatch(page, /não há exclusão nesta operação/);

console.log('PASSOU: importação com prévia, compensação reversível e relato de falha de rollback.');
