/**
 * Teste do RECIBO NO ANDROID (Payments policy da Google Play) — `GET /stripe/faturas`.
 *
 *     node worker/scripts/teste-faturas-android.js
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * Tranca:
 *  1. `?plataforma=android` → o recibo é SÓ o `invoice_pdf` de fatura PAGA; nunca a
 *     página hospedada (`hosted_invoice_url`, que tem botão de pagar quando a
 *     fatura está em aberto — link-out de pagamento dentro do app).
 *  2. Fatura em aberto no Android → sem recibo.
 *  3. Web (sem o parâmetro) → comportamento de antes (página hospedada primeiro).
 */
import { handleFaturas } from '../src/stripe.js';

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
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

const env = {
  SUPABASE_URL: 'https://sb.teste',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'srv',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_RL: { limit: async () => ({ success: true }) },
};

const FATURAS = [
  { id: 'in_pago', status: 'paid', amount_paid: 3900, total: 3900, currency: 'brl', created: 1,
    hosted_invoice_url: 'https://invoice.stripe.com/i/pago', invoice_pdf: 'https://pay.stripe.com/invoice/pago/pdf' },
  { id: 'in_aberto', status: 'open', amount_paid: 0, total: 3900, currency: 'brl', created: 2,
    hosted_invoice_url: 'https://invoice.stripe.com/i/aberto', invoice_pdf: 'https://pay.stripe.com/invoice/aberto/pdf' },
  { id: 'in_pago_sem_pdf', status: 'paid', amount_paid: 3900, total: 3900, currency: 'brl', created: 3,
    hosted_invoice_url: 'https://invoice.stripe.com/i/sempdf', invoice_pdf: null },
  // Em aberto com pagamento PARCIAL: `pago` (exibição) fica true, mas o PDF da
  // Stripe de fatura aberta traz "Pay online" — no Android nada de recibo.
  { id: 'in_parcial', status: 'open', amount_paid: 1000, total: 3900, currency: 'brl', created: 4,
    hosted_invoice_url: 'https://invoice.stripe.com/i/parcial', invoice_pdf: 'https://pay.stripe.com/invoice/parcial/pdf' },
];

globalThis.fetch = async (url) => {
  const u = String(url);
  const resposta = (corpo) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/auth/v1/user')) return resposta({ id: 'u1' });
  if (u.includes('/rest/v1/assinaturas')) return resposta([{ user_id: 'u1', stripe_customer_id: 'cus_abc' }]);
  if (u.includes('api.stripe.com') && u.includes('/invoices')) return resposta({ data: FATURAS });
  return new Response('{}', { status: 404 });
};

async function pedir(query) {
  const r = await handleFaturas(new Request(`https://w.teste/stripe/faturas${query}`, { headers: { Authorization: 'Bearer jwt' } }), env);
  return r.json();
}

console.log('\n1) Android: só PDF de fatura paga');
{
  const d = await pedir('?plataforma=android');
  const porId = Object.fromEntries(d.faturas.map((f) => [f.id, f.recibo]));
  checar('fatura paga → invoice_pdf', porId.in_pago, 'https://pay.stripe.com/invoice/pago/pdf');
  checar('fatura em aberto → sem recibo (a página teria botão de pagar)', porId.in_aberto, null);
  checar('paga sem PDF → sem recibo (nunca cai na página hospedada)', porId.in_pago_sem_pdf, null);
  checar('em aberto com pagamento parcial → sem recibo (só status paid)', porId.in_parcial, null);
  checar('nenhum recibo aponta para a página hospedada', d.faturas.some((f) => String(f.recibo).includes('invoice.stripe.com')), false);
}

console.log('\n2) Web: como antes');
{
  const d = await pedir('');
  const porId = Object.fromEntries(d.faturas.map((f) => [f.id, f.recibo]));
  checar('web mantém a página hospedada', porId.in_aberto, 'https://invoice.stripe.com/i/aberto');
  checar('web: status pago calculado igual', d.faturas.map((f) => f.pago), [true, false, true, true]);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
