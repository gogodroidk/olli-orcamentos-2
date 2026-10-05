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
 * Mesma regra, no banco, em `public.assinatura_motivo_nao_pagante`, na view
 * `public.assinaturas_pagantes` e em `public.admin_assinaturas_pagantes`
 * (migration 20261007090000_assinaturas_pagantes). Mudou aqui, muda lá — o
 * teste `scripts/teste-assinaturas-pagantes.ts` roda as duas com os mesmos casos.
 */
import { derivarEntitlement } from './entitlement.js';

// Id real da Stripe é prefixo + alfanumérico ('sub_1Nx…', 'cus_Px…'); mesmo
// critério de customerIdStripe/subscriptionIdStripe (stripe.js) e de
// public.funil_assinatura_ficticia.
const SUB_STRIPE = /^sub_[A-Za-z0-9]+$/;
const CUS_STRIPE = /^cus_[A-Za-z0-9]+$/;

// Teto de vigência que um pagamento real alcança. Um ciclo é no máximo 1 ano
// (anual / 12x), mas a AbacatePay SOMA a renovação à vigência em curso
// (abacate.js, inicioDoPeriodo) e aceita início até ~13 meses à frente: anual
// comprado sobre anual vigente chega a ~25 meses. 3 anos dá folga a isso e
// ainda pega a cortesia escrita à mão (ex.: até 2099), mesmo sem id falso.
const VIGENCIA_MAXIMA_MS = 1096 * 86400000;

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

/**
 * Conta interna, mesma lista do funil de receita (funil_contas_marcos):
 *   'dono'          — e-mail do dono (ADMIN_EMAIL), passado pelo chamador;
 *   'lista_interna' — public.funil_exclusoes, por user_id ou e-mail
 *                     ("Marcar como conta interna" no painel);
 *   'admin'         — administrador do SaaS (public.admin_memberships).
 * Devolve `null` quando a conta é de cliente. Pagamento real de conta interna
 * (ex.: Pix de teste do dono) não é receita — e o funil também não o conta.
 *
 * `contexto` = { emailsDono, exclusaoIds, exclusaoEmails, adminIds }, todos Set
 * com e-mail já em minúsculo e sem espaço.
 */
export function motivoContaInterna(userId, email, contexto) {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (e && contexto.emailsDono.has(e)) return 'dono';
  if (contexto.exclusaoIds.has(userId) || (e && contexto.exclusaoEmails.has(e))) return 'lista_interna';
  if (contexto.adminIds.has(userId)) return 'admin';
  return null;
}

/** Monta o `contexto` de motivoContaInterna a partir das linhas do banco. */
export function contextoContasInternas({ emailsDono = [], exclusoes = [], admins = [] } = {}) {
  const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  return {
    emailsDono: new Set(emailsDono.map(norm).filter(Boolean)),
    exclusaoIds: new Set(exclusoes.map((x) => x?.user_id).filter(Boolean)),
    exclusaoEmails: new Set(exclusoes.map((x) => norm(x?.email)).filter(Boolean)),
    adminIds: new Set(admins.map((x) => x?.user_id).filter(Boolean)),
  };
}

/**
 * Origem exibida na lista de contas do painel. Só o rótulo muda: cortesia,
 * demo, override e conta interna com plano aparecem como 'admin' ("liberado"),
 * nunca como 'pagamento'. O plano (acesso) segue o entitlement.
 */
export function origemExibida(row, email, contexto, agoraMs = Date.now()) {
  const ent = derivarEntitlement(row, agoraMs);
  if (ent.plano === 'gratis') return { plano: ent.plano, origem: ent.origem };
  const pagante = assinaturaPagante(row, agoraMs) && motivoContaInterna(row.user_id, email, contexto) === null;
  return { plano: ent.plano, origem: pagante ? 'pagamento' : 'admin' };
}

/**
 * Bloco "receita" da visão geral (admin.js, metrics). Pura, para teste.
 *   pagantes / porPlano / mrrEstimado — só quem paga e não é conta interna;
 *   manuais  — plano com acesso que não paga (cortesia, demo, override, interna);
 *   emRisco  — pagantes sem uso há 14 dias.
 * `usuarios` = [{ id, email, ultimoUso }]; `precoMensal` = { pro, empresa }.
 */
export function resumirReceita({ assinaturas, usuarios, contexto, precoMensal, agoraMs = Date.now() }) {
  const DIA = 86400000;
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  let pagantes = 0;
  let manuais = 0;
  let mrr = 0;
  let emRisco = 0;
  const porPlano = { pro: 0, empresa: 0 };
  for (const a of assinaturas) {
    const u = porId.get(a.user_id);
    if (!u) continue;
    if (derivarEntitlement(a, agoraMs).plano === 'gratis') continue;
    if (!assinaturaPagante(a, agoraMs) || motivoContaInterna(a.user_id, u.email, contexto) !== null) {
      manuais++;
      continue;
    }
    pagantes++;
    porPlano[a.plano] = (porPlano[a.plano] || 0) + 1;
    mrr += precoMensal[a.plano] || 0;
    if (!u.ultimoUso || agoraMs - Date.parse(u.ultimoUso) > 14 * DIA) emRisco++;
  }
  return { estado: 'ok', pagantes, manuais, porPlano, mrrEstimado: mrr, emRisco, precoMensal: { ...precoMensal } };
}
