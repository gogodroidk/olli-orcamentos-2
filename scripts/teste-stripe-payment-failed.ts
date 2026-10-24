/** payment_failed: se stripeGet da subscription falhar, o webhook devolve 500 e marca 'falhou' (nunca 'processado'). */
// @ts-expect-error worker é JS puro, executado pelo Node com type stripping.
import { handleWebhook } from '../worker/src/stripe.js';

let falhas = 0;
let passes = 0;
function checar(nome: string, real: unknown, esperado: unknown): void {
  if (JSON.stringify(real) === JSON.stringify(esperado)) { passes++; console.log(`  ok   ${nome}`); }
  else { falhas++; console.error(`  FALHA ${nome}\n        esperado: ${JSON.stringify(esperado)}\n        recebido: ${JSON.stringify(real)}`); }
}

const SECRET = 'whsec_teste';
async function assinar(corpo: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${corpo}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

type Chamada = { metodo: string; url: string; corpo: string };
function simular(stripeStatus: number): Chamada[] {
  const chamadas: Chamada[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const c = { metodo: init?.method || 'GET', url: String(url), corpo: String(init?.body || '') };
    chamadas.push(c);
    if (c.url.includes('api.stripe.com')) {
      return new Response(JSON.stringify(stripeStatus === 200 ? { id: 'sub_1', status: 'past_due', metadata: {} } : { error: { message: 'boom' } }), { status: stripeStatus });
    }
    if (c.metodo === 'POST' && c.url.includes('/webhook_events')) return new Response(JSON.stringify([{ recebido_em: new Date().toISOString() }]), { status: 201 });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return chamadas;
}

async function disparar(evento: object) {
  const corpo = JSON.stringify(evento);
  const env = { STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_SECRET_KEY: 'sk_test_x', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'srv' };
  const req = new Request('https://w.test/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': await assinar(corpo) }, body: corpo });
  return handleWebhook(req, env);
}
const statusMarcado = (cs: Chamada[]) => cs.filter((c) => c.metodo === 'PATCH').map((c) => JSON.parse(c.corpo).status);

console.log('\nStripe invoice.payment_failed — falha ao buscar subscription');
let chamadas = simular(500);
let r = await disparar({ id: 'evt_f1', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_1' } } });
checar('stripeGet falhou: HTTP 500', r.status, 500);
checar('corpo falha_stripe', (await r.json()).erro, 'falha_stripe');
checar('evento marcado falhou e nunca processado', statusMarcado(chamadas), ['falhou']);

chamadas = simular(500);
r = await disparar({ id: 'evt_f2', type: 'invoice.payment_failed', data: { object: {} } });
checar('sem subscription na fatura: 200 e processado', [r.status, statusMarcado(chamadas)], [200, ['processado']]);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
