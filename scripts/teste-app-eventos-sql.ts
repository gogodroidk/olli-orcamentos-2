/**
 * Espelho de track() no banco (20261022090000_app_eventos.sql), em Postgres real (PGlite):
 *   - lote válido grava; nome inválido é descartado; props gigantes viram {};
 *   - sem sessão = not_authenticated; lote que não é array = lote_invalido;
 *   - authenticated NÃO lê a tabela nem a view; service_role lê;
 *   - teto de 600 eventos/hora por usuário; resumo exclui contas internas.
 *     node scripts/teste-app-eventos-sql.ts
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SQL = readFileSync('supabase/migrations/20261022090000_app_eventos.sql', 'utf8');
let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U1 = id(1), U2 = id(2);

const db = new PGlite();
await db.exec(`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
create table public.funil_exclusoes (user_id uuid, criado_em timestamptz default now());
grant select on public.funil_exclusoes to service_role;
-- stub do predicado real (20261007140000_contas_internas.sql): aqui, interna = está em funil_exclusoes
create function public.conta_interna(p uuid) returns boolean language sql stable as $$ select exists (select 1 from public.funil_exclusoes where user_id = p) $$;
grant execute on function public.conta_interna(uuid) to service_role;
insert into auth.users values ('${U1}'), ('${U2}');
`);
await db.exec(SQL);

const como = async (uid: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
  try { return await db.query<Record<string, unknown>>(sql, params); }
  finally { await db.exec('reset role;'); }
};
const erro = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ''; } catch (e) { return String((e as Error).message); }
};
const contar = async () => Number((await db.query<{ n: number }>('select count(*)::int as n from public.app_eventos')).rows[0].n);

console.log('\napp_eventos: espelho do track()');

const lote = JSON.stringify([
  { e: 'gate_visto', p: { gate: 'pdf' } },
  { e: 'Dica_Mostrada', p: {} },
  { e: 'tem espaço', p: {} },
  { e: 'x', p: {} },
  { e: 'ai_used', p: { lixo: 'x'.repeat(2000) } },
]);
const r = await como(U1, 'select public.registrar_eventos_app($1::jsonb, $2) as n', [lote, 'android']);
checar('grava só os válidos (3 de 5)', Number(r.rows[0].n) === 3, JSON.stringify(r.rows));
const props = (await db.query<{ props: Record<string, unknown> }>("select props from public.app_eventos where evento = 'ai_used'")).rows[0];
checar('props gigantes viram {}', props && Object.keys(props.props).length === 0);
checar('nome em caixa mista é normalizado', (await db.query("select 1 from public.app_eventos where evento = 'dica_mostrada'")).rows.length === 1);
checar('user_id vem de auth.uid(), não do cliente', (await db.query(`select 1 from public.app_eventos where user_id <> '${U1}'`)).rows.length === 0);

checar('sem sessão = not_authenticated', (await erro(async () => {
  await db.exec("reset role; set test.uid = ''; set role authenticated;");
  try { await db.query("select public.registrar_eventos_app('[]'::jsonb)"); } finally { await db.exec('reset role;'); }
})).includes('not_authenticated'));
checar('lote não-array = lote_invalido', (await erro(() => como(U1, `select public.registrar_eventos_app('{"e":"a"}'::jsonb)`))).includes('lote_invalido'));
checar('authenticated não lê a tabela', (await erro(() => como(U1, 'select * from public.app_eventos'))).length > 0);
checar('authenticated não lê o resumo', (await erro(() => como(U1, 'select * from public.app_eventos_resumo'))).length > 0);
await db.exec('set role service_role');
const resumo = await db.query<{ evento: string; contas: number }>('select evento, contas::int from public.app_eventos_resumo');
await db.exec('reset role');
checar('service_role lê o resumo', resumo.rows.length === 3);

// teto: 600/h
const grande = JSON.stringify(Array.from({ length: 50 }, () => ({ e: 'spam_evento', p: {} })));
for (let i = 0; i < 14; i++) await como(U2, 'select public.registrar_eventos_app($1::jsonb)', [grande]);
const antes = Number((await db.query(`select count(*)::int as n from public.app_eventos where user_id = '${U2}'`)).rows[0].n);
checar('teto de 600/h corta o loop', antes <= 650 && antes >= 600, `gravou ${antes}`);

// conta interna fora do resumo
await db.exec(`insert into public.funil_exclusoes (user_id) values ('${U2}')`);
await db.exec('set role service_role');
const sem = await db.query("select 1 from public.app_eventos_resumo where evento = 'spam_evento'");
await db.exec('reset role');
checar('resumo exclui contas internas', sem.rows.length === 0);

console.log(`\n${ok} ok, ${falhas} falhas (total ${await contar()} linhas)`);
process.exit(falhas ? 1 : 0);
