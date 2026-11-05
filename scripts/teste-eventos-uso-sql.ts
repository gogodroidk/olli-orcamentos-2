/**
 * Telemetria de jornada (20261022100000_eventos_uso.sql), em Postgres real (PGlite). Trava:
 *   - usuário é SEMPRE auth.uid() (campo usuario_id no payload é ignorado);
 *   - evento fora do catálogo é descartado; reenvio com mesmo id não duplica;
 *   - lote >100 é recusado; sem login é recusado; teto de 200/dia por usuário;
 *   - opt-out ('telemetria_uso' revogado) grava 0; novo consentimento volta a gravar;
 *   - authenticated NÃO lê/escreve eventos_uso nem o catálogo; só mexe no próprio consentimento;
 *   - excluir a conta apaga a jornada (cascade).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIG = readFileSync('supabase/migrations/20261022100000_eventos_uso.sql', 'utf8');

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
insert into auth.users values ('${U1}'), ('${U2}');
`);
await db.exec(MIG);

const comoUsuario = async (uid: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
  try { return await db.query<Record<string, unknown>>(sql, params); }
  finally { await db.exec('reset role;'); }
};
const erro = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ''; } catch (e) { return String((e as Error).message); }
};
const ev = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(1000 + n), sessao: id(9), seq: n, nome: 'tela_vista', tela: 'orcamento_novo',
  plataforma: 'android', app_versao: '1.2.1', ts_cliente: '2026-10-22T10:00:00Z', ...extra,
});
const enviar = (uid: string, eventos: unknown[]) =>
  comoUsuario(uid, 'select public.registrar_eventos_uso($1::jsonb) as n', [JSON.stringify(eventos)]);
const total = async (uid: string) =>
  Number((await db.query<{ n: string }>(
    `select count(*) n from public.eventos_uso where usuario_id='${uid}'`)).rows[0].n);

console.log('\neventos_uso: gravação');
let r = await enviar(U1, [ev(1), ev(2, { nome: 'acao', componente: 'botao_enviar_whatsapp' })]);
checar('grava 2 eventos válidos', Number(r.rows[0].n) === 2 && (await total(U1)) === 2);

r = await enviar(U1, [ev(1), ev(2, { nome: 'acao', componente: 'botao_enviar_whatsapp' })]);
checar('reenvio do mesmo id não duplica', Number(r.rows[0].n) === 0 && (await total(U1)) === 2);

await enviar(U1, [ev(3, { usuario_id: U2 })]);
checar('usuario_id do payload é ignorado (grava como auth.uid)',
  (await total(U2)) === 0 && (await total(U1)) === 3);

r = await enviar(U1, [
  ev(4, { nome: 'clicou_no_cpf_do_cliente' }),
  ev(5, { tela: 'Tela Com Nome João' }),
  ev(6, { plataforma: 'blackberry' }),
]);
checar('nome fora do catálogo e tela inválida descartados', Number(r.rows[0].n) === 1, `gravou ${r.rows[0].n}`);
const pl = await db.query<{ plataforma: string }>(`select plataforma from public.eventos_uso where id='${id(1006)}'`);
checar('plataforma desconhecida normalizada para unknown', pl.rows[0]?.plataforma === 'unknown');

await enviar(U1, [{ ...ev(7), props: { x: 'a'.repeat(600) } }]);
const pg = await db.query<{ props: unknown }>(`select props from public.eventos_uso where id='${id(1007)}'`);
checar('props acima de 512 bytes viram {}', JSON.stringify(pg.rows[0]?.props) === '{}');

console.log('\neventos_uso: recusas e acesso');
checar('lote de 101 é recusado',
  (await erro(() => enviar(U2, Array.from({ length: 101 }, (_, i) => ev(100 + i, { id: id(7000 + i) }))))).includes('lote_grande'));
checar('não-array é recusado',
  (await erro(() => comoUsuario(U2, `select public.registrar_eventos_uso('{}'::jsonb)`))).includes('eventos_invalidos'));
await db.exec(`set test.uid = ''; set role authenticated;`);
checar('sem login é recusado',
  (await erro(() => db.query(`select public.registrar_eventos_uso('[]'::jsonb)`))).includes('not_authenticated'));
await db.exec('reset role;');
checar('authenticated não lê eventos_uso',
  (await erro(() => comoUsuario(U1, 'select * from public.eventos_uso'))).includes('permission denied'));
checar('authenticated não escreve direto em eventos_uso',
  (await erro(() => comoUsuario(U1,
    `insert into public.eventos_uso (id,usuario_id,sessao,seq,nome,ts_cliente) values ('${id(2000)}','${U1}','${id(9)}',0,'tela_vista',now())`)))
    .includes('permission denied'));
checar('authenticated não lê o catálogo',
  (await erro(() => comoUsuario(U1, 'select * from public.eventos_catalogo'))).includes('permission denied'));

console.log('\neventos_uso: teto diário');
const lote = (de: number, ate: number) => Array.from({ length: ate - de }, (_, i) => ev(de + i, { id: id(5000 + de + i) }));
await enviar(U2, lote(0, 100));
await enviar(U2, lote(100, 200));
r = await enviar(U2, lote(200, 210));
checar('200 por dia; excedente descartado', (await total(U2)) === 200 && Number(r.rows[0].n) === 0, `total ${await total(U2)} r=${JSON.stringify(r.rows)}`);

console.log('\nconsentimento / opt-out');
await comoUsuario(U1, `insert into public.consentimentos (usuario_id, finalidade, versao_texto) values ('${U1}','telemetria_uso','v1')`);
await comoUsuario(U1, `update public.consentimentos set revogado_em = now() where finalidade='telemetria_uso'`);
const antes = await total(U1);
r = await enviar(U1, [ev(50)]);
checar('opt-out revogado => grava 0', Number(r.rows[0].n) === 0 && (await total(U1)) === antes);
await comoUsuario(U1, `insert into public.consentimentos (usuario_id, finalidade, versao_texto, concedido_em) values ('${U1}','telemetria_uso','v2', now() + interval '1 second')`);
r = await enviar(U1, [ev(51)]);
checar("novo consentimento mais recente volta a gravar", Number(r.rows[0].n) === 1, JSON.stringify(r.rows));
checar('consentimento em nome de outro usuário é negado',
  (await erro(() => comoUsuario(U1,
    `insert into public.consentimentos (usuario_id, finalidade, versao_texto) values ('${U2}','comunidade','v1')`))).length > 0);
checar('usuário não vê consentimento alheio', (await comoUsuario(U2, 'select * from public.consentimentos')).rows.length === 0);
checar('não reescreve a finalidade (só revogado_em)',
  (await erro(() => comoUsuario(U1, `update public.consentimentos set finalidade='outra'`))).includes('permission denied'));

console.log('\ncascade');
await db.exec(`delete from auth.users where id='${U2}'`);
checar('excluir a conta apaga a jornada', (await total(U2)) === 0);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
