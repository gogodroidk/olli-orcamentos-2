/**
 * Teste do teste-do-Pro AUTOMÁTICO no primeiro envio (migration
 * 20260930120000_trial_pro_automatico_primeiro_envio.sql), rodando o SQL de
 * verdade num Postgres em memória (PGlite) — não é regex sobre o arquivo.
 *
 * Monta o mínimo que as funções usam (schema `auth` com `auth.uid()` lido de uma
 * configuração de sessão, `organizacoes`, `organizacao_membros`, `assinaturas`) e
 * aplica, na ordem de produção: a cota/trial original (20260905053000), a
 * `reservar_envio_orcamento_gratis` corrigida (20260910143000), o entitlement
 * fechado (20260914115639) e a migration nova.
 *
 * Cobre: início no 1º envio (sem linha e com linha 'eligible'), idempotência da
 * reconfirmação, "não reinicia" teste ativo/vencido/encerrado/convertido/revogado,
 * membro da equipe não consome o teste do dono, plano pago não inicia teste,
 * e falha na leitura do plano NÃO concede nada nem derruba a confirmação.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { TRIAL_PRO_DIAS } from '../src/services/limitesComerciais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sqlCota = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const sqlLint = ler('../supabase/migrations/20260910143000_fix_ia_quota_lint.sql');
const sqlEntitlement = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');
const sqlNova = ler('../supabase/migrations/20260930120000_trial_pro_automatico_primeiro_envio.sql');

// Da migration de lint só interessa a versão corrigida da reserva (o resto mexe em
// tabelas de IA que este teste não monta).
const reservaCorrigida = sqlLint.match(
  /create or replace function public\.reservar_envio_orcamento_gratis\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(reservaCorrigida, 'a versão corrigida de reservar_envio_orcamento_gratis precisa existir');

// Contrato: a janela do SQL é a MESMA fonte do app.
assert.match(sqlNova, new RegExp(`interval '${TRIAL_PRO_DIAS} days'`), 'janela do teste automático = TRIAL_PRO_DIAS');
assert.doesNotMatch(sqlNova, /delete\s+from/i, 'a migration não apaga nada');
assert.match(sqlNova, /returns boolean/i, 'o retorno continua boolean: APK antigo segue funcionando');

const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key);
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
await db.exec(sqlNova);

let seq = 0;
function novoUuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

async function novoUsuario(): Promise<string> {
  const id = novoUuid();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}

async function comoUsuario(uid: string): Promise<void> {
  await db.query(`select set_config('teste.uid', $1, false)`, [uid]);
}

/** Reserva + confirma um envio, do jeito que o app faz. */
async function enviar(uid: string, orcamentoId: string, canal = 'pdf'): Promise<{ confirmou: boolean; token: string }> {
  await comoUsuario(uid);
  const reserva = await db.query<{ r: Record<string, unknown> }>(
    'select public.reservar_envio_orcamento_gratis($1, $2) as r',
    [orcamentoId, canal],
  );
  const r = reserva.rows[0].r;
  assert.equal(r.permitido, true, `reserva de ${orcamentoId} deveria ser permitida`);
  const token = r.reserva_token as string;
  const conf = await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [
    orcamentoId,
    token,
  ]);
  return { confirmou: conf.rows[0].ok, token };
}

async function trialDe(tenant: string) {
  const res = await db.query<{
    estado: string;
    gatilho: string;
    iniciado_em: string | null;
    termina_em: string | null;
    inicio_automatico: boolean;
  }>('select estado, gatilho, iniciado_em, termina_em, inicio_automatico from public.trials_comerciais where tenant_id = $1', [
    tenant,
  ]);
  return res.rows[0] ?? null;
}

async function oferta(uid: string) {
  await comoUsuario(uid);
  const res = await db.query<{ o: Record<string, unknown> }>('select public.meu_estado_oferta_comercial() as o');
  return res.rows[0].o;
}

// ─── 1. Conta sem linha de trial (unstarted): o 1º envio libera o Pro ────────
{
  const dono = await novoUsuario();
  assert.equal((await oferta(dono)).trial_estado, 'unstarted');
  const { confirmou } = await enviar(dono, 'orc-1');
  assert.equal(confirmou, true, 'o envio continua confirmado');
  const t = await trialDe(dono);
  assert.equal(t?.estado, 'active', 'o 1º envio confirmado inicia o teste');
  assert.equal(t?.gatilho, 'first_pdf');
  assert.equal(t?.inicio_automatico, true, 'marca que foi o envio (não o botão)');
  const dias = (Date.parse(t!.termina_em!) - Date.parse(t!.iniciado_em!)) / 86_400_000;
  assert.equal(dias, TRIAL_PRO_DIAS, 'janela de 14 dias');
  const o = await oferta(dono);
  assert.equal(o.plano_efetivo, 'pro', 'teste ativo = Pro efetivo');
  assert.equal(o.trial_estado, 'active');
  assert.equal(o.requires_card, false);
  assert.equal(o.auto_renews, false);

  // Reconfirmar o MESMO envio é idempotente: não mexe no teste.
  const antes = await trialDe(dono);
  await comoUsuario(dono);
  const reconf = await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [
    'orc-1',
    '00000000-0000-4000-8000-ffffffffffff',
  ]);
  assert.equal(reconf.rows[0].ok, true, 'reconfirmação responde que o envio consta');
  assert.deepEqual(await trialDe(dono), antes, 'reconfirmação não reinicia nem estende o teste');

  // Próximo envio já no Pro: nem reserva de cota, nem teste novo.
  await comoUsuario(dono);
  const r2 = await db.query<{ r: Record<string, unknown> }>('select public.reservar_envio_orcamento_gratis($1, $2) as r', [
    'orc-2',
    'whatsapp',
  ]);
  assert.equal(r2.rows[0].r.motivo, 'trial_ativo');
  assert.equal(r2.rows[0].r.requer_confirmacao, false);
  assert.deepEqual(await trialDe(dono), antes);
}

// ─── 2. Linha 'eligible' (enviou antes da migration): o próximo envio libera ──
{
  const dono = await novoUsuario();
  await db.query(
    `insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
     values ($1, $1, 'eligible', 'first_pdf', $1)`,
    [dono],
  );
  await enviar(dono, 'orc-x', 'link');
  const t = await trialDe(dono);
  assert.equal(t?.estado, 'active', 'eligible vira active no envio');
  assert.equal(t?.gatilho, 'first_link');
  assert.equal(t?.inicio_automatico, true);
}

// ─── 3. Nunca reinicia teste já consumido ────────────────────────────────────
for (const estado of ['ended', 'converted', 'revoked'] as const) {
  const dono = await novoUsuario();
  await db.query(
    `insert into public.trials_comerciais
       (tenant_id, owner_user_id, estado, gatilho, iniciado_em, termina_em, encerrado_em, convertido_em, criado_por)
     values ($1, $1, $2, 'pro_attempt', now() - interval '30 days', now() - interval '16 days', now() - interval '16 days',
             case when $2 = 'converted' then now() - interval '16 days' end, $1)`,
    [dono, estado],
  );
  const antes = await trialDe(dono);
  await enviar(dono, 'orc-a');
  assert.deepEqual(await trialDe(dono), antes, `teste '${estado}' não pode ser reiniciado`);
  assert.equal((await oferta(dono)).plano_efetivo, 'gratis');
}
{
  // 'active' já VENCIDO (a oferta reporta 'ended'): também não reinicia.
  const dono = await novoUsuario();
  await db.query(
    `insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, iniciado_em, termina_em, criado_por)
     values ($1, $1, 'active', 'pro_attempt', now() - interval '20 days', now() - interval '6 days', $1)`,
    [dono],
  );
  const antes = await trialDe(dono);
  assert.equal((await oferta(dono)).trial_estado, 'ended');
  await enviar(dono, 'orc-b');
  assert.deepEqual(await trialDe(dono), antes, 'teste vencido não volta');
}

// ─── 4. Membro da equipe não consome o teste do dono ─────────────────────────
{
  const dono = await novoUsuario();
  const membro = await novoUsuario();
  const org = novoUuid();
  await db.query('insert into public.organizacoes (id, owner_user_id) values ($1, $2)', [org, dono]);
  await db.query('insert into public.organizacao_membros (org_id, user_id, ativo) values ($1, $2, true)', [org, membro]);
  const { confirmou } = await enviar(membro, 'orc-m');
  assert.equal(confirmou, true);
  const t = await trialDe(org);
  assert.equal(t?.estado, 'eligible', 'envio do membro deixa elegível, sem iniciar');
  assert.equal(t?.inicio_automatico, false);
  // O envio seguinte do DONO inicia.
  await enviar(dono, 'orc-d');
  assert.equal((await trialDe(org))?.estado, 'active');
}

// ─── 5. Plano pago (via override no meio do caminho) não inicia teste ────────
{
  const dono = await novoUsuario();
  await comoUsuario(dono);
  const reserva = await db.query<{ r: Record<string, unknown> }>(
    'select public.reservar_envio_orcamento_gratis($1, $2) as r',
    ['orc-p', 'pdf'],
  );
  // Entre a reserva e a confirmação, o admin liberou o Pro.
  await db.query(
    `insert into public.assinaturas (user_id, status, plano, admin_override_ativo, admin_plano_override)
     values ($1, 'canceled', 'gratis', true, 'pro')`,
    [dono],
  );
  const conf = await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [
    'orc-p',
    reserva.rows[0].r.reserva_token,
  ]);
  assert.equal(conf.rows[0].ok, true);
  assert.equal((await trialDe(dono))?.estado, 'eligible', 'quem já tem Pro não gasta o teste');
}

// ─── 6. Falha ao ler o plano: nada é concedido e o envio segue confirmado ────
{
  const dono = await novoUsuario();
  await comoUsuario(dono);
  const reserva = await db.query<{ r: Record<string, unknown> }>(
    'select public.reservar_envio_orcamento_gratis($1, $2) as r',
    ['orc-f', 'pdf'],
  );
  // Simula a leitura do plano quebrando (ex.: tabela indisponível).
  await db.exec(`alter table public.assinaturas rename to assinaturas_fora`);
  try {
    const conf = await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [
      'orc-f',
      reserva.rows[0].r.reserva_token,
    ]);
    assert.equal(conf.rows[0].ok, true, 'a entrega aconteceu: a confirmação não pode falhar por causa do teste');
  } finally {
    await db.exec(`alter table public.assinaturas_fora rename to assinaturas`);
  }
  assert.equal((await trialDe(dono))?.estado, 'eligible', 'leitura que falhou não concede o teste');
  const envio = await db.query<{ estado: string }>(
    'select estado from public.orcamento_envios_gratis where tenant_id = $1 and orcamento_id = $2',
    [dono, 'orc-f'],
  );
  assert.equal(envio.rows[0].estado, 'confirmado');
  // O botão (opt-in) continua disponível depois.
  const inicio = await db.query<{ r: Record<string, unknown> }>(`select public.iniciar_trial_pro('pro_attempt') as r`);
  assert.equal(inicio.rows[0].r.iniciado, true);
}

// ─── 7. Botão e envio convivem: teste iniciado no botão não é tocado pelo envio ─
{
  const dono = await novoUsuario();
  await db.query(
    `insert into public.trials_comerciais (tenant_id, owner_user_id, estado, gatilho, criado_por)
     values ($1, $1, 'eligible', 'quota_limit', $1)`,
    [dono],
  );
  await comoUsuario(dono);
  await db.query(`select public.iniciar_trial_pro('pro_attempt')`);
  const antes = await trialDe(dono);
  assert.equal(antes?.inicio_automatico, false);
  await comoUsuario(dono);
  const r = await db.query<{ r: Record<string, unknown> }>('select public.reservar_envio_orcamento_gratis($1, $2) as r', [
    'orc-z',
    'pdf',
  ]);
  assert.equal(r.rows[0].r.motivo, 'trial_ativo');
  assert.deepEqual(await trialDe(dono), antes);
}

await db.close();
console.log('OK — teste do Pro automático no 1º envio: inicia, é idempotente, não reinicia e falha fechado.');
