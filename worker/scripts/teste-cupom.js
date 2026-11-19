/**
 * Cupom de influenciador no worker — fetch simulado (Supabase e AbacatePay falsos).
 *
 *     node worker/scripts/teste-cupom.js   (da raiz ou de worker/)
 * Prende: desligado (flag) não promete nem decide nada; /cupom/consultar não grava (só cupom_verificar) e
 * devolve o desconto ESCRITO + aviso de que cupom e indicação não se somam; "não sei" = 503; recusa nunca
 * cobra cheio; Pix do plano com cupom cobra o valor de TABELA × (100 − %) (nenhum preço novo); o webhook só
 * libera o valor com desconto quando a cobrança foi criada com cupom, e confirma o uso; sem cupom o valor
 * com desconto NÃO libera; paridade com a constante.
 */
import { handleCupom, normalizarCodigoCupom, valorComDesconto, textoDesconto, pctLigado, reservarCupom, CUPOM_PERCENTUAL, AVISO_NAO_ACUMULA } from '../src/cupom.js';
import { handleAbacate } from '../src/abacate.js';
import { handleCheckout } from '../src/stripe.js';
import { AVISO_CUPOM_E_INDICACAO } from '../../src/utils/cupomTexto.ts';
import { PLANO_PIX } from '../src/mercadopago.js';

let ok = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  if (condicao) { console.log(`  ok   ${nome}`); ok++; }
  else { console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`); falhas++; }
}

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const RL = { limit: async () => ({ success: true }) };
const envBase = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc',
  CONTA_RL: RL, ABACATE_RL: RL, ABACATEPAY_API_KEY: 'abc_prod_x',
};
const ligado = { ...envBase, CUPOM_INFLUENCER_ATIVO: '1' };

let chamadas = [];
let rpcs = {};
let cobrancaAbacate = null; // o que a AbacatePay "devolve" em /transparents/get
let abacateFalha = false;
let createN = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  chamadas.push({ url: u, init });
  if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify(USER), { status: 200 });
  const m = u.match(/\/rest\/v1\/rpc\/(\w+)$/);
  if (m) {
    let r = rpcs[m[1]];
    if (typeof r === 'function') r = r(init.body ? JSON.parse(init.body) : {});
    if (r === undefined || r === 'erro') return new Response('{}', { status: 500 });
    return new Response(JSON.stringify(r), { status: 200 });
  }
  if (u.includes('api.stripe.com/v1/coupons')) return new Response(JSON.stringify({ id: 'cup_1' }), { status: 200 });
  if (u.includes('api.stripe.com/v1/checkout/sessions')) return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/c/1' }), { status: 200 });
  if (u.includes('/transparents/create') && abacateFalha) return new Response('{}', { status: 500 });
  if (u.includes('/transparents/create')) {
    createN += 1;
    const corpo = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: { id: 'bill_1', brCode: '000201xx', brCodeBase64: '', status: 'PENDING', expiresAt: null, _amount: corpo.data.amount } }), { status: 200 });
  }
  if (u.includes('/transparents/get')) return new Response(JSON.stringify({ data: cobrancaAbacate }), { status: 200 });
  if (u.includes('/transparents/check')) return new Response(JSON.stringify({ data: { status: 'PAID' } }), { status: 200 });
  if (u.includes('/rest/v1/assinaturas')) return new Response('[]', { status: 200 });
  if (u.includes('/rest/v1/webhook_events')) return new Response(JSON.stringify([{ id: 1, status: 'recebido', recebido_em: new Date().toISOString() }]), { status: 201 });
  return new Response('{}', { status: 200 });
};
const reset = () => { chamadas = []; rpcs = {}; cobrancaAbacate = null; abacateFalha = false; createN = 0; };
const rpcChamado = (nome) => chamadas.find((c) => c.url.endsWith(`/rpc/${nome}`));
const req = (path, body, token = 't') => new Request(`https://w.test${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const consultar = (r, env = ligado) => handleCupom(r, env, new URL(r.url), PLANO_PIX);
const abacate = (r, env = ligado) => handleAbacate(r, env, new URL(r.url));

console.log('puras');
checar('paridade: percentual 10', CUPOM_PERCENTUAL === 10);
checar('flag exata: só "1" liga', pctLigado(ligado) === 10 && pctLigado(envBase) === 0 && pctLigado({ CUPOM_INFLUENCER_ATIVO: 'true' }) === 0);
checar('código: maiúsculo, 4–20 alfanum', normalizarCodigoCupom(' ana10 ') === 'ANA10' && normalizarCodigoCupom('ab') === null && normalizarCodigoCupom("A';--") === null && normalizarCodigoCupom(null) === null);
checar('10% de R$ 39,00 = R$ 35,10', valorComDesconto(39, 10) === 35.1);
checar('10% de R$ 374,40 = R$ 336,96', valorComDesconto(374.4, 10) === 336.96);
checar('% inválido não mexe no preço', valorComDesconto(39, 0) === 39 && valorComDesconto(39, 100) === 39);
const t = textoDesconto({ pct: 10, de: 39, por: 35.1 });
checar('texto escrito: percentual, só 1ª cobrança, de/por, volta ao normal', /10%/.test(t) && /1ª cobrança/.test(t) && /R\$ 39,00/.test(t) && /R\$ 35,10/.test(t) && /volta ao normal/.test(t), t);
checar('paridade: o aviso da tela é o mesmo do servidor', AVISO_CUPOM_E_INDICACAO === AVISO_NAO_ACUMULA);
checar('aviso: cupom e indicação não se somam', /não se somam/.test(AVISO_NAO_ACUMULA) && /primeiro/.test(AVISO_NAO_ACUMULA));

console.log('/cupom/config');
let cfg = await consultar(new Request('https://w.test/cupom/config'), envBase);
checar('config desligado: ativo=false', (await cfg.json()).ativo === false);
cfg = await consultar(new Request('https://w.test/cupom/config'), ligado);
checar('config ligado: ativo=true, sem login', (await cfg.json()).ativo === true);
cfg = await consultar(new Request('https://w.test/cupom/config', { method: 'POST' }), ligado);
checar('config só aceita GET', cfg.status === 405);

console.log('/cupom/consultar');
reset();
let r = await consultar(req('/cupom/consultar', { codigo: 'ANA10' }, null));
checar('sem token = 401', r.status === 401);
reset();
r = await consultar(new Request('https://w.test/cupom/consultar', { method: 'GET' }));
checar('GET = 405', r.status === 405);
reset();
r = await consultar(req('/cupom/consultar', { codigo: 'ANA10' }), envBase);
let j = await r.json();
checar('desligado: não promete nada e não chama o banco', j.valido === false && j.status === 'desligado' && !rpcChamado('cupom_verificar'));
reset(); rpcs.cupom_verificar = { status: 'ok', codigo: 'ANA10', pct: 10 };
r = await consultar(req('/cupom/consultar', { codigo: ' ana10 ', plano: 'pro_mensal' }));
j = await r.json();
checar('válido: desconto escrito + aviso + de/por da tabela', j.valido === true && j.pct === 10 && j.de === 39 && j.por === 35.1 && /1ª cobrança/.test(j.texto) && j.aviso === AVISO_NAO_ACUMULA, JSON.stringify(j));
checar('consulta NÃO grava: só cupom_verificar (nunca reservar/confirmar)', rpcChamado('cupom_verificar') && !rpcChamado('cupom_reservar') && !rpcChamado('cupom_confirmar'));
checar('id vem do JWT, código normalizado vai ao banco', JSON.parse(rpcChamado('cupom_verificar').init.body).p_user === USER.id && JSON.parse(rpcChamado('cupom_verificar').init.body).p_codigo === 'ANA10');
for (const st of ['invalido', 'expirado', 'esgotado', 'ja_usou', 'ja_pagou', 'indicacao']) {
  reset(); rpcs.cupom_verificar = { status: st };
  const jj = await (await consultar(req('/cupom/consultar', { codigo: 'ANA10' }))).json();
  checar(`recusa ${st}: texto claro, sem desconto`, jj.valido === false && jj.status === st && typeof jj.texto === 'string' && jj.texto.length > 10 && !('por' in jj));
}
reset(); rpcs.cupom_verificar = { status: 'indicacao' };
j = await (await consultar(req('/cupom/consultar', { codigo: 'ANA10' }))).json();
checar('indicação: o texto explica que não se somam', /indicação/.test(j.texto) && /não se somam/.test(j.texto));
reset();
r = await consultar(req('/cupom/consultar', { codigo: 'ANA10' }));
checar('banco fora = 503 (não sei ≠ sem desconto)', r.status === 503);
reset();
j = await (await consultar(req('/cupom/consultar', { codigo: "x';drop" }))).json();
checar('código malformado não chega ao banco', j.status === 'invalido' && !rpcChamado('cupom_verificar'));

console.log('reservarCupom');
reset();
let rr = await reservarCupom(envBase, { userId: USER.id, codigo: 'ANA10', plano: 'pro_mensal', canal: 'pix' });
checar('desligado: não reserva', rr.ok === false && rr.status === 'desligado' && !rpcChamado('cupom_reservar'));
reset();
rr = await reservarCupom(ligado, { userId: USER.id, codigo: 'ANA10', plano: 'pro_mensal', canal: 'pix' });
checar('banco fora: indisponivel (não cobra cheio por engano)', rr.ok === false && rr.status === 'indisponivel');

console.log('Pix do plano (AbacatePay) com cupom');
const pedir = (corpo, env = ligado) => abacate(req('/abacate/plano/pix', corpo), env);
const valorEnviado = () => JSON.parse(chamadas.find((c) => c.url.includes('/transparents/create')).init.body).data.amount;
reset();
r = await pedir({ plano: 'pro_mensal' });
checar('sem cupom: cobra o preço de tabela (3900) e não toca no cupom', r.status === 200 && valorEnviado() === 3900 && !rpcChamado('cupom_reservar'));
reset(); rpcs.cupom_reservar = { status: 'ok', codigo: 'ANA10', pct: 10 };
r = await pedir({ plano: 'pro_mensal', cupom: 'ana10' });
j = await r.json();
checar('com cupom: cobra tabela × 90% (3510), o preço novo não existe em tabela alguma', r.status === 200 && valorEnviado() === 3510, String(valorEnviado()));
checar('resposta traz o desconto escrito (antes de pagar)', j.desconto && j.desconto.pct === 10 && j.desconto.de === 39 && j.desconto.por === 35.1 && /1ª cobrança/.test(j.desconto.texto), JSON.stringify(j.desconto));
const md = JSON.parse(chamadas.find((c) => c.url.includes('/transparents/create')).init.body).data.metadata;
checar('atribuição: só código e percentual na cobrança (sem dado do influenciador)', md.cupom === 'ANA10' && md.cupomPct === 10 && Object.keys(md).every((k) => ['externalId', 'inicio', 'cupom', 'cupomPct'].includes(k)));
checar('reserva pediu canal pix e o plano', JSON.parse(rpcChamado('cupom_reservar').init.body).p_canal === 'pix' && JSON.parse(rpcChamado('cupom_reservar').init.body).p_plano === 'pro_mensal');
for (const st of ['expirado', 'esgotado', 'ja_pagou', 'indicacao']) {
  reset(); rpcs.cupom_reservar = { status: st };
  r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' });
  j = await r.json();
  checar(`cupom ${st}: 409 com texto e NENHUM Pix criado (não cobra cheio escondido)`, r.status === 409 && j.erro === 'cupom_recusado' && j.status === st && !chamadas.some((c) => c.url.includes('/transparents/create')));
}
reset();
r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' });
checar('banco fora na reserva = 503 e nenhum Pix', r.status === 503 && !chamadas.some((c) => c.url.includes('/transparents/create')));
reset();
r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' }, envBase);
j = await r.json();
checar('flag desligada + cupom enviado: recusa (409), nunca cobra o valor com desconto', r.status === 409 && j.status === 'desligado' && !chamadas.some((c) => c.url.includes('/transparents/create')));

console.log('webhook/polling: valor que libera');
const cobranca = (amount, extra = {}) => ({
  id: 'bill_1', amount, devMode: false, createdAt: new Date().toISOString(),
  metadata: { externalId: `olli:pl:${USER.id}:abc:pro_mensal`, inicio: new Date().toISOString(), ...extra },
});
const status = () => abacate(new Request('https://w.test/abacate/status?id=bill_1', { headers: { Authorization: 'Bearer t' } }));
reset(); rpcs.cupom_confirmar = true; cobrancaAbacate = cobranca(3510, { cupom: 'ANA10', cupomPct: 10 });
await status();
checar('cobrança com cupom paga 3510: libera e CONFIRMA o uso', chamadas.some((c) => c.url.includes('/rest/v1/assinaturas') && c.init.method && c.init.method !== 'GET') || rpcChamado('cupom_confirmar'), chamadas.map((c) => c.url.split('/').slice(-2).join('/')).join(' | '));
checar('confirmou o uso do cupom desta conta', rpcChamado('cupom_confirmar') && JSON.parse(rpcChamado('cupom_confirmar').init.body).p_user === USER.id);
reset(); cobrancaAbacate = cobranca(3510);
await status();
checar('SEM cupom na cobrança, 3510 NÃO libera (preço fora da tabela) e não confirma nada', !rpcChamado('cupom_confirmar') && !chamadas.some((c) => c.url.includes('/transparents/check')));
reset(); cobrancaAbacate = cobranca(3000, { cupom: 'ANA10', cupomPct: 10 });
await status();
checar('cupom de 10% com valor 3000 (desconto maior que o gravado) NÃO libera', !rpcChamado('cupom_confirmar') && !chamadas.some((c) => c.url.includes('/transparents/check')));
reset(); cobrancaAbacate = cobranca(1950, { cupom: 'ANA10', cupomPct: 50 });
await status();
checar('pct 50 é o teto aceito; 3900×50% = 1950 bate com o que foi gravado', chamadas.some((c) => c.url.includes('/transparents/check')));
reset(); cobrancaAbacate = cobranca(1, { cupom: 'ANA10', cupomPct: 99 });
await status();
checar('pct fora de 1..50 na cobrança é ignorado (não vira passe livre)', !chamadas.some((c) => c.url.includes('/transparents/check')));

const envStripe = { ...ligado, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_PRO: 'price_pro', STRIPE_PRICE_PRO_ANUAL: 'price_pa', STRIPE_RL: RL };
const checkout = (corpo, env = envStripe) => handleCheckout(req('/stripe/checkout', corpo), env);
const sessao = () => new URLSearchParams(chamadas.find((c) => c.url.includes('/checkout/sessions')).init.body);
const cupomStripe = () => chamadas.find((c) => c.url.includes('/v1/coupons'));
console.log('UMA reserva aberta por conta (Pix e cartão)');
const textoJaUsou = 'O desconto já foi usado nesta conta.';
// modelo fiel do Postgres: 1ª chamada abre a reserva; a 2ª, enquanto a cobrança ainda não foi anexada, espera;
// depois do anexo, o mesmo plano recebe a MESMA cobrança e outro plano é recusado.
function reservaModelo() {
  const est = { aberta: false, cobranca: null, plano: null, canal: null, pago: false };
  rpcs.cupom_reservar = (b) => {
    if (est.pago) return { status: 'ja_usou' };
    if (est.aberta && est.cobranca === null) return { status: 'em_andamento' };
    if (est.aberta) return b.p_plano === est.plano && b.p_canal === est.canal
      ? { status: 'ok', codigo: 'ANA10', pct: 10, reaproveitar: true, cobranca: est.cobranca } : { status: 'reserva_aberta' };
    est.aberta = true; est.plano = b.p_plano; est.canal = b.p_canal;
    return { status: 'ok', codigo: 'ANA10', pct: 10 };
  };
  rpcs.cupom_anexar = (b) => { est.cobranca = b.p_cobranca; return true; };
  rpcs.cupom_liberar = () => { if (est.cobranca === null) { est.aberta = false; return true; } return false; };
  return est;
}
reset(); const est1 = reservaModelo();
const [pa, pb] = await Promise.all([pedir({ plano: 'pro_mensal', cupom: 'ANA10' }), pedir({ plano: 'pro_mensal', cupom: 'ANA10' })]);
const sta = [pa.status, pb.status].sort().join(',');
checar('corrida (2 chamadas paralelas): UM Pix gerado, a outra espera (409 em_andamento)', sta === '200,409' && createN === 1, `${sta} creates=${createN}`);
const perdedor = await (pa.status === 409 ? pa : pb).json();
checar('a que espera recebe o motivo em palavras', perdedor.status === 'em_andamento' && /Aguarde/.test(perdedor.texto));
checar('o Pix gerado ficou guardado na reserva', est1.cobranca && est1.cobranca.id === 'bill_1' && est1.cobranca.desconto && est1.cobranca.desconto.por === 35.1);
const created = createN;
r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' }); j = await r.json();
checar('pedido repetido: devolve o MESMO Pix (idempotente) e NÃO cria outro', r.status === 200 && j.id === 'bill_1' && createN === created && j.desconto && j.desconto.por === 35.1);
r = await pedir({ plano: 'pro_anual', cupom: 'ANA10' });
checar('outro plano com reserva aberta: 409 reserva_aberta e nenhum Pix novo', r.status === 409 && (await r.json()).status === 'reserva_aberta' && createN === created);
est1.pago = true;
r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' }); j = await r.json();
checar('1º Pix pago: o 2º é recusado ANTES de gerar, "O desconto já foi usado nesta conta."', r.status === 409 && j.status === 'ja_usou' && j.texto === textoJaUsou && createN === created, j.texto);
reset(); abacateFalha = true; const est2 = reservaModelo();
r = await pedir({ plano: 'pro_mensal', cupom: 'ANA10' });
checar('gateway não gerou o Pix: 502 e a reserva é solta (dá para tentar de novo)', r.status === 502 && est2.aberta === false && !!rpcChamado('cupom_liberar'));
// cartão
reset(); const est3 = reservaModelo();
const [sa, sb] = await Promise.all([checkout({ plano: 'pro', cupom: 'ANA10' }), checkout({ plano: 'pro', cupom: 'ANA10' })]);
const nCup = chamadas.filter((c) => c.url.includes('/v1/coupons')).length;
const nSess = chamadas.filter((c) => c.url.includes('/checkout/sessions')).length;
checar('corrida no cartão: UMA sessão e UM cupom da Stripe', [sa.status, sb.status].sort().join(',') === '200,409' && nCup === 1 && nSess === 1, `${nCup}/${nSess}`);
r = await checkout({ plano: 'pro', cupom: 'ANA10' }); j = await r.json();
checar('cartão: pedido repetido devolve a MESMA sessão (sem novo cupom nem sessão)', r.status === 200 && j.url === 'https://checkout.stripe.test/c/1'
  && chamadas.filter((c) => c.url.includes('/v1/coupons')).length === 1 && chamadas.filter((c) => c.url.includes('/checkout/sessions')).length === 1);
checar('a sessão do cartão ficou guardada na reserva', est3.cobranca && est3.cobranca.url === 'https://checkout.stripe.test/c/1');

console.log('2º pagamento com desconto (corrida que escapou): nunca silencioso');
const erros = [];
const errOrig = console.error;
console.error = (...a) => { erros.push(a.join(' ')); };
reset(); rpcs.cupom_confirmar = { resultado: 'desconto_duplicado' }; cobrancaAbacate = cobranca(3510, { cupom: 'ANA10', cupomPct: 10 });
await status();
console.error = errOrig;
const confB = rpcChamado('cupom_confirmar') && JSON.parse(rpcChamado('cupom_confirmar').init.body);
checar('o webhook manda a cobrança e o desconto (R$ 3,90 = 390 centavos) ao banco', confB && confB.p_cobranca_id === 'bill_1' && confB.p_desconto_centavos === 390 && confB.p_user === USER.id, JSON.stringify(confB));
checar('resultado desconto_duplicado vira ALARME no log (devolução pendente no admin)', erros.some((e) => /ALARME/.test(e) && /desconto_duplicado/.test(e) && /devolução pendente/.test(e)), erros.join(' | '));

console.log('Cartão (Stripe) com cupom');
reset();
r = await checkout({ plano: 'pro' });
checar('sem cupom: segue como hoje (promotion code da Stripe liberado, sem desconto nosso)', r.status === 200 && sessao().get('allow_promotion_codes') === 'true' && !sessao().get('discounts[0][coupon]') && !cupomStripe());
reset(); rpcs.cupom_reservar = { status: 'ok', codigo: 'ANA10', pct: 10 };
r = await checkout({ plano: 'pro', cupom: 'ANA10' });
const sp = sessao();
const cp = new URLSearchParams(cupomStripe().init.body);
checar('com cupom: cupom da Stripe 10%, SÓ na 1ª cobrança (once), uso único', r.status === 200 && cp.get('percent_off') === '10' && cp.get('duration') === 'once' && cp.get('max_redemptions') === '1', cp.toString());
checar('checkout leva o desconto e sai o promotion code (a Stripe não aceita os dois)', sp.get('discounts[0][coupon]') === 'cup_1' && !sp.get('allow_promotion_codes') && sp.get('metadata[cupom]') === 'ANA10');
checar('reserva pediu canal stripe', JSON.parse(rpcChamado('cupom_reservar').init.body).p_canal === 'stripe');
reset(); rpcs.cupom_reservar = { status: 'indicacao' };
r = await checkout({ plano: 'pro', cupom: 'ANA10' });
checar('cupom recusado: 409 e NENHUMA sessão aberta (não cobra cheio escondido)', r.status === 409 && !chamadas.some((c) => c.url.includes('/checkout/sessions')) && !cupomStripe());
reset();
r = await checkout({ plano: 'pro', cupom: 'ANA10' });
checar('banco fora na reserva = 503 e nenhuma sessão', r.status === 503 && !chamadas.some((c) => c.url.includes('/checkout/sessions')));
reset();
r = await checkout({ plano: 'pro', cupom: 'ANA10' }, { ...envStripe, CUPOM_INFLUENCER_ATIVO: undefined });
checar('flag desligada + cupom: 409, nada aberto', r.status === 409 && !chamadas.some((c) => c.url.includes('/checkout/sessions')));

void PLANO_PIX;
console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
