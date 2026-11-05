/**
 * RPC da assinatura iCal num Postgres local (PGlite). Não fala com produção.
 *     node scripts/teste-agenda-ical-sql.ts
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

const A = '00000000-0000-4000-8000-00000000000a';
const T = '00000000-0000-4000-8000-00000000000b';
const G = '00000000-0000-4000-8000-00000000000c';
const P = '00000000-0000-4000-8000-00000000000d';
const B = '00000000-0000-4000-8000-00000000000e';
const M = '00000000-0000-4000-8000-00000000000f';
const ORG = '10000000-0000-4000-8000-000000000001';
const ORG_M = '10000000-0000-4000-8000-000000000002';

const pg = new PGlite();
await pg.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  insert into auth.users values ('${A}'), ('${T}'), ('${G}'), ('${P}'), ('${B}'), ('${M}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;

  create table public.organizacoes (
    id uuid primary key,
    owner_user_id uuid not null references auth.users (id)
  );
  create table public.organizacao_membros (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizacoes (id),
    user_id uuid not null references auth.users (id),
    papel text not null,
    ativo boolean not null default true
  );
  insert into public.organizacoes values ('${ORG}', '${A}'), ('${ORG_M}', '${M}');
  insert into public.organizacao_membros (org_id, user_id, papel) values
    ('${ORG}', '${A}', 'owner'),
    ('${ORG}', '${T}', 'tecnico'),
    ('${ORG}', '${G}', 'gestor'),
    ('${ORG}', '${M}', 'tecnico'),
    ('${ORG_M}', '${M}', 'owner');
`);

async function como<T>(uid: string | null, papel: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`set role ${papel}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

type Resp = { token?: string; escopo?: string; revogado?: boolean };
async function ativar(uid: string | null, escopo: string | null): Promise<Resp | string> {
  return como(uid, uid === null ? 'anon' : 'authenticated', async () => {
    try {
      const r = escopo === null
        ? await pg.query<{ r: Resp }>('select public.ativar_assinatura_ical(null) r')
        : await pg.query<{ r: Resp }>('select public.ativar_assinatura_ical($1) r', [escopo]);
      return r.rows[0].r;
    } catch (e) {
      return String((e as Error).message);
    }
  });
}
async function revogar(uid: string, escopo: string): Promise<Resp | string> {
  return como(uid, 'authenticated', async () => {
    try {
      const r = await pg.query<{ r: Resp }>('select public.revogar_assinatura_ical($1) r', [escopo]);
      return r.rows[0].r;
    } catch (e) {
      return String((e as Error).message);
    }
  });
}

const MIG = readFileSync('supabase/migrations/20261103140000_agenda_ical_assinatura.sql', 'utf8');
console.log('\n1) aplica e reaplica');
await pg.exec(MIG);
await pg.exec(MIG);
checar('idempotente', true);

console.log('\n2) quem ganha qual link');
const pessoal = await ativar(P, null);
checar('conta pessoal recebe equipe e token de 64 hex',
  typeof pessoal === 'object' && pessoal.escopo === 'equipe' && /^[a-f0-9]{64}$/.test(pessoal.token ?? ''), pessoal);
const pessoal2 = await ativar(P, null);
checar('pedir de novo devolve o mesmo token',
  typeof pessoal === 'object' && typeof pessoal2 === 'object' && pessoal.token === pessoal2.token);
{
  const dono = await pg.query<{ dono_id: string }>(
    `select dono_id::text from public.agenda_ical_assinaturas where titular_id = '${P}' and revogado_em is null`,
  );
  checar('conta pessoal é dona do próprio link', dono.rows[0]?.dono_id === P, dono.rows);
}

const tecEquipe = await ativar(T, 'equipe');
checar('técnico não assina a equipe', typeof tecEquipe === 'string' && tecEquipe.includes('sem_acesso'), tecEquipe);
const tec = await ativar(T, 'propria');
checar('técnico assina a própria agenda', typeof tec === 'object' && tec.escopo === 'propria' && /^[a-f0-9]{64}$/.test(tec.token ?? ''), tec);
{
  const dono = await pg.query<{ dono_id: string }>(
    `select dono_id::text from public.agenda_ical_assinaturas where titular_id = '${T}'`,
  );
  checar('a agenda do técnico nasce no dono da organização', dono.rows[0]?.dono_id === A, dono.rows);
}

const gestor = await ativar(G, null);
checar('gestor no padrão assina a equipe', typeof gestor === 'object' && gestor.escopo === 'equipe', gestor);
const duplo = await ativar(M, null);
checar('quem é dono em uma conta e técnico em outra fica com a de dono', typeof duplo === 'object' && duplo.escopo === 'equipe', duplo);
{
  const dono = await pg.query<{ dono_id: string }>(
    `select dono_id::text from public.agenda_ical_assinaturas where titular_id = '${M}' and revogado_em is null`,
  );
  checar('o dono do link duplo é ele mesmo, não a outra organização', dono.rows[0]?.dono_id === M, dono.rows);
}

checar('sem sessão recusa', String(await ativar(null, null)).includes('sem_sessao') || String(await ativar(null, null)).includes('permission'));
const semSessaoAuth = await como('', 'authenticated', async () => {
  try {
    await pg.query('select public.ativar_assinatura_ical(null)');
    return 'passou';
  } catch (e) {
    return String((e as Error).message);
  }
});
checar('authenticated sem jwt recusa sem_sessao', semSessaoAuth.includes('sem_sessao'), semSessaoAuth);
checar('escopo inválido recusa', String(await ativar(A, 'tudo')).includes('escopo_invalido'));

const antes = typeof tec === 'object' ? tec.token : '';
const morto = await revogar(T, 'propria');
checar('revogar devolve revogado true', typeof morto === 'object' && morto.revogado === true, morto);
const deNovo = await ativar(T, 'propria');
checar('depois de revogar o token é outro',
  typeof deNovo === 'object' && deNovo.token !== antes && /^[a-f0-9]{64}$/.test(deNovo.token ?? ''), deNovo);
{
  const n = await pg.query<{ c: number }>(
    `select count(*)::int c from public.agenda_ical_assinaturas where titular_id = '${T}' and revogado_em is null`,
  );
  checar('só uma assinatura viva por escopo', n.rows[0]?.c === 1, n.rows);
}

console.log('\n3) o token não sai no SELECT');
{
  const colToken = await pg.query<{ ok: boolean }>(
    `select has_column_privilege('authenticated', 'public.agenda_ical_assinaturas', 'token', 'SELECT') ok`,
  );
  checar('authenticated não tem SELECT na coluna token', colToken.rows[0]?.ok === false, colToken.rows);
  const colEscopo = await pg.query<{ ok: boolean }>(
    `select has_column_privilege('authenticated', 'public.agenda_ical_assinaturas', 'escopo', 'SELECT') ok`,
  );
  checar('authenticated lê o próprio escopo', colEscopo.rows[0]?.ok === true, colEscopo.rows);
  const leuToken = await como(A, 'authenticated', async () => erro(pg, 'select token from public.agenda_ical_assinaturas'));
  checar('SELECT token falha', leuToken !== null, leuToken);
  const viu = await como(P, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.agenda_ical_assinaturas')).rows[0].c);
  checar('a pessoa vê a própria linha', viu === 1, viu);
  const alheio = await como(B, 'authenticated', async () =>
    (await pg.query<{ c: number }>('select count(*)::int c from public.agenda_ical_assinaturas')).rows[0].c);
  checar('outra conta não vê a linha', alheio === 0, alheio);
  const ins = await como(A, 'authenticated', async () => erro(pg,
    `insert into public.agenda_ical_assinaturas (titular_id, dono_id, escopo, token) values ('${A}', '${A}', 'propria', '${'c'.repeat(64)}')`));
  checar('authenticated não insere direto', ins !== null, ins);
  const anonRpc = await como(null, 'anon', async () => erro(pg, 'select public.ativar_assinatura_ical(null)'));
  checar('anon não executa o RPC', anonRpc !== null, anonRpc);
}

console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
