/**
 * Teste do ROTEAMENTO DE PAGAMENTOS — a decisão do dono virada em asserção:
 *
 *     "deixe os pagamentos do CARTÃO no STRIPE, e os pagamentos PIX no MERCADO PAGO."
 *
 *     node scripts/teste-roteamento-pagamentos.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Exercita os roteadores REAIS (`handleMercadoPago` e `handleStripe`) contra um
 * Mercado Pago, uma Stripe e um Supabase FALSOS (fetch trocado) — mesmo padrão de
 * teste-webhook-mp-assinatura.ts.
 *
 * O QUE ESTE TESTE PROTEGE (cada um já foi ou quase foi dinheiro no lugar errado):
 *
 *  1. VENDA POR MP-CARTÃO NÃO VOLTA. `POST /mp/plano/assinatura` criava uma
 *     Preapproval recorrente — cobrança de cartão fora da Stripe. Foi removida. O
 *     teste não confia no 404: ele espia o MP falso e falha se QUALQUER
 *     `POST /preapproval` for disparado por qualquer rota.
 *
 *  2. O SUPORTE AO LEGADO NÃO FOI ARRANCADO JUNTO. Desligar a venda é uma coisa;
 *     arrancar o webhook que processa o CANCELAMENTO seria deixar o cartão de
 *     alguém sendo cobrado para sempre, sem nada no OLLI capaz de desligar. O
 *     ramo `preapproval` do webhook continua concedendo e continua encerrando.
 *
 *  3. A STRIPE NÃO VENDE PIX. O checkout avulso (12x) OMITIA
 *     `payment_method_types`, então o Pix entraria sozinho no dia em que fosse
 *     ligado no dashboard da Stripe — mudança de painel, sem deploy e sem review,
 *     que quebraria a decisão do dono em silêncio. Agora está fixado em 'card'.
 *
 *  4. RENOVAÇÃO DE MP-CARTÃO NÃO VIRA SILÊNCIO. Não sabemos processá-la (a venda
 *     saiu), e "não sei" nesta casa não pode virar 200 mudo: tem de deixar rastro.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleMercadoPago, MP_ROUTES } from '../worker/src/mercadopago.js';
// @ts-expect-error — idem.
import { handleStripe } from '../worker/src/stripe.js';

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
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const USER = 'user-pag-1';
const EMAIL = 'dono@exemplo.com.br';
const DAQUI_UM_MES = new Date(Date.now() + 30 * 864e5).toISOString();

// Limiter que SEMPRE deixa passar. Sem binding, as rotas de dinheiro são
// fail-closed (503) de propósito — ver worker/src/rateLimit.js —, então o teste
// precisa fornecer um, ou testaria só o 503.
const RL_LIVRE = { limit: async () => ({ success: true }) };

const env: any = {
  SUPABASE_URL: 'https://falso.supabase.co',
  SUPABASE_ANON_KEY: 'anon-falso',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
  MP_ACCESS_TOKEN: 'mp-token-falso',
  MP_RL: RL_LIVRE,
  STRIPE_SECRET_KEY: 'sk_test_falso',
  STRIPE_RL: RL_LIVRE,
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_PRO_ANUAL: 'price_pro_anual',
  STRIPE_PRICE_PRO_12X: 'price_pro_12x',
  STRIPE_PRICE_EMPRESA: 'price_empresa',
  STRIPE_PRICE_EMPRESA_ANUAL: 'price_empresa_anual',
};

// ── espiões ──────────────────────────────────────────────────────────────
let preapprovalCriadas: any[] = []; // todo POST /preapproval (tem de ficar VAZIO)
let camposStripe: Record<string, string> = {}; // corpo do último checkout
let pagamentosPixCriados: any[] = []; // todo POST /v1/payments
let preapprovalMp: any = null; // o que o GET /preapproval/{id} devolve
let linhaAssinatura: any = null;
let preapprovalGravado: any = null;
let escritas: any[] = [];
let creditosLancados: any[] = [];
let alarmes: string[] = []; // console.error capturado

function reset(opts: { preapproval?: any; linha?: any; gravado?: any } = {}) {
  preapprovalCriadas = [];
  camposStripe = {};
  pagamentosPixCriados = [];
  creditosLancados = [];
  preapprovalMp = opts.preapproval ?? null;
  linhaAssinatura = opts.linha ?? null;
  preapprovalGravado = opts.gravado ?? null;
  escritas = [];
  alarmes = [];
}

const errOriginal = console.error;
console.error = (...args: unknown[]) => { alarmes.push(args.map(String).join(' ')); };

/** Decodifica o corpo x-www-form-urlencoded que o worker manda para a Stripe. */
function decodificarForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const par of new URLSearchParams(body)) out[par[0]] = par[1];
  return out;
}

(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const u = String(url);
  const metodo = init?.method ?? 'GET';
  const resposta = (obj: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => obj }) as unknown as Response;

  // ── Supabase ──
  if (u.includes('/auth/v1/user')) return resposta({ id: USER, email: EMAIL });
  if (u.includes('/rest/v1/credit_ledger')) {
    creditosLancados.push(JSON.parse(init?.body || '{}'));
    return resposta({}, true, 201);
  }
  if (u.includes('/rest/v1/assinaturas')) {
    if (metodo === 'POST') { escritas.push(JSON.parse(init?.body || '{}')); return resposta({}, true, 201); }
    if (u.includes('select=mp_preapproval_id')) {
      return resposta(linhaAssinatura ? [{ mp_preapproval_id: preapprovalGravado }] : []);
    }
    return resposta(linhaAssinatura ? [linhaAssinatura] : []);
  }

  // ── Mercado Pago ──
  if (u.includes('api.mercadopago.com/preapproval')) {
    if (metodo === 'POST') { // NUNCA deveria acontecer: a venda por cartão saiu.
      preapprovalCriadas.push(JSON.parse(init?.body || '{}'));
      return resposta({ id: 'pre-nova', init_point: 'https://mp/checkout' }, true, 201);
    }
    if (!preapprovalMp) return resposta({}, false, 404);
    return resposta(preapprovalMp);
  }
  if (u.includes('api.mercadopago.com/v1/payments')) {
    if (metodo === 'POST') {
      const corpo = JSON.parse(init?.body || '{}');
      pagamentosPixCriados.push(corpo);
      return resposta({
        id: 987654321,
        status: 'pending',
        point_of_interaction: { transaction_data: { qr_code: '00020126BR.GOV.BCB.PIX', qr_code_base64: 'QkFTRTY0' } },
      }, true, 201);
    }
    return resposta({ id: 987654321, status: 'approved', external_reference: pagamentoExternalRef, date_approved: new Date().toISOString() });
  }

  // ── Stripe ──
  if (u.includes('api.stripe.com/v1/checkout/sessions')) {
    camposStripe = decodificarForm(init?.body || '');
    return resposta({ id: 'cs_falso', url: 'https://checkout.stripe.com/c/falso' });
  }

  throw new Error(`fetch fake não sabe responder por: ${u}`);
};

let pagamentoExternalRef = '';

const BASE = 'https://diagnostico.olliorcamentos.online';

async function chamarMp(caminho: string, metodo = 'POST', corpo?: unknown) {
  const alvo = `${BASE}${caminho}`;
  const request = new Request(alvo, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-falso' },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  });
  const resp = await handleMercadoPago(request, env, new URL(alvo));
  return { status: resp.status, body: await resp.json() };
}

async function chamarStripe(caminho: string, corpo: unknown) {
  const alvo = `${BASE}${caminho}`;
  const request = new Request(alvo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt-falso' },
    body: JSON.stringify(corpo),
  });
  const resp = await handleStripe(request, env, new URL(alvo));
  return { status: resp.status, body: await resp.json() };
}

/** Dispara POST /mp/webhook como o MP dispara (id na query, tipo no corpo). */
async function notificar(dataId: string, tipo: string) {
  const alvo = `${BASE}/mp/webhook?data.id=${encodeURIComponent(dataId)}`;
  const request = new Request(alvo, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: tipo, data: { id: dataId } }),
  });
  const resp = await handleMercadoPago(request, env, new URL(alvo));
  return { status: resp.status, body: await resp.json() };
}

try {
  errOriginal('\n=== 1) VENDA NOVA POR MP-CARTÃO: RECUSADA, e com erro TRATÁVEL ===');
  reset();
  {
    const r = await chamarMp('/mp/plano/assinatura', 'POST', { plano: 'pro' });
    checar('404 (a rota deixou de existir)', r.status, 404);
    checar('erro tratável em JSON — não 500 cru, não HTML', r.body.erro, 'nao_encontrado');
    checar('NENHUMA preapproval foi criada no MP', preapprovalCriadas.length, 0);
    checar('e a rota saiu também do contrato MP_ROUTES', MP_ROUTES.has('/mp/plano/assinatura'), false);
  }

  errOriginal('\n2) MP_ROUTES x despacho: quem está no contrato responde 405 (não 404) no método errado');
  reset();
  {
    // Se as duas listas se descolarem, uma rota viva nasce 404 em produção.
    const r = await chamarMp('/mp/pix', 'GET');
    checar('GET /mp/pix → 405 (existe, método errado)', r.status, 405);
    const r2 = await chamarMp('/mp/plano/assinatura', 'GET');
    checar('GET /mp/plano/assinatura → 404 (não existe mais, em nenhum verbo)', r2.status, 404);
  }

  errOriginal('\n3) PIX DO MP CONTINUA VENDENDO — é o único caminho de Pix');
  reset();
  {
    const r = await chamarMp('/mp/pix', 'POST', { pacote: 'creditos_150' });
    checar('200', r.status, 200);
    checar('devolve o copia-e-cola', typeof r.body.brCode === 'string' && r.body.brCode.length > 0, true);
    checar('criou 1 pagamento no MP', pagamentosPixCriados.length, 1);
    checar('e é Pix mesmo', pagamentosPixCriados[0]?.payment_method_id, 'pix');
    checar('valor em REAIS (49.90), não centavos', pagamentosPixCriados[0]?.transaction_amount, 49.9);
    checar('external_reference de CRÉDITO', String(pagamentosPixCriados[0]?.external_reference).startsWith(`olli:cr:${USER}:`), true);
  }
  reset();
  {
    const r = await chamarMp('/mp/plano/pix', 'POST', { plano: 'pro_anual' });
    checar('plano por Pix segue no MP: 200', r.status, 200);
    checar('é Pix', pagamentosPixCriados[0]?.payment_method_id, 'pix');
    checar('nenhuma preapproval envolvida', preapprovalCriadas.length, 0);
  }

  errOriginal('\n4) CARTÃO É SÓ STRIPE — e o checkout avulso está PINADO em cartão');
  reset();
  {
    const r = await chamarStripe('/stripe/checkout', { plano: 'pro_12x' });
    checar('200', r.status, 200);
    checar('modo avulso', camposStripe.mode, 'payment');
    // O CORAÇÃO DESTE TESTE: sem esta linha, ligar Pix no dashboard da Stripe
    // passa a vender Pix pela Stripe sozinho, contra a decisão do dono.
    checar('payment_method_types[0] = card (Stripe não oferece Pix)', camposStripe['payment_method_types[0]'], 'card');
    checar('parcelamento no cartão segue ligado', camposStripe['payment_method_options[card][installments][enabled]'], 'true');
    checar('nenhuma preapproval no MP', preapprovalCriadas.length, 0);
    checar('nenhum Pix no MP', pagamentosPixCriados.length, 0);
  }
  reset();
  {
    const r = await chamarStripe('/stripe/checkout', { plano: 'empresa' });
    checar('assinatura recorrente: 200', r.status, 200);
    checar('mode=subscription', camposStripe.mode, 'subscription');
    checar('recorrência de cartão é da Stripe, não do MP', preapprovalCriadas.length, 0);
  }

  errOriginal('\n5) O LEGADO NÃO FOI ARRANCADO: webhook de assinatura MP ainda CONCEDE');
  reset({
    preapproval: { id: 'pre-viva', status: 'authorized', next_payment_date: DAQUI_UM_MES, external_reference: `olli:as:${USER}:pro` },
    linha: null,
  });
  {
    const r = await notificar('pre-viva', 'subscription_preapproval');
    checar('200', r.status, 200);
    checar('escreveu a assinatura', escritas.length, 1);
    checar('plano ativo', `${escritas[0]?.plano}/${escritas[0]?.status}`, 'pro/active');
    checar('com o mp_preapproval_id — é ele que permite CANCELAR depois', escritas[0]?.mp_preapproval_id, 'pre-viva');
  }

  errOriginal('\n6) ...e ainda ENCERRA: cancelamento de preapproval viva com período vencido');
  reset({
    preapproval: { id: 'pre-viva', status: 'cancelled', external_reference: `olli:as:${USER}:pro` },
    linha: { user_id: USER, plano: 'pro', status: 'active', current_period_end: new Date(Date.now() - 5 * 864e5).toISOString() },
    gravado: 'pre-viva',
  });
  {
    const r = await notificar('pre-viva', 'subscription_preapproval');
    checar('200', r.status, 200);
    checar('registrou o encerramento', escritas[0]?.status, 'canceled');
  }

  errOriginal('\n7) RENOVAÇÃO de MP-cartão: não concede às cegas, mas TAMBÉM não vira silêncio');
  reset({ preapproval: { id: 'pre-viva', status: 'authorized', external_reference: `olli:as:${USER}:pro` } });
  {
    const r = await notificar('autpay-1', 'subscription_authorized_payment');
    checar('200 (reenviar não resolveria — não há o que processar)', r.status, 200);
    checar('marcado como NÃO processado, explicitamente', r.body.renovacao_nao_processada, true);
    checar('não inventou vigência', escritas.length, 0);
    checar('e deixou ALARME no log (erro nunca vira vazio)', alarmes.some((a) => a.includes('ALARME') && a.includes('autpay-1')), true);
  }

  errOriginal('\n8) o mesmo evento chegando pelo tópico `payments` também alarma');
  reset();
  pagamentoExternalRef = `olli:as:${USER}:pro`;
  {
    const r = await notificar('987654321', 'payment');
    checar('200', r.status, 200);
    checar('não processado', r.body.renovacao_nao_processada, true);
    checar('não escreveu nada', escritas.length, 0);
    checar('alarmou', alarmes.some((a) => a.includes('ALARME')), true);
  }

  errOriginal('\n9) Pix de crédito pelo webhook continua creditando (não foi afetado)');
  reset();
  pagamentoExternalRef = `olli:cr:${USER}:pedido-1:creditos_50`;
  {
    const r = await notificar('987654321', 'payment');
    checar('200', r.status, 200);
    checar('não caiu em sem_vinculo (o caminho do crédito segue vivo)', r.body.sem_vinculo, undefined);
    checar('nem foi confundido com assinatura', r.body.renovacao_nao_processada, undefined);
    checar('creditou 1 lançamento', creditosLancados.length, 1);
    checar('50 créditos, origem pix', `${creditosLancados[0]?.delta}/${creditosLancados[0]?.origem}`, '50/pix');
    checar('ref = id do pagamento (idempotência)', creditosLancados[0]?.ref, 'mp:987654321');
  }
} finally {
  console.error = errOriginal;
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
// `process.exitCode` (não `process.exit()`) — mesma razão do teste-creditos-voz.ts:
// matar o processo com o undici ainda fechando handles já deu crash de libuv aqui.
process.exitCode = falhas === 0 ? 0 : 1;
