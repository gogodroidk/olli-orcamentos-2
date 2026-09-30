/**
 * Verificação da migration 20260930120000 (resumo diário do dinheiro parado) num
 * Postgres REAL (PGlite), com o relógio controlado e paridade com o JS do painel.
 *
 * NÃO está na cadeia `npm test` (PGlite não é dependência do projeto). Para rodar:
 *     npm i --no-save @electric-sql/pglite@0.3
 *     node scripts/verificar-sql-resumo-dinheiro.mjs
 *
 * O que faz: cria stubs mínimos das tabelas que a migration lê (auth.users,
 * orçamentos, recibos, clientes, agenda, OS, extras_sync, outbox), aplica a
 * migration anterior (20260929200000) e esta, trocando `pg_catalog.now()` por um
 * relógio de teste, e confere:
 *   - PARIDADE: o resumo calculado pelo Worker em cima de `dados_resumo_dinheiro`
 *     é igual ao do painel em cima das linhas completas (mesma conta de borda);
 *   - seleção (sem trabalho, membro de equipe, bounce, descadastro, preferência),
 *     rodadas particionando as contas, estado da tela e opt-in × descadastro;
 *   - enqueue: idempotência, canal de dispatch, janela 7h, domingo, chave de outra
 *     conta/dia, nada acionável, dado torto, intervalo mínimo, tetos semanal e diário;
 *   - desligar pelo link cancela o que está pendente; catálogo fechado.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  console.error('PGlite ausente. Rode: npm i --no-save @electric-sql/pglite@0.3');
  process.exit(2);
}

const WT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { decidirResumo } = await import(pathToFileURL(path.join(WT, 'worker', 'src', 'resumoDinheiroPolicy.js')).href);
const { resumirDinheiroParado } = await import(pathToFileURL(path.join(WT, 'src', 'services', 'radarDinheiro.ts')).href);

const db = new PGlite();
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private; create schema teste;
create table teste.relogio (agora timestamptz not null);
insert into teste.relogio values ('2026-09-30T10:00:00Z');
create function teste.agora() returns timestamptz language sql stable as $$ select agora from teste.relogio $$;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
create table public.organizacoes (id uuid primary key, owner_user_id uuid);
create table public.organizacao_membros (org_id uuid, user_id uuid, ativo boolean);
create table public.orcamentos (id text, user_id uuid, numero text, cliente_id text, cliente_nome text, status text, subtotal numeric, valor_total numeric, dados jsonb, criado_em timestamptz, atualizado_em timestamptz, criado_por uuid, excluido_em timestamptz);
create table public.recibos (id text, user_id uuid, orcamento_id text, cliente_id text, valor_recebido numeric, dados jsonb, criado_em timestamptz, excluido_em timestamptz);
create table public.clientes (id text, user_id uuid, nome text, telefone text, excluido_em timestamptz);
create table public.agendamentos (id text, user_id uuid, cliente_id text, status text, inicio timestamptz, fim timestamptz, excluido_em timestamptz);
create table public.ordens_servico (id text, user_id uuid, orcamento_id text, status text, excluido_em timestamptz);
create table public.extras_sync (user_id uuid, chave text, dados jsonb);
create table public.email_welcome_events (event_id text primary key, recipient text, pii_purged_at timestamptz, created_at timestamptz default now());
create table public.email_outbox (
  id bigint generated always as identity primary key,
  event_id text not null references public.email_welcome_events (event_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid, idempotency_key text not null,
  template text not null check (template = 'boas_vindas'),
  template_version text not null check (template_version = 'boas_vindas.v1'),
  purpose text not null check (purpose = 'account_onboarding'),
  recipient text, attempts integer not null default 0, status text not null default 'pending',
  next_attempt_at timestamptz, provider_id text, error_code text, pii_purged_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  dispatch_scope text not null default 'hold', claim_token uuid, claimed_by text, lease_expires_at timestamptz
);
create unique index email_outbox_idempotency_uidx on public.email_outbox (idempotency_key);
`);

const anterior = fs.readFileSync(path.join(WT, 'supabase', 'migrations', '20260929200000_email_producao_lembretes.sql'), 'utf8');
await db.exec(anterior);
// created_at do INSERT do enqueue usa o default now(): amarra ao relógio de teste.
await db.exec(`alter table public.email_outbox alter column created_at set default teste.agora();`);
const nova = fs.readFileSync(path.join(WT, 'supabase', 'migrations', '20260930120200_resumo_dinheiro_email.sql'), 'utf8')
  .replaceAll('pg_catalog.now()', 'teste.agora()');
await db.exec(nova);
console.log('migrations aplicadas');

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setAgora = (iso) => q('update teste.relogio set agora = $1', [iso]);
async function usuario(n, extra = {}) {
  await q('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)', [U(n), `u${n}@exemplo.com`, '2026-01-01T00:00:00Z']);
  if (extra.membro) await q('insert into public.organizacao_membros values ($1, $2, true)', [U(900), U(n)]);
}
const diasAtras = (base, d) => new Date(new Date(base).getTime() - d * 864e5).toISOString();
const AGORA = '2026-09-30T10:00:00Z';

// ── Conta 1: rica em casos de borda ─────────────────────────────────────────
await usuario(1);
const orcs1 = [
  ['a', 'aprovado', 1000, null, diasAtras(AGORA, 20), diasAtras(AGORA, 12), { valorTotal: 1000, clienteNome: 'Maria', clienteTelefone: '11999990000' }, 'c1'],
  ['b', ' Convertido', null, null, diasAtras(AGORA, 5), null, { valorTotal: 250.5, atualizadoEm: diasAtras(AGORA, 4) }, 'c2'],
  ['c', 'aprovado', null, null, diasAtras(AGORA, 5), null, { clienteId: 'c1' }, null], // sem valor
  ['d', 'enviado', 500, null, diasAtras(AGORA, 10), diasAtras(AGORA, 9), null, 'c3'],
  ['e', 'visualizado', 300, null, diasAtras(AGORA, 2), diasAtras(AGORA, 1), null, 'c3'],
  ['f', 'rascunho', 900, null, diasAtras(AGORA, 90), null, null, 'c4'],
  ['g', 'aprovado', 700, null, diasAtras(AGORA, 200), diasAtras(AGORA, 200), null, 'c5'], // OS concluída
  ['h', 'aprovado', 400, null, diasAtras(AGORA, 300), diasAtras(AGORA, 300), null, 'c6'],
];
for (const [id, status, vt, st, cr, at, dados, cli] of orcs1) {
  await q('insert into public.orcamentos (id, user_id, status, valor_total, subtotal, criado_em, atualizado_em, dados, cliente_id, cliente_nome) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [id, U(1), status, vt, st, cr, at, dados ? JSON.stringify(dados) : null, cli, 'Fulano']);
}
await q(`insert into public.orcamentos (id, user_id, status, valor_total, criado_em, excluido_em) values ('z', $1, 'aprovado', 99999, $2, $2)`, [U(1), diasAtras(AGORA, 3)]);
await q(`insert into public.recibos (id, user_id, orcamento_id, cliente_id, valor_recebido, dados, criado_em) values
  ('r1', $1, 'a', 'c1', 300, null, $2),
  ('r2', $1, null, 'c6', null, '{"valorRecebido": 400, "orcamentoId": "h", "dataRecebimento": "01/09/2026"}', $3),
  ('r3', $1, null, 'c7', 50, '{"dataRecebimento": "01/03/2026"}', $3)`, [U(1), diasAtras(AGORA, 1), diasAtras(AGORA, 400)]);
for (const c of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) await q('insert into public.clientes values ($1, $2, $3, $4, null)', [c, U(1), `Nome ${c}`, '11999990000']);
await q(`insert into public.agendamentos values ('ag1', $1, 'c8', 'concluido', $2, $2, null), ('ag2', $1, 'c4', 'agendado', $3, $3, null)`, [U(1), diasAtras(AGORA, 190), diasAtras(AGORA, 400)]);
await q(`insert into public.ordens_servico values ('os1', $1, 'g', 'concluida', null)`, [U(1)]);
await q(`insert into public.extras_sync values ($1, 'radar.snooze', $2)`, [U(1), JSON.stringify({ c8: '2026-12-01T00:00:00Z', x: 1 })]);

// Painel: as linhas COMPLETAS que ele lê (lixeira fora), direto das tabelas.
const linhas = async (t) => (await q(`select * from public.${t} where user_id = $1 and excluido_em is null`, [U(1)])).rows;
const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const painelOrc = (await linhas('orcamentos')).map((o) => ({ ...o, valor_total: num(o.valor_total), subtotal: num(o.subtotal), criado_em: iso(o.criado_em), atualizado_em: iso(o.atualizado_em) }));
const painelRec = (await linhas('recibos')).map((r) => ({ ...r, valor_recebido: num(r.valor_recebido), criado_em: iso(r.criado_em) }));
const painelAg = (await linhas('agendamentos')).map((a) => ({ ...a, inicio: iso(a.inicio), fim: iso(a.fim) }));
const painel = resumirDinheiroParado({
  orcamentos: painelOrc, recibos: painelRec, clientes: await linhas('clientes'), agendamentos: painelAg,
  adiados: { c8: '2026-12-01T00:00:00Z' },
  orcamentosFinalizados: new Set((await linhas('ordens_servico')).filter((s) => s.status === 'concluida').map((s) => s.orcamento_id)),
}, new Date(AGORA));

const dados = (await one('select public.dados_resumo_dinheiro($1, 2000) as d', [U(1)])).d;
const servidor = decidirResumo(U(1), JSON.parse(JSON.stringify(dados)), { agora: new Date(AGORA) });
console.log('painel', JSON.stringify(painel));
console.log('servidor', JSON.stringify(servidor.pedido?.dados));
assert.equal(servidor.enfileirar, true);
assert.deepEqual({ ...servidor.pedido.dados }, {
  data: '2026-09-30', aReceberCentavos: painel.aReceber.centavos, aReceberItens: painel.aReceber.itens,
  diasMaisAntigo: painel.aReceber.diasMaisAntigo, semValor: painel.aReceber.semValor,
  propostasParadas: painel.propostasParadas, clientesSumidos: painel.clientesSumidos,
});
assert.equal(JSON.stringify(dados).includes('Maria') || JSON.stringify(dados).includes('11999990000'), false);
assert.equal(dados.truncado, false);
const trunc = (await one('select public.dados_resumo_dinheiro($1, 2) as d', [U(1)])).d;
assert.equal(trunc.truncado, true);
console.log('paridade SQL real × painel: OK; truncado: OK; sem PII: OK');

// ── Seleção ─────────────────────────────────────────────────────────────────
await usuario(2); // sem trabalho nenhum
await usuario(3, { membro: true }); // membro de equipe alheia
await q(`insert into public.orcamentos (id, user_id, status, valor_total, criado_em) values ('m', $1, 'aprovado', 10, $2)`, [U(3), AGORA]);
await usuario(4); // bounce
await q(`insert into public.orcamentos (id, user_id, status, valor_total, criado_em) values ('b4', $1, 'aprovado', 10, $2)`, [U(4), AGORA]);
await q(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [U(4)]);
await usuario(5); // descadastro de lembretes → desligado por padrão
await q(`insert into public.orcamentos (id, user_id, status, valor_total, criado_em) values ('b5', $1, 'aprovado', 10, $2)`, [U(5), AGORA]);
await q(`insert into public.email_supressoes (user_id, motivo, origem, criado_em) values ($1, 'descadastro', 'link_email', '2026-09-01T00:00:00Z')`, [U(5)]);
await usuario(6); // preferência desligada
await q(`insert into public.orcamentos (id, user_id, status, valor_total, criado_em) values ('b6', $1, 'aprovado', 10, $2)`, [U(6), AGORA]);
await q(`insert into public.email_preferencias values ($1, false, 'painel', '2026-09-20T00:00:00Z')`, [U(6)]);
await usuario(7); // só recibo antigo (cliente sumido possível)
await q(`insert into public.recibos (id, user_id, cliente_id, valor_recebido, criado_em) values ('r7', $1, 'k', 10, $2)`, [U(7), diasAtras(AGORA, 400)]);

const cand = async (rodada = 0, rodadas = 1, extra = {}) => (await q(
  'select user_id from public.listar_candidatos_resumo_dinheiro($1, $2, $3, $4, $5, 50)',
  [extra.now ?? AGORA, extra.maxSemana ?? 3, 44, rodada, rodadas],
)).rows.map((r) => r.user_id).sort();
assert.deepEqual(await cand(), [U(1), U(7)]);
console.log('seleção (sem trabalho, membro, bounce, descadastro, preferência off): OK');

// Rodadas: cada conta cai em exatamente uma das 6.
const porRodada = [];
for (let r = 0; r < 6; r++) porRodada.push(...(await cand(r, 6)));
assert.deepEqual(porRodada.sort(), [U(1), U(7)]);
console.log('rodadas particionam as contas: OK');

// Estado da tela e opt-in que vence descadastro antigo.
await q(`select set_config('teste.uid', $1, false)`, [U(5)]);
let estado = (await one('select public.meu_resumo_dinheiro_email() as e')).e;
assert.deepEqual(estado, { ativo: false, padrao: true, bloqueio: 'descadastro', elegivel: true });
estado = (await one(`select public.definir_resumo_dinheiro_email(true, 'app') as e`)).e;
assert.equal(estado.ativo, true);
assert.deepEqual(await cand(), [U(1), U(5), U(7)]);
// Novo descadastro DEPOIS do "ligar" vence de novo — pelo caminho REAL (a rota do
// link chama `registrar_supressao_email`; a linha de descadastro já existe desde 01/09).
const redescad = await one(`select public.registrar_supressao_email($1, 'descadastro', 'link_email') as r`, [U(5)]);
assert.equal(redescad.r.registrado, true);
assert.equal((await one('select public.meu_resumo_dinheiro_email() as e')).e.ativo, false);
assert.equal((await one('select count(*)::int n from public.email_supressoes where user_id = $1', [U(5)])).n, 1);
// E religar depois disso vale de novo (a última palavra é sempre a mais nova).
assert.equal((await one(`select public.definir_resumo_dinheiro_email(true, 'app') as e`)).e.ativo, true);
await q(`select public.registrar_supressao_email($1, 'descadastro', 'one_click')`, [U(5)]);
assert.equal((await one('select public.meu_resumo_dinheiro_email() as e')).e.ativo, false);
await q(`select set_config('teste.uid', $1, false)`, [U(3)]);
assert.equal((await one('select public.meu_resumo_dinheiro_email() as e')).e.elegivel, false);
let erro = null;
try { await q(`select public.definir_resumo_dinheiro_email(true, 'link_email')`); } catch (e) { erro = e.message; }
assert.match(erro, /resumo_argumentos_invalidos/);
console.log('estado/preferência da tela: OK');

// ── Enqueue ─────────────────────────────────────────────────────────────────
const d1 = { ...servidor.pedido.dados };
const enq = async (uid, dados, now = AGORA, chave = `resumo:dinheiro:${uid}:${dados.data}`, extra = {}) => (await one(
  'select public.enqueue_resumo_dinheiro_email($1, $2, $3, $4, 44, $5, $6) as r',
  [uid, chave, JSON.stringify(dados), extra.maxSemana ?? 3, extra.teto ?? 100, now],
)).r;
assert.deepEqual(await enq(U(1), d1), { enfileirado: true, motivo: 'enfileirado' });
assert.deepEqual(await enq(U(1), d1), { enfileirado: false, motivo: 'duplicado' });
const linha = await one(`select template, template_version, purpose, dispatch_scope, recipient, status from public.email_outbox where user_id = $1`, [U(1)]);
assert.deepEqual(linha, { template: 'resumo_dinheiro', template_version: 'resumo_dinheiro.v1', purpose: 'money_digest', dispatch_scope: 'production', recipient: 'u1@exemplo.com', status: 'pending' });
assert.deepEqual(await cand(), [U(7)]); // já recebeu hoje
console.log('enqueue + idempotência + escopo production pelo canal: OK');

// Janela, domingo, chave de outra conta/dia, nada acionável, dado torto.
await setAgora('2026-09-30T11:00:00Z');
assert.equal((await enq(U(7), { ...d1, data: '2026-09-30' }, '2026-09-30T11:00:00Z')).motivo, 'fora_da_janela');
await setAgora('2026-10-04T10:00:00Z');
assert.equal((await enq(U(7), { ...d1, data: '2026-10-04' }, '2026-10-04T10:00:00Z')).motivo, 'domingo');
await setAgora(AGORA);
for (const [dados, chave] of [[d1, `resumo:dinheiro:${U(1)}:2026-09-30`], [{ ...d1, data: '2026-09-29' }, `resumo:dinheiro:${U(7)}:2026-09-29`]]) {
  erro = null;
  try { await enq(U(7), dados, AGORA, chave); } catch (e) { erro = e.message; }
  assert.match(erro, /resumo_chave_divergente/);
}
const vazio = { data: '2026-09-30', aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null, semValor: 3, propostasParadas: 0, clientesSumidos: 0 };
assert.equal((await enq(U(7), vazio)).motivo, 'nada_acionavel');
erro = null;
try { await enq(U(7), { ...d1, aReceberCentavos: 'muito' }); } catch (e) { erro = e.message; }
assert.match(erro, /resumo_dados_invalidos/);
assert.equal((await enq(U(6), { ...d1 })).motivo, 'desligado');
assert.equal((await enq(U(3), { ...d1 })).motivo, 'nao_e_dono');
assert.equal((await enq(U(4), { ...d1 })).motivo, 'desligado');
console.log('janela/domingo/chave/acionável/preferência/dono: OK');

// Intervalo mínimo, teto semanal, teto diário.
await setAgora('2026-10-01T10:00:00Z');
const dia = (d) => ({ ...d1, data: d });
assert.equal((await enq(U(1), dia('2026-10-01'), '2026-10-01T10:00:00Z')).motivo, 'intervalo_minimo');
await setAgora('2026-10-02T10:00:00Z');
assert.equal((await enq(U(1), dia('2026-10-02'), '2026-10-02T10:00:00Z')).motivo, 'enfileirado');
await setAgora('2026-10-05T10:00:00Z');
assert.equal((await enq(U(1), dia('2026-10-05'), '2026-10-05T10:00:00Z', undefined, { maxSemana: 2 })).motivo, 'teto_semanal');
assert.equal((await enq(U(1), dia('2026-10-05'), '2026-10-05T10:00:00Z')).motivo, 'enfileirado');
assert.equal((await enq(U(7), dia('2026-10-05'), '2026-10-05T10:00:00Z', undefined, { teto: 1 })).motivo, 'teto_diario');
console.log('intervalo mínimo, teto semanal e teto diário: OK');

// Desligar pelo link cancela o que está pendente; descadastro de lembretes também.
const d2 = await one(`select public.desligar_resumo_dinheiro_email_servico($1, 'one_click') as r`, [U(1)]);
assert.deepEqual(d2.r, { registrado: true });
const pend = await one(`select count(*)::int n from public.email_outbox where user_id = $1 and status = 'pending'`, [U(1)]);
assert.equal(pend.n, 0);
const cancel = await one(`select count(*)::int n from public.email_outbox where user_id = $1 and error_code = 'suprimido_antes_do_envio'`, [U(1)]);
assert.equal(cancel.n, 3);
console.log('desligar pelo link cancela pendentes: OK');

// Catálogo e tamanho de template_dados continuam valendo.
erro = null;
try {
  await q(`insert into public.email_outbox (event_id, user_id, idempotency_key, template, template_version, purpose, recipient, next_attempt_at, template_dados)
    values ('x', $1, 'x', 'resumo_dinheiro', 'resumo_dinheiro.v2', 'money_digest', 'a@b.c', now(), '{}')`, [U(7)]);
} catch (e) { erro = e.message; }
assert.match(erro, /email_outbox_template_catalogo_check/);
console.log('\nTUDO OK — migration 20260930120000 verificada no Postgres (PGlite)');
