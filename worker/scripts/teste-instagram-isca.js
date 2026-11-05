/**
 * Z-117 — a isca de comentário não chama a Meta no rascunho.
 *     node scripts/teste-instagram-isca.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classificarOficio,
  configPadrao,
  estadoVazio,
  hashId,
  IG_ISCA_VERSION,
  lerEventos,
  montarPedido,
  PALAVRA,
  temPalavra,
  TEXTO_RESPOSTA,
  textoPedeSair,
  tratarWebhook,
  URL_ENTREGA,
} from '../src/instagramIsca.js';

const enc = new TextEncoder();
async function assinar(segredo, corpo) {
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(corpo)));
  return `sha256=${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const IG = '17841400000000021';
const AUTOR = '2323232323232';
const COMMENT = '17865799348089039';
const MEDIA = '17999900000000077';
const AGORA = Date.parse('2026-11-04T15:00:00-03:00');
const SEGREDO = 'app-secret-de-teste-z117-32chars';
const TOKEN = 'token-de-teste-z117-com-quarenta';
const SAL = 'sal-de-teste-z117-nao-env';
const USERNAME = 'pessoa_que_nao_pode_vazar';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

function configLigado() {
  return {
    ...configPadrao(),
    ligado: true,
    contaPermitida: true,
    igId: IG,
    sal: SAL,
  };
}

function payloadComentario(texto, extras = {}) {
  return JSON.stringify({
    object: 'instagram',
    entry: [{
      id: extras.conta ?? IG,
      time: extras.time ?? Math.floor(AGORA / 1000),
      changes: [{
        field: extras.field ?? 'comments',
        value: {
          from: { id: extras.autor ?? AUTOR, username: USERNAME },
          media: { id: extras.media ?? MEDIA, media_product_type: extras.produto ?? 'REELS' },
          id: extras.commentId ?? COMMENT,
          text: texto,
        },
      }],
    }],
  });
}

function payloadMensagem(texto, extras = {}) {
  return JSON.stringify({
    object: 'instagram',
    entry: [{
      id: IG,
      time: Math.floor(AGORA / 1000),
      messaging: [{
        sender: { id: extras.autor ?? AUTOR },
        recipient: { id: IG },
        timestamp: extras.timestamp ?? AGORA,
        message: { mid: extras.mid ?? 'mid-z117-0001', text: texto },
      }],
    }],
  });
}

function fetchQueFalha() {
  return async () => {
    throw new Error('a Meta não pode ser chamada');
  };
}

function fetchMudo(status = 200) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init });
    return { status };
  };
  return { chamadas, fetchImpl };
}

async function post(raw, extras = {}) {
  const assinatura = extras.assinatura ?? await assinar(SEGREDO, raw);
  return tratarWebhook({
    method: 'POST',
    rawBody: raw,
    assinatura,
    appSecret: extras.appSecret ?? SEGREDO,
    config: extras.config ?? configPadrao(),
    estado: extras.estado ?? estadoVazio(),
    agoraMs: AGORA,
    fetchImpl: extras.fetchImpl === undefined ? fetchQueFalha() : extras.fetchImpl,
    token: extras.token ?? TOKEN,
    verifyToken: extras.verifyToken,
    query: extras.query,
  });
}

await caso('versão do rascunho e config desligada', async () => {
  assert.equal(IG_ISCA_VERSION, '2026-11-04.z117');
  const config = configPadrao();
  assert.equal(config.ligado, false);
  assert.equal(config.contaPermitida, false);
  assert.equal(config.igId, '');
  assert.equal(config.sal, '');
});

await caso('a primeira mensagem declara IA, entrega o artigo e não tem preço', async () => {
  assert.equal(PALAVRA, 'MODELO');
  assert.match(TEXTO_RESPOSTA, /IA/);
  assert.match(TEXTO_RESPOSTA, /SAIR/);
  assert.ok(TEXTO_RESPOSTA.includes(URL_ENTREGA));
  assert.equal(/r\$\s?\d|pix|checkout|stripe|wa\.me|garantia|ilimitad/i.test(TEXTO_RESPOSTA), false);
  assert.match(TEXTO_RESPOSTA, /Não é um arquivo para baixar/);
});

await caso('palavra inteira, sem casar modelagem', async () => {
  assert.equal(temPalavra('Quero o MODELO!'), true);
  assert.equal(temPalavra('modelo'), true);
  assert.equal(temPalavra('modelagem de risco'), false);
  assert.equal(temPalavra('só um oi'), false);
});

await caso('SAIR reusa a regra do WhatsApp e não come um pedido', async () => {
  assert.equal(textoPedeSair('SAIR'), true);
  assert.equal(textoPedeSair('não me mande mais'), true);
  assert.equal(textoPedeSair('quero sair'), true);
  assert.equal(textoPedeSair('chega de mensagem'), true);
  assert.equal(textoPedeSair('cancelar'), false);
  assert.equal(textoPedeSair('cancelar pedido'), false);
  assert.equal(textoPedeSair('o orçamento chega amanhã'), false);
  assert.equal(textoPedeSair('MODELO'), false);
});

await caso('ofício vira classe, não texto cru', async () => {
  assert.equal(classificarOficio('elétrica'), 'eletrica');
  assert.equal(classificarOficio('Ar-condicionado'), 'ar_condicionado');
  assert.equal(classificarOficio('obrigado'), null);
  assert.equal(classificarOficio('pintura e gesso'), null);
});

await caso('o leitor do webhook descarta o username', async () => {
  const eventos = lerEventos(JSON.parse(payloadComentario('MODELO')));
  assert.equal(eventos.length, 1);
  assert.equal(JSON.stringify(eventos).includes(USERNAME), false);
  assert.equal(eventos[0].autorId, AUTOR);
  assert.equal(eventos[0].texto, 'MODELO');
});

await caso('rascunho padrão não chama a Meta mesmo com a palavra', async () => {
  const rede = fetchMudo();
  const raw = payloadComentario('Comenta MODELO por favor');
  const r = await post(raw, { fetchImpl: rede.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.enviou, 0);
  assert.equal(r.corpo.motivos.rascunho, 1);
  assert.equal(rede.chamadas.length, 0);
  assert.equal(JSON.stringify(r.corpo).includes(AUTOR), false);
  assert.equal(JSON.stringify(r.corpo).includes(USERNAME), false);
  assert.equal(JSON.stringify(r.corpo).includes(TOKEN), false);
});

await caso('assinatura errada não lê o comentário', async () => {
  const estado = estadoVazio();
  const r = await post(payloadComentario('MODELO'), {
    config: configLigado(),
    estado,
    assinatura: `sha256=${'ab'.repeat(32)}`,
  });
  assert.equal(r.status, 403);
  assert.equal(estado.optout.size, 0);
  assert.equal(estado.respondidos.size, 0);
});

await caso('objeto que não é instagram é ignorado', async () => {
  const raw = JSON.stringify({ object: 'page', entry: [{ id: IG, changes: [{ field: 'comments', value: { text: 'MODELO' } }] }] });
  const r = await post(raw, { config: configLigado() });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.enviou, 0);
  assert.equal(r.corpo.motivos.sem_evento, 1);
});

await caso('Live e comentário velho não geram mensagem', async () => {
  const rede = fetchMudo();
  const aoVivo = await post(payloadComentario('MODELO', { field: 'live_comments' }), {
    config: configLigado(),
    fetchImpl: rede.fetchImpl,
  });
  assert.equal(aoVivo.corpo.motivos.live, 1);
  const velho = await post(payloadComentario('MODELO', { time: Math.floor(AGORA / 1000) - 8 * 24 * 60 * 60 }), {
    config: configLigado(),
    fetchImpl: rede.fetchImpl,
  });
  assert.equal(velho.corpo.motivos.fora_da_janela, 1);
  assert.equal(rede.chamadas.length, 0);
});

await caso('SAIR no comentário grava opt-out e não manda direct', async () => {
  const estado = estadoVazio();
  const rede = fetchMudo();
  const r = await post(payloadComentario('SAIR'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(r.corpo.enviou, 0);
  assert.equal(r.corpo.motivos.optout, 1);
  assert.equal(estado.optout.size, 1);
  const hash = [...estado.optout][0];
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(AUTOR), false);
  assert.equal(rede.chamadas.length, 0);
  const deNovo = await post(payloadComentario('MODELO'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(deNovo.corpo.motivos.optout, 1);
  assert.equal(rede.chamadas.length, 0);
});

await caso('com os três cadeados, um POST oficial e só um', async () => {
  const estado = estadoVazio();
  const rede = fetchMudo();
  const raw = payloadComentario('MODELO');
  const r = await post(raw, { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.enviou, 1);
  assert.equal(rede.chamadas.length, 1);
  const chamada = rede.chamadas[0];
  assert.equal(chamada.url, `https://graph.facebook.com/v23.0/${IG}/messages`);
  assert.equal(chamada.url.includes(TOKEN), false);
  assert.equal(chamada.init.headers.Authorization, `Bearer ${TOKEN}`);
  const body = JSON.parse(chamada.init.body);
  assert.deepEqual(body.recipient, { comment_id: COMMENT });
  assert.equal(body.message.text, TEXTO_RESPOSTA);
  assert.equal(JSON.stringify(body).includes(USERNAME), false);
  const segunda = await post(raw, { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(segunda.corpo.motivos.ja_respondido, 1);
  assert.equal(rede.chamadas.length, 1);
});

await caso('conta não autorizada ou id trocado não envia', async () => {
  const rede = fetchMudo();
  const semConta = await post(payloadComentario('MODELO'), {
    config: { ...configLigado(), contaPermitida: false },
    fetchImpl: rede.fetchImpl,
  });
  assert.equal(semConta.corpo.motivos.conta_nao_autorizada, 1);
  const outra = await post(payloadComentario('MODELO', { conta: '17841400000000099' }), {
    config: configLigado(),
    fetchImpl: rede.fetchImpl,
  });
  assert.equal(outra.corpo.motivos.conta_errada, 1);
  assert.equal(rede.chamadas.length, 0);
});

await caso('sem transporte injetado não usa a rede global', async () => {
  const r = await post(payloadComentario('MODELO'), { config: configLigado(), fetchImpl: null });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.motivos.sem_transporte, 1);
  assert.equal(r.corpo.enviou, 0);
});

await caso('teto de 1 por hora segura a segunda pessoa', async () => {
  const rede = fetchMudo();
  const config = { ...configLigado(), tetoPorHora: 1 };
  const estado = estadoVazio();
  const a = await post(payloadComentario('MODELO', { autor: '11111111111', commentId: '17865799348089001' }), {
    config, estado, fetchImpl: rede.fetchImpl,
  });
  const b = await post(payloadComentario('MODELO', { autor: '22222222222', commentId: '17865799348089002' }), {
    config, estado, fetchImpl: rede.fetchImpl,
  });
  assert.equal(a.corpo.enviou, 1);
  assert.equal(b.corpo.motivos.teto, 1);
  assert.equal(rede.chamadas.length, 1);
});

await caso('resposta da pessoa ganha uma pergunta; a seguinte só guarda o ofício', async () => {
  const estado = estadoVazio();
  const rede = fetchMudo();
  await post(payloadComentario('MODELO'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  const oi = await post(payloadMensagem('oi, recebi'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(oi.corpo.enviou, 1);
  const segunda = JSON.parse(rede.chamadas[1].init.body);
  assert.deepEqual(segunda.recipient, { id: AUTOR });
  assert.match(segunda.message.text, /ofício/);
  assert.match(segunda.message.text, /SAIR/);
  const oficio = await post(payloadMensagem('pintura'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(oficio.corpo.enviou, 0);
  assert.equal(oficio.corpo.motivos.oficio_guardado, 1);
  const hash = await hashId(SAL, AUTOR);
  assert.equal(estado.conversas.get(hash).oficio, 'pintura');
  assert.equal(JSON.stringify([...estado.conversas.values()]).includes('pintura extra'), false);
  assert.equal(rede.chamadas.length, 2);
});

await caso('SAIR no direct confirma uma vez e depois silencia', async () => {
  const estado = estadoVazio();
  const rede = fetchMudo();
  await post(payloadComentario('MODELO'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  const sair = await post(payloadMensagem('quero sair'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(sair.corpo.enviou, 1);
  assert.match(JSON.parse(rede.chamadas[1].init.body).message.text, /Parei/);
  const deNovo = await post(payloadMensagem('MODELO de novo'), { config: configLigado(), estado, fetchImpl: rede.fetchImpl });
  assert.equal(deNovo.corpo.motivos.optout, 1);
  assert.equal(rede.chamadas.length, 2);
});

await caso('direct de quem não comentou a palavra não abre conversa', async () => {
  const rede = fetchMudo();
  const r = await post(payloadMensagem('MODELO'), { config: configLigado(), fetchImpl: rede.fetchImpl });
  assert.equal(r.corpo.motivos.sem_conversa, 1);
  assert.equal(rede.chamadas.length, 0);
});

await caso('host fora da Meta e token na URL são recusados', async () => {
  assert.equal(montarPedido({
    host: 'https://evil.example',
    versao: 'v23.0',
    igId: IG,
    destino: { tipo: 'comentario', id: COMMENT },
    texto: TEXTO_RESPOSTA,
    token: TOKEN,
  }), null);
  const pedido = montarPedido({
    host: 'https://graph.facebook.com',
    versao: 'v23.0',
    igId: IG,
    destino: { tipo: 'comentario', id: COMMENT },
    texto: TEXTO_RESPOSTA,
    token: TOKEN,
  });
  assert.equal(pedido.url.includes('access_token'), false);
  assert.equal(pedido.url.includes(TOKEN), false);
});

await caso('verificação do webhook só devolve o desafio com o token certo', async () => {
  const negado = await tratarWebhook({
    method: 'GET',
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': 'abc123' },
    verifyToken: 'verify-de-teste-z117',
  });
  assert.equal(negado.status, 403);
  const okGet = await tratarWebhook({
    method: 'GET',
    query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-de-teste-z117', 'hub.challenge': 'abc123' },
    verifyToken: 'verify-de-teste-z117',
  });
  assert.equal(okGet.status, 200);
  assert.equal(okGet.corpo, 'abc123');
});

await caso('index.js não registra a rota e o módulo não lê env', async () => {
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../src/instagramIsca.js', import.meta.url), 'utf8');
  assert.equal(index.includes('instagramIsca'), false);
  assert.equal(index.includes('ig_isca'), false);
  assert.equal(src.includes('process.env'), false);
});

await caso('o hash não é o id e não sai sem sal', async () => {
  assert.equal(await hashId('curto', AUTOR), null);
  const hash = await hashId(SAL, AUTOR);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(AUTOR), false);
});

console.log(`\n${ok} casos ok`);
