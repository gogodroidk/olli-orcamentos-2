/**
 * DEVOLVER COTA DIÁRIA DE IA (migration 20261106054000) rodando o SQL de verdade no PGlite.
 *     node scripts/teste-devolver-cota-ia-sql.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key);`);
await db.exec(ler('../supabase/migrations/20260817_openrouter_quota_diaria.sql'));
const sqlNova = ler('../supabase/migrations/20261106054000_devolver_cota_ia.sql');
await db.exec(sqlNova);
await db.exec(sqlNova); // idempotente

const u = '00000000-0000-4000-8000-000000000001';
await db.query('insert into auth.users (id) values ($1)', [u]);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const reservar = (req: string) => db.query<{ estado: string }>(
  `select * from public.reservar_cota_ia_diaria($1, 'openrouter', $2, 30, 15, 1)`, [u, req]);
const devolver = (req: string) => db.query<{ d: boolean }>(
  `select public.devolver_cota_ia_diaria($1, 'openrouter', $2) as d`, [u, req]).then((r) => r.rows[0].d);
const usados = async () => (await db.query<{ g: number; u: number; r: number }>(
  `select (select coalesce(sum(usados),0)::int from public.ia_cota_global_diaria) g,
          (select coalesce(sum(usados),0)::int from public.ia_cota_usuario_diaria) u,
          (select count(*)::int from public.ia_cota_reservas) r`)).rows[0];

assert.equal((await reservar(A)).rows[0].estado, 'permitido');
assert.equal((await reservar(B)).rows[0].estado, 'permitido');
assert.deepEqual(await usados(), { g: 2, u: 2, r: 2 });
assert.equal(await devolver(A), true, 'devolve a reserva da tentativa que falhou');
assert.deepEqual(await usados(), { g: 1, u: 1, r: 1 }, 'contagens global e do usuário voltam 1');
assert.equal(await devolver(A), false, '2ª devolução da mesma reserva não faz nada');
assert.equal(await devolver('33333333-3333-4333-8333-333333333333'), false, 'reserva desconhecida: false');
assert.equal(await devolver(`  ${B}  `), true, 'request_id com espaço acha a reserva (btrim, como a reserva)');
assert.deepEqual(await usados(), { g: 0, u: 0, r: 0 }, 'as duas devolvidas');
const priv = await db.query<{ a: boolean; s: boolean }>(`select
  has_function_privilege('authenticated','public.devolver_cota_ia_diaria(uuid,text,text)','execute') a,
  has_function_privilege('service_role','public.devolver_cota_ia_diaria(uuid,text,text)','execute') s`);
assert.deepEqual(priv.rows[0], { a: false, s: true }, 'só service_role executa');
console.log('teste-devolver-cota-ia-sql: OK');
