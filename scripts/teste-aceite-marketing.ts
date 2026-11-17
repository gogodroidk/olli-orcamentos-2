/**
 * Aceite de marketing (20261117120000_aceite_marketing.sql + webapp/src/lib/aceiteMarketing.ts), Postgres real (PGlite).
 * Trava: caixa desmarcada não gera marcador; aceite só pela função, sempre do auth.uid(); exige origem/texto;
 * data do servidor (aceito_em limitado); não vê/altera aceite alheio; revogar mantém a prova; migration idempotente.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { aceiteParaCadastro, lerMarcadorAceite, textoDaVersao, TEXTO_MARKETING_V1, VERSAO_TEXTO_MARKETING } from '../webapp/src/lib/aceiteMarketing.ts';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

console.log('\nmódulo puro');
checar('caixa desmarcada => sem marcador', Object.keys(aceiteParaCadastro(false)).length === 0);
const m = aceiteParaCadastro(true, new Date('2026-11-17T12:00:00Z')).marketing_aceite;
checar('caixa marcada => versão, origem e data', m?.versao === VERSAO_TEXTO_MARKETING && m?.origem === 'cadastro_painel' && m?.aceito_em === '2026-11-17T12:00:00.000Z');
checar('lê o marcador de volta', lerMarcadorAceite({ marketing_aceite: m })?.versao === VERSAO_TEXTO_MARKETING);
checar('marcador inválido/versão desconhecida => null',
  lerMarcadorAceite({ marketing_aceite: { versao: 'x', origem: 'a', aceito_em: 'b' } }) === null && lerMarcadorAceite(null) === null);
checar('texto cita e-mail, WhatsApp e cancelamento', /e-mail e WhatsApp/.test(TEXTO_MARKETING_V1) && /cancelar quando quiser/.test(TEXTO_MARKETING_V1) && textoDaVersao(VERSAO_TEXTO_MARKETING) === TEXTO_MARKETING_V1);

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
await db.exec(readFileSync('supabase/migrations/20261022100000_eventos_uso.sql', 'utf8'));
const MIG = readFileSync('supabase/migrations/20261117120000_aceite_marketing.sql', 'utf8');
await db.exec(MIG);
let idem = '';
try { await db.exec(MIG); } catch (e) { idem = String((e as Error).message); }
checar('migration idempotente (2ª execução sem erro)', idem === '', idem);

const comoUsuario = async (uid: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated;`);
  try { return await db.query<Record<string, any>>(sql, params); }
  finally { await db.exec('reset role;'); }
};
const erro = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return ''; } catch (e) { return String((e as Error).message); }
};
const aceitar = (uid: string, origem = 'cadastro_painel', texto = TEXTO_MARKETING_V1, versao = VERSAO_TEXTO_MARKETING, quando: string | null = null) =>
  comoUsuario(uid, 'select public.registrar_aceite_marketing($1,$2,$3,$4::timestamptz) as id', [origem, texto, versao, quando]);
const linhas = (uid: string) => comoUsuario(uid, `select * from public.consentimentos where finalidade='marketing'`);

console.log('\nbanco');
checar('base sem aceite de ninguém', Number((await db.query<any>(`select count(*) n from public.consentimentos where finalidade='marketing'`)).rows[0].n) === 0);
checar('anon não executa', (await erro(async () => { await db.exec(`set role anon;`); try { await db.query(`select public.registrar_aceite_marketing('cadastro_painel','${'x'.repeat(30)}','v')`); } finally { await db.exec('reset role;'); } })).includes('permission denied'));
checar('sem login recusa', (await erro(() => db.query(`select public.registrar_aceite_marketing('cadastro_painel','${'x'.repeat(30)}','v')`))).includes('not_authenticated'));
await aceitar(U1, 'cadastro_painel', TEXTO_MARKETING_V1, VERSAO_TEXTO_MARKETING, '2026-01-01T00:00:00Z');
let r = (await linhas(U1)).rows;
checar('grava origem, texto e versão; usuário é auth.uid()', r.length === 1 && r[0].origem === 'cadastro_painel' && r[0].texto_aceito === TEXTO_MARKETING_V1 && r[0].usuario_id === U1);
checar('data muito antiga é ignorada (vale o servidor)', new Date(r[0].concedido_em).getFullYear() >= 2026 && new Date(r[0].concedido_em) > new Date('2026-06-01'));
const antes = r[0].concedido_em;
await aceitar(U1);
r = (await linhas(U1)).rows;
checar('reenvio não duplica nem muda a data', r.length === 1 && String(r[0].concedido_em) === String(antes));
const recente = new Date(Date.now() - 3600_000).toISOString();
await aceitar(U2, 'cadastro_painel', TEXTO_MARKETING_V1, VERSAO_TEXTO_MARKETING, recente);
checar('aceito_em de 1h atrás é respeitado', Math.abs(new Date((await linhas(U2)).rows[0].concedido_em).getTime() - Date.parse(recente)) < 1000);
checar('origem inválida recusada', (await erro(() => aceitar(U1, 'bot'))).includes('origem_invalida'));
checar('texto vazio recusado', (await erro(() => aceitar(U1, 'cadastro_painel', 'ok', 'v9'))).includes('texto_invalido'));
checar('insert direto de marketing negado (RLS restritiva)',
  (await erro(() => comoUsuario(U1, `insert into public.consentimentos (usuario_id, finalidade, versao_texto, origem, texto_aceito) values ('${U1}','marketing','v2','cadastro_painel','${'x'.repeat(30)}')`))).length > 0);
checar('insert direto de outra finalidade continua valendo',
  (await erro(() => comoUsuario(U1, `insert into public.consentimentos (usuario_id, finalidade, versao_texto) values ('${U1}','comunidade','v1')`))) === '');
checar('U2 não vê aceite do U1', (await linhas(U2)).rows.every((x) => x.usuario_id === U2));
checar('sem origem/texto a prova não existe (constraint)',
  (await erro(() => db.query(`insert into public.consentimentos (usuario_id, finalidade, versao_texto) values ('${U1}','marketing','v7')`))).includes('consentimentos_marketing_prova'));
await comoUsuario(U1, `update public.consentimentos set revogado_em = now() where finalidade='marketing'`);
r = (await linhas(U1)).rows;
checar('revogar mantém texto e origem (prova)', r.length === 1 && r[0].revogado_em && r[0].texto_aceito === TEXTO_MARKETING_V1);
await aceitar(U1);
r = (await linhas(U1)).rows;
checar('aceitar de novo reativa', r.length === 1 && r[0].revogado_em === null);
checar('não adultera o texto aceito', (await erro(() => comoUsuario(U1, `update public.consentimentos set texto_aceito='outro' where finalidade='marketing'`))).includes('permission denied'));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
