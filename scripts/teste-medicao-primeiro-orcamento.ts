/**
 * Medição do 1º orçamento (migration 20261007130000_medicao_primeiro_orcamento.sql).
 *
 *     node scripts/teste-medicao-primeiro-orcamento.ts
 *
 * 1) A tabela de exemplos do SQL é IDÊNTICA a EXEMPLOS_POR_VERTICAL (src/services/ativacao.ts): se alguém mudar
 *    um exemplo no app e esquecer o SQL, o teste falha.
 * 2) O SQL REAL roda num Postgres de verdade (PGlite) com cenários que a CPO descreveu: exemplo sem edição não
 *    conta como "orçou de verdade"; só vale quem tem ≥ 48 h; conta interna/apagada fica fora; preço torto não
 *    derruba a view; segundos até o 1º orçamento; taxa por coorte e linha 'todas'.
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

// ─── 2) Postgres real ────────────────────────────────────────────────────────
const db = new PGlite();
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null, deleted_at timestamptz);
  create table public.funil_exclusoes (user_id uuid, email text);
  create table public.orcamentos (id serial primary key, user_id uuid not null, criado_em timestamptz not null, status text not null default 'rascunho', dados jsonb);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
`);
await db.exec(SQL);
await db.exec(SQL); // idempotente
checks++;

const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const horas = (h: number) => `now() - interval '${h} hours'`;
async function conta(email: string, idadeHoras: number, extra = ''): Promise<string> {
  return (await q(`insert into auth.users (email, created_at ${extra ? ', deleted_at' : ''}) values ($1, ${horas(idadeHoras)} ${extra ? ', now()' : ''}) returning id`, [email]))[0].id;
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
await conta('e@x.com', 100);             // nunca orçou
const F = await conta('f@x.com', 10);    // 10 h de vida: ainda não elegível
await orc(F, 120, 10, [{ nome: 'Serviço meu', preco: 500 }]);
const G = await conta('interna@x.com', 100); await orc(G, 60, 100, [{ nome: 'x', preco: 1 }]);
await q(`insert into public.funil_exclusoes (user_id) values ($1)`, [G]);
const H = await conta('Dono@X.com', 100); await orc(H, 60, 100, [{ nome: 'x', preco: 1 }]);
await q(`insert into public.funil_exclusoes (email) values ('dono@x.com')`);
const I = await conta('apagada@x.com', 100, 'apagada'); await orc(I, 60, 100, [{ nome: 'x', preco: 1 }]);
const J = await conta('j@x.com', 100);   // preço não numérico NÃO derruba a view; nome do exemplo mas preço torto = real
await orc(J, 300, 100, [{ nome: 'Disjuntor 20 A', preco: 'abc' }]);
const K = await conta('k@x.com', 100);   // orçamento sem itens: não é exemplo
await q(`insert into public.orcamentos (user_id, criado_em, status, dados) values ($1, ${horas(100)} + interval '30 seconds', 'rascunho', '{}'::jsonb)`, [K]);

const por = Object.fromEntries((await q('select * from public.primeiro_orcamento_por_conta')).map((r) => [r.user_id, r]));
igual(Object.keys(por).length, 8, 'entram A,B,C,D,E,F,J,K — interna (id), interna (e-mail) e apagada ficam fora');
igual([por[A].so_exemplo, por[A].segundos_ate_primeiro, por[A].segundos_ate_primeiro_real], [true, 60, null], 'A: exemplo sem edição = orçou, mas NÃO orçou de verdade');
igual([por[B].so_exemplo, por[B].segundos_ate_primeiro_real, por[B].primeiro_envio_em !== null], [false, 1200, true], 'B: preço editado = real; enviado é registrado');
igual([por[C].so_exemplo, por[C].segundos_ate_primeiro, por[C].segundos_ate_primeiro_real], [false, 60, 86400], 'C: exemplo primeiro, real 1 dia depois');
igual([por[D].segundos_ate_primeiro_real], [259200], 'D: 3 dias');
igual([por[A].primeiro_envio_em, por['' + (await q(`select id from auth.users where email='e@x.com'`))[0].id].primeiro_orcamento_em], [null, null], 'rascunho não é envio; quem nunca orçou tem null');
igual([por[J].so_exemplo, por[J].segundos_ate_primeiro_real], [false, 300], 'J: preço não numérico não derruba a view e o item não vira exemplo');
igual([por[K].so_exemplo, por[K].segundos_ate_primeiro_real], [false, 30], 'K: orçamento sem itens não é exemplo');

const todas = (await q(`select * from public.ativacao_coorte_48h where coorte = 'todas'`))[0];
// elegíveis (≥ 48 h): A,B,C,D,E,J,K = 7 (F tem 10 h). Orçaram em 48 h: A,B,C,J,K = 5. Reais: B,J,K = 3 (C só real após 1 dia = ainda dentro de 48 h → conta: C real em 24 h) ⇒ B,C,J,K = 4.
igual([todas.contas_elegiveis, todas.orcaram_48h, todas.orcaram_real_48h, todas.enviaram_48h], [7, 5, 4, 1], 'contagens da coorte "todas" (F não elegível; D fora das 48 h; A só exemplo)');
igual([todas.taxa_orcou_pct, todas.taxa_orcou_real_pct, todas.taxa_enviou_pct], ['71.4', '57.1', '14.3'], 'taxas em % (5/7, 4/7, 1/7)');
igual(Number(todas.mediana_segundos_ate_real), 750, 'mediana dos segundos até o 1º orçamento real (30, 300, 1200, 86400 → 750)');
const semanas = await q(`select coorte from public.ativacao_coorte_48h order by (coorte = 'todas'), coorte`);
igual(semanas.at(-1).coorte, 'todas', 'a linha "todas" vem por último');
assert.ok(semanas.length >= 2 && semanas.slice(0, -1).every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.coorte)), 'as demais linhas são semanas de cadastro (data da segunda-feira)');
checks++;

// ─── permissões ──────────────────────────────────────────────────────────────
const perm = (await q(`select has_table_privilege('anon','public.primeiro_orcamento_por_conta','select') a, has_table_privilege('authenticated','public.ativacao_coorte_48h','select') b, has_table_privilege('service_role','public.ativacao_coorte_48h','select') c, has_table_privilege('authenticated','public.ativacao_exemplos_ref','select') d`))[0];
igual([perm.a, perm.b, perm.c, perm.d], [false, false, true, false], 'só service_role lê as views e a tabela de referência');

await db.close();
console.log(`PASSOU: ${checks} verificações — medição do 1º orçamento provada (SQL × app e Postgres real).`);
