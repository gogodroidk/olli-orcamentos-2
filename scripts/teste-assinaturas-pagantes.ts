/**
 * Assinaturas pagantes (T-011) — a MESMA tabela de casos contra as duas
 * implementações da regra "quem paga":
 *   - worker/src/assinaturasPagantes.js (painel admin: pagantes, MRR, sumidos);
 *   - supabase/migrations/20261008100000_assinaturas_pagantes.sql rodando de
 *     verdade num Postgres (PGlite, em memória), view public.assinaturas_pagantes.
 *
 *     node scripts/teste-assinaturas-pagantes.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - cortesia do dono ('comp_manual_empresa', até 2099) e demo ('sub_demo_…')
 *    NÃO contam, nem o override do painel vigente, nem vigência de 2099 sem id;
 *  - Stripe real, Mercado Pago, Pix avulso e Google Play contam;
 *  - o acesso NÃO muda: derivarEntitlement continua liberando a cortesia;
 *  - anual da AbacatePay somado a outro anual (~25 meses) continua pagante;
 *  - conta interna (dono por e-mail, funil_exclusoes por id/e-mail, admin) não
 *    entra em pagantes/MRR mesmo pagando de verdade — igual ao funil;
 *  - o bloco "receita" do painel (resumirReceita) e o rótulo da lista
 *    (origemExibida) saem certos;
 *  - JS e SQL concordam caso a caso (inclusive no motivo);
 *  - permissões: anon/authenticated não leem a view; service_role lê.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  assinaturaPagante,
  contextoContasInternas,
  motivoContaInterna,
  motivoNaoPagante,
  origemExibida,
  resumirReceita,
} from '../worker/src/assinaturasPagantes.js';
import { derivarEntitlement } from '../worker/src/entitlement.js';

let ok = 0;
let falhas = 0;
function checar(nome: string, condicao: unknown, detalhe = ''): void {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const AGORA = '2026-10-04T12:00:00Z';
const AGORA_MS = Date.parse(AGORA);
const MES = '2026-11-04T12:00:00Z';
const ANO = '2027-10-04T12:00:00Z';

type Linha = {
  nome: string;
  esperado: string | null;
  plano: string;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  mp_preapproval_id?: string | null;
  admin_plano_override?: string | null;
  admin_override_ativo?: boolean;
  admin_override_ate?: string | null;
};

const CASOS: Linha[] = [
  // Os dois "pagantes" de produção que não pagam.
  { nome: 'cortesia do dono comp_manual_empresa até 2099', esperado: 'id_ficticio', plano: 'empresa', status: 'active', current_period_end: '2099-12-31T23:59:59Z', stripe_subscription_id: 'comp_manual_empresa' },
  { nome: 'cortesia com comp_ só no customer', esperado: 'id_ficticio', plano: 'empresa', status: 'active', current_period_end: '2099-12-31T23:59:59Z', stripe_customer_id: 'comp_manual' },
  { nome: 'demo sub_demo_grtech', esperado: 'id_ficticio', plano: 'pro', status: 'active', current_period_end: MES, stripe_subscription_id: 'sub_demo_grtech', stripe_customer_id: 'cus_demo_grtech' },
  { nome: 'interna com override vigente e status active', esperado: 'override_admin', plano: 'pro', status: 'active', current_period_end: MES, admin_plano_override: 'empresa', admin_override_ativo: true, admin_override_ate: null },
  { nome: 'vigência 2099 sem id nenhum', esperado: 'vigencia_manual', plano: 'empresa', status: 'active', current_period_end: '2099-12-31T23:59:59Z' },
  // Liberado só pelo override (linha nasce 'canceled'): acesso sim, pagamento não.
  { nome: 'override do painel em linha canceled', esperado: 'sem_pagamento', plano: 'gratis', status: 'canceled', current_period_end: null, admin_plano_override: 'pro', admin_override_ativo: true, admin_override_ate: ANO },
  { nome: 'grátis', esperado: 'sem_pagamento', plano: 'gratis', status: 'canceled', current_period_end: null },
  { nome: 'Stripe vencida', esperado: 'sem_pagamento', plano: 'pro', status: 'active', current_period_end: '2026-09-01T00:00:00Z', stripe_subscription_id: 'sub_1Abc', stripe_customer_id: 'cus_1Abc' },
  { nome: 'past_due não paga', esperado: 'sem_pagamento', plano: 'pro', status: 'past_due', current_period_end: MES, stripe_subscription_id: 'sub_1Abc', stripe_customer_id: 'cus_1Abc' },
  // Pagantes reais.
  { nome: 'Stripe real', esperado: null, plano: 'pro', status: 'active', current_period_end: MES, stripe_subscription_id: 'sub_1NxReal', stripe_customer_id: 'cus_PxReal' },
  { nome: 'Stripe anual', esperado: null, plano: 'empresa', status: 'active', current_period_end: ANO, stripe_subscription_id: 'sub_1NxAnual', stripe_customer_id: 'cus_PxAnual' },
  { nome: 'Pro 12x avulso (sem subscription)', esperado: null, plano: 'pro', status: 'active', current_period_end: ANO, stripe_subscription_id: null, stripe_customer_id: 'cus_Px12x' },
  { nome: 'Mercado Pago recorrente', esperado: null, plano: 'pro', status: 'active', current_period_end: MES, mp_preapproval_id: '2c9380848' },
  { nome: 'Pix avulso / Google Play (sem ids Stripe)', esperado: null, plano: 'empresa', status: 'active', current_period_end: MES },
  { nome: 'AbacatePay: anual somado a anual vigente (~25 meses)', esperado: null, plano: 'pro', status: 'active', current_period_end: '2028-11-04T12:00:00Z' },
  { nome: 'vigência de 4 anos sem id', esperado: 'vigencia_manual', plano: 'pro', status: 'active', current_period_end: '2030-10-04T12:00:00Z' },
  { nome: 'override vencido não esconde quem paga', esperado: null, plano: 'pro', status: 'active', current_period_end: MES, stripe_subscription_id: 'sub_1Pago', stripe_customer_id: 'cus_1Pago', admin_plano_override: 'empresa', admin_override_ativo: true, admin_override_ate: '2026-09-01T00:00:00Z' },
];

console.log('\nAssinaturas pagantes — worker (JS)');
for (const c of CASOS) {
  const motivo = motivoNaoPagante(c, AGORA_MS);
  checar(`${c.nome} → ${c.esperado ?? 'pagante'}`, motivo === c.esperado, `veio ${motivo}`);
  checar(`${c.nome}: assinaturaPagante coerente`, assinaturaPagante(c, AGORA_MS) === (c.esperado === null));
}

// O acesso não muda: a cortesia continua com o plano Empresa.
const cortesia = derivarEntitlement(CASOS[0], AGORA_MS);
checar('acesso da cortesia intacto (entitlement = empresa)', cortesia.plano === 'empresa', JSON.stringify(cortesia));
const interna = derivarEntitlement(CASOS[3], AGORA_MS);
checar('acesso da interna intacto (override = empresa)', interna.plano === 'empresa', JSON.stringify(interna));

// Conta interna (mesma lista do funil).
const ctx = contextoContasInternas({
  emailsDono: [' Dono@Olli.test '],
  exclusoes: [{ user_id: 'u-lista', email: null }, { user_id: null, email: 'demo@olli.test' }],
  admins: [{ user_id: 'u-admin' }],
});
checar('interna: dono por e-mail (normalizado)', motivoContaInterna('u-dono', 'DONO@olli.test', ctx) === 'dono');
checar('interna: lista por id', motivoContaInterna('u-lista', 'x@cliente.test', ctx) === 'lista_interna');
checar('interna: lista por e-mail', motivoContaInterna('u-demo', 'demo@olli.test', ctx) === 'lista_interna');
checar('interna: admin', motivoContaInterna('u-admin', 'adm@olli.test', ctx) === 'admin');
checar('cliente comum não é interno', motivoContaInterna('u-cli', 'cliente@ex.test', ctx) === null);

// Bloco "receita" do painel com o cenário de produção: MRR real zero.
const STRIPE_REAL = CASOS.find((c) => c.nome === 'Stripe real') as Linha;
const COMP = CASOS[0];
const DEMO = CASOS[2];
const usoVelho = '2026-09-01T00:00:00Z';
const usoRecente = '2026-10-03T00:00:00Z';
const producao = resumirReceita({
  assinaturas: [
    { ...COMP, user_id: 'u-dono' },
    { ...DEMO, user_id: 'u-demo' },
    { ...STRIPE_REAL, user_id: 'u-admin' }, // admin pagando de verdade: interno
  ],
  usuarios: [
    { id: 'u-dono', email: 'dono@olli.test', ultimoUso: usoVelho },
    { id: 'u-demo', email: 'demo@olli.test', ultimoUso: usoVelho },
    { id: 'u-admin', email: 'adm@olli.test', ultimoUso: usoVelho },
  ],
  contexto: ctx,
  precoMensal: { pro: 39, empresa: 99 },
  agoraMs: AGORA_MS,
});
checar('produção: 0 pagantes, MRR 0, 0 sumidos, 3 liberados',
  producao.pagantes === 0 && producao.mrrEstimado === 0 && producao.emRisco === 0 && producao.manuais === 3,
  JSON.stringify(producao));

const comCliente = resumirReceita({
  assinaturas: [
    { ...COMP, user_id: 'u-dono' },
    { ...STRIPE_REAL, user_id: 'c1' },
    { ...STRIPE_REAL, plano: 'empresa', user_id: 'c2' },
    { ...STRIPE_REAL, user_id: 'orfa' }, // sem usuário no auth: ignorada
  ],
  usuarios: [
    { id: 'u-dono', email: 'dono@olli.test', ultimoUso: usoRecente },
    { id: 'c1', email: 'c1@ex.test', ultimoUso: usoRecente },
    { id: 'c2', email: 'c2@ex.test', ultimoUso: usoVelho },
  ],
  contexto: ctx,
  precoMensal: { pro: 39, empresa: 99 },
  agoraMs: AGORA_MS,
});
checar('clientes reais: 2 pagantes, MRR 138, 1 sumido, 1 liberado',
  comCliente.pagantes === 2 && comCliente.mrrEstimado === 138 && comCliente.emRisco === 1
    && comCliente.manuais === 1 && comCliente.porPlano.pro === 1 && comCliente.porPlano.empresa === 1,
  JSON.stringify(comCliente));

// Rótulo da lista: plano (acesso) intacto, origem honesta.
const rotDono = origemExibida({ ...COMP, user_id: 'u-dono' }, 'dono@olli.test', ctx, AGORA_MS);
checar('lista: cortesia = Empresa · liberado', rotDono.plano === 'empresa' && rotDono.origem === 'admin', JSON.stringify(rotDono));
const rotAdmin = origemExibida({ ...STRIPE_REAL, user_id: 'u-admin' }, 'adm@olli.test', ctx, AGORA_MS);
checar('lista: admin pagando = Pro · liberado', rotAdmin.plano === 'pro' && rotAdmin.origem === 'admin', JSON.stringify(rotAdmin));
const rotCli = origemExibida({ ...STRIPE_REAL, user_id: 'c1' }, 'c1@ex.test', ctx, AGORA_MS);
checar('lista: cliente pagando = pagamento', rotCli.origem === 'pagamento');
const rotGratis = origemExibida({ plano: 'gratis', status: 'canceled', current_period_end: null, user_id: 'g' }, 'g@ex.test', ctx, AGORA_MS);
checar('lista: grátis = gratis', rotGratis.plano === 'gratis' && rotGratis.origem === 'gratis');

// ── SQL ─────────────────────────────────────────────────────────────────────
const FUNIL = readFileSync('supabase/migrations/20260930120100_funil_receita.sql', 'utf8');
const ficticia = FUNIL.match(/create or replace function public\.funil_assinatura_ficticia[\s\S]*?\$\$;\n/);
if (!ficticia) throw new Error('funil_assinatura_ficticia não encontrada na migration do funil');
const MIGRATION = readFileSync('supabase/migrations/20261008100000_assinaturas_pagantes.sql', 'utf8');

const db = new PGlite();
await db.exec(`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table public.funil_exclusoes (user_id uuid, email text);
create table public.admin_memberships (user_id uuid primary key);
create table public.assinaturas (
  user_id uuid primary key, plano text not null, status text not null,
  stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
  atualizado_em timestamptz not null default now(), mp_preapproval_id text,
  admin_plano_override text, admin_override_ativo boolean not null default false,
  admin_override_ate timestamptz, admin_override_reason text, admin_override_by uuid, admin_override_at timestamptz
);
grant select on public.assinaturas to service_role;
`);
await db.exec(ficticia[0]);
await db.exec(MIGRATION);
await db.exec(MIGRATION); // idempotente
console.log('\nAssinaturas pagantes — migration aplicada no PGlite (2x)');

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
for (const [i, c] of CASOS.entries()) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id(i + 1), `c${i + 1}@cliente.test`]);
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, current_period_end, stripe_subscription_id,
       stripe_customer_id, mp_preapproval_id, admin_plano_override, admin_override_ativo, admin_override_ate)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id(i + 1), c.plano, c.status, c.current_period_end, c.stripe_subscription_id ?? null,
      c.stripe_customer_id ?? null, c.mp_preapproval_id ?? null, c.admin_plano_override ?? null,
      c.admin_override_ativo ?? false, c.admin_override_ate ?? null],
  );
}

const motivos = await db.query<{ user_id: string; motivo: string | null }>(
  `select user_id, public.assinatura_motivo_nao_pagante(plano, status, current_period_end,
     stripe_subscription_id, stripe_customer_id, admin_plano_override, admin_override_ativo,
     admin_override_ate, $1::timestamptz) as motivo
     from public.assinaturas order by user_id`,
  [AGORA],
);
for (const [i, c] of CASOS.entries()) {
  const linha = motivos.rows.find((r) => r.user_id === id(i + 1));
  checar(`SQL = JS: ${c.nome}`, linha && linha.motivo === c.esperado, `SQL ${linha?.motivo}, esperado ${c.esperado}`);
}

// A view usa now(); em 04/10/2026 ou depois, os mesmos casos valem enquanto as
// vigências de teste não vencem. Compara só o conjunto que a view devolve com
// o que a função diz para now().
const view = await db.query<{ user_id: string }>('select user_id from public.assinaturas_pagantes order by user_id');
const agoraReal = await db.query<{ user_id: string }>(
  `select user_id from public.assinaturas
    where public.assinatura_motivo_nao_pagante(plano, status, current_period_end, stripe_subscription_id,
      stripe_customer_id, admin_plano_override, admin_override_ativo, admin_override_ate) is null
    order by user_id`,
);
checar('view = função (now())', JSON.stringify(view.rows) === JSON.stringify(agoraReal.rows));
for (const nome of ['cortesia do dono comp_manual_empresa até 2099', 'demo sub_demo_grtech', 'interna com override vigente e status active']) {
  const idx = CASOS.findIndex((c) => c.nome === nome);
  checar(`view não traz: ${nome}`, !view.rows.some((r) => r.user_id === id(idx + 1)));
}

// Conta interna no SQL: quatro clientes pagando de verdade (Stripe real); três
// são internos. A view tira os do banco; a função completa tira também o dono.
const STRIPE_REAL_IDX = CASOS.findIndex((c) => c.nome === 'Stripe real');
const internos = [
  { n: 201, email: 'Dono@Olli.test' },
  { n: 202, email: 'lista-id@olli.test' },
  { n: 203, email: 'lista-email@olli.test' },
  { n: 204, email: 'adm@olli.test' },
  { n: 205, email: 'cliente@ex.test' },
];
for (const x of internos) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id(x.n), x.email]);
  await db.query(
    `insert into public.assinaturas (user_id, plano, status, current_period_end, stripe_subscription_id, stripe_customer_id)
     select $1, plano, status, current_period_end, stripe_subscription_id, stripe_customer_id
       from public.assinaturas where user_id = $2`,
    [id(x.n), id(STRIPE_REAL_IDX + 1)],
  );
}
await db.query('insert into public.funil_exclusoes (user_id) values ($1)', [id(202)]);
await db.query("insert into public.funil_exclusoes (email) values ('lista-email@olli.test')");
await db.query('insert into public.admin_memberships (user_id) values ($1)', [id(204)]);

const naView = new Set((await db.query<{ user_id: string }>('select user_id from public.assinaturas_pagantes')).rows.map((r) => r.user_id));
checar('view: tira lista por id, lista por e-mail e admin', !naView.has(id(202)) && !naView.has(id(203)) && !naView.has(id(204)));
checar('view: dono sem e-mail passado continua (só o worker sabe)', naView.has(id(201)));
checar('view: cliente comum fica', naView.has(id(205)));
const completa = new Set((await db.query<{ user_id: string }>(
  "select user_id from public.admin_assinaturas_pagantes(array[' dono@olli.test'])",
)).rows.map((r) => r.user_id));
checar('admin_assinaturas_pagantes: tira o dono pelo e-mail', !completa.has(id(201)) && completa.has(id(205)));
checar('admin_assinaturas_pagantes ⊆ view', [...completa].every((u) => naView.has(u)));
const motivosInternos = await db.query<{ m: string | null }>(
  "select public.receita_conta_interna(u, array['dono@olli.test']) as m from unnest($1::uuid[]) as u",
  [[id(201), id(202), id(203), id(204), id(205)]],
);
checar('SQL = JS nos motivos de conta interna',
  JSON.stringify(motivosInternos.rows.map((r) => r.m)) === JSON.stringify(['dono', 'lista_interna', 'lista_interna', 'admin', null]),
  JSON.stringify(motivosInternos.rows));

// Permissões.
async function consegueLer(papel: string): Promise<boolean> {
  try {
    await db.exec(`set role ${papel}`);
    await db.query('select count(*) from public.assinaturas_pagantes');
    return true;
  } catch {
    return false;
  } finally {
    await db.exec('reset role');
  }
}
checar('anon não lê a view', !(await consegueLer('anon')));
checar('authenticated não lê a view', !(await consegueLer('authenticated')));
checar('service_role lê a view', await consegueLer('service_role'));
async function consegueChamar(papel: string): Promise<boolean> {
  try {
    await db.exec(`set role ${papel}`);
    await db.query("select count(*) from public.admin_assinaturas_pagantes(array['x@y.z'])");
    return true;
  } catch {
    return false;
  } finally {
    await db.exec('reset role');
  }
}
checar('anon não chama admin_assinaturas_pagantes', !(await consegueChamar('anon')));
checar('authenticated não chama admin_assinaturas_pagantes', !(await consegueChamar('authenticated')));
checar('service_role chama admin_assinaturas_pagantes', await consegueChamar('service_role'));

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
