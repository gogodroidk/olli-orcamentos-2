/** Migration apple_compras (20261024140000) rodando no PGlite: tabela, checks, dono imutável, sem acesso de anon/authenticated. node scripts/teste-apple-compras-sql.ts */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(new URL('../supabase/migrations/20261024140000_apple_compras.sql', import.meta.url), 'utf8');
let ok = 0;
const caso = (n: string) => {
  ok++;
  console.log(`  ok  ${n}`);
};
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users (id uuid primary key);`);
await db.exec(sql);
await db.exec(sql); // idempotente
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users (id) values ($1), ($2)', [U1, U2]);
const ins = (orig: string, user: string, extra = '') => db.query(`insert into public.apple_compras (original_transaction_id, user_id, produto_id, ambiente, estado ${extra ? ',' + extra.split('=')[0] : ''}) values ($1, $2, 'olli_pro:mensal', 'Production', 'ativa' ${extra ? ',' + extra.split('=')[1] : ''})`, [orig, user]);
await ins('2000000111111111', U1);
caso('cria e aceita uma compra válida; migration idempotente');
await assert.rejects(() => ins('2000000111111111', U2), /duplicate key|apple_compras_pkey/);
caso('mesmo originalTransactionId não entra duas vezes (anti-replay na PK)');
await assert.rejects(() => ins('abc', U1), /check/i);
await assert.rejects(() => db.query(`insert into public.apple_compras values ('2000000222222222', $1, 'olli_pro:mensal', 'Xcode', 'ativa')`, [U1]), /check/i);
await assert.rejects(() => db.query(`insert into public.apple_compras (original_transaction_id, user_id, produto_id, ambiente, estado) values ('2000000333333333', $1, 'produto qualquer', 'Production', 'ativa')`, [U1]), /check/i);
caso('checks: id numérico, ambiente Production/Sandbox, produto no formato do catálogo');
await assert.rejects(() => db.query(`update public.apple_compras set user_id = $1 where original_transaction_id = '2000000111111111'`, [U2]), /apple_compras_dono_imutavel/);
await db.query(`update public.apple_compras set estado = 'encerrada' where original_transaction_id = '2000000111111111'`);
caso('user_id imutável (trigger); outras colunas atualizam');
const p = await db.query<{ a: boolean; b: boolean; c: boolean }>(`select has_table_privilege('anon','public.apple_compras','select') a, has_table_privilege('authenticated','public.apple_compras','select') b, (select relrowsecurity from pg_class where oid='public.apple_compras'::regclass) c`);
assert.equal(p.rows[0].a, false);
assert.equal(p.rows[0].b, false);
assert.equal(p.rows[0].c, true);
caso('RLS ligada; anon e authenticated sem acesso');
await db.query(`delete from auth.users where id = $1`, [U1]);
const n = await db.query<{ n: number }>('select count(*)::int n from public.apple_compras');
assert.equal(n.rows[0].n, 0);
caso('excluir a conta leva as compras (CASCADE)');
console.log(`\nteste-apple-compras-sql: ${ok} casos OK`);
