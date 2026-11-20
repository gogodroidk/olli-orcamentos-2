/**
 * Cupom de influenciador — consulta por código (migration 20261119210000) rodando de verdade (PGlite), dados sintéticos.
 *
 *     node scripts/teste-cupom-origem-sql.ts
 * Prende: conta entra pelo código no primeiro OU no último toque; outro código e conta sem origem ficam de fora;
 * orçaram/pagaram vêm dos marcos do funil (pagou estimado não conta); conta interna e conta excluída não contam;
 * código inválido devolve zeros; só service_role executa; devolve só contagens.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIG = readFileSync('supabase/migrations/20261119210000_cupom_origem_funil.sql', 'utf8');
let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), deleted_at timestamptz, raw_user_meta_data jsonb);
create table public.funil_exclusoes (id bigint generated always as identity primary key, user_id uuid references auth.users (id) on delete cascade, email text, motivo text not null default 'teste');
create table public.funil_marcos (user_id uuid not null references auth.users (id) on delete cascade, marco text not null, estimado boolean not null default false, primary key (user_id, marco));
`);
await db.exec(MIG);

const U = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const meta = (primeiro?: string, ultimo?: string) => JSON.stringify({ origem_utm: {
  ...(primeiro ? { primeiro_toque: { utm_source: 'instagram', cupom: primeiro } } : {}),
  ...(ultimo ? { ultimo_toque: { cupom: ultimo } } : {}),
} });
const contas: Array<[number, string, string, boolean]> = [
  [1, 'a@t.invalid', meta('ANA10'), false],            // entrou pelo código (1º toque)
  [2, 'b@t.invalid', meta(undefined, 'ANA10'), false], // código só no último toque
  [3, 'c@t.invalid', meta('ANA10', 'ANA10'), false],   // os dois toques: conta UMA vez
  [4, 'd@t.invalid', meta('BETO20'), false],           // outro influenciador
  [5, 'e@t.invalid', '{}', false],                     // sem origem
  [6, 'f@t.invalid', meta('ANA10'), true],             // excluída (deleted_at)
  [7, 'g@t.invalid', meta('ana10'), false],            // minúsculo gravado: ainda conta
  [8, 'interna@t.invalid', meta('ANA10'), false],      // conta interna (funil_exclusoes)
];
for (const [n, email, m, apagada] of contas) {
  await db.query('insert into auth.users (id, email, raw_user_meta_data, deleted_at) values ($1,$2,$3::jsonb,$4)', [U(n), email, m, apagada ? new Date() : null]);
}
await db.query("insert into public.funil_exclusoes (email) values ('interna@t.invalid')");
await db.exec(`
insert into public.funil_marcos (user_id, marco, estimado) values
 ('${U(1)}','orcamento_enviado',false), ('${U(1)}','pagou',false),
 ('${U(2)}','orcamento_enviado',false), ('${U(2)}','pagou',true),
 ('${U(4)}','orcamento_enviado',false), ('${U(4)}','pagou',false),
 ('${U(8)}','orcamento_enviado',false), ('${U(8)}','pagou',false);`);

const consulta = async (codigo: string | null) => (await db.query<{ codigo: string; cadastros: string; orcaram: string; pagaram: string }>('select * from public.cupom_origem_funil($1)', [codigo])).rows[0];

let r = await consulta('ANA10');
checar('cadastros: 1º toque, último toque e os dois (uma vez), minúsculo; sem excluída nem interna', Number(r.cadastros) === 4, JSON.stringify(r));
checar('orçaram: marco orcamento_enviado só das contas do código', Number(r.orcaram) === 2, JSON.stringify(r));
checar('pagaram: marco pagou; estimado não conta; outro código e conta interna não entram', Number(r.pagaram) === 1, JSON.stringify(r));
r = await consulta('beto20');
checar('código em minúsculo na consulta é normalizado', r.codigo === 'BETO20' && Number(r.cadastros) === 1 && Number(r.pagaram) === 1, JSON.stringify(r));
r = await consulta('NAOEXISTE');
checar('código sem cadastro = zeros (a rota separa "não sei" de zero pelo erro do banco)', Number(r.cadastros) === 0 && Number(r.orcaram) === 0 && Number(r.pagaram) === 0);
r = await consulta("A'; drop table auth.users;--");
checar('código inválido = zeros e nada acontece', Number(r.cadastros) === 0);
r = await consulta(null);
checar('código nulo = zeros', Number(r.cadastros) === 0);
checar('a função devolve só contagens (sem e-mail/id)', Object.keys(r).sort().join() === 'cadastros,codigo,orcaram,pagaram');

await db.exec('set role authenticated');
let negado = false;
try { await db.query("select * from public.cupom_origem_funil('ANA10')"); } catch { negado = true; }
checar('usuário logado não executa', negado);
await db.exec('reset role; set role anon');
negado = false;
try { await db.query("select * from public.cupom_origem_funil('ANA10')"); } catch { negado = true; }
checar('anônimo não executa', negado);
await db.exec('reset role; set role service_role');
checar('service_role executa', Number((await consulta('ANA10')).cadastros) === 4);

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
