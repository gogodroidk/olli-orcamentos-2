/**
 * Migration 20261002153217 (QR do equipamento) num Postgres de verdade (PGlite).
 *
 *     node scripts/teste-qr-equipamento-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - aplica e reaplica (idempotente);
 *  - `ordens_servico.asset_id` existe e é opcional;
 *  - `pedidos_orcamento_qr`: CHECK de nome/telefone/mensagem; RLS por dono (o dono
 *    lê os seus, outro tenant não vê nada); authenticated NÃO insere, NÃO apaga e só
 *    altera `atendido_em` (grant por coluna); anon não lê;
 *  - `resumo_manutencao_equipamento`: última = OS concluída mais recente (direta ou
 *    PMOC); próxima = a data mais cedo de hoje em diante entre OS aberta agendada e
 *    vencimento PMOC não concluído; ignora lixeira, OS de outro equipamento e OS de
 *    OUTRO tenant que aponta para o mesmo asset_id; só service_role executa.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let falhas = 0;
let passes = 0;
function checar(nome: string, cond: boolean, detalhe?: unknown): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe === undefined ? '' : `\n        ${JSON.stringify(detalhe)}`}`);
  }
}
async function falha(pg: PGlite, sql: string): Promise<string | null> {
  try {
    await pg.exec(sql);
    return null;
  } catch (e) {
    return String((e as Error).message);
  }
}

const MIGRATION = readFileSync('supabase/migrations/20261002153217_qr_equipamento_atendimento.sql', 'utf8');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

const pg = new PGlite();
await pg.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${A}'), ('${B}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.assets (id text primary key, user_id uuid not null, qr_token text);
  create table public.ordens_servico (
    id text primary key, user_id uuid not null, status text not null default 'aberta',
    concluido_em timestamptz, atualizado_em timestamptz not null default now(),
    data_agendada timestamptz, excluido_em timestamptz
  );
  create table public.pmoc_ordens_geradas (
    id text primary key, user_id uuid not null, plano_id text not null, asset_id text not null,
    periodo text not null, periodicidade_id text not null default '', ordem_id text not null,
    vencimento date, excluido_em timestamptz
  );
`);

console.log('\n1) aplica e reaplica');
await pg.exec(MIGRATION);
await pg.exec(MIGRATION);
checar('idempotente', true);
{
  const r = await pg.query<{ c: number }>(
    `select count(*)::int c from information_schema.columns where table_name='ordens_servico' and column_name='asset_id' and is_nullable='YES'`,
  );
  checar('ordens_servico.asset_id opcional', r.rows[0].c === 1);
}

console.log('\n2) pedidos_orcamento_qr: CHECKs');
const ins = (nome: string, tel: string, msg: string | null = null, user = A) =>
  `insert into public.pedidos_orcamento_qr (user_id, asset_id, nome, telefone, mensagem) values ('${user}', 'eq-1', '${nome}', '${tel}', ${msg === null ? 'null' : `'${msg}'`})`;
checar('pedido válido grava', (await falha(pg, ins('Ana Lima', '5511987654321'))) === null);
checar('fixo com 12 dígitos grava', (await falha(pg, ins('Bia', '551134567890'))) === null);
checar('nome de 1 letra recusado', (await falha(pg, ins(' A ', '5511987654321'))) !== null);
checar('telefone sem 55 recusado', (await falha(pg, ins('Ana', '11987654321'))) !== null);
checar('telefone com letra recusado', (await falha(pg, ins('Ana', '55119876x4321'))) !== null);
checar('mensagem > 500 recusada', (await falha(pg, ins('Ana', '5511987654321', 'x'.repeat(501)))) !== null);
await pg.exec(ins('Carlos do B', '5521987654321', 'oi', B));

console.log('\n3) pedidos_orcamento_qr: RLS e grants');
async function comoUsuario<T>(uid: string | null, papel: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`set role ${papel}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
{
  const nA = await comoUsuario(A, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.pedidos_orcamento_qr')).rows[0].c);
  checar('dono A vê só os 2 dele', nA === 2, nA);
  const nB = await comoUsuario(B, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.pedidos_orcamento_qr')).rows[0].c);
  checar('dono B vê só o 1 dele', nB === 1, nB);
  const erroAnon = await comoUsuario(null, 'anon', async () => falha(pg, 'select * from public.pedidos_orcamento_qr'));
  checar('anon não lê', erroAnon !== null);
  const erroInsert = await comoUsuario(A, 'authenticated', async () => falha(pg, ins('Intruso', '5511987654321')));
  checar('authenticated não insere (só o worker)', erroInsert !== null);
  const erroDelete = await comoUsuario(A, 'authenticated', async () => falha(pg, 'delete from public.pedidos_orcamento_qr'));
  checar('authenticated não apaga', erroDelete !== null);
  const erroNome = await comoUsuario(A, 'authenticated', async () =>
    falha(pg, `update public.pedidos_orcamento_qr set nome = 'Trocado'`));
  checar('authenticated não reescreve o nome', erroNome !== null);
  await comoUsuario(A, 'authenticated', async () =>
    pg.exec(`update public.pedidos_orcamento_qr set atendido_em = now()`));
  const r = await pg.query<{ user_id: string; atendido: boolean }>(
    'select user_id, atendido_em is not null atendido from public.pedidos_orcamento_qr order by user_id',
  );
  checar('A marcou os DELE como atendidos; o de B ficou intocado',
    r.rows.filter((x) => x.user_id === A).every((x) => x.atendido) && r.rows.filter((x) => x.user_id === B).every((x) => !x.atendido), r.rows);
}

console.log('\n4) resumo_manutencao_equipamento');
const hoje = (await pg.query<{ d: string }>(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') d`)).rows[0].d;
const dia = (delta: number) => (new Date(Date.parse(`${hoje}T12:00:00Z`) + delta * 86400_000)).toISOString().slice(0, 10);
await pg.exec(`
  insert into public.assets values ('eq-1', '${A}', 'tok1'), ('eq-2', '${A}', 'tok2'), ('eq-vazio', '${A}', 'tok3');
  alter table public.ordens_servico add column if not exists asset_id text;
  insert into public.ordens_servico (id, user_id, status, concluido_em, asset_id, data_agendada, excluido_em) values
    ('os-direta-velha', '${A}', 'concluida', '${dia(-60)}T15:00:00Z', 'eq-1', null, null),
    ('os-pmoc-concl',   '${A}', 'concluida', '${dia(-10)}T15:00:00Z', null, null, null),
    ('os-lixo',         '${A}', 'concluida', '${dia(-1)}T15:00:00Z', 'eq-1', null, now()),
    ('os-outro-eq',     '${A}', 'concluida', '${dia(-2)}T15:00:00Z', 'eq-2', null, null),
    ('os-outro-tenant', '${B}', 'concluida', '${dia(-3)}T15:00:00Z', 'eq-1', null, null),
    ('os-agendada',     '${A}', 'agendada',  null, 'eq-1', '${dia(20)}T13:00:00Z', null),
    ('os-agendada-velha','${A}', 'agendada', null, 'eq-1', '${dia(-5)}T13:00:00Z', null),
    ('os-pmoc-futura',  '${A}', 'aberta',    null, null, null, null),
    ('os-pmoc-cancel',  '${A}', 'cancelada', null, null, null, null);
  insert into public.pmoc_ordens_geradas (id, user_id, plano_id, asset_id, periodo, ordem_id, vencimento) values
    ('g1', '${A}', 'pl', 'eq-1', 'p1', 'os-pmoc-concl', '${dia(-12)}'),
    ('g2', '${A}', 'pl', 'eq-1', 'p2', 'os-pmoc-futura', '${dia(9)}'),
    ('g3', '${A}', 'pl', 'eq-1', 'p3', 'os-pmoc-cancel', '${dia(3)}'),
    ('g4', '${B}', 'pl', 'eq-1', 'p4', 'os-outro-tenant', '${dia(1)}');
`);
type Resumo = { ultima_manutencao: string | null; proxima_manutencao: string | null; proxima_origem: string | null };
async function resumo(asset: string): Promise<Resumo> {
  await pg.exec('set role service_role');
  try {
    const r = await pg.query<Resumo>(`select ultima_manutencao::text, proxima_manutencao::text, proxima_origem from public.resumo_manutencao_equipamento($1)`, [asset]);
    return r.rows[0];
  } finally {
    await pg.exec('reset role');
  }
}
{
  const r = await resumo('eq-1');
  checar('última = OS PMOC concluída há 10 dias (lixeira, outro equipamento e outro tenant fora)',
    (r.ultima_manutencao ?? '').startsWith(dia(-10)), r);
  checar('próxima = vencimento PMOC em 9 dias (cancelada e passado fora; agendada em 20 é depois)',
    r.proxima_manutencao === dia(9) && r.proxima_origem === 'pmoc', r);
}
{
  await pg.exec(`update public.ordens_servico set data_agendada = '${dia(2)}T13:00:00Z' where id = 'os-agendada'`);
  const r = await resumo('eq-1');
  checar('OS agendada mais cedo vira a próxima (origem agendada)', r.proxima_manutencao === dia(2) && r.proxima_origem === 'agendada', r);
}
{
  const r = await resumo('eq-vazio');
  checar('equipamento sem histórico: tudo nulo (sem inventar data)',
    r.ultima_manutencao === null && r.proxima_manutencao === null && r.proxima_origem === null, r);
  const inexistente = await resumo('nao-existe');
  checar('asset inexistente: tudo nulo', inexistente.ultima_manutencao === null && inexistente.proxima_manutencao === null);
}
{
  const anon = await comoUsuario(null, 'anon', async () => falha(pg, `select * from public.resumo_manutencao_equipamento('eq-1')`));
  const auth = await comoUsuario(A, 'authenticated', async () => falha(pg, `select * from public.resumo_manutencao_equipamento('eq-1')`));
  checar('anon e authenticated NÃO executam o resumo (só service_role)', anon !== null && auth !== null);
}

await pg.close();
console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
