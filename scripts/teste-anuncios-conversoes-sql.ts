/**
 * Pendências da CAPI NO BANCO (migrations 20261005090000 + 20261007120000).
 *
 *     node scripts/teste-anuncios-conversoes-sql.ts
 *
 * Roda o SQL REAL num Postgres de verdade (PGlite) com stubs só do que é do Supabase. Prova: só quem aceitou
 * o aviso ('sim') entra · conta interna fora (por id e por e-mail) · telefone sai normalizado (55+DDD+número) ·
 * `Lead` só do 1º orçamento ENVIADO real (não estimado, até 7 dias) · enviado/pulado não volta; erro volta até
 * 5 tentativas · a tabela aceita 'Lead' e continua recusando evento desconhecido · anon não executa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let checks = 0;
const igual = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(),
    raw_user_meta_data jsonb default '{}'::jsonb, deleted_at timestamptz);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.funil_exclusoes (user_id uuid, email text);
  create table public.funil_marcos (user_id uuid, marco text, criado_em timestamptz default now(), estimado boolean default false);
  create table public.assinaturas (user_id uuid primary key, plano text);
`);
await db.exec(ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql')); // private.telefone_whatsapp_br
await db.exec(ler('../supabase/migrations/20261005090000_anuncios_conversoes.sql'));
const nova = ler('../supabase/migrations/20261007120000_anuncios_conversoes_lead_telefone.sql');
await db.exec(nova);
await db.exec(nova); // idempotente
checks++;

const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const medicao = (c: string) => JSON.stringify({ medicao_anuncios: { consentimento: c, ua: 'Mozilla/5.0' }, origem_utm: { fbp: 'fb.1.1.1' }, phone: '(11) 98765-4321' });
const novoUsuario = async (email: string, consent: string, extra = ''): Promise<string> =>
  (await q(`insert into auth.users (email, raw_user_meta_data ${extra ? ', created_at' : ''}) values ($1, $2::jsonb ${extra ? ', ' + extra : ''}) returning id`, [email, medicao(consent)]))[0].id;

const sim = await novoUsuario('sim@exemplo.com', 'sim');
const nao = await novoUsuario('nao@exemplo.com', 'nao');
const calado = await novoUsuario('calado@exemplo.com', 'sem_resposta');
const interno = await novoUsuario('interno@exemplo.com', 'sim');
const internoEmail = await novoUsuario('Dono@Exemplo.com', 'sim');
const velho = await novoUsuario('velho@exemplo.com', 'sim', `now() - interval '9 days'`);
await db.exec(`insert into public.funil_exclusoes (user_id) values ('${interno}'); insert into public.funil_exclusoes (email) values ('dono@exemplo.com')`);

const pend = async () => q('select * from public.anuncios_conversoes_pendentes(50)');
let p = await pend();
igual(p.map((x) => x.evento + ':' + x.email).sort(), ['CompleteRegistration:sim@exemplo.com'], 'só quem aceitou entra: recusou, calou, conta interna (id e e-mail) e cadastro de 9 dias ficam fora');
igual(p[0].telefone, '5511987654321', 'telefone sai normalizado 55+DDD+número (o worker faz o hash)');
igual(p[0].event_id, `cadastro-${sim}`, 'event_id do cadastro = o do navegador (dedup)');

// ─── Lead = 1º orçamento ENVIADO real ────────────────────────────────────────
await db.exec(`insert into public.funil_marcos (user_id, marco, criado_em, estimado) values
  ('${sim}', 'perfil_empresa', now(), false),
  ('${nao}', 'orcamento_enviado', now(), false),
  ('${interno}', 'orcamento_enviado', now(), false)`);
p = await pend();
igual(p.filter((x) => x.evento === 'Lead').length, 0, 'sem aceite, conta interna e marco que não é "orçamento enviado" NÃO viram Lead');
await db.exec(`insert into public.funil_marcos (user_id, marco, criado_em, estimado) values ('${sim}', 'orcamento_enviado', now(), true)`);
igual((await pend()).filter((x) => x.evento === 'Lead').length, 0, 'marco ESTIMADO não vira Lead (só envio comprovado)');
await db.exec(`delete from public.funil_marcos where user_id = '${sim}' and marco = 'orcamento_enviado'; insert into public.funil_marcos (user_id, marco, criado_em, estimado) values ('${sim}', 'orcamento_enviado', now(), false)`);
p = await pend();
const lead = p.find((x) => x.evento === 'Lead');
igual([lead?.event_id, lead?.telefone, lead?.plano], [`lead-${sim}`, '5511987654321', null], 'envio real de quem aceitou vira Lead com event_id próprio');
await db.exec(`update public.funil_marcos set criado_em = now() - interval '8 days' where marco = 'orcamento_enviado' and user_id = '${sim}'`);
igual((await pend()).filter((x) => x.evento === 'Lead').length, 0, 'Lead com mais de 7 dias sai da fila (a CAPI recusaria)');
await db.exec(`update public.funil_marcos set criado_em = now() where marco = 'orcamento_enviado' and user_id = '${sim}'`);

// ─── Estado do envio ──────────────────────────────────────────────────────────
const registrar = async (itens: unknown[]) => (await q('select public.anuncios_conversoes_registrar($1::jsonb) r', [JSON.stringify(itens)]))[0].r;
await registrar([{ event_id: `cadastro-${sim}`, user_id: sim, evento: 'CompleteRegistration', estado: 'enviado', detalhe: 'fbtrace x' }]);
igual((await pend()).map((x) => x.evento), ['Lead'], 'enviado não volta para a fila');
for (let i = 0; i < 2; i++) await registrar([{ event_id: `lead-${sim}`, user_id: sim, evento: 'Lead', estado: 'erro', detalhe: 'HTTP 500' }]);
igual((await pend()).map((x) => x.evento), ['Lead'], 'erro volta a tentar (2 tentativas)');
for (let i = 0; i < 3; i++) await registrar([{ event_id: `lead-${sim}`, user_id: sim, evento: 'Lead', estado: 'erro', detalhe: 'HTTP 500' }]);
igual((await pend()).length, 0, 'depois de 5 tentativas com erro, para de insistir');
igual((await q(`select tentativas from public.anuncios_conversoes where event_id = 'lead-${sim}'`))[0].tentativas, 5, 'tentativas contadas');

// ─── Constraint e permissões ──────────────────────────────────────────────────
await assert.rejects(() => db.query(`insert into public.anuncios_conversoes (event_id, user_id, evento, estado) values ('x-1', $1, 'Purchase', 'enviado')`, [sim]), /check/i, 'evento desconhecido continua recusado');
checks++;
await db.query(`insert into public.anuncios_conversoes (event_id, user_id, evento, estado) values ('x-2', $1, 'Lead', 'pulado')`, [calado]);
checks++;
igual((await q(`select has_function_privilege('anon', 'public.anuncios_conversoes_pendentes(integer)', 'execute') a, has_function_privilege('authenticated', 'public.anuncios_conversoes_pendentes(integer)', 'execute') b, has_function_privilege('service_role', 'public.anuncios_conversoes_pendentes(integer)', 'execute') c`))[0], { a: false, b: false, c: true }, 'só service_role executa');

await db.close();
console.log(`PASSOU: ${checks} verificações — pendências da CAPI provadas no Postgres.`);
