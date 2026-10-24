/**
 * LIMITE DO GRÁTIS NAS CONTAS ANTIGAS (migration 20261024130000, sobre a 20261024120000) rodando o SQL de verdade no PGlite.
 *
 *     node scripts/teste-limite-gratis-antigas-sql.ts
 *
 * Prova: (1) corte NULL = nada muda (sem teto); (2) conta ANTERIOR ao corte segue sem teto;
 * (3) conta NOVA: 5 envios ok, o 6º é barrado com `cota_esgotada` (língua do APK antigo),
 * reenvio de orçamento já registrado continua ok, oferta mostra 5/0; (4) Pro e trial ativo sem teto;
 * (5) reserva viva conta e a expirada libera; (6) desligar (corte NULL) solta de novo;
 * (7) a tabela de config não é legível/gravável por authenticated.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8');
const sqlCota = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const sqlLint = ler('../supabase/migrations/20260910143000_fix_ia_quota_lint.sql');
const sqlEntitlement = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');
const sqlTrialAuto = ler('../supabase/migrations/20260930120000_trial_pro_automatico_primeiro_envio.sql');
const sqlIlimitado = ler('../supabase/migrations/20261002150000_gratis_orcamentos_ilimitados.sql').split('-- ─── 3. Candidatos a lembrete')[0];
const sqlLimite = ler('../supabase/migrations/20261024120000_limite_gratis_5_contas_novas.sql');
const sqlAntigas = ler('../supabase/migrations/20261024130000_limite_gratis_contas_antigas.sql');
const reservaCorrigida = sqlLint.match(/create or replace function public\.reservar_envio_orcamento_gratis\([\s\S]*?\n\$\$;/)?.[0];
assert.ok(reservaCorrigida);

let ok = 0;
const caso = (n: string) => { ok++; console.log(`  ok  ${n}`); };

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  create table public.organizacoes (id uuid primary key, owner_user_id uuid not null references auth.users(id));
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, ativo boolean not null default true);
  create table public.assinaturas (
    user_id uuid primary key, status text, plano text, current_period_end timestamptz,
    admin_override_ativo boolean default false, admin_override_ate timestamptz, admin_plano_override text
  );
`);
await db.exec(sqlCota);
await db.exec(reservaCorrigida);
await db.exec(sqlEntitlement);
await db.exec(sqlTrialAuto);
await db.exec(sqlIlimitado);
await db.exec(sqlLimite);
await db.exec(sqlLimite);
await db.exec(sqlAntigas);
await db.exec(sqlAntigas); // idempotente: aplicar de novo não quebra

let seq = 0;
async function novoUsuario(diasDeConta: number): Promise<string> {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await db.query(`insert into auth.users (id, created_at) values ($1, now() - ($2 || ' days')::interval)`, [id, String(diasDeConta)]);
  // Teste do Pro já consumido: a conta fica no Grátis de verdade.
  await db.query(
    `insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, iniciado_em, termina_em, encerrado_em, criado_por)
     values ($1, $1, 'ended', 'pro_attempt', now() - interval '40 days', now() - interval '26 days', now() - interval '26 days', $1)`,
    [id],
  );
  return id;
}
const como = (uid: string) => db.query(`select set_config('teste.uid', $1, false)`, [uid]);
async function reservar(uid: string, orc: string) {
  await como(uid);
  return (await db.query<{ r: Record<string, unknown> }>('select public.reservar_envio_orcamento_gratis($1, $2) as r', [orc, 'pdf'])).rows[0].r;
}
async function confirmar(uid: string, orc: string, token: string) {
  await como(uid);
  return (await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [orc, token])).rows[0].ok;
}
async function enviar(uid: string, orc: string) {
  const r = await reservar(uid, orc);
  if (r.permitido === true && r.reserva_token) assert.equal(await confirmar(uid, orc, r.reserva_token as string), true);
  return r;
}
async function oferta(uid: string) {
  await como(uid);
  return (await db.query<{ o: Record<string, unknown> }>('select public.meu_estado_oferta_comercial() as o')).rows[0].o;
}
const ligar = (diasAtras = 1) => db.query(`update public.limite_gratis_config set corte = now() - ($1 || ' days')::interval`, [String(diasAtras)]);
const desligar = () => db.query('update public.limite_gratis_config set corte = null');
/** APK antigo: bloqueia quando permitido=false e entende cota_esgotada. */
const apkAntigoPermite = (v: Record<string, unknown>) =>
  typeof v.permitido === 'boolean' && ['plano_pago', 'trial_ativo', 'dentro_da_cota', 'cota_esgotada'].includes(v.motivo as string) && v.permitido;

const antigas = (quando: string | null) =>
  db.query(`update public.limite_gratis_config set corte_antigas = ${quando === null ? 'null' : `now() + interval '${quando}'`}`);

// 1. corte_antigas NULL (padrão): conta antiga sem teto, como hoje
{
  const cfg = await db.query<{ ca: string | null }>('select corte_antigas ca from public.limite_gratis_config');
  assert.equal(cfg.rows[0].ca, null, 'padrão: antigas DESLIGADO');
  await ligar(1); // novas ligado, antigas não
  const velha = await novoUsuario(60);
  for (let i = 1; i <= 8; i++) assert.equal((await enviar(velha, `a-${i}`)).permitido, true, `antiga sem corte_antigas, envio ${i}`);
  const o = await oferta(velha);
  assert.equal(o.limite_conta_nova, false);
  assert.equal(o.limite_envios, null);
  caso('corte_antigas NULL: conta antiga segue sem teto (8 envios) e sem sinal');
}

// 2. corte_antigas no FUTURO: ainda sem teto (período do aviso)
{
  await antigas('30 days');
  const velha = await novoUsuario(60);
  for (let i = 1; i <= 7; i++) assert.equal((await enviar(velha, `f-${i}`)).permitido, true, `antiga, aviso em curso, envio ${i}`);
  assert.equal((await oferta(velha)).limite_conta_nova, false);
  caso('corte_antigas em D+30 (futuro): conta antiga ainda sem teto durante o aviso');
}

// 3. corte_antigas VENCIDO: antiga passa a ter o mesmo limite de 5
{
  await antigas('-1 minute');
  const velha = await novoUsuario(60);
  for (let i = 1; i <= 5; i++) {
    const r = await enviar(velha, `v-${i}`);
    assert.equal(r.permitido, true, `antiga limitada, envio ${i} de 5`);
    assert.equal(r.restantes, 5 - i);
  }
  const o = await oferta(velha);
  assert.equal(o.limite_conta_nova, true, 'sinal true: há teto de verdade');
  assert.equal(o.limite_origem, 'antiga');
  assert.equal(o.limite_envios, 5);
  assert.equal(o.envios_restantes, 0);
  const seis = await reservar(velha, 'v-6');
  assert.equal(seis.permitido, false);
  assert.equal(seis.motivo, 'cota_esgotada');
  assert.equal(seis.limite_origem, 'antiga');
  assert.equal((await reservar(velha, 'v-3')).permitido, true, 'reenvio de orçamento já registrado segue ok');
  caso('corte_antigas vencido: antiga tem 5/mês, 6º barrado, origem=antiga, reenvio idempotente');
}

// 4. conta NOVA continua como antes (origem nova) mesmo com antigas ligado
{
  const nova = await novoUsuario(0);
  for (let i = 1; i <= 5; i++) await enviar(nova, `n-${i}`);
  const o = await oferta(nova);
  assert.equal(o.limite_origem, 'nova', 'quem é nova mantém a porta de nova');
  assert.equal((await reservar(nova, 'n-6')).permitido, false);
  caso('conta nova: mesma regra e origem=nova com antigas ligado');
}

// 5. Pro e teste do Pro ativo seguem sem teto nas duas portas
{
  const pro = await novoUsuario(90);
  await db.query(`insert into public.assinaturas (user_id, status, plano, current_period_end) values ($1, 'active', 'pro', now() + interval '20 days')`, [pro]);
  for (let i = 1; i <= 7; i++) assert.equal((await reservar(pro, `p-${i}`)).permitido, true);
  assert.equal((await oferta(pro)).limite_conta_nova, false);
  caso('Pro antigo: sem teto mesmo com antigas ligado');
}

// 6. desligar solta de novo (rollback)
{
  const velha = await novoUsuario(70);
  for (let i = 1; i <= 5; i++) await enviar(velha, `r-${i}`);
  assert.equal((await reservar(velha, 'r-6')).permitido, false);
  await antigas(null);
  assert.equal((await reservar(velha, 'r-6')).permitido, true, 'corte_antigas=null libera na hora');
  assert.equal((await oferta(velha)).limite_origem, null);
  caso('rollback: corte_antigas = null solta a conta antiga na hora');
}

console.log(`\nteste-limite-gratis-antigas-sql: ${ok} casos OK`);
