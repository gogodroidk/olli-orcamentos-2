/**
 * Teste do PLANO POR PIX via AbacatePay (`worker/src/abacate.js`).
 *
 *     node scripts/teste-abacate-plano-pix.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Roteador REAL contra AbacatePay e Supabase FALSOS (fetch trocado). O que protege:
 *
 *  1. NUNCA MODO DEMO. Chave de dev (`abc_dev_`) em produção deixa o Pix DESLIGADO
 *     — nenhum QR falso chega a um cliente, e o /config diz que está desligado.
 *  2. SÓ O SERVIDOR LIBERA, e só depois de LER a cobrança na AbacatePay: status
 *     PAID + valor igual ao catálogo + vínculo com o usuário. Corpo de webhook
 *     forjado, valor adulterado, cobrança devMode em produção: nada libera.
 *  3. POLLING NÃO VIRA ORÁCULO. Perguntar pelo id de outra conta dá 404 e não
 *     concede plano a ninguém.
 *  4. REPLAY NÃO SOMA MESES. Webhook e polling liberam a mesma cobrança com a
 *     mesma vigência (derivada da data do pagamento).
 *  5. CADA COBRANÇA LIBERA UMA VEZ SÓ (auditoria 29/09, item 11). Consumida, ela
 *     fica em `webhook_events` (origem 'abacate'): plano revogado/estornado depois
 *     NÃO volta pelo polling nem pelo replay do webhook; falha ao registrar o
 *     consumo NÃO concede (5xx, reenvio).
 *  6. WEBHOOK COM TETO POR IP, conferido antes do segredo — e o segredo nunca vai
 *     para o log.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { descricaoAbacate, handleAbacate, modoAbacate } from '../worker/src/abacate.js';

const errOriginal = console.error;
let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    errOriginal(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const USER = 'user-pix-1';
const OUTRO = 'user-pix-2';
const PAGO_EM = '2026-09-29T18:00:31.802Z';
const RL_LIVRE = { limit: async () => ({ success: true }) };
const RL_ESTOURADO = { limit: async () => ({ success: false }) };

function envCom(extra: Record<string, unknown> = {}): any {
  return {
    SUPABASE_URL: 'https://falso.supabase.co',
    SUPABASE_ANON_KEY: 'anon-falso',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
    ABACATEPAY_API_KEY: 'abc_prod_chave_falsa',
    ABACATE_WEBHOOK_SECRET: 'segredo-do-olli',
    ABACATE_RL: RL_LIVRE,
    ABACATEHOOK_RL: RL_LIVRE,
    ...extra,
  };
}

// ── estado do mundo falso ────────────────────────────────────────────────
let cobrancas: Record<string, any> = {};
let criadas: any[] = [];
let escritas: any[] = [];
let linhaAssinatura: any = null;
let chamadasAbacate = 0;
// webhook_events falso: chave `origem|event_id` → linha. Índice único como no banco.
let eventos: Record<string, any> = {};
// Falhas injetadas: 'insert' (banco fora ao reivindicar), 'patch' (não fecha o
// consumo) e 'assinatura' (upsert do plano falha).
let falhar: Set<string> = new Set();
// recebido_em que o banco falso grava ao reivindicar (hora em que o pagamento foi visto).
let recebidoEmMock = '2026-09-29T18:00:31.802Z';
let preferPost = '';
let logs: string[] = [];

function reset(): void {
  cobrancas = {};
  criadas = [];
  escritas = [];
  linhaAssinatura = null;
  chamadasAbacate = 0;
  eventos = {};
  falhar = new Set();
  recebidoEmMock = '2026-09-29T18:00:31.802Z';
  logs = [];
}

function resposta(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function cobranca(id: string, userId: string, planoKey: string, amount: number, status = 'PAID', devMode = false, inicio?: string) {
  cobrancas[id] = {
    id, amount, status, devMode, createdAt: '2026-09-29T18:00:30.289Z', updatedAt: PAGO_EM,
    metadata: { externalId: `olli:pl:${userId}:pedido-${id}:${planoKey}`, ...(inicio ? { inicio } : {}) },
  };
}

globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = String(input);
  if (url.endsWith('/auth/v1/user')) {
    const tok = String(init.headers?.Authorization || '').replace('Bearer ', '');
    if (tok === 'jwt-user') return resposta({ id: USER, email: 'dono@exemplo.com.br' });
    if (tok === 'jwt-outro') return resposta({ id: OUTRO, email: 'outro@exemplo.com.br' });
    return resposta({}, 401);
  }
  if (url.includes('/rest/v1/webhook_events')) {
    const metodo = init.method || 'GET';
    const q = new URL(url).searchParams;
    const chaveQ = `${(q.get('origem') || '').replace(/^eq\./, '')}|${(q.get('event_id') || '').replace(/^eq\./, '')}`;
    if (metodo === 'POST') {
      if (falhar.has('insert')) return resposta({ message: 'banco fora' }, 500);
      const corpo = JSON.parse(init.body);
      const chave = `${corpo.origem}|${corpo.event_id}`;
      if (eventos[chave]) return resposta({ code: '23505' }, 409);
      eventos[chave] = { ...corpo, recebido_em: recebidoEmMock };
      preferPost = String(init.headers?.Prefer || '');
      // return=representation: o PostgREST devolve a linha criada (é daí que vem a âncora da vigência).
      if (falhar.has('sem_recebido_em')) return new Response(null, { status: 201 });
      return resposta([{ recebido_em: recebidoEmMock }], 201);
    }
    if (metodo === 'PATCH') {
      if (falhar.has('patch')) return resposta({ message: 'banco fora' }, 500);
      if (eventos[chaveQ]) Object.assign(eventos[chaveQ], JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    return resposta(eventos[chaveQ] ? [{ status: eventos[chaveQ].status, recebido_em: eventos[chaveQ].recebido_em }] : []);
  }
  if (url.includes('/rest/v1/assinaturas')) {
    if ((init.method || 'GET') === 'GET') return resposta(linhaAssinatura ? [linhaAssinatura] : []);
    if (falhar.has('assinatura')) return resposta({ message: 'banco fora' }, 500);
    const corpo = JSON.parse(init.body);
    escritas.push(corpo);
    linhaAssinatura = corpo;
    return new Response(null, { status: 201 });
  }
  if (url.startsWith('https://api.abacatepay.com/v2/')) {
    chamadasAbacate++;
    if (url.includes('/transparents/create')) {
      const corpo = JSON.parse(init.body);
      criadas.push(corpo);
      return resposta({
        success: true, error: null,
        data: {
          id: 'pix_char_novo', amount: corpo.data.amount, status: 'PENDING', devMode: false,
          brCode: '00020101PIX', brCodeBase64: 'data:image/png;base64,AAAA', expiresAt: '2026-09-29T19:00:00Z',
          metadata: corpo.data.metadata,
        },
      });
    }
    const id = new URL(url).searchParams.get('id') || '';
    const c = cobrancas[id];
    if (!c && (url.includes('/transparents/get') || url.includes('/transparents/check'))) {
      return resposta({ success: false, data: null, error: 'Payment intent not found' }, 400);
    }
    // O `get` REAL devolve o status em CACHE (seguiu PENDING depois de pago, medido
    // em 29/09): o falso imita isso para o teste pegar quem voltar a confiar nele.
    if (url.includes('/transparents/get')) return resposta({ success: true, error: null, data: { ...c, status: 'PENDING', updatedAt: c.createdAt } });
    if (url.includes('/transparents/check')) return resposta({ success: true, error: null, data: { id: c.id, status: c.status, expiresAt: c.expiresAt } });
  }
  throw new Error(`fetch inesperado no teste: ${url}`);
}) as typeof fetch;

// Captura o log (em vez de só silenciar) para provar que o segredo não vaza nele.
console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

async function chamar(env: any, metodo: string, caminho: string, opts: { jwt?: string; corpo?: unknown } = {}) {
  const url = new URL(`https://diagnostico.olliorcamentos.online${caminho}`);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.jwt) headers.Authorization = `Bearer ${opts.jwt}`;
  const req = new Request(url, { method: metodo, headers, body: opts.corpo === undefined ? undefined : JSON.stringify(opts.corpo) });
  const r = await handleAbacate(req, env, url);
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

const envProd = envCom();

console.log('\n1. modo (nunca modo demo)');
checar('sem chave = desligado', modoAbacate(envCom({ ABACATEPAY_API_KEY: '' })), 'desligado');
checar('chave dev em produção = desligado', modoAbacate(envCom({ ABACATEPAY_API_KEY: 'abc_dev_x' })), 'desligado');
checar('chave dev com permissão = teste', modoAbacate(envCom({ ABACATEPAY_API_KEY: 'abc_dev_x', ABACATE_PERMITIR_DEV: 'true' })), 'teste');
checar('chave real = producao', modoAbacate(envProd), 'producao');
{
  reset();
  const envDev = envCom({ ABACATEPAY_API_KEY: 'abc_dev_x' });
  const c = await chamar(envDev, 'GET', '/abacate/config');
  checar('/config diz desligado', c.corpo, { ok: true, pix: false, modo: 'desligado' });
  const p = await chamar(envDev, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_mensal' } });
  checar('criar com chave dev em produção = 503 pix_desligado', [p.status, p.corpo?.erro], [503, 'pix_desligado']);
  checar('...sem nenhuma chamada à AbacatePay', chamadasAbacate, 0);
}

console.log('\n2. criar cobrança');
{
  reset();
  const semLogin = await chamar(envProd, 'POST', '/abacate/plano/pix', { corpo: { plano: 'pro_mensal' } });
  checar('sem login = 401', semLogin.status, 401);
  const ruim = await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_gratis' } });
  checar('plano fora do catálogo = 400', ruim.status, 400);
  const r = await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_mensal' } });
  checar('cria e devolve o QR', [r.status, r.corpo?.id, r.corpo?.brCode], [200, 'pix_char_novo', '00020101PIX']);
  checar('valor em centavos vem do catálogo (R$ 39)', criadas[0]?.data?.amount, 3900);
  // P0-08: a cobrança fica gravada (fila do lembrete de 3 h) sem brCode nem dado pessoal.
  checar('grava a cobrança p/ o lembrete (pix_cobranca, id da cobrança, recebido)', [eventos['pix_cobranca|pix_char_novo']?.tipo, eventos['pix_cobranca|pix_char_novo']?.status], ['plano_pix_criada', 'recebido']);
  checar('...payload só com user, plano e validade (sem brCode)', eventos['pix_cobranca|pix_char_novo']?.payload, { user_id: USER, plano: 'pro_mensal', expires_at: '2026-09-29T19:00:00Z' });
  delete eventos['pix_cobranca|pix_char_novo'];
  falhar.add('insert');
  const semBanco = await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_mensal' } });
  falhar.delete('insert');
  checar('banco fora ao gravar a cobrança NÃO derruba a venda (200 com QR)', [semBanco.status, semBanco.corpo?.brCode], [200, '00020101PIX']);
  criadas.pop();

  checar('externalId vincula usuário e plano', /^olli:pl:user-pix-1:[0-9a-f-]{36}:pro_mensal$/.test(criadas[0]?.data?.metadata?.externalId), true);
  await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_anual' } });
  checar('anual = R$ 374,40', criadas[1]?.data?.amount, 37440);
  checar('descrição sem "·" nem acento (a API recusa)', criadas[0]?.data?.description, 'OLLI Pro - 1 mes');
  checar('descrição cabe em 37', descricaoAbacate('OLLI Empresa · 1 ano ' + 'x'.repeat(50)).length, 37);
  checar('criar NÃO libera plano', escritas.length, 0);
  checar('o QR Pix vale 24 h', criadas[0]?.data?.expiresIn, 86400);
  checar('sem plano ativo, o período começa agora', Math.abs(Date.parse(criadas[0]?.data?.metadata?.inicio) - Date.now()) < 60_000, true);

  // Renovação antecipada: Pro ativo até daqui a 5 dias → o novo mês começa no fim.
  const fimAtual = new Date(Date.now() + 5 * 864e5).toISOString();
  linhaAssinatura = { user_id: USER, plano: 'pro', status: 'active', current_period_end: fimAtual };
  await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_mensal' } });
  checar('renovar o MESMO plano cedo começa no fim do atual (não come dias)', criadas[2]?.data?.metadata?.inicio, fimAtual);
  await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'empresa_mensal' } });
  checar('trocar de plano começa agora', Math.abs(Date.parse(criadas[3]?.data?.metadata?.inicio) - Date.now()) < 60_000, true);
  linhaAssinatura = null;
  const semRl = await chamar(envCom({ ABACATE_RL: undefined }), 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_mensal' } });
  checar('sem limitador = fail-closed 429', semRl.status, 429);
}

console.log('\n3. polling (/status)');
{
  reset();
  cobranca('pix_pend', USER, 'pro_mensal', 3900, 'PENDING');
  const pend = await chamar(envProd, 'GET', '/abacate/status?id=pix_pend', { jwt: 'jwt-user' });
  checar('pendente = pago:false, nada gravado', [pend.corpo?.pago, escritas.length], [false, 0]);

  cobranca('pix_pago', USER, 'pro_mensal', 3900);
  const pago = await chamar(envProd, 'GET', '/abacate/status?id=pix_pago', { jwt: 'jwt-user' });
  checar('pago (status do check, não do get em cache) = liberado', pago.corpo, { ok: true, pago: true, liberado: true });
  checar('grava Pro ativo', [escritas[0]?.user_id, escritas[0]?.plano, escritas[0]?.status], [USER, 'pro', 'active']);
  checar('vigência = pagamento visto + 1 mês (data fixa)', escritas[0]?.current_period_end, '2026-10-29T18:00:31.802Z');

  reset();
  recebidoEmMock = '2026-09-30T14:00:00.000Z'; // pagou 20 h depois (Pix de 24 h)
  cobranca('pix_tarde', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'GET', '/abacate/status?id=pix_tarde', { jwt: 'jwt-user' });
  checar('Pix pago 20 h depois: vigência conta do pagamento (não perde o dia)', escritas[0]?.current_period_end, '2026-10-30T14:00:00.000Z');

  reset();
  recebidoEmMock = '2026-10-05T00:00:00.000Z'; // fora da janela de 25 h
  cobranca('pix_fora_janela', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'GET', '/abacate/status?id=pix_fora_janela', { jwt: 'jwt-user' });
  checar('pagamento visto fora da janela: cai na criação (nunca dá tempo a mais)', escritas[0]?.current_period_end, '2026-10-29T18:00:30.289Z');

  reset();
  recebidoEmMock = '2026-09-30T14:00:00.000Z'; // pagou 20 h depois
  cobranca('pix_ancora_no_claim', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'GET', '/abacate/status?id=pix_ancora_no_claim', { jwt: 'jwt-user' });
  checar('âncora vem do próprio claim (return=representation), sem 2º GET', /return=representation/.test(preferPost), true);
  checar('vigência conta do recebido_em devolvido pelo claim', escritas[0]?.current_period_end, '2026-10-30T14:00:00.000Z');

  // Claim que não devolve recebido_em: NÃO concede com a data da criação (tiraria até 24 h de
  // quem pagou tarde, em silêncio). Fecha 'falhou'; a retentativa lê a âncora e concede certo.
  reset();
  recebidoEmMock = '2026-09-30T14:00:00.000Z';
  falhar = new Set(['sem_recebido_em']);
  cobranca('pix_sem_ancora', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'GET', '/abacate/status?id=pix_sem_ancora', { jwt: 'jwt-user' });
  checar('sem recebido_em no claim: nada é concedido', escritas.length, 0);
  checar('e o evento fica falhou (reprocessável)', eventos['abacate|pix_sem_ancora']?.status, 'falhou');
  falhar = new Set();
  await chamar(envProd, 'GET', '/abacate/status?id=pix_sem_ancora', { jwt: 'jwt-user' });
  checar('retentativa lê a âncora na própria checagem e concede do pagamento visto', escritas[0]?.current_period_end, '2026-10-30T14:00:00.000Z');

  reset();
  cobranca('pix_de_outro', USER, 'pro_mensal', 3900);
  const alheia = await chamar(envProd, 'GET', '/abacate/status?id=pix_de_outro', { jwt: 'jwt-outro' });
  checar('id de outra conta = 404', alheia.status, 404);
  checar('...e ninguém ganha plano', escritas.length, 0);

  reset();
  cobranca('pix_barato', USER, 'pro_anual', 3900); // pagou R$39 numa cobrança marcada "anual"
  const barato = await chamar(envProd, 'GET', '/abacate/status?id=pix_barato', { jwt: 'jwt-user' });
  checar('valor diferente do catálogo = não libera', [barato.status, escritas.length], [404, 0]);

  reset();
  cobranca('pix_dev', USER, 'pro_mensal', 3900, 'PAID', true);
  const dev = await chamar(envProd, 'GET', '/abacate/status?id=pix_dev', { jwt: 'jwt-user' });
  checar('cobrança devMode em produção = não libera', [dev.status, escritas.length], [404, 0]);

  reset();
  const lixo = await chamar(envProd, 'GET', '/abacate/status?id=../../x', { jwt: 'jwt-user' });
  checar('id malformado = 400 sem chamar a API', [lixo.status, chamadasAbacate], [400, 0]);

  reset();
  cobranca('pix_renova', USER, 'pro_mensal', 3900, 'PAID', false, '2026-10-20T00:00:00.000Z');
  await chamar(envProd, 'GET', '/abacate/status?id=pix_renova', { jwt: 'jwt-user' });
  checar('renovação: vigência = início gravado + 1 mês', escritas[0]?.current_period_end, '2026-11-20T00:00:00.000Z');

  reset();
  cobranca('pix_inicio_absurdo', USER, 'pro_mensal', 3900, 'PAID', false, '2030-01-01T00:00:00.000Z');
  await chamar(envProd, 'GET', '/abacate/status?id=pix_inicio_absurdo', { jwt: 'jwt-user' });
  checar('início fora da janela é ignorado (usa o pagamento visto)', escritas[0]?.current_period_end, '2026-10-29T18:00:31.802Z');
}

console.log('\n4. webhook');
{
  reset();
  const semSegredo = await chamar(envProd, 'POST', '/abacate/webhook', { corpo: { event: 'transparent.completed', data: { transparent: { id: 'x' } } } });
  checar('sem webhookSecret = 401', semSegredo.status, 401);
  const errado = await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=chute', { corpo: {} });
  checar('secret errado = 401', errado.status, 401);

  const outro = await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=segredo-do-olli', { corpo: { event: 'transparent.refunded', data: {} } });
  checar('evento irrelevante = 200 sem ação', [outro.status, chamadasAbacate, escritas.length], [200, 0, 0]);

  cobranca('pix_wh', USER, 'empresa_mensal', 9900);
  const forjado = {
    event: 'transparent.completed',
    data: { transparent: { id: 'pix_wh', amount: 1, status: 'PAID', metadata: { externalId: `olli:pl:${OUTRO}:x:empresa_anual` } } },
  };
  const wh = await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=segredo-do-olli', { corpo: forjado });
  checar('webhook libera lendo a COBRANÇA na API, não o corpo', [wh.status, escritas[0]?.user_id, escritas[0]?.plano], [200, USER, 'empresa']);

  const primeira = escritas[0]?.current_period_end;
  await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=segredo-do-olli', { corpo: forjado });
  await chamar(envProd, 'GET', '/abacate/status?id=pix_wh', { jwt: 'jwt-user' });
  checar('replay (webhook + polling) não reescreve o plano', escritas.map((e) => e.current_period_end), [primeira]);

  const inexistente = await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=segredo-do-olli', { corpo: { event: 'transparent.completed', data: { transparent: { id: 'pix_nao_existe' } } } });
  checar('cobrança que a API não conhece = 503 (reenvia), nada gravado a mais', [inexistente.status, escritas.length], [503, 1]);
}

const WH = '/abacate/webhook?webhookSecret=segredo-do-olli';
const evtPago = (id: string) => ({ event: 'transparent.completed', data: { transparent: { id } } });

console.log('\n5. consumo único (cobrança não reativa plano revogado)');
{
  reset();
  cobranca('pix_estorno', USER, 'pro_mensal', 3900);
  const pago = await chamar(envProd, 'GET', '/abacate/status?id=pix_estorno', { jwt: 'jwt-user' });
  checar('1ª liberação concede', [pago.corpo?.pago, escritas.length], [true, 1]);
  checar('...e grava o consumo (abacate, id da cobrança) como processado', eventos['abacate|pix_estorno']?.status, 'processado');
  checar('...com o vínculo no payload, sem segredo', eventos['abacate|pix_estorno']?.payload, { user_id: USER, plano: 'pro_mensal', valor_centavos: 3900 });

  // Dono estorna o Pix e revoga o plano à mão.
  linhaAssinatura = { ...linhaAssinatura, status: 'canceled', current_period_end: '2026-09-30T00:00:00.000Z' };
  const revogado = { ...linhaAssinatura };
  const poll = await chamar(envProd, 'GET', '/abacate/status?id=pix_estorno', { jwt: 'jwt-user' });
  checar('plano revogado não volta pelo polling', [poll.corpo?.pago, escritas.length, linhaAssinatura], [true, 1, revogado]);
  const replay = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_estorno') });
  checar('plano revogado não volta pelo replay do webhook', [replay.status, escritas.length, linhaAssinatura], [200, 1, revogado]);

  reset();
  cobranca('pix_replay', USER, 'empresa_mensal', 9900);
  const a = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_replay') });
  const b = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_replay') });
  const c = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_replay') });
  checar('replay do webhook não duplica: 200 em todos', [a.status, b.status, c.status], [200, 200, 200]);
  // Mesmo corpo 3x (sem `id` de evento): UMA linha de consumo e UMA de trilha
  // ('abacatepay', chave = hash do corpo — ver teste-abacate-webhook.js no worker).
  checar(
    '...uma escrita de plano e uma linha de consumo',
    [escritas.length, Object.keys(eventos).filter((k) => k.startsWith('abacate|'))],
    [1, ['abacate|pix_replay']],
  );
  checar('...e uma linha só de trilha do webhook', Object.keys(eventos).filter((k) => k.startsWith('abacatepay|')).length, 1);
  const poll2 = await chamar(envProd, 'GET', '/abacate/status?id=pix_replay', { jwt: 'jwt-user' });
  checar('...e o cliente no polling continua vendo pago:true', [poll2.corpo?.pago, escritas.length], [true, 1]);

  reset();
  cobranca('pix_pend2', USER, 'pro_mensal', 3900, 'PENDING');
  await chamar(envProd, 'GET', '/abacate/status?id=pix_pend2', { jwt: 'jwt-user' });
  cobranca('pix_alheio2', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'GET', '/abacate/status?id=pix_alheio2', { jwt: 'jwt-outro' });
  checar('pendente ou alheia não reivindica nada', Object.keys(eventos).length, 0);

  reset();
  cobranca('pix_banco_fora', USER, 'pro_mensal', 3900);
  falhar.add('insert');
  const whFora = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_banco_fora') });
  checar('falha ao registrar não concede: webhook 503 (reenvio), plano intacto', [whFora.status, escritas.length], [503, 0]);
  const pollFora = await chamar(envProd, 'GET', '/abacate/status?id=pix_banco_fora', { jwt: 'jwt-user' });
  checar('falha ao registrar não concede: polling 502, nunca pago:true', [pollFora.status, pollFora.corpo?.pago ?? null, escritas.length], [502, null, 0]);
  falhar.delete('insert');
  const whVolta = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_banco_fora') });
  checar('...banco de volta, o reenvio concede', [whVolta.status, escritas.length, eventos['abacate|pix_banco_fora']?.status], [200, 1, 'processado']);

  reset();
  cobranca('pix_meio', USER, 'pro_mensal', 3900);
  // toda linha real tem recebido_em (not null default now()); a retentativa o lê junto do status
  eventos['abacate|pix_meio'] = { origem: 'abacate', event_id: 'pix_meio', status: 'recebido', recebido_em: recebidoEmMock };
  const meio = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_meio') });
  checar('tentativa anterior que morreu no meio (recebido) é reprocessada', [meio.status, escritas.length, eventos['abacate|pix_meio']?.status], [200, 1, 'processado']);

  reset();
  cobranca('pix_upsert', USER, 'pro_mensal', 3900);
  falhar.add('assinatura');
  const up = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_upsert') });
  checar('concessão falhou = 503 e consumo marcado falhou (não processado)', [up.status, eventos['abacate|pix_upsert']?.status], [503, 'falhou']);
  falhar.delete('assinatura');
  const up2 = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_upsert') });
  checar('...o reenvio concede', [up2.status, escritas.length, eventos['abacate|pix_upsert']?.status], [200, 1, 'processado']);

  reset();
  cobranca('pix_patch', USER, 'pro_mensal', 3900);
  falhar.add('patch');
  const pt = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_patch') });
  checar('liberou mas o consumo não gravou = 503 para reenviar', [pt.status, escritas.length, eventos['abacate|pix_patch']?.status], [503, 1, 'recebido']);
  falhar.delete('patch');
  const primeira = escritas[0]?.current_period_end;
  const pt2 = await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_patch') });
  checar('...o reenvio grava o consumo, com a MESMA vigência', [pt2.status, eventos['abacate|pix_patch']?.status, escritas[1]?.current_period_end], [200, 'processado', primeira]);
}

console.log('\n6. teto por IP no webhook');
{
  reset();
  cobranca('pix_rl', USER, 'pro_mensal', 3900);
  const envRl = envCom({ ABACATEHOOK_RL: RL_ESTOURADO });
  const r = await chamar(envRl, 'POST', WH, { corpo: evtPago('pix_rl') });
  checar('estourou o teto = 429, sem chamar a API nem gravar', [r.status, chamadasAbacate, escritas.length], [429, 0, 0]);
  const chute = await chamar(envRl, 'POST', '/abacate/webhook?webhookSecret=chute', { corpo: {} });
  checar('...o teto vem ANTES do segredo (barra quem tenta adivinhar)', chute.status, 429);
  const semBinding = await chamar(envCom({ ABACATEHOOK_RL: undefined }), 'POST', WH, { corpo: evtPago('pix_rl') });
  checar('limitador fora não derruba webhook de dinheiro', [semBinding.status, escritas.length], [200, 1]);

  reset();
  falhar.add('patch');
  cobranca('pix_log', USER, 'pro_mensal', 3900);
  await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_log') });
  await chamar(envProd, 'POST', WH, { corpo: evtPago('pix_nao_existe') });
  checar('houve log de erro (o teste enxerga o log)', logs.length > 0, true);
  checar('o segredo do webhook não aparece em nenhum log', logs.some((l) => l.includes('segredo-do-olli')), false);
}

console.error = errOriginal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
