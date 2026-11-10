/**
 * RÉGUA "ORÇAMENTO NÃO ABERTO EM 48 H" (Z-123, migration 20261110120000) rodando o SQL de verdade no PGlite,
 * em cima da cadeia REAL de migrations do e-mail (outbox, supressão, teto de 24 h, contas internas, pix_vence).
 *
 *     node scripts/teste-regua-nao-aberto-sql.ts
 *
 * Prova: (1) a cadeia + a migration nova aplicam, e aplicar a nova DE NOVO não quebra (idempotente);
 * (2) candidatos: só link enviado, não aberto, não respondido, não revogado, com 48 h–7 d; fora disso, não;
 * (3) conta suprimida (SAIR), conta interna e membro de equipe NÃO entram; (4) 1 candidato por conta, e uma
 * conta com 60 links antigos não trava a fila das outras (limit vem DEPOIS do filtro); (5) o enqueue grava 1
 * e-mail ao PRESTADOR (nunca ao cliente), reconfere sob a trava (link aberto/revogado/outra janela/dado
 * divergente = não envia) e é idempotente; (6) teto de 1 e-mail por 24 h por pessoa vale; (7) anon/authenticated
 * não executam nada; (8) o tipo antigo (`parou`) continua funcionando depois do remendo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const M = (n: string) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CADEIA = [
  '20260904205858_email_welcome_outbox.sql',
  '20260904211012_email_welcome_tenant_indexes.sql',
  '20260904212747_email_welcome_dispatch_runtime.sql',
  '20260929200000_email_producao_lembretes.sql',
  '20261005090000_regua_reengajamento.sql',
  '20261006090000_whatsapp_nao_contatar.sql',
  '20261007140000_contas_internas.sql',
  '20261026040000_pix_vence_lembrete.sql',
];
const NOVA = M('20261110120000_regua_orcamento_nao_aberto.sql');

let ok = 0;
const caso = (n: string) => { ok++; console.log(`  ok  ${n}`); };

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema private;
  create table auth.users (
    id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz,
    banned_until timestamptz, is_anonymous boolean default false, created_at timestamptz default now(),
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  create table public.organizacoes (id uuid primary key, owner_user_id uuid not null, nome text);
  create table public.admin_memberships (user_id uuid, ativo boolean default true);
  create table public.organizacao_membros (org_id uuid, user_id uuid not null, ativo boolean not null default true);
  create table public.orcamentos (
    id text primary key, user_id uuid, criado_por uuid, criado_em timestamptz default now(), excluido_em timestamptz
  );
  create table public.trials_comerciais (
    owner_user_id uuid, estado text, termina_em timestamptz
  );
  create table public.orcamentos_publicos (
    token text primary key, user_id uuid, orcamento_id text, status text default 'enviado',
    criado_em timestamptz default now(), respondido_em timestamptz, visualizado_em timestamptz, revogado_em timestamptz
  );
  create table public.funil_exclusoes (
    id bigint generated always as identity primary key,
    user_id uuid, email text, motivo text not null, criado_por uuid, criado_em timestamptz not null default now(), org_id uuid
  );
`);
for (const f of CADEIA) await db.exec(M(f));
await db.exec(NOVA);
await db.exec(NOVA); // idempotente: o remendo não duplica o ramo
caso('cadeia real + migration nova aplicam; aplicar a nova de novo não quebra');

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
async function conta(email: string | null = null): Promise<string> {
  const id = uid();
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, created_at) values ($1, $2, now() - interval '30 days', now() - interval '30 days')`,
    [id, email ?? `prestador${seq}@exemplo.test`],
  );
  // O gatilho de boas-vindas enfileira um e-mail ao criar a conta; aqui as contas já têm 30 dias.
  await db.query('delete from public.email_outbox where user_id = $1', [id]);
  return id;
}
let tk = 0;
async function link(userId: string, horasAtras: number, extra: Record<string, string | null> = {}): Promise<string> {
  const token = `tok${String(++tk).padStart(8, '0')}abc`;
  await db.query(
    `insert into public.orcamentos_publicos (token, user_id, orcamento_id, criado_em) values ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
    [token, userId, `orc${tk}`, String(horasAtras)],
  );
  for (const [col, val] of Object.entries(extra)) {
    if (!['visualizado_em', 'respondido_em', 'revogado_em', 'status'].includes(col)) throw new Error('coluna');
    await db.query(`update public.orcamentos_publicos set ${col} = $2 where token = $1`, [token, val]);
  }
  return token;
}
const agora = () => new Date().toISOString();
async function candidatos(limite = 50) {
  const r = await db.query<{ candidato: { userId: string; token: string; enviadoEm: string } }>(
    'select candidato from public.listar_nao_abertos_email($1::timestamptz, $2)', [agora(), limite]);
  return r.rows.map((x) => x.candidato);
}
async function enviadoEm(token: string): Promise<string> {
  return (await db.query<{ e: string }>(
    `select to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as e from public.orcamentos_publicos where token = $1`, [token])).rows[0].e;
}
async function enfileirar(userId: string, token: string, dados?: Record<string, string>) {
  const d = dados ?? { tipo: 'nao_aberto', token, enviadoEm: await enviadoEm(token) };
  return (await db.query<{ r: { enfileirado: boolean; motivo: string } }>(
    `select public.enqueue_lembrete_email($1::uuid, 'lembrete_reengajamento', 'lembrete_reengajamento.v1', 'reengagement_reminder', $2, $3::jsonb, 40, now()) as r`,
    [userId, `reengajamento:${userId}:nao_aberto:${token}`, JSON.stringify(d)],
  )).rows[0].r;
}

// (2) janela e estado do link
const a = await conta();
const tA48 = await link(a, 50);
const b = await conta(); await link(b, 24);                                  // 1 dia: cedo demais
const c = await conta(); await link(c, 24 * 8);                              // 8 dias: tarde demais
const d = await conta(); await link(d, 60, { visualizado_em: agora() });     // aberto
const e = await conta(); await link(e, 60, { respondido_em: agora() });      // respondido
const f = await conta(); await link(f, 60, { revogado_em: agora() });        // orçamento apagado (link revogado)
const g = await conta(); await link(g, 60, { status: 'aprovado' });          // status já mudou
let lista = await candidatos();
assert.deepEqual(lista.map((x) => x.token), [tA48]);
assert.equal(lista[0].userId, a);
caso('só entra link enviado, fechado, sem resposta, sem revogação, entre 48 h e 7 dias');

// (3) SAIR, interna, equipe, e-mail/conta inválidos
const sup = await conta(); await link(sup, 60);
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [sup]);
const interna = await conta(); await link(interna, 60);
await db.query(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'conta interna teste')`, [interna]);
const dono = await conta(); const membro = await conta();
await db.query(`insert into public.organizacoes (id, owner_user_id) values ($1, $2)`, [uid(), dono]);
await db.query(`insert into public.organizacao_membros (org_id, user_id, ativo) values ($1, $2, true)`, [uid(), membro]);
await link(membro, 60);
const semEmail = await conta(); await db.query(`update auth.users set email = null where id = $1`, [semEmail]); await link(semEmail, 60);
const apagada = await conta(); await db.query(`update auth.users set deleted_at = now() where id = $1`, [apagada]); await link(apagada, 60);
lista = await candidatos();
assert.deepEqual(lista.map((x) => x.userId), [a]);
caso('SAIR (suprimido), conta interna, membro de equipe, sem e-mail e conta apagada ficam de fora');

// (4) 1 por conta + limit depois do filtro
const muitos = await conta();
for (let i = 0; i < 60; i++) await link(muitos, 49 + i * 0.01);
const outro = await conta(); const tOutro = await link(outro, 100);
lista = await candidatos(50);
const porConta = new Map<string, number>();
for (const x of lista) porConta.set(x.userId, (porConta.get(x.userId) ?? 0) + 1);
assert.equal(porConta.get(muitos), 1, 'conta com 60 links entra UMA vez');
assert.ok(lista.some((x) => x.token === tOutro), 'a fila das outras contas não trava');
assert.ok(lista.length === new Set(lista.map((x) => x.userId)).size);
const so2 = await candidatos(2);
assert.equal(so2.length, 2);
caso('1 candidato por conta; conta com 60 links antigos não trava a fila das outras');

// (5) enqueue
const antes = (await db.query<{ n: number }>('select count(*)::int as n from public.email_outbox')).rows[0].n;
const r1 = await enfileirar(a, tA48);
assert.deepEqual(r1, { enfileirado: true, motivo: 'enfileirado' });
const row = (await db.query<{ recipient: string; user_id: string; template_dados: Record<string, string>; purpose: string }>(
  `select recipient, user_id, template_dados, purpose from public.email_outbox where idempotency_key = $1`, [`reengajamento:${a}:nao_aberto:${tA48}`])).rows[0];
assert.equal(row.user_id, a);
assert.match(row.recipient, /^prestador\d+@exemplo\.test$/, 'vai ao e-mail do PRESTADOR (auth.users), nunca ao cliente');
assert.deepEqual(Object.keys(row.template_dados).sort(), ['enviadoEm', 'tipo', 'token'], 'nenhum dado do cliente final no payload');
assert.equal(row.purpose, 'reengagement_reminder');
assert.equal((await db.query<{ n: number }>('select count(*)::int as n from public.email_outbox')).rows[0].n, antes + 1);
caso('enfileira 1 e-mail ao prestador, payload só com tipo/token/enviadoEm');

assert.deepEqual(await enfileirar(a, tA48), { enfileirado: false, motivo: 'duplicado' });
caso('segundo pedido do mesmo orçamento = duplicado (idempotente)');

lista = await candidatos();
assert.ok(!lista.some((x) => x.userId === a), 'quem acabou de receber sai da lista (24 h + chave já usada)');
caso('depois de enviar, a conta sai da lista');

// teto de 24 h por pessoa
const t2 = await link(a, 70);
assert.deepEqual(await enfileirar(a, t2), { enfileirado: false, motivo: 'teto_pessoa_dia' });
caso('teto de 1 e-mail por 24 h por pessoa vale também para este tipo');

// reconferência sob a trava
const h = await conta(); const th = await link(h, 60);
await db.query(`update public.orcamentos_publicos set visualizado_em = now() where token = $1`, [th]);
assert.deepEqual(await enfileirar(h, th), { enfileirado: false, motivo: 'orcamento_fora_da_janela' });
const i2 = await conta(); const ti = await link(i2, 60);
await db.query(`update public.orcamentos_publicos set revogado_em = now() where token = $1`, [ti]);
assert.equal((await enfileirar(i2, ti)).motivo, 'orcamento_fora_da_janela');
const j = await conta(); const tj = await link(j, 20);
assert.equal((await enfileirar(j, tj)).motivo, 'orcamento_fora_da_janela', 'antes de 48 h não envia');
const k = await conta(); const tk2 = await link(k, 60);
assert.equal((await enfileirar(k, tk2, { tipo: 'nao_aberto', token: tk2, enviadoEm: '2020-01-01T00:00:00.000Z' })).motivo, 'orcamento_fora_da_janela', 'dado divergente do banco não envia');
const l = await conta(); const m2 = await conta(); const tl = await link(l, 60);
assert.equal((await enfileirar(m2, tl)).motivo, 'orcamento_fora_da_janela', 'token de outra conta não envia');
assert.equal((await enfileirar(l, tl, { tipo: 'nao_aberto', token: 'curto', enviadoEm: agora() })).motivo, 'dados_invalidos', 'token fora do formato não envia');
await assert.rejects(
  db.query(
    `select public.enqueue_lembrete_email($1::uuid, 'lembrete_reengajamento', 'lembrete_reengajamento.v1', 'reengagement_reminder', $2, $3::jsonb, 40, now())`,
    [l, `reengajamento:${l}:nao_aberto:outrotoken123`, JSON.stringify({ tipo: 'nao_aberto', token: tl, enviadoEm: await enviadoEm(tl) })],
  ),
  /lembrete_chave_divergente/,
  'chave que não carrega o token do pedido é rejeitada',
);
caso('reconfere sob a trava: aberto, revogado, cedo, dado divergente e token alheio não enviam');

// (7) permissões
for (const papel of ['anon', 'authenticated']) {
  const r = await db.query<{ p: boolean; q: boolean }>(
    `select has_function_privilege($1, 'public.listar_nao_abertos_email(timestamptz, integer)', 'execute') as p,
            has_function_privilege($1, 'public.enqueue_lembrete_email(uuid, text, text, text, text, jsonb, integer, timestamptz)', 'execute') as q`, [papel]);
  assert.equal(r.rows[0].p, false, `${papel} não lista`);
  assert.equal(r.rows[0].q, false, `${papel} não enfileira`);
}
caso('anon/authenticated não executam a lista nem o enqueue (só service_role)');

// (8) tipo antigo segue de pé
const n = await conta();
await db.query(`insert into public.orcamentos (id, user_id, criado_em) values ($1, $2, now() - interval '9 days')`, [`o${seq}`, n]);
const ultimo = (await db.query<{ e: string }>(`select to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as e from public.orcamentos where user_id = $1`, [n])).rows[0].e;
const antigo = (await db.query<{ r: { motivo: string } }>(
  `select public.enqueue_lembrete_email($1::uuid, 'lembrete_reengajamento', 'lembrete_reengajamento.v1', 'reengagement_reminder', $2, $3::jsonb, 40, now()) as r`,
  [n, `reengajamento:${n}:parou:d7:${ultimo}`, JSON.stringify({ tipo: 'parou', etapa: 'd7', ultimoOrcamentoEm: ultimo })])).rows[0].r;
assert.equal(antigo.motivo, 'enfileirado', 'o tipo `parou` continua enfileirando depois do remendo');
caso('o tipo antigo (`parou`) continua funcionando depois do remendo');

// a função dos outros lembretes não foi tocada
const def = (await db.query<{ d: string }>(`select pg_get_functiondef((select p.oid from pg_proc p where p.proname = 'listar_candidatos_lembrete_email' limit 1)) as d`)).rows[0].d;
assert.ok(!def.includes('nao_aberto'));
caso('a lista dos outros lembretes não foi tocada');

console.log(`\nPASSOU: ${ok} verificações`);
