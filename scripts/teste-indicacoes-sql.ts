/**
 * Indicação — a migration `20261010100000_indicacoes.sql` rodando de verdade num
 * Postgres (PGlite, em memória), com dados sintéticos.
 *
 *     node scripts/teste-indicacoes-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Prende: código único e estável; vínculo (auto-indicação, conta antiga, ciclo,
 * duplicado, código ruim); recompensa só no 1º orçamento REAL (exemplo sem edição,
 * preço 0 e lixeira não contam); desligado (0) não decide nada; e-mail confirmado dos dois
 * lados; dois lados ganham 1 mês de Pro (override, sem tocar no gateway) uma vez; idempotência;
 * contas internas; teto por pessoa e teto diário; paridade com as constantes; permissões.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { INDICACAO_MESES_PRO, INDICACAO_TETO_DIARIO, INDICACAO_TETO_PREMIADAS } from '../src/services/limitesComerciais.ts';

const MIGRATION = readFileSync('supabase/migrations/20261010100000_indicacoes.sql', 'utf8');

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), deleted_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.funil_exclusoes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade, email text, motivo text not null default 'teste'
);
create table public.ativacao_exemplos_ref (vertical text not null, nome text not null, preco numeric(12,2) not null, primary key (vertical, nome));
insert into public.ativacao_exemplos_ref values ('geral', 'Visita técnica e avaliação', 60.00);
create table public.orcamentos (id text primary key, user_id uuid, dados jsonb, criado_em timestamptz not null default now(), excluido_em timestamptz);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null default 'gratis', status text not null default 'canceled',
  stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
  admin_plano_override text, admin_override_ativo boolean not null default false, admin_override_ate timestamptz,
  admin_override_reason text, admin_override_by uuid, admin_override_at timestamptz, atualizado_em timestamptz default now()
);
`;

const db = new PGlite();
await db.exec(ESQUEMA);
await db.exec(MIGRATION);
await db.exec(MIGRATION); // idempotente: reaplicar não pode quebrar

let seq = 0;
const uid = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
async function conta(horasAtras = 1, email?: string, confirmado = true): Promise<string> {
  const id = uid();
  await db.query(
    `insert into auth.users (id, email, created_at, email_confirmed_at) values ($1, $2, now() - ($3 || ' hours')::interval, ${confirmado ? 'now()' : 'null'})`,
    [id, email ?? `${id}@t.local`, String(horasAtras)],
  );
  return id;
}
async function um<T = unknown>(sql: string, p: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, p);
  return Object.values(r.rows[0] ?? {})[0] as T;
}
async function orc(user: string, itens: unknown, extra = ''): Promise<void> {
  await db.query(
    `insert into public.orcamentos (id, user_id, dados, excluido_em) values ($1, $2, $3::jsonb, ${extra || 'null'})`,
    [`o${++seq}`, user, JSON.stringify({ itens })],
  );
}
const REAL = [{ nome: 'Troca de resistência', preco: 150 }];
const codigoDe = (u: string) => um<string>('select public.indicacao_codigo($1)', [u]);
const vincular = (u: string, c: string) => um<string>('select public.indicacao_vincular($1,$2,$3)', [u, c, INDICACAO_TETO_PREMIADAS]);
const recompensar = (u: string, meses = INDICACAO_MESES_PRO, dia = INDICACAO_TETO_DIARIO) =>
  um<{ status: string; motivo?: string }>('select public.indicacao_recompensar($1,$2,$3,$4)', [u, meses, INDICACAO_TETO_PREMIADAS, dia]);
const override = async (u: string) => (await db.query<any>(`select plano, status, stripe_customer_id, current_period_end, admin_plano_override, admin_override_ativo, admin_override_ate from public.assinaturas where user_id=$1`, [u])).rows[0] ?? null;
const mesesAFrente = (d: Date | string) => (new Date(d).getTime() - Date.now()) / (30.44 * 86400000);
const temPro = async (u: string) => { const o = await override(u); return !!o && o.admin_plano_override === 'pro' && o.admin_override_ativo && Math.abs(mesesAFrente(o.admin_override_ate) - INDICACAO_MESES_PRO) < 0.2; };

console.log('código');
const A = await conta(100);
const cA = await codigoDe(A);
checar('código tem 6 chars do alfabeto sem ambíguos', /^[A-HJ-NP-Z2-9]{6}$/.test(cA), cA);
checar('estável: 2ª chamada devolve o mesmo', (await codigoDe(A)) === cA);
const B2 = await conta(100);
checar('usuário diferente, código diferente', (await codigoDe(B2)) !== cA);
let lancou = false;
try { await codigoDe(uid()); } catch { lancou = true; }
checar('usuário inexistente falha (não cria órfão)', lancou);

console.log('vínculo');
const B = await conta(2);
checar('código ruim', (await vincular(B, 'x')) === 'codigo_invalido');
checar('código inexistente', (await vincular(B, 'AAAAAA')) === 'codigo_invalido');
checar('auto-indicação', (await vincular(A, cA)) === 'auto_indicacao');
const velha = await conta(200);
checar('conta com mais de 7 dias não vincula', (await vincular(velha, cA)) === 'conta_antiga');
checar('minúsculo e espaço são aceitos', (await vincular(B, ` ${cA.toLowerCase()} `)) === 'vinculado');
checar('2ª vez = ja_vinculado', (await vincular(B, cA)) === 'ja_vinculado');
const X = await conta(1);
const Y = await conta(1);
const cX = await codigoDe(X);
const cY = await codigoDe(Y);
await vincular(Y, cX);
checar('ciclo X→Y e Y→X bloqueado', (await vincular(X, cY)) === 'ciclo');
const cB = await codigoDe(B);
checar('indicado já vinculado não troca de indicador', (await vincular(B, cX)) === 'ja_vinculado');
checar('código do próprio indicado: auto_indicacao', (await vincular(B, cB)) === 'auto_indicacao');

console.log('recompensa');
checar('meses 0 = desligado, não decide', (await recompensar(B, 0)).status === 'desligado');
checar('teto 0 / teto diário 0 também desligam', (await um<{ status: string }>('select public.indicacao_recompensar($1,1,0,20)', [B])).status === 'desligado' && (await recompensar(B, 1, 0)).status === 'desligado');
checar('sem orçamento = sem_orcamento_real', (await recompensar(B)).status === 'sem_orcamento_real');
await orc(B, [{ nome: 'Visita técnica e avaliação', preco: 60 }]);
checar('só exemplo sem edição não conta', (await recompensar(B)).status === 'sem_orcamento_real');
await orc(B, [{ nome: 'Serviço', preco: 0 }]);
checar('preço zero não conta', (await recompensar(B)).status === 'sem_orcamento_real');
await orc(B, REAL, 'now()');
checar('orçamento na lixeira não conta', (await recompensar(B)).status === 'sem_orcamento_real');
checar('nada foi concedido até aqui', (await override(A)) === null && (await override(B)) === null);
await orc(B, REAL);
await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [B]);
checar('indicado SEM e-mail confirmado fica pendente (não premia)', (await recompensar(B)).status === 'email_nao_confirmado' && (await override(A)) === null);
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [B]);
await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [A]);
checar('indicador SEM e-mail confirmado também fica pendente', (await recompensar(B)).status === 'email_nao_confirmado');
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [A]);
checar('pendente continua "cadastrou" (volta a valer quando confirmar)', (await um<string>(`select estado from public.indicacoes where indicado_id=$1`, [B])) === 'cadastrou');
const r1 = await recompensar(B);
checar('1º orçamento real recompensa', r1.status === 'recompensado', JSON.stringify(r1));
checar('indicador e indicado ganham 1 mês de Pro (constante)', (await temPro(A)) && (await temPro(B)) && (await um<number>(`select meses_pro from public.indicacoes where indicado_id=$1`, [B])) === INDICACAO_MESES_PRO);
const oA = await override(A);
checar('NÃO toca no gateway (sem pagante, sem período, sem stripe)', oA.status === 'canceled' && oA.current_period_end === null && oA.stripe_customer_id === null, JSON.stringify(oA));
const ateA = (await override(A)).admin_override_ate;
checar('2ª chamada não premia de novo (vigência igual)', (await recompensar(B)).status === 'ja_decidido' && +new Date((await override(A)).admin_override_ate) === +new Date(ateA));
checar('estado e datas gravados', (await um<string>(`select estado from public.indicacoes where indicado_id=$1`, [B])) === 'recompensado'
  && (await um<boolean>(`select recompensado_em is not null and orcou_em is not null from public.indicacoes where indicado_id=$1`, [B])));
checar('sem indicação = sem_indicacao', (await recompensar(A, 10)).status === 'sem_indicacao');
checar('trilha: motivo gravado nos dois lados', (await um<number>(`select count(*)::int from public.assinaturas where admin_override_reason like '%ndica%'`)) === 2);

console.log('contas internas');
const I = await conta(1, 'interna@olli.local');
await db.query(`insert into public.funil_exclusoes (email) values ('interna@olli.local')`);
await vincular(I, cA);
await orc(I, REAL);
const rI = await recompensar(I, 10);
checar('indicado em funil_exclusoes (por e-mail) não é pago', rI.status === 'sem_recompensa' && rI.motivo === 'conta_interna', JSON.stringify(rI));
const Int = await conta(100);
await db.query(`insert into public.funil_exclusoes (user_id) values ($1)`, [Int]);
const cInt = await codigoDe(Int);
const D = await conta(1);
await vincular(D, cInt);
await orc(D, REAL);
checar('indicador em funil_exclusoes (por id) não paga', (await recompensar(D, 10)).motivo === 'conta_interna');
checar('conta interna não ganhou nada', (await override(Int)) === null && (await override(D)) === null);

console.log('guardas do Pro concedido');
const E = await conta(100);
await db.query(`insert into public.assinaturas (user_id, plano, status, admin_plano_override, admin_override_ativo, admin_override_ate) values ($1,'empresa','canceled','empresa',true,null)`, [E]);
await db.query(`select public.indicacao_conceder_pro($1, 1, 'teste de guarda')`, [E]);
const oE = await override(E);
checar('quem já tem Empresa sem data final continua Empresa e sem data final', oE.admin_plano_override === 'empresa' && oE.admin_override_ate === null);
const S = await conta(100);
await db.query(`select public.indicacao_conceder_pro($1, 1, 'teste soma')`, [S]);
await db.query(`select public.indicacao_conceder_pro($1, 1, 'teste soma')`, [S]);
checar('concessão vigente soma a partir do fim (2 meses, não 1)', Math.abs(mesesAFrente((await override(S)).admin_override_ate) - 2) < 0.2);
const PG = await conta(100);
await db.query(`insert into public.assinaturas (user_id, plano, status, stripe_customer_id, current_period_end) values ($1,'pro','active','cus_x', now() + interval '20 days')`, [PG]);
await db.query(`select public.indicacao_conceder_pro($1, 1, 'teste pagante')`, [PG]);
const oPG = await override(PG);
checar('pagante: não mexe no que já pagou (status/stripe/período intactos)', oPG.status === 'active' && oPG.stripe_customer_id === 'cus_x' && oPG.current_period_end !== null);

console.log('teto por pessoa e teto diário');
const T = await conta(100);
const cT = await codigoDe(T);
const vinc: string[] = [];
const filhos: string[] = [];
for (let i = 0; i < INDICACAO_TETO_PREMIADAS + 2; i++) {
  const x = await conta(1);
  vinc.push(await vincular(x, cT));
  filhos.push(x);
}
checar('até o teto vinculam, o resto bate no teto', vinc.slice(0, INDICACAO_TETO_PREMIADAS).every((s) => s === 'vinculado') && vinc.slice(INDICACAO_TETO_PREMIADAS).every((s) => s === 'teto_indicador'), vinc.join(','));
checar('quem foi barrado não ficou vinculado', (await um<number>(`select count(*)::int from public.indicacoes where indicador_id=$1`, [T])) === INDICACAO_TETO_PREMIADAS);
const resumoAntes = await um<any>(`select public.indicacao_resumo($1,$2)`, [T, INDICACAO_TETO_PREMIADAS]);
checar('contas novas sem orçamento: contador = 0 recompensadas', resumoAntes.recompensadas === 0 && resumoAntes.cadastraram === undefined, JSON.stringify(resumoAntes));
for (const x of filhos.slice(0, INDICACAO_TETO_PREMIADAS)) { await orc(x, REAL); await recompensar(x); }
const oT = await override(T);
checar('indicador com o teto cheio: soma exatamente TETO × meses', Math.abs(mesesAFrente(oT.admin_override_ate) - INDICACAO_TETO_PREMIADAS * INDICACAO_MESES_PRO) < 0.3, JSON.stringify(oT));
const resumoDepois = await um<any>(`select public.indicacao_resumo($1,$2)`, [T, INDICACAO_TETO_PREMIADAS]);
checar('contador conta só recompensados (teto cheio)', resumoDepois.recompensadas === INDICACAO_TETO_PREMIADAS && resumoDepois.teto === INDICACAO_TETO_PREMIADAS, JSON.stringify(resumoDepois));

// teto diário: com teto 1/dia, o 2º prêmio do dia fica pendente (não vira sem_recompensa)
const U = await conta(100);
const cU = await codigoDe(U);
const u1 = await conta(1); const u2 = await conta(1);
await vincular(u1, cU); await vincular(u2, cU);
await orc(u1, REAL); await orc(u2, REAL);
const hoje = await um<number>(`select count(*)::int from public.indicacoes where estado='recompensado' and recompensado_em >= date_trunc('day', now())`);
checar('antes do teto diário premia', (await recompensar(u1, INDICACAO_MESES_PRO, hoje + 1)).status === 'recompensado');
checar('no teto diário fica pendente', (await recompensar(u2, INDICACAO_MESES_PRO, hoje + 1)).status === 'teto_diario' && (await override(u2)) === null);
checar('pendente por teto diário segue "cadastrou" e premia no dia seguinte', (await um<string>(`select estado from public.indicacoes where indicado_id=$1`, [u2])) === 'cadastrou' && (await recompensar(u2)).status === 'recompensado');

console.log('paridade das constantes');
const wk = await import('../worker/src/indicacao.js');
checar('worker espelha limitesComerciais (meses, teto, teto diário)', wk.INDICACAO_MESES_PRO === INDICACAO_MESES_PRO && wk.INDICACAO_TETO_PREMIADAS === INDICACAO_TETO_PREMIADAS && wk.INDICACAO_TETO_DIARIO === INDICACAO_TETO_DIARIO);
checar('migration não digita valor nem teto (sem "5", sem créditos)', !/>= 5|'teto',\s+5|credit_ledger|p_creditos/.test(MIGRATION));

console.log('permissões');
async function como(papel: string, sql: string): Promise<boolean> {
  await db.exec(`set role ${papel}`);
  try { await db.query(sql); return true; } catch { return false; } finally { await db.exec('reset role'); }
}
checar('authenticated não executa a concessão de Pro', !(await como('authenticated', `select public.indicacao_conceder_pro('${B}', 1, 'x')`)));
checar('anon não executa RPC', !(await como('anon', `select public.indicacao_codigo('${A}')`)));
checar('authenticated não executa RPC de recompensa', !(await como('authenticated', `select public.indicacao_recompensar('${B}', 1, 3, 20)`)));
checar('authenticated não executa vincular', !(await como('authenticated', `select public.indicacao_vincular('${B}', '${cA}', 3)`)));
checar('service_role executa', await como('service_role', `select public.indicacao_resumo('${A}', 3)`));
checar('authenticated não escreve em indicacoes', !(await como('authenticated', `insert into public.indicacoes (indicador_id, indicado_id, codigo) values ('${A}','${uid()}','AAAAAA')`)));
checar('authenticated não lê indicacoes direto (sem PII do indicado)', !(await como('authenticated', `select * from public.indicacoes`)));
await db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}'`);
const meus = (await db.query(`select count(*)::int as n from public.indicacao_codigos`)).rows[0] as { n: number };
await db.exec('reset role');
checar('indicador lê só o próprio código (RLS)', meus.n === 1, `viu ${meus.n}`);
const z = await conta(1);
await vincular(z, cA);
await orc(z, [{ nome: 'x', preco: 'abc' }]);
checar('preço lixo ("abc") não derruba a recompensa', (await recompensar(z, 10)).status === 'sem_orcamento_real');

console.log(`\n${ok} ok, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
