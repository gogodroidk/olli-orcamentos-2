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

function envCom(extra: Record<string, unknown> = {}): any {
  return {
    SUPABASE_URL: 'https://falso.supabase.co',
    SUPABASE_ANON_KEY: 'anon-falso',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
    ABACATEPAY_API_KEY: 'abc_prod_chave_falsa',
    ABACATE_WEBHOOK_SECRET: 'segredo-do-olli',
    ABACATE_RL: RL_LIVRE,
    ...extra,
  };
}

// ── estado do mundo falso ────────────────────────────────────────────────
let cobrancas: Record<string, any> = {};
let criadas: any[] = [];
let escritas: any[] = [];
let linhaAssinatura: any = null;
let chamadasAbacate = 0;

function reset(): void {
  cobrancas = {};
  criadas = [];
  escritas = [];
  linhaAssinatura = null;
  chamadasAbacate = 0;
}

function resposta(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function cobranca(id: string, userId: string, planoKey: string, amount: number, status = 'PAID', devMode = false) {
  cobrancas[id] = {
    id, amount, status, devMode, createdAt: '2026-09-29T18:00:30.289Z', updatedAt: PAGO_EM,
    metadata: { externalId: `olli:pl:${userId}:pedido-${id}:${planoKey}` },
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
  if (url.includes('/rest/v1/assinaturas')) {
    if ((init.method || 'GET') === 'GET') return resposta(linhaAssinatura ? [linhaAssinatura] : []);
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

console.error = () => {};

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
  checar('externalId vincula usuário e plano', /^olli:pl:user-pix-1:[0-9a-f-]{36}:pro_mensal$/.test(criadas[0]?.data?.metadata?.externalId), true);
  await chamar(envProd, 'POST', '/abacate/plano/pix', { jwt: 'jwt-user', corpo: { plano: 'pro_anual' } });
  checar('anual = R$ 374,40', criadas[1]?.data?.amount, 37440);
  checar('descrição sem "·" nem acento (a API recusa)', criadas[0]?.data?.description, 'OLLI Pro - 1 mes');
  checar('descrição cabe em 37', descricaoAbacate('OLLI Empresa · 1 ano ' + 'x'.repeat(50)).length, 37);
  checar('criar NÃO libera plano', escritas.length, 0);
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
  checar('vigência = criação da cobrança + 1 mês (data fixa)', escritas[0]?.current_period_end, '2026-10-29T18:00:30.289Z');

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
  checar('replay (webhook + polling) não soma meses', escritas.map((e) => e.current_period_end), [primeira, primeira, primeira]);

  const inexistente = await chamar(envProd, 'POST', '/abacate/webhook?webhookSecret=segredo-do-olli', { corpo: { event: 'transparent.completed', data: { transparent: { id: 'pix_nao_existe' } } } });
  checar('cobrança que a API não conhece = 503 (reenvia), nada gravado a mais', [inexistente.status, escritas.length], [503, 3]);
}

console.error = errOriginal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
