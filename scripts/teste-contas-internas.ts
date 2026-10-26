/**
 * Contas INTERNAS × CLIENTES (migration 20261007140000_contas_internas.sql) — Postgres real (PGlite), como service_role.
 *
 *     node scripts/teste-contas-internas.ts
 *
 * Prova:
 *  · `conta_interna` (funil_exclusoes por id e por e-mail, administrador ATIVO; inativo/null/inexistente = não);
 *  · `conta_interna_por_telefone` (formatos diferentes do mesmo número; cliente e inválido = não);
 *  · ORGANIZAÇÃO: prévia "N serão marcadas"; confirmação que TEM de bater; motivo obrigatório; SALVAGUARDA (quem também
 *    é dono/membro de OUTRA organização cliente NÃO é marcado); já-interno não é remarcado; desfazer em 1 passo remove
 *    SÓ o que a org marcou;
 *  · interna NÃO entra em nenhuma contagem: medição do 1º orçamento (T1) e fila de e-mail (enqueue) a recusam;
 *    a lista de candidatos da régua carrega a cláusula, no lugar certo, uma vez só, e o remendo é idempotente;
 *  · WhatsApp: `pode_contatar_whatsapp` (a pergunta do SALES antes de cada mensagem e do guarda do #181) recusa interna
 *    pela conta e pelo telefone;
 *  · permissões: anon/authenticated não executam nada; service_role executa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let checks = 0;
const igual = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};
const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const optout = ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql'); // private.telefone_whatsapp_br
const t1 = ler('../supabase/migrations/20261007130000_medicao_primeiro_orcamento.sql');
const mig = ler('../supabase/migrations/20261007140000_contas_internas.sql');
const regua = ler('../supabase/migrations/20261005090000_regua_reengajamento.sql');

function funcaoDe(sql: string, nome: string): string {
  const m = new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$function\\$;`).exec(sql);
  assert.ok(m, `não achei ${nome} na migration da régua`);
  return m[0];
}

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, created_at timestamptz not null default now(),
    email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.organizacoes (id uuid primary key default gen_random_uuid(), owner_user_id uuid, nome text, criado_em timestamptz default now());
  create table public.organizacao_membros (org_id uuid not null, user_id uuid not null, papel text not null default 'tecnico', ativo boolean not null default true, primary key (org_id, user_id));
  create table public.funil_exclusoes (id bigserial primary key, user_id uuid, email text, motivo text, criado_por uuid, criado_em timestamptz default now(), check (user_id is not null or email is not null));
  create unique index funil_exclusoes_user_uidx on public.funil_exclusoes (user_id) where user_id is not null;
  create table public.admin_memberships (user_id uuid primary key, papel text, ativo boolean not null default true);
  create table public.orcamentos (id serial primary key, user_id uuid, criado_por uuid, criado_em timestamptz default now(), status text default 'rascunho', dados jsonb, excluido_em timestamptz);
  create table public.email_outbox (id bigserial primary key, event_id text, user_id uuid, tenant_id uuid, idempotency_key text, template text, template_version text, purpose text, recipient text, next_attempt_at timestamptz, template_dados jsonb, created_at timestamptz default now());
  create unique index email_outbox_idem_uidx on public.email_outbox (idempotency_key);
  create table public.email_supressoes (user_id uuid);
  create function private.email_recebeu_ultimas_24h(p_user uuid, p_now timestamptz) returns boolean language sql as $$ select false $$;
`);
await db.exec(optout);
// No Supabase o service_role executa as funções antigas por default privileges; no PGlite é preciso conceder.
await db.exec('grant execute on function public.pode_contatar_whatsapp(uuid, text) to service_role');
await db.exec(t1);
// A régua REAL (as duas funções, extraídas da migration que as define por último).
await db.exec(funcaoDe(regua, 'enqueue_lembrete_email'));
await db.exec(funcaoDe(regua, 'listar_candidatos_lembrete_email'));
// As contas do DONO já existem quando a migration roda (como em produção): a SEMENTE tem de marcá-las, sem ninguém clicar.
const doDono = await Promise.all(['gogodroidk@gmail.com', 'IgorELuisa@Gmail.com', 'demo@grtech.com.br'].map(async (e) =>
  (await db.query(`insert into auth.users (email, email_confirmed_at) values ($1, now() - interval '5 days') returning id`, [e])).rows[0].id as string));
await db.exec(mig);
await db.exec(mig); // idempotente (inclusive os remendos e a semente)
// D-0914: conta de TESTE (etiqueta no e-mail ou caixa descartável) nasce interna; e-mail comum segue cliente.
await db.exec(ler('../supabase/migrations/20261026120000_conta_interna_teste.sql'));
await db.exec(ler('../supabase/migrations/20261026120000_conta_interna_teste.sql')); // idempotente
const idTeste = async (e: string) =>
  (await db.query(`insert into auth.users (email) values ($1) returning id`, [e])).rows[0].id as string;
{
  const eh = async (u: string) => ((await db.query('select public.conta_interna($1) r', [u])).rows[0] as { r: boolean }).r;
  igual(
    [
      await eh(await idTeste('gogodroidk+z99chromium@gmail.com')),
      await eh(await idTeste('Alguem+QA2@Gmail.com')),
      await eh(await idTeste('x@mailinator.com')),
      await eh(await idTeste('y@example.com')),
    ],
    [true, true, true, true],
    'e-mail com etiqueta de teste ou caixa descartável = conta interna',
  );
  igual(
    [
      await eh(await idTeste('maria.silva@gmail.com')),
      await eh(await idTeste('joao+obra@gmail.com')),
      await eh(await idTeste('teste.silva@gmail.com')),
      await eh(await idTeste('contato@exemplo.com.br')),
    ],
    [false, false, false, false],
    'cliente comum (inclusive com +alias que não é de teste) continua cliente',
  );
}
checks++;

const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as any[];
const um = async (sql: string, p: unknown[] = []) => (await q(sql, p))[0];
const novo = async (email: string, phone: string | null = null): Promise<string> =>
  (await q(`insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, now() - interval '3 days', $2::jsonb) returning id`, [email, JSON.stringify(phone ? { phone } : {})]))[0].id;
const org = async (nome: string, dono: string, membros: string[] = []): Promise<string> => {
  const id = (await q(`insert into public.organizacoes (owner_user_id, nome) values ($1, $2) returning id`, [dono, nome]))[0].id;
  await q(`insert into public.organizacao_membros (org_id, user_id, papel) values ($1, $2, 'owner')`, [id, dono]);
  for (const m of membros) await q(`insert into public.organizacao_membros (org_id, user_id) values ($1, $2)`, [id, m]);
  return id;
};
const ehInterna = async (u: string) => (await um('select public.conta_interna($1) r', [u])).r as boolean;

// ─── contas e organizações do cenário ────────────────────────────────────────
const igor = await novo('igor@interno.test', '(11) 98765-4321');
const luisa = await novo('luisa@interno.test', '+55 11 91111-2222');
const demo = await novo('demo@interno.test');
const suporte = await novo('suporte@interno.test');     // membro da GR Tech E convidado numa org CLIENTE
const donoCliente = await novo('dono@cliente.test', '(21) 99999-0000');
const clienteX = await novo('x@cliente.test');
const adminAtivo = await novo('admin@interno.test');
const adminInativo = await novo('exadmin@interno.test');
await q(`insert into public.admin_memberships (user_id, papel, ativo) values ($1, 'owner', true), ($2, 'suporte', false)`, [adminAtivo, adminInativo]);
const grtech = await org('GR Tech', igor, [luisa, demo, suporte]);
const orgCliente = await org('Frio Bom (cliente)', donoCliente, [suporte, clienteX]);

// ─── 1) a pergunta única ──────────────────────────────────────────────────────
await db.exec('set role service_role');
igual(await ehInterna(igor), false, 'ninguém é interno antes de marcar');
await db.exec('reset role');
await q(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'teste')`, [luisa]);
await q(`insert into public.funil_exclusoes (email, motivo) values ('Dono@Cliente.Test', 'só por e-mail')`);
await db.exec('set role service_role');
igual([await ehInterna(luisa), await ehInterna(donoCliente), await ehInterna(adminAtivo), await ehInterna(adminInativo), await ehInterna(clienteX)],
  [true, true, true, false, false], 'interna = lista por id, lista por e-mail (sem diferenciar caixa), administrador ATIVO; admin inativo e cliente não');
igual([(await um('select public.conta_interna(null) r')).r, (await um('select public.conta_interna(gen_random_uuid()) r')).r], [false, false], 'null e conta inexistente = não é interna');
await db.exec('reset role');
await q(`delete from public.funil_exclusoes where lower(email) = 'dono@cliente.test'`); // só a linha criada para o teste acima (a semente fica)

// ─── 1b) SEMENTE: o dono é interno NO BANCO, sem env e sem clique ───────────────
await db.exec('set role service_role');
igual(await Promise.all(doDono.map((u) => ehInterna(u))), [true, true, true], 'semente: gogodroidk, igoreluisa (em qualquer caixa) e demo@grtech são internas assim que a migration roda');
await db.exec('reset role');
const sementes = await q(`select count(*) filter (where user_id is not null)::int por_id, count(*) filter (where email is not null)::int por_email from public.funil_exclusoes where motivo = 'dono/interna (semente)'`);
igual([sementes[0].por_id, sementes[0].por_email], [3, 3], 'a semente grava 3 por id e 3 por e-mail, e rodar a migration 2 vezes NÃO duplica');
const recriada = (await q(`insert into auth.users (email, email_confirmed_at) values ('GOGODROIDK@gmail.com', now()) returning id`))[0].id as string;
await db.exec('set role service_role');
igual(await ehInterna(recriada), true, 'uma conta RECRIADA com o e-mail do dono (id novo) também é interna (a linha por e-mail)');
await db.exec('reset role');
await q(`delete from auth.users where id = $1`, [recriada]);

// ─── 2) telefone ──────────────────────────────────────────────────────────────
await q(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'teste')`, [igor]);
await db.exec('set role service_role');
const tel = async (t: string) => (await um('select public.conta_interna_por_telefone($1) r', [t])).r;
igual([await tel('(11) 98765-4321'), await tel('+55 11 98765-4321'), await tel('011 98765-4321'), await tel('5511987654321')], [true, true, true, true], 'o mesmo telefone da conta interna em 4 formatos');
igual([await tel('(21) 99999-0000'), await tel('abc'), await tel('')], [false, false, false], 'telefone de cliente, inválido e vazio não são de conta interna');
await db.exec('reset role');
await q(`delete from public.funil_exclusoes where user_id = $1`, [igor]);
await q(`delete from public.funil_exclusoes where user_id = $1`, [luisa]);

// ─── 3) organização: prévia, confirmação, salvaguarda, desfazer ──────────────
await q(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'já era interna por conta própria')`, [demo]);
await db.exec('set role service_role');
const previa = (await um('select public.admin_previa_org_interna($1) r', [grtech])).r;
igual([previa.ok, previa.total_membros, previa.serao_marcadas, previa.preservadas, previa.ja_internas, previa.ja_marcada], [true, 4, 2, 1, 1, false],
  'prévia GR Tech: 4 membros → 2 serão marcadas (igor, luisa), 1 preservada (suporte, também de org cliente), 1 já interna (demo)');
igual([...previa.marcar_ids].sort(), [igor, luisa].sort(), 'a prévia lista QUEM será marcado');
igual(previa.preservadas_ids, [suporte], 'e quem foi preservado');
igual((await um('select public.admin_previa_org_interna(gen_random_uuid()) r')).r.erro, 'org_inexistente', 'org inexistente');

const marcar = async (n: number | null, motivo = 'equipe do Igor e da GR Tech') =>
  (await um('select public.admin_marcar_org_interna($1,$2,$3,$4) r', [grtech, n, motivo, igor])).r;
igual((await marcar(null)).erro, 'confirmacao_obrigatoria', 'sem confirmação não marca');
igual((await marcar(5)).erro, 'previa_mudou', 'confirmação diferente da prévia (5 ≠ 2) não marca e devolve o número real');
igual((await marcar(5)).serao_marcadas, 2, '… e diz quantas seriam');
igual((await marcar(2, 'x')).erro, 'motivo_invalido', 'motivo curto não vale');
igual(await ehInterna(igor), false, 'nada foi marcado pelas tentativas recusadas');
const ok = await marcar(2);
igual([ok.ok, ok.marcadas, ok.preservadas], [true, 2, 1], 'confirmação certa marca 2 e preserva 1');
igual([await ehInterna(igor), await ehInterna(luisa), await ehInterna(demo)], [true, true, true], 'igor, luisa e demo agora são internos');
igual([await ehInterna(suporte), await ehInterna(donoCliente), await ehInterna(clienteX)], [false, false, false], 'SALVAGUARDA: suporte (membro de org cliente) e os clientes seguem como clientes');
igual((await marcar(2)).ja_marcada, true, 'marcar de novo é idempotente (não duplica)');
await db.exec('reset role');
igual((await q(`select count(*)::int n from public.funil_exclusoes where org_id = $1`, [grtech]))[0].n, 2, 'as 2 marcações guardam a origem (org_id); a do demo continua individual');
igual((await q(`select marcado_por = $2 ok from public.organizacoes_internas where org_id = $1`, [grtech, igor]))[0].ok, true, 'quem marcou fica registrado');

await db.exec('set role service_role');
const previa2 = (await um('select public.admin_previa_org_interna($1) r', [grtech])).r;
igual(previa2.ja_marcada, true, 'a prévia depois de marcada diz "já marcada"');
const desfaz = (await um('select public.admin_desmarcar_org_interna($1) r', [grtech])).r;
igual([desfaz.estava_marcada, desfaz.desmarcadas], [true, 2], 'desfazer em 1 passo remove as 2 que a org marcou');
igual([await ehInterna(igor), await ehInterna(luisa)], [false, false], 'igor e luisa voltam a ser clientes nos números');
igual(await ehInterna(demo), true, 'o demo, marcado por conta própria ANTES, continua interno (o desfazer não toca no que não é da org)');
igual((await um('select public.admin_desmarcar_org_interna($1) r', [grtech])).r.estava_marcada, false, 'desfazer duas vezes é inofensivo');

// uma organização que JÁ é interna não protege ninguém: quem está só nela e numa org cliente é preservado ao marcar a
// primeira; ao marcar a segunda, a primeira (interna) não conta como "outra org cliente" e o membro é marcado.
await db.exec('reset role');
const m1 = await novo('m1@interno.test');
const o1 = await novo('o1@interno.test');
const s = await novo('s@interno.test');
const oInt = await org('Interna A', m1, [s]);
const oOutra = await org('Interna B', o1, [s]);
await db.exec('set role service_role');
const pA = (await um('select public.admin_previa_org_interna($1) r', [oInt])).r;
igual([pA.serao_marcadas, pA.preservadas], [1, 1], 'Interna A: marca m1; preserva s (também está na org B, ainda cliente)');
igual((await um('select public.admin_marcar_org_interna($1, 1, $2, $3) r', [oInt, 'org A', igor])).r.marcadas, 1, 'marcou só o m1');
const pB = (await um('select public.admin_previa_org_interna($1) r', [oOutra])).r;
igual([pB.serao_marcadas, pB.preservadas], [2, 0], 'Interna B: a org A agora é interna e NÃO protege o s — marca o1 e s');
await db.exec('reset role');

// duas organizações que COMPARTILHAM membro, marcadas em sequência (sem 23505), e o desfazer de uma NÃO derruba a marca
// que a outra ainda sustenta. Ordem: B primeiro (o membro comum fica preservado porque A ainda é cliente) e depois A (com B
// interna, o comum deixa de ser protegido e a marca dele passa a ser de A). Desfazer A tem de transferir a marca para B.
await db.exec('reset role');
const pa = await novo('pa@interno.test');
const pb = await novo('pb@interno.test');
const comum = await novo('comum@interno.test');
const orgPA = await org('Par A', pa, [comum]);
const orgPB = await org('Par B', pb, [comum]);
await db.exec('set role service_role');
const mPB = (await um('select public.admin_marcar_org_interna($1, 1, $2, $3) r', [orgPB, 'par B', igor])).r;
igual([mPB.ok, mPB.marcadas, mPB.preservadas], [true, 1, 1], 'Par B primeiro: marca o dono; o membro comum fica preservado (também está na org A, ainda cliente)');
igual(await ehInterna(comum), false, 'o comum ainda é cliente');
const prevPA = (await um('select public.admin_previa_org_interna($1) r', [orgPA])).r;
igual([prevPA.serao_marcadas, prevPA.preservadas], [2, 0], 'Par A: com B já interna, o comum deixa de ser protegido');
const mPA = (await um('select public.admin_marcar_org_interna($1, 2, $2, $3) r', [orgPA, 'par A', igor])).r;
igual([mPA.ok, mPA.marcadas], [true, 2], 'Par A: marca pa e o comum sem estourar 23505');
igual(await ehInterna(comum), true, 'o membro comum é interno');
const dPA = (await um('select public.admin_desmarcar_org_interna($1) r', [orgPA])).r;
igual(dPA.desmarcadas, 1, 'desfazer A remove só pa — a marca do comum PASSA para a org B (que ainda o sustenta)');
igual([await ehInterna(comum), await ehInterna(pa), await ehInterna(pb)], [true, false, true], 'comum segue interno (B o sustenta); pa volta a cliente; pb segue interno');
const dPB = (await um('select public.admin_desmarcar_org_interna($1) r', [orgPB])).r;
igual(dPB.desmarcadas, 2, 'desfazer B remove pb e o comum (a marca agora era dele)');
igual([await ehInterna(comum), await ehInterna(pb), await ehInterna(pa)], [false, false, false], 'tudo volta a cliente');
await db.exec('reset role');

// corrida SIMULADA: outro processo marca o mesmo membro (marca própria) no meio do INSERT da organização. Sem ON CONFLICT
// isto era um 23505 que derrubava a marcação inteira.
const cx = await novo('cx@interno.test');
const orgC = await org('Corrida', cx);
await db.exec(`
  create function public.simula_corrida() returns trigger language plpgsql as $$ begin
    if new.org_id is not null and not exists (select 1 from public.funil_exclusoes f where f.user_id = new.user_id and f.org_id is null) then
      insert into public.funil_exclusoes (user_id, motivo) values (new.user_id, 'marca própria que chegou antes');
    end if;
    return new; end $$;
  create trigger simula_corrida before insert on public.funil_exclusoes for each row execute function public.simula_corrida();
`);
await db.exec('set role service_role');
const corrida = (await um('select public.admin_marcar_org_interna($1, 1, $2, $3) r', [orgC, 'corrida', igor])).r;
igual([corrida.ok, corrida.marcadas], [true, 0], 'corrida: o INSERT conflitou, a marcação NÃO estourou 23505 e só conta o que foi inserido (0)');
igual(await ehInterna(cx), true, 'a conta segue interna (pela marca própria que chegou antes)');
const dCorrida = (await um('select public.admin_desmarcar_org_interna($1) r', [orgC])).r;
igual([dCorrida.ok, dCorrida.desmarcadas], [true, 0], 'desfazer a org não derruba a marca própria');
igual(await ehInterna(cx), true, '… e a conta continua interna');
await db.exec('reset role');
await db.exec('drop trigger simula_corrida on public.funil_exclusoes; drop function public.simula_corrida()');

// ─── 4) interna NÃO entra em nenhuma contagem ─────────────────────────────────
// 4a) medição do 1º orçamento (T1): conta interna não aparece na lista por conta
await q(`insert into public.funil_exclusoes (user_id, motivo) values ($1, 'interna para o teste de contagem')`, [igor]);
await q(`insert into public.orcamentos (user_id, criado_em, dados) values ($1, now() - interval '70 hours', '{"itens":[{"nome":"x","preco":9}]}'), ($2, now() - interval '70 hours', '{"itens":[{"nome":"x","preco":9}]}')`, [igor, clienteX]);
await db.exec('set role service_role');
const contasT1 = (await q('select user_id from public.primeiro_orcamento_por_conta()')).map((r) => r.user_id);
igual([contasT1.includes(igor), contasT1.includes(clienteX), contasT1.includes(adminAtivo)], [false, true, false], 'T1: interna (lista) e administrador ativo ficam FORA da lista por conta; cliente entra');
await db.exec('reset role');

// 4b) régua: o ponto onde o e-mail é enfileirado recusa conta interna
const chave = (u: string) => `onboarding:${u}:${u}:activation_day_3:v1`;
const enq = async (u: string) => (await um(`select public.enqueue_lembrete_email($1, 'lembrete_ativacao', 'lembrete_ativacao.v1', 'activation_reminder', $2, '{}'::jsonb, 40, now()) r`, [u, chave(u)])).r;
await db.exec('set role service_role');
const eInterna = await enq(igor);
igual([eInterna.enfileirado, eInterna.motivo], [false, 'conta_interna'], 'régua: e-mail para conta interna NÃO é enfileirado (motivo conta_interna)');
const eAdmin = await enq(adminAtivo);
igual(eAdmin.motivo, 'conta_interna', 'régua: administrador ativo também');
await db.exec('reset role');
const clienteSemOrc = await novo('sem-orcamento@cliente.test');
await db.exec('set role service_role');
const eCliente = await enq(clienteSemOrc);
igual([eCliente.enfileirado, eCliente.motivo], [true, 'enfileirado'], 'régua: cliente real continua sendo enfileirado');
await db.exec('reset role');
igual((await q(`select count(*)::int n from public.email_outbox where user_id = any($1::uuid[])`, [[igor, adminAtivo]]))[0].n, 0, 'nenhuma linha na outbox para interna');

// 4b2) WhatsApp: o SALES (e o guarda do #181) perguntam `pode_contatar_whatsapp` antes de CADA mensagem
await db.exec('set role service_role');
const pode = async (u: string | null, tel: string | null) => (await um('select public.pode_contatar_whatsapp($1, $2) r', [u, tel])).r;
const wInterna = await pode(igor, null);
igual([wInterna.pode, wInterna.motivo], [false, 'conta_interna'], 'WhatsApp: conta interna (por id) NUNCA é abordada');
igual((await pode(null, '+55 11 98765-4321')).motivo, 'conta_interna', 'WhatsApp: telefone de conta interna (outro formato) também não');
igual((await pode(adminAtivo, null)).motivo, 'conta_interna', 'WhatsApp: administrador ativo também');
const wCliente = await pode(clienteSemOrc, null);
igual([wCliente.pode, wCliente.motivo], [true, 'liberado'], 'WhatsApp: cliente real segue liberado');
igual((await pode(null, '(21) 99999-0000')).pode, true, 'WhatsApp: telefone de cliente segue liberado');
igual((await pode(null, null)).motivo, 'sem_identificador', 'WhatsApp: sem identificador continua recusado');
await db.exec('reset role');

// 4c) a lista de candidatos carrega a cláusula (uma vez só, no CTE de usuários) e o remendo é idempotente
const defLista = (await um(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'listar_candidatos_lembrete_email'`)).d as string;
igual((defLista.match(/public\.conta_interna\(u\.id\)/g) ?? []).length, 1, 'lista de candidatos: a cláusula aparece UMA vez (o remendo não duplicou)');
assert.ok(defLista.indexOf('conta_interna') < defLista.indexOf('base as ('), 'a cláusula está no CTE de usuários, antes de qualquer contagem');
checks++;
const defEnq = (await um(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'enqueue_lembrete_email'`)).d as string;
igual((defEnq.match(/public\.conta_interna\(/g) ?? []).length, 1, 'enqueue: a cláusula aparece UMA vez');
const defT1 = (await um(`select pg_get_functiondef(p.oid) d from pg_proc p where p.proname = 'primeiro_orcamento_por_conta'`)).d as string;
igual([(defT1.match(/public\.conta_interna\(u\.id\)/g) ?? []).length, /funil_exclusoes/.test(defT1)], [1, false], 'T1: usa a pergunta única (e não repete a lista por conta própria)');

// 4d) se a cláusula-âncora mudar um dia, a migration FALHA em voz alta (não deixa a régua sem a trava)
const db2 = new PGlite();
await db2.exec(`
  create schema if not exists private; create schema if not exists auth;
  create role anon; create role authenticated; create role service_role;
  create table auth.users (id uuid primary key, email text, created_at timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.organizacoes (id uuid primary key, owner_user_id uuid, nome text);
  create table public.organizacao_membros (org_id uuid, user_id uuid, papel text, ativo boolean default true);
  create table public.funil_exclusoes (id bigserial primary key, user_id uuid, email text, motivo text, criado_por uuid, criado_em timestamptz default now());
  create table public.admin_memberships (user_id uuid primary key, papel text, ativo boolean default true);
  create function public.listar_candidatos_lembrete_email() returns void language plpgsql as $f$ begin null; end $f$;
  create function public.enqueue_lembrete_email() returns void language plpgsql as $f$ begin null; end $f$;
`);
await db2.exec(optout);
await assert.rejects(() => db2.exec(mig), /listar_candidatos_ancora_nao_encontrada/, 'sem a linha-âncora a migration falha, não finge que travou');
checks++;
await db2.close();

// ─── 5) permissões ────────────────────────────────────────────────────────────
const chamadas: Array<[string, string]> = [
  ['conta_interna', `select public.conta_interna('${igor}')`],
  ['conta_interna_por_telefone', `select public.conta_interna_por_telefone('11987654321')`],
  ['admin_previa_org_interna', `select public.admin_previa_org_interna('${grtech}')`],
  ['admin_marcar_org_interna', `select public.admin_marcar_org_interna('${grtech}', 1, 'motivo ok', '${igor}')`],
  ['admin_desmarcar_org_interna', `select public.admin_desmarcar_org_interna('${grtech}')`],
];
for (const papel of ['anon', 'authenticated']) {
  await db.exec(`set role ${papel}`);
  for (const [nome, sql] of chamadas) await assert.rejects(() => db.query(sql), /permission denied/i, `${papel} não executa ${nome}`);
  await assert.rejects(() => db.query('select * from public.organizacoes_internas'), /permission denied/i, `${papel} não lê organizacoes_internas`);
  await db.exec('reset role');
  checks += chamadas.length + 1;
}
await db.exec('set role service_role');
for (const [, sql] of chamadas.slice(0, 3)) await db.query(sql);
checks++;
await db.exec('reset role');

await db.close();
console.log(`PASSOU: ${checks} verificações — contas internas fora de toda contagem; organização com prévia, salvaguarda e desfazer.`);
