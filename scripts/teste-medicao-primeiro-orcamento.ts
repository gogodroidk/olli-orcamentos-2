/**
 * Medição do 1º orçamento (migration 20261007130000_medicao_primeiro_orcamento.sql).
 *
 *     node scripts/teste-medicao-primeiro-orcamento.ts
 *
 * 1) A tabela de exemplos do SQL é IDÊNTICA a EXEMPLOS_POR_VERTICAL (src/services/ativacao.ts): se alguém mudar
 *    um exemplo no app e esquecer o SQL, o teste falha.
 * 2) O SQL REAL roda num Postgres de verdade (PGlite) — e as consultas rodam COMO `service_role` (SET ROLE), sem
 *    superuser e SEM grant em auth.users, como em produção. Foi isso que faltou na 1ª versão (views lendo auth.users
 *    "passavam" como superuser e dariam `permission denied` no PostgREST). O teste prova também que ler auth.users
 *    direto como service_role FALHA — se um dia alguém trocar a função por uma view `security_invoker`, o teste cai.
 * 3) Regras: exemplo sem edição e orçamento SEM itens não são "real"; só vale quem tem ≥ 48 h; conta interna/apagada
 *    fica fora; preço torto não derruba; coorte = semana de São Paulo (domingo 23:30 em SP é da semana anterior).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { EXEMPLOS_POR_VERTICAL } from '../src/services/ativacao.ts';

let checks = 0;
const igual = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const SQL = readFileSync(new URL('../supabase/migrations/20261007130000_medicao_primeiro_orcamento.sql', import.meta.url), 'utf8')
  .split(String.fromCharCode(13)).join('');

// ─── 1) SQL × constante do app ────────────────────────────────────────────────
const bloco = SQL.slice(SQL.indexOf('insert into public.ativacao_exemplos_ref'), SQL.indexOf('on conflict (vertical, nome)'));
const noSql = [...bloco.matchAll(/\('([a-z_]+)', '((?:[^']|'')*)', ([0-9.]+)\)/g)].map((m) => `${m[1]}|${m[2].replace(/''/g, "'")}|${Number(m[3]).toFixed(2)}`).sort();
const noApp = Object.entries(EXEMPLOS_POR_VERTICAL)
  .flatMap(([v, e]) => e.itens.map((i) => `${v}|${i.nome}|${Number(i.valorReferencia).toFixed(2)}`))
  .sort();
igual(noSql, noApp, 'os exemplos do SQL são os mesmos de EXEMPLOS_POR_VERTICAL (nome e preço)');
assert.ok(noApp.length >= 20, 'sanidade: leu todos os exemplos');

// ─── 2) Postgres real, consultas como service_role ───────────────────────────
const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null, deleted_at timestamptz);
  create table public.funil_exclusoes (user_id uuid, email text);
  create table public.orcamentos (id serial primary key, user_id uuid not null, criado_em timestamptz not null, status text not null default 'rascunho', dados jsonb);
  -- Como em produção: service_role NÃO lê auth.users. Nada é concedido a ele nas tabelas de apoio além do que a migration der.
  revoke all on all tables in schema auth from public, anon, authenticated, service_role;
  revoke all on all tables in schema public from public, anon, authenticated, service_role;
  grant usage on schema auth to service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
await db.exec(SQL);
await db.exec(SQL); // idempotente
checks++;

const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const horas = (h: number) => `now() - interval '${h} hours'`;
async function conta(email: string, idadeHoras: number, apagada = false): Promise<string> {
  return (await q(`insert into auth.users (email, created_at ${apagada ? ', deleted_at' : ''}) values ($1, ${horas(idadeHoras)} ${apagada ? ', now()' : ''}) returning id`, [email]))[0].id;
}
async function contaEm(email: string, iso: string): Promise<string> {
  return (await q(`insert into auth.users (email, created_at) values ($1, $2::timestamptz) returning id`, [email, iso]))[0].id;
}
const ex = { nome: 'Disjuntor 20 A', preco: 35 }; // do exemplo 'eletrica'
const ex2 = { nome: 'Instalação de tomada (mão de obra)', preco: 60 };
async function orc(user: string, depoisDoCadastroSeg: number, cadastroHorasAtras: number, itens: unknown[], status = 'rascunho') {
  await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, ${horas(cadastroHorasAtras)} + ($2 || ' seconds')::interval, $3, $4::jsonb)`, [user, String(depoisDoCadastroSeg), status, JSON.stringify({ itens })]);
}

const A = await conta('a@x.com', 100);   // exemplo sem edição, 60 s, só rascunho
await orc(A, 60, 100, [ex, ex2]);
const B = await conta('b@x.com', 100);   // real (preço editado), 20 min, enviado
await orc(B, 1200, 100, [{ ...ex, preco: 40 }], 'enviado');
const C = await conta('c@x.com', 100);   // exemplo em 60 s, REAL só 1 dia depois
await orc(C, 60, 100, [ex]);
await orc(C, 86400, 100, [{ nome: 'Serviço meu', preco: 500 }]);
const D = await conta('d@x.com', 100);   // orçou depois de 3 dias: fora das 48 h
await orc(D, 3 * 86400, 100, [{ nome: 'Serviço meu', preco: 500 }]);
const E = await conta('e@x.com', 100);   // nunca orçou
const F = await conta('f@x.com', 10);    // 10 h de vida: ainda não elegível
await orc(F, 120, 10, [{ nome: 'Serviço meu', preco: 500 }]);
const G = await conta('interna@x.com', 100); await orc(G, 60, 100, [{ nome: 'x', preco: 1 }]);
await q(`insert into public.funil_exclusoes (user_id) values ($1)`, [G]);
const H = await conta('Dono@X.com', 100); await orc(H, 60, 100, [{ nome: 'x', preco: 1 }]);
await q(`insert into public.funil_exclusoes (email) values ('dono@x.com')`);
const I = await conta('apagada@x.com', 100, true); await orc(I, 60, 100, [{ nome: 'x', preco: 1 }]);
const J = await conta('j@x.com', 100);   // preço não numérico NÃO derruba; nome do exemplo mas preço torto = real
await orc(J, 300, 100, [{ nome: 'Disjuntor 20 A', preco: 'abc' }]);
const K = await conta('k@x.com', 100);   // orçamento com dados vazio ({}): NÃO é real
await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, ${horas(100)} + interval '30 seconds', 'rascunho', '{}'::jsonb)`, [K]);
const L = await conta('l@x.com', 100);   // dados NULL e itens [] : NÃO são reais
await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, ${horas(100)} + interval '40 seconds', 'rascunho', null), ($1, ${horas(100)} + interval '50 seconds', 'rascunho', '{"itens":[]}'::jsonb)`, [L]);
// Coorte em São Paulo: domingo 13/09/2026 23:30 (SP) = segunda 14/09 02:30 UTC → semana de 07/09 em SP (em UTC seria 14/09).
const S = await contaEm('s@x.com', '2026-09-14T02:30:00Z');
await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, '2026-09-14T02:40:00Z', 'rascunho', $2::jsonb)`, [S, JSON.stringify({ itens: [{ nome: 'Serviço meu', preco: 500 }] })]);
const M = await contaEm('m@x.com', '2026-09-14T03:30:00Z'); // segunda 00:30 em SP: semana de 14/09

// ─── tudo daqui para baixo roda COMO service_role ─────────────────────────────
await db.exec('set role service_role');
const por = Object.fromEntries((await q('select * from public.primeiro_orcamento_por_conta()')).map((r) => [r.user_id, r]));
igual(Object.keys(por).length, 11, 'entram A,B,C,D,E,F,J,K,L,S,M — interna (id), interna (e-mail) e apagada ficam fora');
igual([por[A].sem_real, por[A].segundos_ate_primeiro, por[A].segundos_ate_primeiro_real], [true, 60, null], 'A: exemplo sem edição = orçou, mas NÃO orçou de verdade');
igual([por[B].sem_real, por[B].segundos_ate_primeiro_real, por[B].primeiro_envio_em !== null], [false, 1200, true], 'B: preço editado = real; enviado é registrado');
igual([por[C].sem_real, por[C].segundos_ate_primeiro, por[C].segundos_ate_primeiro_real], [false, 60, 86400], 'C: exemplo primeiro, real 1 dia depois');
igual(por[D].segundos_ate_primeiro_real, 259200, 'D: 3 dias');
igual([por[A].primeiro_envio_em, por[E].primeiro_orcamento_em, por[E].sem_real], [null, null, false], 'rascunho não é envio; quem nunca orçou tem null e NÃO é "sem real"');
igual([por[J].sem_real, por[J].segundos_ate_primeiro_real], [false, 300], 'J: preço não numérico não derruba e o item não vira exemplo');
igual([por[K].sem_real, por[K].segundos_ate_primeiro, por[K].segundos_ate_primeiro_real], [true, 30, null], 'K: dados {} NÃO conta como real (conta só como "qualquer")');
igual([por[L].sem_real, por[L].segundos_ate_primeiro, por[L].segundos_ate_primeiro_real], [true, 40, null], 'L: dados NULL e itens [] NÃO contam como real');

const linhas = await q('select * from public.ativacao_coorte_48h()');
const todas = linhas.find((l) => l.coorte === 'todas');
// elegíveis (≥ 48 h): A,B,C,D,E,J,K,L,S,M = 10 (F tem 10 h). Orçaram em 48 h: A,B,C,J,K,L,S = 7.
// Reais em 48 h: B,C,J,S = 4 (A só exemplo; K e L vazios; D só depois de 3 dias). Enviaram: B = 1.
igual([todas.contas_elegiveis, todas.orcaram_48h, todas.orcaram_real_48h, todas.enviaram_48h].map(Number), [10, 7, 4, 1], 'contagens da coorte "todas"');
igual([todas.taxa_orcou_pct, todas.taxa_orcou_real_pct, todas.taxa_enviou_pct].map(String), ['70.0', '40.0', '10.0'], 'taxas em % (7/10, 4/10, 1/10)');
igual(Number(todas.mediana_segundos_ate_real), 900, 'mediana dos segundos até o 1º real (B 1200, C 86400, J 300, S 600 → 900)');
igual(linhas.at(-1).coorte, 'todas', 'a linha "todas" vem por último');
const coortes = linhas.map((l) => l.coorte);
assert.ok(coortes.includes('2026-09-07'), 'domingo 23:30 em SP cai na semana de 07/09 (em UTC cairia em 14/09)');
assert.ok(coortes.includes('2026-09-14'), 'segunda 00:30 em SP abre a semana de 14/09');
checks += 2;
const sem0907 = linhas.find((l) => l.coorte === '2026-09-07');
igual([Number(sem0907.contas_elegiveis), Number(sem0907.orcaram_real_48h)], [1, 1], 'a semana de 07/09 tem só a conta do domingo à noite, e ela orçou de verdade');
const sem0914 = linhas.find((l) => l.coorte === '2026-09-14');
igual([Number(sem0914.contas_elegiveis), Number(sem0914.orcaram_48h)], [1, 0], 'a semana de 14/09 tem só a conta de segunda 00:30, sem orçamento');

// ─── prova de que o teste PEGA o defeito original ─────────────────────────────
await assert.rejects(() => db.query('select count(*) from auth.users'), /permission denied/i, 'service_role NÃO lê auth.users direto (a 1ª versão, com views, falharia aqui em produção)');
checks++;
await assert.rejects(() => db.query('select count(*) from public.orcamentos'), /permission denied/i, 'service_role do teste não tem grant extra nas tabelas de apoio');
checks++;
await db.exec('reset role');

// ─── permissões e definição das funções ───────────────────────────────────────
for (const papel of ['anon', 'authenticated']) {
  await db.exec(`set role ${papel}`);
  await assert.rejects(() => db.query('select * from public.primeiro_orcamento_por_conta()'), /permission denied/i, `${papel} não executa a função por conta`);
  await assert.rejects(() => db.query('select * from public.ativacao_coorte_48h()'), /permission denied/i, `${papel} não executa a função de coorte`);
  await assert.rejects(() => db.query('select * from public.ativacao_exemplos_ref'), /permission denied/i, `${papel} não lê a tabela de referência`);
  await db.exec('reset role');
  checks += 3;
}
const defs = await q(`select proname, prosecdef, (proconfig @> array['search_path=""']::text[]) vazio from pg_proc where proname in ('primeiro_orcamento_por_conta','ativacao_coorte_48h') order by 1`);
igual(defs.map((d) => [d.proname, d.prosecdef, d.vazio]), [['ativacao_coorte_48h', true, true], ['primeiro_orcamento_por_conta', true, true]], 'as duas funções são SECURITY DEFINER com search_path vazio');

await db.close();
console.log(`PASSOU: ${checks} verificações — medição do 1º orçamento provada (SQL × app; Postgres real; como service_role).`);
