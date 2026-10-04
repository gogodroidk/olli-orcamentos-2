/**
 * Quem PAGA de verdade — definição única para contagem (pagantes, MRR,
 * conversão, assinantes em risco). NUNCA decide acesso: o plano que a conta
 * usa continua vindo de `derivarEntitlement` (entitlement.js), intocado.
 *
 * Por quê (T-011, 04/10/2026): MRR real é zero, mas o painel contava 2
 * "pagantes" que não pagam:
 *   - cortesia do dono gravada direto em `assinaturas` como 'active' até 2099
 *     com id de gateway inventado ('comp_manual_empresa');
 *   - conta interna/demo ('sub_demo_…') ou liberada pelo override do painel
 *     (`admin_override_ativo`).
 *
 * Mesma regra, no banco, em `public.assinatura_eh_pagante` / view
 * `public.assinaturas_pagantes` (migration 20261007090000_assinaturas_pagantes).
 * Mudou aqui, muda lá — o teste `scripts/teste-assinaturas-pagantes.ts` roda as duas com
 * os mesmos casos.
 */
import { derivarEntitlement } from './entitlement.js';

// Id real da Stripe é prefixo + alfanumérico ('sub_1Nx…', 'cus_Px…'); mesmo
// critério de customerIdStripe/subscriptionIdStripe (stripe.js) e de
// public.funil_assinatura_ficticia.
const SUB_STRIPE = /^sub_[A-Za-z0-9]+$/;
const CUS_STRIPE = /^cus_[A-Za-z0-9]+$/;

// Nenhum gateway vende período maior que 1 ano (anual / 12x). Vigência além de
// 2 anos é concessão escrita à mão (ex.: cortesia até 2099), mesmo sem id falso.
const VIGENCIA_MAXIMA_MS = 2 * 366 * 86400000;

function idFicticio(valor, padrao) {
  return valor != null && !(typeof valor === 'string' && padrao.test(valor));
}

/**
 * Por que a linha NÃO conta como pagante, ou `null` se conta.
 *   'sem_pagamento'   — não há pagamento ativo e vigente (grátis/vencido/cancelado);
 *   'id_ficticio'     — id de gateway inventado (comp_*, sub_demo_*, reviewer_*);
 *   'override_admin'  — plano liberado à mão pelo painel, ainda vigente;
 *   'vigencia_manual' — vigência impossível para um gateway (ex.: 2099).
 */
export function motivoNaoPagante(row, agoraMs = Date.now()) {
  const ent = derivarEntitlement(row, agoraMs);
  if (!ent.pagamentoAtivo || (row.plano !== 'pro' && row.plano !== 'empresa')) return 'sem_pagamento';
  if (idFicticio(row.stripe_subscription_id, SUB_STRIPE) || idFicticio(row.stripe_customer_id, CUS_STRIPE)) {
    return 'id_ficticio';
  }
  if (ent.overrideAtivo) return 'override_admin';
  if (Date.parse(row.current_period_end) - agoraMs > VIGENCIA_MAXIMA_MS) return 'vigencia_manual';
  return null;
}

/** true = conta paga por gateway e entra em pagantes/MRR/conversão. */
export function assinaturaPagante(row, agoraMs = Date.now()) {
  return motivoNaoPagante(row, agoraMs) === null;
}
