/**
 * Supressão CRUZADA e-mail <-> WhatsApp (migration 20261118130000) — Postgres real (PGlite).
 *
 *     node scripts/teste-supressao-cruzada-sql.ts
 *
 * Prova, sobre as tabelas e funções REAIS de opt-out (WhatsApp 20261006090000, e-mail 20260929200000):
 *  · SAIR no WhatsApp SÓ POR TELEFONE (os 3 caminhos reais gravam `registrar_nao_contatar_whatsapp(null, tel, …)`)
 *    suprime o e-mail das contas cujo telefone do cadastro bate, e cancela o que está na fila;
 *  · o telefone da conta vale em QUALQUER fonte do cadastro (Auth, metadata, empresa.telefone/whatsapp), pelos últimos
 *    10 dígitos; SAIR só de telefone também grava a linha da CONTA (user_id) no WhatsApp;
 *  · SAIR com a conta (app/painel) também suprime; o telefone que não bate com conta nenhuma não faz nada;
 *  · descadastro/reclamação por e-mail grava a linha da CONTA e a do TELEFONE: `pode_contatar_whatsapp` recusa
 *    tanto por conta quanto só pelo número;
 *  · `origem = 'email'` legítima (pessoa pediu por e-mail) suprime o e-mail; o espelho usa origem própria
 *    (`espelho_email`), então não há laço;
 *  · `numero_invalido`, `hard_bounce` e `decisao_interna` NÃO cruzam;
 *  · `numero_invalido` anterior não esconde o pedido de parar;
 *  · rodar a migration de novo é idempotente e o backfill cobre linhas antigas (conta e só-telefone).
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
const optout = ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql');
const emailBase = ler('../supabase/migrations/20260929200000_email_producao_lembretes.sql');
const migration = ler('../supabase/migrations/20261118130000_supressao_cruzada_email_whatsapp.sql');

const tabelaEmail = /create table if not exists public\.email_supressoes \([\s\S]*?\n\);/.exec(emailBase);
assert.ok(tabelaEmail, 'não achei a tabela email_supressoes na migration do e-mail');

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, deleted_at timestamptz, phone text,
    raw_user_meta_data jsonb default '{}'::jsonb);
  create table public.empresa (user_id uuid primary key, dados jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create table public.email_outbox (id bigserial primary key, user_id uuid, template text, status text default 'pending',
    error_code text, next_attempt_at timestamptz, updated_at timestamptz default now());
`);
await db.exec(tabelaEmail[0]);
await db.exec(optout);

// Cada conta ganha um telefone DIFERENTE (11 9NNNN-NNNN) para o casamento por telefone ser testável.
let seq = 1000;
const proximoTel = () => { seq += 1; return `(11) 9${seq}-${String(seq).split('').reverse().join('')}`; };
const norm = (tel: string) => `55${tel.replace(/\D/g, '')}`;
const novoUsuario = async (tel: string | null = proximoTel(), deletado = false) =>
  (await db.query<{ id: string }>(
    `insert into auth.users (email, deleted_at, raw_user_meta_data)
     values ('x@x.com', ${deletado ? 'now()' : 'null'}, case when $1::text is null then '{}'::jsonb else jsonb_build_object('phone', $1::text) end) returning id`, [tel],
  )).rows[0].id;
const semMeta = async (tel: string | null, onde: 'auth_phone' | 'empresa_telefone' | 'empresa_whatsapp') => {
  const id = (await db.query<{ id: string }>(`insert into auth.users (email, phone) values ('x@x.com', $1) returning id`,
    [onde === 'auth_phone' ? tel : null])).rows[0].id;
  if (onde !== 'auth_phone') {
    await db.query(`insert into public.empresa (user_id, dados) values ($1, jsonb_build_object($2::text, $3::text))`,
      [id, onde === 'empresa_telefone' ? 'telefone' : 'whatsapp', tel]);
  }
  return id;
};
const supEmail = async (id: string) =>
  (await db.query<{ motivo: string; origem: string }>(
    'select motivo, origem from public.email_supressoes where user_id = $1 order by motivo', [id],
  )).rows;
const waConta = async (id: string) =>
  (await db.query<{ motivo: string; origem: string }>(
    'select motivo, origem from public.whatsapp_nao_contatar where user_id = $1', [id],
  )).rows;
const waTel = async (tel: string) =>
  (await db.query<{ motivo: string; origem: string }>(
    'select motivo, origem from public.whatsapp_nao_contatar where telefone = $1', [norm(tel)],
  )).rows;
const podeWa = async (id: string | null, tel: string | null = null) =>
  (await db.query<{ r: { pode: boolean; motivo: string } }>('select public.pode_contatar_whatsapp($1::uuid, $2::text) as r', [id, tel])).rows[0].r;
const fila = async (id: string) =>
  (await db.query<{ template: string; status: string }>(
    'select template, status from public.email_outbox where user_id = $1 order by id', [id],
  )).rows;
const enfileira = (id: string, template: string) =>
  db.query('insert into public.email_outbox (user_id, template) values ($1, $2)', [id, template]);
const sair = (id: string | null, tel: string | null, motivo: string, origem = 'whatsapp') =>
  db.query('select public.registrar_nao_contatar_whatsapp($1::uuid, $2::text, $3, $4)', [id, tel, motivo, origem]);

// ── estado "antes da migration": quem já tinha pedido para sair ──────────────────────────────
const telAntigoZap = proximoTel();
const antigoWaTel = await novoUsuario(telAntigoZap);          // SAIR no WhatsApp, linha só de telefone (caminho real)
const antigoWaConta = await novoUsuario();                    // SAIR registrado pela conta (app/painel)
const antigoEmail = await novoUsuario();
const antigoBounce = await novoUsuario();
const antigoInterna = await novoUsuario();
const antigoDeletado = await novoUsuario(telAntigoZap, true); // conta apagada com o mesmo número: não entra
await db.query(`insert into public.whatsapp_nao_contatar (telefone, motivo, origem) values ($1, 'pediu_sair', 'whatsapp')`, [norm(telAntigoZap)]);
await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'reclamou', 'painel')`, [antigoWaConta]);
await db.query(`insert into public.whatsapp_nao_contatar (user_id, motivo, origem) values ($1, 'decisao_interna', 'admin')`, [antigoInterna]);
await enfileira(antigoWaTel, 'lembrete_ativacao');
await enfileira(antigoWaTel, 'boas_vindas');
await enfileira(antigoWaConta, 'lembrete_reengajamento');
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [antigoEmail]);
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [antigoBounce]);

await db.exec(migration);

// backfill
igual(await supEmail(antigoWaTel), [{ motivo: 'descadastro', origem: 'whatsapp' }], 'backfill: SAIR antigo SÓ POR TELEFONE suprimiu o e-mail da conta cujo telefone bate');
igual(await fila(antigoWaTel), [
  { template: 'lembrete_ativacao', status: 'dead_letter' },
  { template: 'boas_vindas', status: 'pending' },
], 'backfill: lembrete na fila cancelado; boas-vindas não conta como lembrete');
igual(await waConta(antigoWaTel), [{ motivo: 'pediu_sair', origem: 'espelho_whatsapp' }], 'backfill: SAIR antigo só de telefone ganhou a linha da CONTA (user_id)');
igual(await supEmail(antigoDeletado), [], 'backfill: conta apagada com o mesmo número não é suprimida');
igual(await waConta(antigoDeletado), [], 'backfill: conta apagada também não ganha linha');
igual(await supEmail(antigoWaConta), [{ motivo: 'descadastro', origem: 'whatsapp' }], 'backfill: pedido gravado pela conta (painel) também suprimiu o e-mail');
igual((await fila(antigoWaConta))[0].status, 'dead_letter', 'backfill: fila da conta do painel cancelada');
igual(await supEmail(antigoInterna), [], 'backfill: decisao_interna NÃO vira descadastro de e-mail');
igual(await waConta(antigoEmail), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'backfill: descadastro antigo do e-mail virou opt-out da CONTA no WhatsApp');
igual((await podeWa(antigoEmail)).pode, false, 'backfill: pode_contatar_whatsapp (por conta) recusa quem se descadastrou do e-mail');
igual(await waBloqueadoPorNumero(), true, 'backfill: consulta só pelo número também recusa o descadastrado do e-mail');
async function waBloqueadoPorNumero() {
  const tel = (await db.query<{ t: string }>(`select raw_user_meta_data->>'phone' as t from auth.users where id = $1`, [antigoEmail])).rows[0].t;
  return (await podeWa(null, tel)).pode === false;
}
igual(await waConta(antigoBounce), [], 'backfill: hard_bounce não cruza (o endereço não existe, ninguém pediu para parar)');
igual((await podeWa(antigoBounce)).pode, true, 'backfill: bounce segue liberado no WhatsApp');

// idempotência: rodar de novo não duplica nem estoura
await db.exec(migration);
igual((await supEmail(antigoWaTel)).length, 1, 'rodar a migration de novo não duplica a supressão de e-mail');
igual((await waConta(antigoEmail)).length, 1, 'rodar a migration de novo não duplica o opt-out da conta no WhatsApp');
igual((await db.query('select 1 from public.whatsapp_nao_contatar where origem = \'espelho_email\'')).rows.length, 2,
  'rodar de novo: 2 linhas espelhadas (conta + telefone do descadastrado), sem duplicata');

// ── gatilho WhatsApp -> e-mail, daqui para frente ───────────────────────────────────────────
// P1: o caminho REAL grava só o telefone.
for (const motivo of ['pediu_sair', 'reclamou']) {
  const tel = proximoTel();
  const u = await novoUsuario(tel);
  const outro = await novoUsuario(); // outro telefone: não pode ser atingido
  await enfileira(u, 'lembrete_reengajamento');
  await enfileira(outro, 'lembrete_reengajamento');
  await sair(null, norm(tel), motivo);
  igual(await supEmail(u), [{ motivo: 'descadastro', origem: 'whatsapp' }], `${motivo} SÓ POR TELEFONE no WhatsApp suprime o e-mail da conta que tem esse número`);
  igual((await fila(u))[0].status, 'dead_letter', `${motivo} por telefone cancela o lembrete que estava na fila`);
  igual(await supEmail(outro), [], `${motivo}: conta de OUTRO telefone não é suprimida`);
  igual((await fila(outro))[0].status, 'pending', `${motivo}: fila da outra conta intacta`);
  igual(await waTel(tel), [{ motivo, origem: 'whatsapp' }], `${motivo}: o pedido original do WhatsApp fica intacto (sem laço)`);
  igual(await waConta(u), [{ motivo, origem: 'espelho_whatsapp' }], `${motivo}: SAIR só de telefone também grava a linha da CONTA no WhatsApp (user_id)`);
  igual((await podeWa(u)).pode, false, `${motivo}: pode_contatar_whatsapp por conta passa a recusar`);
  igual((await db.query('select 1 from public.whatsapp_nao_contatar where telefone is not null and user_id is not null')).rows.length, 0, 'sem linha híbrida');
}

// o mesmo telefone em duas contas: as duas saem
{
  const tel = proximoTel();
  const a = await novoUsuario(tel);
  const b = await novoUsuario(`+55 ${tel}`);
  await sair(null, norm(tel), 'pediu_sair');
  igual([(await supEmail(a)).length, (await supEmail(b)).length], [1, 1], 'duas contas com o mesmo telefone (formatos diferentes): as duas suprimidas');
}

// pedido com conta e telefone ao mesmo tempo (registrar grava as duas linhas): sem duplicata
{
  const tel = proximoTel();
  const u = await novoUsuario(tel);
  await sair(u, tel, 'pediu_sair', 'app');
  igual(await supEmail(u), [{ motivo: 'descadastro', origem: 'whatsapp' }], 'pedido com conta + telefone: uma só supressão de e-mail');
}

// P2: `origem = 'email'` legítima (a pessoa pediu por e-mail) suprime o e-mail; não é confundida com o espelho
{
  const u = await novoUsuario();
  await enfileira(u, 'lembrete_ativacao');
  await sair(u, null, 'pediu_sair', 'email');
  igual(await supEmail(u), [{ motivo: 'descadastro', origem: 'whatsapp' }], "registrar(..., 'email') legítimo suprime o e-mail");
  igual((await fila(u))[0].status, 'dead_letter', "registrar(..., 'email'): fila cancelada");
}

// D-2278: o telefone da conta pode estar em QUALQUER fonte do cadastro; compara pelos últimos 10 dígitos
for (const onde of ['auth_phone', 'empresa_telefone', 'empresa_whatsapp'] as const) {
  const tel = proximoTel();
  const u = await semMeta(tel, onde);
  await enfileira(u, 'lembrete_ativacao');
  await sair(null, norm(tel), 'pediu_sair');
  igual(await supEmail(u), [{ motivo: 'descadastro', origem: 'whatsapp' }], `SAIR só de telefone suprime a conta cujo telefone está em ${onde}`);
  igual((await fila(u))[0].status, 'dead_letter', `${onde}: fila cancelada`);
}
{
  // formatos diferentes do mesmo número: com 55, com zero à esquerda, com pontuação
  const base = proximoTel(); // (11) 9NNNN-NNNN
  const d = base.replace(/\D/g, '');
  const a = await semMeta(`+55 ${base}`, 'empresa_telefone');
  const b = await semMeta(`0${d}`, 'empresa_whatsapp');
  const c = await semMeta(`${d.slice(0, 2)}.${d.slice(2)}`, 'auth_phone');
  const outroDdd = await semMeta(`(21) ${base.slice(5)}`, 'empresa_telefone'); // mesmo número, DDD diferente
  await sair(null, norm(base), 'reclamou');
  igual([(await supEmail(a)).length, (await supEmail(b)).length, (await supEmail(c)).length], [1, 1, 1], 'formatos 55/zero/pontuação do mesmo número casam (número nacional)');
  igual(await supEmail(outroDdd), [], 'mesmo número com DDD diferente (11 x 21) NÃO casa');
  const base3 = proximoTel();
  const d3 = base3.replace(/\D/g, '');
  const sem9 = await semMeta(`${d3.slice(0, 2)}${d3.slice(3)}`, 'empresa_telefone'); // celular antigo, sem o 9
  const base2 = proximoTel().replace(/\D/g, '');
  const com9 = await semMeta(base2, 'empresa_whatsapp');
  await sair(null, norm(base3), 'pediu_sair'); // SAIR com o 9; a conta sem9 tem o mesmo número sem o 9
  await sair(null, `${base2.slice(0, 2)}${base2.slice(3)}`, 'pediu_sair'); // SAIR sem o 9
  igual((await supEmail(sem9)).length, 1, 'celular sem o 9 casa com o mesmo número de 11 dígitos');
  igual((await supEmail(com9)).length, 1, 'e o contrário: SAIR sem o 9 suprime a conta com o 9');
}
{
  const curto = await semMeta('99999', 'empresa_telefone');
  await sair(null, '11999999999', 'pediu_sair');
  igual(await supEmail(curto), [], 'telefone curto demais (sem DDD) não casa com nada');
}

// P3: não cruzam
const invalido = await novoUsuario();
await enfileira(invalido, 'lembrete_ativacao');
await sair(invalido, null, 'numero_invalido');
igual(await supEmail(invalido), [], 'numero_invalido NÃO suprime o e-mail (número errado não é pedido de saída)');
igual((await fila(invalido))[0].status, 'pending', 'numero_invalido não cancela a fila de e-mail');

const interna = await novoUsuario();
await enfileira(interna, 'lembrete_ativacao');
await sair(interna, null, 'decisao_interna', 'admin');
igual(await supEmail(interna), [], 'decisao_interna NÃO vira descadastro de e-mail (não foi pedido da pessoa)');
igual((await fila(interna))[0].status, 'pending', 'decisao_interna não cancela a fila de e-mail');

const contaEmail = async () =>
  Number((await db.query<{ n: string }>('select count(*) as n from public.email_supressoes')).rows[0].n);
const antesTel = await contaEmail();
await sair(null, '11988887777', 'pediu_sair');
igual(await contaEmail(), antesTel, 'telefone que não bate com conta nenhuma não cria supressão de e-mail e não dá erro');
const deletada = await novoUsuario('(11) 97777-6666', true);
await sair(null, '11977776666', 'pediu_sair');
igual(await supEmail(deletada), [], 'conta apagada não é suprimida pelo telefone');

// ── gatilho e-mail -> WhatsApp, daqui para frente ───────────────────────────────────────────
{
  const tel = proximoTel();
  const descad = await novoUsuario(tel);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'one_click')`, [descad]);
  igual(await waConta(descad), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'descadastro por e-mail (one-click) vira opt-out da conta no WhatsApp');
  igual(await waTel(tel), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'P2: e a linha do TELEFONE da conta também');
  igual((await podeWa(descad)).pode, false, 'pode_contatar_whatsapp (por conta) recusa quem se descadastrou');
  igual((await podeWa(null, tel)).pode, false, 'P2: pode_contatar_whatsapp só pelo número (lista do SALES) também recusa');
  igual((await supEmail(descad)).length, 1, 'o e-mail continua com UMA linha (sem laço)');

  // já suprimido dos dois lados: nenhuma segunda linha, nenhum erro
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'complaint', 'resend_webhook')`, [descad]);
  igual((await waConta(descad)).length, 1, 'quem já está no opt-out do WhatsApp não ganha segunda linha');
}

{
  const tel = proximoTel();
  const spam = await novoUsuario(tel);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'complaint', 'resend_webhook')`, [spam]);
  igual(await waConta(spam), [{ motivo: 'reclamou', origem: 'espelho_email' }], 'reclamação (spam) no e-mail vira opt-out do WhatsApp como "reclamou"');
  igual(await waTel(tel), [{ motivo: 'reclamou', origem: 'espelho_email' }], 'reclamação: linha do telefone também');
  // conhecido e aceito: voltar pelo autoatendimento só apaga `pediu_sair`, então `reclamou` não sai sozinho
  await db.query(`delete from public.whatsapp_nao_contatar where user_id = $1 and motivo = 'pediu_sair'`, [spam]);
  igual((await podeWa(spam)).pode, false, 'complaint bloqueia o WhatsApp sem volta por autoatendimento (aceito, documentado)');
}

{
  // descadastro por e-mail grava a linha de CADA telefone do cadastro (Auth, metadata e empresa)
  const telMeta = proximoTel();
  const telEmp = proximoTel();
  const u = await novoUsuario(telMeta);
  await db.query(`insert into public.empresa (user_id, dados) values ($1, jsonb_build_object('telefone', $2::text))`, [u, telEmp]);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'one_click')`, [u]);
  igual([(await podeWa(null, telMeta)).pode, (await podeWa(null, telEmp)).pode], [false, false], 'descadastro: o número do metadata E o da empresa ficam bloqueados no WhatsApp');
}

{
  const semTel = await novoUsuario(null);
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'link_email')`, [semTel]);
  igual(await waConta(semTel), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'conta sem telefone: grava a linha da conta e não quebra');
}

// P3 #5: `numero_invalido` anterior não esconde o pedido de parar
{
  const tel = proximoTel();
  const u = await novoUsuario(tel);
  await sair(u, tel, 'numero_invalido');
  igual((await podeWa(u)).motivo, 'numero_invalido', 'preparo: conta e telefone marcados como número inválido');
  await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'descadastro', 'one_click')`, [u]);
  igual(await waConta(u), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'descadastro substitui numero_invalido na linha da conta');
  igual(await waTel(tel), [{ motivo: 'pediu_sair', origem: 'espelho_email' }], 'descadastro substitui numero_invalido na linha do telefone');
}

const bounce = await novoUsuario();
await db.query(`insert into public.email_supressoes (user_id, motivo, origem) values ($1, 'hard_bounce', 'resend_webhook')`, [bounce]);
igual(await waConta(bounce), [], 'hard_bounce novo não cruza');

const limpo = await novoUsuario();
igual((await podeWa(limpo)).pode, true, 'quem nunca pediu para parar segue liberado no WhatsApp');
igual(await supEmail(limpo), [], 'quem nunca pediu para parar segue liberado no e-mail');

// "voltar" no WhatsApp remove só o pedido do WhatsApp; a supressão de e-mail espelhada fica
await db.query(`delete from public.whatsapp_nao_contatar where telefone = $1 and motivo = 'pediu_sair'`, [norm(telAntigoZap)]);
igual((await supEmail(antigoWaTel)).length, 1, 'voltar ao WhatsApp não reativa o e-mail sozinho');

// permissões: nada novo executável por anon/authenticated
for (const fn of ['private.telefone_chave(text)', 'private.telefones_da_conta(uuid)', 'private.contas_do_nao_contatar(uuid, text)', 'private.espelhar_nao_contatar_no_email()', 'private.espelhar_supressao_email_no_whatsapp()']) {
  const r = await db.query<{ a: boolean; b: boolean }>(
    `select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as b`, [fn]);
  igual([r.rows[0].a, r.rows[0].b], [false, false], `${fn}: sem execute para anon/authenticated`);
}

console.log(`teste-supressao-cruzada-sql: ${checks} verificações ok`);
