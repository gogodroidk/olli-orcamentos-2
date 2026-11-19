/**
 * Cupom de influenciador — migration 20261119090000 rodando de verdade (PGlite), dados sintéticos.
 *
 *     node scripts/teste-cupom-sql.ts
 * Prende: código inválido/expirado/inativo; teto de usos (com reserva aberta e abandonada); 1ª cobrança
 * (quem já pagou fica de fora); NÃO acumula com a indicação nos dois sentidos; um cupom por conta;
 * reserva refeita no mesmo checkout; confirmação idempotente; atribuição só com código e contagem; permissões.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { CUPOM_PERCENTUAL, CUPOM_USOS_MAX, INDICACAO_MESES_PRO, INDICACAO_TETO_DIARIO, INDICACAO_TETO_PREMIADAS } from '../src/services/limitesComerciais.ts';

const IND = readFileSync('supabase/migrations/20261010100000_indicacoes.sql', 'utf8');
const CUP = readFileSync('supabase/migrations/20261119090000_cupom_influenciador.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), deleted_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.funil_exclusoes (id bigint generated always as identity primary key, user_id uuid references auth.users (id) on delete cascade, email text, motivo text not null default 'teste');
create table public.ativacao_exemplos_ref (vertical text not null, nome text not null, preco numeric(12,2) not null, primary key (vertical, nome));
create table public.orcamentos (id text primary key, user_id uuid, dados jsonb, criado_em timestamptz not null default now(), excluido_em timestamptz);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null default 'gratis', status text not null default 'canceled',
  stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
  admin_plano_override text, admin_override_ativo boolean not null default false, admin_override_ate timestamptz,
  admin_override_reason text, admin_override_by uuid, admin_override_at timestamptz, atualizado_em timestamptz default now()
);`);
await db.exec(IND);
await db.exec(CUP);
await db.exec(CUP); // idempotente

let seq = 0;
async function conta(): Promise<string> {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  await db.query(`insert into auth.users (id, email, created_at, email_confirmed_at) values ($1,$2, now() - interval '1 hour', now())`, [id, `${id}@t.local`]);
  return id;
}
async function um<T = any>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p);
  return Object.values(r.rows[0] ?? {})[0] as T;
}
const novoCodigo = (cod: string, usos = 2, dias = 30, ativo = true) =>
  db.query(`insert into public.cupons_influenciador (codigo, usos_max, valido_ate, ativo) values ($1,$2, now() + ($3 || ' days')::interval, $4)`, [cod, usos, String(dias), ativo]);
const reservar = (u: string, cod: string, plano = 'pro', canal = 'pix', pct = CUPOM_PERCENTUAL) =>
  um<{ status: string }>('select public.cupom_reservar($1,$2,$3,$4,$5)', [u, cod, pct, plano, canal]);

checar('paridade: percentual 10, teto duro 500', CUPOM_PERCENTUAL === 10 && CUPOM_USOS_MAX === 500);

await novoCodigo('ANA10', 2);
await novoCodigo('VELHO1', 2, -1);
await novoCodigo('OFF001', 2, 30, false);

const a = await conta();
checar('código inexistente = invalido', (await reservar(a, 'NAOEXISTE')).status === 'invalido');
checar('código inativo = invalido', (await reservar(a, 'OFF001')).status === 'invalido');
checar('código vencido = expirado', (await reservar(a, 'VELHO1')).status === 'expirado');
checar('percentual 0 (desligado) não decide nada', (await reservar(a, 'ANA10', 'pro', 'pix', 0)).status === 'desligado');
checar('desligado não grava reserva', (await um<number>('select count(*)::int from public.cupom_usos')) === 0);
checar('código em minúsculo e com espaço vale', (await reservar(a, '  ana10 ')).status === 'ok');

// UMA reserva aberta por conta
checar('2º pedido enquanto a 1ª cobrança ainda está sendo gerada = em_andamento (não gera outra)', (await reservar(a, 'ANA10')).status === 'em_andamento');
const PIX = { id: 'bill_1', brCode: '000201', plano: 'pro_mensal' };
const expira = () => new Date(Date.now() + 3600_000).toISOString();
checar('anexar a cobrança gerada na reserva', (await um<boolean>('select public.cupom_anexar($1,$2::jsonb,$3)', [a, JSON.stringify(PIX), expira()])) === true);
const r2: any = await reservar(a, 'ANA10', 'pro', 'pix');
checar('pedido repetido (mesmo plano/canal) devolve a MESMA cobrança, não cria outra', r2.status === 'ok' && r2.reaproveitar === true && r2.cobranca?.id === 'bill_1', JSON.stringify(r2));
checar('reserva aberta de OUTRO plano = reserva_aberta (nenhum 2º Pix com desconto)', (await reservar(a, 'ANA10', 'pro_anual', 'pix')).status === 'reserva_aberta');
checar('reserva aberta de OUTRO canal = reserva_aberta', (await reservar(a, 'ANA10', 'pro', 'stripe')).status === 'reserva_aberta');
checar('segue 1 linha por conta', (await um<number>('select count(*)::int from public.cupom_usos where user_id=$1', [a])) === 1);
await db.query(`update public.cupom_usos set expira_em = now() - interval '1 minute' where user_id=$1`, [a]);
const r3: any = await reservar(a, 'ANA10', 'pro_anual', 'pix');
checar('cobrança vencida: a reserva fecha e pode abrir outra (cobrança antiga zerada)', r3.status === 'ok' && !r3.reaproveitar
  && (await um<any>('select cobranca from public.cupom_usos where user_id=$1', [a])) === null);

// corrida: 2 chamadas em paralelo na mesma conta
const corrida = await conta();
const [c1, c2] = await Promise.all([reservar(corrida, 'ANA10'), reservar(corrida, 'ANA10')]);
const sts = [c1.status, c2.status].sort().join(',');
checar('corrida (2 chamadas paralelas): exatamente UMA abre a reserva, a outra espera', sts === 'em_andamento,ok', sts);
checar('corrida: 1 linha só', (await um<number>('select count(*)::int from public.cupom_usos where user_id=$1', [corrida])) === 1);
checar('cobrança que falhou: liberar solta a reserva sem cobrança', (await um<boolean>('select public.cupom_liberar($1)', [corrida])) === true
  && (await reservar(corrida, 'ANA10')).status === 'ok');
await um('select public.cupom_anexar($1,$2::jsonb,$3)', [corrida, JSON.stringify(PIX), expira()]);
checar('liberar NÃO apaga reserva com cobrança já gerada', (await um<boolean>('select public.cupom_liberar($1)', [corrida])) === false);
await db.query(`delete from public.cupom_usos where user_id=$1`, [corrida]);

// teto de usos
const b = await conta();
checar('2ª conta ocupa a 2ª vaga', (await reservar(b, 'ANA10')).status === 'ok');
const c = await conta();
checar('teto de usos: 3ª conta = esgotado (reservas abertas contam)', (await reservar(c, 'ANA10')).status === 'esgotado');
await db.query(`update public.cupom_usos set criado_em = now() - interval '3 minutes' where user_id = $1`, [b]);
checar('reserva sem cobrança há +2 min (gateway não respondeu) libera a vaga', (await reservar(c, 'ANA10')).status === 'ok');

// confirmar: 1º pagamento = uso; repetido = idempotente; 2º pagamento com desconto = diferença
await db.query(`update public.cupom_usos set estado='reservado', expira_em = now() + interval '1 hour', cobranca=$2::jsonb where user_id=$1`, [a, JSON.stringify(PIX)]);
const conf1: any = await um('select public.cupom_confirmar($1,$2,$3)', [a, 'bill_1', 390]);
checar('confirmar: o 1º pagamento vira uso pago', conf1.resultado === 'confirmado' && (await um<string>('select estado from public.cupom_usos where user_id=$1', [a])) === 'pago');
checar('confirmar o MESMO pagamento de novo é idempotente', (await um<any>('select public.cupom_confirmar($1,$2,$3)', [a, 'bill_1', 390])).resultado === 'ja_confirmado');
const dup: any = await um('select public.cupom_confirmar($1,$2,$3)', [a, 'bill_2', 390]);
checar('2º pagamento com desconto (corrida) = desconto_duplicado, NUNCA silencioso', dup.resultado === 'desconto_duplicado');
const dev = (await db.query<any>(`select * from public.cupom_diferencas where cobranca_id='bill_2'`)).rows[0];
checar('diferença marcada: cobrança, conta, desconto e estado pendente', dev && dev.user_id === a && dev.desconto_centavos === 390 && dev.estado === 'pendente' && dev.motivo === 'desconto_duplicado', JSON.stringify(dev));
await um('select public.cupom_confirmar($1,$2,$3)', [a, 'bill_2', 390]);
checar('o mesmo 2º pagamento reprocessado não duplica a diferença', (await um<number>(`select count(*)::int from public.cupom_diferencas where cobranca_id='bill_2'`)) === 1);
checar('admin lista a diferença pendente', (await db.query<any>('select * from public.cupom_diferencas_listar()')).rows.some((r: any) => r.cobranca_id === 'bill_2' && r.estado === 'pendente'));
checar('admin dá baixa na diferença (1x)', (await um<boolean>(`select public.cupom_diferenca_resolver('bill_2')`)) === true && (await um<boolean>(`select public.cupom_diferenca_resolver('bill_2')`)) === false);
const semRes: any = await um('select public.cupom_confirmar($1,$2,$3)', [await conta(), 'bill_x', 100]);
checar('pagamento com desconto sem reserva = sem_reserva e diferença marcada', semRes.resultado === 'sem_reserva' && (await um<number>(`select count(*)::int from public.cupom_diferencas where cobranca_id='bill_x'`)) === 1);
checar('só a 1ª cobrança: quem já usou = ja_usou', (await reservar(a, 'ANA10')).status === 'ja_usou');
checar('uso pago não é sobrescrito', (await um<string>('select estado from public.cupom_usos where user_id=$1', [a])) === 'pago');

// 1ª cobrança: quem já tem período no gateway
const pagou = await conta();
await db.query(`insert into public.assinaturas (user_id, plano, status, current_period_end) values ($1,'pro','active', now() + interval '10 days')`, [pagou]);
await novoCodigo('BIA20', 5);
checar('quem já pagou no gateway = ja_pagou', (await reservar(pagou, 'BIA20')).status === 'ja_pagou');
const soOverride = await conta();
await db.query(`insert into public.assinaturas (user_id, plano, status, admin_plano_override, admin_override_ativo, admin_override_ate) values ($1,'pro','canceled','pro', true, now() + interval '20 days')`, [soOverride]);
checar('override (benefício) não conta como pago: cupom ok', (await reservar(soOverride, 'BIA20')).status === 'ok');

// NÃO acumula com a indicação — sentido 1: indicado por link não usa cupom
const indicador = await conta();
const indicado = await conta();
const cod = await um<string>('select public.indicacao_codigo($1)', [indicador]);
await um('select public.indicacao_vincular($1,$2,$3)', [indicado, cod, INDICACAO_TETO_PREMIADAS]);
checar('indicado por link não usa cupom (vale a indicação)', (await reservar(indicado, 'BIA20')).status === 'indicacao');
// indicador SEM recompensa ainda pode usar cupom; depois de recompensado, não
checar('indicador sem prêmio ainda pode usar cupom', (await reservar(indicador, 'BIA20')).status === 'ok');
await db.query(`update public.indicacoes set estado='recompensado' where indicado_id=$1`, [indicado]);
const ind2 = await conta();
const cod2 = await um<string>('select public.indicacao_codigo($1)', [ind2]);
const indo2 = await conta();
await um('select public.indicacao_vincular($1,$2,$3)', [indo2, cod2, INDICACAO_TETO_PREMIADAS]);
await db.query(`update public.indicacoes set estado='recompensado' where indicado_id=$1`, [indo2]);
checar('indicador que já ganhou o mês não usa cupom', (await reservar(ind2, 'BIA20')).status === 'indicacao');

// sentido 2: quem usou cupom (pago) primeiro não ganha o mês da indicação
const usouCupom = await conta();
await reservar(usouCupom, 'BIA20');
checar('cupom só reservado ainda não bloqueia indicação', (await um<boolean>('select public.cupom_usou($1)', [usouCupom])) === false);
await um('select public.cupom_confirmar($1,$2,$3)', [usouCupom, 'bill_u', 390]);
checar('cupom pago: cupom_usou = true', (await um<boolean>('select public.cupom_usou($1)', [usouCupom])) === true);
checar('cupom pago: a indicação NÃO concede o mês', (await um<boolean>(`select public.indicacao_conceder_pro($1,$2,'t')`, [usouCupom, INDICACAO_MESES_PRO])) === false
  && !(await db.query(`select 1 from public.assinaturas where user_id=$1 and admin_override_ativo`, [usouCupom])).rows.length);
const semCupom = await conta();
checar('sem cupom: a indicação concede normal', (await um<boolean>(`select public.indicacao_conceder_pro($1,$2,'t')`, [semCupom, INDICACAO_MESES_PRO])) === true);

// atribuição: só código e contagem
const at = (await db.query<any>('select * from public.cupom_atribuicao()')).rows;
const ana = at.find((r: any) => r.codigo === 'ANA10');
checar('atribuição por código: pagos e reservados (a abandonada segue reservada, só não ocupa vaga)', ana && Number(ana.pagos) === 1 && Number(ana.reservados) >= 1, JSON.stringify(ana));
checar('atribuição não expõe dado pessoal', !('user_id' in (at[0] ?? {})) && !('email' in (at[0] ?? {})));
checar('tabela cupom_usos guarda só conta+código (sem e-mail/nome)', !(await db.query(
  `select 1 from information_schema.columns where table_name='cupom_usos' and column_name in ('email','nome','telefone')`)).rows.length);

// admin: criar/desativar (limites duros)
checar('admin cria código válido', (await um<any>(`select public.cupom_criar('NOVO10', 50, 30)`)).status === 'ok');
checar('admin: código repetido = existe', (await um<any>(`select public.cupom_criar('novo10', 50, 30)`)).status === 'existe');
for (const [c, u, d] of [['ab', 5, 5], ['ABCD', 0, 5], ['ABCD', 501, 5], ['ABCD', 5, 0], ['ABCD', 5, 91], ["A-B'C", 5, 5]] as const) {
  checar(`admin: ${c}/${u}/${d} fora dos limites = invalido`, (await um<any>(`select public.cupom_criar($1,$2,$3)`, [c, u, d])).status === 'invalido');
}
const novaConta = await conta();
checar('código criado vale e respeita a validade escolhida', (await reservar(novaConta, 'NOVO10')).status === 'ok');
checar('admin desativa e o código vira invalido', (await um<boolean>(`select public.cupom_desativar('novo10')`)) === true
  && (await reservar(await conta(), 'NOVO10')).status === 'invalido');
checar('desativar de novo = false (idempotente)', (await um<boolean>(`select public.cupom_desativar('NOVO10')`)) === false);

// permissões: só service_role
for (const fn of ['cupom_reservar(uuid,text,integer,text,text)', 'cupom_verificar(uuid,text,integer)', 'cupom_confirmar(uuid,text,integer)', 'cupom_anexar(uuid,jsonb,timestamptz)', 'cupom_liberar(uuid)', 'cupom_diferencas_listar()', 'cupom_diferenca_resolver(text)', 'cupom_atribuicao()', 'cupom_usou(uuid)', 'cupom_criar(text,integer,integer)', 'cupom_desativar(text)']) {
  const anon = await um<boolean>(`select has_function_privilege('anon', '${fn}', 'execute')`);
  const auth = await um<boolean>(`select has_function_privilege('authenticated', '${fn}', 'execute')`);
  const sr = await um<boolean>(`select has_function_privilege('service_role', '${fn}', 'execute')`);
  checar(`permissão ${fn}: só service_role`, !anon && !auth && sr);
}
checar('tabelas sem acesso direto de anon/authenticated', !(await um<boolean>(`select has_table_privilege('authenticated','public.cupom_usos','select') or has_table_privilege('authenticated','public.cupom_diferencas','select') or has_table_privilege('anon','public.cupons_influenciador','select')`)));

void INDICACAO_TETO_DIARIO;
console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
