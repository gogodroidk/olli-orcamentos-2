/**
 * Rastreio de uso (user_tela_log + funil) em Postgres real (PGlite). Trava:
 *  - só o RPC escreve (sem INSERT/SELECT direto para authenticated); user_id vem de auth.uid(), não do cliente;
 *  - tela/ação fora do formato são descartadas; lote > 20 recusado; teto de 1.000 linhas/dia por pessoa;
 *  - exclusão da conta apaga os eventos (LGPD, on delete cascade);
 *  - views do funil (service_role): 1ª vez de cada marco, contagem por passo e tempos.
 *     node scripts/teste-rastreio-sql.ts
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const M1 = readFileSync('supabase/migrations/20261022100000_user_tela_log.sql', 'utf8');
const M2 = readFileSync('supabase/migrations/20261023160000_rastreio_funil.sql', 'utf8');
let ok = 0, falhas = 0;
function checar(nome: string, cond: unknown, detalhe = ''): void {
  if (cond) { console.log(`  ok   ${nome}`); ok++; } else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U1 = id(1), U2 = id(2);
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
insert into auth.users values ('${U1}'), ('${U2}');`);
await db.exec(M1); await db.exec(M2);
await db.exec('grant select, delete on all tables in schema public to service_role');
const como = async (uid: string, sql: string) => { await db.exec(`set test.uid = '${uid}'; set role authenticated;`); try { return await db.query<Record<string, unknown>>(sql); } finally { await db.exec('reset role;'); } };
const erro = async (fn: () => Promise<unknown>) => { try { await fn(); return ''; } catch (e) { return String((e as Error).message); } };
const rpc = (itens: unknown, plat = 'android') => `select public.registrar_telas_usuario('${JSON.stringify(itens).replace(/'/g, "''")}'::jsonb, '${plat}')`;
const n = async (w = 'true') => Number((await db.query<{ n: string }>(`select count(*) n from public.user_tela_log where ${w}`)).rows[0].n);

console.log('\nescrita só pelo RPC');
checar('sem login: not_authenticated', (await erro(() => como('', rpc([{ tela: 'Home', duracao_ms: 10 }])))).includes('not_authenticated'));
await como(U1, rpc([{ tela: 'Home', duracao_ms: 4200 }, { tela: 'orcamento_novo', acao: 'quote_created', duracao_ms: 0, user_id: U2 }, { tela: 'Rota com espaço e ?id=1', duracao_ms: 5 }, { tela: 'Home', acao: 'Botão Enviar!', duracao_ms: 1 }]));
checar('grava só o válido: tela fora do formato E ação fora da lista fechada derrubam o item (2 de 4)', (await n()) === 2);
checar('user_id vem do servidor (ignora o do payload)', (await n(`user_id='${U2}'`)) === 0 && (await n(`user_id='${U1}'`)) === 2);
checar('texto livre NUNCA chega ao banco (nem o botão "Botão Enviar!")', (await n("acao = 'Botão Enviar!'")) === 0 && (await n("acao is null and tela='Home'")) === 1);
checar('o banco também barra ação fora da lista (constraint, até para service_role)', (await erro(() => db.exec(`insert into public.user_tela_log (user_id, tela, acao) values ('${U1}', 'Home', 'digitou_o_nome_do_cliente')`))).length > 0);
checar('lote > 20 recusado', (await erro(() => como(U1, rpc(Array.from({ length: 21 }, () => ({ tela: 'Home' })))))).includes('lote_invalido'));
checar('authenticated NÃO insere direto', (await erro(() => como(U1, `insert into public.user_tela_log (user_id, tela) values ('${U1}','Home')`))).length > 0);
checar('authenticated NÃO lê a tabela nem as views', (await erro(() => como(U1, 'select * from public.user_tela_log'))).length > 0 && (await erro(() => como(U1, 'select * from public.funil_uso'))).length > 0);

console.log('\nteto de 1.000/dia por pessoa');
await db.exec(`insert into public.user_tela_log (user_id, tela) select '${U2}', 'Home' from generate_series(1, 1000)`);
await como(U2, rpc([{ tela: 'Home' }]));
checar('passou do teto: descarta em silêncio (1.000 linhas, não 1.001)', (await n(`user_id='${U2}'`)) === 1000);
await db.exec(`delete from public.user_tela_log where user_id='${U2}'`);

console.log('\nfunil (views, service_role)');
await db.exec(`delete from public.user_tela_log`);
const ev = [['sessao_iniciada', 0], ['signup', 1], ['quote_created', 30], ['quote_sent', 45], ['planos_aberto', 60], ['pix_gerado', 70], ['pix_pago', 100]] as const;
for (const [acao, min] of ev) await db.exec(`insert into public.user_tela_log (user_id, tela, acao, criado_em) values ('${U1}', 'app', '${acao}', timestamptz '2026-10-20 10:00:00+00' + interval '${min} minutes')`);
await db.exec(`insert into public.user_tela_log (user_id, tela, acao) values ('${U2}', 'app', 'sessao_iniciada'), ('${U2}', 'app', 'signup')`);
await db.exec(`insert into public.user_tela_log (user_id, tela, acao, criado_em) values ('${U1}', 'app', 'quote_created', timestamptz '2026-10-25 10:00:00+00')`); // 2º orçamento não muda o "1º"
await db.exec('set role service_role');
const f = (await db.query<Record<string, unknown>>(`select * from public.funil_uso where user_id='${U1}'`)).rows[0];
const r = (await db.query<Record<string, number>>('select * from public.funil_uso_resumo')).rows[0];
const t = (await db.query<Record<string, number>>('select * from public.funil_uso_tempos')).rows[0];
await db.exec('reset role');
checar('1ª vez de cada marco (o 2º orçamento não substitui o 1º)', f && new Date(String(f.orcamento_criado)).toISOString() === '2026-10-20T10:30:00.000Z' && f.pix_pago != null);
checar('resumo: 2 pessoas abriram/cadastraram, 1 criou, enviou, gerou Pix e pagou', Number(r.abriu_app) === 2 && Number(r.cadastrou) === 2 && Number(r.criou_orcamento) === 1 && Number(r.enviou_orcamento) === 1 && Number(r.gerou_pix) === 1 && Number(r.pagou) === 1, JSON.stringify(r));
checar('tempos (mediana): 1º orçamento 29 min após o cadastro, Pix→pagamento 30 min', Number(t.min_ate_1o_orcamento) === 29 && Number(t.min_do_pix_ao_pagamento) === 30, JSON.stringify(t));

console.log('\nopt-out NA CONTA (condição 2 do parecer)');
await db.exec(`delete from public.user_tela_log`);
await como(U1, rpc([{ tela: 'Home', acao: 'signup' }]));
checar('padrão: ativo (sem linha de opt-out) e grava', (await como(U1, 'select public.rastreio_uso_ativo() a')).rows[0].a === true && (await n(`user_id='${U1}'`)) === 1);
await como(U1, 'select public.rastreio_uso_definir(false)');
checar('desligar: preferência da conta = false e APAGA o que já foi coletado dela', (await como(U1, 'select public.rastreio_uso_ativo() a')).rows[0].a === false && (await n(`user_id='${U1}'`)) === 0);
await como(U1, rpc([{ tela: 'Home', acao: 'quote_sent' }]));
checar('com opt-out o RPC descarta tudo (vale desde o 1º evento, em qualquer aparelho)', (await n(`user_id='${U1}'`)) === 0);
checar('o opt-out de uma pessoa não afeta outra', (await como(U2, 'select public.rastreio_uso_ativo() a')).rows[0].a === true);
checar('sem login: ativo = nulo (o app trata como "não sei" e não envia)', (await como('', 'select public.rastreio_uso_ativo() a')).rows[0].a === null);
checar('authenticated não lê nem escreve a tabela de opt-out direto', (await erro(() => como(U1, 'select * from public.rastreio_uso_optout'))).length > 0 && (await erro(() => como(U1, `insert into public.rastreio_uso_optout (user_id) values ('${U2}')`))).length > 0);
await como(U1, 'select public.rastreio_uso_definir(true)');
await como(U1, rpc([{ tela: 'Home', acao: 'quote_sent' }]));
checar('religar volta a gravar', (await n(`user_id='${U1}'`)) === 1);
await como(U1, 'select public.rastreio_uso_definir(false)');

console.log('\nLGPD');
await db.exec(`insert into public.user_tela_log (user_id, tela, acao) values ('${U2}', 'app', 'signup')`);
await como(U2, 'select public.rastreio_uso_definir(false)').catch(() => {});
await db.exec(`insert into public.rastreio_uso_optout (user_id) values ('${U2}') on conflict do nothing`);
await db.exec(`insert into public.user_tela_log (user_id, tela, acao) values ('${U2}', 'app', 'signup')`);
await db.exec(`delete from auth.users where id='${U2}'`);
checar('(4) excluir a conta apaga os eventos E a preferência de opt-out dela (cascade)', (await n(`user_id='${U2}'`)) === 0 && Number((await db.query<{ n: string }>(`select count(*) n from public.rastreio_uso_optout where user_id='${U2}'`)).rows[0].n) === 0);
await db.exec(`insert into public.user_tela_log (user_id, tela, acao, criado_em) values ('${U1}', 'app', 'sessao_iniciada', now() - interval '91 days'), ('${U1}', 'app', 'pix_pago', now())`);
await db.exec(`delete from public.user_tela_log where criado_em < now() - interval '90 days'`);
checar('retenção de 90 dias apaga só o antigo', (await n("acao='sessao_iniciada'")) === 0 && (await n("acao='pix_pago'")) === 1);

console.log(falhas ? `\nFALHOU: ${ok} ok, ${falhas} falha(s)` : `\nPASSOU: ${ok} casos — rastreio de uso (SQL)`);
process.exit(falhas ? 1 : 0);
