/**
 * Grátis com orçamentos ILIMITADOS (migration 20261002150000), rodando o SQL de
 * verdade num Postgres em memória (PGlite) — não é regex sobre o arquivo.
 *
 *     node scripts/teste-gratis-ilimitado-sql.ts
 *
 * Aplica, na ordem de produção, a cota/trial original (20260905053000), a reserva
 * corrigida (20260910143000), o entitlement fechado (20260914115639), o teste do
 * Pro automático (20260930120000) e as seções 1 e 2 da migration nova (reserva e
 * oferta; a seção 3 mexe nos lembretes por e-mail, que este teste não monta).
 *
 * Prova:
 *  1. o 6º, o 10º e o 12º envio do mês no Grátis são PERMITIDOS (antes: 5 e parou);
 *  2. o servidor continua falando a língua do APK antigo (`dentro_da_cota`,
 *     `permitido: true`) — senão o app que está nas lojas bloquearia o envio;
 *  3. o app novo lê a resposta sem cota (`interpretarReservaEnvio` / `interpretarEstadoOferta`);
 *  4. o registro continua idempotente e o teste do Pro continua nascendo no 1º envio;
 *  5. a oferta devolve `limite_envios`/`envios_restantes` nulos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { interpretarEstadoOferta, interpretarReservaEnvio } from '../src/services/limitesComerciais.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const sqlCota = ler('../supabase/migrations/20260905053000_cota_orcamentos_trial_pro.sql');
const sqlLint = ler('../supabase/migrations/20260910143000_fix_ia_quota_lint.sql');
const sqlEntitlement = ler('../supabase/migrations/20260914115639_harden_billing_entitlement_status.sql');
const sqlTrialAuto = ler('../supabase/migrations/20260930120000_trial_pro_automatico_primeiro_envio.sql');
const sqlNova = ler('../supabase/migrations/20261002150000_gratis_orcamentos_ilimitados.sql');

let ok = 0;
function caso(nome: string): void {
  ok++;
  console.log(`  ok  ${nome}`);
}

// ─── Contrato do arquivo ──────────────────────────────────────────────────────
// Sem comentários: o cabeçalho EXPLICA o que saiu (e cita o código antigo).
const sqlCodigo = sqlNova.replace(/--[^\n]*/g, '');
assert.doesNotMatch(sqlCodigo, /v_usados\s*>=\s*5/i, 'a migration não pode reintroduzir o teto de 5');
assert.doesNotMatch(sqlCodigo, /'cota_esgotada'/, 'nenhum caminho devolve cota_esgotada');
assert.doesNotMatch(sqlCodigo, /envios_usados\s*>=\s*3/, 'lembrete de "perto da cota" saiu do pré-filtro');
assert.doesNotMatch(sqlCodigo, /\bthen 5\b|greatest\(0, 5 -/, 'nenhum limite 5 sobrou na oferta');
assert.doesNotMatch(sqlCodigo, /delete\s+from\s+public\.(orcamentos|clientes|produtos|assinaturas|trials_comerciais)/i, 'não apaga dado');
assert.match(sqlNova, /grant execute on function public\.reservar_envio_orcamento_gratis\(text,text\) to authenticated/i);
assert.match(sqlNova, /revoke all on function public\.listar_candidatos_lembrete_email\(timestamptz, integer, integer\)\s+from public, anon, authenticated/i);
assert.match(sqlNova, /grant execute on function public\.listar_candidatos_lembrete_email\(timestamptz, integer, integer\)\s+to service_role/i);
caso('arquivo: sem teto, sem cota_esgotada, sem apagar dado, grants preservados');

const reservaCorrigida = sqlLint.match(
  /create or replace function public\.reservar_envio_orcamento_gratis\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(reservaCorrigida, 'a versão corrigida de reservar_envio_orcamento_gratis precisa existir');
const ateSecao3 = sqlNova.split('-- ─── 3. Candidatos a lembrete')[0];
assert.ok(ateSecao3.length < sqlNova.length, 'a seção 3 precisa existir para o corte do teste');

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
await db.exec(sqlTrialAuto);
await db.exec(ateSecao3);

let seq = 0;
async function novoUsuario(): Promise<string> {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}
async function comoUsuario(uid: string): Promise<void> {
  await db.query(`select set_config('teste.uid', $1, false)`, [uid]);
}
async function reservar(uid: string, orcamentoId: string, canal = 'pdf') {
  await comoUsuario(uid);
  const r = await db.query<{ r: Record<string, unknown> }>('select public.reservar_envio_orcamento_gratis($1, $2) as r', [
    orcamentoId,
    canal,
  ]);
  return r.rows[0].r;
}
async function confirmar(uid: string, orcamentoId: string, token: string) {
  await comoUsuario(uid);
  const r = await db.query<{ ok: boolean }>('select public.confirmar_envio_orcamento_gratis($1, $2::uuid) as ok', [
    orcamentoId,
    token,
  ]);
  return r.rows[0].ok;
}
async function oferta(uid: string) {
  await comoUsuario(uid);
  const r = await db.query<{ o: Record<string, unknown> }>('select public.meu_estado_oferta_comercial() as o');
  return r.rows[0].o;
}

/** O parser do APK 1.1.x (copiado da versão antiga de limitesComerciais.ts): bloqueia em motivo desconhecido. */
function apkAntigoPermite(v: Record<string, unknown>): boolean {
  const motivos = new Set(['plano_pago', 'trial_ativo', 'dentro_da_cota', 'cota_esgotada']);
  if (typeof v.permitido !== 'boolean' || !motivos.has(v.motivo as string)) return false;
  if (v.requer_confirmacao === true && !(typeof v.reserva_token === 'string')) return false;
  return v.permitido;
}

// ─── 1. Grátis que já usou o teste: 12 envios no mês, todos permitidos ─────────
{
  const dono = await novoUsuario();
  // Teste do Pro já consumido: a conta fica no Grátis de verdade o mês inteiro.
  await db.query(
    `insert into public.trials_comerciais
       (tenant_id, owner_user_id, estado, gatilho, iniciado_em, termina_em, encerrado_em, criado_por)
     values ($1, $1, 'ended', 'pro_attempt', now() - interval '40 days', now() - interval '26 days', now() - interval '26 days', $1)`,
    [dono],
  );
  for (let i = 1; i <= 12; i++) {
    const r = await reservar(dono, `orc-${i}`, i % 3 === 0 ? 'link' : i % 3 === 1 ? 'pdf' : 'whatsapp');
    assert.equal(r.permitido, true, `o envio ${i} do mês tem de ser permitido`);
    assert.equal(r.motivo, 'dentro_da_cota', 'nome de fio que o APK antigo aceita');
    assert.equal(r.restantes, null, 'não existe mais "restantes"');
    assert.equal(r.usados, i, 'o registro conta o envio');
    assert.equal(r.contabilizado_agora, true);
    assert.equal(apkAntigoPermite(r), true, `o APK antigo também envia o ${i}º`);
    const novo = interpretarReservaEnvio(r);
    assert.equal(novo.permitido, true);
    assert.equal(novo.requerConfirmacao, true);
    assert.ok(novo.reservaToken, 'o app novo recebe o token para confirmar');
    assert.equal(await confirmar(dono, `orc-${i}`, r.reserva_token as string), true);
  }
  caso('Grátis: 12 envios no mês, todos permitidos, APK antigo e app novo de acordo');

  // Reenviar o MESMO orçamento é idempotente: não conta de novo.
  const repetido = await reservar(dono, 'orc-3', 'whatsapp');
  assert.equal(repetido.permitido, true);
  assert.equal(repetido.contabilizado_agora, false);
  assert.equal(repetido.usados, 12);
  assert.equal(repetido.requer_confirmacao, false, 'já confirmado: nada a confirmar');
  caso('reenvio do mesmo orçamento no mês: permitido e idempotente');

  const o = await oferta(dono);
  assert.equal(o.plano_efetivo, 'gratis');
  assert.equal(o.limite_envios, null);
  assert.equal(o.envios_restantes, null);
  assert.equal(o.envios_usados, 12);
  const lida = interpretarEstadoOferta(o);
  assert.ok(lida, 'o app novo aceita a oferta sem limite');
  assert.equal(lida.enviosUsados, 12);
  assert.equal('limiteEnvios' in lida, false, 'o app novo não carrega mais a ideia de limite');
  caso('oferta: limite_envios e envios_restantes nulos, envios_usados informativo');
}

// ─── 2. Conta nova: o 1º envio continua iniciando o teste do Pro ───────────────
{
  const dono = await novoUsuario();
  const r = await reservar(dono, 'primeiro');
  assert.equal(r.permitido, true);
  assert.equal(await confirmar(dono, 'primeiro', r.reserva_token as string), true);
  const t = await db.query<{ estado: string; inicio_automatico: boolean }>(
    'select estado, inicio_automatico from public.trials_comerciais where tenant_id = $1',
    [dono],
  );
  assert.equal(t.rows[0]?.estado, 'active', 'o registro do envio continua acionando o teste automático');
  assert.equal(t.rows[0]?.inicio_automatico, true);
  const depois = await reservar(dono, 'segundo');
  assert.equal(depois.motivo, 'trial_ativo');
  assert.equal(depois.requer_confirmacao, false);
  caso('o 1º envio ainda inicia o teste do Pro (o registro serve a isso)');
}

// ─── 3. Plano pago: nada muda ─────────────────────────────────────────────────
{
  const dono = await novoUsuario();
  await db.query(
    `insert into public.assinaturas (user_id, status, plano, current_period_end) values ($1, 'active', 'pro', now() + interval '20 days')`,
    [dono],
  );
  const r = await reservar(dono, 'pago-1');
  assert.equal(r.permitido, true);
  assert.equal(r.motivo, 'plano_pago');
  assert.equal(r.reserva_token, null);
  caso('plano pago: responde plano_pago, sem registro');
}

// ─── 4. Seção 3 (lembretes por e-mail) compila ────────────────────────────────
// A função é uma cópia longa de 20260929200000; criar num Postgres de verdade pega
// erro de sintaxe do PL/pgSQL e do SQL embutido antes do gate de produção.
{
  const outro = new PGlite();
  await outro.exec('create role anon; create role authenticated; create role service_role;');
  const resto = sqlNova.split('-- ─── 3. Candidatos a lembrete')[1];
  await outro.exec(resto.slice(resto.indexOf('\n') + 1)); // pula o resto da linha do título
  const fn = await outro.query<{ n: number }>(
    `select count(*)::int as n from pg_proc where proname = 'listar_candidatos_lembrete_email'`,
  );
  assert.equal(fn.rows[0].n, 1);
  caso('seção 3: listar_candidatos_lembrete_email compila no Postgres');
}

console.log(`\nteste-gratis-ilimitado-sql: ${ok} casos OK`);
