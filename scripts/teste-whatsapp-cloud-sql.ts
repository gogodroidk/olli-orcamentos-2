/**
 * Regras de envio do WhatsApp Cloud API NO BANCO (supabase/migrations/20261007110000_whatsapp_cloud_multinumero.sql).
 *
 *     node scripts/teste-whatsapp-cloud-sql.ts
 *
 * Roda o SQL REAL das duas migrations (opt-out de 06/10 + multi-número de 07/10) num Postgres de verdade (PGlite),
 * com stubs só do que é do Supabase (auth.users, auth.uid, vault.decrypted_secrets, roles). Prova:
 * número desligado recusa tudo · primeiro contato só com OK humano · SAIR vira opt-out e bloqueia envio ·
 * fora da janela de 24 h só template · intervalo e teto diário de templates · entrada idempotente ·
 * status nunca "rebaixa" · tabelas fechadas (RLS sem policy).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, `FALHA: ${msg}`);
  checks++;
};
const igual = (atual: unknown, esperado: unknown, msg: string) => {
  assert.deepEqual(atual, esperado, `FALHA: ${msg}`);
  checks++;
};

const ler = (c: string) => readFileSync(new URL(c, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const optout = ler('../supabase/migrations/20261006090000_whatsapp_nao_contatar.sql');
const wa = ler('../supabase/migrations/20261007110000_whatsapp_cloud_multinumero.sql');

const db = new PGlite();
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema if not exists private;
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}'::jsonb, deleted_at timestamptz);
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create schema if not exists vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
`);
await db.exec(optout);
await db.exec(wa);
await db.exec(wa); // idempotente
checks++;

const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const um = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0];
const PID = '1162487800287754';
const A = '5511987654321'; // escreveu primeiro
const B = '5511912345678'; // nunca escreveu
const C = '5521999990000';

const autorizar = async (tel: string, tipo: string, template: string | null = null) =>
  (await um('select public.wa_autorizar_envio($1,$2,$3,$4,null) r', [PID, tel, tipo, template])).r;
const entrada = async (itens: unknown[], pid = PID) =>
  (await um('select public.wa_registrar_entradas($1,$2::jsonb) r', [pid, JSON.stringify(itens)])).r;
const agoraUnix = () => String(Math.floor(Date.now() / 1000));

// ─── número desligado = recusa tudo e diz por quê ─────────────────────────────
const semino = await um('select ativo, marca from public.wa_numeros where phone_number_id=$1', [PID]);
igual(semino, { ativo: false, marca: 'OLLI' }, 'o número da holding nasce cadastrado e DESLIGADO');
igual((await autorizar(A, 'texto')).motivo, 'numero_inativo', 'número desligado recusa envio');
igual((await entrada([{ id: 'wamid.X0001', telefone: A, tipo: 'text', texto: 'oi', ts: agoraUnix() }])).motivo, 'numero_inativo', 'número desligado não grava entrada');
igual(await um('select public.wa_numero_ativo($1,null) r', [PID]).then((x) => x.r), null, 'número desligado não resolve');
await db.exec(`update public.wa_numeros set ativo = true where phone_number_id = '${PID}'`);
igual((await um('select public.wa_numero_ativo(null,$1) r', ['olli'])).r?.phone_number_id, PID, 'marca resolve o número (sem diferenciar maiúscula)');

// ─── entrada: idempotente, janela de 24 h, roteada por número ─────────────────
const e1 = await entrada([{ id: 'wamid.A00001', telefone: A, perfil: 'Maria', tipo: 'text', texto: 'quero orçamento', ts: agoraUnix() }]);
igual([e1.registradas, e1.duplicadas, e1.saiu], [1, 0, 0], 'primeira entrada é gravada');
const e2 = await entrada([{ id: 'wamid.A00001', telefone: A, tipo: 'text', texto: 'quero orçamento', ts: agoraUnix() }]);
igual([e2.registradas, e2.duplicadas], [0, 1], 'a mesma mensagem reenviada pela Meta não duplica');
const lixo = await entrada([{ id: 'wamid.L0001', telefone: '123', tipo: 'text', texto: 'x' }, { id: 'wamid.L0002', telefone: A, tipo: 'TIPO RUIM!', texto: 'x' }]);
igual(lixo.ignoradas, 2, 'telefone inválido e tipo fora do padrão são ignorados, sem derrubar o lote');
ok((await um('select count(*)::int n from public.wa_entrada')).n === 1, 'só 1 linha na fila');
await db.exec(`insert into public.wa_numeros (phone_number_id, waba_id, marca, ativo) values ('555000111222', '999000111', 'OUTRA', true)`);
const e3 = await entrada([{ id: 'wamid.O00001', telefone: C, tipo: 'text', texto: 'oi outra marca', ts: agoraUnix() }], '555000111222');
igual(e3.registradas, 1, 'segundo número (N amanhã) recebe sem mudar código');
igual((await um(`select count(*)::int n from public.wa_entrada where phone_number_id = '555000111222'`)).n, 1, 'a entrada fica no número certo');
igual((await um('select ultima_entrada_em is not null ok from public.wa_contatos where phone_number_id=$1 and telefone=$2', [PID, A])).ok, true, 'a entrada abre a janela de 24 h');

// ─── guarda de envio ──────────────────────────────────────────────────────────
igual((await autorizar(A, 'texto')).pode, true, 'quem escreveu há pouco recebe texto (resposta dentro da janela)');
igual((await autorizar(B, 'texto')).motivo, 'primeiro_contato_sem_ok_humano', 'PRIMEIRO CONTATO sem OK humano é recusado (texto)');
igual((await autorizar(B, 'template', 'boas_vindas_olli')).motivo, 'primeiro_contato_sem_ok_humano', 'PRIMEIRO CONTATO sem OK humano é recusado (template)');
igual((await um('select public.wa_aprovar_primeiro_contato($1,$2,$3) r', [PID, B, ' ']).then((x) => x.r)).motivo, 'quem_aprovou_obrigatorio', 'OK humano sem nome de quem aprovou não vale');
igual((await um('select public.wa_aprovar_primeiro_contato($1,$2,$3) r', [PID, 'abc', 'Igor']).then((x) => x.r)).motivo, 'telefone_invalido', 'OK humano com telefone inválido não vale');
igual((await um('select public.wa_aprovar_primeiro_contato($1,$2,$3) r', [PID, B, 'Igor']).then((x) => x.r)).ok, true, 'OK humano registrado');
igual((await autorizar(B, 'texto')).motivo, 'fora_da_janela_use_template', 'aprovado mas sem janela: texto livre é recusado');
const t1 = await autorizar(B, 'template', 'boas_vindas_olli');
igual([t1.pode, typeof t1.envio_id], [true, 'number'], 'aprovado + template: libera e reserva o envio');
igual((await autorizar(B, 'template', 'Nome Ruim!')).motivo, 'template_invalido', 'nome de template fora do padrão é recusado');
igual((await autorizar(B, 'audio')).motivo, 'tipo_invalido', 'tipo desconhecido é recusado');
igual((await autorizar('999', 'texto')).motivo, 'telefone_invalido', 'telefone inválido é recusado');
igual((await um('select public.wa_autorizar_envio($1,$2,$3,null,null) r', ['000111', A, 'texto']).then((x) => x.r)).motivo, 'numero_inexistente', 'número inexistente é recusado');

// ─── ritmo humano: intervalo e teto entre templates ───────────────────────────
await db.exec(`select public.wa_aprovar_primeiro_contato('${PID}', '${C}', 'Bruno')`);
const seg = await autorizar(C, 'template', 'boas_vindas_olli');
igual(seg.motivo, 'aguarde', 'segundo template logo em seguida espera o intervalo');
ok(seg.aguarde_s > 150 && seg.aguarde_s <= 180, `espera ≈ intervalo de 180 s (veio ${seg.aguarde_s})`);
await db.exec(`update public.wa_envios set criado_em = now() - interval '4 minutes'`);
igual((await autorizar(C, 'template', 'boas_vindas_olli')).pode, true, 'passado o intervalo, libera');
await db.exec(`update public.wa_envios set criado_em = now() - interval '4 minutes'; update public.wa_numeros set teto_diario_templates = 2 where phone_number_id = '${PID}'`);
igual((await autorizar(C, 'template', 'boas_vindas_olli')).motivo, 'teto_diario', 'teto diário de templates trava');
await db.exec(`update public.wa_envios set estado = 'falhou' where tipo = 'template'`);
igual((await autorizar(C, 'template', 'boas_vindas_olli')).pode, true, 'envio que FALHOU não consome o ritmo nem o teto');

// ─── janela de 24 h ───────────────────────────────────────────────────────────
await db.exec(`update public.wa_contatos set ultima_entrada_em = now() - interval '25 hours' where telefone = '${A}'`);
igual((await autorizar(A, 'texto')).motivo, 'fora_da_janela_use_template', 'passou de 24 h: só template');
await db.exec(`update public.wa_numeros set intervalo_envio_s = 30 where phone_number_id = '${PID}'; update public.wa_envios set criado_em = now() - interval '4 minutes'; update public.wa_numeros set teto_diario_templates = 100`);
igual((await autorizar(A, 'template', 'retomada_olli')).pode, true, 'passou de 24 h: template libera (já escreveu antes)');

// ─── SAIR vira opt-out e bloqueia ─────────────────────────────────────────────
const sair = await entrada([{ id: 'wamid.S00001', telefone: B, tipo: 'button', texto: 'SAIR', ts: agoraUnix() }]);
igual([sair.registradas, sair.saiu], [1, 1], 'SAIR registra a entrada e conta como saída');
igual((await um('select pode from (select (public.pode_contatar_whatsapp(null,$1)->>\'pode\')::boolean pode) x', [B])).pode, false, 'SAIR entrou na lista não-contatar');
igual((await um('select estado from public.wa_entrada where wa_message_id = \'wamid.S00001\'')).estado, 'saiu', 'a fila marca "saiu" (Bruno não atende)');
const bloqueado = await autorizar(B, 'template', 'boas_vindas_olli');
igual([bloqueado.pode, bloqueado.motivo, bloqueado.detalhe], [false, 'nao_contatar', 'pediu_sair'], 'depois do SAIR NENHUM envio passa, nem com OK humano antigo');
const pedidos: Array<[string, boolean]> = [
  ['Sair', true], ['PARE', true], ['  parar  ', true], ['Não quero', true], ['nao quero mais receber', true], ['Cancelar!', true], ['STOP', true],
  ['sair da lista por favor', true], ['quero um orçamento', false], ['pode parar de ligar? não, pode ligar sim', false], ['saiu o pedido?', false], ['', false],
];
for (const [texto, esperado] of pedidos) {
  igual((await um('select private.wa_texto_pede_sair($1) r', [texto])).r, esperado, `"${texto}" ${esperado ? 'pede' : 'NÃO pede'} para sair`);
}

// PARECER LEGAL (item 3): variações de recusa que a regex antiga não pegava + o que NÃO pode virar saída
const recusas = [
  'Me tira dessa lista', 'me tira da lista por favor', 'retire meu número da lista', 'Tirem meu nome do cadastro', 'chega de mensagem', 'Chega!', 'já chega',
  'não me mande mais', 'Nao manda mais', 'não manda nada', 'não me chame mais', 'pare de me mandar mensagem', 'para de me enviar isso', 'Parem de ligar',
  'bloqueei vocês', 'vou bloquear esse número', 'não tenho interesse', 'sem interesse, obrigado', 'não me interessa', 'não quero receber mais nada',
  'quero me descadastrar', 'me desinscreva', 'isso é spam', 'apague meus dados', 'exclua meu cadastro', 'vou denunciar',
];
const conversas = [
  'o orçamento chega amanhã?', 'chega no sábado de manhã', 'não mande o orçamento por e-mail, mande por zap', 'pode me mandar o orçamento?', 'quanto custa para de ar condicionado split?',
  'tira uma dúvida da instalação?', 'bloqueio do compressor, quanto sai o reparo?', 'me manda o preço', 'sim, pode mandar', 'quero parar de usar planilha e ligar mais clientes',
  'nao pode ligar agora, estou na obra', 'tenho interesse sim', 'sem problema, pode enviar', 'o spam do e-mail esta caindo na minha caixa e queria ajuda para configurar o filtro e o cadastro dos clientes novos hoje',
];
for (const texto of recusas) igual((await um('select private.wa_texto_pede_sair($1) r', [texto])).r, true, `recusa "${texto}" vira SAIR`);
for (const texto of conversas) igual((await um('select private.wa_texto_pede_sair($1) r', [texto])).r, false, `conversa "${texto}" NÃO vira SAIR`);
igual((await um('select private.wa_texto_pede_sair($1) r', ['me tira da lista ' + 'x'.repeat(200)])).r, false, 'mensagem longa (> 160) é conversa: quem lê é o Bruno, não a regex');

// ─── RETENÇÃO (parecer LEGAL, item 2): 180 d resolvido/saiu · 12 m parado · envios 12 m ─────────────────────
await db.exec(`
  delete from public.wa_entrada; delete from public.wa_envios; delete from public.wa_contatos;
  insert into public.wa_entrada (phone_number_id, wa_message_id, telefone, perfil_nome, tipo, texto, recebido_em, estado) values
    ('${PID}', 'wamid.RET001', '${A}', 'Ana', 'text', 'resolvida velha',  now() - interval '181 days', 'resolvido'),
    ('${PID}', 'wamid.RET002', '${A}', 'Ana', 'text', 'resolvida nova',   now() - interval '179 days', 'resolvido'),
    ('${PID}', 'wamid.RET003', '${B}', 'Bia', 'text', 'saiu velha',       now() - interval '200 days', 'saiu'),
    ('${PID}', 'wamid.RET004', '${C}', 'Caio','text', 'nova parada 8m',   now() - interval '8 months', 'novo'),
    ('${PID}', 'wamid.RET005', '${C}', 'Caio','text', 'nova parada 13m',  now() - interval '13 months', 'novo'),
    ('${PID}', 'wamid.RET006', '${C}', 'Caio','text', 'atendimento 13m',  now() - interval '13 months', 'em_atendimento');
  insert into public.wa_envios (phone_number_id, telefone, tipo, estado, criado_em) values
    ('${PID}', '${A}', 'template', 'entregue', now() - interval '13 months'),
    ('${PID}', '${A}', 'template', 'entregue', now() - interval '11 months');
  insert into public.wa_contatos (phone_number_id, telefone, ultima_entrada_em, criado_em) values
    ('${PID}', '${A}', now() - interval '14 months', now() - interval '14 months'),
    ('${PID}', '${B}', now() - interval '14 months', now() - interval '14 months'),
    ('${PID}', '${C}', now() - interval '1 month',   now() - interval '14 months');
`);
const ret = (await um('select public.wa_retencao_limpar() r')).r;
igual(ret.ok, true, 'retenção devolve ok');
igual([ret.entrada_resolvida_180d, ret.entrada_parada_12m, ret.envios_12m], [2, 2, 1], 'apagou: resolvido/saiu > 180 d (2), parado > 12 m (2), envio > 12 m (1)');
igual((await q(`select wa_message_id from public.wa_entrada order by wa_message_id`)).map((r) => r.wa_message_id), ['wamid.RET002', 'wamid.RET004'], 'ficaram só a resolvida de 179 d e a parada de 8 m');
igual((await um('select count(*)::int n from public.wa_envios')).n, 1, 'o envio de 11 meses fica (prova de quem foi contatado)');
igual((await q(`select telefone from public.wa_contatos order by telefone`)).map((r) => r.telefone), [A, C].sort(), 'contato de 14 m sem nenhuma linha (B) saiu; A (tem envio) e C (entrada recente) ficam');
igual((await um("select (public.wa_retencao_limpar()->>'entrada_resolvida_180d')::int n")).n, 0, 'idempotente: 2ª rodada não apaga nada');
const supr = await um(`select count(*)::int n from public.whatsapp_nao_contatar`);
ok(supr.n >= 1, 'a lista de supressão (SAIR) NÃO é tocada pela retenção');

// ─── status da Meta nunca rebaixa ─────────────────────────────────────────────
await db.exec(`insert into public.wa_envios (phone_number_id, telefone, tipo, estado, wa_message_id) values ('${PID}', '${A}', 'texto', 'reservado', 'wamid.ENV0001')`);
const st = async (estado: string, codigo: string | null = null) =>
  (await um('select public.wa_registrar_statuses($1::jsonb) r', [JSON.stringify([{ id: 'wamid.ENV0001', estado, codigo }])])).r;
igual(await st('delivered'), 1, 'delivered avança');
igual(await st('sent'), 0, 'sent depois de delivered NÃO rebaixa');
igual(await st('read'), 1, 'read avança');
igual(await st('failed', '131047'), 1, 'failed grava o código');
igual((await um(`select estado, codigo_falha from public.wa_envios where wa_message_id = 'wamid.ENV0001'`)), { estado: 'falhou', codigo_falha: '131047' }, 'estado final e código da falha');
igual(await st('lixo'), 0, 'status desconhecido é ignorado');

// ─── concluir envio e fila ────────────────────────────────────────────────────
const r = await autorizar(A, 'template', 'retomada_olli');
if (r.pode) {
  await db.query('select public.wa_concluir_envio($1,$2,null)', [r.envio_id, 'wamid.OK00001']);
  igual((await um('select estado from public.wa_envios where id = $1', [r.envio_id])).estado, 'enviado', 'concluir grava enviado + wamid');
}
const fila = await q('select * from public.wa_fila_entrada(50)');
ok(fila.length >= 1 && fila.every((f) => f.estado === 'novo' || f.estado === 'em_atendimento'), 'a fila só mostra novo/em_atendimento (SAIR e resolvido ficam fora)');
ok(fila.every((f) => f.marca), 'a fila diz de qual marca/número veio');
igual((await um('select public.wa_fila_atualizar($1, $2, $3) r', [fila[0].id, 'resolvido', 'Bruno'])).r, true, 'atender/resolver atualiza a fila');
igual((await um('select public.wa_fila_atualizar($1, $2, $3) r', [fila[0].id, 'novo', 'Bruno'])).r, false, 'não volta para "novo" por aqui');

// ─── segredos e fechamento das tabelas ────────────────────────────────────────
await db.exec(`insert into vault.decrypted_secrets values ('wa_app_secret','s1'), ('wa_envio_token','s2'), ('wa_aprovacao_token','s3'), ('wa_access_token','tok')`);
const seg2 = (await um('select public.wa_segredos() r')).r;
igual([seg2.app_secret, seg2.envio_token, seg2.aprovacao_token, seg2.verify_token], ['s1', 's2', 's3', null], 'segredos vêm do Vault; ausente = null (rota fica desligada)');
igual((await um('select public.wa_token_numero($1) r', [PID])).r, 'tok', 'token do número vem do Vault');
await db.exec(`update public.wa_numeros set ativo = false where phone_number_id = '${PID}'`);
igual((await um('select public.wa_token_numero($1) r', [PID])).r, null, 'número desligado não entrega token');
for (const t of ['wa_numeros', 'wa_contatos', 'wa_entrada', 'wa_envios']) {
  const row = await um(`select relrowsecurity rls, (select count(*)::int from pg_policies where tablename = $1) pol from pg_class where relname = $1`, [t]);
  igual([row.rls, row.pol], [true, 0], `${t}: RLS ligada e SEM policy (só servidor lê)`);
}
const retPriv = await um(`select has_function_privilege('anon', 'public.wa_retencao_limpar(timestamptz)', 'execute') a, has_function_privilege('authenticated', 'public.wa_retencao_limpar(timestamptz)', 'execute') b, has_function_privilege('service_role', 'public.wa_retencao_limpar(timestamptz)', 'execute') c`);
igual([retPriv.a, retPriv.b, retPriv.c], [false, false, true], 'wa_retencao_limpar: só service_role executa');
const exec = await q(`select has_function_privilege('anon', 'public.wa_autorizar_envio(text,text,text,text,uuid)', 'execute') a, has_function_privilege('authenticated', 'public.wa_segredos()', 'execute') b`);
igual([exec[0].a, exec[0].b], [false, false], 'anon/authenticated não executam o guarda nem leem segredos');

await db.close();
console.log(`PASSOU: ${checks} verificações — regras de envio do WhatsApp provadas no Postgres.`);
