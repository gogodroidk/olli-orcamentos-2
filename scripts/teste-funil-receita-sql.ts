/**
 * Funil de receita — a migration `20260930120000_funil_receita.sql` rodando de
 * verdade num Postgres (PGlite, em memória), com dados SINTÉTICOS.
 *
 *     node scripts/teste-funil-receita-sql.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - lógica de coorte: semana de cadastro no fuso de São Paulo (domingo 23h de
 *    Brasília é a semana ANTERIOR, mesmo já sendo segunda em UTC), contagem por
 *    degrau, denominador/numerador da conversão e medianas de tempo;
 *  - "dado implica login": conta sem evento de login mas com orçamento entrou;
 *  - app offline-first: orçamento com criado_em anterior ao cadastro é trazido
 *    para o cadastro (nunca tempo negativo);
 *  - exclusão de contas internas por TODAS as regras (e-mail do dono vindo do
 *    chamador, lista por id, lista por e-mail, admin, cortesia, membro de equipe)
 *    — e que, sem o e-mail do dono, a conta dele entra (o parâmetro funciona);
 *  - triggers: primeiro marco vence, status repetido não grava, concessão manual
 *    não é "pagou", origem do pagamento, e erro do marco NUNCA derruba a escrita;
 *  - carga retroativa marcada como estimada;
 *  - permissões: anon/authenticated não leem nada; só service_role executa.
 *
 * O banco de produção não é tocado. O esquema abaixo é o MÍNIMO das tabelas reais
 * (mesmos nomes e colunas que a migration lê), conferido por SELECT em 30/09.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = readFileSync('supabase/migrations/20260930120000_funil_receita.sql', 'utf8');

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
create table auth.users (
  id uuid primary key, email text, created_at timestamptz not null, last_sign_in_at timestamptz
);
create table public.user_activity_log (user_id uuid references auth.users(id), evento text, criado_em timestamptz);
create table public.empresa (user_id uuid primary key references auth.users(id), dados jsonb, atualizado_em timestamptz default now());
create table public.clientes (id text primary key, user_id uuid, criado_em timestamptz);
create table public.orcamentos (id text primary key, user_id uuid, status text, criado_em timestamptz, atualizado_em timestamptz);
create table public.orcamentos_publicos (token text primary key, user_id uuid, status text, criado_em timestamptz, respondido_em timestamptz);
create table public.orcamento_envios_gratis (owner_user_id uuid, estado text, confirmado_em timestamptz);
create table public.trials_comerciais (tenant_id uuid primary key, owner_user_id uuid, iniciado_em timestamptz);
create table public.assinaturas (
  user_id uuid primary key references auth.users(id), plano text, status text,
  stripe_subscription_id text, stripe_customer_id text, mp_preapproval_id text, atualizado_em timestamptz default now(),
  admin_override_ativo boolean not null default false, admin_override_at timestamptz
);
create table public.webhook_events (origem text, event_id text, status text, payload jsonb, processado_em timestamptz);
create table public.admin_memberships (user_id uuid primary key);
create table public.organizacoes (id uuid primary key, owner_user_id uuid);
create table public.organizacao_membros (org_id uuid, user_id uuid, papel text);
`;

// ids legíveis: o último bloco diz quem é.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A1 = id(1), A2 = id(2), A3 = id(3), B1 = id(11), B2 = id(12);
const DONO = id(91), LISTA_ID = id(92), LISTA_EMAIL = id(93), ADMIN = id(94), CORTESIA = id(95), MEMBRO = id(96);
// Concessão LEGADA gravada direto em assinaturas com id de gateway fictício (como o
// revisor da Google Play e a demo em produção em 30/09).
const LEGADO = id(97);
const INTERNAS = [DONO, LISTA_ID, LISTA_EMAIL, ADMIN, CORTESIA, MEMBRO, LEGADO];

const db = new PGlite();
await db.exec(ESQUEMA);

// ── Dados ANTES da migration (viram carga retroativa) ──────────────────────
await db.exec(`
insert into auth.users (id, email, created_at, last_sign_in_at) values
  ('${A1}', 'a1@exemplo.test', '2026-09-08T12:00Z', '2026-09-20T12:00Z'),
  ('${A2}', 'a2@exemplo.test', '2026-09-09T12:00Z', '2026-09-09T12:30Z'),
  -- Domingo 23h em Brasília (segunda 02h UTC): coorte da semana de 07/09.
  ('${A3}', 'a3@exemplo.test', '2026-09-14T02:00Z', null),
  ('${B1}', 'b1@exemplo.test', '2026-09-15T12:00Z', null),
  ('${B2}', 'b2@exemplo.test', '2026-09-16T12:00Z', '2026-09-16T12:30Z'),
  ('${DONO}', 'Dono@Olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${LISTA_ID}', 'teste1@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${LISTA_EMAIL}', 'demo@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${ADMIN}', 'admin@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${CORTESIA}', 'cortesia@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${MEMBRO}', 'tecnico@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z'),
  ('${LEGADO}', 'revisor@olli.test', '2026-09-08T12:00Z', '2026-09-08T12:10Z');

insert into public.user_activity_log values ('${A1}', 'login', '2026-09-08T13:00Z');
insert into public.empresa (user_id, dados, atualizado_em) values
  ('${A1}', '{"nome":"Refrigeração A1"}', '2026-09-08T14:00Z');
insert into public.clientes values ('c-a1', '${A1}', '2026-09-08T14:30Z');
insert into public.orcamentos values ('o-a1', '${A1}', 'enviado', '2026-09-08T15:00Z', '2026-09-09T12:00Z');
-- Conta interna já "paga" antes da migration: a carga retroativa grava o marco.
insert into public.assinaturas (user_id, plano, status, stripe_subscription_id, atualizado_em)
  values ('${LISTA_ID}', 'empresa', 'active', 'sub_1Sintetica1', '2026-09-08T16:00Z');
-- Concessão legada: 'active' com ids inventados. Não é pagamento e a conta é interna.
insert into public.assinaturas (user_id, plano, status, stripe_subscription_id, stripe_customer_id, atualizado_em)
  values ('${LEGADO}', 'empresa', 'active', 'reviewer_google_play_sintetico', 'reviewer_sintetico', '2026-09-08T16:00Z');
`);

await db.exec(MIGRATION);
console.log('\nFunil de receita — migration aplicada no PGlite');

// ── Dados DEPOIS da migration (passam pelos triggers) ──────────────────────
await db.exec(`
insert into public.clientes values ('c-a2', '${A2}', '2026-09-09T18:00Z');
insert into public.orcamentos values ('o-a2', '${A2}', 'rascunho', '2026-09-10T12:00Z', '2026-09-10T12:00Z');

insert into public.orcamentos_publicos values ('tok-a1', '${A1}', 'aprovado', '2026-09-10T09:00Z', '2026-09-10T12:00Z');
insert into public.trials_comerciais values ('${A1}', '${A1}', '2026-09-11T12:00Z');
insert into public.webhook_events values
  ('abacate', 'bill_sintetica_1', 'processado', '{"user_id":"${A1}","plano":"pro_mensal"}', '2026-09-12T12:00Z'),
  -- Cobrança que falhou não é pagamento.
  ('abacate', 'bill_sintetica_2', 'falhou', '{"user_id":"${A2}"}', '2026-09-12T12:00Z');
-- O Pix libera o plano por upsert em assinaturas (sem subscription): origem 'avulso'.
insert into public.assinaturas (user_id, plano, status) values ('${A1}', 'pro', 'active');

-- B1: criou o orçamento OFFLINE antes de ter conta; sincronizou depois.
insert into public.orcamentos values ('o-b1', '${B1}', 'rascunho', '2026-09-15T10:00Z', '2026-09-15T12:00Z');
update public.orcamentos set status = 'enviado', atualizado_em = '2026-09-16T12:00Z' where id = 'o-b1';
insert into public.orcamentos_publicos values ('tok-b1', '${B1}', 'aprovado', '2026-09-16T10:00Z', '2026-09-17T12:00Z');

insert into public.empresa (user_id, dados, atualizado_em) values ('${B2}', '{"nome":"Elétrica B2"}', '2026-09-16T13:00Z');

-- Internas: todas com funil completo — sem a exclusão, inflariam cada degrau.
insert into public.orcamentos
  select 'o-int-' || n, u, 'aprovado', '2026-09-08T13:00Z', '2026-09-08T13:30Z'
  from unnest(array['${DONO}','${LISTA_ID}','${LISTA_EMAIL}','${ADMIN}','${CORTESIA}','${MEMBRO}','${LEGADO}']::uuid[]) with ordinality as t(u, n);
insert into public.funil_exclusoes (user_id, motivo) values ('${LISTA_ID}', 'conta de teste do dono');
insert into public.funil_exclusoes (email, motivo) values ('demo@olli.test', 'conta demo');
insert into public.admin_memberships values ('${ADMIN}');
insert into public.assinaturas (user_id, plano, status, admin_override_ativo, admin_override_at)
  values ('${CORTESIA}', 'empresa', 'canceled', true, '2026-09-08T12:30Z');
insert into public.assinaturas (user_id, plano, status, stripe_subscription_id)
  values ('${ADMIN}', 'pro', 'active', 'sub_1Sintetica2');
-- Qualquer escrita futura na linha legada (renovação, toque do painel) também não vira "pagou".
update public.assinaturas set atualizado_em = now() where user_id = '${LEGADO}';
insert into public.organizacoes values ('${id(500)}', '${A1}');
insert into public.organizacao_membros values ('${id(500)}', '${A1}', 'owner'), ('${id(500)}', '${MEMBRO}', 'tecnico');
`);

type Linha = {
  semana: string | null; degrau_ordem: number; degrau: string; contas: number;
  contas_no_anterior: number | null; contas_com_anterior: number | null;
  mediana_horas_desde_anterior: string | null; mediana_horas_desde_cadastro: string | null;
};

async function coortes(emails: string[]): Promise<Linha[]> {
  const r = await db.query<Linha>(
    'select semana::text, degrau_ordem, degrau, contas::int, contas_no_anterior::int, contas_com_anterior::int, ' +
    'mediana_horas_desde_anterior::text, mediana_horas_desde_cadastro::text from public.admin_funil_coortes($1, null)',
    [emails],
  );
  return r.rows;
}
const EMAILS_DONO = ['  DONO@olli.test '];
const linhas = await coortes(EMAILS_DONO);
const pega = (semana: string | null, degrau: string) => linhas.find((l) => l.semana === semana && l.degrau === degrau);
const serie = (semana: string | null, campo: keyof Linha) =>
  ['cadastro', 'entrou', 'perfil_empresa', 'primeiro_cliente', 'primeiro_orcamento', 'orcamento_enviado', 'orcamento_aprovado', 'teste_pro', 'pagou']
    .map((d) => pega(semana, d)?.[campo] ?? null);

console.log('\nCoortes semanais');
checar('duas coortes + linha total (9 degraus cada)', linhas.length === 27, `linhas=${linhas.length}`);
checar('semanas começam na segunda (fuso de São Paulo)', new Set(linhas.map((l) => l.semana)).size === 3 && !!pega('2026-09-07', 'cadastro') && !!pega('2026-09-14', 'cadastro'));
checar('ordem: total primeiro, depois semana mais recente', linhas[0].semana === null && linhas[9].semana === '2026-09-14');

const A = serie('2026-09-07', 'contas');
checar('coorte 07/09: domingo 23h de Brasília entra nela (3 cadastros)', A[0] === 3, JSON.stringify(A));
checar('coorte 07/09 por degrau = 3,2,1,2,2,1,1,1,1', JSON.stringify(A) === JSON.stringify([3, 2, 1, 2, 2, 1, 1, 1, 1]), JSON.stringify(A));
const B = serie('2026-09-14', 'contas');
checar('coorte 14/09 por degrau = 2,2,1,0,1,1,1,0,0', JSON.stringify(B) === JSON.stringify([2, 2, 1, 0, 1, 1, 1, 0, 0]), JSON.stringify(B));
const T = serie(null, 'contas');
checar('total = soma das coortes', JSON.stringify(T) === JSON.stringify(A.map((v, i) => Number(v) + Number(B[i]))), JSON.stringify(T));

console.log('\nConversão entre degraus (denominador = chegou ao anterior)');
checar('cadastro não tem anterior', pega(null, 'cadastro')?.contas_no_anterior === null && pega(null, 'cadastro')?.contas_com_anterior === null);
checar('entrou: 4 de 5', pega(null, 'entrou')?.contas_no_anterior === 5 && pega(null, 'entrou')?.contas_com_anterior === 4);
// A2 cadastrou cliente sem preencher o perfil: conta no degrau, mas não na conversão.
const cli = pega('2026-09-07', 'primeiro_cliente');
checar('degrau pulado conta no degrau mas não infla a conversão', cli?.contas === 2 && cli?.contas_no_anterior === 1 && cli?.contas_com_anterior === 1, JSON.stringify(cli));
const env = pega(null, 'orcamento_enviado');
checar('enviado: 2 dos 3 que criaram orçamento', env?.contas_no_anterior === 3 && env?.contas_com_anterior === 2, JSON.stringify(env));
checar('pagou: 1 de 1 no teste Pro', pega(null, 'pagou')?.contas_no_anterior === 1 && pega(null, 'pagou')?.contas_com_anterior === 1);

console.log('\nTempo mediano (horas)');
checar('coorte 07/09 cadastro→entrou = 0,75h → 0,8 (1h e 0,5h)', pega('2026-09-07', 'entrou')?.mediana_horas_desde_anterior === '0.8', String(pega('2026-09-07', 'entrou')?.mediana_horas_desde_anterior));
checar('total cadastro→entrou = 0,5h (1; 0,5; 0; 0,5)', pega(null, 'entrou')?.mediana_horas_desde_anterior === '0.5', String(pega(null, 'entrou')?.mediana_horas_desde_anterior));
checar('orçamento→enviado da A1 = 21h (retroativo congelado)', pega('2026-09-07', 'orcamento_enviado')?.mediana_horas_desde_anterior === '21.0', String(pega('2026-09-07', 'orcamento_enviado')?.mediana_horas_desde_anterior));
checar('cadastro→pagou da A1 = 96h (Pix processado em 12/09)', pega('2026-09-07', 'pagou')?.mediana_horas_desde_cadastro === '96.0', String(pega('2026-09-07', 'pagou')?.mediana_horas_desde_cadastro));
checar('offline-first: orçamento antes do cadastro vira 0h, nunca negativo', pega('2026-09-14', 'primeiro_orcamento')?.mediana_horas_desde_cadastro === '0.0', String(pega('2026-09-14', 'primeiro_orcamento')?.mediana_horas_desde_cadastro));
checar('enviado da B1 = link público (16/09 10h), antes do atualizado_em', pega('2026-09-14', 'orcamento_enviado')?.mediana_horas_desde_cadastro === '22.0', String(pega('2026-09-14', 'orcamento_enviado')?.mediana_horas_desde_cadastro));
checar('degrau sem ninguém tem mediana nula (não zero)', pega('2026-09-14', 'pagou')?.mediana_horas_desde_cadastro === null);

console.log('\nContas por conta (dado implica login)');
const b1 = (await db.query<{ entrou: string; orc: string }>(
  `select entrou_em::text entrou, primeiro_orcamento_em::text orc from public.funil_contas_marcos('{}') where user_id = $1`, [B1],
)).rows[0];
checar('B1 sem evento de login entrou (tem orçamento)', !!b1?.entrou && b1.entrou === b1.orc, JSON.stringify(b1));
const a3 = (await db.query<{ entrou: string | null }>(
  `select entrou_em::text entrou from public.funil_contas_marcos('{}') where user_id = $1`, [A3],
)).rows[0];
checar('A3 nunca entrou', a3 && a3.entrou === null);

console.log('\nExclusão de contas internas');
const exc = (await db.query<{ regra: string; contas: number }>(
  'select regra, contas::int from public.admin_funil_exclusoes($1)', [EMAILS_DONO],
)).rows;
const porRegra = Object.fromEntries(exc.map((e) => [e.regra, e.contas]));
checar('uma regra por conta: dono 1, lista 2, admin 1, cortesia 2 (override + legado), membro 1',
  JSON.stringify(porRegra) === JSON.stringify({ admin: 1, cortesia: 2, dono: 1, lista_interna: 2, membro_equipe: 1 }), JSON.stringify(porRegra));
const marcos = (await db.query<{ user_id: string; excluida_por: string | null }>(
  'select user_id::text, excluida_por from public.funil_contas_marcos($1)', [EMAILS_DONO],
)).rows;
checar('todas as 7 internas marcadas e nenhuma real', marcos.filter((m) => m.excluida_por).map((m) => m.user_id).sort().join() === [...INTERNAS].sort().join());
checar('internas não aparecem no funil (aprovado da coorte 07/09 = só A1)', pega('2026-09-07', 'orcamento_aprovado')?.contas === 1);
const semDono = await coortes([]);
const cadSemDono = semDono.find((l) => l.semana === '2026-09-07' && l.degrau === 'cadastro');
checar('sem o e-mail do dono no parâmetro, a conta dele entra no funil', cadSemDono?.contas === 4, JSON.stringify(cadSemDono));
checar('e-mail vazio no parâmetro não exclui ninguém', (await coortes(['', '  '])).find((l) => l.semana === '2026-09-07' && l.degrau === 'cadastro')?.contas === 4);

console.log('\nTriggers e carga retroativa');
type Marco = { user_id: string; marco: string; origem: string; criado_em: string; estimado: boolean };
const todos = (await db.query<Marco>('select user_id::text, marco, origem, criado_em::text, estimado from public.funil_marcos')).rows;
const marco = (u: string, m: string) => todos.find((x) => x.user_id === u && x.marco === m);
checar('retroativo: enviado da A1 = atualizado_em, estimado', marco(A1, 'orcamento_enviado')?.origem === 'retroativo' && marco(A1, 'orcamento_enviado')?.estimado === true);
checar('retroativo: perfil da A1 estimado', marco(A1, 'perfil_empresa')?.estimado === true);
checar('retroativo: pagamento anterior à migration virou marco', marco(LISTA_ID, 'pagou')?.origem === 'retroativo');
checar('trigger: rascunho→enviado grava marco real (não estimado)', marco(B1, 'orcamento_enviado')?.origem === 'orcamento' && marco(B1, 'orcamento_enviado')?.estimado === false);
checar('trigger: rascunho não é envio', !marco(A2, 'orcamento_enviado'));
checar('trigger: perfil novo grava marco', marco(B2, 'perfil_empresa')?.origem === 'empresa');
checar('trigger: Pix (sem subscription) = origem avulso', marco(A1, 'pagou')?.origem === 'avulso');
checar('trigger: Stripe = origem stripe', marco(ADMIN, 'pagou')?.origem === 'stripe');
checar('concessão manual (override) NÃO é pagou', !marco(CORTESIA, 'pagou'));
checar('concessão legada (id fictício) NÃO vira pagou na carga retroativa nem no trigger', !marco(LEGADO, 'pagou'));
const ficticia = async (sub: string | null, cus: string | null) =>
  (await db.query<{ f: boolean }>('select public.funil_assinatura_ficticia($1, $2) f', [sub, cus])).rows[0].f;
checar('id real da Stripe não é fictício', !(await ficticia('sub_1NxAbC23dEf', 'cus_PqR45sTu')) && !(await ficticia(null, null)) && !(await ficticia(null, 'cus_PqR45sTu')));
checar('ids inventados são fictícios', (await ficticia('sub_demo_grtech', 'cus_demo_grtech')) && (await ficticia('comp_manual_empresa', null)) && (await ficticia(null, 'reviewer_x')));

const antes = marco(B1, 'orcamento_enviado')?.criado_em;
await db.exec(`update public.orcamentos set status = 'aprovado' where id = 'o-b1';
  update public.orcamentos set status = 'aprovado', atualizado_em = now() where id = 'o-b1';`);
const depois = (await db.query<Marco>(`select criado_em::text from public.funil_marcos where user_id = $1 and marco = 'orcamento_enviado'`, [B1])).rows[0];
checar('primeiro marco vence: aprovar depois não move o "enviado"', depois?.criado_em === antes);
checar('aprovar grava o marco de aprovado', (await db.query(`select 1 from public.funil_marcos where user_id = $1 and marco = 'orcamento_aprovado' and origem = 'orcamento'`, [B1])).rows.length === 1);

// Erro no marco (FK: dono inexistente) não pode derrubar o sync do orçamento.
let escreveu = true;
try {
  await db.exec(`insert into public.orcamentos values ('o-orfao', '${id(999)}', 'enviado', now(), now());`);
} catch { escreveu = false; }
checar('erro do marco é engolido: o orçamento grava mesmo assim', escreveu);
checar('e nenhum marco órfão fica', (await db.query(`select 1 from public.funil_marcos where user_id = $1`, [id(999)])).rows.length === 0);

console.log('\nPermissões');
async function negado(papel: string, sql: string): Promise<boolean> {
  await db.exec(`set role ${papel}`);
  try { await db.query(sql); return false; } catch { return true; } finally { await db.exec('reset role'); }
}
for (const papel of ['anon', 'authenticated']) {
  checar(`${papel} não lê funil_marcos`, await negado(papel, 'select * from public.funil_marcos'));
  checar(`${papel} não lê funil_exclusoes`, await negado(papel, 'select * from public.funil_exclusoes'));
  checar(`${papel} não executa admin_funil_coortes`, await negado(papel, `select * from public.admin_funil_coortes('{}', 12)`));
  checar(`${papel} não executa funil_contas_marcos`, await negado(papel, `select * from public.funil_contas_marcos('{}')`));
  checar(`${papel} não executa admin_funil_exclusoes`, await negado(papel, `select * from public.admin_funil_exclusoes('{}')`));
  checar(`${papel} não grava marco à mão`, await negado(papel, `select public.funil_registrar_marco('${A2}', 'pagou', 'stripe')`));
}
checar('service_role executa admin_funil_coortes', !(await negado('service_role', `select * from public.admin_funil_coortes('{}', 12)`)));
checar('service_role grava em funil_exclusoes', !(await negado('service_role', `insert into public.funil_exclusoes (email, motivo) values ('outra@olli.test', 'teste de permissão')`)));
checar('service_role não grava marco à mão', await negado('service_role', `insert into public.funil_marcos (user_id, marco, origem) values ('${A2}', 'pagou', 'stripe')`));

console.log('\nJanela de semanas');
const janela = (await db.query<{ n: number }>(`select count(*)::int n from public.admin_funil_coortes('{}', 1) where semana is not null`)).rows[0];
checar('p_semanas=1 não traz coortes de setembro quando o relógio já passou', janela.n === 0 || new Date() < new Date('2026-09-21'), String(janela.n));

await db.close();
if (falhas) {
  console.error(`\nFALHOU: ${ok} ok, ${falhas} falha(s)`);
  process.exit(1);
}
console.log(`\nPASSOU: ${ok} ok, 0 falhas`);
