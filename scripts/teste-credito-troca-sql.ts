/**
 * Crédito de troca — migration 20261002153417_creditos_troca.sql rodando DE
 * VERDADE num Postgres em memória (PGlite), não regex sobre o arquivo.
 *
 * Monta o mínimo que as funções usam (auth.uid()/auth.jwt() lidos de configuração
 * de sessão, storage.objects, organizacoes/membros, assinaturas, admin_memberships,
 * admin_audit_log append-only) e aplica o entitlement fechado de produção
 * (20260914115639) para provar o efeito no plano efetivo.
 *
 * Cobre: pedido válido; validações (sessão, app, vencimento, comprovante de outra
 * pessoa, arquivo inexistente, membro de equipe); 1 por conta (pendente/aprovado,
 * índice único); reenvio depois de recusa; teto de pedidos; RLS (dono vê o seu,
 * outro não vê, admin com AAL2 vê todos, AAL1 não, ninguém escreve direto);
 * decisão atômica e auditada (papel, motivo, meses 1..3, idempotência por
 * request_id, "já decidido"); guarda do concederPlanoPeriodo (preserva nível e
 * vigência maiores) e campos do gateway intocados (não é venda).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { CREDITO_TROCA_MESES_MAX, CREDITO_TROCA_PEDIDOS_MAX } from '../src/services/limitesComerciais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sqlNova = ler('../supabase/migrations/20261002153417_creditos_troca.sql');
const sqlEntitlement = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');

let ok = 0;
async function caso(nome: string, fn: () => Promise<void> | void): Promise<void> {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

console.log('\nCrédito de troca — SQL real (PGlite)');

// ─── Paridade com a fonte (limitesComerciais.ts) ────────────────────────────
await caso('teto de meses do SQL = CREDITO_TROCA_MESES_MAX', () => {
  assert.match(sqlNova, new RegExp(`meses_concedidos between 1 and ${CREDITO_TROCA_MESES_MAX}\\)`));
  assert.match(sqlNova, new RegExp(`p_meses > ${CREDITO_TROCA_MESES_MAX}\\) then raise exception 'meses_invalidos'`));
});
await caso('teto de pedidos do SQL = CREDITO_TROCA_PEDIDOS_MAX', () => {
  assert.match(sqlNova, new RegExp(`if v_total >= ${CREDITO_TROCA_PEDIDOS_MAX} then raise exception 'limite_pedidos'`));
});
await caso('migration não apaga dado nem toca nos campos do gateway no update', () => {
  assert.doesNotMatch(sqlNova, /delete\s+from/i);
  assert.doesNotMatch(sqlNova, /drop\s+table/i);
  const conflito = sqlNova.match(/on conflict \(user_id\) do update set([\s\S]*?);/)?.[1] ?? '';
  assert.ok(conflito.length > 0, 'upsert existe');
  assert.doesNotMatch(conflito, /\b(plano|status|current_period_end|stripe_\w+)\s*=/, 'upsert só mexe no override');
});

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('teste.jwt', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to authenticated, service_role;
  grant execute on all functions in schema auth to authenticated, service_role;
  create table storage.objects (bucket_id text not null, name text not null);
  grant usage on schema storage to authenticated, service_role;

  create table public.organizacoes (id uuid primary key, owner_user_id uuid not null references auth.users(id));
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, ativo boolean not null default true);
  create table public.trials_comerciais (tenant_id uuid, estado text, iniciado_em timestamptz, termina_em timestamptz);
  create table public.assinaturas (
    user_id uuid primary key,
    plano text,
    status text,
    stripe_customer_id text,
    stripe_subscription_id text,
    current_period_end timestamptz,
    admin_plano_override text,
    admin_override_ativo boolean not null default false,
    admin_override_ate timestamptz,
    admin_override_reason text,
    admin_override_by uuid,
    admin_override_at timestamptz,
    atualizado_em timestamptz
  );
  create table public.admin_memberships (
    user_id uuid primary key references auth.users(id),
    papel text not null,
    ativo boolean not null default true
  );
  alter table public.admin_memberships enable row level security;
  alter table public.admin_memberships force row level security;
  create table public.admin_audit_log (
    id bigint generated always as identity primary key,
    actor_user_id uuid,
    actor_role text not null,
    acao text not null,
    target_user_id uuid,
    motivo text not null,
    antes jsonb,
    depois jsonb,
    request_id text,
    criado_em timestamptz not null default now()
  );
  create unique index admin_audit_log_actor_request_uidx on public.admin_audit_log (actor_user_id, request_id) where request_id is not null;
  create function public.admin_audit_append_only() returns trigger language plpgsql as
    $$ begin raise exception 'admin_audit_log e append-only'; end; $$;
  create trigger admin_audit_no_update before update on public.admin_audit_log for each row execute function public.admin_audit_append_only();
  create trigger admin_audit_no_delete before delete on public.admin_audit_log for each row execute function public.admin_audit_append_only();
`);
await db.exec(sqlEntitlement);
await db.exec(sqlNova);

let seq = 0;
function novoUuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}
async function novoUsuario(): Promise<string> {
  const id = novoUuid();
  await db.exec('reset role');
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}
async function comprovante(uid: string): Promise<string> {
  const nome = `${uid}/anexo/${novoUuid()}.jpg`;
  await db.exec('reset role');
  await db.query(`insert into storage.objects (bucket_id, name) values ('olli-documentos', $1)`, [nome]);
  return `olli-documentos/${nome}`;
}
async function como(uid: string | null, aal: 'aal1' | 'aal2' = 'aal1'): Promise<void> {
  await db.exec('reset role');
  await db.query(`select set_config('teste.uid', $1, false)`, [uid ?? '']);
  await db.query(`select set_config('teste.jwt', $1, false)`, [JSON.stringify({ aal })]);
  if (uid) await db.exec('set role authenticated');
}
async function comoServico(): Promise<void> {
  await db.exec('reset role');
  await db.query(`select set_config('teste.uid', '', false)`);
  await db.exec('set role service_role');
}
async function superusuario(): Promise<void> {
  await db.exec('reset role');
}
async function falha(promessa: Promise<unknown>, codigo: string): Promise<void> {
  await assert.rejects(promessa, (e: Error) => {
    assert.ok(String(e.message).includes(codigo), `esperava ${codigo}, veio ${e.message}`);
    return true;
  });
}
async function pedir(uid: string, chave?: string, extra: { app?: string; vence?: string | null } = {}) {
  await como(uid);
  const c = chave ?? (await (async () => { await superusuario(); const k = await comprovante(uid); await como(uid); return k; })());
  const r = await db.query<{ r: { id: string; status: string } }>(
    'select public.solicitar_credito_troca($1, $2::date, $3, $4) as r',
    [extra.app ?? 'Clima Bot', extra.vence === undefined ? null : extra.vence, 'anual pago em agosto', c],
  );
  return r.rows[0].r;
}
async function decidir(actor: string, papel: string, pedido: string, aprovar: boolean, meses: number | null, motivo: string, requestId = `req-${novoUuid()}`) {
  await comoServico();
  const r = await db.query<{ r: Record<string, unknown> }>(
    'select public.admin_decidir_credito_troca($1, $2, $3, $4, $5, $6, $7) as r',
    [actor, papel, pedido, aprovar, meses, motivo, requestId],
  );
  return r.rows[0].r;
}

const admin = await novoUsuario();
await db.query(`insert into public.admin_memberships (user_id, papel, ativo) values ($1, 'financeiro', true)`, [admin]);

// ─── Pedido do prestador ─────────────────────────────────────────────────────
await caso('sem sessão não pede', async () => {
  await como(null);
  await falha(db.query(`select public.solicitar_credito_troca('X', null, null, 'olli-documentos/a/anexo/b.jpg')`), 'sessao_obrigatoria');
});

const ana = await novoUsuario();
await caso('validações do pedido (app, vencimento, comprovante)', async () => {
  await superusuario();
  const chave = await comprovante(ana);
  await como(ana);
  await falha(db.query(`select public.solicitar_credito_troca('X', null, null, $1)`, [chave]), 'app_invalido');
  await falha(db.query(`select public.solicitar_credito_troca('Clima Bot', current_date - 1, null, $1)`, [chave]), 'vencimento_invalido');
  await falha(db.query(`select public.solicitar_credito_troca('Clima Bot', null, null, $1)`, ['olli-fotos/' + ana + '/anexo/a.jpg']), 'comprovante_invalido');
  await falha(db.query(`select public.solicitar_credito_troca('Clima Bot', null, null, $1)`, [`olli-documentos/${ana}/anexo/../x.jpg`]), 'comprovante_invalido');
});

await caso('comprovante na pasta de OUTRA pessoa é recusado', async () => {
  const outro = await novoUsuario();
  await superusuario();
  const chaveDoOutro = await comprovante(outro);
  await como(ana);
  await falha(db.query(`select public.solicitar_credito_troca('Clima Bot', null, null, $1)`, [chaveDoOutro]), 'comprovante_invalido');
});

await caso('comprovante que não existe no storage é recusado', async () => {
  await como(ana);
  await falha(
    db.query(`select public.solicitar_credito_troca('Clima Bot', null, null, $1)`, [`olli-documentos/${ana}/anexo/nao-existe.jpg`]),
    'comprovante_inexistente',
  );
});

await caso('membro de equipe de outro dono não consome crédito', async () => {
  const dono = await novoUsuario();
  const tecnico = await novoUsuario();
  const org = novoUuid();
  await superusuario();
  await db.query('insert into public.organizacoes (id, owner_user_id) values ($1, $2)', [org, dono]);
  await db.query('insert into public.organizacao_membros (org_id, user_id, ativo) values ($1, $2, true)', [org, tecnico]);
  const chave = await comprovante(tecnico);
  await como(tecnico);
  await falha(db.query(`select public.solicitar_credito_troca('Profissa', null, null, $1)`, [chave]), 'somente_dono');
});

let pedidoAna = '';
await caso('pedido válido nasce pendente', async () => {
  const futuro = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const r = await pedir(ana, undefined, { vence: futuro });
  assert.equal(r.status, 'pendente');
  pedidoAna = r.id;
});

await caso('segundo pedido com um em análise: pedido_em_analise', async () => {
  await falha(pedir(ana), 'pedido_em_analise');
});

await caso('índice único: no máximo 1 pendente/aprovado por conta (mesmo fora da RPC)', async () => {
  await superusuario();
  const chave = await comprovante(ana);
  await falha(
    db.query(`insert into public.creditos_troca (user_id, app_anterior, comprovante_chave) values ($1, 'Outro', $2)`, [ana, chave]),
    'creditos_troca_uma_vez_por_conta',
  );
});

// ─── RLS ─────────────────────────────────────────────────────────────────────
const bia = await novoUsuario();
await caso('RLS: dono vê o seu; outro usuário não vê', async () => {
  await como(ana);
  const meus = await db.query('select id from public.creditos_troca');
  assert.equal(meus.rows.length, 1);
  await como(bia);
  const alheios = await db.query('select id from public.creditos_troca');
  assert.equal(alheios.rows.length, 0);
});

await caso('RLS: admin com AAL2 vê todos; com AAL1 não', async () => {
  await como(admin, 'aal2');
  assert.equal((await db.query('select id from public.creditos_troca')).rows.length, 1);
  await como(admin, 'aal1');
  assert.equal((await db.query('select id from public.creditos_troca')).rows.length, 0);
});

await caso('ninguém escreve direto na tabela (só pelas RPCs)', async () => {
  await como(ana);
  await falha(db.query(`update public.creditos_troca set status = 'aprovado'`), 'permission denied');
  await falha(
    db.query(`insert into public.creditos_troca (user_id, app_anterior, comprovante_chave) values ($1, 'X1', $2)`, [ana, `olli-documentos/${ana}/anexo/a.jpg`]),
    'permission denied',
  );
  await falha(db.query('select decidido_por from public.creditos_troca'), 'permission denied');
});

await caso('cliente não executa a decisão do admin', async () => {
  await como(ana);
  await falha(
    db.query(`select public.admin_decidir_credito_troca($1, 'owner', $2, true, 3, 'eu mesmo', 'req-aaaaaaaaaaaaaaaa')`, [ana, pedidoAna]),
    'permission denied',
  );
});

// ─── Decisão ─────────────────────────────────────────────────────────────────
await caso('papel sem permissão, motivo curto e meses fora de 1..3 são recusados', async () => {
  await falha(decidir(admin, 'suporte', pedidoAna, true, 3, 'conferido'), 'papel_sem_permissao');
  await falha(decidir(admin, 'financeiro', pedidoAna, false, null, 'x'), 'motivo_invalido');
  await falha(decidir(admin, 'financeiro', pedidoAna, true, CREDITO_TROCA_MESES_MAX + 1, 'conferido'), 'meses_invalidos');
  await falha(decidir(admin, 'financeiro', pedidoAna, true, 0, 'conferido'), 'meses_invalidos');
});

await caso('aprovar: Pro por N meses via override, auditado, gateway intocado', async () => {
  await superusuario();
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, current_period_end, stripe_subscription_id)
     values ($1, 'gratis', 'canceled', now() - interval '1 day', 'sub_real_123')`,
    [ana],
  );
  const reqId = `req-${novoUuid()}`;
  const r = await decidir(admin, 'financeiro', pedidoAna, true, 3, 'comprovante conferido', reqId);
  assert.equal(r.plano_efetivo_override, 'pro');
  await superusuario();
  const a = (await db.query<Record<string, unknown>>('select * from public.assinaturas where user_id = $1', [ana])).rows[0];
  assert.equal(a.admin_plano_override, 'pro');
  assert.equal(a.admin_override_ativo, true);
  assert.equal(a.status, 'canceled', 'status do gateway intocado');
  assert.equal(a.plano, 'gratis', 'plano do gateway intocado');
  assert.equal(a.stripe_subscription_id, 'sub_real_123');
  assert.match(String(a.admin_override_reason), /^Crédito de troca \(Clima Bot\)/);
  const dias = (new Date(a.admin_override_ate as string).getTime() - Date.now()) / 86400000;
  assert.ok(dias > 85 && dias < 95, `3 meses ≈ 90 dias (veio ${dias})`);
  const p = (await db.query<Record<string, unknown>>('select * from public.creditos_troca where id = $1', [pedidoAna])).rows[0];
  assert.equal(p.status, 'aprovado');
  assert.equal(p.meses_concedidos, 3);
  assert.equal(p.decidido_por, admin);
  const audit = (await db.query<Record<string, unknown>>('select * from public.admin_audit_log where request_id = $1', [reqId])).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].acao, 'credito_troca_aprovado');
  assert.equal(audit[0].target_user_id, ana);
  // Plano efetivo autoritativo do servidor passa a ser Pro.
  const ef = await db.query<{ p: string }>('select public.plano_comercial_efetivo($1, $2) as p', [ana, novoUuid()]);
  assert.equal(ef.rows[0].p, 'pro');

  // Idempotência: o mesmo request_id devolve o mesmo resultado, sem 2ª auditoria.
  const de_novo = await decidir(admin, 'financeiro', pedidoAna, true, 3, 'comprovante conferido', reqId);
  assert.deepEqual(de_novo, r);
  await superusuario();
  assert.equal((await db.query('select 1 from public.admin_audit_log where request_id = $1', [reqId])).rows.length, 1);
});

await caso('pedido já decidido não decide de novo', async () => {
  await falha(decidir(admin, 'financeiro', pedidoAna, false, null, 'mudei de ideia'), 'pedido_ja_decidido');
});

await caso('1 vez por conta: depois de aprovado, novo pedido = credito_ja_usado', async () => {
  await falha(pedir(ana), 'credito_ja_usado');
});

await caso('recusar exige motivo, grava e audita; reenvio é permitido até o teto', async () => {
  const carla = await novoUsuario();
  for (let i = 1; i <= CREDITO_TROCA_PEDIDOS_MAX; i++) {
    const p = await pedir(carla, undefined, { app: 'Profissa' });
    const r = await decidir(admin, 'owner', p.id, false, null, 'print ilegível, envie de novo');
    assert.equal((r.pedido as { status: string }).status, 'recusado');
    assert.equal((r.pedido as { motivo_recusa: string }).motivo_recusa, 'print ilegível, envie de novo');
  }
  await falha(pedir(carla), 'limite_pedidos');
  await superusuario();
  const n = await db.query(`select 1 from public.admin_audit_log where target_user_id = $1 and acao = 'credito_troca_recusado'`, [carla]);
  assert.equal(n.rows.length, CREDITO_TROCA_PEDIDOS_MAX);
  const ass = await db.query('select 1 from public.assinaturas where user_id = $1', [carla]);
  assert.equal(ass.rows.length, 0, 'recusa não cria assinatura');
});

await caso('guarda: Empresa manual sem data final continua Empresa sem data final', async () => {
  const davi = await novoUsuario();
  await superusuario();
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, admin_plano_override, admin_override_ativo, admin_override_ate)
     values ($1, 'empresa', 'canceled', 'empresa', true, null)`,
    [davi],
  );
  const p = await pedir(davi);
  const r = await decidir(admin, 'admin', p.id, true, 2, 'conferido');
  assert.equal(r.plano_efetivo_override, 'empresa');
  assert.equal(r.override_ate, null);
  await superusuario();
  const a = (await db.query<Record<string, unknown>>('select * from public.assinaturas where user_id = $1', [davi])).rows[0];
  assert.equal(a.admin_plano_override, 'empresa');
  assert.equal(a.admin_override_ate, null);
});

await caso('guarda: Pro manual mais longo mantém a vigência maior', async () => {
  const edu = await novoUsuario();
  await superusuario();
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, admin_plano_override, admin_override_ativo, admin_override_ate)
     values ($1, 'pro', 'canceled', 'pro', true, now() + interval '200 days')`,
    [edu],
  );
  const p = await pedir(edu);
  await decidir(admin, 'owner', p.id, true, 1, 'conferido');
  await superusuario();
  const a = (await db.query<Record<string, unknown>>('select admin_override_ate from public.assinaturas where user_id = $1', [edu])).rows[0];
  const dias = (new Date(a.admin_override_ate as string).getTime() - Date.now()) / 86400000;
  assert.ok(dias > 195, 'vigência maior preservada');
});

await caso('override vencido não segura nada: vale o crédito novo', async () => {
  const fabi = await novoUsuario();
  await superusuario();
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, admin_plano_override, admin_override_ativo, admin_override_ate)
     values ($1, 'empresa', 'canceled', 'empresa', true, now() - interval '1 day')`,
    [fabi],
  );
  const p = await pedir(fabi);
  const r = await decidir(admin, 'owner', p.id, true, 1, 'conferido');
  assert.equal(r.plano_efetivo_override, 'pro');
});

await caso('sem linha de assinatura: cria só com override (status canceled, sem gateway)', async () => {
  const gil = await novoUsuario();
  const p = await pedir(gil);
  await decidir(admin, 'owner', p.id, true, 1, 'conferido');
  await superusuario();
  const a = (await db.query<Record<string, unknown>>('select * from public.assinaturas where user_id = $1', [gil])).rows[0];
  assert.equal(a.status, 'canceled');
  assert.equal(a.current_period_end, null);
  assert.equal(a.stripe_subscription_id, null);
  assert.equal(a.admin_override_ativo, true);
});

await caso('pedido inexistente', async () => {
  await falha(decidir(admin, 'owner', novoUuid(), false, null, 'nada'), 'pedido_inexistente');
});

await db.close();
console.log(`\nPASSOU: ${ok} casos`);
