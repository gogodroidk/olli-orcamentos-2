/**
 * Teste da TRILHA do webhook da AbacatePay em `webhook_events` (T-012).
 *
 *     node worker/scripts/teste-abacate-webhook.js
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita o roteador REAL (`handleAbacate`) contra FALSOS em memória (fetch
 * trocado): Supabase (`webhook_events` com índice único (origem,event_id) → 409,
 * `assinaturas`) e a API v2 da AbacatePay (`transparents/get` e `/check`).
 *
 * O que está trancado aqui:
 *  1. Toda chamada AUTENTICADA vira UMA linha origem 'abacatepay' com tipo, id
 *     externo (`log_…`), desfecho (ok / ignorado / erro + motivo curto) e datas.
 *  2. Chamada sem o segredo (401) não grava nada.
 *  3. IDEMPOTÊNCIA: o mesmo evento 2x = uma linha, e o plano é concedido uma vez
 *     só (nem por evento repetido, nem por outro evento da mesma cobrança).
 *  4. Erro (AbacatePay fora) fica 'falhou' e o reenvio REPROCESSA.
 *  5. Falha ao gravar a trilha NUNCA derruba o pagamento.
 *  6. O `webhookSecret` (e dado do cliente) nunca vai para o banco nem para o log.
 */
import { handleAbacate } from '../src/abacate.js';

let falhas = 0;
let passes = 0;

function checar(nome, real, esperado) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const SUPA = 'https://supa.teste';
const SEGREDO = 'segredo-do-webhook-NUNCA-NO-BANCO';
const USER = '6f1c2d3e-4a5b-4c6d-8e7f-901234567890';
const CRIADA = new Date(Date.now() - 10 * 60_000).toISOString();

const env = {
  SUPABASE_URL: SUPA,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falsa',
  ABACATEPAY_API_KEY: 'abc_live_chave_falsa',
  ABACATE_WEBHOOK_SECRET: SEGREDO,
  ABACATEHOOK_RL: { limit: async () => ({ success: true }) },
};

// ── estado dos falsos ────────────────────────────────────────
const db = { eventos: new Map(), assinaturas: new Map(), upserts: 0 };
const abacate = { cobrancas: new Map(), fora: false, chamadas: 0 };
/** Falha forçada só na trilha (origem 'abacatepay'): 'http500' | 'excecao' | null. */
let trilhaQuebrada = null;
let corposGravados = [];
let logs = [];

function reset() {
  db.eventos = new Map();
  db.assinaturas = new Map();
  db.upserts = 0;
  abacate.cobrancas = new Map();
  abacate.fora = false;
  abacate.chamadas = 0;
  trilhaQuebrada = null;
  corposGravados = [];
  logs = [];
}

function cobranca(id, { valor = 3900, plano = 'pro_mensal', status = 'PAID', devMode = false } = {}) {
  abacate.cobrancas.set(id, {
    id,
    amount: valor,
    devMode,
    createdAt: CRIADA,
    status,
    metadata: { externalId: `olli:pl:${USER}:pedido-${id}:${plano}`, inicio: CRIADA },
  });
}

const resp = (status, obj) =>
  new Response(obj === undefined ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

function chaveEvento(url) {
  const origem = decodeURIComponent(url.searchParams.get('origem')?.replace(/^eq\./, '') || '');
  const eventId = decodeURIComponent(url.searchParams.get('event_id')?.replace(/^eq\./, '') || '');
  return { origem, eventId, k: `${origem}|${eventId}` };
}

globalThis.fetch = async (entrada, init = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const metodo = (init.method || 'GET').toUpperCase();
  const corpo = init.body ? String(init.body) : '';
  if (corpo) corposGravados.push(corpo);

  // ── AbacatePay ──
  if (url.hostname === 'api.abacatepay.com') {
    abacate.chamadas++;
    if (abacate.fora) return resp(500, { error: 'fora' });
    const c = abacate.cobrancas.get(url.searchParams.get('id'));
    if (!c) return resp(404, { error: 'not found' });
    if (url.pathname.endsWith('/transparents/get')) {
      // `get` com status em cache (PENDING) — quem diz PAID é o `check`.
      return resp(200, { data: { ...c, status: 'PENDING' }, error: null });
    }
    if (url.pathname.endsWith('/transparents/check')) return resp(200, { data: { status: c.status }, error: null });
    return resp(404, { error: 'rota' });
  }

  // ── Supabase ──
  if (url.origin === SUPA && url.pathname === '/rest/v1/webhook_events') {
    const daTrilha = metodo === 'POST' ? JSON.parse(corpo).origem === 'abacatepay' : chaveEvento(url).origem === 'abacatepay';
    if (daTrilha && trilhaQuebrada === 'excecao') throw new Error('rede caiu');
    if (daTrilha && trilhaQuebrada === 'http500') return resp(500, { message: 'fora' });

    if (metodo === 'POST') {
      const linha = JSON.parse(corpo);
      const k = `${linha.origem}|${linha.event_id}`;
      if (db.eventos.has(k)) return resp(409, { code: '23505' });
      db.eventos.set(k, { ...linha, recebido_em: new Date().toISOString(), processado_em: null, erro: null });
      return resp(201);
    }
    const { k } = chaveEvento(url);
    const linha = db.eventos.get(k);
    if (metodo === 'GET') return resp(200, linha ? [{ status: linha.status }] : []);
    if (metodo === 'PATCH') {
      if (linha) Object.assign(linha, JSON.parse(corpo));
      return resp(204);
    }
  }
  if (url.origin === SUPA && url.pathname === '/rest/v1/assinaturas') {
    if (metodo === 'GET') {
      const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      const a = db.assinaturas.get(uid);
      return resp(200, a ? [a] : []);
    }
    if (metodo === 'POST') {
      const linha = JSON.parse(corpo);
      db.upserts++;
      db.assinaturas.set(linha.user_id, { ...db.assinaturas.get(linha.user_id), ...linha });
      return resp(201);
    }
  }
  throw new Error(`fetch inesperado: ${metodo} ${url.href}`);
};

const logOriginal = console.log;
console.error = (...args) => logs.push(args.map(String).join(' '));
console.warn = console.error;

async function chamar(evt, { segredo = SEGREDO, bruto } = {}) {
  const url = new URL(`https://worker.teste/abacate/webhook?webhookSecret=${encodeURIComponent(segredo)}`);
  const req = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: bruto ?? JSON.stringify(evt),
  });
  const r = await handleAbacate(req, env, url);
  return { status: r.status, corpo: await r.json() };
}

const evento = (id, cob, tipo = 'transparent.completed', extra = {}) => ({
  id,
  event: tipo,
  devMode: false,
  data: { transparent: { id: cob, amount: 3900, status: 'PAID' }, customer: { name: 'Fulana de Tal', taxId: '123.***.***-**' } },
  ...extra,
});
const trilha = (id) => db.eventos.get(`abacatepay|${id}`);
const linhasTrilha = () => [...db.eventos.keys()].filter((k) => k.startsWith('abacatepay|')).length;
const resumo = (l) => l && { tipo: l.tipo, status: l.status, erro: l.erro, resultado: l.payload?.resultado, motivo: l.payload?.motivo };

// ─────────────────────────────────────────────────────────────
console.log('\n1) Sem o segredo: 401 e NENHUMA linha');
reset();
cobranca('pix_char_A');
let r = await chamar(evento('log_401', 'pix_char_A'), { segredo: 'chute' });
checar('401', r.status, 401);
checar('nada gravado em webhook_events', db.eventos.size, 0);
checar('não consultou a AbacatePay', abacate.chamadas, 0);

console.log('\n2) Pix pago: libera o plano e grava a trilha ok');
reset();
cobranca('pix_char_A');
r = await chamar(evento('log_pago_1', 'pix_char_A'));
checar('200 liberado', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
checar('trilha gravada não gera aviso no log', logs.some((l) => l.includes('trilha não gravou')), false);
checar('trilha ok', resumo(trilha('log_pago_1')), {
  tipo: 'transparent.completed',
  status: 'processado',
  erro: null,
  resultado: 'ok',
  motivo: 'liberado',
});
checar('payload mínimo', trilha('log_pago_1').payload, {
  evento: 'transparent.completed',
  cobranca: 'pix_char_A',
  dev_mode: false,
  resultado: 'ok',
  motivo: 'liberado',
  http: 200,
});
checar('datas: recebido_em e processado_em', [!!trilha('log_pago_1').recebido_em, !!trilha('log_pago_1').processado_em], [true, true]);
checar('consumo da cobrança gravado (origem abacate)', db.eventos.get('abacate|pix_char_A')?.status, 'processado');
checar('plano concedido 1x', [db.upserts, db.assinaturas.get(USER)?.plano], [1, 'pro']);

console.log('\n3) MESMO evento de novo: uma linha só, sem creditar 2x, sem reprocessar');
const chamadasAntes = abacate.chamadas;
r = await chamar(evento('log_pago_1', 'pix_char_A'));
checar('200 duplicado', [r.status, r.corpo], [200, { ok: true, duplicado: true }]);
checar('uma linha de trilha', linhasTrilha(), 1);
checar('plano continua concedido 1x', db.upserts, 1);
checar('nem consultou a AbacatePay', abacate.chamadas, chamadasAntes);

console.log('\n4) OUTRO evento da mesma cobrança: trilha própria, ignorado (já consumida)');
r = await chamar(evento('log_pago_2', 'pix_char_A'));
checar('200 liberado (cobrança paga)', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
checar('trilha ignorado/ja_consumida', resumo(trilha('log_pago_2')), {
  tipo: 'transparent.completed',
  status: 'processado',
  erro: null,
  resultado: 'ignorado',
  motivo: 'ja_consumida',
});
checar('plano NÃO concedido de novo', db.upserts, 1);

console.log('\n5) Evento que não interessa: ignorado');
reset();
r = await chamar(evento('log_outro', 'pix_char_X', 'transparent.refunded'));
checar('200', [r.status, r.corpo], [200, { ok: true }]);
checar('trilha ignorado', resumo(trilha('log_outro')), {
  tipo: 'transparent.refunded',
  status: 'processado',
  erro: null,
  resultado: 'ignorado',
  motivo: 'evento_nao_tratado',
});

console.log('\n6) Sem id de cobrança: ignorado');
reset();
r = await chamar({ id: 'log_sem_cob', event: 'transparent.completed', data: {} });
checar('200 sem_vinculo', [r.status, r.corpo], [200, { ok: true, sem_vinculo: true }]);
checar('trilha ignorado/sem_cobranca', resumo(trilha('log_sem_cob'))?.motivo, 'sem_cobranca');

console.log('\n7) Cobrança ainda pendente: ignorado, nada concedido');
reset();
cobranca('pix_char_P', { status: 'PENDING' });
r = await chamar(evento('log_pend', 'pix_char_P'));
checar('200 pendente', [r.status, r.corpo], [200, { ok: true, estado: 'pendente' }]);
checar('trilha ignorado/pendente', resumo(trilha('log_pend')), {
  tipo: 'transparent.completed',
  status: 'processado',
  erro: null,
  resultado: 'ignorado',
  motivo: 'pendente',
});
checar('nada concedido', db.upserts, 0);

console.log('\n8) Valor diferente do catálogo: ERRO na trilha (Pix falho), nada concedido');
reset();
cobranca('pix_char_V', { valor: 100 });
r = await chamar(evento('log_valor', 'pix_char_V'));
checar('200 invalida (reenvio não conserta)', [r.status, r.corpo], [200, { ok: true, estado: 'invalida' }]);
checar('trilha falhou/invalida_valor_divergente', resumo(trilha('log_valor')), {
  tipo: 'transparent.completed',
  status: 'falhou',
  erro: 'invalida_valor_divergente',
  resultado: 'erro',
  motivo: 'invalida_valor_divergente',
});
checar('nada concedido', db.upserts, 0);

console.log('\n9) AbacatePay fora: 503 + falhou; o REENVIO reprocessa e libera');
reset();
cobranca('pix_char_F');
abacate.fora = true;
r = await chamar(evento('log_fora', 'pix_char_F'));
checar('503', [r.status, r.corpo], [503, { erro: 'indisponivel' }]);
checar('trilha falhou/indisponivel', resumo(trilha('log_fora')), {
  tipo: 'transparent.completed',
  status: 'falhou',
  erro: 'indisponivel',
  resultado: 'erro',
  motivo: 'indisponivel',
});
abacate.fora = false;
r = await chamar(evento('log_fora', 'pix_char_F'));
checar('reenvio: 200 liberado', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
checar('mesma linha, agora ok', [linhasTrilha(), resumo(trilha('log_fora'))?.resultado, trilha('log_fora').erro], [1, 'ok', null]);
checar('concedido 1x', db.upserts, 1);

console.log('\n10) Trilha FORA (HTTP 500): o pagamento passa mesmo assim');
reset();
cobranca('pix_char_T');
trilhaQuebrada = 'http500';
r = await chamar(evento('log_trilha_500', 'pix_char_T'));
checar('200 liberado', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
checar('plano concedido', db.upserts, 1);
checar('a falha da trilha aparece no log (reivindicar e fechar)', [
  logs.some((l) => l.includes('trilha não gravou (reivindicar)') && l.includes('log_trilha_500')),
  logs.some((l) => l.includes('trilha não gravou (fechar)') && l.includes('log_trilha_500')),
], [true, true]);

console.log('\n11) Trilha FORA (fetch lança): o pagamento passa mesmo assim');
reset();
cobranca('pix_char_T');
trilhaQuebrada = 'excecao';
r = await chamar(evento('log_trilha_exc', 'pix_char_T'));
checar('200 liberado', [r.status, r.corpo], [200, { ok: true, estado: 'liberado' }]);
checar('plano concedido', db.upserts, 1);
checar('a falha da trilha aparece no log', logs.some((l) => l.includes('trilha não gravou') && l.includes('log_trilha_exc')), true);

console.log('\n12) JSON inválido: 400 e trilha pelo hash do corpo (idempotente)');
reset();
r = await chamar(null, { bruto: '{isto nao e json' });
checar('400', [r.status, r.corpo], [400, { erro: 'payload_invalido' }]);
const chaves = [...db.eventos.keys()];
checar('uma linha com id sha256', chaves.length === 1 && /^abacatepay\|sha256:[0-9a-f]{40}$/.test(chaves[0]), true);
checar('trilha falhou/payload_invalido', resumo(db.eventos.get(chaves[0])), {
  tipo: 'payload_invalido',
  status: 'falhou',
  erro: 'payload_invalido',
  resultado: 'erro',
  motivo: 'payload_invalido',
});
await chamar(null, { bruto: '{isto nao e json' });
checar('mesmo corpo de novo: continua uma linha', db.eventos.size, 1);

console.log('\n13) Evento sem `id`: chave pelo hash, o mesmo corpo não duplica nem credita 2x');
reset();
cobranca('pix_char_S');
const semId = { event: 'transparent.completed', data: { transparent: { id: 'pix_char_S' } } };
await chamar(semId);
await chamar(semId);
checar('uma linha de trilha', linhasTrilha(), 1);
checar('concedido 1x', db.upserts, 1);

console.log('\n14) Modo desligado (sem chave): 503 + falhou, sem consultar a AbacatePay');
reset();
const chave = env.ABACATEPAY_API_KEY;
env.ABACATEPAY_API_KEY = '';
r = await chamar(evento('log_off', 'pix_char_A'));
env.ABACATEPAY_API_KEY = chave;
checar('503', [r.status, r.corpo], [503, { erro: 'pix_desligado' }]);
checar('trilha falhou/pix_desligado', resumo(trilha('log_off'))?.erro, 'pix_desligado');
checar('não consultou a AbacatePay', abacate.chamadas, 0);

console.log('\n15) Segredo e dado do cliente nunca vão para o banco nem para o log');
reset();
cobranca('pix_char_A');
await chamar(evento('log_vaza', 'pix_char_A'));
await chamar(evento('log_vaza_2', 'pix_char_A'), { segredo: 'chute-errado' });
const tudo = corposGravados.join('\n') + logs.join('\n');
checar('webhookSecret ausente', tudo.includes(SEGREDO), false);
checar('chute de segredo ausente', tudo.includes('chute-errado'), false);
checar('"webhookSecret" ausente', tudo.includes('webhookSecret'), false);
checar('nome do cliente ausente', tudo.includes('Fulana'), false);
checar('CPF mascarado ausente', tudo.includes('123.***'), false);

console.log = logOriginal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
