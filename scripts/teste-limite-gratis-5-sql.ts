/**
 * LIMITE DO GRÁTIS (P0-09, migration 20261024120000) rodando o SQL de verdade no PGlite.
 *
 *     node scripts/teste-limite-gratis-5-sql.ts
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
const sqlAntigas = ler('../supabase/migrations/20261024150000_limite_gratis_contas_antigas.sql');
const sqlCiencia = ler('../supabase/migrations/20261027060000_limite_gratis_ciencia_aviso.sql');
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
  create table public.email_supressoes (
    user_id uuid not null references auth.users(id) on delete cascade, motivo text not null, origem text not null,
    criado_em timestamptz not null default now(), primary key (user_id, motivo)
  ); -- forma de 20260929200000 (só o que a regra lê)
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
await db.exec(sqlLimite); // idempotente: aplicar de novo não quebra
await db.exec(sqlAntigas);
await db.exec(sqlAntigas);
await db.exec(sqlCiencia);
await db.exec(sqlCiencia); // idempotente

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
const desligar = () => db.query('update public.limite_gratis_config set corte = null, corte_antigas = null');
/** APK antigo: bloqueia quando permitido=false e entende cota_esgotada. */
const apkAntigoPermite = (v: Record<string, unknown>) =>
  typeof v.permitido === 'boolean' && ['plano_pago', 'trial_ativo', 'dentro_da_cota', 'cota_esgotada'].includes(v.motivo as string) && v.permitido;

// 1. corte NULL (padrão): sem teto
{
  const cfg = await db.query<{ corte: string | null; limite: number }>('select corte, limite from public.limite_gratis_config');
  assert.equal(cfg.rows.length, 1);
  assert.equal(cfg.rows[0].corte, null, 'padrão: limite DESLIGADO');
  assert.equal(cfg.rows[0].limite, 5);
  const u = await novoUsuario(0);
  for (let i = 1; i <= 8; i++) assert.equal((await enviar(u, `a-${i}`)).permitido, true, `envio ${i} sem corte`);
  const o = await oferta(u);
  assert.equal(o.limite_envios, null);
  assert.equal(o.envios_restantes, null);
  caso('corte NULL: 8 envios permitidos, oferta sem limite');
}

// 2. conta anterior ao corte: sem teto
{
  await ligar(1); // corte = ontem
  const velha = await novoUsuario(10);
  for (let i = 1; i <= 8; i++) assert.equal((await enviar(velha, `v-${i}`)).permitido, true, `conta antiga, envio ${i}`);
  assert.equal((await oferta(velha)).limite_envios, null);
  assert.equal((await oferta(velha)).limite_conta_nova, false, 'conta antiga: sinal falso');
  assert.equal((await oferta(velha)).limite_conta_antiga, false, 'corte_antigas NULL: antiga sem teto');
  assert.equal((await oferta(velha)).aviso_limite_antigas, null, 'corte_antigas NULL: sem aviso');
  caso('conta criada ANTES do corte mantém Grátis sem teto');
}

// 3. conta nova: 5 ok, 6º barrado
{
  const nova = await novoUsuario(0);
  for (let i = 1; i <= 5; i++) {
    const r = await enviar(nova, `n-${i}`);
    assert.equal(r.permitido, true, `envio ${i} de 5`);
    assert.equal(r.restantes, 5 - i, `restantes após o ${i}º`);
  }
  const o5 = await oferta(nova);
  assert.equal(o5.limite_envios, 5);
  assert.equal(o5.limite_conta_nova, true, 'o servidor novo manda o sinal junto com o teto');
  assert.equal(o5.envios_usados, 5);
  assert.equal(o5.envios_restantes, 0);
  const seis = await reservar(nova, 'n-6');
  assert.equal(seis.permitido, false, 'o 6º envio é barrado');
  assert.equal(seis.motivo, 'cota_esgotada');
  assert.equal(seis.restantes, 0);
  assert.equal(seis.reserva_token, null);
  assert.equal(seis.requer_confirmacao, false);
  assert.equal(apkAntigoPermite(seis), false, 'o APK antigo também barra (entende cota_esgotada)');
  const linhas = await db.query<{ n: number }>(`select count(*)::int n from public.orcamento_envios_gratis where tenant_id=$1 and orcamento_id='n-6'`, [nova]);
  assert.equal(linhas.rows[0].n, 0, 'o barrado não deixa registro');
  const repetido = await reservar(nova, 'n-3');
  assert.equal(repetido.permitido, true, 'reenviar orçamento JÁ registrado segue permitido');
  assert.equal(repetido.contabilizado_agora, false);
  caso('conta nova: 5 envios ok, 6º barrado (cota_esgotada), reenvio idempotente, oferta 5/0');

  // 6. desligar solta de novo
  await desligar();
  assert.equal((await reservar(nova, 'n-6')).permitido, true, 'corte NULL libera');
  assert.equal((await oferta(nova)).limite_envios, null);
  caso('desligar o corte (NULL) devolve o Grátis sem teto');
  await ligar(1);
}

// 4. Pro e trial ativo: sem teto
{
  const pro = await novoUsuario(0);
  await db.query(`insert into public.assinaturas (user_id, status, plano, current_period_end) values ($1, 'active', 'pro', now() + interval '20 days')`, [pro]);
  for (let i = 1; i <= 7; i++) assert.equal((await reservar(pro, `p-${i}`)).permitido, true);
  assert.equal((await oferta(pro)).limite_envios, null);
  const emTrial = (() => novoUsuario(0))();
  const t = await emTrial;
  await db.query(`delete from public.trials_comerciais where tenant_id=$1`, [t]);
  const primeiro = await enviar(t, 't-1'); // 1º envio inicia o teste do Pro
  assert.equal(primeiro.permitido, true);
  for (let i = 2; i <= 8; i++) assert.equal((await reservar(t, `t-${i}`)).permitido, true, `trial ativo, envio ${i}`);
  caso('Pro e teste do Pro ativo: sem teto mesmo em conta nova');
}

// 5. reserva viva conta; expirada libera
{
  const u = await novoUsuario(0);
  for (let i = 1; i <= 4; i++) await enviar(u, `r-${i}`);
  const pendente = await reservar(u, 'r-5'); // reservado, não confirmado
  assert.equal(pendente.permitido, true);
  assert.equal((await reservar(u, 'r-6')).permitido, false, '4 confirmados + 1 reserva viva = 5: o próximo é barrado');
  await db.query(`update public.orcamento_envios_gratis set reserva_expira_em = now() - interval '1 minute' where tenant_id=$1 and orcamento_id='r-5'`, [u]);
  assert.equal((await reservar(u, 'r-6')).permitido, true, 'reserva expirada libera a vaga');
  caso('reserva viva ocupa vaga; expirada libera');
}

// 7. config não é acessível a authenticated
{
  const leitura = await db.query<{ r: boolean; w: boolean }>(
    `select has_table_privilege('authenticated','public.limite_gratis_config','select') r,
            has_table_privilege('authenticated','public.limite_gratis_config','update') w`,
  );
  assert.equal(leitura.rows[0].r, false);
  assert.equal(leitura.rows[0].w, false);
  caso('limite_gratis_config: authenticated não lê nem grava');
}

// 8. CONTAS ANTIGAS no limite a partir de corte_antigas (D+30), com aviso antes
{
  const diasAFrente = (d: number) => db.query(`update public.limite_gratis_config set corte_antigas = now() + ($1 || ' days')::interval`, [String(d)]);
  await ligar(1);
  await diasAFrente(29);
  const velha = await novoUsuario(40);
  for (let i = 1; i <= 7; i++) assert.equal((await enviar(velha, `ant-${i}`)).permitido, true, `antes de D+30 a antiga envia ${i}`);
  const antes = await oferta(velha);
  assert.equal(antes.limite_conta_nova, false);
  assert.equal(antes.limite_conta_antiga, false, 'antes de D+30 ainda não é limitada');
  assert.equal(antes.limite_envios, null);
  const aviso = antes.aviso_limite_antigas as { a_partir_de: string; usados_30d: number };
  assert.ok(aviso && Date.parse(aviso.a_partir_de) > Date.now(), 'aviso traz a data D+30');
  assert.equal(aviso.usados_30d, 7, 'N = envios reais do banco');
  const nova = await novoUsuario(0);
  assert.equal((await oferta(nova)).aviso_limite_antigas, null, 'conta nova não recebe o aviso das antigas');
  const pro = await novoUsuario(40);
  await db.query(`insert into public.assinaturas (user_id, status, plano, current_period_end) values ($1, 'active', 'pro', now() + interval '20 days')`, [pro]);
  assert.equal((await oferta(pro)).aviso_limite_antigas, null, 'Pro não recebe aviso');
  caso('antes de D+30: antiga sem teto, com aviso {a_partir_de, usados_30d}; nova/Pro sem aviso');

  // a antiga VIU o aviso antes de D+30 (ciência registrada pelo app)
  await como(velha);
  const visto = (await db.query<{ v: string | null }>(`select public.registrar_ciencia_limite_gratis('aviso-antigas-v1', 'app') as v`)).rows[0].v;
  assert.ok(visto, 'ciência gravada com o aviso no ar');
  assert.equal((await oferta(velha)).aviso_limite_antigas?.['ciencia_registrada' as never], true, 'oferta diz que a ciência existe');
  // chegou D+30: a antiga fica limitada (os 7 envios do mês, feitos depois do corte neste teste, passam de 5)
  await db.query(`update public.limite_gratis_ciencia set visto_em = now() - interval '2 minutes' where tenant_id = $1`, [velha]);
  await db.query(`update public.limite_gratis_config set corte_antigas = now() - interval '1 minute'`);
  const depois = await oferta(velha);
  assert.equal(depois.limite_conta_antiga, true, 'depois de D+30: sinal de antiga limitada');
  assert.equal(depois.limite_conta_nova, false, 'não vira conta nova');
  assert.equal(depois.limite_envios, 5);
  assert.equal(depois.envios_restantes, 0);
  assert.equal(depois.aviso_limite_antigas, null, 'aviso some quando o limite começa');
  const barrado = await reservar(velha, 'ant-8');
  assert.equal(barrado.permitido, false, 'antiga acima de 5 é barrada');
  assert.equal(barrado.motivo, 'cota_esgotada');
  assert.equal((await reservar(velha, 'ant-3')).permitido, true, 'reenvio de orçamento já registrado segue');
  const antigaLeve = await novoUsuario(40);
  await como(antigaLeve);
  await db.query(`select public.registrar_ciencia_limite_gratis('aviso-antigas-v1', 'painel')`);
  await db.query(`update public.limite_gratis_ciencia set visto_em = now() - interval '2 minutes' where tenant_id = $1`, [antigaLeve]);
  for (let i = 1; i <= 5; i++) assert.equal((await enviar(antigaLeve, `leve-${i}`)).permitido, true);
  assert.equal((await reservar(antigaLeve, 'leve-6')).permitido, false, 'o 6º da antiga também é barrado');
  assert.equal((await oferta(pro)).limite_envios, null, 'Pro segue sem teto');
  caso('a partir de D+30: antiga é limitada (5/mês), 6º barrado, Pro livre');

  // rollback
  await desligar();
  assert.equal((await reservar(velha, 'ant-9')).permitido, true, 'corte_antigas NULL solta de novo');
  caso('rollback (cortes NULL) solta a antiga');
}

// 9. CIÊNCIA DO AVISO (parecer LEGAL R0012 §2): ninguém antigo é limitado antes de ver o aviso
{
  await ligar(1);
  // sem aviso no ar (corte_antigas NULL) a RPC não grava nada
  const semAviso = await novoUsuario(40);
  await como(semAviso);
  assert.equal((await db.query<{ v: unknown }>(`select public.registrar_ciencia_limite_gratis('v1', 'app') as v`)).rows[0].v, null);
  assert.equal((await db.query<{ n: number }>(`select count(*)::int n from public.limite_gratis_ciencia where tenant_id=$1`, [semAviso])).rows[0].n, 0);
  caso('sem corte_antigas: registrar ciência não grava nada');

  // corte passou e a antiga NÃO viu: segue sem teto até corte+7d, e o aviso mostra essa data
  await db.query(`update public.limite_gratis_config set corte_antigas = now() - interval '1 day'`);
  const naoViu = await novoUsuario(40);
  for (let i = 1; i <= 7; i++) assert.equal((await enviar(naoViu, `nv-${i}`)).permitido, true, `não viu: envio ${i} livre`);
  const o = await oferta(naoViu);
  assert.equal(o.limite_conta_antiga, false, 'não viu o aviso: ainda não limitada');
  assert.equal(o.limite_envios, null);
  const av = o.aviso_limite_antigas as { a_partir_de: string; ciencia_registrada: boolean };
  const seis = Date.parse(av.a_partir_de) - Date.now();
  assert.ok(seis > 5.9 * 864e5 && seis < 6.1 * 864e5, 'aviso traz corte+7d (a data verdadeira desta conta)');
  assert.equal(av.ciencia_registrada, false);
  assert.equal((av as unknown as { limite: number }).limite, 5, 'aviso traz o teto do servidor');
  // ver o aviso DEPOIS do corte não antecipa o limite (a data mostrada continua valendo)
  await como(naoViu);
  await db.query(`select public.registrar_ciencia_limite_gratis('v1', 'app')`);
  assert.equal((await oferta(naoViu)).limite_conta_antiga, false, 'ver depois do corte não antecipa');
  assert.equal((await reservar(naoViu, 'nv-8')).permitido, true);
  caso('antiga sem ciência no corte: livre até corte+7d, aviso com essa data; ver depois não antecipa');

  // passados 7 dias do corte: limitada mesmo sem ciência; envios ANTES do início não contam
  await db.query(`update public.limite_gratis_config set corte_antigas = now() - interval '8 days'`);
  await db.query(`update public.orcamento_envios_gratis set criado_em = now() - interval '2 days' where tenant_id=$1`, [naoViu]);
  const depois = await oferta(naoViu);
  assert.equal(depois.limite_conta_antiga, true, 'corte+7d passou: limitada');
  assert.equal(depois.envios_usados, 0, 'envios feitos antes do início não contam');
  assert.equal(depois.envios_restantes, 5);
  for (let i = 1; i <= 5; i++) assert.equal((await enviar(naoViu, `nv2-${i}`)).permitido, true, `depois do início: ${i} de 5`);
  const barrado = await reservar(naoViu, 'nv2-6');
  assert.equal(barrado.permitido, false);
  assert.equal(barrado.motivo, 'cota_esgotada');
  caso('corte+7d: antiga limitada sem ciência, contando só envios desde o início (6º barrado)');

  // a tabela não é lida nem gravada direto por authenticated
  const priv = await db.query<{ r: boolean; w: boolean }>(
    `select has_table_privilege('authenticated','public.limite_gratis_ciencia','select') r,
            has_table_privilege('authenticated','public.limite_gratis_ciencia','insert') w`,
  );
  assert.equal(priv.rows[0].r, false);
  assert.equal(priv.rows[0].w, false);
  const inicioPriv = await db.query<{ x: boolean }>(
    `select has_function_privilege('authenticated','public.limite_gratis_inicio_antiga(uuid,uuid,timestamptz)','execute') x`,
  );
  assert.equal(inicioPriv.rows[0].x, false, 'helper interno fechado');
  caso('limite_gratis_ciencia e o helper: fechados para authenticated (só via RPC)');

  // e-mail devolvido (hard_bounce) e sem ciência: nunca entra no limite sem ver o aviso (LEGAL D-1323 cond. 3)
  const devolvido = await novoUsuario(40);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [devolvido]);
  for (let i = 1; i <= 7; i++) assert.equal((await enviar(devolvido, `dv-${i}`)).permitido, true, `bounce sem ciência: envio ${i} livre`);
  const od = await oferta(devolvido);
  assert.equal(od.limite_conta_antiga, false, 'corte+8d e bounce sem ciência: ainda livre');
  const dataD = Date.parse((od.aviso_limite_antigas as { a_partir_de: string }).a_partir_de) - Date.now();
  assert.ok(dataD > 6.9 * 864e5 && dataD < 7.1 * 864e5, 'aviso mostra agora+7d (data que anda até ver)');
  await como(devolvido);
  await db.query(`select public.registrar_ciencia_limite_gratis('v1', 'painel')`);
  assert.equal((await oferta(devolvido)).limite_conta_antiga, false, 'viu agora: 7 dias a partir de ver');
  await db.query(`update public.limite_gratis_ciencia set visto_em = now() - interval '8 days' where tenant_id=$1`, [devolvido]);
  await db.query(`update public.orcamento_envios_gratis set criado_em = now() - interval '9 days' where tenant_id=$1`, [devolvido]);
  assert.equal((await oferta(devolvido)).limite_conta_antiga, true, 'viu há 8 dias: limitada');
  for (let i = 1; i <= 5; i++) assert.equal((await enviar(devolvido, `dv2-${i}`)).permitido, true);
  assert.equal((await reservar(devolvido, 'dv2-6')).permitido, false, 'o 6º barrado');
  // complaint também conta como "sem e-mail"; descadastro (só lembretes) não
  const descad = await novoUsuario(40);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [descad]);
  assert.equal((await oferta(descad)).limite_conta_antiga, true, 'descadastro de lembretes não adia (o aviso chega por e-mail)');
  caso('bounce sem ciência: data anda até ver; depois de ver, 7 dias; descadastro não adia');
  await desligar();
}

console.log(`\nteste-limite-gratis-5-sql: ${ok} casos OK`);
