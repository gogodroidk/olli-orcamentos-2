/**
 * Teste das migrations do Play Billing direto, rodando DE VERDADE num Postgres em
 * memória (PGlite) — não é regex sobre o arquivo:
 *
 *   20261004110000_play_compras.sql            (tabela da compra, decisão C4)
 *   20261004110100_lembretes_reconhecem_play.sql (item 55 / R6)
 *
 *     node scripts/teste-play-compras-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que está trancado aqui:
 *  1. play_compras: RLS ligado SEM policy, nada para anon/authenticated (nem SELECT —
 *     o token cru é credencial de consulta da compra), service_role escreve.
 *  2. Anti-replay: token_sha256 ÚNICO; user_id e token IMUTÁVEIS (compra não muda
 *     de conta nem por UPDATE do service_role).
 *  3. Lembretes: assinatura só-Play conta como RECORRENTE (nunca "renove com Pix").
 *  4. Funil: Play paga vira marco 'google_play'; licença de TESTE não vira receita.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const FUNIL = readFileSync('supabase/migrations/20260930120100_funil_receita.sql', 'utf8');
const COMPRAS = readFileSync('supabase/migrations/20261004110000_play_compras.sql', 'utf8');
const LEMBRETES = readFileSync('supabase/migrations/20261004110100_lembretes_reconhecem_play.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

// Esquema mínimo: o que o funil (20260930120100) e listar_candidatos_lembrete_email
// (cópia de 20261002150000) leem. Colunas a mais não atrapalham.
const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key, email text, created_at timestamptz not null default now(), last_sign_in_at timestamptz,
  email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false
);
create table public.user_activity_log (user_id uuid references auth.users(id), evento text, criado_em timestamptz);
create table public.empresa (user_id uuid primary key references auth.users(id), dados jsonb, atualizado_em timestamptz default now());
create table public.clientes (id text primary key, user_id uuid, criado_em timestamptz);
create table public.orcamentos (
  id text primary key, user_id uuid, criado_por uuid, status text, excluido_em timestamptz,
  criado_em timestamptz, atualizado_em timestamptz
);
create table public.orcamentos_publicos (token text primary key, user_id uuid, status text, criado_em timestamptz, respondido_em timestamptz);
create table public.orcamento_envios_gratis (
  owner_user_id uuid, tenant_id uuid, periodo date, estado text, confirmado_em timestamptz, reserva_expira_em timestamptz
);
create table public.trials_comerciais (
  tenant_id uuid primary key, owner_user_id uuid, iniciado_em timestamptz, estado text, termina_em timestamptz
);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id), plano text, status text, current_period_end timestamptz,
  stripe_subscription_id text, stripe_customer_id text, mp_preapproval_id text, atualizado_em timestamptz default now(),
  admin_plano_override text, admin_override_ativo boolean not null default false, admin_override_ate timestamptz,
  admin_override_at timestamptz,
  revenuecat_transacao_id text, revenuecat_produto_id text, revenuecat_vigencia_ate timestamptz, revenuecat_evento_em timestamptz
);
create table public.webhook_events (origem text, event_id text, status text, payload jsonb, processado_em timestamptz);
create table public.admin_memberships (user_id uuid primary key);
create table public.organizacoes (id uuid primary key, owner_user_id uuid);
create table public.organizacao_membros (org_id uuid, user_id uuid, papel text, ativo boolean default true);
create table public.email_supressoes (user_id uuid);
create table public.email_outbox (
  id bigint generated always as identity, user_id uuid, purpose text, idempotency_key text,
  template_dados jsonb, created_at timestamptz default now()
);
create function public.plano_comercial_efetivo(p_user uuid, p_tenant uuid, p_now timestamptz)
returns text language sql as $$ select 'pro'::text $$;
`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLAY = id(1), PIX = id(2), TESTE = id(3), INTRUSO = id(4);
const hash = (c: string) => c.repeat(64);

const db = new PGlite();
await db.exec(ESQUEMA);
await db.exec(FUNIL);
await db.exec(COMPRAS);
await db.exec(LEMBRETES);
console.log('\nMigrations aplicadas no PGlite (funil → play_compras → lembretes)');

await db.exec(`
insert into auth.users (id, email, email_confirmed_at) values
  ('${PLAY}', 'play@exemplo.test', now() - interval '30 days'),
  ('${PIX}', 'pix@exemplo.test', now() - interval '30 days'),
  ('${TESTE}', 'teste@exemplo.test', now() - interval '30 days'),
  ('${INTRUSO}', 'intruso@exemplo.test', now() - interval '30 days');
insert into public.orcamentos (id, user_id, status, criado_em, atualizado_em) values
  ('o-play', '${PLAY}', 'enviado', now(), now()),
  ('o-pix', '${PIX}', 'enviado', now(), now());
`);

const erroDe = async (sql: string): Promise<string | null> => {
  try { await db.exec(sql); return null; } catch (e) { return String((e as Error).message || e); }
};
const comoPapel = async (papel: string, sql: string): Promise<string | null> =>
  erroDe(`set role ${papel}; ${sql}; reset role;`).then(async (e) => { await db.exec('reset role;'); return e; });

console.log('\n1) play_compras: RLS sem policy, nada para anon/authenticated');
{
  const rls = (await db.query<{ ligado: boolean; forcado: boolean }>(
    `select relrowsecurity ligado, relforcerowsecurity forcado from pg_class where relname = 'play_compras'`,
  )).rows[0];
  checar('RLS ligado (e forçado)', rls?.ligado && rls?.forcado);
  const policies = (await db.query<{ n: number }>(`select count(*)::int n from pg_policies where tablename = 'play_compras'`)).rows[0];
  checar('nenhuma policy', policies?.n === 0);
  for (const papel of ['anon', 'authenticated']) {
    const p = (await db.query<{ s: boolean; i: boolean; u: boolean; d: boolean }>(
      `select has_table_privilege('${papel}', 'public.play_compras', 'select') s,
              has_table_privilege('${papel}', 'public.play_compras', 'insert') i,
              has_table_privilege('${papel}', 'public.play_compras', 'update') u,
              has_table_privilege('${papel}', 'public.play_compras', 'delete') d`,
    )).rows[0];
    checar(`${papel}: sem SELECT/INSERT/UPDATE/DELETE`, !p.s && !p.i && !p.u && !p.d, JSON.stringify(p));
  }
  checar('authenticated não lê o token cru', (await comoPapel('authenticated', 'select purchase_token from public.play_compras')) !== null);
}

console.log('\n2) service_role grava; token ÚNICO; dono e token imutáveis');
{
  const inserir = (user: string, h: string, teste = false) =>
    comoPapel('service_role', `insert into public.play_compras (user_id, token_sha256, purchase_token, produto_id, estado, expiry, teste)
      values ('${user}', '${h}', 'tok-${h.slice(0, 30)}', 'olli_pro:mensal', 'SUBSCRIPTION_STATE_ACTIVE', now() + interval '30 days', ${teste})`);
  checar('service_role insere', (await inserir(PLAY, hash('a'))) === null);
  checar('compra de teste também é registrada', (await inserir(TESTE, hash('c'), true)) === null);
  const dup = await inserir(INTRUSO, hash('a'));
  checar('MESMO token em outra conta → recusado (índice único)', dup !== null && /duplicate|unique|play_compras_token_sha256_key/i.test(dup), String(dup));
  const troca = await comoPapel('service_role', `update public.play_compras set user_id = '${INTRUSO}' where token_sha256 = '${hash('a')}'`);
  checar('trocar o dono por UPDATE → recusado', troca !== null && /play_compras_dono_imutavel/.test(troca), String(troca));
  const tokenNovo = await comoPapel('service_role', `update public.play_compras set purchase_token = 'outro-token-qualquer-123' where token_sha256 = '${hash('a')}'`);
  checar('trocar o token por UPDATE → recusado', tokenNovo !== null && /play_compras_token_imutavel/.test(tokenNovo), String(tokenNovo));
  const estado = await comoPapel('service_role', `update public.play_compras set estado = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', ack = true where token_sha256 = '${hash('a')}'`);
  checar('atualizar estado/ack (o que o worker faz) → ok', estado === null, String(estado));
  checar('hash fora do formato → recusado', (await inserir(PIX, 'nao-e-hash')) !== null);
  const dono = (await db.query<{ user_id: string }>(`select user_id::text from public.play_compras where token_sha256 = '${hash('a')}'`)).rows[0];
  checar('a compra continua com o dono original', dono?.user_id === PLAY);
}

console.log('\n3) Lembretes: assinatura só-Play é RECORRENTE (nunca "renove com Pix")');
{
  await db.exec(`
  insert into public.assinaturas (user_id, plano, status, current_period_end, revenuecat_transacao_id, revenuecat_produto_id, revenuecat_vigencia_ate)
    values ('${PLAY}', 'pro', 'active', now() + interval '2 days', '${hash('a')}', 'olli_pro:mensal', now() + interval '2 days');
  insert into public.assinaturas (user_id, plano, status, current_period_end)
    values ('${PIX}', 'pro', 'active', now() + interval '2 days');
  `);
  const r = await db.query<{ candidato: any }>(`select candidato from public.listar_candidatos_lembrete_email(now(), 30, 50)`);
  const de = (u: string) => r.rows.map((x) => x.candidato).find((c) => c.userId === u);
  checar('Play vencendo em 2 dias é candidata', !!de(PLAY), JSON.stringify(r.rows));
  checar('...com recorrente = true', de(PLAY)?.assinatura?.recorrente === true, JSON.stringify(de(PLAY)?.assinatura));
  checar('Pix avulso segue recorrente = false (o "renove com Pix" é dele)', de(PIX)?.assinatura?.recorrente === false, JSON.stringify(de(PIX)?.assinatura));
  const grants = (await db.query<{ auth: boolean; srv: boolean }>(
    `select has_function_privilege('authenticated', 'public.listar_candidatos_lembrete_email(timestamptz, integer, integer)', 'execute') auth,
            has_function_privilege('service_role', 'public.listar_candidatos_lembrete_email(timestamptz, integer, integer)', 'execute') srv`,
  )).rows[0];
  checar('grants preservados (só service_role executa)', !grants.auth && grants.srv, JSON.stringify(grants));
}

console.log('\n4) Funil: Play paga = google_play; licença de teste NÃO é receita');
{
  const marco = async (u: string) =>
    (await db.query<{ origem: string }>(`select origem from public.funil_marcos where user_id = $1 and marco = 'pagou'`, [u])).rows[0]?.origem ?? null;
  checar('assinatura da Play gravou marco "pagou" com origem google_play', (await marco(PLAY)) === 'google_play', String(await marco(PLAY)));
  checar('Pix segue avulso', (await marco(PIX)) === 'avulso', String(await marco(PIX)));
  await db.exec(`
  insert into public.assinaturas (user_id, plano, status, current_period_end, revenuecat_transacao_id)
    values ('${TESTE}', 'pro', 'active', now() + interval '5 minutes', '${hash('c')}');`);
  checar('compra de teste (play_compras.teste) não vira marco', (await marco(TESTE)) === null, String(await marco(TESTE)));
  const invalida = await erroDe(`insert into public.funil_marcos (user_id, marco, origem) values ('${INTRUSO}', 'pagou', 'inventada')`);
  checar('constraint de origem continua fechada', invalida !== null);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${ok} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
