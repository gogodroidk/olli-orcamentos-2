/**
 * Z-53 — anti-abuso do trial (3 e-mails, 1 pessoa).
 *
 * Roda a migration 20261103193000 em Postgres de memória (PGlite). Não aplica
 * nada em produção. Cobre a caixa normalizada, a marca só com hash, o primeiro
 * teste liberado, o seguinte recusado sem apagar o que já existe, quem paga
 * fora do bloqueio, IP que só reforça, e o texto que o app mostra.
 *
 *     node scripts/teste-anti-abuso-trial-sql.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { avisoTrialNaoIniciado, interpretarInicioTrial } from '../src/services/limitesComerciais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sqlCota = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const sqlLint = ler('../supabase/migrations/20260910143000_fix_ia_quota_lint.sql');
const sqlEntitlement = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');
const sqlAuto = ler('../supabase/migrations/20260930120000_trial_pro_automatico_primeiro_envio.sql');
const sqlNova = ler('../supabase/migrations/20261103193000_anti_abuso_trial_caixa.sql');

const reservaCorrigida = sqlLint.match(
  /create or replace function public\.reservar_envio_orcamento_gratis\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(reservaCorrigida, 'a versão corrigida de reservar_envio_orcamento_gratis precisa existir');

assert.doesNotMatch(sqlNova, /meu_estado_oferta_comercial/, 'não mexe no texto da oferta do Grátis');
assert.doesNotMatch(sqlNova, /limite_gratis_config/, 'não liga o corte do Grátis');
assert.doesNotMatch(sqlNova, /até 5/, 'não publica teto');
assert.doesNotMatch(sqlNova, /delete\s+from\s+public\.trials_comerciais/i, 'não apaga teste');
assert.doesNotMatch(sqlNova, /delete\s+from\s+auth\.users/i, 'não apaga conta');
assert.match(ler('../src/services/limitesComerciais.ts'), /GRÁTIS = ORÇAMENTOS ILIMITADOS/, 'o contrato do Grátis ilimitado continua escrito');
for (const arquivo of [
  '../src/screens/PlanosScreen.tsx',
  '../src/hooks/useLembreteAssinatura.ts',
  '../webapp/src/pages/olli/planos/useLembreteAssinatura.ts',
]) {
  assert.match(ler(arquivo), /avisoTrialNaoIniciado/, `${arquivo} explica a revisão em vez de fingir falha de rede`);
}

const rev = interpretarInicioTrial({
  iniciado: false,
  replay: false,
  motivo: 'revisao_caixa',
  requires_card: false,
  auto_renews: false,
  data_disposition: 'preserve',
});
assert.equal(rev?.motivo, 'revisao_caixa');
assert.equal(rev?.iniciado, false);
const avisoRev = avisoTrialNaoIniciado(rev ?? null);
assert.match(avisoRev.mensagem, /nada foi apagado/);
assert.match(avisoRev.mensagem, /Grátis/);
assert.doesNotMatch(`${avisoRev.titulo} ${avisoRev.mensagem}`, /bloquead/i);
assert.doesNotMatch(`${avisoRev.titulo} ${avisoRev.mensagem}`, /já usou/i);
assert.equal(interpretarInicioTrial({
  iniciado: true,
  replay: false,
  motivo: 'revisao_caixa',
  requires_card: false,
  auto_renews: false,
  data_disposition: 'preserve',
}), null, 'payload contraditório não vira teste iniciado');
assert.equal(interpretarInicioTrial({
  iniciado: true,
  replay: false,
  termina_em: '2026-09-19T12:00:00.000Z',
  trial_dias: 14,
  requires_card: false,
  auto_renews: false,
  data_disposition: 'preserve',
})?.motivo, null);

const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create schema if not exists extensions;
  create extension if not exists pgcrypto schema extensions;
  create table auth.users (
    id uuid primary key,
    email text,
    deleted_at timestamptz
  );
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    ip inet
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  create table public.organizacoes (id uuid primary key, owner_user_id uuid not null references auth.users(id));
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, ativo boolean not null default true);
  create table public.assinaturas (
    user_id uuid primary key,
    status text,
    plano text,
    current_period_end timestamptz,
    admin_override_ativo boolean default false,
    admin_override_ate timestamptz,
    admin_plano_override text
  );
`);
await db.exec(sqlCota);
await db.exec(reservaCorrigida);
await db.exec(sqlEntitlement);
await db.exec(sqlAuto);
await db.exec(sqlNova);
await db.exec(sqlNova);

let seq = 0;
function novoUuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

async function como(uid: string): Promise<void> {
  await db.query(`select set_config('teste.uid', $1, false)`, [uid]);
}

async function usuario(email: string, opts?: { apagado?: boolean }): Promise<string> {
  const id = novoUuid();
  await db.query(
    `insert into auth.users (id, email, deleted_at) values ($1, $2, case when $3 then now() else null end)`,
    [id, email, opts?.apagado === true],
  );
  return id;
}

async function elegivel(id: string): Promise<void> {
  await db.query(
    `insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
     values ($1, $1, 'eligible', 'pro_attempt', $1)`,
    [id],
  );
}

async function estadoTrial(id: string): Promise<string | null> {
  const res = await db.query<{ estado: string }>(
    `select estado from public.trials_comerciais where tenant_id = $1`,
    [id],
  );
  return res.rows[0]?.estado ?? null;
}

async function iniciar(id: string): Promise<Record<string, unknown>> {
  await como(id);
  const res = await db.query<{ r: Record<string, unknown> }>(
    `select public.iniciar_trial_pro('pro_attempt') as r`,
  );
  return res.rows[0].r;
}

async function norm(email: string): Promise<string | null> {
  const res = await db.query<{ n: string | null }>(
    `select public.normalizar_caixa_email($1) as n`,
    [email],
  );
  return res.rows[0].n;
}

async function hashCaixa(email: string): Promise<string> {
  const n = await norm(email);
  assert.ok(n, `caixa de ${email}`);
  const res = await db.query<{ h: string }>(`select public.caixa_email_hash($1) as h`, [n]);
  return res.rows[0].h;
}

async function marca(email: string) {
  const h = await hashCaixa(email);
  const res = await db.query<{
    caixa_hash: string;
    qtd_contas: number;
    tem_assinatura_ativa: boolean;
    ip_reforca: boolean;
    bloqueio_trial: boolean;
  }>(
    `select caixa_hash, qtd_contas, tem_assinatura_ativa, ip_reforca, bloqueio_trial
     from public.marcas_revisao_caixa where caixa_hash = $1`,
    [h],
  );
  return res.rows[0] ?? null;
}

async function enviar(id: string, orcamentoId: string): Promise<boolean> {
  await como(id);
  const reserva = await db.query<{ r: Record<string, unknown> }>(
    `select public.reservar_envio_orcamento_gratis($1, 'pdf') as r`,
    [orcamentoId],
  );
  assert.equal(reserva.rows[0].r.permitido, true, `reserva de ${orcamentoId}`);
  const conf = await db.query<{ ok: boolean }>(
    `select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok`,
    [orcamentoId, reserva.rows[0].r.reserva_token],
  );
  return conf.rows[0].ok;
}

// ─── normalização ────────────────────────────────────────────────────────────
assert.equal(await norm('A.B.C+tag@gmail.com'), 'abc@gmail.com');
assert.equal(await norm('A.B.C+tag@googlemail.com'), 'abc@gmail.com');
assert.equal(await norm('  Jo.hn+z@Empresa.com '), 'jo.hn@empresa.com');
assert.equal(await norm('jo.hn+a@outlook.com'), 'jo.hn@outlook.com');
assert.equal(await norm('jo.hn+b@outlook.com'), 'jo.hn@outlook.com');
assert.equal(await norm('+so-tag@gmail.com'), null);
assert.equal(await norm('sem-arroba'), null);
assert.equal(await norm('a@b@c.com'), null);
{
  const h = await hashCaixa('A.B+1@gmail.com');
  assert.equal(h, createHash('sha256').update('ab@gmail.com').digest('hex'));
  assert.equal(h.length, 64);
}

// ─── duas contas: as duas testam, sem marca ─────────────────────────────────
{
  const a = await usuario('x.y+1@gmail.com');
  const b = await usuario('xy@gmail.com');
  await elegivel(a);
  await elegivel(b);
  const ra = await iniciar(a);
  const rb = await iniciar(b);
  assert.equal(ra.iniciado, true, 'a primeira de duas contas testa');
  assert.equal(rb.iniciado, true, 'a segunda de duas contas testa');
  assert.equal(await marca('xy@gmail.com'), null, 'duas contas não viram marca');
}

// ─── IP sozinho, em duas contas, não marca e não bloqueia ───────────────────
{
  const a = await usuario('ip.solo+1@gmail.com');
  const b = await usuario('ipsolo@gmail.com');
  await db.query(`insert into auth.sessions (user_id, ip) values ($1, '203.0.113.10'), ($2, '203.0.113.10')`, [a, b]);
  await elegivel(a);
  await elegivel(b);
  assert.equal((await iniciar(a)).iniciado, true);
  assert.equal((await iniciar(b)).iniciado, true);
  assert.equal(await marca('ipsolo@gmail.com'), null);
}

// ─── três contas: primeiro teste fica; o seguinte não começa ────────────────
{
  const a = await usuario('pessoa.um+a@gmail.com');
  const b = await usuario('pessoa.um+b@gmail.com');
  const c = await usuario('p.e.s.s.o.a.um@gmail.com');
  await elegivel(a);
  await elegivel(b);
  await elegivel(c);
  const antes = await iniciar(a);
  assert.equal(antes.iniciado, true, 'o primeiro teste do grupo começa');
  assert.equal(await estadoTrial(a), 'active');
  const marcaAntes = await marca('pessoa.um+a@gmail.com');
  assert.ok(marcaAntes, 'três contas geram marca');
  assert.equal(marcaAntes.qtd_contas, 3);
  assert.equal(marcaAntes.ip_reforca, false, 'sem IP compartilhado o reforço fica falso');
  assert.equal(marcaAntes.tem_assinatura_ativa, false);
  assert.equal(marcaAntes.bloqueio_trial, true, 'o próximo teste novo fica recusado');
  assert.doesNotMatch(JSON.stringify(marcaAntes), /@/, 'a marca não carrega e-mail');

  const meio = await iniciar(b);
  assert.equal(meio.iniciado, false);
  assert.equal(meio.motivo, 'revisao_caixa');
  assert.equal(meio.termina_em ?? null, null);
  assert.equal(await estadoTrial(b), 'eligible', 'o teste recusado continua elegível, não consumido');
  assert.equal(await estadoTrial(a), 'active', 'o teste que já existia continua');

  await db.query(
    `update public.trials_comerciais set termina_em = now() + interval '10 days' where tenant_id = $1`,
    [a],
  );
  assert.equal(await estadoTrial(a), 'active', 'mudar a data de um teste ativo não tira o plano');

  const envio = await enviar(c, 'orc-c');
  assert.equal(envio, true, 'o envio do Grátis segue confirmado');
  assert.equal(await estadoTrial(c), 'eligible', 'o envio não inicia o segundo teste');
  const envioLinha = await db.query<{ estado: string }>(
    `select estado from public.orcamento_envios_gratis where tenant_id = $1 and orcamento_id = 'orc-c'`,
    [c],
  );
  assert.equal(envioLinha.rows[0].estado, 'confirmado');
}

// ─── conta apagada não entra na contagem ─────────────────────────────────────
{
  const a = await usuario('some.um+a@gmail.com');
  const b = await usuario('someum@gmail.com');
  await usuario('some.um+c@gmail.com', { apagado: true });
  await elegivel(a);
  await elegivel(b);
  assert.equal((await iniciar(a)).iniciado, true);
  assert.equal((await iniciar(b)).iniciado, true, 'conta apagada não completa o trio');
  assert.equal(await marca('someum@gmail.com'), null);
}

// ─── quem paga não entra no bloqueio; past_due entra ────────────────────────
{
  const pago = await usuario('pago.um+a@gmail.com');
  const atrasado = await usuario('pago.um+b@gmail.com');
  const terceiro = await usuario('p.a.g.o.um@gmail.com');
  await db.query(
    `insert into public.assinaturas (user_id, status, plano, current_period_end)
     values ($1, 'active', 'pro', now() + interval '20 days'),
            ($2, 'past_due', 'pro', now() + interval '20 days')`,
    [pago, atrasado],
  );
  await elegivel(pago);
  await elegivel(atrasado);
  await elegivel(terceiro);
  assert.equal((await iniciar(terceiro)).iniciado, true, 'o primeiro teste do grupo começa');
  assert.equal((await iniciar(pago)).iniciado, true, 'assinatura ativa não entra no bloqueio');
  assert.equal(await estadoTrial(pago), 'active');
  const recusa = await iniciar(atrasado);
  assert.equal(recusa.motivo, 'revisao_caixa', 'past_due não conta como assinatura ativa');
  assert.equal(await estadoTrial(atrasado), 'eligible');
  const m = await marca('pagoum@gmail.com');
  assert.equal(m?.tem_assinatura_ativa, true);
  assert.equal(m?.qtd_contas, 3);
  assert.equal(await estadoTrial(terceiro), 'active');
}

// ─── IP reforça a marca quando a caixa já coincidiu, e não é a causa ────────
{
  const a = await usuario('rede.um+a@gmail.com');
  const b = await usuario('rede.um+b@gmail.com');
  const c = await usuario('redeum@gmail.com');
  await db.query(
    `insert into auth.sessions (user_id, ip) values ($1, '198.51.100.8'), ($2, '198.51.100.8')`,
    [a, b],
  );
  await elegivel(a);
  await elegivel(b);
  assert.equal((await iniciar(a)).iniciado, true, 'IP compartilhado não barra o primeiro teste');
  const m = await marca('redeum@gmail.com');
  assert.equal(m?.ip_reforca, true);
  assert.equal(m?.qtd_contas, 3);
  const recusa = await iniciar(b);
  assert.equal(recusa.motivo, 'revisao_caixa');
  assert.equal(await estadoTrial(c), null, 'a terceira conta não foi apagada nem ganhou teste sozinha');
}

// ─── a marca não é legível por authenticated ─────────────────────────────────
{
  let leu = false;
  let chamou = false;
  try {
    await db.query(`set role authenticated`);
    try {
      await db.query(`select caixa_hash from public.marcas_revisao_caixa`);
      leu = true;
    } catch {
      leu = false;
    }
    try {
      await db.query(`select public.avaliar_caixa_trial('00000000-0000-4000-8000-000000000099'::uuid, false)`);
      chamou = true;
    } catch {
      chamou = false;
    }
  } finally {
    await db.query(`reset role`);
  }
  assert.equal(leu, false, 'authenticated não lê a marca');
  assert.equal(chamou, false, 'authenticated não executa a avaliação');
}

const colunas = await db.query<{ column_name: string }>(
  `select column_name from information_schema.columns
   where table_schema = 'public' and table_name = 'marcas_revisao_caixa'
   order by column_name`,
);
assert.deepEqual(colunas.rows.map((c) => c.column_name), [
  'atualizada_em',
  'bloqueio_trial',
  'caixa_hash',
  'ip_reforca',
  'qtd_contas',
  'tem_assinatura_ativa',
]);

await db.close();
console.log('OK — anti-abuso do trial: marca por hash, primeiro teste fica, o seguinte não começa, quem paga segue.');
