/**
 * WhatsApp Cloud API multi-número (worker/src/whatsappCloud.js).
 *     node worker/scripts/teste-whatsapp-cloud.js
 * Exit 0 = passou; 1 = falhou.
 * Tranca: assinatura X-Hub-Signature-256 · verificação do webhook · roteamento por phone_number_id ·
 * rotas internas fechadas sem segredo/bearer certo · OK humano usa outro token · guardas viram HTTP
 * (409/429) e a Meta NÃO é chamada quando recusado · resultado da Meta é gravado · LOG sem dado pessoal.
 */
import assert from 'node:assert/strict';
import { FRASE_IA } from '../src/passagemHumano.js';
import {
  handleWhatsappAprovar,
  handleWhatsappEnviar,
  handleWhatsappFila,
  handleWhatsappWebhook,
  igualConstante,
  limparCacheSegredos,
  normalizarWebhook,
  rotearWhatsapp,
  verificarAssinaturaMeta,
} from '../src/whatsappCloud.js';

let ok = 0;
async function caso(nome, fn) {
  limparCacheSegredos();
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

const enc = new TextEncoder();
async function assinar(segredo, corpo) {
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(corpo)));
  return `sha256=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const SEGREDOS = {
  verify_token: 'verifica-token-123',
  app_secret: 'app-secret-super-secreto-1',
  envio_token: 'envio-token-abcdefghij-1',
  aprovacao_token: 'aprov-token-abcdefghij-1',
};
const ENV = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456' };
const TEL = '5511987654321';
const TEXTO_PRIVADO = 'quero um orçamento de ar condicionado em Pinheiros';
const NOME_PRIVADO = 'Maria da Silva Teste';
const TOKEN_META = 'EAAG-token-da-meta-nunca-no-log-0123456789';

/** Supabase + Graph falsos. `rpcs` sobrescreve o retorno de cada função; `graph` o da Meta. */
function mundo({ segredos = SEGREDOS, rpcs = {}, graph } = {}) {
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const corpo = init.body ? JSON.parse(init.body) : null;
    chamadas.push({ url: u, corpo, headers: init.headers || {} });
    if (u.startsWith('https://graph.facebook.com/')) {
      const r = graph ? await graph(u, corpo, init) : { status: 200, json: { messages: [{ id: 'wamid.ENVIADA01' }] } };
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    const nome = u.split('/rpc/')[1];
    if (nome === 'wa_segredos') return new Response(JSON.stringify(segredos), { status: 200 });
    const f = rpcs[nome];
    const r = f ? await f(corpo) : null;
    if (r && r.__status) return new Response('{}', { status: r.__status });
    return new Response(r === undefined || r === null ? null : JSON.stringify(r), { status: r === undefined || r === null ? 204 : 200 });
  };
  return { fetchImpl, chamadas, rpc: (n) => chamadas.filter((c) => c.url.endsWith(`/rpc/${n}`)) };
}

function mensagensMeta({ phoneNumberId = '1162487800287754', itens }) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: '2107349913458786', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '551194172-7487', phone_number_id: phoneNumberId },
      contacts: [{ wa_id: TEL, profile: { name: NOME_PRIVADO } }],
      ...itens,
    } }] }],
  };
}

async function postWebhook(m, payload, { assinatura, corpoBruto } = {}) {
  const raw = corpoBruto ?? JSON.stringify(payload);
  const sig = assinatura === undefined ? await assinar(SEGREDOS.app_secret, raw) : assinatura;
  const headers = { 'Content-Type': 'application/json' };
  if (sig) headers['X-Hub-Signature-256'] = sig;
  const req = new Request('https://x.test/whatsapp/webhook', { method: 'POST', headers, body: raw });
  return handleWhatsappWebhook(req, ENV, { fetchImpl: m.fetchImpl });
}

const logs = [];
const logOriginal = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };

try {
  console.log = logOriginal;
  console.log('WhatsApp Cloud API multi-número');
  console.log = (...a) => { logs.push(a.join(' ')); };

  // ─── assinatura ────────────────────────────────────────────────
  await caso('assinatura: válida passa; adulterada, sem cabeçalho, formato errado e segredo curto não', async () => {
    const raw = '{"a":1}';
    const sig = await assinar(SEGREDOS.app_secret, raw);
    assert.equal(await verificarAssinaturaMeta(raw, sig, SEGREDOS.app_secret), true);
    assert.equal(await verificarAssinaturaMeta('{"a":2}', sig, SEGREDOS.app_secret), false);
    assert.equal(await verificarAssinaturaMeta(raw, null, SEGREDOS.app_secret), false);
    assert.equal(await verificarAssinaturaMeta(raw, sig.replace('sha256=', 'sha1='), SEGREDOS.app_secret), false);
    assert.equal(await verificarAssinaturaMeta(raw, sig, 'curto'), false);
    assert.equal(await verificarAssinaturaMeta(raw, sig, 'outro-app-secret-qualquer-1'), false);
    assert.equal(await igualConstante('abc', 'abc'), true);
    assert.equal(await igualConstante('abc', 'abd'), false);
    assert.equal(await igualConstante('', ''), false);
  });

  // ─── verificação GET ───────────────────────────────────────────
  await caso('GET: token certo devolve o desafio em texto; errado/modo errado/desafio estranho/sem segredo recusam', async () => {
    const m = mundo();
    const get = (q) => handleWhatsappWebhook(new Request(`https://x.test/whatsapp/webhook?${q}`), ENV, { fetchImpl: m.fetchImpl });
    const certo = await get('hub.mode=subscribe&hub.verify_token=verifica-token-123&hub.challenge=1158201444');
    assert.equal(certo.status, 200);
    assert.equal(await certo.text(), '1158201444');
    assert.equal((await get('hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1')).status, 403);
    assert.equal((await get('hub.mode=unsubscribe&hub.verify_token=verifica-token-123&hub.challenge=1')).status, 403);
    assert.equal((await get('hub.mode=subscribe&hub.verify_token=verifica-token-123&hub.challenge=<script>')).status, 400);
    limparCacheSegredos();
    const sem = mundo({ segredos: { ...SEGREDOS, verify_token: null } });
    const r = await handleWhatsappWebhook(new Request('https://x.test/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1'), ENV, { fetchImpl: sem.fetchImpl });
    assert.equal(r.status, 503);
  });

  // ─── POST: autenticação do corpo ───────────────────────────────
  await caso('POST: sem assinatura, assinatura errada e sem app secret NÃO gravam nada', async () => {
    const m = mundo();
    const p = mensagensMeta({ itens: { messages: [{ id: 'wamid.A1', from: TEL, type: 'text', timestamp: '1790000000', text: { body: 'oi' } }] } });
    assert.equal((await postWebhook(m, p, { assinatura: '' })).status, 403);
    assert.equal((await postWebhook(m, p, { assinatura: `sha256=${'0'.repeat(64)}` })).status, 403);
    assert.equal(m.rpc('wa_registrar_entradas').length, 0);
    limparCacheSegredos();
    const m2 = mundo({ segredos: { ...SEGREDOS, app_secret: null } });
    assert.equal((await postWebhook(m2, p)).status, 503);
    assert.equal(m2.rpc('wa_registrar_entradas').length, 0);
  });
  await caso('POST: corpo grande 413; JSON inválido (assinado) 400; objeto que não é do WhatsApp 200 ignorado', async () => {
    const m = mundo();
    const grande = JSON.stringify({ lixo: 'x'.repeat(1024 * 1024 + 10) });
    assert.equal((await postWebhook(m, null, { corpoBruto: grande })).status, 413);
    assert.equal((await postWebhook(m, null, { corpoBruto: '{nao-json' })).status, 400);
    const r = await postWebhook(m, { object: 'page', entry: [] });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ignorado, true);
  });

  // ─── POST: roteamento e gravação ───────────────────────────────
  await caso('POST: agrupa por phone_number_id, ignora reação, grava status e responde 200 com contagens', async () => {
    const m = mundo({ rpcs: {
      wa_registrar_entradas: ({ p_phone_number_id }) => (p_phone_number_id === '1162487800287754'
        ? { registradas: 1, duplicadas: 0, saiu: 0, ignoradas: 0 }
        : { registradas: 0, duplicadas: 0, saiu: 0, ignoradas: 1, motivo: 'numero_inativo' }),
      wa_registrar_statuses: () => 1,
    } });
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'w', changes: [
        { field: 'messages', value: { metadata: { phone_number_id: '1162487800287754' }, contacts: [{ wa_id: TEL, profile: { name: NOME_PRIVADO } }],
          messages: [
            { id: 'wamid.A1', from: TEL, type: 'text', timestamp: '1790000000', text: { body: TEXTO_PRIVADO } },
            { id: 'wamid.A2', from: TEL, type: 'reaction', timestamp: '1790000001', reaction: { emoji: '👍' } },
            { id: 'wamid.A3', from: TEL, type: 'button', timestamp: '1790000002', button: { text: 'SAIR' } },
          ],
          statuses: [{ id: 'wamid.ENV1', status: 'delivered' }, { id: 'wamid.ENV2', status: 'failed', errors: [{ code: 131047 }] }] } },
        { field: 'messages', value: { metadata: { phone_number_id: '999999999' }, messages: [{ id: 'wamid.B1', from: TEL, type: 'text', text: { body: 'oi' } }] } },
        { field: 'account_update', value: { evento: 'ignorar' } },
      ] }],
    };
    const r = await postWebhook(m, payload);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.registradas, 1);
    assert.equal(j.status, 1);
    assert.ok(j.ignoradas >= 2, 'reação + número inativo contam como ignoradas');
    const regs = m.rpc('wa_registrar_entradas');
    assert.equal(regs.length, 2);
    assert.deepEqual(regs.map((c) => c.corpo.p_phone_number_id).sort(), ['1162487800287754', '999999999']);
    const itens = regs.find((c) => c.corpo.p_phone_number_id === '1162487800287754').corpo.p_itens;
    assert.deepEqual(itens.map((i) => i.id), ['wamid.A1', 'wamid.A3']);
    assert.equal(itens[0].perfil, NOME_PRIVADO);
    assert.equal(itens[1].texto, 'SAIR');
    assert.deepEqual(m.rpc('wa_registrar_statuses')[0].corpo.p_itens, [
      { id: 'wamid.ENV1', estado: 'delivered', codigo: null },
      { id: 'wamid.ENV2', estado: 'failed', codigo: '131047' },
    ]);
  });
  await caso('POST: falha do banco responde 500 (a Meta reenvia; a gravação é idempotente)', async () => {
    const m = mundo({ rpcs: { wa_registrar_entradas: () => ({ __status: 500 }) } });
    const p = mensagensMeta({ itens: { messages: [{ id: 'wamid.A1', from: TEL, type: 'text', text: { body: 'oi' } }] } });
    assert.equal((await postWebhook(m, p)).status, 500);
  });
  await caso('POST: corpo VAZIO do banco (status/entradas) é "não sei" → 500, nunca zero (a Meta reenvia)', async () => {
    const comStatus = mensagensMeta({ itens: { statuses: [{ id: 'wamid.ENV1', status: 'delivered' }] } });
    const m1 = mundo({ rpcs: { wa_registrar_statuses: () => null } });
    assert.equal((await postWebhook(m1, comStatus)).status, 500);
    limparCacheSegredos();
    const comMsg = mensagensMeta({ itens: { messages: [{ id: 'wamid.A1', from: TEL, type: 'text', text: { body: 'oi' } }] } });
    for (const estranho of [null, {}, { registradas: 'x', duplicadas: 0, saiu: 0, ignoradas: 0 }, { registradas: -1, duplicadas: 0, saiu: 0, ignoradas: 0 }]) {
      limparCacheSegredos();
      const m2 = mundo({ rpcs: { wa_registrar_entradas: () => estranho } });
      assert.equal((await postWebhook(m2, comMsg)).status, 500, JSON.stringify(estranho));
    }
  });
  await caso('POST: 250 mensagens e 450 status são fatiados em lotes (≤100 e ≤200) e NADA é descartado', async () => {
    const msgs = Array.from({ length: 250 }, (_, i) => ({ id: `wamid.M${String(i).padStart(5, '0')}`, from: TEL, type: 'text', timestamp: '1790000000', text: { body: 'oi' } }));
    const sts = Array.from({ length: 450 }, (_, i) => ({ id: `wamid.S${String(i).padStart(5, '0')}`, status: 'delivered' }));
    const m = mundo({ rpcs: {
      wa_registrar_entradas: ({ p_itens }) => ({ registradas: p_itens.length, duplicadas: 0, saiu: 0, ignoradas: 0 }),
      wa_registrar_statuses: ({ p_itens }) => p_itens.length,
    } });
    const r = await postWebhook(m, mensagensMeta({ itens: { messages: msgs, statuses: sts } }));
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual([j.registradas, j.status], [250, 450]);
    const lotesE = m.rpc('wa_registrar_entradas').map((c) => c.corpo.p_itens.length);
    const lotesS = m.rpc('wa_registrar_statuses').map((c) => c.corpo.p_itens.length);
    assert.deepEqual(lotesE, [100, 100, 50]);
    assert.deepEqual(lotesS, [200, 200, 50]);
    const ids = m.rpc('wa_registrar_entradas').flatMap((c) => c.corpo.p_itens.map((i) => i.id));
    assert.equal(new Set(ids).size, 250, 'nenhuma mensagem perdida nem duplicada');
  });
  await caso('POST: acima do teto de chamadas por webhook grava o que cabe e responde 500 (a Meta reenvia; idempotente)', async () => {
    const msgs = Array.from({ length: 100 * 45 }, (_, i) => ({ id: `wamid.G${String(i).padStart(6, '0')}`, from: TEL, type: 'text', timestamp: '1790000000', text: { body: 'x' } }));
    const m = mundo({ rpcs: { wa_registrar_entradas: ({ p_itens }) => ({ registradas: p_itens.length, duplicadas: 0, saiu: 0, ignoradas: 0 }) } });
    const r = await postWebhook(m, mensagensMeta({ itens: { messages: msgs } }));
    assert.equal(r.status, 500);
    assert.equal(m.rpc('wa_registrar_entradas').length, 40);
  });
  await caso('normalizarWebhook: phone_number_id inválido é ignorado e contado', () => {
    const n = normalizarWebhook(mensagensMeta({ phoneNumberId: 'abc', itens: { messages: [{ id: 'wamid.A1', from: TEL, type: 'text' }] } }));
    assert.equal(n.porNumero.size, 0);
    assert.equal(n.ignoradas, 1);
    assert.equal(normalizarWebhook(null).valido, false);
  });

  // ─── Rotas internas: fechadas sem segredo certo ────────────────
  async function enviar(m, corpo, bearer = SEGREDOS.envio_token) {
    const headers = { 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    return handleWhatsappEnviar(new Request('https://x.test/whatsapp/enviar', { method: 'POST', headers, body: JSON.stringify(corpo) }), ENV, { fetchImpl: m.fetchImpl });
  }
  const RPC_OK = {
    wa_numero_ativo: () => ({ phone_number_id: '1162487800287754', marca: 'OLLI' }),
    wa_autorizar_envio: () => ({ pode: true, motivo: 'liberado', envio_id: 77, telefone: TEL }),
    wa_token_numero: () => TOKEN_META,
    wa_concluir_envio: () => null,
  };
  const TEXTO = { phone_number_id: '1162487800287754', para: '(11) 98765-4321', tipo: 'texto', texto: 'Olá! Segue o orçamento.' };

  await caso('enviar: sem bearer, bearer errado e bearer de APROVAÇÃO são recusados; sem segredo cadastrado = 503', async () => {
    const m = mundo({ rpcs: RPC_OK });
    assert.equal((await enviar(m, TEXTO, null)).status, 401);
    assert.equal((await enviar(m, TEXTO, 'bearer-errado-123456789')).status, 401);
    assert.equal((await enviar(m, TEXTO, SEGREDOS.aprovacao_token)).status, 401);
    assert.equal(m.rpc('wa_autorizar_envio').length, 0);
    assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
    limparCacheSegredos();
    const sem = mundo({ segredos: { ...SEGREDOS, envio_token: null }, rpcs: RPC_OK });
    assert.equal((await enviar(sem, TEXTO)).status, 503);
  });
  await caso('enviar: guarda recusou (SAIR, sem OK humano, fora da janela, teto) = 409 e a Meta NÃO é chamada', async () => {
    for (const motivo of ['nao_contatar', 'primeiro_contato_sem_ok_humano', 'fora_da_janela_use_template', 'teto_diario', 'numero_inativo']) {
      limparCacheSegredos();
      const m = mundo({ rpcs: { ...RPC_OK, wa_autorizar_envio: () => ({ pode: false, motivo }) } });
      const r = await enviar(m, TEXTO);
      assert.equal(r.status, 409, motivo);
      assert.equal((await r.json()).motivo, motivo);
      assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0, `${motivo}: Meta não pode ser chamada`);
    }
  });
  await caso('enviar: intervalo entre templates = 429 com Retry-After', async () => {
    const m = mundo({ rpcs: { ...RPC_OK, wa_autorizar_envio: () => ({ pode: false, motivo: 'aguarde', aguarde_s: 95 }) } });
    const r = await enviar(m, { ...TEXTO, tipo: 'template', template: 'boas_vindas_olli' });
    assert.equal(r.status, 429);
    assert.equal(r.headers.get('retry-after'), '95');
    assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
  });
  await caso('enviar: número desconhecido/inativo e tipo inválido não chegam ao guarda', async () => {
    const m = mundo({ rpcs: { ...RPC_OK, wa_numero_ativo: () => null } });
    assert.equal((await enviar(m, TEXTO)).status, 409);
    assert.equal((await enviar(m, { ...TEXTO, tipo: 'audio' })).status, 400);
    assert.equal(m.rpc('wa_autorizar_envio').length, 0);
  });
  await caso('enviar: texto liberado vai à Graph API com o token do número e grava wamid; token nunca volta na resposta', async () => {
    const m = mundo({ rpcs: RPC_OK });
    const r = await enviar(m, TEXTO);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual({ ok: j.ok, envio_id: j.envio_id, wa_message_id: j.wa_message_id }, { ok: true, envio_id: 77, wa_message_id: 'wamid.ENVIADA01' });
    const g = m.chamadas.find((c) => c.url.includes('graph.facebook.com'));
    assert.equal(g.url, 'https://graph.facebook.com/v23.0/1162487800287754/messages');
    assert.equal(g.headers.Authorization, `Bearer ${TOKEN_META}`);
    assert.deepEqual(g.corpo, { messaging_product: 'whatsapp', recipient_type: 'individual', to: TEL, type: 'text', text: { body: 'Olá! Segue o orçamento.', preview_url: false } });
    assert.deepEqual(m.rpc('wa_concluir_envio')[0].corpo, { p_envio_id: 77, p_wa_message_id: 'wamid.ENVIADA01', p_codigo_falha: null });
    assert.equal(JSON.stringify(j).includes(TOKEN_META), false);
    // O guarda recebeu o telefone BRUTO e o tipo; a normalização é do banco.
    assert.equal(m.rpc('wa_autorizar_envio')[0].corpo.p_telefone, '(11) 98765-4321');
  });
  await caso('enviar: template monta o corpo certo; marca resolve o número; componentes inválidos = 400 e reserva é fechada', async () => {
    const m = mundo({ rpcs: RPC_OK });
    const r = await enviar(m, { marca: 'OLLI', para: TEL, tipo: 'template', template: 'boas_vindas_olli', componentes: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }] });
    assert.equal(r.status, 200);
    const g = m.chamadas.find((c) => c.url.includes('graph.facebook.com'));
    assert.equal(g.corpo.type, 'template');
    assert.deepEqual(g.corpo.template.language, { code: 'pt_BR' });
    assert.equal(g.corpo.template.name, 'boas_vindas_olli');
    assert.deepEqual(m.rpc('wa_numero_ativo')[0].corpo, { p_phone_number_id: null, p_marca: 'OLLI' });
    const ruim = mundo({ rpcs: RPC_OK });
    const r2 = await enviar(ruim, { ...TEXTO, tipo: 'template', template: 'x', componentes: 'nao-lista' });
    assert.equal(r2.status, 400);
    assert.equal(ruim.rpc('wa_concluir_envio')[0].corpo.p_codigo_falha, 'payload_invalido');
    assert.equal(ruim.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
  });
  await caso('enviar: erro da Meta = 502 e a falha é gravada só com o CÓDIGO; sem token do número = 503 sem chamar a Meta', async () => {
    const m = mundo({ rpcs: RPC_OK, graph: () => ({ status: 400, json: { error: { code: 131047, message: `Re-engagement message to ${TEL}` } } }) });
    const r = await enviar(m, TEXTO);
    assert.equal(r.status, 502);
    assert.equal((await r.json()).codigo, '131047');
    assert.equal(m.rpc('wa_concluir_envio')[0].corpo.p_codigo_falha, '131047');
    limparCacheSegredos();
    const sem = mundo({ rpcs: { ...RPC_OK, wa_token_numero: () => null } });
    assert.equal((await enviar(sem, TEXTO)).status, 503);
    assert.equal(sem.rpc('wa_concluir_envio')[0].corpo.p_codigo_falha, 'sem_token');
    assert.equal(sem.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
  });

  // ─── OK humano e fila ──────────────────────────────────────────
  await caso('aprovar: só o token de APROVAÇÃO serve (o de envio não); registra quem aprovou', async () => {
    const m = mundo({ rpcs: { ...RPC_OK, wa_aprovar_primeiro_contato: () => ({ ok: true }) } });
    const chamar = (bearer) => handleWhatsappAprovar(new Request('https://x.test/whatsapp/aprovar', {
      method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ marca: 'OLLI', telefone: TEL, por: 'Igor' }),
    }), ENV, { fetchImpl: m.fetchImpl });
    assert.equal((await chamar(SEGREDOS.envio_token)).status, 401);
    assert.equal(m.rpc('wa_aprovar_primeiro_contato').length, 0);
    assert.equal((await chamar(SEGREDOS.aprovacao_token)).status, 200);
    assert.deepEqual(m.rpc('wa_aprovar_primeiro_contato')[0].corpo, { p_phone_number_id: '1162487800287754', p_telefone: TEL, p_por: 'Igor' });
  });
  await caso('fila: lista exige bearer; atualizar valida id/estado', async () => {
    const itens = [{ id: 5, telefone: TEL, texto: TEXTO_PRIVADO, estado: 'novo' }];
    const m = mundo({ rpcs: { wa_fila_entrada: () => itens, wa_fila_atualizar: () => true } });
    const get = (bearer) => handleWhatsappFila(new Request('https://x.test/whatsapp/fila', { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} }), ENV, { fetchImpl: m.fetchImpl });
    assert.equal((await get(null)).status, 401);
    const r = await get(SEGREDOS.envio_token);
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).itens, itens);
    const post = (corpo) => handleWhatsappFila(new Request('https://x.test/whatsapp/fila/atualizar', {
      method: 'POST', headers: { Authorization: `Bearer ${SEGREDOS.envio_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    }), ENV, { fetchImpl: m.fetchImpl });
    assert.equal((await post({ id: 5, estado: 'resolvido', atribuido_a: 'Bruno' })).status, 200);
    assert.equal((await post({ id: 5, estado: 'novo' })).status, 400);
    assert.equal((await post({ id: 'x', estado: 'resolvido' })).status, 400);
  });

  await caso('fila: corpo vazio do banco = 503 (erro nunca vira lista vazia); fila vazia de verdade [] = 200', async () => {
    const get = (m) => handleWhatsappFila(new Request('https://x.test/whatsapp/fila', { headers: { Authorization: `Bearer ${SEGREDOS.envio_token}` } }), ENV, { fetchImpl: m.fetchImpl });
    assert.equal((await get(mundo({ rpcs: { wa_fila_entrada: () => null } }))).status, 503);
    limparCacheSegredos();
    const vazia = await get(mundo({ rpcs: { wa_fila_entrada: () => [] } }));
    assert.equal(vazia.status, 200);
    assert.deepEqual((await vazia.json()).itens, []);
    limparCacheSegredos();
    const m = mundo({ rpcs: { wa_fila_atualizar: () => null } });
    const post = await handleWhatsappFila(new Request('https://x.test/whatsapp/fila/atualizar', {
      method: 'POST', headers: { Authorization: `Bearer ${SEGREDOS.envio_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 5, estado: 'resolvido' }),
    }), ENV, { fetchImpl: m.fetchImpl });
    assert.equal(post.status, 503, 'atualizar com corpo vazio = não sei, não "404 não achou"');
  });
  await caso('roteador: só /whatsapp/* conhecidas; qualquer outra devolve null', () => {
    const m = mundo();
    assert.equal(rotearWhatsapp(new Request('https://x.test/whatsapp/nada'), ENV, { fetchImpl: m.fetchImpl }), null);
    assert.notEqual(rotearWhatsapp(new Request('https://x.test/whatsapp/webhook'), ENV, { fetchImpl: m.fetchImpl }), null);
  });

  // ─── P0-34: frase só no gatilho ia ─────────────────────────────
  const RPC_FRASE = {
    wa_autorizar_envio: () => ({ pode: true, motivo: 'liberado', envio_id: 91, telefone: TEL }),
    wa_token_numero: () => TOKEN_META,
    wa_concluir_envio: () => null,
  };
  await caso('POST: só o motivo ia manda a frase; o corpo da Meta não leva o texto da pessoa', async () => {
    const textoPessoa = 'Você é robô?';
    const segredo = 'teste-falso-000';
    const m = mundo({ rpcs: {
      ...RPC_FRASE,
      wa_registrar_entradas: () => ({
        registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0,
        respostas: [{ telefone: TEL, texto: segredo }],
      }),
    } });
    const p = mensagensMeta({ itens: { messages: [{ id: 'wamid.IA1', from: TEL, type: 'text', timestamp: '1790000000', text: { body: textoPessoa } }] } });
    const r = await postWebhook(m, p);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.respostas_ia, 1);
    const g = m.chamadas.filter((c) => c.url.includes('graph.facebook.com'));
    assert.equal(g.length, 1);
    assert.equal(g[0].corpo.text.body, FRASE_IA);
    assert.equal(g[0].corpo.text.preview_url, false);
    assert.equal(g[0].corpo.to, TEL);
    assert.equal(JSON.stringify(g[0].corpo).includes(textoPessoa), false);
    assert.equal(JSON.stringify(g[0].corpo).includes(segredo), false);
    assert.equal(JSON.stringify(j).includes(TEL), false);
    assert.equal(m.rpc('wa_autorizar_envio')[0].corpo.p_tipo, 'texto');
    assert.equal(m.rpc('wa_autorizar_envio')[0].corpo.p_template, null);
    assert.equal(m.rpc('wa_concluir_envio')[0].corpo.p_codigo_falha, null);
  });
  await caso('POST: preço, contrato, reclamação, dado, incerteza, SAIR, duplicata e número inativo não chamam a Meta', async () => {
    const amostras = [
      ['preco', { registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [] }, 'Consegue fazer por 20 reais por mês?'],
      ['contrato', { registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [] }, 'Me manda o contrato e a nota fiscal.'],
      ['reclamacao', { registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [] }, 'Vou no Procon. Isso foi um absurdo.'],
      ['dado', { registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [] }, 'Segue a senha do meu banco: teste-falso-000.'],
      ['incerteza', { registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [] }, 'então, qual é o prazo?'],
      ['sair', { registradas: 1, duplicadas: 0, saiu: 1, humano: 0, ignoradas: 0, respostas: [] }, 'SAIR'],
      ['duplicata', { registradas: 0, duplicadas: 1, saiu: 0, humano: 0, ignoradas: 0, respostas: [] }, 'Você é robô?'],
      ['inativo', { registradas: 0, duplicadas: 0, saiu: 0, humano: 0, ignoradas: 1, motivo: 'numero_inativo', respostas: [{ telefone: TEL }] }, 'Você é robô?'],
      ['sem-chave', { registradas: 1, duplicadas: 0, saiu: 0, humano: 0, ignoradas: 0 }, 'oi'],
    ];
    for (const [nome, rpc, texto] of amostras) {
      limparCacheSegredos();
      const m = mundo({ rpcs: { ...RPC_FRASE, wa_registrar_entradas: () => rpc } });
      const p = mensagensMeta({ itens: { messages: [{ id: `wamid.${nome}`, from: TEL, type: 'text', timestamp: '1790000000', text: { body: texto } }] } });
      const r = await postWebhook(m, p);
      assert.equal(r.status, 200, nome);
      assert.equal((await r.json()).respostas_ia, 0, nome);
      assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0, nome);
      assert.equal(m.rpc('wa_autorizar_envio').length, 0, nome);
    }
  });
  await caso('POST: guarda recusou a frase ia, a Meta não é chamada e o webhook segue 200', async () => {
    const m = mundo({ rpcs: {
      wa_registrar_entradas: () => ({ registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [{ telefone: TEL }] }),
      wa_autorizar_envio: () => ({ pode: false, motivo: 'numero_inativo' }),
      wa_token_numero: () => TOKEN_META,
    } });
    const r = await postWebhook(m, mensagensMeta({ itens: { messages: [{ id: 'wamid.IA2', from: TEL, type: 'text', text: { body: 'Você é robô?' } }] } }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).respostas_ia, 0);
    assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
    assert.equal(m.rpc('wa_token_numero').length, 0);
  });
  await caso('POST: erro da Meta na frase ia não derruba o webhook e o log fica sem o telefone', async () => {
    const m = mundo({
      rpcs: {
        wa_registrar_entradas: () => ({ registradas: 1, duplicadas: 0, saiu: 0, humano: 1, ignoradas: 0, respostas: [{ telefone: TEL }] }),
        ...RPC_FRASE,
      },
      graph: () => ({ status: 400, json: { error: { code: 131047, message: `to ${TEL}` } } }),
    });
    const r = await postWebhook(m, mensagensMeta({ itens: { messages: [{ id: 'wamid.IA3', from: TEL, type: 'text', text: { body: 'Você é robô?' } }] } }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).respostas_ia, 0);
    assert.equal(m.rpc('wa_concluir_envio')[0].corpo.p_codigo_falha, '131047');
  });
  await caso('POST: acima de 5 frases ia no mesmo webhook, só as 5 primeiras saem', async () => {
    const respostas = Array.from({ length: 6 }, () => ({ telefone: TEL }));
    const m = mundo({ rpcs: {
      ...RPC_FRASE,
      wa_registrar_entradas: () => ({ registradas: 6, duplicadas: 0, saiu: 0, humano: 6, ignoradas: 0, respostas }),
    } });
    const r = await postWebhook(m, mensagensMeta({ itens: { messages: [{ id: 'wamid.IA4', from: TEL, type: 'text', text: { body: 'Você é robô?' } }] } }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).respostas_ia, 5);
    assert.equal(m.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 5);
  });

  // ─── LOG sem dado pessoal ──────────────────────────────────────
  await caso('LOG da execução inteira: sem telefone, nome, texto, token nem segredo', async () => {
    const texto = logs.join('\n');
    assert.ok(texto.includes('whatsapp_webhook'), 'tem de ter logado algo');
    for (const proibido of [TEL, '98765-4321', NOME_PRIVADO, TEXTO_PRIVADO, TOKEN_META, SEGREDOS.app_secret, SEGREDOS.envio_token, SEGREDOS.aprovacao_token, SEGREDOS.verify_token, 'Re-engagement']) {
      assert.equal(texto.includes(proibido), false, `o log vazou: ${proibido.slice(0, 12)}…`);
    }
  });
} finally {
  console.log = logOriginal;
}
console.log(`\nPASSOU: ${ok} casos — WhatsApp Cloud API multi-número`);
