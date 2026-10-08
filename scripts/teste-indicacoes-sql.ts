/**
 * Indicação — a migration `20261010100000_indicacoes.sql` rodando de verdade num
 * Postgres (PGlite, em memória), com dados sintéticos.
 *
 *     node scripts/teste-indicacoes-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Prende: código único e estável; vínculo (auto-indicação, conta antiga, ciclo,
 * duplicado, código ruim); recompensa só no 1º orçamento REAL (exemplo sem edição,
 * preço 0 e lixeira não contam); desligado (0) não decide nada; dois lados creditados
 * uma vez; idempotência; contas internas; teto de 5; permissões (só service_role).
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync('supabase/migrations/20261010100000_indicacoes.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), deleted_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.funil_exclusoes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade, email text, motivo text not null default 'teste'
);
create table public.ativacao_exemplos_ref (vertical text not null, nome text not null, preco numeric(12,2) not null, primary key (vertical, nome));
insert into public.ativacao_exemplos_ref values ('geral', 'Visita técnica e avaliação', 60.00);
create table public.orcamentos (id text primary key, user_id uuid, dados jsonb, criado_em timestamptz not null default now(), excluido_em timestamptz);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null, origem text not null check (origem in ('stripe','pix','iap','promo','referral','mesada','consumo','ajuste')),
  ref text, descricao text not null default '', criado_em timestamptz not null default now()
);
create unique index credit_ledger_origem_ref_uidx on public.credit_ledger (origem, ref) where ref is not null;
`;

const db = new PGlite();
await db.exec(ESQUEMA);
await db.exec(MIGRATION);
await db.exec(MIGRATION); // idempotente: reaplicar não pode quebrar

let seq = 0;
const uid = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
async function conta(horasAtras = 1, email?: string): Promise<string> {
  const id = uid();
  await db.query(
    `insert into auth.users (id, email, created_at) values ($1, $2, now() - ($3 || ' hours')::interval)`,
    [id, email ?? `${id}@t.local`, String(horasAtras)],
  );
  return id;
}
async function um<T = unknown>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p);
  return Object.values(r.rows[0] ?? {})[0] as T;
}
async function orc(user: string, itens: unknown, extra = ''): Promise<void> {
  await db.query(
    `insert into public.orcamentos (id, user_id, dados, excluido_em) values ($1, $2, $3::jsonb, ${extra || 'null'})`,
    [`o${++seq}`, user, JSON.stringify({ itens })],
  );
}
const REAL = [{ nome: 'Troca de resistência', preco: 150 }];
const codigoDe = (u: string) => um<string>('select public.indicacao_codigo($1)', [u]);
const vincular = (u: string, c: string) => um<string>('select public.indicacao_vincular($1,$2)', [u, c]);
const recompensar = (u: string, n: number) => um<{ status: string; motivo?: string }>('select public.indicacao_recompensar($1,$2)', [u, n]);
const saldo = (u: string) => um<number>('select coalesce(sum(delta),0)::int from public.credit_ledger where user_id=$1', [u]);

console.log('código');
const A = await conta(100);
const cA = await codigoDe(A);
checar('código tem 6 chars do alfabeto sem ambíguos', /^[A-HJ-NP-Z2-9]{6}$/.test(cA), cA);
checar('estável: 2ª chamada devolve o mesmo', (await codigoDe(A)) === cA);
const B2 = await conta(100);
checar('usuário diferente, código diferente', (await codigoDe(B2)) !== cA);
let lancou = false;
try { await codigoDe(uid()); } catch { lancou = true; }
checar('usuário inexistente falha (não cria órfão)', lancou);

console.log('vínculo');
const B = await conta(2);
checar('código ruim', (await vincular(B, 'x')) === 'codigo_invalido');
checar('código inexistente', (await vincular(B, 'AAAAAA')) === 'codigo_invalido');
checar('auto-indicação', (await vincular(A, cA)) === 'auto_indicacao');
const velha = await conta(200);
checar('conta com mais de 7 dias não vincula', (await vincular(velha, cA)) === 'conta_antiga');
checar('minúsculo e espaço são aceitos', (await vincular(B, ` ${cA.toLowerCase()} `)) === 'vinculado');
checar('2ª vez = ja_vinculado', (await vincular(B, cA)) === 'ja_vinculado');
const X = await conta(1);
const Y = await conta(1);
const cX = await codigoDe(X);
const cY = await codigoDe(Y);
await vincular(Y, cX);
checar('ciclo X→Y e Y→X bloqueado', (await vincular(X, cY)) === 'ciclo');
const cB = await codigoDe(B);
checar('indicado já vinculado não troca de indicador', (await vincular(B, cX)) === 'ja_vinculado');
checar('código do próprio indicado: auto_indicacao', (await vincular(B, cB)) === 'auto_indicacao');

console.log('recompensa');
checar('créditos 0 = desligado, não decide', (await recompensar(B, 0)).status === 'desligado');
checar('sem orçamento = sem_orcamento_real', (await recompensar(B, 10)).status === 'sem_orcamento_real');
await orc(B, [{ nome: 'Visita técnica e avaliação', preco: 60 }]);
checar('só exemplo sem edição não conta', (await recompensar(B, 10)).status === 'sem_orcamento_real');
await orc(B, [{ nome: 'Serviço', preco: 0 }]);
checar('preço zero não conta', (await recompensar(B, 10)).status === 'sem_orcamento_real');
await orc(B, REAL, 'now()');
checar('orçamento na lixeira não conta', (await recompensar(B, 10)).status === 'sem_orcamento_real');
checar('nada foi creditado até aqui', (await saldo(A)) === 0 && (await saldo(B)) === 0);
await orc(B, REAL);
const r1 = await recompensar(B, 10);
checar('1º orçamento real recompensa', r1.status === 'recompensado', JSON.stringify(r1));
checar('indicador e indicado ganham X cada', (await saldo(A)) === 10 && (await saldo(B)) === 10);
checar('2ª chamada não paga de novo', (await recompensar(B, 10)).status === 'ja_decidido' && (await saldo(A)) === 10);
checar('estado e datas gravados', (await um<string>(`select estado from public.indicacoes where indicado_id=$1`, [B])) === 'recompensado'
  && (await um<boolean>(`select recompensado_em is not null and orcou_em is not null from public.indicacoes where indicado_id=$1`, [B])));
checar('sem indicação = sem_indicacao', (await recompensar(A, 10)).status === 'sem_indicacao');
checar('ledger: 1 lançamento por lado', (await um<number>(`select count(*)::int from public.credit_ledger where origem='referral'`)) === 2);

console.log('contas internas');
const I = await conta(1, 'interna@olli.local');
await db.query(`insert into public.funil_exclusoes (email) values ('interna@olli.local')`);
await vincular(I, cA);
await orc(I, REAL);
const rI = await recompensar(I, 10);
checar('indicado em funil_exclusoes (por e-mail) não é pago', rI.status === 'sem_recompensa' && rI.motivo === 'conta_interna', JSON.stringify(rI));
const Int = await conta(100);
await db.query(`insert into public.funil_exclusoes (user_id) values ($1)`, [Int]);
const cInt = await codigoDe(Int);
const D = await conta(1);
await vincular(D, cInt);
await orc(D, REAL);
checar('indicador em funil_exclusoes (por id) não paga', (await recompensar(D, 10)).motivo === 'conta_interna');
checar('conta interna não ganhou nada', (await saldo(Int)) === 0 && (await saldo(D)) === 0);

console.log('teto de 5 por indicador');
const T = await conta(100);
const cT = await codigoDe(T);
const status: string[] = [];
for (let i = 0; i < 7; i++) {
  const x = await conta(1);
  await vincular(x, cT);
  await orc(x, REAL);
  const r = await recompensar(x, 10);
  status.push(r.status === 'sem_recompensa' ? `sem:${r.motivo}` : r.status);
}
checar('5 pagam, o 6º e o 7º batem no teto', status.filter((s) => s === 'recompensado').length === 5 && status.slice(5).every((s) => s === 'sem:teto_indicador'), status.join(','));
checar('indicador recebeu exatamente 5 × 10', (await saldo(T)) === 50);

console.log('permissões');
async function como(papel: string, sql: string): Promise<boolean> {
  await db.exec(`set role ${papel}`);
  try { await db.query(sql); return true; } catch { return false; } finally { await db.exec('reset role'); }
}
checar('anon não executa RPC', !(await como('anon', `select public.indicacao_codigo('${A}')`)));
checar('authenticated não executa RPC de recompensa', !(await como('authenticated', `select public.indicacao_recompensar('${B}', 10)`)));
checar('authenticated não executa vincular', !(await como('authenticated', `select public.indicacao_vincular('${B}', '${cA}')`)));
checar('service_role executa', await como('service_role', `select public.indicacao_resumo('${A}')`));
checar('authenticated não escreve em indicacoes', !(await como('authenticated', `insert into public.indicacoes (indicador_id, indicado_id, codigo) values ('${A}','${uid()}','AAAAAA')`)));
checar('authenticated não lê indicacoes direto (sem PII do indicado)', !(await como('authenticated', `select * from public.indicacoes`)));
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}'`);
const meus = (await db.query(`select count(*)::int as n from public.indicacao_codigos`)).rows[0] as { n: number };
await db.exec('reset role');
checar('indicador lê só o próprio código (RLS)', meus.n === 1, `viu ${meus.n}`);
const z = await conta(1);
await vincular(z, cA);
await orc(z, [{ nome: 'x', preco: 'abc' }]);
checar('preço lixo ("abc") não derruba a recompensa', (await recompensar(z, 10)).status === 'sem_orcamento_real');

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
