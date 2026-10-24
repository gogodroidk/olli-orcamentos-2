/**
 * Indicação — migration 20261010090000_indicacoes.sql rodando DE VERDADE num
 * Postgres em memória (PGlite). Cobre: código por indicador (idempotente), TTL de
 * 7 dias (vencido não vincula; renova com código novo), vários indicados no mesmo
 * código, auto-indicação, funil_exclusoes, 1 indicação por indicado, recompensa
 * dos dois lados (ref distinta, idempotente), valor zero, TETO 5 por indicador e
 * permissões (usuário não escreve, não vê o id do indicado, não chama as funções).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8');
const sql = ler('../supabase/migrations/20261010090000_indicacoes.sql');
const sqlLedger = ler('../supabase/migrations/20260720_credit_ledger.sql');

let ok = 0;
async function caso(nome: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}
console.log('\nIndicação — SQL real (PGlite)');

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant usage on schema auth to authenticated, service_role;
  grant execute on all functions in schema auth to authenticated, service_role;
  create table public.funil_exclusoes (id bigint generated always as identity primary key,
    user_id uuid references auth.users(id) on delete cascade, email text);
`);
await db.exec(sqlLedger.split('-- ====')[0]);
await db.exec(sql);
await db.exec(`grant usage on schema public to authenticated, service_role;
  grant select on public.credit_ledger to authenticated;`);

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
for (let n = 1; n <= 12; n++) await db.query('insert into auth.users values ($1)', [U(n)]);
const q = async <T = any>(s: string, p: unknown[] = []) => (await db.query<T>(s, p)).rows;
const cadastro = async (cod: string, u: string) =>
  (await q<{ r: string }>('select public.indicacao_registrar_cadastro($1,$2) r', [cod, u]))[0].r;
const recompensa = async (u: string, v: number) =>
  (await q<{ r: any }>('select public.indicacao_recompensar($1,$2) r', [u, v]))[0].r;
const codigo = async (u: string) =>
  (await q<{ c: string }>('select public.indicacao_obter_codigo($1) c', [u]))[0].c;

const COD = await codigo(U(1));

await caso('código válido, idempotente e 7 dias de validade', async () => {
  assert.match(COD, /^OLLI-[A-Z0-9]{6}$/);
  assert.equal(await codigo(U(1)), COD);
  const [r] = await q<{ d: number }>(`select extract(epoch from (expira_em - criado_em))/86400 d from public.indicacao_codigos`);
  assert.equal(Math.round(r.d), 7);
});
await caso('cadastro: inválido, auto-indicação, ok (minúsculo/espaço), repetido', async () => {
  assert.equal(await cadastro('OLLI-NADA00', U(2)), 'codigo_invalido');
  assert.equal(await cadastro(COD, U(1)), 'auto_indicacao');
  assert.equal(await cadastro(` ${COD.toLowerCase()} `, U(2)), 'ok');
  assert.equal(await cadastro(COD, U(2)), 'ja_indicado');
});
await caso('1 código serve para vários indicados', async () => {
  assert.equal(await cadastro(COD, U(3)), 'ok');
  assert.equal((await q('select 1 from public.indicacoes where indicador_id=$1', [U(1)])).length, 2);
});
await caso('conta em funil_exclusoes não vincula', async () => {
  await db.query('insert into public.funil_exclusoes (user_id) values ($1)', [U(4)]);
  assert.equal(await cadastro(COD, U(4)), 'conta_excluida');
});
await caso('recompensa: valor zero e quem não veio por indicação não pagam', async () => {
  assert.equal((await recompensa(U(2), 0)).motivo, 'valor_zero');
  assert.equal((await recompensa(U(9), 100)).motivo, 'nao_veio_por_indicacao');
  assert.equal((await q('select 1 from public.credit_ledger')).length, 0);
});
await caso('recompensa paga os DOIS lados, 1 vez só', async () => {
  const r = await recompensa(U(2), 150);
  assert.equal(r.ok, true);
  assert.equal(r.creditos, 10);
  const l = await q<{ user_id: string; delta: number; origem: string }>('select user_id, delta, origem from public.credit_ledger order by user_id');
  assert.deepEqual(l.map((x) => [x.user_id, x.delta, x.origem]), [[U(1), 10, 'referral'], [U(2), 10, 'referral']]);
  assert.equal((await recompensa(U(2), 150)).motivo, 'ja_recompensado');
  assert.equal((await q('select 1 from public.credit_ledger')).length, 2);
});
await caso('TETO: 5 recompensas por indicador; a 6ª não paga e o indicado fica sem crédito', async () => {
  // U(2) já foi a 1ª. Mais 4 → 5 recompensas.
  for (const n of [3, 5, 6, 7]) {
    assert.equal(await cadastro(COD, U(n)), n === 3 ? 'ja_indicado' : 'ok');
    assert.equal((await recompensa(U(n), 50)).ok, true);
  }
  assert.equal(await cadastro(COD, U(8)), 'ok');
  assert.equal((await recompensa(U(8), 50)).motivo, 'teto_indicador');
  const [r] = await q<{ n: number }>(`select count(*)::int n from public.credit_ledger where user_id=$1 and origem='referral'`, [U(1)]);
  assert.equal(r.n, 5);
  assert.equal((await q(`select 1 from public.credit_ledger where user_id=$1`, [U(8)])).length, 0);
});
await caso('TTL: código vencido não vincula; renovar gera código novo e indicados antigos acompanham', async () => {
  await db.query(`update public.indicacao_codigos set expira_em = now() - interval '1 second' where indicador_id=$1`, [U(1)]);
  assert.equal(await cadastro(COD, U(9)), 'expirado');
  const novo = await codigo(U(1));
  assert.notEqual(novo, COD);
  assert.equal(await cadastro(COD, U(9)), 'codigo_invalido');
  assert.equal(await cadastro(novo, U(9)), 'ok');
  assert.equal((await q('select 1 from public.indicacoes where codigo=$1', [novo])).length, 7);
});
await caso('indicador de outro código tem teto próprio', async () => {
  const c2 = await codigo(U(10));
  assert.equal(await cadastro(c2, U(11)), 'ok');
  assert.equal((await recompensa(U(11), 80)).ok, true);
});
await caso('permissões: usuário não escreve, não chama função e não vê indicado_id', async () => {
  await db.exec(`set role authenticated; set teste.uid = '${U(1)}'`);
  await assert.rejects(db.query(`insert into public.indicacoes (codigo, indicador_id, indicado_id) values ('x', '${U(1)}', '${U(12)}')`));
  await assert.rejects(db.query(`update public.indicacoes set estado='recompensado'`));
  await assert.rejects(db.query(`select public.indicacao_recompensar('${U(12)}', 10)`));
  await assert.rejects(db.query('select indicado_id from public.indicacoes'));
  const visiveis = await q('select id, estado from public.indicacoes');
  assert.ok(visiveis.length > 0);
  await db.exec(`set teste.uid = '${U(12)}'`);
  assert.equal((await q('select id from public.indicacoes')).length, 0);
  await db.exec('reset role');
});
await caso('migration não apaga dado', () => {
  assert.doesNotMatch(sql, /delete\s+from|drop\s+table/i);
});

console.log(`\n${ok} casos ok`);
