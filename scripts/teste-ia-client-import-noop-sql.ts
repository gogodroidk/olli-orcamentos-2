/** Migration ia_client_import_commit (20260925151656) virou no-op: aplica do zero sem erro, 2x, e não cria nada (recurso abandonado, nunca rodou em produção). node scripts/teste-ia-client-import-noop-sql.ts */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(new URL('../supabase/migrations/20260925151656_ia_client_import_commit.sql', import.meta.url), 'utf8');
let ok = 0;
const caso = (n: string) => {
  ok++;
  console.log(`  ok  ${n}`);
};
const db = new PGlite();
await db.exec(sql);
await db.exec(sql);
caso('aplica do zero (banco vazio, sem auth/organizacoes/clientes) e reaplica sem erro');
const o = await db.query<{ t: number; f: number }>(
  `select (select count(*)::int from pg_tables where schemaname='public') t, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') f`,
);
assert.equal(o.rows[0].t, 0);
assert.equal(o.rows[0].f, 0);
caso('não cria tabela nem função (nenhum objeto ia_client_import_* em public)');
const exec = sql.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
assert.deepEqual(exec, ['select 1;']);
caso('o único comando executável é "select 1;" (o resto é comentário com o motivo)');
assert.match(sql, /NO-OP DE PROPÓSITO/);
assert.match(sql, /nunca rodou em produção|NUNCA rodou em produção/i);
caso('o motivo e o rollback do recurso estão documentados no arquivo');
console.log(`\nteste-ia-client-import-noop-sql: ${ok} casos OK`);
