/**
 * CQ-CONTAS-TESTE-FORA (D-0914) — migration 20261119100000_numeros_sem_contas_internas.sql em Postgres real (PGlite).
 *
 *     node scripts/teste-numeros-sem-internas-sql.ts
 *
 * Prova que conta interna (funil_exclusoes por id ou e-mail; administrador ativo) NÃO entra em:
 *  · funil_uso_resumo / funil_uso_tempos (pessoas por passo, medianas);
 *  · telas_resumo (visitas e pessoas por tela);
 *  · cupom_atribuicao (reservados e PAGOS por código de influenciador);
 * e que a visão por pessoa `funil_uso` continua crua (o painel separa as internas no worker).
 * Também: idempotência (aplicar 2x), grants (anon/authenticated não leem) e que o cliente continua contado.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (c: string) => readFileSync(c, 'utf8').split('\r').join('');
const M1 = ler('supabase/migrations/20261022110000_user_tela_log.sql');
const M2 = ler('supabase/migrations/20261023160000_rastreio_funil.sql');
const IND = ler('supabase/migrations/20261010100000_indicacoes.sql');
const CUP = ler('supabase/migrations/20261119090000_cupom_influenciador.sql');
const INT = ler('supabase/migrations/20261007140000_contas_internas.sql');
const NOVA = ler('supabase/migrations/20261119100000_numeros_sem_contas_internas.sql');

let ok = 0;
let falhas = 0;
function checar(nome: string, cond: unknown, detalhe = ''): void {
  if (cond) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

// a MESMA função de produção (não uma cópia escrita à mão)
const m = /create or replace function public\.conta_interna\(p_user_id uuid\)[\s\S]*?\n\$\$;/.exec(INT);
if (!m) throw new Error('não achei public.conta_interna na migration 20261007140000');

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), deleted_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
create table public.funil_exclusoes (id bigint generated always as identity primary key, user_id uuid references auth.users (id) on delete cascade, email text, motivo text not null default 'teste');
create table public.admin_memberships (user_id uuid primary key, papel text, ativo boolean not null default true);
create table public.ativacao_exemplos_ref (vertical text not null, nome text not null, preco numeric(12,2) not null, primary key (vertical, nome));
create table public.orcamentos (id text primary key, user_id uuid, dados jsonb, criado_em timestamptz not null default now(), excluido_em timestamptz);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null default 'gratis', status text not null default 'canceled',
  stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
  admin_plano_override text, admin_override_ativo boolean not null default false, admin_override_ate timestamptz,
  admin_override_reason text, admin_override_by uuid, admin_override_at timestamptz, atualizado_em timestamptz default now()
);`);
await db.exec(m[0]);
await db.exec(`revoke all on function public.conta_interna(uuid) from public, anon, authenticated; grant execute on function public.conta_interna(uuid) to service_role;`);
await db.exec(M1);
await db.exec(M2);
await db.exec(IND);
await db.exec(CUP);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CLI1 = id(1), CLI2 = id(2), INT_ID = id(3), INT_MAIL = id(4), ADM = id(5);
for (const [u, e] of [[CLI1, 'cli1@t.local'], [CLI2, 'cli2@t.local'], [INT_ID, 'dono@t.local'], [INT_MAIL, 'Teste+Qa@T.Local'], [ADM, 'adm@t.local']]) {
  await db.query('insert into auth.users (id, email) values ($1,$2)', [u, e]);
}
await db.exec(`insert into public.funil_exclusoes (user_id, motivo) values ('${INT_ID}', 'dono')`);
await db.exec(`insert into public.funil_exclusoes (email, motivo) values ('teste+qa@t.local', 'por e-mail em outra caixa')`);
await db.exec(`insert into public.admin_memberships (user_id, papel, ativo) values ('${ADM}', 'owner', true)`);

// ── eventos: 2 clientes e 3 internas, todas passando por todos os passos até pagar ─────────────────────────────
const passos = ['sessao_iniciada', 'signup', 'onboarding_completed', 'quote_created', 'quote_sent', 'planos_aberto', 'pix_gerado', 'pix_pago'];
async function jornada(u: string, ate: number): Promise<void> {
  for (let i = 0; i < Math.min(ate, passos.length); i++) {
    await db.query(`insert into public.user_tela_log (user_id, tela, acao, criado_em) values ($1,'Home',$2, now() - interval '1 day' + ($3 || ' minutes')::interval)`, [u, passos[i], String(i * 10)]);
  }
  await db.query(`insert into public.user_tela_log (user_id, tela, duracao_ms) values ($1,'Orcamento', 5000)`, [u]);
}
await jornada(CLI1, 8); // cliente que pagou
await jornada(CLI2, 4); // cliente que parou no 1º orçamento
for (const u of [INT_ID, INT_MAIL, ADM]) await jornada(u, 8);

const lin = async <T = any>(sql: string): Promise<T> => (await db.query<T>(sql)).rows[0] as T;

console.log('— funil_uso (por pessoa) segue cru —');
const cru = await lin<{ n: number }>('select count(*)::int as n from public.funil_uso');
checar('funil_uso (visão por pessoa) continua com as 5 contas, para o painel separar no worker', cru.n === 5);

console.log('— ANTES da migration nova: o defeito existe (prova que o teste enxerga o erro) —');
const antes = await lin<{ pessoas_com_evento: number; pagou: number }>('select * from public.funil_uso_resumo');
checar('antes: resumo contava as 5 contas (3 internas dentro)', antes.pessoas_com_evento === 5 && antes.pagou === 4);
const telasAntes = await lin<{ pessoas: number }>(`select * from public.telas_resumo where tela = 'Orcamento'`);
checar('antes: telas_resumo contava 5 pessoas', telasAntes.pessoas === 5);

await db.exec(NOVA);
await db.exec(NOVA); // idempotente
await db.exec('grant select on all tables in schema public to service_role');

console.log('— DEPOIS —');
const r = await lin<Record<string, number>>('select * from public.funil_uso_resumo');
checar('resumo: só 2 clientes com evento', r.pessoas_com_evento === 2, JSON.stringify(r));
checar('resumo: 1 cliente pagou (internas por id, por e-mail em outra caixa e admin ficam fora)', r.pagou === 1 && r.cadastrou === 2 && r.enviou_orcamento === 1, JSON.stringify(r));
const t = await lin<Record<string, number | null>>('select * from public.funil_uso_tempos');
checar('tempos: calculados só com clientes (mediana do 1º orçamento = 20 min; 2 clientes)', Number(t.min_ate_1o_orcamento) === 20, JSON.stringify(t));
const tl = await lin<{ pessoas: number; visitas: number }>(`select * from public.telas_resumo where tela = 'Orcamento'`);
checar('telas_resumo: 2 pessoas e 2 visitas, sem internas', tl.pessoas === 2 && tl.visitas === 2, JSON.stringify(tl));

console.log('— cupom_atribuicao —');
await db.exec(`insert into public.cupons_influenciador (codigo, usos_max, valido_ate) values ('ANA10', 50, now() + interval '30 days')`);
const uso = (u: string, estado: string) => db.query(`insert into public.cupom_usos (user_id, codigo, plano, canal, pct, estado, pago_em) values ($1,'ANA10','pro','pix',10,$2, case when $2 = 'pago' then now() end)`, [u, estado]);
await uso(CLI1, 'pago');
await uso(CLI2, 'reservado');
await uso(INT_ID, 'pago');
await uso(INT_MAIL, 'pago');
await uso(ADM, 'reservado');
const at = (await db.query<any>('select * from public.cupom_atribuicao()')).rows.find((x) => x.codigo === 'ANA10');
checar('cupom: 1 pago e 1 reservado (só clientes; 2 pagos e 1 reservado de internas ficam de fora)', Number(at.pagos) === 1 && Number(at.reservados) === 1, JSON.stringify(at));
await db.exec(`insert into public.cupons_influenciador (codigo, usos_max, valido_ate) values ('VAZIO1', 5, now() + interval '30 days')`);
const vazio = (await db.query<any>('select * from public.cupom_atribuicao()')).rows.find((x) => x.codigo === 'VAZIO1');
checar('cupom sem uso continua listado, com 0 e 0', !!vazio && Number(vazio.pagos) === 0 && Number(vazio.reservados) === 0);

console.log('— desmarcar volta a contar (a fonte é viva, não uma cópia) —');
await db.exec(`delete from public.funil_exclusoes where user_id = '${INT_ID}'`);
const r2 = await lin<Record<string, number>>('select * from public.funil_uso_resumo');
checar('após desfazer a marca, a conta volta ao resumo (3 pessoas)', r2.pessoas_com_evento === 3, JSON.stringify(r2));

console.log('— permissões —');
for (const papel of ['anon', 'authenticated']) {
  for (const q of ['select * from public.funil_uso_resumo', 'select * from public.funil_uso_tempos', 'select * from public.telas_resumo', 'select * from public.cupom_atribuicao()']) {
    let negou = false;
    try { await db.exec(`set role ${papel}`); await db.query(q); } catch { negou = true; } finally { await db.exec('reset role'); }
    checar(`${papel} não executa/lê: ${q.slice(14, 44)}`, negou);
  }
}

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
