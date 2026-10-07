/**
 * CAPI server-side (worker/src/anunciosConversoes.js).
 *     node worker/scripts/teste-anuncios-conversoes.js
 * Exit 0 = passou; 1 = falhou.
 * Tranca: e-mail e telefone saem SÓ como SHA-256 (nada em claro no corpo) · formato do telefone ·
 * OrcamentoEnviado = ativação (custom, sem valor) com event_id próprio · token no cabeçalho e NUNCA na URL · rodada vazia gasta 1 subrequest ·
 * resultado errado da Meta não fecha a pendência · LOG sem e-mail, telefone, id de conta nem corpo da Meta.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { detalheSeguroMeta, EVENTO_ATIVACAO, META_PIXEL_ID, montarEventoMeta, processarConversoesAnuncios } from '../src/anunciosConversoes.js';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}
const sha = (t) => createHash('sha256').update(t).digest('hex');

const USER = '3f1c2a9e-7b64-4d0a-9e1f-0a1b2c3d4e5f';
const EMAIL = 'maria.teste@exemplo.com.br';
const TEL = '5511987654321';
const TOKEN = 'EAAG-token-capi-nunca-na-url-0123456789';
const AGORA = new Date('2026-10-07T12:03:00Z');

function pendencia(extra = {}) {
  return {
    event_id: `cadastro-${USER}`,
    evento: 'CompleteRegistration',
    user_id: USER,
    email: EMAIL,
    telefone: TEL,
    event_time: '2026-10-07T11:50:00Z',
    medicao: { ua: 'Mozilla/5.0 (Linux; Android 13) Chrome/129', consentimento: 'sim' },
    origem: { fbp: 'fb.1.1790000000000.123456789', fbc: 'fb.1.1790000000000.AbCdEf' },
    plano: null,
    ...extra,
  };
}

console.log('CAPI server-side');

await caso('cadastro: e-mail, telefone e id da conta vão SÓ como SHA-256; nada em claro no evento', async () => {
  const { evento } = await montarEventoMeta(pendencia(), AGORA.getTime());
  assert.equal(evento.event_name, 'CompleteRegistration');
  assert.equal(evento.event_id, `cadastro-${USER}`);
  assert.deepEqual(evento.user_data.em, [sha(EMAIL)]);
  assert.deepEqual(evento.user_data.ph, [sha(TEL)]);
  assert.deepEqual(evento.user_data.external_id, [sha(USER)]);
  assert.equal(evento.user_data.fbp, 'fb.1.1790000000000.123456789');
  // O UUID da conta aparece em claro SÓ no event_id ('cadastro-<id>'): é o mesmo valor que o Pixel do navegador
  // manda e é o que faz a Meta deduplicar. Tudo o mais tem de estar em hash.
  const { event_id: eventId, ...resto } = evento;
  assert.equal(eventId, `cadastro-${USER}`);
  const texto = JSON.stringify(resto);
  for (const claro of [EMAIL, TEL, '987654321', USER, 'maria']) assert.equal(texto.includes(claro), false, `vazou em claro: ${claro}`);
  assert.equal(evento.event_source_url, 'https://app.olliorcamentos.online/auth/login');
});

await caso('e-mail com maiúsculas e espaço faz o MESMO hash; telefone fora do formato 55+DDD é descartado (não adivinha)', async () => {
  const a = await montarEventoMeta(pendencia({ email: `  ${EMAIL.toUpperCase()}  ` }), AGORA.getTime());
  assert.deepEqual(a.evento.user_data.em, [sha(EMAIL)]);
  for (const ruim of ['11987654321', '+55 11 98765-4321', '551198765', '5511987654321999', '', null, undefined]) {
    const r = await montarEventoMeta(pendencia({ telefone: ruim }), AGORA.getTime());
    assert.equal('ph' in r.evento.user_data, false, `telefone ${JSON.stringify(ruim)} não deveria virar ph`);
  }
  const semEmail = await montarEventoMeta(pendencia({ email: null }), AGORA.getTime());
  assert.equal('em' in semEmail.evento.user_data, false);
});

await caso('OrcamentoEnviado = ativação: evento CUSTOM, event_id próprio, SEM value/currency (não se mistura com o Lead do navegador)', async () => {
  assert.equal(EVENTO_ATIVACAO, 'OrcamentoEnviado');
  assert.notEqual(EVENTO_ATIVACAO, 'Lead', 'o Lead de clique da landing é outro sinal');
  const { evento } = await montarEventoMeta(pendencia({ event_id: `orcamento-enviado-${USER}`, evento: 'OrcamentoEnviado' }), AGORA.getTime());
  assert.equal(evento.event_name, 'OrcamentoEnviado');
  assert.equal(evento.event_id, `orcamento-enviado-${USER}`);
  assert.equal('custom_data' in evento, false, 'sem value/currency/custom_data');
  assert.equal(evento.event_source_url, 'https://app.olliorcamentos.online/');
  const sub = await montarEventoMeta(pendencia({ event_id: `assinatura-${USER}`, evento: 'Subscribe', plano: 'pro' }), AGORA.getTime());
  assert.equal(sub.evento.custom_data.currency, 'BRL');
  assert.equal(sub.evento.custom_data.content_name, 'pro');
  assert.ok(sub.evento.custom_data.value > 0);
});

await caso('sem user agent, evento do futuro e evento com mais de 7 dias são PULADOS (a Meta recusaria)', async () => {
  assert.deepEqual(await montarEventoMeta(pendencia({ medicao: { consentimento: 'sim' } }), AGORA.getTime()), { pular: 'sem_user_agent' });
  assert.deepEqual(await montarEventoMeta(pendencia({ event_time: '2026-10-07T13:00:00Z' }), AGORA.getTime()), { pular: 'fora_da_janela' });
  assert.deepEqual(await montarEventoMeta(pendencia({ event_time: '2026-09-29T11:50:00Z' }), AGORA.getTime()), { pular: 'fora_da_janela' });
});

// ─── Job: rede falsa ────────────────────────────────────────────────────────────
const ENV = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456' };
function rede({ pendencias = [], graph }) {
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    chamadas.push({ url: u, headers: init.headers || {}, corpo: init.body ? JSON.parse(init.body) : null });
    if (u.startsWith('https://graph.facebook.com/')) {
      const r = graph ? graph(u) : { status: 200, json: { events_received: chamadas.at(-1).corpo.data.length, fbtrace_id: 'trace123' } };
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    const nome = u.split('/rpc/')[1];
    if (nome === 'anuncios_conversoes_pendentes') return new Response(JSON.stringify(pendencias), { status: 200 });
    if (nome === 'anuncios_meta_token') return new Response(JSON.stringify(TOKEN), { status: 200 });
    if (nome === 'anuncios_conversoes_registrar') return new Response('1', { status: 200 });
    return new Response('{}', { status: 404 });
  };
  return { fetchImpl, chamadas, rpc: (n) => chamadas.filter((c) => c.url.endsWith(`/rpc/${n}`)) };
}

const logs = [];
const logOriginal = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };
try {
  console.log = logOriginal;
  await caso('rodada fora do minuto 3/13/23… não faz NADA (0 subrequest)', async () => {
    const r = rede({});
    const out = await processarConversoesAnuncios(ENV, { agora: new Date('2026-10-07T12:05:00Z'), fetchImpl: r.fetchImpl });
    assert.equal(out.estado, 'fora_do_horario');
    assert.equal(r.chamadas.length, 0);
  });
  console.log = (...a) => { logs.push(a.join(' ')); };

  await caso('rodada vazia gasta 1 subrequest (só a leitura das pendências)', async () => {
    const r = rede({ pendencias: [] });
    const out = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r.fetchImpl });
    assert.deepEqual([out.estado, out.enviados], ['nada', 0]);
    assert.equal(r.chamadas.length, 1);
  });

  await caso('envio: token do Vault vai no CABEÇALHO, nunca na URL; corpo sem dado em claro; resultado registrado', async () => {
    const r = rede({ pendencias: [pendencia(), pendencia({ event_id: `orcamento-enviado-${USER}`, evento: 'OrcamentoEnviado' })] });
    const out = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r.fetchImpl });
    assert.deepEqual([out.estado, out.enviados], ['ok', 2]);
    const g = r.chamadas.find((c) => c.url.includes('graph.facebook.com'));
    assert.equal(g.url, `https://graph.facebook.com/v23.0/${META_PIXEL_ID}/events`);
    assert.equal(g.url.includes(TOKEN), false);
    assert.equal(g.url.includes('access_token'), false);
    assert.equal(g.headers.Authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(g.corpo.data.map((e) => e.event_name), ['CompleteRegistration', 'OrcamentoEnviado']);
    const claro = JSON.stringify(g.corpo.data.map(({ event_id: _id, ...e }) => e));
    for (const x of [EMAIL, TEL, USER]) assert.equal(claro.includes(x), false);
    const reg = r.rpc('anuncios_conversoes_registrar')[0].corpo.p_itens;
    assert.deepEqual(reg.map((i) => [i.evento, i.estado]), [['CompleteRegistration', 'enviado'], ['OrcamentoEnviado', 'enviado']]);
    assert.equal(r.chamadas.length, 4, 'pendências + token + envio + registro');
  });

  await caso('Meta devolve menos eventos que o enviado (ou erro) = NÃO fecha a pendência (estado erro, tenta de novo)', async () => {
    const r = rede({ pendencias: [pendencia()], graph: () => ({ status: 200, json: { events_received: 0 } }) });
    await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r.fetchImpl });
    assert.equal(r.rpc('anuncios_conversoes_registrar')[0].corpo.p_itens[0].estado, 'erro');
    const r2 = rede({ pendencias: [pendencia()], graph: () => ({ status: 400, json: { error: { message: 'Invalid parameter' } } }) });
    await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r2.fetchImpl });
    assert.equal(r2.rpc('anuncios_conversoes_registrar')[0].corpo.p_itens[0].estado, 'erro');
  });

  await caso('pendências que NÃO são lista (corpo vazio, objeto, HTML) = erro, nunca "nada"; lista vazia = nada', async () => {
    for (const corpo of [null, {}, { erro: 'x' }, '<html>502</html>', 42]) {
      const chamadas = [];
      const fetchImpl = async (url) => {
        chamadas.push(String(url));
        return new Response(corpo === null ? null : JSON.stringify(corpo), { status: corpo === null ? 200 : 200 });
      };
      const out = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl });
      assert.equal(out.estado, 'erro_pendencias', JSON.stringify(corpo));
      assert.equal(chamadas.length, 1);
    }
    const vazio = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: rede({ pendencias: [] }).fetchImpl });
    assert.equal(vazio.estado, 'nada');
  });

  await caso('detalhe gravado no banco: só códigos e números — a mensagem da Meta e o texto de erro de rede NUNCA entram', async () => {
    const msgMeta = `(#100) Invalid parameter user_data.em ${sha(EMAIL)} para maria.teste@exemplo.com.br tel ${TEL}`;
    const r = rede({ pendencias: [pendencia()], graph: () => ({ status: 400, json: { error: { message: msgMeta, code: 100, error_subcode: 2804009, fbtrace_id: 'AbC123' } } }) });
    await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r.fetchImpl });
    const item = r.rpc('anuncios_conversoes_registrar')[0].corpo.p_itens[0];
    assert.equal(item.detalhe, 'HTTP 400 code 100 sub 2804009');
    for (const x of [EMAIL, TEL, sha(EMAIL), 'Invalid parameter']) assert.equal(item.detalhe.includes(x), false);
    // falha de rede: o texto do erro pode carregar URL/dados — vira só "rede"
    const r2 = rede({ pendencias: [pendencia()] });
    const f2 = async (url, init) => (String(url).startsWith('https://graph.facebook.com/') ? Promise.reject(new Error(`fetch failed for ${EMAIL} ${TEL}`)) : r2.fetchImpl(url, init));
    await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: f2 });
    assert.equal(r2.rpc('anuncios_conversoes_registrar')[0].corpo.p_itens[0].detalhe, 'rede');
    // sucesso: só trace sanitizado e contagem
    assert.equal(detalheSeguroMeta({ status: 200, json: { events_received: 2, fbtrace_id: 'ok_Trace-9' } }), 'fbtrace ok_Trace-9 recebidos 2');
    assert.equal(detalheSeguroMeta({ status: 200, json: { events_received: 1, fbtrace_id: 'ruim <script> com espaço' } }), 'fbtrace - recebidos 1');
    assert.equal(detalheSeguroMeta({ status: 500, json: null }), 'HTTP 500');
  });

  await caso('sem user agent: pendência pulada sem chamar a Meta', async () => {
    const r = rede({ pendencias: [pendencia({ medicao: {} })] });
    const out = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: r.fetchImpl });
    assert.equal(out.resultado[0].estado, 'pulado');
    assert.equal(r.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
  });

  await caso('sem token no Vault: DESLIGADA e diz isso (nunca finge que enviou)', async () => {
    const r = rede({ pendencias: [pendencia()] });
    const f = async (url, init) => (String(url).endsWith('/rpc/anuncios_meta_token') ? new Response('null', { status: 200 }) : r.fetchImpl(url, init));
    const out = await processarConversoesAnuncios(ENV, { agora: AGORA, fetchImpl: f });
    assert.equal(out.estado, 'desligado');
    assert.equal(r.chamadas.filter((c) => c.url.includes('graph.facebook.com')).length, 0);
  });

  await caso('LOG de tudo: só contagens — sem e-mail, telefone, id de conta, token nem corpo da Meta', async () => {
    const texto = logs.join('\n');
    assert.ok(texto.includes('[anuncios]'), 'tem de ter logado algo');
    for (const proibido of [EMAIL, TEL, '987654321', USER, TOKEN, 'Invalid parameter', 'trace123']) {
      assert.equal(texto.includes(proibido), false, `o log vazou: ${proibido.slice(0, 14)}…`);
    }
  });
} finally {
  console.log = logOriginal;
}
console.log(`\nPASSOU: ${ok} casos — CAPI server-side`);
