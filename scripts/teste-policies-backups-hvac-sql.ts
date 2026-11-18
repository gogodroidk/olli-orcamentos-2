/** Migration policies_backups_hvac_paridade (20261119100000) no PGlite: aplica do zero 2x (idempotente), 5 policies com a definição de produção, isolamento por dono. node scripts/teste-policies-backups-hvac-sql.ts */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(new URL('../supabase/migrations/20261119100000_policies_backups_hvac_paridade.sql', import.meta.url), 'utf8');
let ok = 0;
const caso = (n: string) => {
  ok++;
  console.log(`  ok  ${n}`);
};
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.backups_versionados (id bigserial primary key, user_id uuid not null, conteudo text);
  create table public.hvac_chunks (id bigserial primary key, texto text);
  create table public.hvac_codigos (id bigserial primary key, codigo text);
  grant usage on schema public, auth to authenticated, anon;
  grant all on all tables in schema public to authenticated, anon, service_role;
  grant all on all sequences in schema public to authenticated, anon, service_role;
  grant execute on function auth.uid() to authenticated, anon;
`);
await db.exec(sql);
await db.exec(sql); // idempotente
caso('aplica do zero e reaplica sem erro (drop policy if exists + create)');

const pol = await db.query<{ t: string; p: string; cmd: string; roles: string; qual: string | null; wc: string | null }>(
  `select tablename t, policyname p, cmd, roles::text roles, qual, with_check wc from pg_policies where schemaname='public' order by 1,2`,
);
assert.equal(pol.rows.length, 5);
const por = Object.fromEntries(pol.rows.map((r) => [r.p, r]));
assert.deepEqual(Object.keys(por).sort(), ['backup_ver_delete_own', 'backup_ver_insert_own', 'backup_ver_select_own', 'hvac_chunks_leitura', 'hvac_codigos_leitura']);
for (const r of pol.rows) assert.equal(r.roles, '{authenticated}');
assert.equal(por.backup_ver_select_own.cmd, 'SELECT');
assert.equal(por.backup_ver_insert_own.cmd, 'INSERT');
assert.equal(por.backup_ver_delete_own.cmd, 'DELETE');
assert.match(por.backup_ver_select_own.qual ?? '', /auth\.uid\(\)/);
assert.equal(por.backup_ver_insert_own.qual, null);
assert.match(por.backup_ver_insert_own.wc ?? '', /auth\.uid\(\)/);
assert.equal(por.hvac_chunks_leitura.qual, 'true');
assert.equal(por.hvac_codigos_leitura.qual, 'true');
caso('as 5 policies existem com cmd/roles/qual iguais aos de produção (sem UPDATE em backups_versionados)');

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';
await db.query(`insert into public.hvac_chunks (texto) values ('a'), ('b')`);
const como = async (uid: string | null, role: string, q: string) => {
  await db.exec(`set role ${role}; select set_config('test.uid', '${uid ?? ''}', false);`);
  try {
    return await db.query<{ n: number }>(q);
  } finally {
    await db.exec(`reset role`);
  }
};
await como(U1, 'authenticated', `insert into public.backups_versionados (user_id, conteudo) values ('${U1}', 'meu')`);
await assert.rejects(() => como(U1, 'authenticated', `insert into public.backups_versionados (user_id, conteudo) values ('${U2}', 'alheio')`), /row-level security/);
caso('authenticated só insere backup com o próprio user_id');
await db.exec(`insert into public.backups_versionados (user_id, conteudo) values ('${U2}', 'do outro')`);
assert.equal((await como(U1, 'authenticated', `select count(*)::int n from public.backups_versionados`)).rows[0].n, 1);
assert.equal((await como(U2, 'authenticated', `select count(*)::int n from public.backups_versionados`)).rows[0].n, 1);
caso('cada dono vê só o próprio backup');
await como(U1, 'authenticated', `delete from public.backups_versionados`);
assert.equal((await db.query<{ n: number }>(`select count(*)::int n from public.backups_versionados`)).rows[0].n, 1);
caso('delete só apaga o próprio');
await como(U1, 'authenticated', `update public.backups_versionados set conteudo = 'x'`).catch(() => undefined);
assert.equal((await db.query<{ n: number }>(`select count(*)::int n from public.backups_versionados where conteudo = 'x'`)).rows[0].n, 0);
caso('sem policy de UPDATE: ninguém atualiza pelo cliente');
assert.equal((await como(U1, 'authenticated', `select count(*)::int n from public.hvac_chunks`)).rows[0].n, 2);
assert.equal((await como(null, 'anon', `select count(*)::int n from public.hvac_chunks`)).rows[0].n, 0);
assert.equal((await como(null, 'anon', `select count(*)::int n from public.backups_versionados`)).rows[0].n, 0);
caso('HVAC legível por authenticated; anon não vê nada');
console.log(`\nteste-policies-backups-hvac-sql: ${ok} casos OK`);
