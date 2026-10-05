/**
 * T-022 — upsert em tabela APPEND-ONLY não pode exigir UPDATE.
 *
 *     node scripts/teste-upsert-append-only.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * `documento_versoes` só tem `select, insert` para `authenticated`. O push do
 * cloudSync fazia `upsert(row, { onConflict: 'id' })` (= ON CONFLICT DO UPDATE)
 * e o Postgres respondia 42501 em toda versão. O conserto é no cliente:
 * `ignoreDuplicates` (= ON CONFLICT DO NOTHING), sem migration nem grant novo.
 *
 * O que este arquivo tranca:
 *  1. A regra real (`opcoesUpsert`) — executada, não lida.
 *  2. Todo upsert de `pushRowUnchecked` passa pela regra (inclusive os reenvios
 *     de recuo de coluna) — sem isso um degrau novo reintroduz o 42501.
 *  3. As migrations e a lista de append-only concordam: toda tabela espelhada
 *     cujo grant a `authenticated` não tem UPDATE está na lista, e nenhuma da
 *     lista ganhou UPDATE (se ganhar, a lista ficou velha e deve ser revista).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { opcoesUpsert, TABELAS_APPEND_ONLY } from '../src/services/upsertAppendOnly.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown) {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}`); falhas++; }
}

const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sync = semComentarios(readFileSync('src/services/cloudSync.ts', 'utf8').replace(/
/g, '
'));

console.log('\n1. Regra executada');
const versoes = opcoesUpsert('documento_versoes', 'id');
checar('documento_versoes vai com ignoreDuplicates', versoes.ignoreDuplicates === true && versoes.onConflict === 'id');
const docs = opcoesUpsert('documentos', 'id');
checar('documentos (tem UPDATE) segue upsert normal', docs.ignoreDuplicates === undefined && docs.onConflict === 'id');
checar('pmoc_plano_versoes (rascunho atualizável) segue upsert normal', opcoesUpsert('pmoc_plano_versoes', 'id').ignoreDuplicates === undefined);
checar('empresa preserva o onConflict próprio', opcoesUpsert('empresa', 'user_id').onConflict === 'user_id');

console.log('\n2. pushRowUnchecked usa a regra em todo upsert');
const corpo = /async function pushRowUnchecked[\s\S]*?\n}\n/.exec(sync)?.[0] ?? '';
const upserts = corpo.match(/\.upsert\([^;]*?\)\)?;/g) ?? [];
checar('pushRowUnchecked encontrado com upserts', upserts.length >= 5);
checar('nenhum upsert com onConflict cru', !/\.upsert\(row, \{ onConflict/.test(corpo));
checar('todos os upserts passam por opcoesUpsert', upserts.every((u) => u.includes('opcoesUpsert(table, ON_CONFLICT[table])')));

console.log('\n3. Migrations x lista append-only');
const uniao = /type SyncTable =([\s\S]*?);/.exec(sync)?.[1] ?? '';
const locais = [...uniao.matchAll(/'(\w+)'/g)].map((m) => m[1]);
const blocoRemoto = /const REMOTE_TABLE[^=]*=\s*\{([\s\S]*?)\};/.exec(sync)?.[1] ?? '';
const remotoDe = new Map([...blocoRemoto.matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
checar('SyncTable lida do fonte', locais.includes('documento_versoes') && locais.includes('documentos'));

// Último grant a `authenticated` por tabela, em ordem de migration (nome = data).
const ultimoGrant = new Map<string, string[]>();
const dir = 'supabase/migrations';
for (const arq of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(`${dir}/${arq}`, 'utf8').replace(/--.*$/gm, '');
  for (const m of sql.matchAll(/grant\s+([\w,\s]+?)\s+on\s+(?:table\s+)?public\.(\w+)\s+to\s+authenticated/gi)) {
    ultimoGrant.set(m[2], m[1].toLowerCase().split(',').map((p) => p.trim()));
  }
}
checar('grant de documento_versoes é só select/insert', ultimoGrant.get('documento_versoes')?.join(',') === 'select,insert');
for (const local of locais) {
  const remoto = remotoDe.get(local) ?? local;
  const privs = ultimoGrant.get(remoto);
  if (!privs) continue; // sem grant explícito: herda o padrão do schema (tem UPDATE)
  const semUpdate = !privs.includes('update') && !privs.includes('all');
  checar(
    `${local}: ${semUpdate ? 'sem' : 'com'} UPDATE ⇒ ${semUpdate ? 'na' : 'fora da'} lista append-only`,
    semUpdate === TABELAS_APPEND_ONLY.has(local),
  );
}

if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
