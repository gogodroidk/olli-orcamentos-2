/**
 * Etapas da 1ª sessão (20261007100000_ativacao_eventos_etapa.sql), em Postgres
 * real (PGlite). Trava:
 *   - a constraint aceita os eventos novos e continua barrando lixo;
 *   - duas chamadas iguais em <10 s + uma diferente = 2 linhas;
 *   - evento fora da lista = 'evento_invalido';
 *   - authenticated NÃO lê a view; service_role lê;
 *   - pessoas_1a_sessao conta evento a 30 min do início e NÃO a 2 h;
 *     pessoas_alguma_vez conta os dois.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const BASE = readFileSync('supabase/migrations/20260918120000_user_activity_log.sql', 'utf8');
const NOVA = readFileSync('supabase/migrations/20261007100000_ativacao_eventos_etapa.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U1 = id(1), U2 = id(2), U3 = id(3);

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
create table public.funil_exclusoes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  email text, motivo text, criado_em timestamptz not null default now()
);
insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}');
`);
await db.exec(BASE);
await db.exec(NOVA);
// No Supabase o service_role já tem grant padrão nas tabelas de public (a view é security_invoker).
await db.exec('grant select on public.user_activity_log, public.funil_exclusoes to service_role');

const comoUsuario = async (uid: string, sql: string) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
  try { return await db.query<Record<string, unknown>>(sql); }
  finally { await db.exec('reset role;'); }
};
const erro = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ''; } catch (e) { return String((e as Error).message); }
};

console.log('\nativação: eventos por etapa');

// 1. constraint
const novos = ['ativacao_card_visto', 'ativacao_card_clicado', 'oficio_escolhido',
  'orcamento_novo_aberto', 'empresa_salva', 'orcamento_enviado'];
let aceitou = true;
for (const e of novos) {
  aceitou = aceitou && (await db.exec(`insert into public.user_activity_log (user_id, evento) values ('${U3}', '${e}')`).then(() => true, () => false));
}
checar('constraint aceita os 6 eventos novos', aceitou);
const lixo = await db.exec(`insert into public.user_activity_log (user_id, evento) values ('${U3}', 'xyz')`).then(() => true, () => false);
checar('constraint barra evento fora da lista', !lixo);
await db.exec('delete from public.user_activity_log');

// 2. dedupe de 10 s
await comoUsuario(U1, "select public.registrar_atividade_usuario('ativacao_card_visto', 'web')");
await comoUsuario(U1, "select public.registrar_atividade_usuario('ativacao_card_visto', 'web')");
await comoUsuario(U1, "select public.registrar_atividade_usuario('oficio_escolhido', 'web')");
const n = await db.query<{ c: number }>(`select count(*)::int as c from public.user_activity_log where user_id = '${U1}'`);
checar('2 chamadas iguais em <10 s + 1 diferente = 2 linhas', n.rows[0].c === 2, JSON.stringify(n.rows));

// 3. evento inválido
const e1 = await erro(() => comoUsuario(U1, "select public.registrar_atividade_usuario('hackeei', 'web')"));
checar("evento fora da lista = 'evento_invalido'", e1.includes('evento_invalido'), e1);

// 4. permissões da view
const e2 = await erro(() => comoUsuario(U1, 'select * from public.ativacao_funil_etapas'));
checar('authenticated NÃO lê a view', /permission denied/i.test(e2), e2);
await db.exec('set role service_role');
const lido = await db.query('select * from public.ativacao_funil_etapas').then(() => true, () => false);
await db.exec('reset role');
checar('service_role lê a view', lido);

// 5. janela de 60 min desde o 1º evento da conta
await db.exec(`
delete from public.user_activity_log;
insert into public.user_activity_log (user_id, evento, plataforma, criado_em) values
  ('${U2}', 'login',                 'web', '2026-10-01T10:00Z'),
  ('${U2}', 'orcamento_novo_aberto', 'web', '2026-10-01T10:30Z'),
  ('${U2}', 'quote_create',          'web', '2026-10-01T12:00Z');
`);
await db.exec('set role service_role');
const v = await db.query<{ evento: string; pessoas_1a_sessao: number; pessoas_alguma_vez: number }>(
  'select evento, pessoas_1a_sessao::int, pessoas_alguma_vez::int from public.ativacao_funil_etapas');
await db.exec('reset role');
const l = (e: string) => v.rows.find((r) => r.evento === e);
checar('evento a 30 min do início conta em pessoas_1a_sessao', l('orcamento_novo_aberto')?.pessoas_1a_sessao === 1, JSON.stringify(v.rows));
checar('evento a 2 h do início NÃO conta em pessoas_1a_sessao', l('quote_create')?.pessoas_1a_sessao === 0, JSON.stringify(v.rows));
checar('pessoas_alguma_vez conta os dois', l('orcamento_novo_aberto')?.pessoas_alguma_vez === 1 && l('quote_create')?.pessoas_alguma_vez === 1);

// 6. exclusões
await db.exec(`insert into public.funil_exclusoes (user_id, motivo) values ('${U2}', 'conta interna')`);
await db.exec('set role service_role');
const vazio = await db.query("select 1 from public.ativacao_funil_etapas where evento = 'login'");
await db.exec('reset role');
checar('conta em funil_exclusoes fica fora da view', vazio.rows.length === 0);

const idem = await db.exec(NOVA).then(() => true, () => false);
checar('migration idempotente (roda 2x)', idem);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
