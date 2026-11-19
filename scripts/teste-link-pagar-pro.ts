/**
 * Teste do LINK DE PAGAMENTO DO PRO POR CONTA (CQ-LINK-PAGAR-PRO).
 *
 *     node scripts/teste-link-pagar-pro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * Roteador REAL (`handleLinkPagarPro`) contra AbacatePay e Supabase FALSOS (fetch trocado),
 * mesmo padrão de teste-abacate-plano-pix.ts. O que protege:
 *  1. TOKEN: válido passa; vencido, adulterado, de outro segredo e de outro plano não passam.
 *  2. CHAVE: LINK_PAGAMENTO_PRO desligada (ou sem segredo) = 404, sem tocar em nada.
 *  3. GET NUNCA CRIA COBRANÇA (pré-visualizador de WhatsApp/e-mail abre o link sozinho).
 *  4. COBRANÇA REPETIDA DEVOLVE A MESMA: dois POSTs = uma cobrança na AbacatePay.
 *  5. PREÇO SEMPRE DA FONTE ÚNICA (PLANO_PIX): a página e a cobrança mudam junto com o catálogo.
 *  6. MESMA LIBERAÇÃO DO APP: paga, a página confere pelo caminho de sempre e libera o Pro;
 *     o consumo leva origem 'link' (medição).
 *  7. PRIVACIDADE: só o e-mail mascarado; o token não vai para o log.
 *  8. NÃO VENDE POR CIMA de Empresa ou de assinatura no cartão.
 */
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { handleLinkPagarPro, mascararEmail, linhasDoPro } from '../worker/src/linkPagarPro.js';
// @ts-expect-error — idem.
import { assinarLinkPro, assinarPayloadLinkPro, segredoLinkPro, verificarLinkPro } from '../worker/src/linkProToken.js';
// @ts-expect-error — idem.
import { PLANO_PIX } from '../worker/src/mercadopago.js';

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

const SEGREDO_TXT = 'segredo-de-teste-do-link-pagar-pro-0123456789';
const SEGREDO = segredoLinkPro(SEGREDO_TXT);
const USER = '11111111-2222-4333-8444-555555555555';
const EMPRESA = '22222222-2222-4333-8444-555555555555';
const SUMIU = '33333333-2222-4333-8444-555555555555';
const EMAILS: Record<string, string> = { [USER]: 'dono@exemplo.com.br', [EMPRESA]: 'chefe@exemplo.com.br' };
const RL_LIVRE = { limit: async () => ({ success: true }) };
const RL_ESTOURADO = { limit: async () => ({ success: false }) };

function envCom(extra: Record<string, unknown> = {}): any {
  return {
    SUPABASE_URL: 'https://falso.supabase.co',
    SUPABASE_ANON_KEY: 'anon-falso',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-falso',
    ABACATEPAY_API_KEY: 'abc_prod_chave_falsa',
    ABACATE_RL: RL_LIVRE,
    LINK_PAGAMENTO_PRO: 'true',
    LINK_PAGAMENTO_SECRET: SEGREDO_TXT,
    ...extra,
  };
}

// ── mundo falso ──────────────────────────────────────────────────────────
let cobrancas: Record<string, any> = {};
let criadas: any[] = [];
let eventos: Record<string, any> = {};
let assinaturas: Record<string, any> = {};
let chamadas = 0;
let logs: string[] = [];
let seq = 0;

function reset(): void {
  cobrancas = {};
  criadas = [];
  eventos = {};
  assinaturas = {};
  chamadas = 0;
  logs = [];
}

function resposta(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

globalThis.fetch = (async (input: any, init: any = {}) => {
  chamadas++;
  const url = String(input);
  const metodo = init.method || 'GET';
  const m = /\/auth\/v1\/admin\/users\/([^/?]+)$/.exec(url);
  if (m) {
    const id = decodeURIComponent(m[1]);
    return EMAILS[id] ? resposta({ id, email: EMAILS[id] }) : resposta({ msg: 'User not found' }, 404);
  }
  if (url.includes('/rest/v1/webhook_events')) {
    const q = new URL(url).searchParams;
    if (metodo === 'POST') {
      const corpo = JSON.parse(init.body);
      const chave = `${corpo.origem}|${corpo.event_id}`;
      if (eventos[chave]) return resposta({ code: '23505' }, 409);
      const recebido_em = new Date().toISOString();
      eventos[chave] = { ...corpo, recebido_em };
      return resposta([{ recebido_em }], 201);
    }
    const origem = (q.get('origem') || '').replace(/^eq\./, '');
    if (metodo === 'PATCH') {
      const chave = `${origem}|${(q.get('event_id') || '').replace(/^eq\./, '')}`;
      if (eventos[chave]) Object.assign(eventos[chave], JSON.parse(init.body));
      return new Response(null, { status: 204 });
    }
    // GET: filtra por origem, event_id e payload->>campo.
    const linhas = Object.values(eventos).filter((e: any) => {
      if (e.origem !== origem) return false;
      for (const [k, v] of q.entries()) {
        const val = v.replace(/^eq\./, '');
        if (k === 'event_id' && e.event_id !== val) return false;
        const pm = /^payload->>(.+)$/.exec(k);
        if (pm && String((e.payload || {})[pm[1]]) !== val) return false;
      }
      return true;
    });
    return resposta(linhas.map((e: any) => ({ event_id: e.event_id, status: e.status, payload: e.payload, recebido_em: e.recebido_em })));
  }
  if (url.includes('/rest/v1/assinaturas')) {
    const uid = (new URL(url).searchParams.get('user_id') || '').replace(/^eq\./, '');
    if (metodo === 'GET') return resposta(assinaturas[uid] ? [assinaturas[uid]] : []);
    const corpo = JSON.parse(init.body);
    assinaturas[corpo.user_id] = { ...(assinaturas[corpo.user_id] || {}), ...corpo };
    return new Response(null, { status: 201 });
  }
  if (url.startsWith('https://api.abacatepay.com/v2/')) {
    if (url.includes('/transparents/create')) {
      const corpo = JSON.parse(init.body);
      criadas.push(corpo);
      const id = `pix_char_link_${++seq}`;
      const expiresAt = new Date(Date.now() + 86400e3).toISOString();
      cobrancas[id] = { id, amount: corpo.data.amount, status: 'PENDING', devMode: false, createdAt: new Date().toISOString(), expiresAt, metadata: corpo.data.metadata };
      return resposta({ success: true, error: null, data: { ...cobrancas[id], brCode: `00020101021226PIXFALSO${id}5204000053039865802BR`, brCodeBase64: 'data:image/png;base64,AAAA' } });
    }
    const id = new URL(url).searchParams.get('id') || '';
    const c = cobrancas[id];
    if (!c) return resposta({ success: false, data: null, error: 'not found' }, 400);
    if (url.includes('/transparents/get')) return resposta({ success: true, error: null, data: { ...c, status: 'PENDING' } });
    if (url.includes('/transparents/check')) return resposta({ success: true, error: null, data: { id: c.id, status: c.status } });
  }
  throw new Error(`fetch inesperado no teste: ${url}`);
}) as typeof fetch;

console.error = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };

async function chamar(env: any, metodo: string, token: string, ip = '1.2.3.4') {
  const url = new URL(`https://diagnostico.olliorcamentos.online/pagar/pro/${token}`);
  const req = new Request(url, { method: metodo, headers: { 'CF-Connecting-IP': ip } });
  const r = await handleLinkPagarPro(req, env, url);
  return { status: r.status, corpo: await r.text(), headers: r.headers };
}

const agoraS = Math.floor(Date.now() / 1000);
const TOKEN = await assinarLinkPro(SEGREDO, { uid: USER, agoraS });

console.log('\n1. token');
{
  checar('válido', (await verificarLinkPro(SEGREDO, TOKEN)).ok, true);
  checar('...devolve a conta', (await verificarLinkPro(SEGREDO, TOKEN)).uid, USER);
  const vencido = await assinarLinkPro(SEGREDO, { uid: USER, agoraS: agoraS - 15 * 86400 });
  checar('vencido', await verificarLinkPro(SEGREDO, vencido), { ok: false, motivo: 'vencido' });
  const [corpo, sig] = TOKEN.split('.');
  const outroUid = Buffer.from(JSON.stringify({ v: 1, uid: EMPRESA, plano: 'pro', periodo: 'mensal', exp: agoraS + 1000 })).toString('base64url');
  checar('adulterado (troca a conta, mantém a assinatura)', (await verificarLinkPro(SEGREDO, `${outroUid}.${sig}`)).motivo, 'assinatura');
  const sigTorta = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  checar('adulterado (assinatura)', (await verificarLinkPro(SEGREDO, `${corpo}.${sigTorta}`)).motivo, 'assinatura');
  const outroSegredo = segredoLinkPro('outro-segredo-qualquer-com-mais-de-32-chars');
  checar('assinado com outro segredo', (await verificarLinkPro(SEGREDO, await assinarLinkPro(outroSegredo, { uid: USER }))).motivo, 'assinatura');
  const empresa = await assinarPayloadLinkPro(SEGREDO, { v: 1, uid: USER, plano: 'empresa', periodo: 'mensal', exp: agoraS + 1000 });
  checar('de outro plano (empresa)', (await verificarLinkPro(SEGREDO, empresa)).motivo, 'plano');
  const anual = await assinarPayloadLinkPro(SEGREDO, { v: 1, uid: USER, plano: 'pro', periodo: 'anual', exp: agoraS + 1000 });
  checar('de outro período (anual)', (await verificarLinkPro(SEGREDO, anual)).motivo, 'plano');
  const eterno = await assinarPayloadLinkPro(SEGREDO, { v: 1, uid: USER, plano: 'pro', periodo: 'mensal', exp: agoraS + 400 * 86400 });
  checar('validade além de 14 dias é recusada', (await verificarLinkPro(SEGREDO, eterno)).ok, false);
  checar('lixo', (await verificarLinkPro(SEGREDO, 'abc')).motivo, 'formato');
  checar('segredo curto não vale', segredoLinkPro('curto'), null);
  const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  checar('token sem nome/e-mail/telefone/preço', Object.keys(payload).sort(), ['exp', 'periodo', 'plano', 'uid', 'v']);
  checar('validade = 14 dias', payload.exp - agoraS, 14 * 86400);
}

console.log('\n2. chave desligada = 404');
{
  reset();
  const off = await chamar(envCom({ LINK_PAGAMENTO_PRO: 'false' }), 'GET', TOKEN);
  checar('LINK_PAGAMENTO_PRO=false → 404', off.status, 404);
  const ausente = await chamar(envCom({ LINK_PAGAMENTO_PRO: undefined }), 'POST', TOKEN);
  checar('sem a chave → 404', ausente.status, 404);
  const semSegredo = await chamar(envCom({ LINK_PAGAMENTO_SECRET: '' }), 'GET', TOKEN);
  checar('sem segredo → 404', semSegredo.status, 404);
  checar('...e nenhuma chamada externa', chamadas, 0);
}

console.log('\n3. página e cobrança');
{
  reset();
  const env = envCom();
  const g = await chamar(env, 'GET', TOKEN);
  checar('GET válido = 200', g.status, 200);
  checar('GET NÃO cria cobrança', criadas.length, 0);
  checar('mostra o preço do catálogo (R$ 39,00)', g.corpo.includes('R$ 39,00'), true);
  checar('mostra a conta mascarada', g.corpo.includes('d***@exemplo.com.br'), true);
  checar('não mostra o e-mail inteiro', g.corpo.includes('dono@exemplo.com.br'), false);
  checar('3 linhas do Pro, da tela Planos', linhasDoPro().length === 3 && linhasDoPro().every((l: string) => g.corpo.includes(l.replace(/"/g, '&quot;'))), true);
  checar('CSP restritivo', (g.headers.get('Content-Security-Policy') || '').startsWith("default-src 'none'"), true);

  const p1 = await chamar(env, 'POST', TOKEN);
  checar('POST cria e volta para a página (303)', [p1.status, criadas.length], [303, 1]);
  const c = criadas[0].data;
  checar('valor = catálogo em centavos', c.amount, Math.round(PLANO_PIX.pro_mensal.valor * 100));
  checar('vínculo = o mesmo do Pix do app', /^olli:pl:11111111-2222-4333-8444-555555555555:[0-9a-f-]{36}:pro_mensal$/.test(c.externalId), true);
  checar('origem link na cobrança', c.metadata.origem, 'link');

  const g2 = await chamar(env, 'GET', TOKEN);
  checar('GET depois do POST mostra o Pix (copia e cola + QR)', [g2.status, g2.corpo.includes('PIXFALSOpix_char_link_1'), g2.corpo.includes('<svg')], [200, true, true]);
  checar('...e confere sozinho (refresh)', g2.corpo.includes('http-equiv="refresh"'), true);

  const p2 = await chamar(env, 'POST', TOKEN);
  checar('POST repetido devolve a MESMA cobrança (não cria outra)', [p2.status, criadas.length], [303, 1]);

  // Pagou: a página confere pelo caminho de sempre e libera o Pro.
  cobrancas.pix_char_link_1.status = 'PAID';
  const g3 = await chamar(env, 'GET', TOKEN);
  checar('pago → "Pagamento confirmado, seu Pro está ativo"', [g3.status, g3.corpo.includes('Pagamento confirmado, seu Pro está ativo')], [200, true]);
  checar('plano liberado na conta do token', [assinaturas[USER]?.plano, assinaturas[USER]?.status], ['pro', 'active']);
  checar('consumo marcado com origem link (medição)', eventos['abacate|pix_char_link_1']?.payload?.origem, 'link');
  checar('consumo processado', eventos['abacate|pix_char_link_1']?.status, 'processado');
  const p3 = await chamar(env, 'POST', TOKEN);
  checar('POST depois de pago não cria nova cobrança', criadas.length, 1);
  checar('...e segue confirmado', p3.corpo.includes('Pagamento confirmado'), true);
}

console.log('\n4. cobrança vencida gera outra');
{
  reset();
  const env = envCom();
  await chamar(env, 'POST', TOKEN);
  const ev = Object.values(eventos).find((e: any) => e.origem === 'pix_cobranca') as any;
  ev.payload.expires_at = new Date(Date.now() + 60_000).toISOString(); // vence em 1 min
  await chamar(env, 'POST', TOKEN);
  checar('Pix quase vencido não é reaproveitado', criadas.length, 2);
}

console.log('\n5. preço sempre da fonte única');
{
  reset();
  const original = PLANO_PIX.pro_mensal.valor;
  PLANO_PIX.pro_mensal.valor = 41;
  try {
    const env = envCom();
    const g = await chamar(env, 'GET', TOKEN);
    await chamar(env, 'POST', TOKEN);
    checar('catálogo muda → página muda', g.corpo.includes('R$ 41,00') && !g.corpo.includes('R$ 39,00'), true);
    checar('catálogo muda → cobrança muda', criadas[0].data.amount, 4100);
  } finally {
    PLANO_PIX.pro_mensal.valor = original;
  }
}

console.log('\n6. links ruins, limite e conta');
{
  reset();
  const env = envCom();
  const inval = await chamar(env, 'GET', `${TOKEN}x`);
  checar('token inválido = 404 (página)', [inval.status, inval.corpo.includes('Link inválido')], [404, true]);
  const venc = await chamar(env, 'GET', await assinarLinkPro(SEGREDO, { uid: USER, agoraS: agoraS - 15 * 86400 }));
  checar('token vencido = 410', [venc.status, venc.corpo.includes('venceu')], [410, true]);
  const empresa = await chamar(env, 'POST', await assinarPayloadLinkPro(SEGREDO, { v: 1, uid: USER, plano: 'empresa', periodo: 'mensal', exp: agoraS + 1000 }));
  checar('token de outro plano = 404 e nada criado', [empresa.status, criadas.length], [404, 0]);
  const sumiu = await chamar(env, 'GET', await assinarLinkPro(SEGREDO, { uid: SUMIU }));
  checar('conta inexistente = link inválido', sumiu.status, 404);
  const limite = await chamar(envCom({ ABACATE_RL: RL_ESTOURADO }), 'POST', TOKEN);
  checar('limite estourado = 429 e nada criado', [limite.status, criadas.length], [429, 0]);
  const semLimitador = await chamar(envCom({ ABACATE_RL: undefined }), 'POST', TOKEN);
  checar('limitador fora = fecha (429)', semLimitador.status, 429);
  const dev = await chamar(envCom({ ABACATEPAY_API_KEY: 'abc_dev_x' }), 'POST', TOKEN);
  checar('Pix desligado (chave dev em produção) = 503, nada criado', [dev.status, criadas.length], [503, 0]);
  const put = await chamar(env, 'PUT', TOKEN);
  checar('método estranho = 405', put.status, 405);
}

console.log('\n7. não vende por cima de plano pago no cartão ou Empresa');
{
  reset();
  const env = envCom();
  const fim = new Date(Date.now() + 20 * 86400e3).toISOString();
  assinaturas[EMPRESA] = { user_id: EMPRESA, plano: 'empresa', status: 'active', current_period_end: fim };
  const tE = await assinarLinkPro(SEGREDO, { uid: EMPRESA });
  const e = await chamar(env, 'POST', tE);
  checar('Empresa ativo: não cria Pix e avisa', [e.status, criadas.length, e.corpo.includes('já está ativo')], [200, 0, true]);
  assinaturas[USER] = { user_id: USER, plano: 'pro', status: 'active', current_period_end: fim, stripe_subscription_id: 'sub_123' };
  const s = await chamar(env, 'POST', TOKEN);
  checar('Pro no cartão (Stripe) ativo: não cria Pix', [s.status, criadas.length], [200, 0]);
  assinaturas[USER] = { user_id: USER, plano: 'pro', status: 'active', current_period_end: fim, stripe_subscription_id: null };
  const r = await chamar(env, 'GET', TOKEN);
  checar('Pro por Pix ativo: deixa renovar e diz quando começa', r.corpo.includes('o novo mês começa quando esse prazo terminar'), true);
}

console.log('\n8. privacidade');
{
  checar('máscara', [mascararEmail('joao@gmail.com'), mascararEmail('x@y.com'), mascararEmail('semarroba')], ['j***@gmail.com', 'x***@y.com', '***']);
  const todos = logs.join('\n');
  checar('token nunca vai para o log', todos.includes(TOKEN.split('.')[1]), false);
  checar('segredo nunca vai para o log', todos.includes(SEGREDO_TXT), false);
}

console.error = errOriginal;
console.log(`\n${passes} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
