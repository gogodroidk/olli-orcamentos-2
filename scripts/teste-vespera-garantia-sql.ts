/**
 * Migrations da Onda I3 (confirmação de véspera + garantia) num Postgres de verdade (PGlite).
 *
 *     node scripts/teste-vespera-garantia-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * 20261003103000_agendamentos_confirmacao:
 *  - aplica e reaplica (idempotente);
 *  - authenticated NÃO insere/altera direto e NÃO lê a coluna `token`; lê o status
 *    só do próprio tenant (dono) e do dono visível (equipe);
 *  - RPC: sem sessão / sem acesso / Grátis / visita passada → recusa com o código;
 *    pedir de novo no mesmo horário devolve o MESMO token; horário novo gera token
 *    novo e zera a resposta; o técnico da equipe pede em nome do dono.
 * 20261003103100_garantia_os_qr:
 *  - colunas da OS opcionais; motivo do pedido com default 'orcamento' e CHECK;
 *  - garantia_vigente_equipamento: a maior garantia vigente das OS concluídas do
 *    equipamento (direta ou PMOC), do MESMO dono; ignora vencida, lixeira, aberta e
 *    outro tenant; só service_role executa.
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
async function erro(pg: PGlite, sql: string): Promise<string | null> {
  try {
    await pg.exec(sql);
    return null;
  } catch (e) {
    return String((e as Error).message);
  }
}

const MIG_CONF = readFileSync('supabase/migrations/20261003103000_agendamentos_confirmacao.sql', 'utf8');
const MIG_GAR = readFileSync('supabase/migrations/20261003103100_garantia_os_qr.sql', 'utf8');
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const T = '00000000-0000-4000-8000-00000000000c'; // técnico da equipe de A
const G = '00000000-0000-4000-8000-00000000000d'; // dono no Grátis

const pg = new PGlite();
await pg.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${A}'), ('${B}'), ('${T}'), ('${G}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- Equipe: T enxerga o tenant de A (o mesmo contrato de private.donos_visiveis).
  create function public.donos_visiveis() returns setof uuid language sql stable as $$
    select auth.uid()
    union
    select '${A}'::uuid where auth.uid() = '${T}'::uuid
  $$;
  grant execute on function public.donos_visiveis() to authenticated, service_role;
  create function public.plano_comercial_para_usuario(p_user_id uuid) returns text language sql stable as $$
    select case when p_user_id = '${G}'::uuid then 'gratis' else 'pro' end
  $$;

  create table public.assets (id text primary key, user_id uuid not null);
  create table public.ordens_servico (
    id text primary key, user_id uuid not null, status text not null default 'aberta',
    concluido_em timestamptz, excluido_em timestamptz, asset_id text
  );
  create table public.pmoc_ordens_geradas (
    id text primary key, user_id uuid not null, asset_id text not null, ordem_id text not null, excluido_em timestamptz
  );
  create table public.pedidos_orcamento_qr (
    id uuid primary key default gen_random_uuid(), user_id uuid not null, asset_id text not null,
    nome text not null, telefone text not null, mensagem text, criado_em timestamptz not null default now()
  );
`);

async function como<T>(uid: string | null, papel: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`set role ${papel}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
type Resp = { token: string; status: string; expira_em: string; respondido_em: string | null };
async function pedir(uid: string | null, dono: string, ag: string, dia: string, inicio: string, servico = 'Limpeza'): Promise<Resp | string> {
  return como(uid, 'authenticated', async () => {
    try {
      const r = await pg.query<{ r: Resp }>(
        'select public.pedir_confirmacao_visita($1, $2, $3::date, $4::timestamptz, $5) r',
        [dono, ag, dia, inicio, servico],
      );
      return r.rows[0].r;
    } catch (e) {
      return String((e as Error).message);
    }
  });
}
const em = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();

console.log('\n1) confirmação: aplica e reaplica');
await pg.exec(MIG_CONF);
await pg.exec(MIG_CONF);
checar('idempotente', true);

console.log('\n2) RPC pedir_confirmacao_visita');
const INICIO_1 = em(20);
const r1 = await pedir(A, A, 'ag-1', '2026-10-02', INICIO_1);
checar('dono Pro recebe token de 64 hex e status pendente',
  typeof r1 === 'object' && /^[a-f0-9]{64}$/.test(r1.token) && r1.status === 'pendente', r1);
const r2 = await pedir(A, A, 'ag-1', '2026-10-02', INICIO_1);
checar('reenviar no mesmo horário devolve o MESMO token', typeof r1 === 'object' && typeof r2 === 'object' && r1.token === r2.token);
// O cliente responde (como o worker faria).
await pg.exec(`update public.agendamentos_confirmacao set status = 'confirmada', respondido_em = now() where agendamento_id = 'ag-1'`);
const r3 = await pedir(A, A, 'ag-1', '2026-10-02', em(22));
checar('horário mudou: token novo e resposta zerada',
  typeof r3 === 'object' && typeof r1 === 'object' && r3.token !== r1.token && r3.status === 'pendente' && r3.respondido_em === null, r3);
checar('sem sessão recusa', String(await pedir(null, A, 'ag-2', '2026-10-02', em(20))).includes('sem_sessao'));
checar('outro tenant recusa (B pedindo pelo A)', String(await pedir(B, A, 'ag-2', '2026-10-02', em(20))).includes('sem_acesso'));
const rt = await pedir(T, A, 'ag-3', '2026-10-02', em(20));
checar('técnico da equipe pede em nome do dono', typeof rt === 'object' && rt.status === 'pendente', rt);
{
  const dono = await pg.query<{ user_id: string }>(`select user_id from public.agendamentos_confirmacao where agendamento_id = 'ag-3'`);
  checar('a linha do técnico nasce no tenant do DONO', dono.rows[0]?.user_id === A, dono.rows);
}
checar('Grátis recusa (recurso do Pro, decidido no servidor)', String(await pedir(G, G, 'ag-4', '2026-10-02', em(20))).includes('recurso_pro'));
checar('visita passada recusa', String(await pedir(A, A, 'ag-5', '2026-10-01', em(-5))).includes('visita_passada'));
checar('visita a mais de 60 dias recusa', String(await pedir(A, A, 'ag-6', '2027-01-01', em(24 * 70))).includes('visita_distante'));
checar('agendamento vazio recusa', String(await pedir(A, A, '  ', '2026-10-02', em(20))).includes('dados_incompletos'));
{
  const r = await pg.query<{ e: string }>(`select expira_em::text e from public.agendamentos_confirmacao where agendamento_id = 'ag-3'`);
  checar('expira depois do início da visita', Date.parse(r.rows[0].e) > Date.now() + 20 * 3_600_000);
}

console.log('\n3) RLS e grants');
{
  const nA = await como(A, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.agendamentos_confirmacao')).rows[0].c);
  checar('dono A lê as 2 dele', nA === 2, nA);
  const nB = await como(B, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.agendamentos_confirmacao')).rows[0].c);
  checar('B não vê nada de A', nB === 0, nB);
  const nT = await como(T, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.agendamentos_confirmacao')).rows[0].c);
  checar('técnico vê as do dono', nT === 2, nT);
  const tok = await como(A, 'authenticated', async () => erro(pg, 'select token from public.agendamentos_confirmacao'));
  checar('authenticated NÃO lê o token', tok !== null);
  const ins = await como(A, 'authenticated', async () => erro(pg,
    `insert into public.agendamentos_confirmacao (user_id, agendamento_id, ocorrencia_dia, inicio, token, expira_em)
     values ('${A}', 'x', '2026-10-02', now(), '${'b'.repeat(64)}', now())`));
  checar('authenticated NÃO insere direto', ins !== null);
  const upd = await como(A, 'authenticated', async () => erro(pg, `update public.agendamentos_confirmacao set status = 'confirmada', respondido_em = now()`));
  checar('authenticated NÃO responde no lugar do cliente', upd !== null);
  const anon = await como(null, 'anon', async () => erro(pg, 'select status from public.agendamentos_confirmacao'));
  checar('anon não lê', anon !== null);
  const anonRpc = await como(null, 'anon', async () => erro(pg, `select public.pedir_confirmacao_visita('${A}', 'z', '2026-10-02', now(), null)`));
  checar('anon não executa o RPC', anonRpc !== null);
}
{
  const ck = await erro(pg, `update public.agendamentos_confirmacao set status = 'confirmada', respondido_em = null`);
  checar('CHECK: confirmada sem hora de resposta é recusada', ck !== null);
}

console.log('\n4) garantia: aplica e reaplica');
await pg.exec(MIG_GAR);
await pg.exec(MIG_GAR);
checar('idempotente', true);
{
  const r = await pg.query<{ c: number }>(
    `select count(*)::int c from information_schema.columns where table_name = 'ordens_servico' and column_name in ('garantia', 'garantia_ate', 'garantia_de_os_id') and is_nullable = 'YES'`,
  );
  checar('3 colunas de garantia, opcionais', r.rows[0].c === 3, r.rows);
  await pg.exec(`insert into public.pedidos_orcamento_qr (user_id, asset_id, nome, telefone) values ('${A}', 'eq-1', 'Ana', '5511987654321')`);
  const m = await pg.query<{ motivo: string }>(`select motivo from public.pedidos_orcamento_qr limit 1`);
  checar('pedido antigo vira motivo=orcamento', m.rows[0].motivo === 'orcamento');
  checar('motivo fora da lista é recusado', (await erro(pg, `update public.pedidos_orcamento_qr set motivo = 'outro'`)) !== null);
  checar('garantia > 200 chars é recusada', (await erro(pg, `insert into public.ordens_servico (id, user_id, garantia) values ('os-x', '${A}', '${'x'.repeat(201)}')`)) !== null);
}

console.log('\n5) garantia_vigente_equipamento');
const hoje = (await pg.query<{ d: string }>(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') d`)).rows[0].d;
const dia = (delta: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
await pg.exec(`
  insert into public.assets values ('eq-1', '${A}'), ('eq-2', '${A}'), ('eq-3', '${A}');
  insert into public.ordens_servico (id, user_id, status, asset_id, garantia_ate, excluido_em) values
    ('os-vigente',  '${A}', 'concluida', 'eq-1', '${dia(30)}', null),
    ('os-maior',    '${A}', 'concluida', null,   '${dia(80)}', null),
    ('os-vencida',  '${A}', 'concluida', 'eq-1', '${dia(-1)}', null),
    ('os-lixo',     '${A}', 'concluida', 'eq-1', '${dia(400)}', now()),
    ('os-aberta',   '${A}', 'aberta',    'eq-1', '${dia(300)}', null),
    ('os-tenantB',  '${B}', 'concluida', 'eq-1', '${dia(500)}', null),
    ('os-eq2-venc', '${A}', 'concluida', 'eq-2', '${dia(-10)}', null);
  insert into public.pmoc_ordens_geradas values ('g1', '${A}', 'eq-1', 'os-maior', null);
`);
async function vigente(asset: string): Promise<string | null> {
  const r = await pg.query<{ d: string | null }>(`select to_char(public.garantia_vigente_equipamento($1), 'YYYY-MM-DD') d`, [asset]);
  return r.rows[0].d;
}
checar('a maior vigente (OS PMOC do equipamento conta)', (await vigente('eq-1')) === dia(80), await vigente('eq-1'));
checar('só vencida → null (sem garantia)', (await vigente('eq-2')) === null);
checar('sem OS → null', (await vigente('eq-3')) === null);
checar('equipamento inexistente → null', (await vigente('nao-existe')) === null);
{
  const e1 = await como(A, 'authenticated', async () => erro(pg, `select public.garantia_vigente_equipamento('eq-1')`));
  checar('authenticated não executa (só service_role)', e1 !== null);
  const e2 = await como(null, 'anon', async () => erro(pg, `select public.garantia_vigente_equipamento('eq-1')`));
  checar('anon não executa', e2 !== null);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
